// Скрипт findJoinHistoryWithResult.js
// Находит все матчи, где у пользователя есть и join-запись, и итоговая запись в ratingHistory.
// Usage: node backend/scripts/findJoinHistoryWithResult.js
require('dotenv').config({ path: __dirname + '/../.env' });
const mongoose = require('mongoose');
const User = require('../models/User');
const Match = require('../models/Match');

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error('MONGODB_URI не задан в .env');
  process.exit(1);
}

(async () => {
  try {
    await mongoose.connect(uri);
    const users = await User.find();
    let found = [];
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
      for (const [matchId, arr] of Object.entries(byMatch)) {
        const hasJoin = arr.some(rh => rh.comment?.includes('Match without result'));
        const hasResult = arr.some(rh => rh.comment?.includes('Индивидуальный расчёт'));
        if (hasJoin && hasResult) {
          found.push({ user, matchId, arr });
        }
      }
    }
    if (found.length === 0) {
      console.log('Нет матчей с join-записью и итоговой записью.');
      await mongoose.disconnect();
      process.exit(0);
    }
    // Получаем инфу о матчах
    const matchIds = [...new Set(found.map(f => f.matchId))];
    const matches = await Match.find({ _id: { $in: matchIds } });
    for (const f of found) {
      const match = matches.find(m => m._id.toString() === f.matchId);
      console.log('---');
      console.log(`User: ${f.user.email} (${f.user._id})`);
      console.log(`Match: ${f.matchId} | ${match ? match.title : 'нет названия'} | ${match ? match.startDateTime : ''}`);
      for (const rh of f.arr) {
        if (rh.matchId?.toString() !== f.matchId) continue;
        console.log(`  [${rh.date}] ${rh.comment} | delta: ${rh.delta} | newRating: ${rh.newRating}`);
      }
    }
    await mongoose.disconnect();
    process.exit(0);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
})(); 