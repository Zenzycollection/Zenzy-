const router = require('express').Router();
const Setting = require('../models/Setting');
const adminAuth = require('../middleware/adminAuth');

const DEFAULTS = { announcement: '', instagramUrl: '', pinterestUrl: '', contactEmail: '' };

async function readSettings() {
  const doc = await Setting.findOne({ key: 'site' }).lean();
  return { ...DEFAULTS, ...((doc && doc.value) || {}) };
}

router.get('/', async (req, res, next) => {
  try {
    res.set('Cache-Control', 'public, max-age=60');
    res.json(await readSettings());
  } catch (e) { next(e); }
});

router.put('/', adminAuth, async (req, res, next) => {
  try {
    const b = req.body || {};
    const clean = v => String(v == null ? '' : v).trim();
    const link = (v, label) => {
      const s = clean(v).slice(0, 300);
      if (s && !/^https:\/\/[^\s]+$/i.test(s)) throw Object.assign(new Error(label + ' must start with https://'), { status: 400 });
      return s;
    };
    const email = clean(b.contactEmail).slice(0, 254);
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Enter a valid contact email.' });
    const value = { announcement: clean(b.announcement).slice(0, 140), instagramUrl: link(b.instagramUrl, 'Instagram URL'), pinterestUrl: link(b.pinterestUrl, 'Pinterest URL'), contactEmail: email };
    await Setting.findOneAndUpdate({ key: 'site' }, { $set: { value } }, { upsert: true, new: true });
    res.json(value);
  } catch (e) {
    if (e.status === 400) return res.status(400).json({ error: e.message });
    next(e);
  }
});

module.exports = router;
