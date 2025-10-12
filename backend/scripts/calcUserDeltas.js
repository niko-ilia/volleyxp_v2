// Скрипт calcUserDeltas.js
// Пересчитывает дельты (delta) рейтинга для пользователей по истории матчей.
// Особенности:
// - Используется для аудита и восстановления корректных дельт.
// - Не меняет сам рейтинг, только дельты.
// Usage: node backend/scripts/calcUserDeltas.js
const mongoose = require('mongoose');
const User = require('../models/User');
const Match = require('../models/Match');
const Result = require('../models/Result');
require('dotenv').config();

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  const user = await User.findOne({ email: 'test5@test5.com' });
  if (!user) {
    console.log('User not found');
    process.exit(1);
  }
  const userId = user._id.toString();

  // Находим все результаты, где пользователь был в match.participants
  const results = await Result.find().populate('match');

  for (const result of results) {
    const match = result.match;
    if (!match) continue;
    const isParticipant = match.participants.map(id => id.toString()).includes(userId);
    if (!isParticipant) continue;
    // Индивидуальный подсчёт побед/ничьих/поражений по геймам
    let wins = 0, draws = 0, losses = 0, gamesPlayed = 0;
    for (const g of result.games) {
      const inTeam1 = g.team1.map(String).includes(userId);
      const inTeam2 = g.team2.map(String).includes(userId);
      if (inTeam1 || inTeam2) {
        gamesPlayed++;
        if (g.team1Score === g.team2Score) {
          draws++;
        } else if ((g.team1Score > g.team2Score && inTeam1) || (g.team2Score > g.team1Score && inTeam2)) {
          wins++;
        } else {
          losses++;
        }
      }
    }
    // Дельта рейтинга (как раньше, если играл хотя бы один гейм)
    let delta = 0;
    if (gamesPlayed > 0) {
      const team1Ids = [...new Set(result.games.flatMap(g => g.team1.map(p => p.toString())))];
      const team2Ids = [...new Set(result.games.flatMap(g => g.team2.map(p => p.toString())))];
      const team1Users = await User.find({ _id: { $in: team1Ids } });
      const team2Users = await User.find({ _id: { $in: team2Ids } });
      const avg1 = team1Users.reduce((sum, u) => sum + (u.rating || 2.0), 0) / team1Users.length;
      const avg2 = team2Users.reduce((sum, u) => sum + (u.rating || 2.0), 0) / team2Users.length;
      let team1Wins = 0, team2Wins = 0;
      for (const g of result.games) {
        if (g.team1Score > g.team2Score) team1Wins++;
        else if (g.team2Score > g.team1Score) team2Wins++;
      }
      const expected1 = 1 / (1 + Math.pow(10, avg2 - avg1));
      const expected2 = 1 / (1 + Math.pow(10, avg1 - avg2));
      const score1 = team1Wins > team2Wins ? 1 : 0;
      const score2 = team2Wins > team1Wins ? 1 : 0;
      if (team1Ids.includes(userId)) {
        delta = +(0.1 * (score1 - expected1)).toFixed(2);
      } else if (team2Ids.includes(userId)) {
        delta = +(0.1 * (score2 - expected2)).toFixed(2);
      }
    }
    // Выводим информацию по каждому матчу
    console.log('---');
    console.log(`Match: ${match._id} | ${match.title}`);
    console.log(`Date: ${match.startDateTime.toISOString().slice(0,10)}`);
    console.log(`User in participants: да, в геймах: ${gamesPlayed > 0 ? 'да' : 'нет'}, сыграно геймов: ${gamesPlayed}`);
    if (gamesPlayed > 0) {
      console.log(`Individual: wins=${wins}, draws=${draws}, losses=${losses}`);
      console.log(`Delta: ${delta}`);
    } else {
      console.log('Пользователь не участвовал ни в одном гейме. Delta: 0');
    }
  }
  await mongoose.disconnect();
})(); 