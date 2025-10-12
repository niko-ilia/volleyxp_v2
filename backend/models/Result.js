const mongoose = require('mongoose');

const gameSchema = new mongoose.Schema({
  team1: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  team2: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  team1Score: { type: Number, required: true },
  team2Score: { type: Number, required: true },
}, { _id: false });

const resultSchema = new mongoose.Schema({
  match: { type: mongoose.Schema.Types.ObjectId, ref: 'Match', required: true },
  games: [gameSchema],
  isConfirmed: { type: Boolean, default: false },
  confirmedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  confirmedAt: { type: Date },
  createdAt: { type: Date, default: Date.now },
});

// Индексы для оптимизации производительности
resultSchema.index({ match: 1 }); // Поиск результата по матчу (уникальный)
resultSchema.index({ confirmedBy: 1 }); // Поиск результатов подтвержденных пользователем
resultSchema.index({ isConfirmed: 1 });
resultSchema.index({ createdAt: -1 }); // Сортировка по дате создания

module.exports = mongoose.model('Result', resultSchema); 