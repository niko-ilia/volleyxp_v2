const User = require('../models/User');

// Возвращает список тренеров, с которыми текущий пользователь может создавать тренировки
const getAvailableCoaches = async (req, res) => {
  try {
    const me = req.user;
    const myRoles = Array.isArray(me.roles) && me.roles.length ? me.roles : [me.role];
    const isSuperAdmin = myRoles.includes('super_admin');

    const baseCoachQuery = { $or: [ { role: 'coach' }, { roles: 'coach' } ] };

    let coaches;
    if (isSuperAdmin) {
      coaches = await User.find(baseCoachQuery).select('name email roles role');
    } else {
      coaches = await User.find({
        ...baseCoachQuery,
        $or: [
          { _id: me._id }, // если сам тренер
          { 'coachSettings.allowedCreators': me._id }
        ]
      }).select('name email roles role');
    }

    res.json({ items: coaches });
  } catch (e) {
    console.error('getAvailableCoaches error:', e);
    res.status(500).json({ code: 'SERVER_ERROR' });
  }
};

// Получить список разрешённых создателей тренировок для текущего тренера
const getAllowedCreators = async (req, res) => {
  try {
    const me = req.user;
    const roles = Array.isArray(me.roles) && me.roles.length ? me.roles : [me.role];
    if (!roles.includes('coach') && !roles.includes('super_admin')) {
      return res.status(403).json({ code: 'NOT_A_COACH' });
    }
    const coach = await User.findById(me._id).populate('coachSettings.allowedCreators', 'name email');
    const list = (coach?.coachSettings?.allowedCreators || []).map(u => ({ _id: u._id, name: u.name, email: u.email }));
    res.json({ items: list });
  } catch (e) {
    console.error('getAllowedCreators error:', e);
    res.status(500).json({ code: 'SERVER_ERROR' });
  }
};

// Обновить список разрешённых создателей тренировок (полная замена)
const updateAllowedCreators = async (req, res) => {
  try {
    const me = req.user;
    const roles = Array.isArray(me.roles) && me.roles.length ? me.roles : [me.role];
    if (!roles.includes('coach') && !roles.includes('super_admin')) {
      return res.status(403).json({ code: 'NOT_A_COACH' });
    }
    const { allowedCreatorIds } = req.body || {};
    if (!Array.isArray(allowedCreatorIds)) {
      return res.status(400).json({ code: 'INVALID_PAYLOAD' });
    }
    const users = await User.find({ _id: { $in: allowedCreatorIds } }).select('_id');
    const ids = users.map(u => u._id);
    const coach = await User.findById(me._id);
    coach.coachSettings = coach.coachSettings || {};
    coach.coachSettings.allowedCreators = ids;
    await coach.save();
    res.json({ ok: true });
  } catch (e) {
    console.error('updateAllowedCreators error:', e);
    res.status(500).json({ code: 'SERVER_ERROR' });
  }
};

// Поиск пользователей по email/имени (для добавления в allowlist)
const searchUsers = async (req, res) => {
  try {
    const me = req.user;
    const roles = Array.isArray(me.roles) && me.roles.length ? me.roles : [me.role];
    if (!roles.includes('coach') && !roles.includes('super_admin')) {
      return res.status(403).json({ code: 'NOT_A_COACH' });
    }
    const q = String(req.query.q || '').trim();
    if (!q) return res.json({ items: [] });
    const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    const users = await User.find({
      $or: [
        { email: { $regex: regex } },
        { name: { $regex: regex } }
      ]
    }).select('name email').limit(20);
    res.json({ items: users });
  } catch (e) {
    console.error('searchUsers error:', e);
    res.status(500).json({ code: 'SERVER_ERROR' });
  }
};

module.exports = {
  getAvailableCoaches,
  getAllowedCreators,
  updateAllowedCreators,
  searchUsers,
};


