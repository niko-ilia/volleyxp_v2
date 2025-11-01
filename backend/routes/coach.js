const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { getAvailableCoaches, getAllowedCreators, updateAllowedCreators, searchUsers, listCoachTrainings, coachStats, coachPlayersStats, getNotifySettings, updateNotifySettings, dispatchUpcomingNotifications } = require('../controllers/coachController');
const { requireRole } = require('../middleware/adminAuth');

router.use(auth);

// Кто доступен текущему пользователю для создания тренировок
router.get('/available', getAvailableCoaches);

// Управление allowlist текущего тренера
router.get('/allowed-creators', getAllowedCreators);
router.put('/allowed-creators', updateAllowedCreators);

// Поиск пользователей для добавления в allowlist
router.get('/search-users', searchUsers);

// Trainings for coach
router.get('/trainings', listCoachTrainings);
router.get('/stats', coachStats);
router.get('/players-stats', coachPlayersStats);
router.get('/notify-settings', getNotifySettings);
router.put('/notify-settings', updateNotifySettings);
// Trigger notifications for upcoming trainings (protected)
router.post('/notify-dispatch', requireRole(['super_admin']), dispatchUpcomingNotifications);

module.exports = router;


