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

// ===== Trainings listing and stats =====
const Match = require('../models/Match');

async function listCoachTrainings(req, res) {
  try {
    const me = req.user;
    const roles = Array.isArray(me.roles) && me.roles.length ? me.roles : [me.role];
    const isSuperAdmin = roles.includes('super_admin');
    const { from, to, page = 1, pageSize = 200 } = req.query;
    const query = { type: 'training' };
    if (!isSuperAdmin) {
      query.$or = [{ coach: me._id }, { creator: me._id }];
    }
    if (from) query.startDateTime = { ...(query.startDateTime || {}), $gte: new Date(from) };
    if (to) query.startDateTime = { ...(query.startDateTime || {}), $lte: new Date(to) };
    const size = Math.min(Math.max(parseInt(pageSize, 10) || 200, 1), 500);
    const p = Math.max(parseInt(page, 10) || 1, 1);
    const total = await Match.countDocuments(query);
    const items = await Match.find(query)
      .select('title place startDateTime duration status participants coach')
      .populate('coach', 'name email')
      .sort({ startDateTime: 1 })
      .skip((p - 1) * size)
      .limit(size)
      .lean();
    const withCounts = items.map(it => ({
      _id: it._id,
      title: it.title,
      place: it.place,
      startDateTime: it.startDateTime,
      duration: it.duration,
      status: it.status,
      coach: it.coach,
      participantsCount: Array.isArray(it.participants) ? it.participants.length : 0,
    }));
    return res.json({ items: withCounts, total, totalPages: Math.max(1, Math.ceil(total / size)), currentPage: p });
  } catch (e) {
    console.error('listCoachTrainings error:', e);
    return res.status(500).json({ message: 'Server error' });
  }
}

async function coachStats(req, res) {
  try {
    const me = req.user;
    const roles = Array.isArray(me.roles) && me.roles.length ? me.roles : [me.role];
    const isSuperAdmin = roles.includes('super_admin');
    const { from, to } = req.query;
    const match = { type: 'training' };
    if (!isSuperAdmin) match.$or = [{ coach: me._id }, { creator: me._id }];
    if (from) match.startDateTime = { ...(match.startDateTime || {}), $gte: new Date(from) };
    if (to) match.startDateTime = { ...(match.startDateTime || {}), $lte: new Date(to) };
    const pipeline = [
      { $match: match },
      { $project: { startDateTime: 1, participantsCount: { $size: { $ifNull: ['$participants', []] } }, participants: 1 } },
      {
        $group: {
          _id: null,
          totalTrainings: { $sum: 1 },
          totalParticipants: { $sum: '$participantsCount' },
          uniquePlayers: { $addToSet: '$participants' }
        }
      },
      {
        $project: {
          _id: 0,
          totalTrainings: 1,
          totalParticipants: 1,
          avgParticipants: { $cond: [{ $gt: ['$totalTrainings', 0] }, { $divide: ['$totalParticipants', '$totalTrainings'] }, 0] },
          uniquePlayers: { $size: { $reduce: { input: '$uniquePlayers', initialValue: [], in: { $setUnion: ['$$value', { $ifNull: ['$$this', []] }] } } } }
        }
      }
    ];
    const agg = await Match.aggregate(pipeline);
    const now = new Date();
    const upcomingCount = await Match.countDocuments({ ...match, startDateTime: { ...(match.startDateTime || {}), $gte: now } });
    const stats = agg[0] || { totalTrainings: 0, totalParticipants: 0, avgParticipants: 0, uniquePlayers: 0 };
    return res.json({ ...stats, upcomingCount });
  } catch (e) {
    console.error('coachStats error:', e);
    return res.status(500).json({ message: 'Server error' });
  }
}

module.exports.listCoachTrainings = listCoachTrainings;
module.exports.coachStats = coachStats;


