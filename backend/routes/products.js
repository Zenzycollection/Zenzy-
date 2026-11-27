const crypto = require('crypto');
const express = require('express');
const Product = require('../models/Product');
const adminAuth = require('../middleware/adminAuth');

const CATS = ['Women', 'Men', 'Essentials'];
const s = (v, n) => String(v == null ? '' : v).replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, n);
const bad = m => Object.assign(new Error(m), { status: 400 });
const bool = (v, d) => v === undefined ? d : !(v === false || v === 'false' || v === 0 || v === '0');

function clean(b) {
  const name = s(b.name, 120);
  if (!name) throw bad('Product name is required.');
  const category = s(b.category, 30);
  if (!CATS.includes(category)) throw bad('Choose Women, Men or Essentials.');
  const price = Math.round(Number(b.price));
  if (!(price > 0 && price < 1000000)) throw bad('Enter a valid selling price.');
  let mrp = Math.round(Number(b.mrp)) || 0;
  if (mrp && mrp <= price) mrp = 0;
  const image = s(b.image, 600);
  if (!/^(https:\/\/|\/)\S+$/.test(image)) throw bad('Add a product image (https link or upload).');
  let sizes = Array.isArray(b.sizes) ? b.sizes : String(b.sizes || '').split(',');
  sizes = [...new Set(sizes.map(x => s(x, 12)).filter(Boolean))].slice(0, 15);
  if (!sizes.length) sizes = ['Free Size'];
  return {
    name, category, price, mrp, image, sizes,
    badge: s(b.badge, 24).toUpperCase(),
    description: s(b.description, 1000),
    fabric: s(b.fabric, 120), color: s(b.color, 120), fit: s(b.fit, 120), care: s(b.care, 200),
    inStock: bool(b.inStock, true), active: bool(b.active, true),
    sortOrder: Math.round(Number(b.sortOrder)) || 0
  };
}

const pub = p => ({
  id: p.id, name: p.name, category: p.category, price: p.price, mrp: p.mrp || 0, image: p.image,
  sizes: p.sizes && p.sizes.length ? p.sizes : ['Free Size'], badge: p.badge || '', description: p.description || '',
  fabric: p.fabric || '', color: p.color || '', fit: p.fit || '', care: p.care || '', inStock: p.inStock !== false
});
const adm = p => ({ ...pub(p), active: p.active !== false, sortOrder: p.sortOrder || 0 });

module.exports = function productsRouter(connectDb, seed) {
  const router = express.Router();
  const seedList = () => seed.map(p => pub({ ...p, inStock: true }));

  // public shop + orders use this. Falls back to products.json until products are imported.
  async function getAll() {
    try {
      await connectDb();
      if (!(await Product.estimatedDocumentCount())) return seedList();
      const list = await Product.find({ active: true }).sort({ sortOrder: 1, createdAt: -1 }).lean();
      return list.map(pub);
    } catch (e) { return seedList(); }
  }
  router.getAll = getAll;

  router.get('/', async (req, res) => { res.set('Cache-Control', 'no-store'); res.json(await getAll()); });

  const db = (req, res, next) => connectDb().then(() => next()).catch(() => res.status(503).json({ error: 'Database is not reachable.' }));
  const fail = (res, next) => e => e.status === 400 ? res.status(400).json({ error: e.message }) : next(e);

  router.get('/admin/all', adminAuth, db, async (req, res, next) => {
    try {
      const items = await Product.find().sort({ sortOrder: 1, createdAt: -1 }).lean();
      res.json({ items: items.map(adm), canImport: items.length === 0 });
    } catch (e) { next(e); }
  });

  router.post('/admin/import', adminAuth, db, async (req, res, next) => {
    try {
      if (await Product.estimatedDocumentCount()) return res.status(400).json({ error: 'Products already imported.' });
      const docs = seed.map((p, i) => ({ id: s(p.id, 40), ...clean({ ...p, inStock: true, active: true, sortOrder: i }) }));
      await Product.insertMany(docs);
      res.status(201).json({ imported: docs.length });
    } catch (e) { fail(res, next)(e); }
  });

  router.post('/admin', adminAuth, db, async (req, res, next) => {
    try {
      const doc = await Product.create({ id: 'zen-' + crypto.randomBytes(3).toString('hex'), ...clean(req.body || {}) });
      res.status(201).json(adm(doc));
    } catch (e) { fail(res, next)(e); }
  });

  router.put('/admin/:pid', adminAuth, db, async (req, res, next) => {
    try {
      const doc = await Product.findOneAndUpdate({ id: req.params.pid }, { $set: clean(req.body || {}) }, { new: true, runValidators: true });
      if (!doc) return res.status(404).json({ error: 'Product not found.' });
      res.json(adm(doc));
    } catch (e) { fail(res, next)(e); }
  });

  router.delete('/admin/:pid', adminAuth, db, async (req, res, next) => {
    try {
      const r = await Product.deleteOne({ id: req.params.pid });
      if (!r.deletedCount) return res.status(404).json({ error: 'Product not found.' });
      res.json({ message: 'Product deleted.' });
    } catch (e) { next(e); }
  });

  return router;
};
