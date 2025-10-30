const mongoose = require('mongoose');

// Снимок рейтинга игрока при вступлении в матч
const joinSnapshotSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  rating: { type: Number, required: true },
  joinedAt: { type: Date, default: Date.now }
}, { _id: false });

const matchSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String },
  place: { type: String, required: true },
  courtId: { type: mongoose.Schema.Types.ObjectId, ref: 'Court' },
  level: { type: String, required: true },
  startDateTime: { type: Date, required: true },
  duration: { type: Number, required: true }, // в минутах
  creator: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  participants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  maxParticipants: { type: Number, required: true, default: 6 },
  isPrivate: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  status: { type: String, enum: ['upcoming', 'finished', 'cancelled'], default: 'upcoming' },
  // Тип события: обычный матч или тренировка с тренером
  type: { type: String, enum: ['match', 'training'], default: 'match' },
  coach: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // если type = training
  // Новое поле: снимки рейтинга на момент входа
  joinSnapshots: [joinSnapshotSchema]
});

// Индексы
matchSchema.index({ startDateTime: 1 });
matchSchema.index({ isPrivate: 1 });
matchSchema.index({ type: 1 });
matchSchema.index({ participants: 1 });
matchSchema.index({ creator: 1 });
matchSchema.index({ status: 1 });
matchSchema.index({ place: 1 });
matchSchema.index({ courtId: 1 });
matchSchema.index({ level: 1 });
matchSchema.index({ isPrivate: 1, startDateTime: 1 });

module.exports = mongoose.model('Match', matchSchema);