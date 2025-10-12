const User = require('../models/User');
const Match = require('../models/Match');
const { sendMail } = require('../utils/mail');
const jwt = require('jsonwebtoken');

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
      // Проверка на дубликат email (регистронезависимо)
      const existing = await User.findOne({ email: { $regex: new RegExp(`^${email}$`, 'i') } });
      if (existing) {
        return res.status(400).json({ message: 'Email уже используется другим пользователем' });
      }
      user.email = email;
      user.emailConfirmed = false;
      // отправить письмо подтверждения
      const token = generateEmailToken(user);
      const confirmUrl = `${process.env.FRONTEND_URL || 'https://volleyxp.com'}/confirm-email?token=${token}`;
      await sendMail({
        to: user.email,
        subject: 'Подтверждение email',
        text: `Перейдите по ссылке для подтверждения: ${confirmUrl}`,
        html: `<p>Перейдите по <a href='${confirmUrl}'>ссылке</a> для подтверждения email.</p>`
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
      rating: user.rating,
      createdAt: user.createdAt,
      emailConfirmed: user.emailConfirmed,
      preferences: user.preferences
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

// Публичный профиль пользователя (для просмотра другими игроками)
const getPublicProfile = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({
        error: 'Пользователь не найден',
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
      error: 'Внутренняя ошибка сервера',
      code: 'SERVER_ERROR'
    });
  }
};

// Получить пользователя по email (для админских функций)
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

// Получить историю матчей пользователя по ratingHistory
const getMatchHistory = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (!user.ratingHistory || user.ratingHistory.length === 0) return res.json([]);
    // Получаем все matchId из ratingHistory
    const matchIds = user.ratingHistory.map(rh => rh.matchId).filter(Boolean);
    // Получаем матчи одним запросом
    const matches = await Match.find({ _id: { $in: matchIds } }).populate('participants', 'name email');
    const now = new Date();
    // Формируем ответ
    const history = user.ratingHistory.map(rh => {
      const match = matches.find(m => m._id.toString() === rh.matchId?.toString());
      // Подсчёт побед/ничьих/поражений
      let wins = 0, draws = 0, losses = 0;
      if (Array.isArray(rh.details)) {
        rh.details.forEach(game => {
          if (game.score === 1) wins++;
          else if (game.score === 0.5) draws++;
          else if (game.score === 0) losses++;
        });
      }
      // Форматированная дата для бейджа
      let badgeDate = '';
      if (match?.startDateTime) {
        const d = new Date(match.startDateTime);
        badgeDate = isNaN(d) ? '' : d.toLocaleDateString('ru-RU');
      }
      // Можно ли редактировать результат (если прошло <24ч и пользователь в participants)
      let canEditResult = false;
      if (match?.startDateTime && Array.isArray(match.participants)) {
        const matchStart = new Date(match.startDateTime);
        const diffHours = (now - matchStart) / (1000 * 60 * 60);
        canEditResult = diffHours <= 24 && match.participants.some(p => p._id.toString() === user._id.toString());
      }
      // Массив участников (id, name, email)
      const participants = Array.isArray(match?.participants)
        ? match.participants.map(p => ({ id: p._id, name: p.name, email: p.email }))
        : [];
      // Ссылки (пример: ссылка на матч)
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

// Публичная история матчей по userId (маскируем email всех участников)
const getMatchHistoryByUserId = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({
        error: 'Пользователь не найден',
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
        badgeDate = isNaN(d) ? '' : d.toLocaleDateString('ru-RU');
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
      error: 'Внутренняя ошибка сервера',
      code: 'SERVER_ERROR'
    });
  }
};

module.exports = { updateProfile, getProfile, getPublicProfile, getMatchHistory, getMatchHistoryByUserId, getUserByEmail };