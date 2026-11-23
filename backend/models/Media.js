const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  url: { type: String, required: true, unique: true, maxlength: 600 },
  publicId: { type: String, default: '', maxlength: 300 },
  alt: { type: String, default: '', trim: true, maxlength: 200 },
  originalName: { type: String, default: '', maxlength: 200 },
  mimeType: { type: String, default: '', maxlength: 60 },
  width: { type: Number, default: 0 },
  height: { type: Number, default: 0 },
  bytes: { type: Number, default: 0 }
}, { timestamps: true });

schema.index({ createdAt: -1 });

module.exports = mongoose.models.Media || mongoose.model('Media', schema);
