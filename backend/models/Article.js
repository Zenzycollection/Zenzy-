const mongoose = require('mongoose');
const faqSchema = new mongoose.Schema({ q: { type: String, trim: true, maxlength: 300 }, a: { type: String, trim: true, maxlength: 3000 } }, { _id: false });
const schema = new mongoose.Schema({
  title: { type: String, required: true, trim: true, maxlength: 180 },
  slug: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 180 },
  excerpt: { type: String, default: '', maxlength: 500 }, content: { type: String, default: '' },
  category: { type: String, default: 'Style', trim: true, maxlength: 60 }, tags: [{ type: String, trim: true, maxlength: 40 }],
  author: { type: String, default: 'Zenzy Editorial', maxlength: 80 },
  coverImage: { type: String, default: '' }, coverImageAlt: { type: String, default: '' },
  seoTitle: { type: String, default: '', maxlength: 70 }, metaDescription: { type: String, default: '', maxlength: 180 },
  focusKeyword: { type: String, default: '', maxlength: 100 }, canonicalUrl: { type: String, default: '' },
  faqs: [faqSchema], featured: { type: Boolean, default: false },
  status: { type: String, enum: ['draft', 'published'], default: 'draft', index: true },
  publishedAt: { type: Date, default: null }, views: { type: Number, default: 0 }
}, { timestamps: true });
schema.index({ status: 1, publishedAt: -1 });
schema.index({ title: 'text', excerpt: 'text', tags: 'text' });
module.exports = mongoose.models.Article || mongoose.model('Article', schema);
