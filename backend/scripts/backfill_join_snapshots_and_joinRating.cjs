#!/usr/bin/env node
// Одноразовый бэкфилл:
// 1) Для всех матчей заполняет match.joinSnapshots из текущих участников (если снимков нет)
//    snapshot.rating = текущий рейтинг пользователя на момент запуска (лучше, чем ничего).
// 2) Для всех пользователей добавляет joinRating в ratingHistory записи с matchId,
//    где joinRating отсутствует — ставим newRating (если есть) или текущий rating пользователя.
//
// Usage: node backend/scripts/backfill_join_snapshots_and_joinRating.cjs

require('dotenv').config({ path: __dirname + '/../.env' });
const mongoose = require('mongoose');
const Match = require('../models/Match');
const User = require('../models/User');

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error('MONGODB_URI не задан в .env');
  process.exit(1);
}

(async () => {
  try {
    await mongoose.connect(uri, { useNewUrlParser: true, useUnifiedTopology: true });

    let updatedSnapshots = 0;
    let updatedJoinRatings = 0;

    // 1) Бэкфилл joinSnapshots
    const matches = await Match.find({}, { participants: 1, joinSnapshots: 1 });
    const usersById = new Map((await User.find({}, { rating: 1 })).map(u => [u._id.toString(), u]));

    for (const m of matches) {
      const existing = Array.isArray(m.joinSnapshots) ? m.joinSnapshots.map(s => s.userId.toString()) : [];
      const toAdd = (m.participants || []).filter(p => !existing.includes(p.toString()));
      if (toAdd.length === 0) continue;
      m.joinSnapshots = m.joinSnapshots || [];
      for (const uid of toAdd) {
        const u = usersById.get(uid.toString());
        const rating = u?.rating ?? 2.0;
        m.joinSnapshots.push({ userId: uid, rating, joinedAt: new Date() });
        updatedSnapshots++;
      }
      await m.save();
    }

    // 2) Бэкфилл joinRating в user.ratingHistory
    const users = await User.find({}, { rating: 1, ratingHistory: 1 });
    for (const u of users) {
      let changed = false;
      if (Array.isArray(u.ratingHistory)) {
        for (const rec of u.ratingHistory) {
          if (rec && rec.matchId && typeof rec.joinRating !== 'number') {
            rec.joinRating = typeof rec.newRating === 'number' ? rec.newRating : u.rating;
            changed = true;
            updatedJoinRatings++;
          }
        }
      }
      if (changed) {
        u.markModified('ratingHistory');
        await u.save();
      }
    }

    console.log(`Backfill done: joinSnapshots+=${updatedSnapshots}, joinRating fixed=${updatedJoinRatings}`);
    await mongoose.disconnect();
    process.exit(0);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
})();


