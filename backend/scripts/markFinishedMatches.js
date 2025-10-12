// Скрипт markFinishedMatches.js
// Помечает матчи как завершённые по определённым условиям (например, по дате или статусу).
// Особенности:
// - Меняет статус матчей в базе.
// - Используется для массового обновления статусов.
// Usage: node backend/scripts/markFinishedMatches.js
const mongoose = require('mongoose');
const Match = require('../models/Match');
const Result = require('../models/Result');

(async () => {
  await mongoose.connect(process.env.MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true });
  const now = new Date();
  const matches = await Match.find({ status: 'upcoming' });
  let updated = 0;
  for (const match of matches) {
    const end = new Date(match.startDateTime.getTime() + match.duration * 60000);
    if (end < now) {
      const hasResult = await Result.findOne({ match: match._id });
      if (!hasResult) {
        match.status = 'finished';
        await match.save();
        updated++;
        console.log(`Marked match ${match._id} as finished`);
      }
    }
  }
  console.log(`Done. Updated ${updated} matches.`);
  await mongoose.disconnect();
})(); 