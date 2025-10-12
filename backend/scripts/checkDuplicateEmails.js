// Скрипт checkDuplicateEmails.js
// Находит пользователей с одинаковыми email (с учётом регистра)
// Usage: node backend/scripts/checkDuplicateEmails.js
require('dotenv').config({ path: __dirname + '/../.env' });
const mongoose = require('mongoose');
const User = require('../models/User');

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error('MONGODB_URI не задан в .env');
  process.exit(1);
}

(async () => {
  try {
    await mongoose.connect(uri);
    const users = await User.find();
    
    // Группируем по email (в нижнем регистре)
    const emailGroups = {};
    for (const user of users) {
      const emailLower = user.email.toLowerCase();
      if (!emailGroups[emailLower]) {
        emailGroups[emailLower] = [];
      }
      emailGroups[emailLower].push(user);
    }
    
    // Находим дубли
    const duplicates = Object.entries(emailGroups).filter(([email, users]) => users.length > 1);
    
    if (duplicates.length === 0) {
      console.log('Дубликатов email не найдено');
    } else {
      console.log(`Найдено ${duplicates.length} дубликатов email:`);
      for (const [email, users] of duplicates) {
        console.log(`\nEmail: ${email}`);
        for (const user of users) {
          console.log(`  - ${user.email} (${user._id}) - рейтинг: ${user.rating}`);
        }
      }
    }
    
    // Проверяем конкретный email
    const targetEmail = 'petukhov.dmitry@gmail.com';
    const targetUsers = users.filter(user => 
      user.email.toLowerCase() === targetEmail.toLowerCase()
    );
    
    console.log(`\nПользователи с email ${targetEmail}: ${targetUsers.length}`);
    for (const user of targetUsers) {
      console.log(`  - ${user.email} (${user._id}) - рейтинг: ${user.rating}`);
    }
    
    await mongoose.disconnect();
    process.exit(0);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
})(); 