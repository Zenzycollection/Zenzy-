const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  id: { type: String, required: true, unique: true, maxlength: 40 },
  name: { type: String, required: true, trim: true, maxlength: 120 },
  category: { type: String, required: true, enum: ['Women', 'Men', 'Essentials'] },
  price: { type: Number, required: true, min: 1 },
  mrp: { type: Number, default: 0 },
  badge: { type: String, default: '', maxlength: 24 },
  image: { type: String, required: true, maxlength: 600 },
  sizes: { type: [String], default: ['Free Size'] },
  description: { type: String, default: '', maxlength: 1000 },
  fabric: { type: String, default: '', maxlength: 120 },
  color: { type: String, default: '', maxlength: 120 },
  fit: { type: String, default: '', maxlength: 120 },
  care: { type: String, default: '', maxlength: 200 },
  inStock: { type: Boolean, default: true },
  active: { type: Boolean, default: true },
  sortOrder: { type: Number, default: 0 }
}, { timestamps: true });

schema.index({ active: 1, sortOrder: 1, createdAt: -1 });

module.exports = mongoose.models.Product || mongoose.model('Product', schema);
