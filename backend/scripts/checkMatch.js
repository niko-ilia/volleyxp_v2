// Скрипт checkMatch.js
// Проверяет конкретный матч по ID
// Usage: node backend/scripts/checkMatch.js <matchId>
require('dotenv').config({ path: __dirname + '/../.env' });
const mongoose = require('mongoose');
const Match = require('../models/Match');
const User = require('../models/User');

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error('MONGODB_URI не задан в .env');
  process.exit(1);
}

const matchId = process.argv[2];
if (!matchId) {
  console.error('Укажите matchId: node checkMatch.js <matchId>');
  process.exit(1);
}

(async () => {
  try {
    await mongoose.connect(uri);
    
    const match = await Match.findById(matchId).populate('creator', 'name email').populate('participants', 'name email');
    
    if (!match) {
      console.log(`Матч ${matchId} не найден`);
      process.exit(1);
    }
    
    console.log(`Матч: ${match.title} (${match._id})`);
    console.log(`Статус: ${match.status}`);
    console.log(`Приватный: ${match.isPrivate}`);
    console.log(`Дата: ${match.startDateTime}`);
    console.log(`Создатель: ${match.creator?.name} (${match.creator?.email})`);
    console.log(`Участников: ${match.participants.length}`);
    
    for (const participant of match.participants) {
      console.log(`  - ${participant.name} (${participant.email})`);
    }
    
    await mongoose.disconnect();
    process.exit(0);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
})(); 