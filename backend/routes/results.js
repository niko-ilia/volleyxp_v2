const express = require('express');
const router = express.Router();
const {
  createResult,
  getResult,
  updateResult,
  confirmResult,
  getAllResults,
  deleteResult,
  getResultStats
} = require('../controllers/resultController');
const auth = require('../middleware/auth');

// Все роуты требуют аутентификации
router.use(auth);

// POST /api/results - создать результат
router.post('/', createResult);

// GET /api/results - получить все результаты
router.get('/', getAllResults);

// GET /api/results/:matchId - получить результат матча
router.get('/:matchId', getResult);

// POST /api/results/:resultId/confirm - подтвердить результат и пересчитать рейтинг
router.post('/:resultId/confirm', confirmResult);

// GET /api/results/:matchId/stats - агрегированная статистика результата матча
router.get('/:matchId/stats', getResultStats);

// PUT /api/results/:resultId - обновить результат матча
router.put('/:resultId', updateResult);

// DELETE /api/results/:resultId - удалить результат матча
router.delete('/:resultId', deleteResult);

module.exports = router; 