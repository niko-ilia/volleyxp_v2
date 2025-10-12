const mongoose = require('mongoose');

async function cleanupTestUsers() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb+srv://marswonder:dM1savncfQjtSZPY@cluster0.rjtkykh.mongodb.net/volley-match?retryWrites=true&w=majority&appName=Cluster0');
    
    const User = require('../models/User');
    
    // Находим всех тестовых пользователей
    const testUsers = await User.find({ isTestUser: true });
    console.log(`📋 Найдено ${testUsers.length} тестовых пользователей`);
    
    if (testUsers.length > 0) {
      console.log('📋 Список тестовых пользователей:');
      testUsers.forEach(user => {
        console.log(`  - ${user.email} (${user.name})`);
      });
      
      // Удаляем тестовых пользователей
      const result = await User.deleteMany({ isTestUser: true });
      console.log(`✅ Удалено ${result.deletedCount} тестовых пользователей`);
    } else {
      console.log('✅ Тестовых пользователей не найдено');
    }
    
    await mongoose.connection.close();
    
  } catch (error) {
    console.error('❌ Ошибка:', error);
  }
}

cleanupTestUsers(); 