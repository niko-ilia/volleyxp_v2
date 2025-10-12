// Скрипт rebuildUserRatingHistory.js
// Полностью пересобирает ratingHistory для всех пользователей на основе завершённых матчей и их результатов.
// Особенности:
// - Сбрасывает рейтинг всех пользователей к 2.0.
// - Очищает старую историю, пересчитывает рейтинги и историю с нуля.
// - Для каждого матча вызывает честный пересчёт рейтинга (updateRatingsAfterMatch).
// - Для матчей без результатов добавляет записи с delta=0.
// Usage: node backend/scripts/rebuildUserRatingHistory.js
require('dotenv').config({ path: __dirname + '/../.env' });
const mongoose = require('mongoose');
const User = require('../models/User');
const Match = require('../models/Match');
const Result = require('../models/Result');
const { updateRatingsAfterMatch } = require('../utils/rating');

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error('MONGODB_URI не задан в .env');
  process.exit(1);
}

(async () => {
  try {
    await mongoose.connect(uri, { useNewUrlParser: true, useUnifiedTopology: true });
    
    // Сбрасываем рейтинг всех пользователей к 2.0
    const users = await User.find();
    for (const user of users) {
      user.rating = 2.0;
      user.ratingHistory = [];
      await user.save();
      console.log(`User ${user.email || user._id}: rating reset to 2.0`);
    }
    
    // Получаем все завершённые матчи
    const matches = await Match.find({ status: 'finished' });
    let count = 0;
    for (const match of matches) {
      // Получаем результат матча
      const result = await Result.findOne({ match: match._id });
      
      if (result) {
        // Матч с результатом - пересчитываем рейтинг
        const allParticipantUsers = await User.find({ _id: { $in: match.participants } });
        const team1Ids = [...new Set(result.games.flatMap(g => g.team1.map(p => typeof p === 'string' ? p : p._id || p.id)))];
        const team2Ids = [...new Set(result.games.flatMap(g => g.team2.map(p => typeof p === 'string' ? p : p._id || p.id)))];
        const team1Users = await User.find({ _id: { $in: team1Ids } });
        const team2Users = await User.find({ _id: { $in: team2Ids } });
        
        let team1Wins = 0, team2Wins = 0;
        result.games.forEach(g => {
          if (g.team1Score > g.team2Score) team1Wins++;
          else if (g.team2Score > g.team1Score) team2Wins++;
        });
        
        // Очищаем записи для этого матча у всех участников перед добавлением новых
        for (const user of allParticipantUsers) {
          user.ratingHistory = user.ratingHistory.filter(rh => rh.matchId?.toString() !== match._id.toString());
          await user.save();
        }
        
        await updateRatingsAfterMatch(team1Users, team2Users, team1Wins, team2Wins, match._id, result.games, allParticipantUsers);
        count += allParticipantUsers.length;
      } else {
        // Матч без результата - добавляем записи с delta=0
        const allParticipantUsers = await User.find({ _id: { $in: match.participants } });
        for (const user of allParticipantUsers) {
          user.ratingHistory.push({
            date: new Date(match.startDateTime),
            delta: 0,
            newRating: user.rating,
            matchId: match._id,
            comment: 'Матч без результата',
            details: []
          });
          await user.save();
        }
        count += allParticipantUsers.length;
      }
    }
    await mongoose.disconnect();
    console.log(`Rebuilt ratingHistory for ${count} participations.`);
    process.exit(0);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
})(); 