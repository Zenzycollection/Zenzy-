
const mongoose = require('mongoose');

const opts = { timestamps: true };

const ProductSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  sku: { type: String, required: true, unique: true, trim: true },
  barcode: { type: String, default: '', index: true },
  category: { type: String, default: 'General' },
  description: { type: String, default: '' },
  costPrice: { type: Number, required: true, min: 0 },
  sellingPrice: { type: Number, required: true, min: 0 },
  mrp: { type: Number, default: 0, min: 0 },
  gstRate: { type: Number, default: 0, min: 0, max: 100 },
  hsn: { type: String, default: '' },
  unit: { type: String, default: 'piece' },
  stock: { type: Number, default: 0, min: 0 },
  lowStockAt: { type: Number, default: 5, min: 0 },
  sizes: [{ type: String }],
  colors: [{ type: String }],
  active: { type: Boolean, default: true }
}, opts);

const SupplierSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  phone: { type: String, default: '' },
  email: { type: String, default: '' },
  address: { type: String, default: '' },
  gstin: { type: String, default: '' },
  openingBalance: { type: Number, default: 0 },
  notes: { type: String, default: '' }
}, opts);

const CustomerSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  phone: { type: String, default: '' },
  email: { type: String, default: '' },
  address: { type: String, default: '' },
  gstin: { type: String, default: '' },
  openingBalance: { type: Number, default: 0 },
  notes: { type: String, default: '' }
}, opts);

const PurchaseSchema = new mongoose.Schema({
  purchaseNo: { type: String, unique: true },
  supplier: { type: mongoose.Schema.Types.ObjectId, ref: 'BusinessSupplier' },
  supplierName: String,
  invoiceNo: String,
  items: [{
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'BusinessProduct' },
    name: String,
    sku: String,
    quantity: { type: Number, min: 1 },
    unitCost: { type: Number, min: 0 },
    gstRate: { type: Number, default: 0 },
    total: Number
  }],
  subtotal: Number,
  taxAmount: Number,
  extraCost: { type: Number, default: 0 },
  total: Number,
  paid: { type: Number, default: 0 },
  due: { type: Number, default: 0 },
  paymentMethod: { type: String, default: 'cash' },
  status: { type: String, enum: ['received', 'cancelled'], default: 'received' },
  notes: String,
  purchaseDate: { type: Date, default: Date.now }
}, opts);

const SaleSchema = new mongoose.Schema({
  saleNo: { type: String, unique: true },
  customer: { type: mongoose.Schema.Types.ObjectId, ref: 'BusinessCustomer' },
  customerName: String,
  items: [{
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'BusinessProduct' },
    name: String,
    sku: String,
    quantity: { type: Number, min: 1 },
    unitPrice: { type: Number, min: 0 },
    unitCost: { type: Number, default: 0 },
    gstRate: { type: Number, default: 0 },
    total: Number
  }],
  subtotal: Number,
  discount: { type: Number, default: 0 },
  taxAmount: Number,
  total: Number,
  paid: { type: Number, default: 0 },
  due: { type: Number, default: 0 },
  paymentMethod: { type: String, default: 'cash' },
  status: {
    type: String,
    enum: ['completed', 'partial', 'credit', 'cancelled', 'returned'],
    default: 'completed'
  },
  notes: String,
  saleDate: { type: Date, default: Date.now }
}, opts);

const ExpenseSchema = new mongoose.Schema({
  title: { type: String, required: true },
  category: { type: String, default: 'Other' },
  amount: { type: Number, required: true, min: 0.01 },
  paymentMethod: { type: String, default: 'cash' },
  reference: String,
  notes: String,
  expenseDate: { type: Date, default: Date.now }
}, opts);

const StockMovementSchema = new mongoose.Schema({
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'BusinessProduct', required: true },
  productName: String,
  type: {
    type: String,
    enum: ['opening', 'purchase', 'sale', 'adjustment', 'return', 'damage'],
    required: true
  },
  quantity: Number,
  beforeStock: Number,
  afterStock: Number,
  reference: String,
  notes: String,
  createdBy: String
}, opts);

const PaymentSchema = new mongoose.Schema({
  type: { type: String, enum: ['sale', 'purchase', 'income', 'expense', 'transfer', 'refund'], required: true },
  direction: { type: String, enum: ['in', 'out'], required: true },
  amount: { type: Number, required: true, min: 0.01 },
  method: { type: String, default: 'cash' },
  account: { type: String, default: 'Cash' },
  reference: String,
  description: String,
  date: { type: Date, default: Date.now }
}, opts);

const AccountSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  type: { type: String, enum: ['cash', 'bank', 'upi', 'other'], default: 'cash' },
  openingBalance: { type: Number, default: 0 },
  active: { type: Boolean, default: true }
}, opts);

module.exports = {
  Product: mongoose.models.BusinessProduct ||
    mongoose.model('BusinessProduct', ProductSchema),
  Supplier: mongoose.models.BusinessSupplier ||
    mongoose.model('BusinessSupplier', SupplierSchema),
  Customer: mongoose.models.BusinessCustomer ||
    mongoose.model('BusinessCustomer', CustomerSchema),
  Purchase: mongoose.models.BusinessPurchase ||
    mongoose.model('BusinessPurchase', PurchaseSchema),
  Sale: mongoose.models.BusinessSale ||
    mongoose.model('BusinessSale', SaleSchema),
  Expense: mongoose.models.BusinessExpense ||
    mongoose.model('BusinessExpense', ExpenseSchema),
  StockMovement: mongoose.models.StockMovement ||
    mongoose.model('StockMovement', StockMovementSchema),
  Payment: mongoose.models.BusinessPayment ||
    mongoose.model('BusinessPayment', PaymentSchema),
  Account: mongoose.models.BusinessAccount ||
    mongoose.model('BusinessAccount', AccountSchema)
};
