const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

async function forceRefreshUser() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb+srv://marswonder:dM1savncfQjtSZPY@cluster0.rjtkykh.mongodb.net/volley-match?retryWrites=true&w=majority&appName=Cluster0');
    
    const User = require('../models/User');
    
    // Находим пользователя
    const user = await User.findOne({ email: 'nikolenko.ilya@gmail.com' });
    if (!user) {
      console.log('❌ Пользователь не найден');
      return;
    }
    
    console.log('📋 Текущие данные пользователя:');
    console.log('ID:', user._id);
    console.log('Email:', user.email);
    console.log('Name:', user.name);
    console.log('Role:', user.role);
    console.log('Rating:', user.rating);
    
    // Создаем новый токен
    const token = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '7d' }
    );
    
    console.log('\n🔑 Новый токен создан');
    console.log('Token:', token);
    
    console.log('\n💡 Для обновления данных в браузере:');
    console.log('1. Откройте DevTools (F12)');
    console.log('2. Перейдите в Console');
    console.log('3. Выполните команды:');
    console.log('   localStorage.setItem("volley_token", "' + token + '");');
    console.log('   localStorage.removeItem("volley_user");');
    console.log('4. Обновите страницу (F5)');
    
    await mongoose.connection.close();
    
  } catch (error) {
    console.error('❌ Ошибка:', error);
  }
}

forceRefreshUser(); 