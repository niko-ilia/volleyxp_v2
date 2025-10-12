const mongoose = require('mongoose');

const courtBlockSchema = new mongoose.Schema({
  courtId: { type: mongoose.Schema.Types.ObjectId, ref: 'Court', required: true, index: true },
  startDateTime: { type: Date, required: true, index: true },
  endDateTime: { type: Date, required: true, index: true },
  reason: { type: String },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  createdAt: { type: Date, default: Date.now }
});

courtBlockSchema.index({ courtId: 1, startDateTime: 1, endDateTime: 1 });

module.exports = mongoose.model('CourtBlock', courtBlockSchema);


