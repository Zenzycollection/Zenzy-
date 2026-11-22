const router = require('express').Router();
const Subscriber = require('../models/Subscriber');
const adminAuth = require('../middleware/adminAuth');
const emailOk = v => /^\S+@\S+\.\S+$/.test(v || '') && v.length <= 254;
const cell = v => { let s = String(v == null ? '' : v); if (/^[=+\-@]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; };

router.post('/', async (req, res, next) => {
  try {
    const email = String((req.body && req.body.email) || '').trim().toLowerCase();
    if (!emailOk(email)) return res.status(400).json({ error: 'Please enter a valid email.' });
    const source = String((req.body && req.body.source) || 'journal').slice(0, 40);
    const existing = await Subscriber.findOne({ email });
    if (existing) {
      if (existing.status === 'unsubscribed') { existing.status = 'active'; await existing.save(); }
      return res.json({ message: 'You are already on the list. Thank you!' });
    }
    await Subscriber.create({ email, source });
    res.status(201).json({ message: 'Thanks for subscribing!' });
  } catch (e) {
    if (e.code === 11000) return res.json({ message: 'You are already on the list. Thank you!' });
    next(e);
  }
});

router.get('/admin/all', adminAuth, async (req, res, next) => {
  try {
    const q = String(req.query.q || '').trim().slice(0, 80);
    const filter = q ? { email: new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') } : {};
    const [items, total] = await Promise.all([
      Subscriber.find(filter).sort({ createdAt: -1 }).limit(500).lean(),
      Subscriber.countDocuments()
    ]);
    res.json({ items, total });
  } catch (e) { next(e); }
});

router.get('/admin/export', adminAuth, async (req, res, next) => {
  try {
    const items = await Subscriber.find({ status: 'active' }).sort({ createdAt: -1 }).lean();
    const csv = 'email,source,subscribed_at\n' + items.map(s => [cell(s.email), cell(s.source), cell(s.createdAt.toISOString())].join(',')).join('\n');
    res.type('text/csv').send(csv);
  } catch (e) { next(e); }
});

router.delete('/admin/:id', adminAuth, async (req, res, next) => {
  try {
    const item = await Subscriber.findByIdAndDelete(req.params.id);
    if (!item) return res.status(404).json({ error: 'Subscriber not found' });
    res.json({ message: 'Subscriber removed.' });
  } catch (e) { next(e); }
});

module.exports = router;
