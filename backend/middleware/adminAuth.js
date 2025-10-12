/**
 * Middleware для проверки административных прав
 */

// Проверка конкретной роли
const requireRole = (roles) => {
  // Если передана строка, преобразуем в массив
  const allowedRoles = Array.isArray(roles) ? roles : [roles];
  
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ code: 'NOT_AUTHENTICATED' });
    }

    const userRoles = Array.isArray(req.user.roles) && req.user.roles.length > 0
      ? req.user.roles
      : [req.user.role];

    const hasAllowedRole = userRoles.some(r => allowedRoles.includes(r));
    if (!hasAllowedRole) {
      return res.status(403).json({ 
        code: 'INSUFFICIENT_PERMISSIONS',
        message: `Required role: ${allowedRoles.join(' or ')}, your roles: ${userRoles.join(', ')}`
      });
    }

    // Проверяем, не заблокирован ли пользователь
    if (req.user.isBlocked) {
      return res.status(403).json({ code: 'ACCOUNT_BLOCKED' });
    }

    next();
  };
};

// Проверка супер-админа
const requireSuperAdmin = requireRole('super_admin');

// Проверка просмотра админки без права изменений (глобальный просмотр)
const requireAdminView = requireRole(['admin_view', 'super_admin']);

// Проверка админа (любого уровня)
const requireAdmin = requireRole(['court_admin', 'super_admin']);

// Проверка конкретного разрешения
const requirePermission = (permission) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ code: 'NOT_AUTHENTICATED' });
    }

    // Супер-админ имеет все разрешения
    const userRoles = Array.isArray(req.user.roles) && req.user.roles.length > 0
      ? req.user.roles
      : [req.user.role];
    if (userRoles.includes('super_admin')) {
      return next();
    }

    // Проверяем наличие конкретного разрешения
    if (!req.user.permissions || !req.user.permissions.includes(permission)) {
      return res.status(403).json({ 
        code: 'INSUFFICIENT_PERMISSIONS',
        message: `Required permission: ${permission}`
      });
    }

    next();
  };
};

// Проверка владения кортом (для court_admin)
const requireCourtAccess = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ code: 'NOT_AUTHENTICATED' });
  }

  // Супер-админ имеет доступ ко всем кортам
  const userRoles = Array.isArray(req.user.roles) && req.user.roles.length > 0
    ? req.user.roles
    : [req.user.role];
  if (userRoles.includes('super_admin')) {
    return next();
  }

  // Для court_admin проверяем доступ к конкретному корту
  if (userRoles.includes('court_admin')) {
    const courtId = req.params.courtId || req.body.courtId || req.query.courtId;
    
    if (!courtId) {
      return res.status(400).json({ code: 'COURT_ID_REQUIRED' });
    }

    if (!req.user.managedCourts || !req.user.managedCourts.includes(courtId)) {
      return res.status(403).json({ code: 'COURT_ACCESS_DENIED' });
    }

    return next();
  }

  return res.status(403).json({ code: 'INSUFFICIENT_PERMISSIONS' });
};

// Логирование административных действий
const logAdminAction = (action) => {
  return (req, res, next) => {
    // Сохраняем информацию о действии для логирования
    req.adminAction = {
      action,
      userId: req.user._id,
      userRole: (Array.isArray(req.user.roles) && req.user.roles.length > 0 ? req.user.roles.join(',') : req.user.role),
      ip: req.ip || req.connection.remoteAddress,
      userAgent: req.get('User-Agent'),
      timestamp: new Date()
    };
    
    // Логируем действие (в будущем можно сохранять в БД)
    console.log('Admin action:', req.adminAction);
    
    next();
  };
};

module.exports = {
  requireRole,
  requireSuperAdmin,
  requireAdminView,
  requireAdmin,
  requirePermission,
  requireCourtAccess,
  logAdminAction
}; 