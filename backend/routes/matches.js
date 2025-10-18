const express = require('express');
const router = express.Router();
const {
  createMatch,
  getMatches,
  getMatchById,
  joinMatch,
  leaveMatch,
  deleteMatch,
  addPlayerToMatch,
  removePlayerFromMatch
} = require('../controllers/matchController');
const auth = require('../middleware/auth');
const { logAdminAction } = require('../middleware/adminAuth');

// Публичный роут для просмотра публичных будущих матчей
// GET /api/matches/public?future=1
router.get('/public', async (req, res, next) => {
  // Проксируем в контроллер getMatches без req.user, чтобы вернулись только публичные
  // Устанавливаем по умолчанию future=1, если не задано
  if (typeof req.query.future === 'undefined') req.query.future = '1';
  // Временный объект без пользователя, чтобы getMatches отфильтровал приватные
  delete req.user;
  return require('../controllers/matchController').getMatches(req, res, next);
});

// Все остальные роуты требуют аутентификации
router.use(auth);

// POST /api/matches - создать матч
router.post('/', createMatch);

// GET /api/matches - получить все матчи
router.get('/', getMatches);

// GET /api/matches/:id - получить матч по ID
router.get('/:id', getMatchById);

// POST /api/matches/:id/join - присоединиться к матчу
router.post('/:id/join', joinMatch);

// POST /api/matches/:id/add-player - добавить игрока в матч (создатель или админ)
router.post('/:id/add-player', logAdminAction('ADD_PLAYER_TO_MATCH'), addPlayerToMatch);

// POST /api/matches/:id/leave - покинуть матч
router.post('/:id/leave', leaveMatch);

// DELETE /api/matches/:id/participants/:participantId - удалить участника
router.delete('/:id/participants/:participantId', logAdminAction('REMOVE_PLAYER_FROM_MATCH'), removePlayerFromMatch);

// PATCH /api/matches/:id - обновить матч (удалить или отменить)
router.patch('/:id', require('../controllers/matchController').updateMatch);

module.exports = router; 