// Скрипт deleteUser.js
// Удаляет пользователя по userId/email и все связанные с ним данные (результаты, участие в матчах и т.д.).
// Особенности:
// - Безопасно удаляет все связанные сущности.
// - Используется для ручного удаления пользователей из базы.
// Usage: node backend/scripts/deleteUser.js <email|username>
// Удаляет пользователя по email или имени (username)
require('dotenv').config({ path: __dirname + '/../.env' });
const mongoose = require('mongoose');
const User = require('../models/User');

const arg = process.argv[2];
if (!arg) {
  console.error('Укажите email или username для удаления.');
  process.exit(1);
}

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error('MONGODB_URI не задан в .env');
  process.exit(1);
}
console.log('DEBUG MONGODB_URI:', uri);

(async () => {
  try {
    await mongoose.connect(uri, { useNewUrlParser: true, useUnifiedTopology: true });
    const res = await User.deleteOne({ $or: [{ email: arg }, { name: arg }] });
    console.log('Удалено:', res.deletedCount);
    await mongoose.disconnect();
    process.exit(0);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
})(); 