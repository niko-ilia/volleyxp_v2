const User = require('../models/User');
const Match = require('../models/Match');
const { sendMail } = require('../utils/mail');
const jwt = require('jsonwebtoken');
const { isBotInChat, botGetChat, sendTelegramMessage } = require('../utils/telegram');

// Утилита для маскирования email для публичных ответов
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

function generateEmailToken(user) {
  return jwt.sign(
    { userId: user._id, email: user.email },
    process.env.EMAIL_CONFIRM_SECRET || 'email_secret',
    { expiresIn: '1d' }
  );
}

const updateProfile = async (req, res) => {
  try {
    const { name, email, preferences } = req.body;
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (name) user.name = name;
    if (email && email !== user.email) {
      // Check for duplicate email (case-insensitive)
      const existing = await User.findOne({ email: { $regex: new RegExp(`^${email}$`, 'i') } });
      if (existing) {
        return res.status(400).json({ message: 'Email is already used by another user' });
      }
      user.email = email;
      user.emailConfirmed = false;
      // send confirmation email
      const token = generateEmailToken(user);
      const confirmUrl = `${process.env.FRONTEND_URL || 'https://volleyxp.com'}/confirm-email?token=${token}`;
      await sendMail({
        to: user.email,
        subject: 'Email confirmation',
        text: `Follow the link to confirm your email: ${confirmUrl}`,
        html: `<p>Please follow this <a href='${confirmUrl}'>link</a> to confirm your email.</p>`
      });
    }

    // Частичное обновление пользовательских настроек
    if (preferences && typeof preferences === 'object') {
      user.preferences = user.preferences || {};
      const current = user.preferences;
      // profileFilters
      if (preferences.profileFilters && typeof preferences.profileFilters === 'object') {
        current.profileFilters = current.profileFilters || {};
        const pf = preferences.profileFilters;
        if (typeof pf.hideFinishedNoResult === 'boolean') {
          current.profileFilters.hideFinishedNoResult = pf.hideFinishedNoResult;
        }
        if (typeof pf.hideCancelled === 'boolean') {
          current.profileFilters.hideCancelled = pf.hideCancelled;
        }
      }
      user.preferences = current;
    }
    await user.save();

    res.json({
      id: user._id,
      name: user.name,
      email: user.email,
      telegramId: user.telegramId,
      telegramUsername: user.telegramUsername,
      telegramChannel: user.telegramChannel,
      preferences: user.preferences,
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

const getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json({
      id: user._id,
      name: user.name,
      email: user.email,
      telegramId: user.telegramId,
      telegramUsername: user.telegramUsername,
      telegramChannel: user.telegramChannel,
      rating: user.rating,
      createdAt: user.createdAt,
      emailConfirmed: user.emailConfirmed,
      preferences: user.preferences
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

// Public user profile (for viewing by other players)
const getPublicProfile = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({
        error: 'User not found',
        code: 'USER_NOT_FOUND'
      });
    }
    // Возвращаем ограниченный набор данных + маскированный email
    return res.status(200).json({
      item: {
        id: user._id,
        name: user.name,
        rating: user.rating,
        createdAt: user.createdAt,
        emailMasked: maskEmailForPublic(user.email)
      }
    });
  } catch (error) {
    console.error('❌ getPublicProfile error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      code: 'SERVER_ERROR'
    });
  }
};

// Get user by email (for admin functions)
const getUserByEmail = async (req, res) => {
  try {
    const { email } = req.params;
    const user = await User.findOne({ email: { $regex: new RegExp(`^${email}$`, 'i') } });
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json({
      _id: user._id,
      name: user.name,
      email: user.email,
      rating: user.rating,
      createdAt: user.createdAt
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

// Get user's match history by ratingHistory
const getMatchHistory = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (!user.ratingHistory || user.ratingHistory.length === 0) return res.json([]);
    // Collect all matchId from ratingHistory
    const matchIds = user.ratingHistory.map(rh => rh.matchId).filter(Boolean);
    // Fetch matches in one query
    const matches = await Match.find({ _id: { $in: matchIds } }).populate('participants', 'name email');
    const now = new Date();
    // Build response
    const history = user.ratingHistory.map(rh => {
      const match = matches.find(m => m._id.toString() === rh.matchId?.toString());
      // Count wins/draws/losses
      let wins = 0, draws = 0, losses = 0;
      if (Array.isArray(rh.details)) {
        rh.details.forEach(game => {
          if (game.score === 1) wins++;
          else if (game.score === 0.5) draws++;
          else if (game.score === 0) losses++;
        });
      }
      // Formatted date for badge
      let badgeDate = '';
      if (match?.startDateTime) {
        const d = new Date(match.startDateTime);
        badgeDate = isNaN(d) ? '' : d.toLocaleDateString('en-US');
      }
      // Can edit result (if <24h passed and user is in participants)
      let canEditResult = false;
      if (match?.startDateTime && Array.isArray(match.participants)) {
        const matchStart = new Date(match.startDateTime);
        const diffHours = (now - matchStart) / (1000 * 60 * 60);
        canEditResult = diffHours <= 24 && match.participants.some(p => p._id.toString() === user._id.toString());
      }
      // Participants array (id, name, email)
      const participants = Array.isArray(match?.participants)
        ? match.participants.map(p => ({ id: p._id, name: p.name, email: p.email }))
        : [];
      // Links (e.g., match link)
      const links = {
        match: match ? `/match/${match._id}` : null
      };
      return {
        matchId: rh.matchId,
        title: match?.title || '',
        date: match?.startDateTime || null,
        badgeDate,
        delta: rh.delta,
        newRating: rh.newRating,
        details: rh.details,
        comment: rh.comment,
        description: match?.description || '',
        place: match?.place || '',
        status: match?.status || '',
        wins,
        draws,
        losses,
        canEditResult,
        participants,
        links
      };
    });
    res.json(history);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

// Public match history by userId (mask emails of all participants)
const getMatchHistoryByUserId = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({
        error: 'User not found',
        code: 'USER_NOT_FOUND'
      });
    }
    if (!Array.isArray(user.ratingHistory) || user.ratingHistory.length === 0) {
      return res.json({ items: [], total: 0, totalPages: 0, currentPage: 1 });
    }

    const matchIds = user.ratingHistory.map(rh => rh.matchId).filter(Boolean);
    const matches = await Match.find({ _id: { $in: matchIds } }).populate('participants', 'name email');
    const now = new Date();

    const history = user.ratingHistory.map(rh => {
      const match = matches.find(m => m._id.toString() === rh.matchId?.toString());
      let wins = 0, draws = 0, losses = 0;
      if (Array.isArray(rh.details)) {
        rh.details.forEach(game => {
          if (game.score === 1) wins++;
          else if (game.score === 0.5) draws++;
          else if (game.score === 0) losses++;
        });
      }
      let badgeDate = '';
      if (match?.startDateTime) {
        const d = new Date(match.startDateTime);
        badgeDate = isNaN(d) ? '' : d.toLocaleDateString('en-US');
      }
      // В публичном представлении редактирование всегда недоступно
      const canEditResult = false;
      const participants = Array.isArray(match?.participants)
        ? match.participants.map(p => ({ id: p._id, name: p.name, emailMasked: maskEmailForPublic(p.email) }))
        : [];
      const links = {
        match: match ? `/match/${match._id}` : null
      };
      return {
        matchId: rh.matchId,
        title: match?.title || '',
        date: match?.startDateTime || null,
        badgeDate,
        delta: rh.delta,
        newRating: rh.newRating,
        details: rh.details,
        comment: rh.comment,
        description: match?.description || '',
        place: match?.place || '',
        status: match?.status || '',
        wins,
        draws,
        losses,
        canEditResult,
        participants,
        links
      };
    });

    return res.json({ items: history, total: history.length, totalPages: 1, currentPage: 1 });
  } catch (error) {
    console.error('❌ getMatchHistoryByUserId error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      code: 'SERVER_ERROR'
    });
  }
};

// GET /api/users/profile-stats — aggregated teammates/opponents performance for authed user (games-based)
const getProfileStatsAggregates = async (req, res) => {
  try {
    const meId = req.user?._id;
    const user = await User.findById(meId).select('ratingHistory');
    if (!user) return res.status(404).json({ message: 'User not found' });
    const history = Array.isArray(user.ratingHistory) ? user.ratingHistory : [];
    if (history.length === 0) return res.json({ teammates: [], opponents: [] });

    const matchIds = history.map(rh => rh.matchId).filter(Boolean);
    const matches = await Match.find({ _id: { $in: matchIds } }).populate('participants', 'name email');
    const idToInfo = new Map(); // id -> { name, email }
    for (const m of matches) {
      if (Array.isArray(m?.participants)) {
        for (const p of m.participants) {
          const id = p?._id?.toString();
          if (id) idToInfo.set(id, { name: p.name, email: p.email });
        }
      }
    }

    const me = meId?.toString();
    const teamMap = new Map(); // id -> { id, name, email, wins, losses, games }
    const oppMap = new Map();

    for (const rh of history) {
      const details = Array.isArray(rh?.details) ? rh.details : [];
      for (const g of details) {
        const team1 = Array.isArray(g?.team1) ? g.team1.map(x => x.toString()) : [];
        const team2 = Array.isArray(g?.team2) ? g.team2.map(x => x.toString()) : [];
        const in1 = me && team1.includes(me);
        const in2 = me && team2.includes(me);
        if (!in1 && !in2) continue;
        const myTeam = in1 ? team1 : team2;
        const oppTeam = in1 ? team2 : team1;
        const s1 = Number(g?.team1Score ?? 0);
        const s2 = Number(g?.team2Score ?? 0);
        const hasWinner = s1 !== s2;
        const myWin = in1 ? (s1 > s2) : (s2 > s1);

        // teammates
        for (const pid of myTeam) {
          if (pid === me) continue;
          const info = idToInfo.get(pid) || {};
          const row = teamMap.get(pid) || { id: pid, name: info.name || info.email || pid, email: info.email, wins: 0, losses: 0, games: 0 };
          row.games += 1;
          if (hasWinner) {
            if (myWin) row.wins += 1; else row.losses += 1;
          }
          teamMap.set(pid, row);
        }

        // opponents
        for (const pid of oppTeam) {
          const info = idToInfo.get(pid) || {};
          const row = oppMap.get(pid) || { id: pid, name: info.name || info.email || pid, email: info.email, wins: 0, losses: 0, games: 0 };
          row.games += 1;
          if (hasWinner) {
            if (myWin) row.wins += 1; else row.losses += 1;
          }
          oppMap.set(pid, row);
        }
      }
    }

    const teammates = Array.from(teamMap.values()).sort((a, b) => (b.wins - a.wins) || (a.losses - b.losses));
    const opponents = Array.from(oppMap.values()).sort((a, b) => (b.wins - a.wins) || (a.losses - b.losses));
    return res.json({ teammates, opponents });
  } catch (error) {
    console.error('getProfileStatsAggregates error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

// Helpers for Telegram channel parsing
function normalizeChannelInput(input) {
  if (!input || typeof input !== 'string') return null;
  let s = input.trim();
  try {
    if (/^https?:\/\//i.test(s)) {
      const url = new URL(s);
      if (url.hostname === 't.me' || url.hostname === 'telegram.me' || url.hostname.endsWith('.t.me')) {
        const parts = url.pathname.split('/').filter(Boolean);
        if (parts.length >= 1) s = '@' + parts[0];
      }
    }
  } catch (_) {}
  if (/^-?\d{6,}$/.test(s)) return s; // numeric id like -100...
  if (s.startsWith('@')) s = s.slice(1);
  if (!s) return null;
  return '@' + s;
}

// POST /api/users/telegram-channel — add channel once
const addTelegramChannel = async (req, res) => {
  try {
    const { channel } = req.body || {};
    const norm = normalizeChannelInput(channel);
    if (!norm) return res.status(400).json({ message: 'Invalid channel' });
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (user.telegramChannel && (user.telegramChannel.id || user.telegramChannel.username)) {
      return res.status(400).json({ message: 'Channel already added', code: 'CHANNEL_ALREADY_SET' });
    }
    const chat = await botGetChat(norm);
    const id = String(chat?.id || '');
    if (!id) return res.status(400).json({ message: 'Channel not found' });
    const username = (chat?.username || '').toString();
    const title = (chat?.title || '').toString();
    user.telegramChannel = {
      id,
      username,
      title,
      linked: false,
      addedAt: new Date(),
      verifiedAt: undefined
    };
    await user.save();
    return res.json({ telegramChannel: user.telegramChannel });
  } catch (e) {
    console.error('addTelegramChannel error:', e?.response?.data || e);
    return res.status(500).json({ message: 'Server error' });
  }
};

// POST /api/users/telegram-channel/verify — check bot membership
const verifyTelegramChannel = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (!user.telegramChannel || (!user.telegramChannel.id && !user.telegramChannel.username)) {
      return res.status(400).json({ message: 'No channel to verify', code: 'NO_CHANNEL' });
    }
    const key = user.telegramChannel.id || (user.telegramChannel.username ? ('@' + user.telegramChannel.username) : null);
    const ok = await isBotInChat(key);
    user.telegramChannel.linked = !!ok;
    user.telegramChannel.verifiedAt = new Date();
    await user.save();
    return res.json({ ok, telegramChannel: user.telegramChannel });
  } catch (e) {
    console.error('verifyTelegramChannel error:', e?.response?.data || e);
    return res.status(500).json({ message: 'Server error' });
  }
};

// DELETE /api/users/telegram-channel — remove channel
const deleteTelegramChannel = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    user.telegramChannel = undefined;
    await user.save();
    return res.json({ ok: true });
  } catch (e) {
    console.error('deleteTelegramChannel error:', e);
    return res.status(500).json({ message: 'Server error' });
  }
};

// POST /api/users/telegram-channel/post — send text to user's linked channel
const postToTelegramChannel = async (req, res) => {
  try {
    const { text } = req.body || {};
    if (!text || typeof text !== 'string' || !text.trim()) {
      return res.status(400).json({ message: 'Text is required' });
    }
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    const chan = user.telegramChannel;
    if (!chan || !chan.linked || (!chan.id && !chan.username)) {
      return res.status(400).json({ message: 'Channel is not linked', code: 'CHANNEL_NOT_LINKED' });
    }
    const chatId = chan.id || (chan.username ? ('@' + chan.username) : null);
    if (!chatId) return res.status(400).json({ message: 'Invalid channel' });
    // Attach inline join button when message contains matchId pattern (optional: pass explicitly later)
    let replyMarkup = undefined;
    try {
      const m = text.match(/\/match\/(\w+)/);
      const matchId = m ? m[1] : null;
      if (matchId) {
        const origin = process.env.FRONTEND_URL || 'https://volleyxp.com';
        const url = `${origin.replace(/\/$/, '')}/match/${matchId}`;
        replyMarkup = { inline_keyboard: [[
          { text: 'Join match', callback_data: `join:${matchId}` },
          { text: 'View', url }
        ]] };
      }
    } catch {}
    await sendTelegramMessage({ chatId, text, replyMarkup, disableWebPagePreview: false });
    return res.json({ ok: true });
  } catch (e) {
    console.error('postToTelegramChannel error:', e?.response?.data || e);
    return res.status(500).json({ message: 'Server error' });
  }
};

// GET /api/users/profile-overview?page=1&pageSize=5
// Returns: { profile, summary: { total, wins, losses, winPct }, matches: { items: [...], total, totalPages, currentPage } }
const getProfileOverview = async (req, res) => {
  try {
    const meId = req.user?._id;
    const user = await User.findById(meId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    // Build summary from ratingHistory (games-based)
    const rh = Array.isArray(user.ratingHistory) ? user.ratingHistory : [];
    let totalFinished = 0;
    let sumWins = 0;
    let sumLosses = 0;
    const perMatchStats = new Map(); // matchId -> { wins, losses }
    for (const entry of rh) {
      const details = Array.isArray(entry?.details) ? entry.details : [];
      if (details.length === 0) continue; // not finished
      totalFinished += 1;
      let w = 0, l = 0;
      for (const g of details) {
        if (g?.score === 1) w += 1;
        else if (g?.score === 0) l += 1;
        // draws (0.5) do not affect wins/losses
      }
      sumWins += w; sumLosses += l;
      if (entry?.matchId) perMatchStats.set(String(entry.matchId), { wins: w, losses: l });
    }
    const gamesTotal = sumWins + sumLosses;
    const summary = { total: totalFinished, wins: sumWins, losses: sumLosses, winPct: gamesTotal ? sumWins / gamesTotal : 0 };

    // Pagination params
    const pageSize = Math.min(Math.max(parseInt(req.query.pageSize || '5', 10) || 5, 1), 50);
    const page = Math.max(parseInt(req.query.page || '1', 10) || 1, 1);

    // Fetch only matches where user is creator or participant, EXCLUDING trainings
    const query = { $or: [{ creator: meId }, { participants: meId }], type: { $ne: 'training' } };
    const total = await Match.countDocuments(query);
    const items = await Match.find(query)
      .select('title place level startDateTime status')
      .sort({ startDateTime: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .lean();

    // Attach per-match stats for finished ones, if available from ratingHistory
    const itemsWithStats = items.map((m) => {
      const id = String(m._id);
      const stat = perMatchStats.get(id) || null;
      return {
        _id: m._id,
        title: m.title,
        place: m.place,
        level: m.level,
        startDateTime: m.startDateTime,
        status: m.status,
        stats: stat
      };
    });

    const pageResp = {
      items: itemsWithStats,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      currentPage: page
    };

    return res.json({
      profile: {
        id: user._id,
        name: user.name,
        email: user.email,
        telegramId: user.telegramId,
        telegramUsername: user.telegramUsername,
        telegramChannel: user.telegramChannel,
        rating: user.rating,
        createdAt: user.createdAt,
        emailConfirmed: user.emailConfirmed,
        preferences: user.preferences
      },
      summary,
      matches: pageResp
    });
  } catch (e) {
    console.error('getProfileOverview error:', e);
    return res.status(500).json({ message: 'Server error' });
  }
};

// GET /api/users/profile-trainings?page=1&pageSize=5
// Returns trainings where the user is creator, participant, or coach
const getProfileTrainings = async (req, res) => {
  try {
    const meId = req.user?._id;
    const pageSize = Math.min(Math.max(parseInt(req.query.pageSize || '5', 10) || 5, 1), 50);
    const page = Math.max(parseInt(req.query.page || '1', 10) || 1, 1);
    const query = { type: 'training', $or: [{ creator: meId }, { participants: meId }, { coach: meId }] };
    const total = await Match.countDocuments(query);
    const items = await Match.find(query)
      .select('title place level startDateTime status coach')
      .populate('coach', 'name email')
      .sort({ startDateTime: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .lean();
    return res.json({ items, total, totalPages: Math.max(1, Math.ceil(total / pageSize)), currentPage: page });
  } catch (e) {
    console.error('getProfileTrainings error:', e);
    return res.status(500).json({ message: 'Server error' });
  }
};

module.exports = { updateProfile, getProfile, getPublicProfile, getMatchHistory, getMatchHistoryByUserId, getUserByEmail, addTelegramChannel, verifyTelegramChannel, deleteTelegramChannel, postToTelegramChannel, getProfileStatsAggregates, getProfileOverview, getProfileTrainings };