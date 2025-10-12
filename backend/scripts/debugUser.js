// Скрипт debugUser.js
// Детальная проверка конкретного пользователя
// Usage: node backend/scripts/debugUser.js <userId>
require('dotenv').config({ path: __dirname + '/../.env' });
const mongoose = require('mongoose');
const User = require('../models/User');
const Match = require('../models/Match');
const Result = require('../models/Result');

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error('MONGODB_URI не задан в .env');
  process.exit(1);
}

const userId = process.argv[2];
if (!userId) {
  console.error('Укажите userId: node debugUser.js <userId>');
  process.exit(1);
}

(async () => {
  try {
    await mongoose.connect(uri);
    
    // Находим пользователя
    const user = await User.findById(userId);
    if (!user) {
      console.log(`Пользователь ${userId} не найден`);
      process.exit(1);
    }
    
    console.log(`Пользователь: ${user.email} (${user._id})`);
    console.log(`Рейтинг: ${user.rating}`);
    console.log(`ratingHistory: ${user.ratingHistory.length} записей`);
    
    // Проверяем участие в матчах
    const allMatches = await Match.find({ participants: user._id });
    console.log(`\nУчастие в матчах (всего): ${allMatches.length}`);
    
    for (const match of allMatches) {
      console.log(`- ${match.title} (${match._id})`);
      console.log(`  Статус: ${match.status}`);
      console.log(`  Дата: ${match.startDateTime}`);
      console.log(`  Участников: ${match.participants.length}`);
    }
    
    // Проверяем завершённые матчи
    const finishedMatches = await Match.find({ 
      participants: user._id, 
      status: 'finished' 
    });
    console.log(`\nЗавершённые матчи: ${finishedMatches.length}`);
    
    for (const match of finishedMatches) {
      console.log(`- ${match.title} (${match._id})`);
      
      // Проверяем результат
      const result = await Result.findOne({ match: match._id });
      if (result) {
        console.log(`  Есть результат: ${result.games.length} геймов`);
      } else {
        console.log(`  Нет результата`);
      }
    }
    
    // Проверяем результаты
    const results = await Result.find().populate('match');
    const userResults = results.filter(r => 
      r.match && r.match.participants.some(p => p.toString() === user._id.toString())
    );
    console.log(`\nРезультаты матчей: ${userResults.length}`);
    
    for (const result of userResults) {
      console.log(`- ${result.match.title} (${result.match._id})`);
      console.log(`  Геймов: ${result.games.length}`);
    }
    
    await mongoose.disconnect();
    process.exit(0);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
})(); 