const router = require('express').Router();
const Article = require('../models/Article');
const adminOnly = require('../middleware/adminAuth');
const ArticleView = require('../models/ArticleView');
const { CATEGORIES } = require('../utils/categories');

const safe = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
const isId = v => /^[a-f\d]{24}$/i.test(String(v || ''));

router.use(adminOnly.staff);

router.get('/categories', async (req, res, next) => {
  try {
    const rows = await Article.aggregate([{ $group: { _id: '$category', total: { $sum: 1 }, published: { $sum: { $cond: [{ $and: [{ $eq: ['$status', 'published'] }, { $lte: ['$publishedAt', '$$NOW'] }] }, 1, 0] } } } }]);
    const m = Object.fromEntries(rows.map(r => [r._id, r]));
    res.json(CATEGORIES.map(c => ({ ...c, total: (m[c.name] && m[c.name].total) || 0, published: (m[c.name] && m[c.name].published) || 0 })));
  } catch (e) { next(e); }
});

router.get('/tags', async (req, res, next) => {
  try {
    const rows = await Article.aggregate([{ $unwind: '$tags' }, { $group: { _id: '$tags', count: { $sum: 1 } } }, { $sort: { count: -1, _id: 1 } }]);
    res.json(rows.map(r => ({ tag: r._id, count: r.count })));
  } catch (e) { next(e); }
});

router.patch('/tags/rename', adminOnly, async (req, res, next) => {
  try {
    const from = safe(req.body.from, 40), to = safe(req.body.to, 40);
    if (!from || !to) return res.status(400).json({ error: 'Both the old and new tag are required.' });
    await Article.updateMany({ tags: from }, [{ $set: { tags: { $setUnion: [{ $map: { input: '$tags', as: 't', in: { $cond: [{ $eq: ['$$t', { $literal: from }] }, { $literal: to }, '$$t'] } } }, []] } } }]);
    res.json({ message: 'Tag renamed.' });
  } catch (e) { next(e); }
});

router.delete('/tags/:tag', adminOnly, async (req, res, next) => {
  try {
    const r = await Article.updateMany({ tags: safe(req.params.tag, 40) }, { $pull: { tags: safe(req.params.tag, 40) } });
    res.json({ message: 'Tag removed from ' + r.modifiedCount + ' articles.' });
  } catch (e) { next(e); }
});

router.get('/authors', async (req, res, next) => {
  try {
    const rows = await Article.aggregate([{ $group: { _id: '$author', total: { $sum: 1 }, views: { $sum: '$views' } } }, { $sort: { total: -1, _id: 1 } }]);
    res.json(rows.map(r => ({ name: r._id, total: r.total, views: r.views })));
  } catch (e) { next(e); }
});

router.patch('/authors/rename', adminOnly, async (req, res, next) => {
  try {
    const from = safe(req.body.from, 80), to = safe(req.body.to, 80);
    if (!from || !to) return res.status(400).json({ error: 'Both the old and new author name are required.' });
    const r = await Article.updateMany({ author: from }, { $set: { author: to } });
    res.json({ message: 'Author renamed on ' + r.modifiedCount + ' articles.' });
  } catch (e) { next(e); }
});

router.get('/seo', async (req, res, next) => {
  try {
    const items = await Article.find().select('title slug status seoTitle metaDescription focusKeyword coverImage coverImageAlt').sort({ updatedAt: -1 }).limit(500).lean();
    res.json(items.map(a => ({
      ...a,
      issues: [
        !a.seoTitle && 'no SEO title',
        !a.metaDescription && 'no meta description',
        a.metaDescription && a.metaDescription.length < 70 && 'meta description is short',
        !a.coverImage && 'no cover image',
        a.coverImage && !a.coverImageAlt && 'no image alt text'
      ].filter(Boolean)
    })));
  } catch (e) { next(e); }
});

router.patch('/seo/:id', async (req, res, next) => {
  try {
    if (!isId(req.params.id)) return res.status(400).json({ error: 'Invalid article id.' });
    const b = req.body || {};
    const item = await Article.findByIdAndUpdate(req.params.id, { $set: { seoTitle: safe(b.seoTitle, 70), metaDescription: safe(b.metaDescription, 180), focusKeyword: safe(b.focusKeyword, 100), coverImageAlt: safe(b.coverImageAlt, 200) } }, { new: true, runValidators: true }).select('title seoTitle metaDescription');
    if (!item) return res.status(404).json({ error: 'Article not found.' });
    res.json(item);
  } catch (e) { next(e); }
});

module.exports = router;
