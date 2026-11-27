require('dotenv').config();
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const seedProducts = require('./data/products.json');

const app = express();
const FRONT = path.join(__dirname, '..', 'frontend');
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use((req, res, next) => {
  res.set({ 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'SAMEORIGIN', 'Referrer-Policy': 'strict-origin-when-cross-origin', 'Permissions-Policy': 'camera=(), microphone=(), geolocation=()' });
  next();
});
try { app.use(require('compression')()); } catch (e) { /* optional: run "npm i compression" for gzip on your own server */ }
app.use(cors({ origin: process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',').map(s => s.trim()) : true }));
app.use(express.json({ limit: '200kb' }));

let dbPromise = null;
function connectDb() {
  if (!process.env.MONGO_URI) return Promise.reject(new Error('MONGO_URI missing'));
  if (!dbPromise) dbPromise = mongoose.connect(process.env.MONGO_URI).catch(e => { dbPromise = null; throw e; });
  return dbPromise;
}
const needDb = (req, res, next) => connectDb().then(() => next()).catch(e => { console.error('Mongo error:', e.message); res.status(503).json({ error: 'Database is not configured or unreachable. Set MONGO_URI.' }); });

const orders = [];

const emailOk = v => /^\S+@\S+\.\S+$/.test(v || '');

app.get('/api/health', (req, res) => res.json({ ok: true, db: mongoose.connection.readyState === 1 }));
const productsRouter = require('./routes/products')(connectDb, seedProducts);
app.use('/api/products', productsRouter);
app.get('/api/categories', async (req, res) => res.json(['All', ...new Set((await productsRouter.getAll()).map(p => p.category))]));
app.post('/api/orders', async (req, res) => {
  const products = await productsRouter.getAll();
  const c = (req.body && req.body.customer) || {}, items = Array.isArray(req.body && req.body.items) ? req.body.items : [];
  if (!String(c.name || '').trim() || !emailOk(c.email) || !String(c.phone || '').trim() || !String(c.address || '').trim()) return res.status(400).json({ error: 'Please fill in all delivery details.' });
  if (!items.length) return res.status(400).json({ error: 'Your bag is empty.' });
  let total = 0;
  for (const it of items) {
    const p = products.find(x => x.id === it.id), qty = Math.floor(Number(it.qty));
    if (!p || !(qty > 0 && qty <= 20)) return res.status(400).json({ error: 'One or more items are invalid.' });
    total += p.price * qty;
  }
  const orderId = 'ZEN-' + crypto.randomBytes(3).toString('hex').toUpperCase();
  orders.push({ orderId, total, createdAt: new Date() });
  if (orders.length > 500) orders.shift();
  res.status(201).json({ orderId, total, demo: true });
});
app.post('/api/contact', (req, res) => {
  const b = req.body || {};
  if (!String(b.name || '').trim() || !emailOk(b.email) || !String(b.message || '').trim()) return res.status(400).json({ error: 'Please enter name, email and message.' });
  res.json({ message: 'Thanks, we will get back to you soon.' });
});

app.use('/api/auth', require('./routes/auth'));
app.use('/api/articles', needDb, require('./routes/articles'));
app.use('/api/newsletter', needDb, require('./routes/newsletter'));
app.use('/api/bookings', needDb, require('./routes/bookings'));
app.use('/api/media', needDb, require('./routes/media'));
app.use('/api/taxonomy', needDb, require('./routes/taxonomy'));
app.use('/api/settings', needDb, require('./routes/settings'));
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

app.use(express.static(FRONT));
app.get('/admin', (req, res) => res.sendFile(path.join(FRONT, 'admin.html')));
app.use(require('./routes/store')(FRONT));
app.use(require('./routes/seo')(connectDb, FRONT));
app.use((req, res) => {
  res.status(404).send('<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Page not found | Zenzy Collection</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#F5F1E9;color:#171717;font-family:Georgia,serif;text-align:center;padding:24px}h1{font-weight:500;font-size:clamp(40px,8vw,84px);margin:0 0 10px}p{font:14px/1.7 Arial,sans-serif;color:#777;margin:0 0 26px}a{font:600 11px Arial,sans-serif;letter-spacing:2px;text-transform:uppercase;color:#171717;border-bottom:1px solid #B99B6B;margin:0 12px;padding-bottom:4px;text-decoration:none}</style></head><body><main><p style="letter-spacing:3px;font-size:11px">ZENZY COLLECTION</p><h1>Page not found.</h1><p>The page you are looking for has moved or does not exist.</p><a href="/">Home</a><a href="/shop">Shop</a><a href="/blog">The Journal</a></main></body></html>');
});
app.use((err, req, res, next) => {
  console.error(err);
  const status = err.status && err.status < 500 ? err.status : 500;
  res.status(status).json({ error: status < 500 ? err.message : 'Something went wrong.' });
});

module.exports = app;
if (require.main === module) {
  const port = process.env.PORT || 4000;
  app.listen(port, () => console.log('Zenzy running on http://localhost:' + port));
}
