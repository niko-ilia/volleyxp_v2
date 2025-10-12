const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

async function testUserCreation() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb+srv://marswonder:dM1savncfQjtSZPY@cluster0.rjtkykh.mongodb.net/volley-match?retryWrites=true&w=majority&appName=Cluster0');
    
    const User = require('../models/User');
    
    console.log('🔧 Текущий NODE_ENV:', process.env.NODE_ENV);
    
    // Тест 1: Создание пользователя без NODE_ENV (продакшн)
    console.log('\n📋 Тест 1: Создание пользователя в продакшн режиме');
    const hashedPassword = await bcrypt.hash('password123', 10);
    
    const prodUser = new User({
      email: 'test-prod@example.com',
      name: 'Test Prod User',
      password: hashedPassword,
      emailConfirmed: false,
      isTestUser: process.env.NODE_ENV === 'test'
    });
    
    await prodUser.save();
    console.log('✅ Пользователь создан в продакшн режиме:');
    console.log('  Email:', prodUser.email);
    console.log('  isTestUser:', prodUser.isTestUser);
    
    // Тест 2: Создание пользователя с NODE_ENV=test
    console.log('\n📋 Тест 2: Создание пользователя в тестовом режиме');
    process.env.NODE_ENV = 'test';
    
    const testUser = new User({
      email: 'test-test@example.com',
      name: 'Test Test User',
      password: hashedPassword,
      emailConfirmed: false,
      isTestUser: process.env.NODE_ENV === 'test'
    });
    
    await testUser.save();
    console.log('✅ Пользователь создан в тестовом режиме:');
    console.log('  Email:', testUser.email);
    console.log('  isTestUser:', testUser.isTestUser);
    
    // Проверяем всех пользователей
    console.log('\n📊 Все пользователи в базе:');
    const allUsers = await User.find({}, {email: 1, isTestUser: 1, name: 1});
    allUsers.forEach(user => {
      console.log(`  - ${user.email} (${user.name}): isTestUser = ${user.isTestUser}`);
    });
    
    // Очищаем тестовых пользователей
    console.log('\n🧹 Очистка тестовых пользователей...');
    const deleteResult = await User.deleteMany({isTestUser: true});
    console.log(`✅ Удалено ${deleteResult.deletedCount} тестовых пользователей`);
    
    await mongoose.connection.close();
    
  } catch (error) {
    console.error('❌ Ошибка:', error);
  }
}

testUserCreation(); 