const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const fs = require('fs');
const path = require('path');

async function restoreAllUsersFromExport() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb+srv://marswonder:dM1savncfQjtSZPY@cluster0.rjtkykh.mongodb.net/volley-match?retryWrites=true&w=majority&appName=Cluster0');
    
    // Путь к файлу экспорта (в корне проекта)
    const exportPath = path.join(__dirname, '../../users-export-2025-07-28.json');
    const exportData = JSON.parse(fs.readFileSync(exportPath, 'utf8'));
    
    console.log(`📋 Найдено ${exportData.length} пользователей в экспорте`);
    
    let restored = 0;
    let skipped = 0;
    
    for (const userData of exportData) {
      try {
        const existingUser = await User.findOne({ email: userData.email });
        if (existingUser) {
          console.log(`⏭️ Пропускаем ${userData.email} - уже существует`);
          skipped++;
          continue;
        }
        
        const hashedPassword = await bcrypt.hash('password123', 10);
        
        const user = new User({
          _id: new mongoose.Types.ObjectId(userData.id),
          name: userData.name,
          email: userData.email,
          password: hashedPassword,
          role: userData.role,
          rating: userData.rating,
          isBlocked: userData.isBlocked || false,
          emailConfirmed: true,
          ratingHistory: [],
          createdAt: new Date(userData.createdAt),
          lastLoginAt: userData.lastLoginAt ? new Date(userData.lastLoginAt) : new Date()
        });
        
        await user.save();
        console.log(`✅ Восстановлен: ${userData.email} (${userData.name}) - ${userData.role}`);
        restored++;
        
      } catch (error) {
        console.error(`❌ Ошибка восстановления ${userData.email}:`, error.message);
      }
    }
    
    console.log('\n📊 Итоги восстановления:');
    console.log(`✅ Восстановлено: ${restored} пользователей`);
    console.log(`⏭️ Пропущено: ${skipped} пользователей`);
    console.log(`📧 Пароль для всех: password123`);
    
    await mongoose.connection.close();
    
  } catch (error) {
    console.error('❌ Ошибка:', error);
  }
}

restoreAllUsersFromExport(); 