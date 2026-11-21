const mongoose = require('mongoose');
const { randomBytes } = require('crypto');
const schema = new mongoose.Schema({
  reference: { type: String, unique: true, index: true, default: () => 'ZNB-' + randomBytes(4).toString('hex').toUpperCase() },
  customerName: { type: String, required: true, trim: true, maxlength: 100 },
  email: { type: String, required: true, trim: true, lowercase: true, maxlength: 160 },
  phone: { type: String, required: true, trim: true, maxlength: 20 },
  bookingType: { type: String, enum: ['store-visit', 'style-consultation', 'bulk-order', 'other'], default: 'store-visit' },
  preferredDate: { type: Date, default: null }, preferredTime: { type: String, default: '', maxlength: 30 },
  message: { type: String, default: '', maxlength: 1500 },
  status: { type: String, enum: ['NEW', 'CONTACTED', 'CONFIRMED', 'COMPLETED', 'CANCELLED'], default: 'NEW', index: true },
  adminNote: { type: String, default: '', maxlength: 1000 }
}, { timestamps: true });
schema.index({ createdAt: -1 });
module.exports = mongoose.models.Booking || mongoose.model('Booking', schema);
