const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User');
const { sendMail, sendPasswordResetMail } = require('../utils/mail');

// Регистрация
const register = async (req, res) => {
  try {
    const { email, name, password } = req.body;

    // Проверяем, существует ли пользователь (регистронезависимо)
    let user = await User.findOne({ email: { $regex: new RegExp(`^${email}$`, 'i') } });
    if (user) {
      return res.status(400).json({ message: 'User already exists' });
    }

    // Хэшируем пароль
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Создаем пользователя
    user = new User({
      email,
      name,
      password: hashedPassword,
      emailConfirmed: false,
      isTestUser: process.env.NODE_ENV === 'test' // true для тестов, false для продакшн
    });

    await user.save();

    // Send confirmation email
    const token = generateEmailToken(user);
    const confirmUrl = `${process.env.FRONTEND_URL || 'https://volleyxp.com'}/confirm-email?token=${token}`;
    await sendMail({
      to: user.email,
      subject: 'Email confirmation',
      text: `Follow the link to confirm your email: ${confirmUrl}`,
      html: `<p>Please follow this <a href='${confirmUrl}'>link</a> to confirm your email.</p>`
    });

    // Создаем JWT токен
    const tokenJwt = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Создаем refresh token
    const refreshToken = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.status(201).json({
      token: tokenJwt,
      refreshToken,
      user: {
        _id: user._id,
        id: user._id,
        email: user.email,
        name: user.name,
        createdAt: user.createdAt,
        isEmailConfirmed: user.emailConfirmed,
        rating: user.rating,
        ratingHistory: user.ratingHistory,
        telegramId: user.telegramId
      }
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Логин
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Проверяем, существует ли пользователь (регистронезависимо)
    const user = await User.findOne({ email: { $regex: new RegExp(`^${email}$`, 'i') } });
    if (!user) {
      return res.status(400).json({
        error: 'Invalid email or password',
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid email or password'
      });
    }

    // Проверяем пароль
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({
        error: 'Invalid email or password',
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid email or password'
      });
    }

    // Обновляем время последнего входа
    user.lastLoginAt = new Date();
    await user.save();

    // Создаем JWT токен
    const token = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Создаем refresh token
    const refreshToken = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.json({
      token,
      refreshToken,
      user: {
        _id: user._id,
        id: user._id,
        email: user.email,
        name: user.name,
        createdAt: user.createdAt,
        isEmailConfirmed: user.emailConfirmed,
        rating: user.rating,
        ratingHistory: user.ratingHistory,
        telegramId: user.telegramId
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Получить текущего пользователя
const getMe = async (req, res) => {
  try {
    res.json({
      _id: req.user._id,
      id: req.user._id,
      email: req.user.email,
      name: req.user.name,
      createdAt: req.user.createdAt,
      telegramId: req.user.telegramId,
      telegramUsername: req.user.telegramUsername,
      role: req.user.role, // legacy
      roles: Array.isArray(req.user.roles) && req.user.roles.length > 0 ? req.user.roles : [req.user.role],
      permissions: req.user.permissions,
      managedCourts: req.user.managedCourts
    });
  } catch (error) {
    console.error('Get me error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Generate email confirmation token
function generateEmailToken(user) {
  return jwt.sign(
    { userId: user._id, email: user.email },
    process.env.EMAIL_CONFIRM_SECRET || 'email_secret',
    { expiresIn: '1d' }
  );
}

// POST /auth/send-confirmation
const sendConfirmation = async (req, res) => {
  try {
    const user = req.user; // предполагается, что user уже в req (auth middleware)
    if (!user || !user.email) return res.status(400).json({ message: 'No user/email' });
    const token = generateEmailToken(user);
    const confirmUrl = `${process.env.FRONTEND_URL || 'https://volleyxp.com'}/confirm-email?token=${token}`;
    await sendMail({
      to: user.email,
      subject: 'Email confirmation',
      text: `Follow the link to confirm your email: ${confirmUrl}`,
      html: `<p>Please follow this <a href='${confirmUrl}'>link</a> to confirm your email.</p>`
    });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ message: 'Email sending error', error: e.message });
  }
};

// GET /auth/confirm-email?token=...
const confirmEmail = async (req, res) => {
  try {
    const token = req.method === 'GET' ? req.query.token : req.body.token;
    if (!token) return res.status(400).json({ message: 'No token' });
    let payload;
    try {
      payload = jwt.verify(token, process.env.EMAIL_CONFIRM_SECRET || 'email_secret');
    } catch (e) {
      return res.status(400).json({ message: 'Invalid or expired token' });
    }
    const user = await User.findOne({ _id: payload.userId, email: payload.email });
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (user.emailConfirmed) return res.json({ ok: true, alreadyConfirmed: true });
    user.emailConfirmed = true;
    await user.save();
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ message: 'Confirmation error', error: e.message });
  }
};

// POST /auth/request-password-reset
const requestPasswordReset = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: 'Email is required' });
    const user = await User.findOne({ email: { $regex: new RegExp(`^${email}$`, 'i') } });
    if (!user) return res.status(200).json({ ok: true }); // Не палим, есть ли email
    const token = jwt.sign(
      { userId: user._id, email: user.email },
      process.env.RESET_PASSWORD_SECRET || 'reset_secret',
      { expiresIn: '1h' }
    );
    user.resetPasswordToken = token;
    user.resetPasswordTokenExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 час
    await user.save();
    const resetUrl = `${process.env.FRONTEND_URL || 'https://volleyxp.com'}/reset-password?token=${token}`;
    await sendPasswordResetMail({ to: user.email, resetUrl });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ message: 'Email sending error', error: e.message });
  }
};

// POST /auth/reset-password
const resetPassword = async (req, res) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) return res.status(400).json({ message: 'Token and new password are required' });
    let payload;
    try {
      payload = jwt.verify(token, process.env.RESET_PASSWORD_SECRET || 'reset_secret');
    } catch (e) {
      return res.status(400).json({ message: 'Invalid or expired token' });
    }
    const user = await User.findOne({ _id: payload.userId, email: payload.email });
    if (!user) return res.status(404).json({ message: 'User not found' });
    // Проверяем, что токен совпадает и не истёк
    if (!user.resetPasswordToken || user.resetPasswordToken !== token) {
      return res.status(400).json({ message: 'Token already used or invalid' });
    }
    if (!user.resetPasswordTokenExpires || user.resetPasswordTokenExpires < new Date()) {
      return res.status(400).json({ message: 'Token expired' });
    }
    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(password, salt);
    // Инвалидируем токен
    user.resetPasswordToken = undefined;
    user.resetPasswordTokenExpires = undefined;
    await user.save();
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ message: 'Password reset error', error: e.message });
  }
};

// Авторизация через Telegram
const telegramAuth = async (req, res) => {
  try {
    const { telegramUser, telegramInitData, telegramAuthPayload } = req.body || {};
    // Verify Telegram signature when possible
    const verified = verifyTelegramLogin({ telegramInitData, telegramAuthPayload });
    if (!verified.ok) {
      // Allow in absence of BOT TOKEN (e.g., local dev) but warn
      if (process.env.TELEGRAM_BOT_TOKEN) {
        return res.status(400).json({ message: verified.message || 'Invalid Telegram signature' });
      } else {
        console.warn('[TelegramAuth] Skipping signature verification because TELEGRAM_BOT_TOKEN is not set. DO NOT USE IN PROD');
      }
    }
    const saneTelegramUser = verified.user || telegramUser;
    
    if (!saneTelegramUser || !saneTelegramUser.id) {
      return res.status(400).json({ message: 'Invalid Telegram user data' });
    }

    // Ищем пользователя по Telegram ID
    let user = await User.findOne({ telegramId: saneTelegramUser.id });
    
    if (!user) {
      // Создаем нового пользователя
      user = new User({
        name: saneTelegramUser.name || `${saneTelegramUser.first_name || ''}${saneTelegramUser.last_name ? ' ' + saneTelegramUser.last_name : ''}`.trim() || 'Telegram User',
        email: `tg_${saneTelegramUser.id}@telegram.local`,
        telegramId: saneTelegramUser.id,
        telegramUsername: saneTelegramUser.username,
        rating: 2.0,
        ratingHistory: []
      });
      await user.save();
    }

    // Обновляем время последнего входа для Telegram пользователей
    user.lastLoginAt = new Date();
    await user.save();

    // Генерируем JWT токен
    const token = jwt.sign(
      { userId: user._id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );

    // Создаем refresh token
    const refreshToken = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.json({
      token,
      refreshToken,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        rating: user.rating,
        telegramId: user.telegramId
      }
    });
  } catch (error) {
    console.error('Telegram auth error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Привязка существующего аккаунта к Telegram
const linkTelegramAccount = async (req, res) => {
  try {
    const { email, password, telegramUser, telegramInitData, telegramAuthPayload, force } = req.body || {};
    // Verify Telegram signature when possible
    const verified = verifyTelegramLogin({ telegramInitData, telegramAuthPayload });
    if (!verified.ok) {
      if (process.env.TELEGRAM_BOT_TOKEN) {
        return res.status(400).json({ message: verified.message || 'Invalid Telegram signature' });
      } else {
        console.warn('[LinkTelegram] Skipping signature verification because TELEGRAM_BOT_TOKEN is not set. DO NOT USE IN PROD');
      }
    }
    const saneTelegramUser = verified.user || telegramUser;
    
    if (!email || !password || !saneTelegramUser || !saneTelegramUser.id) {
      return res.status(400).json({ message: 'Email, password and Telegram user data are required' });
    }

    // Проверяем существующего пользователя
    const user = await User.findOne({ email: { $regex: new RegExp(`^${email}$`, 'i') } });
    if (!user) {
      return res.status(400).json({ message: 'User not found' });
    }

    // Проверяем пароль
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid password' });
    }

    // Проверяем, не привязан ли уже этот Telegram ID к другому аккаунту
    const existingTelegramUser = await User.findOne({ telegramId: saneTelegramUser.id });
    if (existingTelegramUser && existingTelegramUser._id.toString() !== user._id.toString()) {
      // Если force и telegram-only аккаунт — удаляем его и продолжаем
      if (
        force === true &&
        existingTelegramUser.email &&
        existingTelegramUser.email.startsWith('tg_') &&
        existingTelegramUser.email.endsWith('@telegram.local') &&
        (!existingTelegramUser.password || existingTelegramUser.password === '')
      ) {
        await User.deleteOne({ _id: existingTelegramUser._id });
      } else {
        return res.status(400).json({ message: 'This Telegram account is already linked to another user' });
      }
    }

    // Привязываем Telegram ID к существующему аккаунту
    user.telegramId = saneTelegramUser.id;
    user.telegramUsername = saneTelegramUser.username;
    
    // Обновляем имя, если оно не было установлено
    if (!user.name || user.name === 'User') {
      user.name = saneTelegramUser.name || `${saneTelegramUser.first_name || ''}${saneTelegramUser.last_name ? ' ' + saneTelegramUser.last_name : ''}`.trim() || user.name;
    }
    
    await user.save();

    // Генерируем JWT токен
    const token = jwt.sign(
      { userId: user._id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.json({
      token,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        rating: user.rating,
        telegramId: user.telegramId
      }
    });
  } catch (error) {
    console.error('Link Telegram error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};



module.exports = {
  register,
  login,
  getMe,
  sendConfirmation,
  confirmEmail,
  requestPasswordReset,
  resetPassword,
  telegramAuth,
  linkTelegramAccount
}; 

// --- Helpers ---
function verifyTelegramLogin({ telegramInitData, telegramAuthPayload }) {
  try {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) {
      return { ok: false, message: 'Missing TELEGRAM_BOT_TOKEN' };
    }
    if (telegramInitData && typeof telegramInitData === 'string') {
      return verifyInitDataString(telegramInitData, botToken);
    }
    if (telegramAuthPayload && typeof telegramAuthPayload === 'object') {
      return verifyPayloadObject(telegramAuthPayload, botToken);
    }
    // Fallback: if only telegramUser was passed, we cannot verify
    return { ok: false, message: 'No Telegram signature provided' };
  } catch (e) {
    return { ok: false, message: e?.message || 'Verification error' };
  }
}

function verifyInitDataString(initData, botToken) {
  // initData is a querystring-like string: key=value&key=value
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return { ok: false, message: 'No hash in initData' };
  params.delete('hash');
  // Build data_check_string from remaining params in alphabetical order of keys
  const entries = [];
  for (const [k, v] of params.entries()) entries.push(`${k}=${v}`);
  entries.sort();
  const dataCheckString = entries.join('\n');
  const secretKey = crypto.createHash('sha256').update(botToken).digest();
  const hmac = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
  if (hmac !== hash) return { ok: false, message: 'Invalid hash' };
  // Freshness check (optional but recommended)
  const authDate = Number(params.get('auth_date') || '0');
  if (authDate && Math.abs(Date.now() / 1000 - authDate) > 24 * 60 * 60) {
    return { ok: false, message: 'Auth data expired' };
  }
  // Extract user json if present
  let userObj;
  const userStr = params.get('user');
  if (userStr) {
    try { userObj = JSON.parse(userStr); } catch {}
  }
  return { ok: true, user: normalizeTelegramUser(userObj) };
}

function verifyPayloadObject(payload, botToken) {
  // payload contains fields like id, first_name, last_name, username, photo_url, auth_date, hash
  const { hash, ...rest } = payload || {};
  if (!hash) return { ok: false, message: 'No hash in payload' };
  const pairs = Object.keys(rest)
    .filter((k) => rest[k] !== undefined && rest[k] !== null)
    .sort()
    .map((k) => `${k}=${rest[k]}`);
  const dataCheckString = pairs.join('\n');
  const secretKey = crypto.createHash('sha256').update(botToken).digest();
  const hmac = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
  if (hmac !== hash) return { ok: false, message: 'Invalid hash' };
  const authDate = Number(rest.auth_date || '0');
  if (authDate && Math.abs(Date.now() / 1000 - authDate) > 24 * 60 * 60) {
    return { ok: false, message: 'Auth data expired' };
  }
  return { ok: true, user: normalizeTelegramUser(rest) };
}

function normalizeTelegramUser(u) {
  if (!u) return null;
  const id = typeof u.id === 'string' ? Number(u.id) : u.id;
  return {
    id,
    username: u.username,
    first_name: u.first_name,
    last_name: u.last_name,
    name: u.name || [u.first_name, u.last_name].filter(Boolean).join(' ').trim(),
  };
}