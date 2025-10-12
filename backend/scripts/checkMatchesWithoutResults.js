// Скрипт checkMatchesWithoutResults.js
// Находит завершённые матчи без результатов
// Usage: node backend/scripts/checkMatchesWithoutResults.js
require('dotenv').config({ path: __dirname + '/../.env' });
const mongoose = require('mongoose');
const Match = require('../models/Match');
const Result = require('../models/Result');

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error('MONGODB_URI не задан в .env');
  process.exit(1);
}

(async () => {
  try {
    await mongoose.connect(uri);
    const finishedMatches = await Match.find({ status: 'finished' });
    const results = await Result.find();
    const matchesWithResults = new Set(results.map(r => r.match.toString()));
    
    const matchesWithoutResults = finishedMatches.filter(match => 
      !matchesWithResults.has(match._id.toString())
    );
    
    console.log(`Всего завершённых матчей: ${finishedMatches.length}`);
    console.log(`Матчей с результатами: ${results.length}`);
    console.log(`Матчей без результатов: ${matchesWithoutResults.length}`);
    
    if (matchesWithoutResults.length > 0) {
      console.log('\nМатчи без результатов:');
      for (const match of matchesWithoutResults) {
        console.log(`- ${match.title} (${match._id}) - участников: ${match.participants.length}`);
      }
    }
    
    await mongoose.disconnect();
    process.exit(0);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
})(); 