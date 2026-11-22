const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 254 },
  source: { type: String, default: 'journal', maxlength: 40 },
  status: { type: String, enum: ['active', 'unsubscribed'], default: 'active' }
}, { timestamps: true });
module.exports = mongoose.models.Subscriber || mongoose.model('Subscriber', schema);
