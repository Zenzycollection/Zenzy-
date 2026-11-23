const mongoose = require('mongoose');

// One row per article per day, so analytics stay small and fast.
const schema = new mongoose.Schema({
  article: { type: mongoose.Schema.Types.ObjectId, ref: 'Article', required: true },
  day: { type: Date, required: true },
  category: { type: String, default: '', maxlength: 60 },
  views: { type: Number, default: 0 }
}, { timestamps: true });

schema.index({ article: 1, day: 1 }, { unique: true });
schema.index({ day: 1 });

module.exports = mongoose.models.ArticleView || mongoose.model('ArticleView', schema);
