const router = require('express').Router();
const Article = require('../models/Article');
const adminOnly = require('../middleware/adminAuth');
const adminAuth = adminOnly.staff;
const ArticleView = require('../models/ArticleView');
const { slugify, cleanHtml } = require('../utils/content');
const { CATEGORIES, RESERVED_SLUGS, resolveCategory, readingTime } = require('../utils/categories');
const Subscriber = require('../models/Subscriber');
const Booking = require('../models/Booking');
const parseDate = v => { const d = v ? new Date(v) : null; return d && !isNaN(d) ? d : null; };
const safe = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
async function uniqueSlug(base, excludeId) { let root = slugify(base) || 'style-story'; if (RESERVED_SLUGS.has(root)) root += '-story'; let slug = root, i = 2; while (await Article.exists({ slug, ...(excludeId ? { _id: { $ne: excludeId } } : {}) })) slug = `${root}-${i++}`; return slug; }
function pick(body) { const content = cleanHtml(body.content); const tags = Array.isArray(body.tags) ? body.tags : String(body.tags || '').split(','); return { title: safe(body.title,180), excerpt: safe(body.excerpt,500), content, content, readingTime: readingTime(content), category: resolveCategory(safe(body.category || 'Lifestyle',60)), tags: tags.map(x => safe(x,40)).filter(Boolean).slice(0,15), author: safe(body.author || 'Zenzy Editorial',80), coverImage: safe(body.coverImage,800), coverImageAlt: safe(body.coverImageAlt,200), seoTitle: safe(body.seoTitle,70), metaDescription: safe(body.metaDescription,180), focusKeyword: safe(body.focusKeyword,100), canonicalUrl: /^https?:\/\//i.test(body.canonicalUrl || '') ? safe(body.canonicalUrl,500) : '', featured: !!body.featured, related: (Array.isArray(body.related) ? body.related : []).map(String).filter(id => /^[a-f\d]{24}$/i.test(id)).slice(0, 6), status: body.status === 'published' ? 'published' : 'draft' }; }

router.get('/', async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(30, Math.max(1, Number(req.query.limit) || 9));

    const filter = {
      status: 'published',
      publishedAt: { $lte: new Date() }
    };

        if (req.query.category) {
      filter.category = resolveCategory(safe(req.query.category, 60));
    }

    if (req.query.tag) {
      filter.tags = safe(req.query.tag, 40);
    }

    if (req.query.author) {
      const names = await Article.distinct('author', { status: 'published' });
      const hit = names.find(n => slugify(n) === slugify(req.query.author));
      filter.author = hit || '\u0000none';
    }

    if (req.query.featured === '1') {
      filter.featured = true;
    }

    const sort = req.query.sort === 'trending'
      ? { views: -1, publishedAt: -1 }
      : req.query.sort === 'latest'
        ? { publishedAt: -1 }
        : { featured: -1, publishedAt: -1 };

    if (req.query.q) {
      const keyword = safe(req.query.q, 80);
      const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const searchRegex = new RegExp(escaped, 'i');

      filter.$or = [
        { title: searchRegex },
        { excerpt: searchRegex },
        { content: searchRegex },
        { category: searchRegex },
        { author: searchRegex },
        { tags: searchRegex }
      ];
    }

    const [items, total] = await Promise.all([
      Article.find(filter)
        .select('-content')
.sort(sort)
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),

      Article.countDocuments(filter)
    ]);

    res.json({
      items,
      total,
      page,
      limit,
      pages: Math.ceil(total / limit)
    });

  } catch (error) {
    next(error);
  }
});

const LIVE = () => ({ status: 'published', publishedAt: { $lte: new Date() } });

router.get('/suggest', async (req, res, next) => {
  try {
    const q = safe(req.query.q, 60);
    if (q.length < 2) return res.json({ articles: [], categories: [], tags: [] });
    const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    const [articles, tagRows] = await Promise.all([
      Article.find({ ...LIVE(), $or: [{ title: rx }, { tags: rx }] }).select('title slug category').sort({ views: -1, publishedAt: -1 }).limit(5).lean(),
      Article.aggregate([{ $match: LIVE() }, { $unwind: '$tags' }, { $match: { tags: rx } }, { $group: { _id: '$tags', count: { $sum: 1 } } }, { $sort: { count: -1 } }, { $limit: 4 }])
    ]);
    res.json({ articles, categories: CATEGORIES.filter(c => rx.test(c.name)).slice(0, 3), tags: tagRows.map(t => t._id) });
  } catch (e) { next(e); }
});

router.get('/meta/authors', async (req, res, next) => {
  try {
    const rows = await Article.aggregate([{ $match: LIVE() }, { $group: { _id: '$author', count: { $sum: 1 } } }, { $sort: { count: -1, _id: 1 } }]);
    res.json(rows.map(r => ({ name: r._id, slug: slugify(r._id), count: r.count })));
  } catch (e) { next(e); }
});

router.get('/meta/categories', async (req, res, next) => {
  try {
    const rows = await Article.aggregate([
      { $match: { status: 'published', publishedAt: { $lte: new Date() } } },
      { $group: { _id: '$category', count: { $sum: 1 } } }
    ]);
    const counts = Object.fromEntries(rows.map(r => [r._id, r.count]));
    res.json(CATEGORIES.map(c => ({ ...c, count: counts[c.name] || 0 })));
  } catch (e) { next(e); }
});

router.get('/meta/tags', async (req, res, next) => {
  try {
    const rows = await Article.aggregate([
      { $match: { status: 'published', publishedAt: { $lte: new Date() } } },
      { $unwind: '$tags' },
      { $group: { _id: '$tags', count: { $sum: 1 } } },
      { $sort: { count: -1, _id: 1 } },
      { $limit: 20 }
    ]);
    res.json(rows.map(r => ({ tag: r._id, count: r.count })));
  } catch (e) { next(e); }
});

router.get('/admin/stats', adminAuth, async (req, res, next) => {
  try {
    const now = new Date();
    const [published, scheduled, drafts, top, byCat, totals, subscribers, newBookings] = await Promise.all([
      Article.countDocuments({ status: 'published', publishedAt: { $lte: now } }),
      Article.countDocuments({ status: 'published', publishedAt: { $gt: now } }),
      Article.countDocuments({ status: 'draft' }),
      Article.find({ status: 'published' }).select('title slug views category').sort({ views: -1 }).limit(5).lean(),
      Article.aggregate([{ $match: { status: 'published' } }, { $group: { _id: '$category', articles: { $sum: 1 }, views: { $sum: '$views' } } }, { $sort: { views: -1 } }]),
      Article.aggregate([{ $group: { _id: null, views: { $sum: '$views' } } }]),
      Subscriber.countDocuments({ status: 'active' }),
      Booking.countDocuments({ status: 'NEW' })
    ]);
    res.json({ published, scheduled, drafts, totalViews: (totals[0] && totals[0].views) || 0, top, byCategory: byCat.map(c => ({ category: c._id, articles: c.articles, views: c.views })), subscribers, newBookings });
  } catch (e) { next(e); }
});

router.get('/admin/all', adminAuth, async(req,res,next)=>{try{const filter={};if(['draft','published'].includes(req.query.status))filter.status=req.query.status;const items=await Article.find(filter).sort({updatedAt:-1}).limit(500).lean();res.json({items});}catch(e){next(e);}});
router.get('/admin/:id', adminAuth, async(req,res,next)=>{try{const item=await Article.findById(req.params.id);if(!item)return res.status(404).json({error:'Article not found'});res.json(item);}catch(e){next(e);}});
router.post('/', adminAuth, async(req,res,next)=>{try{const data=pick(req.body);if(!data.title)return res.status(400).json({error:'Article title is required.'});data.slug=await uniqueSlug(req.body.slug || data.title);if(data.status==='published')data.publishedAt=parseDate(req.body.publishedAt) || new Date();const item=await Article.create(data);res.status(201).json(item);}catch(e){if(e.code===11000)return res.status(409).json({error:'This slug is already in use.'});next(e);}});
router.put('/:id', adminAuth, async(req,res,next)=>{try{const item=await Article.findById(req.params.id);if(!item)return res.status(404).json({error:'Article not found'});const data=pick(req.body);if(!data.title)return res.status(400).json({error:'Article title is required.'});const requested=slugify(req.body.slug || item.slug);data.slug=requested===item.slug?item.slug:await uniqueSlug(requested,item._id);if(data.status==='published')data.publishedAt=parseDate(req.body.publishedAt) || item.publishedAt || new Date();else data.publishedAt=item.publishedAt;Object.assign(item,data);await item.save();res.json(item);}catch(e){next(e);}});
router.delete('/:id', adminOnly, async(req,res,next)=>{try{const item=await Article.findByIdAndDelete(req.params.id);if(!item)return res.status(404).json({error:'Article not found'});res.json({message:'Article deleted.'});}catch(e){next(e);}});
router.get('/:slug', async(req,res,next)=>{try{const item=await Article.findOneAndUpdate({slug:req.params.slug,status:'published',publishedAt:{$lte:new Date()}},{$inc:{views:1}},{new:true}).lean();if(!item)return res.status(404).json({error:'Article not found'});const now=new Date();const live={status:'published'};const brief='title slug excerpt category coverImage coverImageAlt author publishedAt readingTime';const [relatedAuto,older,newer]=await Promise.all([Article.find({...live,publishedAt:{$lte:now},_id:{$ne:item._id},$or:[{category:item.category},{tags:{$in:item.tags||[]}}]}).select(brief).sort({publishedAt:-1}).limit(3).lean(),Article.findOne({...live,publishedAt:{$lt:item.publishedAt}}).select('title slug').sort({publishedAt:-1}).lean(),Article.findOne({...live,$and:[{publishedAt:{$gt:item.publishedAt}},{publishedAt:{$lte:now}}]}).select('title slug').sort({publishedAt:1}).lean()]);item.readingTime=item.readingTime||readingTime(item.content);let related=relatedAuto;if((item.related||[]).length){const picked=await Article.find({...live,publishedAt:{$lte:now},_id:{$in:item.related}}).select(brief).lean();const have=new Set(picked.map(x=>String(x._id)));related=[...picked,...relatedAuto.filter(x=>!have.has(String(x._id)))].slice(0,3)}res.json({...item,related,prev:older,next:newer});}catch(e){next(e);}});
module.exports=router;
