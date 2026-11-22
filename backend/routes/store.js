const express = require('express');
const fs = require('fs');
const path = require('path');

const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const PAGES = {
  shop: { title: 'Shop All | Zenzy Collection', description: 'Shop considered everyday fashion for women, men and essentials at Zenzy Collection.' },
  collections: { title: 'Collections | Zenzy Collection', description: 'Explore the Zenzy women\u2019s, men\u2019s and essentials collections.' },
  'our-story': { title: 'Our Story | Zenzy Collection', description: 'Zenzy Collection is more than fashion. Learn about our approach to everyday personal style.' },
  'book-a-visit': { title: 'Book a Visit | Zenzy Collection', description: 'Book a store visit, a styling consultation or a bulk-order enquiry with the Zenzy team.' }
};

module.exports = function storeRouter(frontDir) {
  const router = express.Router();
  const base = req => (process.env.SITE_URL || (req.protocol + '://' + req.get('host'))).replace(/\/+$/, '');
  Object.entries(PAGES).forEach(([slug, m]) => {
    router.get('/' + slug, (req, res) => {
      const url = base(req) + '/' + slug;
      let html = fs.readFileSync(path.join(frontDir, 'index.html'), 'utf8');
      html = html.replace(/<title>[\s\S]*?<\/title>/i, '<title>' + esc(m.title) + '</title>')
        .replace(/<meta\s+name="description"[^>]*>/i, '<meta name="description" content="' + esc(m.description) + '">')
        .replace('</head>', [
          '<link rel="canonical" href="' + esc(url) + '">',
          '<meta property="og:site_name" content="Zenzy Collection">',
          '<meta property="og:type" content="website">',
          '<meta property="og:title" content="' + esc(m.title) + '">',
          '<meta property="og:description" content="' + esc(m.description) + '">',
          '<meta property="og:url" content="' + esc(url) + '">',
          '<meta name="twitter:card" content="summary">'
        ].join('\n') + '\n</head>');
      res.send(html);
    });
  });
  return router;
};
