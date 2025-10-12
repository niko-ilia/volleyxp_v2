// Скрипт checkEmptyRatingHistory.js
// Находит пользователей с пустой ratingHistory
// Usage: node backend/scripts/checkEmptyRatingHistory.js
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
    let emptyUsers = [];
    
    for (const user of users) {
      if (!Array.isArray(user.ratingHistory) || user.ratingHistory.length === 0) {
        emptyUsers.push(user);
      }
    }
    
    if (emptyUsers.length === 0) {
      console.log('Все пользователи имеют ratingHistory');
    } else {
      console.log(`Найдено ${emptyUsers.length} пользователей с пустой ratingHistory:`);
      for (const user of emptyUsers) {
        console.log(`- ${user.email} (${user._id}) - рейтинг: ${user.rating}`);
      }
    }
    
    // Проверим, участвовал ли этот пользователь в матчах
    if (emptyUsers.length > 0) {
      console.log('\nПроверяем участие в матчах:');
      const matches = await Match.find({ status: 'finished' });
      for (const user of emptyUsers) {
        const participatedMatches = matches.filter(match => 
          match.participants.some(p => p.toString() === user._id.toString())
        );
        console.log(`${user.email}: участвовал в ${participatedMatches.length} завершённых матчах`);
        for (const match of participatedMatches) {
          console.log(`  - ${match.title} (${match._id})`);
        }
      }
    }
    
    await mongoose.disconnect();
    process.exit(0);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
})(); 