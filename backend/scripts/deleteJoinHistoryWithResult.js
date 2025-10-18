// Скрипт deleteJoinHistoryWithResult.js
// Deletes join-records ("Match without result") for all users and matches where both join and final records exist.
// Usage: node backend/scripts/deleteJoinHistoryWithResult.js
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
      let userChanged = false;
      for (const [matchId, arr] of Object.entries(byMatch)) {
        const hasJoin = arr.some(rh => rh.comment?.includes('Match without result'));
        const hasResult = arr.some(rh => rh.comment?.includes('Индивидуальный расчёт'));
        if (hasJoin && hasResult) {
          const before = user.ratingHistory.length;
          user.ratingHistory = user.ratingHistory.filter(
            rh => !(rh.matchId?.toString() === matchId && rh.comment?.includes('Match without result'))
          );
          if (user.ratingHistory.length < before) {
            userChanged = true;
            console.log(`Удалил join-запись для user ${user.email} (${user._id}), match ${matchId}`);
          }
        }
      }
      if (userChanged) {
        await user.save();
        changed++;
      }
    }
    console.log(`Готово. Изменено пользователей: ${changed}`);
    await mongoose.disconnect();
    process.exit(0);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
})(); 