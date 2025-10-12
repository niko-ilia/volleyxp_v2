const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

async function updateUserIdsInMatches() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb+srv://marswonder:dM1savncfQjtSZPY@cluster0.rjtkykh.mongodb.net/volley-match?retryWrites=true&w=majority&appName=Cluster0');
    
    // Загружаем экспорт для получения правильных ID
    const exportPath = path.join(__dirname, '../../users-export-2025-07-28.json');
    const exportData = JSON.parse(fs.readFileSync(exportPath, 'utf8'));
    
    console.log(`📋 Обрабатываем ${exportData.length} пользователей из экспорта`);
    
    let matchesUpdated = 0;
    let resultsUpdated = 0;
    
    for (const userData of exportData) {
      try {
        // Находим пользователя в базе по email
        const user = await mongoose.connection.db.collection('users').findOne({ email: userData.email });
        if (!user) {
          console.log(`⏭️ Пропускаем ${userData.email} - не найден в базе`);
          continue;
        }
        
        const oldId = userData.id; // ID из экспорта
        const newId = user._id.toString(); // Текущий ID в базе
        
        if (oldId === newId) {
          console.log(`✅ ${userData.email} - ID уже правильный`);
          continue;
        }
        
        console.log(`🔄 Обновляем ${userData.email}: ${oldId} → ${newId}`);
        
        // Обновляем матчи
        const matchResult = await mongoose.connection.db.collection('matches').updateMany(
          { participants: new mongoose.Types.ObjectId(oldId) },
          { $set: { 'participants.$': new mongoose.Types.ObjectId(newId) } }
        );
        
        if (matchResult.modifiedCount > 0) {
          console.log(`  📊 Матчи: обновлено ${matchResult.modifiedCount}`);
          matchesUpdated += matchResult.modifiedCount;
        }
        
        // Обновляем результаты (team1)
        const result1Result = await mongoose.connection.db.collection('results').updateMany(
          { 'games.team1': new mongoose.Types.ObjectId(oldId) },
          { $set: { 'games.$[].team1.$': new mongoose.Types.ObjectId(newId) } }
        );
        
        if (result1Result.modifiedCount > 0) {
          console.log(`  📊 Результаты team1: обновлено ${result1Result.modifiedCount}`);
          resultsUpdated += result1Result.modifiedCount;
        }
        
        // Обновляем результаты (team2)
        const result2Result = await mongoose.connection.db.collection('results').updateMany(
          { 'games.team2': new mongoose.Types.ObjectId(oldId) },
          { $set: { 'games.$[].team2.$': new mongoose.Types.ObjectId(newId) } }
        );
        
        if (result2Result.modifiedCount > 0) {
          console.log(`  📊 Результаты team2: обновлено ${result2Result.modifiedCount}`);
          resultsUpdated += result2Result.modifiedCount;
        }
        
        // Обновляем confirmedBy
        const confirmedResult = await mongoose.connection.db.collection('results').updateMany(
          { confirmedBy: new mongoose.Types.ObjectId(oldId) },
          { $set: { confirmedBy: new mongoose.Types.ObjectId(newId) } }
        );
        
        if (confirmedResult.modifiedCount > 0) {
          console.log(`  📊 Подтверждения: обновлено ${confirmedResult.modifiedCount}`);
          resultsUpdated += confirmedResult.modifiedCount;
        }
        
      } catch (error) {
        console.error(`❌ Ошибка обновления ${userData.email}:`, error.message);
      }
    }
    
    console.log('\n📊 Итоги обновления:');
    console.log(`✅ Матчи обновлены: ${matchesUpdated}`);
    console.log(`✅ Результаты обновлены: ${resultsUpdated}`);
    
    await mongoose.connection.close();
    
  } catch (error) {
    console.error('❌ Ошибка:', error);
  }
}

updateUserIdsInMatches(); 