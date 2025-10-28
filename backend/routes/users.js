const express = require('express');
const router = express.Router();
const { getProfile, updateProfile, getMatchHistory, getUserByEmail, getPublicProfile, getMatchHistoryByUserId, addTelegramChannel, verifyTelegramChannel, deleteTelegramChannel, postToTelegramChannel } = require('../controllers/userController');
const auth = require('../middleware/auth');



// Публичные роуты для просмотра чужих профилей
// GET /api/users/:id/public - публичный профиль без полного email
router.get('/:id/public', getPublicProfile);
// GET /api/users/:id/match-history - публичная история матчей пользователя (маскированные email)
router.get('/:id/match-history', getMatchHistoryByUserId);

// Все остальные роуты требуют аутентификации
router.use(auth);

// GET /api/users/profile - получить профиль пользователя
router.get('/profile', getProfile);

// PUT /api/users/profile - обновить профиль пользователя
router.put('/profile', updateProfile);

// Telegram channel management
router.post('/telegram-channel', addTelegramChannel);
router.post('/telegram-channel/verify', verifyTelegramChannel);
router.delete('/telegram-channel', deleteTelegramChannel);
router.post('/telegram-channel/post', postToTelegramChannel);

// GET /api/users/match-history - получить историю матчей пользователя
router.get('/match-history', getMatchHistory);

// GET /api/users/email/:email - получить пользователя по email
router.get('/email/:email', getUserByEmail);

// GET /api/users/search - поиск пользователей
router.get('/search', async (req, res) => {
  try {
    const { q } = req.query;
    
    if (!q || q.length < 2) {
      return res.json([]);
    }
    
    const User = require('../models/User');
    
    // Поиск по имени или email (нечеткий поиск, регистронезависимый)
    const searchRegex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'); // Экранируем спецсимволы + case-insensitive
    
    const users = await User.find({
      $or: [
        { name: { $regex: searchRegex } },
        { email: { $regex: searchRegex } }
      ]
    })
    .select('name email rating') // Только нужные поля
    .limit(20); // Увеличиваем лимит для лучшей сортировки
    
    // Умная сортировка: точные совпадения → начинается с → содержит
    const queryLower = q.toLowerCase();
    const sortedUsers = users.sort((a, b) => {
      const aName = (a.name || '').toLowerCase();
      const bName = (b.name || '').toLowerCase();
      const aEmail = (a.email || '').toLowerCase();
      const bEmail = (b.email || '').toLowerCase();
      
      // Приоритет 1: точное совпадение имени
      if (aName === queryLower) return -1;
      if (bName === queryLower) return 1;
      
      // Приоритет 2: начинается с запроса (имя)
      if (aName.startsWith(queryLower) && !bName.startsWith(queryLower)) return -1;
      if (bName.startsWith(queryLower) && !aName.startsWith(queryLower)) return 1;
      
      // Приоритет 3: начинается с запроса (email)
      if (aEmail.startsWith(queryLower) && !bEmail.startsWith(queryLower)) return -1;
      if (bEmail.startsWith(queryLower) && !aEmail.startsWith(queryLower)) return 1;
      
      // Приоритет 4: по алфавиту
      return aName.localeCompare(bName);
    });
    
    res.json(sortedUsers.slice(0, 10)); // Ограничиваем финальный результат
  } catch (error) {
    console.error('Search users error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router; 