const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { getAvailableCoaches, getAllowedCreators, updateAllowedCreators, searchUsers } = require('../controllers/coachController');

router.use(auth);

// Кто доступен текущему пользователю для создания тренировок
router.get('/available', getAvailableCoaches);

// Управление allowlist текущего тренера
router.get('/allowed-creators', getAllowedCreators);
router.put('/allowed-creators', updateAllowedCreators);

// Поиск пользователей для добавления в allowlist
router.get('/search-users', searchUsers);

module.exports = router;


