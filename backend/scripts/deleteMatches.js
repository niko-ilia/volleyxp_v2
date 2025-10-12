// Скрипт deleteMatches.js
// Удаляет матч по matchId и все связанные с ним данные (результаты, ссылки в users и т.д.).
// Особенности:
// - Безопасно удаляет все связанные сущности.
// - Используется для ручного удаления матчей из базы.
// Usage: node backend/scripts/deleteMatches.js <id1> <id2> ...
require('dotenv').config({ path: __dirname + '/../.env' });
const mongoose = require('mongoose');
const Match = require('../models/Match');
const Result = require('../models/Result');
const User = require('../models/User');

const ids = process.argv.slice(2);
if (!ids.length) {
  console.error('Укажите хотя бы один id матча для удаления.');
  process.exit(1);
}

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error('MONGODB_URI не задан в .env');
  process.exit(1);
}

(async () => {
  try {
    await mongoose.connect(uri, { useNewUrlParser: true, useUnifiedTopology: true });
    for (const id of ids) {
      const match = await Match.findById(id);
      if (!match) {
        console.log(`Матч ${id} не найден.`);
        continue;
      }
      // Удаляем связанные результаты
      const resResult = await Result.deleteMany({ match: id });
      // Чистим ratingHistory у всех участников
      const users = await User.find({ _id: { $in: match.participants } });
      for (const user of users) {
        user.ratingHistory = user.ratingHistory.filter(rh => rh.matchId?.toString() !== id);
        user.markModified('ratingHistory');
        await user.save();
      }
      // Удаляем сам матч
      await Match.findByIdAndDelete(id);
      console.log(`Матч ${id} и связанные данные удалены. (Результатов: ${resResult.deletedCount})`);
    }
    await mongoose.disconnect();
    process.exit(0);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
})(); 