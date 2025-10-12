// Скрипт checkUserAllMatches.js
// Проверяет все матчи пользователя (включая незавершённые)
// Usage: node backend/scripts/checkUserAllMatches.js <userId>
require('dotenv').config({ path: __dirname + '/../.env' });
const mongoose = require('mongoose');
const User = require('../models/User');
const Match = require('../models/Match');

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error('MONGODB_URI не задан в .env');
  process.exit(1);
}

const userId = process.argv[2];
if (!userId) {
  console.error('Укажите userId: node checkUserAllMatches.js <userId>');
  process.exit(1);
}

(async () => {
  try {
    await mongoose.connect(uri);
    
    const user = await User.findById(userId);
    if (!user) {
      console.log(`Пользователь ${userId} не найден`);
      process.exit(1);
    }
    
    console.log(`Пользователь: ${user.email} (${user._id})`);
    
    // Проверяем все матчи, где пользователь мог участвовать
    const allMatches = await Match.find({ participants: user._id });
    console.log(`\nВсе матчи с участием: ${allMatches.length}`);
    
    for (const match of allMatches) {
      console.log(`- ${match.title} (${match._id})`);
      console.log(`  Статус: ${match.status}`);
      console.log(`  Дата: ${match.startDateTime}`);
      console.log(`  Участников: ${match.participants.length}`);
      console.log(`  Создатель: ${match.creator}`);
    }
    
    // Проверяем матчи, созданные пользователем
    const createdMatches = await Match.find({ creator: user._id });
    console.log(`\nСозданные матчи: ${createdMatches.length}`);
    
    for (const match of createdMatches) {
      console.log(`- ${match.title} (${match._id})`);
      console.log(`  Статус: ${match.status}`);
      console.log(`  Дата: ${match.startDateTime}`);
      console.log(`  Участников: ${match.participants.length}`);
    }
    
    // Проверяем все матчи в системе
    const totalMatches = await Match.countDocuments();
    console.log(`\nВсего матчей в системе: ${totalMatches}`);
    
    await mongoose.disconnect();
    process.exit(0);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
})(); 