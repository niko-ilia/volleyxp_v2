// Скрипт fillMissingHistory.js
// Дополняет пропущенные записи в ratingHistory пользователей на основе завершённых матчей.
// Особенности:
// - Не пересобирает всю историю, а только добавляет недостающие записи.
// - Используется для частичного восстановления истории.
// Usage: node backend/scripts/fillMissingHistory.js
// Заполняет пропущенные записи ratingHistory для пользователей по завершённым матчам без результата
const mongoose = require('mongoose');
const User = require('../models/User');
const Match = require('../models/Match');
const Result = require('../models/Result');
require('dotenv').config();

(async () => {
  await mongoose.connect(process.env.MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true });
  const now = new Date();
  // 1. Найти все матчи, у которых нет результата и дата уже прошла
  const allMatches = await Match.find({ startDateTime: { $lt: now } });
  const allResults = await Result.find({});
  const matchesWithResult = new Set(allResults.map(r => r.match.toString()));
  const matchesWithoutResult = allMatches.filter(m => !matchesWithResult.has(m._id.toString()));

  let totalAdded = 0;
  for (const match of matchesWithoutResult) {
    // 2. Для каждого участника проверить ratingHistory
    const users = await User.find({ _id: { $in: match.participants } });
    for (const user of users) {
      const already = user.ratingHistory.some(rh => rh.matchId?.toString() === match._id.toString());
      if (!already) {
        user.ratingHistory.push({
          date: new Date(),
          delta: 0,
          newRating: user.rating,
          matchId: match._id,
          comment: 'Матч без результата',
          details: []
        });
        user.markModified('ratingHistory');
        await user.save();
        totalAdded++;
        console.log(`Added missing history for user ${user.email} match ${match._id}`);
      }
    }
  }
  console.log(`Done. Added ${totalAdded} missing ratingHistory entries.`);
  await mongoose.disconnect();
})();

if (require.main === module) {
  const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/volleymatch';
  mongoose.connect(MONGODB_URI).then(async () => {
    const res = await Match.updateMany(
      { isPrivate: { $exists: false } },
      { $set: { isPrivate: false } }
    );
    console.log('Migrated matches:', res.modifiedCount);
    mongoose.disconnect();
  });
} 