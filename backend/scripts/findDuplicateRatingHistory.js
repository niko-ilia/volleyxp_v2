// Скрипт findDuplicateRatingHistory.js
// Находит пользователей с дублями записей ratingHistory по одному matchId.
// Особенности:
// - Выводит userId, email, matchId и все дублирующиеся записи.
// - Не изменяет данные в базе, только выводит информацию.
// Usage: node backend/scripts/findDuplicateRatingHistory.js
require('dotenv').config({ path: __dirname + '/../.env' });
const mongoose = require('mongoose');
const User = require('../models/User');

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error('MONGODB_URI не задан в .env');
  process.exit(1);
}

(async () => {
  try {
    await mongoose.connect(uri);
    const users = await User.find();
    let found = false;
    for (const user of users) {
      if (!Array.isArray(user.ratingHistory) || user.ratingHistory.length < 2) continue;
      // Группируем по matchId
      const byMatch = {};
      for (const rh of user.ratingHistory) {
        const mId = rh.matchId?.toString();
        if (!mId) continue;
        if (!byMatch[mId]) byMatch[mId] = [];
        byMatch[mId].push(rh);
      }
      // Ищем дубли
      const dups = Object.entries(byMatch).filter(([_, arr]) => arr.length > 1);
      if (dups.length > 0) {
        found = true;
        console.log(`User: ${user._id} (${user.email || '-'})`);
        for (const [matchId, arr] of dups) {
          console.log(`  matchId: ${matchId}, count: ${arr.length}`);
          arr.forEach((rh, i) => {
            console.log(`    [${i}] date: ${rh.date}, delta: ${rh.delta}, newRating: ${rh.newRating}, comment: ${rh.comment}`);
          });
        }
      }
    }
    if (!found) console.log('No duplicates found.');
    await mongoose.disconnect();
    process.exit(0);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
})(); 