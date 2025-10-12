const mongoose = require('mongoose');

const courtReservationSchema = new mongoose.Schema({
  courtId: { type: mongoose.Schema.Types.ObjectId, ref: 'Court', required: true, index: true },
  startDateTime: { type: Date, required: true, index: true },
  endDateTime: { type: Date, required: true, index: true },
  reservedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, // кто создал
  forUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // для какого аккаунта
  note: { type: String },
  createdAt: { type: Date, default: Date.now }
});

courtReservationSchema.index({ courtId: 1, startDateTime: 1, endDateTime: 1 });

module.exports = mongoose.model('CourtReservation', courtReservationSchema);


