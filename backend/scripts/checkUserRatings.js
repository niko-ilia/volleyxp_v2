// Скрипт checkUserRatings.js
// Проверяет соответствие текущего рейтинга пользователя его истории ratingHistory.
// Особенности:
// - Находит и может исправить расхождения между rating и суммой дельт.
// - Используется для аудита и исправления ошибок.
// Usage: node backend/scripts/checkUserRatings.js
const mongoose = require('mongoose');
const User = require('../models/User');
const Result = require('../models/Result');
const Match = require('../models/Match');
const { updateRatingsAfterMatch } = require('../utils/rating');
require('dotenv').config();

async function recalcAllRatings() {
  await mongoose.connect(process.env.MONGODB_URI);
  const users = await User.find();
  // Сбросить рейтинг и историю всем пользователям
  for (const user of users) {
    user.rating = 2.0;
    user.ratingHistory = [];
    await user.save();
  }
  // Пересчитать все результаты по новой логике
  const results = await Result.find().populate('match');
  // Для отладки: логировать участие test5 в каждом матче
  const test5 = await User.findOne({ email: 'test5@test5.com' });
  const test5id = test5?._id?.toString();
  for (const result of results) {
    if (!result.match) continue;
    // Логируем участие test5
    let gamesWithTest5 = 0;
    for (const g of result.games) {
      const inTeam1 = g.team1.map(String).includes(test5id);
      const inTeam2 = g.team2.map(String).includes(test5id);
      if (inTeam1 || inTeam2) gamesWithTest5++;
    }
    if (gamesWithTest5 > 0) {
      console.log(`test5 участвует в матче ${result.match._id} (${result.match.title}): геймов с test5 = ${gamesWithTest5}`);
    }
    // --- стандартный пересчёт ---
    // Получаем всех участников матча
    const allParticipantUsers = await User.find({ _id: { $in: result.match.participants } });
    // Формируем команды для совместимости
    const firstGame = result.games[0];
    const team1 = allParticipantUsers.filter(u => firstGame.team1.map(String).includes(u._id.toString()));
    const team2 = allParticipantUsers.filter(u => firstGame.team2.map(String).includes(u._id.toString()));
    let team1Wins = 0, team2Wins = 0;
    for (const g of result.games) {
      if (g.team1Score > g.team2Score) team1Wins++;
      else if (g.team2Score > g.team1Score) team2Wins++;
    }
    await updateRatingsAfterMatch(team1, team2, team1Wins, team2Wins, result.match._id, result.games, allParticipantUsers);
  }
  await mongoose.disconnect();
  console.log('Рейтинги и история пересчитаны по новой индивидуальной логике!');
}

if (require.main === module) {
  recalcAllRatings();
} 