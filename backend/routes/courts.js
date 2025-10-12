const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { requireSuperAdmin, requireCourtAccess, logAdminAction } = require('../middleware/adminAuth');
const courtController = require('../controllers/courtController');

// Все роуты требуют авторизации
router.use(auth);

// Подменяем courtId для middleware доступа по id
router.param('id', (req, res, next, id) => {
  req.params.courtId = id;
  next();
});

// GET /api/admin/courts - Получить список всех кортов
router.get('/', requireSuperAdmin, logAdminAction('VIEW_COURTS'), courtController.getAllCourts);

// GET /api/admin/courts/mine - Получить корты, доступные court_admin
router.get('/mine', logAdminAction('VIEW_MY_COURTS'), courtController.getManagedCourts);

// GET /api/admin/courts/:id - Получить корт по ID
router.get('/:id', requireCourtAccess, logAdminAction('VIEW_COURT_DETAILS'), courtController.getCourtById);

// POST /api/admin/courts - Создать новый корт
router.post('/', requireSuperAdmin, logAdminAction('CREATE_COURT'), courtController.createCourt);

// PUT /api/admin/courts/:id - Обновить корт
router.put('/:id', requireCourtAccess, logAdminAction('UPDATE_COURT'), courtController.updateCourt);

// DELETE /api/admin/courts/:id - Удалить корт
router.delete('/:id', requireCourtAccess, logAdminAction('DELETE_COURT'), courtController.deleteCourt);

// POST /api/admin/courts/:id/assign-manager - Назначить менеджера корта
router.post('/:id/assign-manager', requireSuperAdmin, logAdminAction('ASSIGN_COURT_MANAGER'), courtController.assignManager);

// POST /api/admin/courts/:id/assign-owner - Назначить владельца корта
router.post('/:id/assign-owner', requireSuperAdmin, logAdminAction('ASSIGN_COURT_OWNER'), courtController.assignOwner);

// GET /api/admin/courts/:id/stats - Получить статистику корта
router.get('/:id/stats', requireCourtAccess, logAdminAction('VIEW_COURT_STATS'), courtController.getCourtStats);

// Schedule and reservations (accessible by super_admin and court_admin with access)
router.get('/:id/schedule', requireCourtAccess, logAdminAction('VIEW_COURT_SCHEDULE'), courtController.getSchedule);
router.post('/:id/reservations', requireCourtAccess, logAdminAction('CREATE_COURT_RESERVATION'), courtController.createReservation);
router.put('/:id/reservations/:reservationId', requireCourtAccess, logAdminAction('UPDATE_COURT_RESERVATION'), courtController.updateReservation);
router.delete('/:id/reservations/:reservationId', requireCourtAccess, logAdminAction('DELETE_COURT_RESERVATION'), courtController.deleteReservation);

module.exports = router; 