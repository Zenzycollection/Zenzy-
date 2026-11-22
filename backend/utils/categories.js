const CATEGORIES = [
  { name: "Men's Fashion", slug: 'mens-fashion' },
  { name: "Women's Fashion", slug: 'womens-fashion' },
  { name: 'Fashion Trends', slug: 'fashion-trends' },
  { name: 'Streetwear', slug: 'streetwear' },
  { name: 'Style Guides', slug: 'style-guides' },
  { name: 'Shopping Guides', slug: 'shopping-guides' },
  { name: 'Fabric & Clothing Care', slug: 'fabric-clothing-care' },
  { name: 'Festive & Occasion Wear', slug: 'festive-occasion-wear' },
  { name: 'Fashion Inspiration', slug: 'fashion-inspiration' },
  { name: 'Lifestyle', slug: 'lifestyle' }
];
function resolveCategory(v) {
  const x = String(v || '').trim().toLowerCase();
  const m = CATEGORIES.find(c => c.slug === x || c.name.toLowerCase() === x);
  return m ? m.name : String(v || '').trim();
}
function readingTime(html) {
  const words = String(html || '').replace(/<[^>]*>/g, ' ').split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 200));
}
module.exports = { CATEGORIES, resolveCategory, readingTime };
