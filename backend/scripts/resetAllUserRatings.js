// Скрипт resetAllUserRatings.js
// Сбрасывает рейтинг всех пользователей на 2.0 и очищает ratingHistory.
// Особенности:
// - Используется для полного сброса рейтингов перед пересчётом истории.
// - Не трогает другие поля пользователя.
// Usage: node backend/scripts/resetAllUserRatings.js
const mongoose = require('mongoose');
const User = require('../models/User');
require('dotenv').config();

(async () => {
  await mongoose.connect(process.env.MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true });
  const users = await User.find();
  for (const user of users) {
    user.rating = 2.0;
    user.ratingHistory = [];
    await user.save();
    console.log(`User ${user.email || user._id}: rating reset to 2.0`);
  }
  await mongoose.disconnect();
  console.log('All user ratings reset to 2.0');
})(); 