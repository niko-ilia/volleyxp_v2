// Скрипт removeDuplicateRatingHistory.js
// Удаляет дублирующиеся записи ratingHistory у пользователей: для каждого matchId оставляет только одну (самую позднюю по дате) запись.
// Особенности:
// - Работает для всех пользователей в базе.
// - Оставляет только одну запись на матч (по matchId), остальные удаляет.
// - Безопасен: не трогает пользователей без дублей.
// Usage: node backend/scripts/removeDuplicateRatingHistory.js
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
    let changed = 0;
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
      // Оставляем только одну запись на matchId (самую позднюю по дате)
      const newHistory = [];
      for (const arr of Object.values(byMatch)) {
        if (arr.length === 1) {
          newHistory.push(arr[0]);
        } else {
          const sorted = arr.sort((a, b) => new Date(b.date) - new Date(a.date));
          newHistory.push(sorted[0]);
        }
      }
      if (newHistory.length < user.ratingHistory.length) {
        user.ratingHistory = newHistory;
        await user.save();
        changed++;
      }
    }
    console.log(`Removed duplicates for ${changed} users.`);
    await mongoose.disconnect();
    process.exit(0);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
})(); 