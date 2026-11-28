
const express = require('express');
const mongoose = require('mongoose');
const protect = require('../middleware/adminAuth');

const {
  Product, Supplier, Customer, Purchase,
    Sale, Expense, StockMovement, Payment, Account,
  SaleReturn, PurchaseReturn
} = require('../models/Business');

const router = express.Router();

router.use(protect);

const number = (v, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const clean = v => String(v || '').trim();

const makeNo = prefix =>
  prefix + '-' + Date.now().toString(36).toUpperCase();

const asyncRoute = fn => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(err =>
    err && err.constructor === Error && !err.status
      ? res.status(400).json({ error: err.message })
      : next(err));

const validId = id => mongoose.isValidObjectId(id);

function calculate(items, discount = 0) {
  let subtotal = 0;
  let taxAmount = 0;

  const rows = items.map(item => {
    const quantity = number(item.quantity);
    const price = number(item.price);
    const gstRate = number(item.gstRate);

    if (!Number.isInteger(quantity) || quantity <= 0 ||
        price < 0 || gstRate < 0 || gstRate > 100) {
      throw new Error('Invalid product quantity, price or tax rate.');
    }

    const base = quantity * price;
    const tax = base * gstRate / 100;

    subtotal += base;
    taxAmount += tax;

    return {
      ...item,
      quantity,
      price,
      gstRate,
      base,
      tax,
      total: base + tax
    };
  });

  if (discount < 0 || discount > subtotal + taxAmount) {
    throw new Error('Invalid discount.');
  }

  return {
    rows,
    subtotal,
    taxAmount,
    discount,
    total: Math.max(0, subtotal + taxAmount - discount)
  };
}

// --------------------------------------------------
// DASHBOARD SUMMARY
// --------------------------------------------------

router.get('/dashboard', asyncRoute(async (req, res) => {
  const now = new Date();
  const start = new Date(now);
  const IST = 5.5 * 3600000;
  const istDay = new Date(now.getTime() + IST);
  istDay.setUTCHours(0, 0, 0, 0);
  start.setTime(istDay.getTime() - IST);

  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  const [sales, purchases, expenses, products, stock] =
    await Promise.all([
      Sale.find({
        saleDate: { $gte: start, $lt: end },
        status: { $nin: ['cancelled', 'returned'] }
      }).lean(),

      Purchase.find({
        purchaseDate: { $gte: start, $lt: end },
        status: 'received'
      }).lean(),

      Expense.find({
        expenseDate: { $gte: start, $lt: end }
      }).lean(),

      Product.countDocuments({ active: true }),

      Product.find({ active: true }).lean()
    ]);

  const revenue = sales.reduce((s, x) => s + x.total, 0);
  const paidSales = sales.reduce((s, x) => s + x.paid, 0);
  const purchaseTotal = purchases.reduce((s, x) => s + x.total, 0);
  const expenseTotal = expenses.reduce((s, x) => s + x.amount, 0);

  const lowStock = stock.filter(p => p.stock <= p.lowStockAt);

  res.json({
    todaySales: revenue,
    todayReceived: paidSales,
    todayPurchases: purchaseTotal,
    todayExpenses: expenseTotal,
    estimatedGrossSalesMinusExpenses:
      revenue - expenseTotal,
    totalProducts: products,
    lowStockCount: lowStock.length,
    lowStockItems: lowStock.slice(0, 10),
    todayOrders: sales.length,
    pendingCustomerPayments:
      await Sale.aggregate([
        { $match: { status: { $nin: ['cancelled', 'returned'] } } },
        { $group: { _id: null, total: { $sum: '$due' } } }
      ]).then(x => x[0]?.total || 0),
    pendingSupplierPayments:
      await Purchase.aggregate([
        { $match: { status: 'received' } },
        { $group: { _id: null, total: { $sum: '$due' } } }
      ]).then(x => x[0]?.total || 0)
  });
}));

// --------------------------------------------------
// PRODUCTS
// --------------------------------------------------

router.get('/products', asyncRoute(async (req, res) => {
  const q = clean(req.query.q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').slice(0, 60);
  const filter = { active: true };

  if (q) {
    filter.$or = [
      { name: { $regex: q, $options: 'i' } },
      { sku: { $regex: q, $options: 'i' } },
      { barcode: { $regex: q, $options: 'i' } }
    ];
  }

  const items = await Product.find(filter)
    .sort({ createdAt: -1 })
    .limit(300);

  res.json({ items });
}));

router.post('/products', asyncRoute(async (req, res) => {
  const b = req.body;

  if (!clean(b.name) || !clean(b.sku))
    return res.status(400).json({ error: 'Product name and SKU are required.' });

  const product = await Product.create({
    name: clean(b.name),
    sku: clean(b.sku),
    barcode: clean(b.barcode),
    category: clean(b.category) || 'General',
    description: clean(b.description),
    costPrice: number(b.costPrice),
    sellingPrice: number(b.sellingPrice),
    mrp: number(b.mrp),
    gstRate: number(b.gstRate),
    hsn: clean(b.hsn),
    unit: clean(b.unit) || 'piece',
    stock: 0,
    lowStockAt: number(b.lowStockAt, 5),
    sizes: Array.isArray(b.sizes) ? b.sizes : [],
    colors: Array.isArray(b.colors) ? b.colors : []
  });

  res.status(201).json({ item: product });
}));

router.put('/products/:id', asyncRoute(async (req, res) => {
  if (!validId(req.params.id))
    return res.status(400).json({ error: 'Invalid product ID.' });

  const allowed = [
    'name', 'sku', 'barcode', 'category', 'description',
    'costPrice', 'sellingPrice', 'mrp', 'gstRate',
    'hsn', 'unit', 'lowStockAt', 'sizes', 'colors', 'active'
  ];

  const update = {};
  allowed.forEach(k => {
    if (req.body[k] !== undefined) update[k] = req.body[k];
  });

  const item = await Product.findByIdAndUpdate(
    req.params.id, update, { new: true, runValidators: true }
  );

  if (!item) return res.status(404).json({ error: 'Product not found.' });

  res.json({ item });
}));

// --------------------------------------------------
// SUPPLIERS
// --------------------------------------------------

router.get('/suppliers', asyncRoute(async (req, res) => {
  const items = await Supplier.find().sort({ name: 1 }).limit(500);
  res.json({ items });
}));

router.post('/suppliers', asyncRoute(async (req, res) => {
  if (!clean(req.body.name))
    return res.status(400).json({ error: 'Supplier name is required.' });

  const item = await Supplier.create({
    name: clean(req.body.name),
    phone: clean(req.body.phone),
    email: clean(req.body.email),
    address: clean(req.body.address),
    gstin: clean(req.body.gstin),
    notes: clean(req.body.notes)
  });

  res.status(201).json({ item });
}));

router.put('/suppliers/:id', asyncRoute(async (req, res) => {
  if (!validId(req.params.id))
    return res.status(400).json({ error: 'Invalid supplier ID.' });

  const item = await Supplier.findByIdAndUpdate(
    req.params.id,
    {
      name: clean(req.body.name),
      phone: clean(req.body.phone),
      email: clean(req.body.email),
      address: clean(req.body.address),
      gstin: clean(req.body.gstin),
      notes: clean(req.body.notes)
    },
    { new: true, runValidators: true }
  );

  if (!item) return res.status(404).json({ error: 'Supplier not found.' });
  res.json({ item });
}));

// --------------------------------------------------
// CUSTOMERS
// --------------------------------------------------

router.get('/customers', asyncRoute(async (req, res) => {
  const items = await Customer.find().sort({ name: 1 }).limit(500);
  res.json({ items });
}));

router.post('/customers', asyncRoute(async (req, res) => {
  if (!clean(req.body.name))
    return res.status(400).json({ error: 'Customer name is required.' });

  const item = await Customer.create({
    name: clean(req.body.name),
    phone: clean(req.body.phone),
    email: clean(req.body.email),
    address: clean(req.body.address),
    gstin: clean(req.body.gstin),
    notes: clean(req.body.notes)
  });

  res.status(201).json({ item });
}));

// --------------------------------------------------
// PURCHASE MANAGEMENT
// --------------------------------------------------

router.get('/purchases', asyncRoute(async (req, res) => {
  const items = await Purchase.find()
    .sort({ purchaseDate: -1 })
    .limit(300);

  res.json({ items });
}));

router.post('/purchases', asyncRoute(async (req, res) => {
  const b = req.body;

  if (!Array.isArray(b.items) || !b.items.length)
    return res.status(400).json({ error: 'Add at least one product.' });

  if (!validId(b.supplier))
    return res.status(400).json({ error: 'Select a valid supplier.' });

  const supplier = await Supplier.findById(b.supplier);
  if (!supplier)
    return res.status(404).json({ error: 'Supplier not found.' });

  const rows = [];

  for (const line of b.items) {
    if (!validId(line.product))
      return res.status(400).json({ error: 'Invalid product.' });

    const product = await Product.findById(line.product);
    if (!product || !product.active)
      return res.status(404).json({ error: 'Product not found.' });

    const quantity = number(line.quantity);
    const unitCost = number(line.unitCost);

    if (!Number.isInteger(quantity) || quantity <= 0 || unitCost < 0)
      return res.status(400).json({ error: 'Invalid purchase quantity or cost.' });

    rows.push({
      product: product._id,
      name: product.name,
      sku: product.sku,
      quantity,
      unitCost,
      gstRate: product.gstRate,
      total: quantity * unitCost
    });
  }

  const subtotal = rows.reduce((s, x) => s + x.total, 0);
  const taxAmount = rows.reduce(
    (s, x) => s + x.total * x.gstRate / 100, 0
  );
  const extraCost = number(b.extraCost);
  const total = Math.round((subtotal + taxAmount + extraCost) * 100) / 100;
  const paid = Math.round(number(b.paid) * 100) / 100;

  if (extraCost < 0 || paid < 0 || paid > total)
    return res.status(400).json({ error: 'Invalid purchase payment.' });

  const session = await mongoose.startSession();
  let purchase;

  try {
    await session.withTransaction(async () => {
      purchase = await Purchase.create([{
        purchaseNo: makeNo('PUR'),
        supplier: supplier._id,
        supplierName: supplier.name,
        invoiceNo: clean(b.invoiceNo),
        items: rows,
        subtotal,
        taxAmount,
        extraCost,
        total,
        paid,
        due: Math.round((total - paid) * 100) / 100,
        paymentMethod: clean(b.paymentMethod) || 'cash',
        notes: clean(b.notes)
      }], { session });

      for (const line of rows) {
        const product = await Product.findById(line.product).session(session);
        const before = product.stock;
        product.stock += line.quantity;
        await product.save({ session });

        await StockMovement.create([{
          product: product._id,
          productName: product.name,
          type: 'purchase',
          quantity: line.quantity,
          beforeStock: before,
          afterStock: product.stock,
          reference: purchase[0].purchaseNo,
          createdBy: req.admin.email || req.admin.role
        }], { session });
      }

      if (paid > 0) {
        await Payment.create([{
          type: 'purchase',
          direction: 'out',
          amount: paid,
          method: clean(b.paymentMethod) || 'cash',
          reference: purchase[0].purchaseNo,
          description: 'Supplier purchase payment'
        }], { session });
      }
    });
  } finally {
    await session.endSession();
  }

  res.status(201).json({ item: purchase[0] });
}));

// --------------------------------------------------
// SALES / POS
// --------------------------------------------------

router.get('/sales', asyncRoute(async (req, res) => {
  const items = await Sale.find()
    .sort({ saleDate: -1 })
    .limit(300);

  res.json({ items });
}));

router.post('/sales', asyncRoute(async (req, res) => {
  const b = req.body;

  if (!Array.isArray(b.items) || !b.items.length)
    return res.status(400).json({ error: 'Add at least one product.' });

  const rows = [];
  let subtotal = 0;
  let taxAmount = 0;

  for (const line of b.items) {
    if (!validId(line.product))
      return res.status(400).json({ error: 'Invalid product.' });

    const product = await Product.findById(line.product);

    if (!product || !product.active)
      return res.status(404).json({ error: 'Product not available.' });

    const quantity = number(line.quantity);

    if (!Number.isInteger(quantity) || quantity <= 0)
      return res.status(400).json({ error: 'Invalid sale quantity.' });

    if (product.stock < quantity)
      return res.status(400).json({
        error: 'Insufficient stock for ' + product.name +
          '. Available: ' + product.stock
      });

    const unitPrice = line.unitPrice === undefined
      ? product.sellingPrice : number(line.unitPrice);

    if (unitPrice < 0)
      return res.status(400).json({ error: 'Invalid selling price.' });

    const gstRate = number(product.gstRate);
    const base = unitPrice * quantity;
    const tax = base * gstRate / 100;

    subtotal += base;
    taxAmount += tax;

    rows.push({
      product: product._id,
      name: product.name,
      sku: product.sku,
      quantity,
      unitPrice,
      unitCost: product.costPrice,
      gstRate,
      total: base + tax
    });
  }

  const discount = number(b.discount);
  const total = Math.round((subtotal + taxAmount - discount) * 100) / 100;
  const paid = Math.round(number(b.paid) * 100) / 100;

  if (discount < 0 || discount > subtotal + taxAmount ||
      paid < 0 || paid > total) {
    return res.status(400).json({ error: 'Invalid discount or payment.' });
  }

  if (b.customer && !validId(b.customer))
    return res.status(400).json({ error: 'Invalid customer.' });

  const customer = b.customer
    ? await Customer.findById(b.customer) : null;

  if (b.customer && !customer)
    return res.status(404).json({ error: 'Customer not found.' });

  const session = await mongoose.startSession();
  let sale;

  try {
    await session.withTransaction(async () => {
      sale = await Sale.create([{
        saleNo: makeNo('SAL'),
        customer: customer?._id,
        customerName: customer?.name || clean(b.customerName) || 'Walk-in Customer',
        items: rows,
        subtotal,
        discount,
        taxAmount,
        total,
        paid,
        due: Math.round((total - paid) * 100) / 100,
        paymentMethod: clean(b.paymentMethod) || 'cash',
        status: paid === total ? 'completed' : paid > 0 ? 'partial' : 'credit',
        notes: clean(b.notes)
      }], { session });

      for (const line of rows) {
        const product = await Product.findById(line.product).session(session);

        if (!product || product.stock < line.quantity)
          throw new Error('Stock changed. Please refresh and try again.');

        const before = product.stock;
        product.stock -= line.quantity;
        await product.save({ session });

        await StockMovement.create([{
          product: product._id,
          productName: product.name,
          type: 'sale',
          quantity: -line.quantity,
          beforeStock: before,
          afterStock: product.stock,
          reference: sale[0].saleNo,
          createdBy: req.admin.email || req.admin.role
        }], { session });
      }

      if (paid > 0) {
        await Payment.create([{
          type: 'sale',
          direction: 'in',
          amount: paid,
          method: clean(b.paymentMethod) || 'cash',
          reference: sale[0].saleNo,
          description: 'Customer sale payment'
        }], { session });
      }
    });
  } finally {
    await session.endSession();
  }

  res.status(201).json({ item: sale[0] });
}));


// --------------------------------------------------
// SALES RETURNS
// --------------------------------------------------

router.get('/sales-returns', asyncRoute(async (req, res) => {
  const items = await SaleReturn.find()
    .sort({ returnDate: -1 })
    .limit(300);

  res.json({ items });
}));

router.post('/sales-returns', asyncRoute(async (req, res) => {
  const b = req.body;

  if (!validId(b.sale))
    return res.status(400).json({ error: 'Invalid sale.' });

  if (!Array.isArray(b.items) || !b.items.length)
    return res.status(400).json({ error: 'Select items to return.' });

  const session = await mongoose.startSession();
  let result;

  try {
    await session.withTransaction(async () => {
      const sale = await Sale.findById(b.sale).session(session);

      if (!sale || sale.status === 'cancelled')
        throw new Error('Sale not found or cancelled.');

      const returnRows = [];
      let refundTotal = 0;

      for (const line of b.items) {
        const index = Number(line.saleItemIndex);
        const quantity = Number(line.quantity);

        if (!Number.isInteger(index) || index < 0 ||
            index >= sale.items.length)
          throw new Error('Invalid sale item.');

        if (!Number.isInteger(quantity) || quantity <= 0)
          throw new Error('Return quantity must be a positive whole number.');

        const original = sale.items[index];
        const alreadyReturned = Number(original.returnedQuantity || 0);
        const remaining = original.quantity - alreadyReturned;

        if (quantity > remaining)
          throw new Error('Return quantity exceeds the remaining sold quantity for ' + original.name + '.');

        const resellable = line.resellable !== false;

        const discountFactor = sale.subtotal + sale.taxAmount > 0
          ? sale.total / (sale.subtotal + sale.taxAmount)
          : 0;

        const refundAmount = Math.round(
          original.total * quantity / original.quantity *
          discountFactor * 100
        ) / 100;

        original.returnedQuantity = alreadyReturned + quantity;

        if (resellable) {
          const product = await Product.findById(original.product)
            .session(session);

          if (!product)
            throw new Error('Product not found: ' + original.name);

          const before = product.stock;
          product.stock += quantity;
          await product.save({ session });

          await StockMovement.create([{
            product: product._id,
            productName: product.name,
            type: 'return',
            quantity,
            beforeStock: before,
            afterStock: product.stock,
            reference: sale.saleNo,
            notes: 'Customer return: resellable',
            createdBy: req.admin.email || req.admin.role
          }], { session });
        } else {
          const product = await Product.findById(original.product)
            .session(session);

          if (product) {
            await StockMovement.create([{
              product: product._id,
              productName: product.name,
              type: 'damage',
              quantity: 0,
              beforeStock: product.stock,
              afterStock: product.stock,
              reference: sale.saleNo,
              notes: 'Customer return: damaged / not restocked',
              createdBy: req.admin.email || req.admin.role
            }], { session });
          }
        }

        refundTotal += refundAmount;

        returnRows.push({
          saleItemIndex: index,
          product: original.product,
          name: original.name,
          quantity,
          resellable,
          refundAmount
        });
      }

      refundTotal = Math.round(refundTotal * 100) / 100;

      const created = await SaleReturn.create([{
        returnNo: makeNo('SRET'),
        sale: sale._id,
        saleNo: sale.saleNo,
        customerName: sale.customerName,
        items: returnRows,
        total: refundTotal,
        refundMethod: clean(b.refundMethod) || 'cash',
        reason: clean(b.reason),
        notes: clean(b.notes)
      }], { session });

      const fullyReturned = sale.items.every(item =>
        Number(item.returnedQuantity || 0) >= item.quantity
      );

      if (fullyReturned) sale.status = 'returned';

      await sale.save({ session });

      if (refundTotal > 0) {
        await Payment.create([{
          type: 'refund',
          direction: 'out',
          amount: refundTotal,
          method: clean(b.refundMethod) || 'cash',
          reference: created[0].returnNo,
          description: 'Customer sales return refund'
        }], { session });
      }

      result = created[0];
    });
  } finally {
    await session.endSession();
  }

  res.status(201).json({ item: result });
}));


// --------------------------------------------------
// PURCHASE RETURNS
// --------------------------------------------------

router.get('/purchase-returns', asyncRoute(async (req, res) => {
  const items = await PurchaseReturn.find()
    .sort({ returnDate: -1 })
    .limit(300);

  res.json({ items });
}));

router.post('/purchase-returns', asyncRoute(async (req, res) => {
  const b = req.body;

  if (!validId(b.purchase))
    return res.status(400).json({ error: 'Invalid purchase.' });

  if (!Array.isArray(b.items) || !b.items.length)
    return res.status(400).json({ error: 'Select items to return.' });

  const session = await mongoose.startSession();
  let result;

  try {
    await session.withTransaction(async () => {
      const purchase = await Purchase.findById(b.purchase)
        .session(session);

      if (!purchase || purchase.status === 'cancelled')
        throw new Error('Purchase not found or cancelled.');

      const returnRows = [];
      let refundTotal = 0;

      for (const line of b.items) {
        const index = Number(line.purchaseItemIndex);
        const quantity = Number(line.quantity);

        if (!Number.isInteger(index) || index < 0 ||
            index >= purchase.items.length)
          throw new Error('Invalid purchase item.');

        if (!Number.isInteger(quantity) || quantity <= 0)
          throw new Error('Return quantity must be a positive whole number.');

        const original = purchase.items[index];
        const alreadyReturned = Number(original.returnedQuantity || 0);
        const remaining = original.quantity - alreadyReturned;

        if (quantity > remaining)
          throw new Error('Return quantity exceeds the remaining purchased quantity for ' + original.name + '.');

        const product = await Product.findById(original.product)
          .session(session);

        if (!product)
          throw new Error('Product not found: ' + original.name);

        if (product.stock < quantity)
          throw new Error('Cannot return ' + quantity + ' units of ' +
            original.name + '. Current stock is ' + product.stock + '.');

        const base = original.unitCost * quantity;
        const tax = base * Number(original.gstRate || 0) / 100;
        const refundAmount = Math.round((base + tax) * 100) / 100;

        const before = product.stock;
        product.stock -= quantity;
        await product.save({ session });

        original.returnedQuantity = alreadyReturned + quantity;

        await StockMovement.create([{
          product: product._id,
          productName: product.name,
          type: 'return',
          quantity: -quantity,
          beforeStock: before,
          afterStock: product.stock,
          reference: purchase.purchaseNo,
          notes: 'Returned to supplier',
          createdBy: req.admin.email || req.admin.role
        }], { session });

        refundTotal += refundAmount;

        returnRows.push({
          purchaseItemIndex: index,
          product: product._id,
          name: original.name,
          quantity,
          refundAmount
        });
      }

      refundTotal = Math.round(refundTotal * 100) / 100;

      const created = await PurchaseReturn.create([{
        returnNo: makeNo('PRET'),
        purchase: purchase._id,
        purchaseNo: purchase.purchaseNo,
        supplierName: purchase.supplierName,
        items: returnRows,
        total: refundTotal,
        refundMethod: clean(b.refundMethod) || 'bank',
        reason: clean(b.reason),
        notes: clean(b.notes)
      }], { session });

      await purchase.save({ session });

      if (refundTotal > 0) {
        await Payment.create([{
          type: 'refund',
          direction: 'in',
          amount: refundTotal,
          method: clean(b.refundMethod) || 'bank',
          reference: created[0].returnNo,
          description: 'Supplier purchase return refund / credit'
        }], { session });
      }

      result = created[0];
    });
  } finally {
    await session.endSession();
  }

  res.status(201).json({ item: result });
}));


// --------------------------------------------------
// EXPENSES
// --------------------------------------------------

router.get('/expenses', asyncRoute(async (req, res) => {
  const items = await Expense.find()
    .sort({ expenseDate: -1 })
    .limit(500);

  res.json({ items });
}));

router.post('/expenses', asyncRoute(async (req, res) => {
  const b = req.body;
  const amount = number(b.amount);

  if (!clean(b.title) || amount <= 0)
    return res.status(400).json({ error: 'Enter expense title and amount.' });

  const session = await mongoose.startSession();
  let item;

  try {
    await session.withTransaction(async () => {
      item = await Expense.create([{
        title: clean(b.title),
        category: clean(b.category) || 'Other',
        amount,
        paymentMethod: clean(b.paymentMethod) || 'cash',
        reference: clean(b.reference),
        notes: clean(b.notes)
      }], { session });

      await Payment.create([{
        type: 'expense',
        direction: 'out',
        amount,
        method: clean(b.paymentMethod) || 'cash',
        reference: item[0]._id.toString(),
        description: clean(b.title)
      }], { session });
    });
  } finally {
    await session.endSession();
  }

  res.status(201).json({ item: item[0] });
}));

// --------------------------------------------------
// STOCK HISTORY
// --------------------------------------------------

router.get('/stock-movements', asyncRoute(async (req, res) => {
  const items = await StockMovement.find()
    .sort({ createdAt: -1 })
    .limit(300);

  res.json({ items });
}));

router.post('/stock-adjustment', asyncRoute(async (req, res) => {
  const { product: id, quantity, reason } = req.body;

  if (!validId(id))
    return res.status(400).json({ error: 'Invalid product.' });

  const qty = number(quantity);

  if (!Number.isInteger(qty) || qty === 0)
    return res.status(400).json({ error: 'Enter a non-zero whole quantity.' });

  const session = await mongoose.startSession();

  try {
    await session.withTransaction(async () => {
      const product = await Product.findById(id).session(session);

      if (!product) throw new Error('Product not found.');

      const before = product.stock;
      const after = before + qty;

      if (after < 0) throw new Error('Stock cannot become negative.');

      product.stock = after;
      await product.save({ session });

      await StockMovement.create([{
        product: product._id,
        productName: product.name,
        type: qty > 0 ? 'adjustment' : 'damage',
        quantity: qty,
        beforeStock: before,
        afterStock: after,
        notes: clean(reason),
        createdBy: req.admin.email || req.admin.role
      }], { session });
    });
  } finally {
    await session.endSession();
  }

  res.json({ message: 'Stock updated successfully.' });
}));

// --------------------------------------------------
// ACCOUNTS
// --------------------------------------------------

router.get('/accounts', asyncRoute(async (req, res) => {
  const items = await Account.find().sort({ name: 1 });
  res.json({ items });
}));

router.post('/accounts', asyncRoute(async (req, res) => {
  const b = req.body;

  if (!clean(b.name))
    return res.status(400).json({ error: 'Account name is required.' });

  const item = await Account.create({
    name: clean(b.name),
    type: clean(b.type) || 'cash',
    openingBalance: number(b.openingBalance)
  });

  res.status(201).json({ item });
}));

// --------------------------------------------------
// REPORTS
// --------------------------------------------------

router.get('/reports', asyncRoute(async (req, res) => {
  const from = req.query.from ? new Date(req.query.from) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const to = req.query.to ? new Date(req.query.to) : new Date();

  if (isNaN(from.getTime()) || isNaN(to.getTime()) || from > to)
    return res.status(400).json({ error: 'Invalid report dates.' });

  to.setHours(23, 59, 59, 999);

  const [sales, purchases, expenses] = await Promise.all([
    Sale.find({
      saleDate: { $gte: from, $lte: to },
      status: { $nin: ['cancelled', 'returned'] }
    }).lean(),
    Purchase.find({
      purchaseDate: { $gte: from, $lte: to },
      status: 'received'
    }).lean(),
    Expense.find({
      expenseDate: { $gte: from, $lte: to }
    }).lean()
  ]);

  const revenue = sales.reduce((s, x) => s + x.subtotal, 0);
  const discount = sales.reduce((s, x) => s + x.discount, 0);
  const tax = sales.reduce((s, x) => s + x.taxAmount, 0);

  const cogs = sales.reduce((s, sale) =>
    s + sale.items.reduce((a, item) =>
      a + item.quantity * item.unitCost, 0), 0);

  const expenseTotal = expenses.reduce((s, x) => s + x.amount, 0);
  const grossProfit = revenue - discount - cogs;
  const netOperatingProfit = grossProfit - expenseTotal;

  res.json({
    from, to,
    salesCount: sales.length,
    purchaseCount: purchases.length,
    revenue,
    discount,
    taxCollected: tax,
    cogs,
    grossProfit,
    expenses: expenseTotal,
    netOperatingProfit,
    purchaseValue: purchases.reduce((s, x) => s + x.total, 0),
    customerOutstanding: sales.reduce((s, x) => s + x.due, 0),
    supplierOutstanding: purchases.reduce((s, x) => s + x.due, 0)
  });
}));


// ==================================================
// ZENZY BUSINESS SYSTEM - ADDITIONAL PRODUCT APIs
// ==================================================

// LOW STOCK PRODUCTS
router.get('/products/low-stock', asyncRoute(async (req, res) => {
  const items = await Product.find({
    active: true,
    $expr: { $lte: ['$stock', '$lowStockAt'] }
  }).sort({ stock: 1 });

  res.json({ success: true, items });
}));

// SINGLE PRODUCT DETAILS
router.get('/products/:id', asyncRoute(async (req, res) => {
  if (!validId(req.params.id))
    return res.status(400).json({ error: 'Invalid product ID.' });

  const item = await Product.findById(req.params.id);

  if (!item)
    return res.status(404).json({ error: 'Product not found.' });

  res.json({ success: true, item });
}));

// DELETE / ARCHIVE PRODUCT
router.delete('/products/:id', asyncRoute(async (req, res) => {
  if (!validId(req.params.id))
    return res.status(400).json({ error: 'Invalid product ID.' });

  const item = await Product.findById(req.params.id);

  if (!item)
    return res.status(404).json({ error: 'Product not found.' });

  const [sales, purchases] = await Promise.all([
    Sale.exists({ 'items.product': item._id }),
    Purchase.exists({ 'items.product': item._id })
  ]);

  if (sales || purchases) {
    item.active = false;
    await item.save();

    return res.json({
      success: true,
      message: 'Product archived. Historical transactions preserved.'
    });
  }

  await Product.findByIdAndDelete(item._id);

  res.json({
    success: true,
    message: 'Product deleted successfully.'
  });
}));

// PRODUCT STOCK HISTORY
router.get('/products/:id/stock-history', asyncRoute(async (req, res) => {
  if (!validId(req.params.id))
    return res.status(400).json({ error: 'Invalid product ID.' });

  const items = await StockMovement.find({
    product: req.params.id
  }).sort({ createdAt: -1 }).limit(500);

  res.json({ success: true, items });
}));

// CATEGORY-WISE PRODUCTS
router.get('/products/category/:categoryId', asyncRoute(async (req, res) => {
  const categoryId = clean(req.params.categoryId);

  const items = await Product.find({
    category: categoryId,
    active: true
  }).sort({ name: 1 });

  res.json({ success: true, items });
}));

// SALES DETAILS
router.get('/sales/:id', asyncRoute(async (req, res) => {
  if (!validId(req.params.id))
    return res.status(400).json({ error: 'Invalid sale ID.' });

  const item = await Sale.findById(req.params.id);

  if (!item)
    return res.status(404).json({ error: 'Sale not found.' });

  res.json({ success: true, item });
}));

// PURCHASE DETAILS
router.get('/purchases/:id', asyncRoute(async (req, res) => {
  if (!validId(req.params.id))
    return res.status(400).json({ error: 'Invalid purchase ID.' });

  const item = await Purchase.findById(req.params.id);

  if (!item)
    return res.status(404).json({ error: 'Purchase not found.' });

  res.json({ success: true, item });
}));

// CUSTOMER UPDATE
router.put('/customers/:id', asyncRoute(async (req, res) => {
  if (!validId(req.params.id))
    return res.status(400).json({ error: 'Invalid customer ID.' });

  const fields = [
    'name', 'phone', 'email', 'address',
    'gstin', 'notes'
  ];

  const update = {};

  fields.forEach(key => {
    if (req.body[key] !== undefined) {
      update[key] = key === 'name'
        ? clean(req.body[key])
        : req.body[key];
    }
  });

  if (update.name !== undefined && !update.name)
    return res.status(400).json({ error: 'Customer name is required.' });

  const item = await Customer.findByIdAndUpdate(
    req.params.id,
    update,
    { new: true, runValidators: true }
  );

  if (!item)
    return res.status(404).json({ error: 'Customer not found.' });

  res.json({ success: true, item });
}));

// CUSTOMER DELETE
router.delete('/customers/:id', asyncRoute(async (req, res) => {
  if (!validId(req.params.id))
    return res.status(400).json({ error: 'Invalid customer ID.' });

  const linked = await Sale.exists({ customer: req.params.id });

  if (linked) {
    return res.status(409).json({
      error: 'Customer has sales history. Archive functionality must be used instead.'
    });
  }

  const item = await Customer.findByIdAndDelete(req.params.id);

  if (!item)
    return res.status(404).json({ error: 'Customer not found.' });

  res.json({ success: true, message: 'Customer deleted.' });
}));

// SUPPLIER DELETE
router.delete('/suppliers/:id', asyncRoute(async (req, res) => {
  if (!validId(req.params.id))
    return res.status(400).json({ error: 'Invalid supplier ID.' });

  const linked = await Purchase.exists({ supplier: req.params.id });

  if (linked) {
    return res.status(409).json({
      error: 'Supplier has purchase history. Archive functionality must be used instead.'
    });
  }

  const item = await Supplier.findByIdAndDelete(req.params.id);

  if (!item)
    return res.status(404).json({ error: 'Supplier not found.' });

  res.json({ success: true, message: 'Supplier deleted.' });
}));


// --------------------------------------------------
// ADDITIONAL BUSINESS MANAGEMENT APIs
// --------------------------------------------------

// Low stock products
router.get('/products/low-stock', asyncRoute(async (req, res) => {
  const items = await Product.find({
    active: true,
    $expr: { $lte: ['$stock', '$lowStockAt'] }
  }).sort({ stock: 1 });

  res.json({ items, count: items.length });
}));

// Single product details
router.get('/products/:id', asyncRoute(async (req, res) => {
  if (!validId(req.params.id))
    return res.status(400).json({ error: 'Invalid product ID.' });

  const item = await Product.findById(req.params.id);
  if (!item) return res.status(404).json({ error: 'Product not found.' });

  res.json({ item });
}));

// Product stock history
router.get('/products/:id/stock-history', asyncRoute(async (req, res) => {
  if (!validId(req.params.id))
    return res.status(400).json({ error: 'Invalid product ID.' });

  const product = await Product.findById(req.params.id);
  if (!product) return res.status(404).json({ error: 'Product not found.' });

  const items = await StockMovement.find({ product: product._id })
    .sort({ createdAt: -1 })
    .limit(200);

  res.json({ items });
}));

// Safely archive products used in transactions
router.delete('/products/:id', asyncRoute(async (req, res) => {
  if (!validId(req.params.id))
    return res.status(400).json({ error: 'Invalid product ID.' });

  const product = await Product.findById(req.params.id);
  if (!product) return res.status(404).json({ error: 'Product not found.' });

  const [sale, purchase] = await Promise.all([
    Sale.findOne({ 'items.product': product._id }),
    Purchase.findOne({ 'items.product': product._id })
  ]);

  if (sale || purchase) {
    product.active = false;
    await product.save();

    return res.json({
      message: 'Product archived because it has transaction history.',
      archived: true
    });
  }

  await Product.findByIdAndDelete(product._id);
  res.json({ message: 'Product deleted.', archived: false });
}));

// Edit customer
router.put('/customers/:id', asyncRoute(async (req, res) => {
  if (!validId(req.params.id))
    return res.status(400).json({ error: 'Invalid customer ID.' });

  if (!clean(req.body.name))
    return res.status(400).json({ error: 'Customer name is required.' });

  const item = await Customer.findByIdAndUpdate(
    req.params.id,
    {
      name: clean(req.body.name),
      phone: clean(req.body.phone),
      email: clean(req.body.email),
      address: clean(req.body.address),
      gstin: clean(req.body.gstin),
      notes: clean(req.body.notes)
    },
    { new: true, runValidators: true }
  );

  if (!item) return res.status(404).json({ error: 'Customer not found.' });

  res.json({ item });
}));

// Single sale details
router.get('/sales/:id', asyncRoute(async (req, res) => {
  if (!validId(req.params.id))
    return res.status(400).json({ error: 'Invalid sale ID.' });

  const item = await Sale.findById(req.params.id)
    .populate('customer', 'name phone email');

  if (!item) return res.status(404).json({ error: 'Sale not found.' });

  res.json({ item });
}));

// Single purchase details
router.get('/purchases/:id', asyncRoute(async (req, res) => {
  if (!validId(req.params.id))
    return res.status(400).json({ error: 'Invalid purchase ID.' });

  const item = await Purchase.findById(req.params.id)
    .populate('supplier', 'name phone email');

  if (!item) return res.status(404).json({ error: 'Purchase not found.' });

  res.json({ item });
}));

module.exports = router;


