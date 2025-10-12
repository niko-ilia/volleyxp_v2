const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { requireSuperAdmin, requireAdminView, logAdminAction } = require('../middleware/adminAuth');
const {
  getAllUsers,
  updateUserRole,
  blockUser,
  unblockUser,
  deleteUser,
  resetUserPassword,
  mergeUsers,
  getUserStats
} = require('../controllers/adminController');

// Все роуты требуют авторизации
router.use(auth);

// Просмотр админки (admin_view и super_admin)
router.get('/users', requireAdminView, logAdminAction('VIEW_USERS'), getAllUsers);
router.get('/users/:id/stats', requireAdminView, getUserStats);
router.get('/matches', requireAdminView, logAdminAction('VIEW_ALL_MATCHES'), require('../controllers/adminController').getAllMatches);
router.get('/analytics/overview', requireAdminView, require('../controllers/adminController').getAnalyticsOverview);
router.get('/analytics/users', requireAdminView, require('../controllers/adminController').getUserAnalytics);
router.get('/analytics/matches', requireAdminView, require('../controllers/adminController').getMatchAnalytics);
router.get('/analytics/activity', requireAdminView, require('../controllers/adminController').getActivityAnalytics);
router.get('/export/users', requireAdminView, logAdminAction('EXPORT_USERS'), require('../controllers/adminController').exportUsers);
router.get('/export/matches', requireAdminView, logAdminAction('EXPORT_MATCHES'), require('../controllers/adminController').exportMatches);

// Системные настройки (просмотр)
router.get('/settings', requireAdminView, require('../controllers/adminController').getSystemSettings);

// Остальные действия — только супер-админ
router.use(requireSuperAdmin);

// Управление пользователями
router.put('/users/:id/role', logAdminAction('UPDATE_USER_ROLE'), updateUserRole);
router.post('/users/:id/block', logAdminAction('BLOCK_USER'), blockUser);
router.post('/users/:id/unblock', logAdminAction('UNBLOCK_USER'), unblockUser);
router.delete('/users/:id', logAdminAction('DELETE_USER'), deleteUser);
router.post('/users/:id/reset-password', logAdminAction('RESET_USER_PASSWORD'), resetUserPassword);
router.post('/users/merge', logAdminAction('MERGE_USERS'), mergeUsers);

// Управление матчами
router.delete('/matches/:id', logAdminAction('FORCE_DELETE_MATCH'), require('../controllers/adminController').forceDeleteMatch);
router.post('/matches/:id/cancel', logAdminAction('FORCE_CANCEL_MATCH'), require('../controllers/adminController').forceCancelMatch);
router.put('/matches/:id/result', logAdminAction('UPDATE_MATCH_RESULT'), require('../controllers/adminController').updateMatchResult);

// Аналитика — уже добавлена выше

// Системные настройки (изменение)
router.put('/settings', logAdminAction('UPDATE_SYSTEM_SETTINGS'), require('../controllers/adminController').updateSystemSettings);

// Экспорт — уже добавлен выше

module.exports = router; 