const express = require('express');
const fs = require('fs');
const path = require('path');
const Article = require('../models/Article');
const { CATEGORIES } = require('../utils/categories');
const { slugify } = require('../utils/content');

const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const cut = (s, n) => { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1).trim() + '…' : s; };
const ld = o => '<script type="application/ld+json">' + JSON.stringify(o).replace(/</g, '\\u003c') + '</script>';
const live = () => ({ status: 'published', publishedAt: { $lte: new Date() } });
const PAGES = {
  'editors-picks': { title: 'Editor\u2019s Picks | The Zenzy Journal', description: 'Handpicked fashion stories and the most-read articles from The Zenzy Journal.' },
  latest: { title: 'Latest Stories | The Zenzy Journal', description: 'Every new fashion story, trend report and styling guide from The Zenzy Journal, newest first.' },
  categories: { title: 'Categories | The Zenzy Journal', description: 'Browse The Zenzy Journal by topic: men\u2019s and women\u2019s fashion, trends, streetwear, style guides and more.' },
  search: { title: 'Search | The Zenzy Journal', description: 'Search fashion stories by title, keyword or category.', noindex: true }
};

module.exports = function seoRouter(connectDb, frontDir) {
  const router = express.Router();
  const base = req => (process.env.SITE_URL || (req.protocol + '://' + req.get('host'))).replace(/\/+$/, '');
  const org = b => ({ '@type': 'Organization', name: 'Zenzy Collection', url: b });

  function render(meta) {
    let html = fs.readFileSync(path.join(frontDir, 'blog.html'), 'utf8');
    html = html.replace(/<title>[\s\S]*?<\/title>/i, '').replace(/<meta\s+name="description"[^>]*>\s*/i, '');
    const tags = [
      '<title>' + esc(meta.title) + '</title>',
      '<meta name="description" content="' + esc(meta.description) + '">',
      '<link rel="canonical" href="' + esc(meta.canonical) + '">',
      '<meta name="robots" content="' + (meta.noindex || meta.noIndex
  ? 'noindex,follow'
  : 'index,follow,max-image-preview:large') + '">',
      '<meta property="og:site_name" content="Zenzy Collection">',
      '<meta property="og:type" content="' + (meta.article ? 'article' : 'website') + '">',
      '<meta property="og:title" content="' + esc(meta.ogTitle || meta.title) + '">',
      '<meta property="og:description" content="' + esc(meta.ogDescription || meta.description) + '">',
      '<meta property="og:url" content="' + esc(meta.canonical) + '">',
      meta.image ? '<meta property="og:image" content="' + esc(meta.image) + '">' : '',
      '<meta name="twitter:card" content="' + (meta.image ? 'summary_large_image' : 'summary') + '">',
      '<meta name="twitter:title" content="' + esc(meta.title) + '">',
      '<meta name="twitter:description" content="' + esc(meta.description) + '">',
      meta.image ? '<meta name="twitter:image" content="' + esc(meta.image) + '">' : '',
      ...(meta.schema || []).map(ld)
    ].filter(Boolean).join('\n');
    return html.replace('</head>', tags + '\n</head>');
  }

  router.get('/robots.txt', (req, res) => {
    res.type('text/plain').send('User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/\n\nSitemap: ' + base(req) + '/sitemap.xml\n');
  });

  router.get('/sitemap.xml', async (req, res) => {
    const b = base(req);
    const urls = [{ loc: b + '/' }, { loc: b + '/blog' }, { loc: b + '/lookbook' }, { loc: b + '/shop' }, { loc: b + '/collections' }, { loc: b + '/our-story' }, { loc: b + '/book-a-visit' }, ...Object.keys(PAGES).filter(k => !PAGES[k].noindex).map(k => ({ loc: b + '/blog/' + k })), ...CATEGORIES.map(c => ({ loc: b + '/blog/' + c.slug }))];
    try {
      await connectDb();
      const items = await Article.find(live()).select('slug updatedAt publishedAt').sort({ publishedAt: -1 }).limit(5000).lean();
      (await Article.distinct('author', live())).forEach(n => urls.push({ loc: b + '/blog/author/' + slugify(n) }));
      items.forEach(a => urls.push({ loc: b + '/blog/' + encodeURIComponent(a.slug), lastmod: new Date(a.updatedAt || a.publishedAt).toISOString() }));
    } catch (e) { console.error('Sitemap DB error:', e.message); }
    const xml = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
      urls.map(u => '  <url><loc>' + esc(u.loc) + '</loc>' + (u.lastmod ? '<lastmod>' + u.lastmod + '</lastmod>' : '') + '</url>').join('\n') + '\n</urlset>\n';
    res.type('application/xml').send(xml);
  });

  router.get('/lookbook', (req, res) => {
    const b = base(req);
    res.send(render({ title: 'Lookbook | The Zenzy Journal', description: 'Outfit inspiration, seasonal edits and styling ideas from the Zenzy Collection lookbook.', canonical: b + '/lookbook', schema: [org(b)].map(o => ({ '@context': 'https://schema.org', ...o })) }));
  });

  router.get('/blog', (req, res, next) => {
    const old = CATEGORIES.find(c => c.slug === String(req.query.category || '').toLowerCase());
    if (!old) return next();
    res.redirect(301, '/blog/' + old.slug + (req.query.q ? '?q=' + encodeURIComponent(String(req.query.q)) : ''));
  });

  router.get('/blog', (req, res) => {
    const b = base(req);
    const cat = CATEGORIES.find(c => c.slug === String(req.query.category || '').toLowerCase());
    const title = cat ? cat.name + ' | The Zenzy Journal' : 'The Zenzy Journal | Fashion, Trends & Style Inspiration';
    const description = cat
      ? 'Read the latest ' + cat.name + ' stories, styling ideas and guides from The Zenzy Journal.'
      : 'Discover fashion trends, styling inspiration, wardrobe essentials and timeless fashion stories at The Zenzy Journal.';
    const canonical = b + '/blog' + (cat ? '?category=' + cat.slug : '');
    res.send(render({ title, description, canonical, noindex: !!req.query.q, schema: [org(b)].map(o => ({ '@context': 'https://schema.org', ...o })) }));
  });

router.get('/blog/author/:name', async (req, res) => {
    const b = base(req);
    try {
      await connectDb();
      const names = await Article.distinct('author', live());
      const hit = names.find(n => slugify(n) === slugify(req.params.name));
      if (!hit) return res.status(404).send(render({ title: 'Author not found | The Zenzy Journal', description: 'This author could not be found.', canonical: b + '/blog', noindex: true }));
      const url = b + '/blog/author/' + slugify(hit);
      res.send(render({ title: hit + ' | Author at The Zenzy Journal', description: 'Read fashion stories, styling guides and trend reports by ' + hit + ' at The Zenzy Journal.', canonical: url, schema: [{ '@context': 'https://schema.org', '@type': 'ProfilePage', mainEntity: { '@type': 'Person', name: hit, url } }] }));
    } catch (e) {
      console.error('Author page error:', e.message);
      res.sendFile(path.join(frontDir, 'blog.html'));
    }
  });

  router.get('/blog/:slug', async (req, res) => {
    const s = req.params.slug, cat = CATEGORIES.find(c => c.slug === s);
    if (PAGES[s] || cat) {
      const b0 = base(req), m = cat
        ? { title: cat.name + ' | The Zenzy Journal', description: 'Read the latest ' + cat.name + ' stories, styling ideas and guides from The Zenzy Journal.' }
        : PAGES[s];
      return res.send(render({ title: m.title, description: m.description, canonical: b0 + '/blog/' + s, noindex: !!m.noindex, schema: [org(b0)].map(o => ({ '@context': 'https://schema.org', ...o })) }));
    }
    const b = base(req);
    try {
      await connectDb();
      const a = await Article.findOne({ slug: req.params.slug, ...live() }).select('-content').lean();
      if (!a) return res.status(404).send(render({ title: 'Story not found | The Zenzy Journal', description: 'This story could not be found.', canonical: b + '/blog', noindex: true }));
      const url = b + '/blog/' + encodeURIComponent(a.slug);
      const canonical = /^https?:\/\//i.test(a.canonicalUrl || '') ? a.canonicalUrl : url;
      const title = (a.seoTitle || a.title) + ' | Zenzy Collection';
const description = cut(a.metaDescription || a.excerpt || a.title, 160);

const socialTitle = a.ogTitle || title;
const socialDescription = cut(
  a.ogDescription || description, 200
);
      const image = /^https?:\/\//i.test(a.coverImage || '') ? a.coverImage : '';
      const published = new Date(a.publishedAt).toISOString();
      const schema = [
        { '@context': 'https://schema.org', '@type': 'Article', headline: cut(a.title, 110), description, ...(image ? { image: [image] } : {}), datePublished: published, dateModified: new Date(a.updatedAt || a.publishedAt).toISOString(), author: { '@type': 'Person', name: a.author || 'Zenzy Editorial' }, publisher: org(b), mainEntityOfPage: url, articleSection: a.category },
        { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: b + '/' },
          { '@type': 'ListItem', position: 2, name: 'The Zenzy Journal', item: b + '/blog' },
          { '@type': 'ListItem', position: 3, name: a.title, item: url }
                ] },
        ...((a.faqs || []).filter(f => f.q && f.a).length ? [{ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: (a.faqs || []).filter(f => f.q && f.a).map(f => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) }] : [])
      ];
      res.send(render({
  title,
  description,
  canonical,
  image,
  article: true,
  noindex: !!a.noIndex,
  ogTitle: socialTitle,
  ogDescription: socialDescription,
  schema
}));
    } catch (e) {
      console.error('SEO render error:', e.message);
      res.sendFile(path.join(frontDir, 'blog.html'));
    }
  });

  return router;
};
