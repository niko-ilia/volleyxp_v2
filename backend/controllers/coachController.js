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

// Helper: mask email for privacy in coach search
function maskEmailForPublic(email) {
  try {
    if (!email || typeof email !== 'string') return '';
    const [name, domain] = email.split('@');
    if (!domain) return email;
    const visible = name.length <= 2 ? name[0] : name.slice(0, 2);
    return visible + '***@' + domain;
  } catch (_) {
    return '';
  }
}

// Поиск пользователей по email/имени (для добавления в allowlist) — не раскрывает полный email
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
    const items = users.map(u => ({ _id: u._id, name: u.name, emailMasked: maskEmailForPublic(u.email) }));
    res.json({ items });
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
const { sendTelegramMessage } = require('../utils/telegram');

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
      participants: Array.isArray(it.participants) ? it.participants.map(p => p?.toString ? p.toString() : String(p)) : []
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

// Players attendance stats for last 30/90 days
async function coachPlayersStats(req, res) {
  try {
    const me = req.user;
    const roles = Array.isArray(me.roles) && me.roles.length ? me.roles : [me.role];
    const isSuperAdmin = roles.includes('super_admin');
    const now = new Date();
    const from90 = new Date(now);
    from90.setDate(from90.getDate() - 90);
    const from30 = new Date(now);
    from30.setDate(from30.getDate() - 30);

    const match = { type: 'training', startDateTime: { $gte: from90, $lte: now } };
    if (!isSuperAdmin) match.$or = [{ coach: me._id }, { creator: me._id }];

    const items = await Match.find(match).select('participants startDateTime').lean();
    const map = new Map();
    for (const it of items) {
      const dt = new Date(it.startDateTime);
      const ids = Array.isArray(it.participants) ? it.participants.map(p => p?.toString ? p.toString() : String(p)) : [];
      const is30 = dt >= from30;
      for (const id of ids) {
        const rec = map.get(id) || { last30: 0, last90: 0 };
        rec.last90 += 1;
        if (is30) rec.last30 += 1;
        map.set(id, rec);
      }
    }
    const ids = Array.from(map.keys());
    const users = await User.find({ _id: { $in: ids } }).select('name email').lean();
    const info = new Map(users.map(u => [String(u._id), { name: u.name, email: u.email }]));
    const list = ids.map(id => ({ _id: id, name: info.get(id)?.name || '', email: info.get(id)?.email || '', last30: map.get(id).last30, last90: map.get(id).last90 }));
    list.sort((a, b) => b.last90 - a.last90);
    return res.json({ items: list });
  } catch (e) {
    console.error('coachPlayersStats error:', e);
    return res.status(500).json({ message: 'Server error' });
  }
}

module.exports.coachPlayersStats = coachPlayersStats;

// Notify settings (toggle reminders before training)
async function getNotifySettings(req, res) {
  try {
    const me = await User.findById(req.user._id).select('coachSettings');
    const enabled = !!(me?.coachSettings?.notifyBeforeTraining);
    return res.json({ notifyBeforeTraining: enabled });
  } catch (e) {
    console.error('getNotifySettings error:', e);
    return res.status(500).json({ message: 'Server error' });
  }
}

async function updateNotifySettings(req, res) {
  try {
    const meId = req.user._id;
    const { notifyBeforeTraining } = req.body || {};
    const user = await User.findById(meId).select('coachSettings');
    user.coachSettings = user.coachSettings || {};
    user.coachSettings.notifyBeforeTraining = Boolean(notifyBeforeTraining);
    await user.save();
    return res.json({ ok: true });
  } catch (e) {
    console.error('updateNotifySettings error:', e);
    return res.status(500).json({ message: 'Server error' });
  }
}

module.exports.getNotifySettings = getNotifySettings;
module.exports.updateNotifySettings = updateNotifySettings;

async function sendRemindersInRange(start, end) {
  // Find coaches with toggle enabled and telegramId
  const coaches = await User.find({
    $or: [{ role: 'coach' }, { roles: 'coach' }],
    'coachSettings.notifyBeforeTraining': true,
    telegramId: { $exists: true, $ne: null }
  }).select('_id name email telegramId');

  let sent = 0;
  for (const coach of coaches) {
    const trainings = await Match.find({
      type: 'training',
      coach: coach._id,
      startDateTime: { $gte: start, $lte: end },
    }).select('startDateTime place participants');
    if (!Array.isArray(trainings) || trainings.length === 0) continue;

    // Group by day
    const byDay = new Map();
    for (const t of trainings) {
      const d = new Date(t.startDateTime);
      const key = d.toISOString().slice(0,10);
      const arr = byDay.get(key) || [];
      arr.push(t);
      byDay.set(key, arr);
    }

    for (const [key, arr] of byDay.entries()) {
      const dayDt = new Date(key);
      const header = `Reminder: trainings on ${dayDt.toLocaleDateString()}`;
      const lines = [header, ''];
      arr.sort((a,b) => new Date(a.startDateTime) - new Date(b.startDateTime));
      for (const t of arr) {
        const d = new Date(t.startDateTime);
        const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const place = t.place || '—';
        const count = Array.isArray(t.participants) ? t.participants.length : 0;
        const icon = d.getUTCHours() < 15 ? '☀️' : '🌙';
        lines.push(`${icon} ${time} — ${place} — ${count} players`);
      }
      const text = lines.join('\n');
      try {
        await sendTelegramMessage({ chatId: coach.telegramId, text, disableWebPagePreview: true });
        sent += 1;
      } catch (e) {
        // continue
      }
    }
  }
  return sent;
}

// POST /api/coach/notify-dispatch?hours=24 — ad-hoc window
async function dispatchUpcomingNotifications(req, res) {
  try {
    const hours = Math.min(Math.max(parseInt(req.query.hours || '24', 10) || 24, 1), 72);
    const now = new Date();
    const until = new Date(now.getTime() + hours * 60 * 60 * 1000);
    const sent = await sendRemindersInRange(now, until);
    return res.json({ ok: true, sent });
  } catch (e) {
    console.error('dispatchUpcomingNotifications error:', e);
    return res.status(500).json({ message: 'Server error' });
  }
}

// For cron @21:00 -> next day window
async function dispatchTomorrowNotifications() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 23, 59, 59, 999);
  await sendRemindersInRange(start, end);
}

module.exports.dispatchUpcomingNotifications = dispatchUpcomingNotifications;
module.exports.dispatchTomorrowNotifications = dispatchTomorrowNotifications;

// POST /api/coach/notify-test — send test DM for current coach for tomorrow
async function notifyTestForMe(req, res) {
  try {
    const me = await User.findById(req.user._id).select('telegramId coachSettings');
    if (!me) return res.status(404).json({ message: 'User not found' });
    if (!me.telegramId) return res.status(400).json({ message: 'Telegram is not linked for personal messages' });
    if (!me.coachSettings || !me.coachSettings.notifyBeforeTraining) {
      return res.status(400).json({ message: 'Reminder is not enabled' });
    }

    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 23, 59, 59, 999);
    const trainings = await Match.find({ type: 'training', coach: me._id, startDateTime: { $gte: start, $lte: end } })
      .select('startDateTime place participants')
      .lean();

    const dayStr = start.toLocaleDateString();
    let text = '';
    if (!trainings || trainings.length === 0) {
      text = `Reminder: no trainings on ${dayStr}`;
    } else {
      const lines = [`Reminder: trainings on ${dayStr}`, ''];
      trainings.sort((a,b) => new Date(a.startDateTime) - new Date(b.startDateTime));
      for (const t of trainings) {
        const d = new Date(t.startDateTime);
        const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const place = t.place || '—';
        const count = Array.isArray(t.participants) ? t.participants.length : 0;
        const icon = d.getUTCHours() < 15 ? '☀️' : '🌙';
        lines.push(`${icon} ${time} — ${place} — ${count} players`);
      }
      text = lines.join('\n');
    }

    await sendTelegramMessage({ chatId: me.telegramId, text, disableWebPagePreview: true });
    return res.json({ ok: true });
  } catch (e) {
    console.error('notifyTestForMe error:', e);
    return res.status(500).json({ message: 'Server error' });
  }
}

module.exports.notifyTestForMe = notifyTestForMe;

