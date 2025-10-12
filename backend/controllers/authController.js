const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
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

    // Отправляем письмо подтверждения
    const token = generateEmailToken(user);
    const confirmUrl = `${process.env.FRONTEND_URL || 'https://volleyxp.com'}/confirm-email?token=${token}`;
    await sendMail({
      to: user.email,
      subject: 'Подтверждение email',
      text: `Перейдите по ссылке для подтверждения: ${confirmUrl}`,
      html: `<p>Перейдите по <a href='${confirmUrl}'>ссылке</a> для подтверждения email.</p>`
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
        error: 'Неверный email или пароль',
        code: 'INVALID_CREDENTIALS',
        message: 'Неверный email или пароль'
      });
    }

    // Проверяем пароль
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({
        error: 'Неверный email или пароль',
        code: 'INVALID_CREDENTIALS',
        message: 'Неверный email или пароль'
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

// Генерация токена подтверждения email
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
      subject: 'Подтверждение email',
      text: `Перейдите по ссылке для подтверждения: ${confirmUrl}`,
      html: `<p>Перейдите по <a href='${confirmUrl}'>ссылке</a> для подтверждения email.</p>`
    });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ message: 'Ошибка отправки письма', error: e.message });
  }
};

// GET /auth/confirm-email?token=...
const confirmEmail = async (req, res) => {
  try {
    const token = req.method === 'GET' ? req.query.token : req.body.token;
    if (!token) return res.status(400).json({ message: 'Нет токена' });
    let payload;
    try {
      payload = jwt.verify(token, process.env.EMAIL_CONFIRM_SECRET || 'email_secret');
    } catch (e) {
      return res.status(400).json({ message: 'Некорректный или просроченный токен' });
    }
    const user = await User.findOne({ _id: payload.userId, email: payload.email });
    if (!user) return res.status(404).json({ message: 'Пользователь не найден' });
    if (user.emailConfirmed) return res.json({ ok: true, alreadyConfirmed: true });
    user.emailConfirmed = true;
    await user.save();
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ message: 'Ошибка подтверждения', error: e.message });
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
    res.status(500).json({ message: 'Ошибка отправки письма', error: e.message });
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
    const { telegramUser } = req.body;
    
    if (!telegramUser || !telegramUser.id) {
      return res.status(400).json({ message: 'Invalid Telegram user data' });
    }

    // Ищем пользователя по Telegram ID
    let user = await User.findOne({ telegramId: telegramUser.id });
    
    if (!user) {
      // Создаем нового пользователя
      user = new User({
        name: telegramUser.name || `${telegramUser.first_name}${telegramUser.last_name ? ' ' + telegramUser.last_name : ''}`,
        email: `tg_${telegramUser.id}@telegram.local`,
        telegramId: telegramUser.id,
        telegramUsername: telegramUser.username,
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
    const { email, password, telegramUser, force } = req.body;
    
    if (!email || !password || !telegramUser || !telegramUser.id) {
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
    const existingTelegramUser = await User.findOne({ telegramId: telegramUser.id });
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
    user.telegramId = telegramUser.id;
    user.telegramUsername = telegramUser.username;
    
    // Обновляем имя, если оно не было установлено
    if (!user.name || user.name === 'User') {
      user.name = telegramUser.name || `${telegramUser.first_name}${telegramUser.last_name ? ' ' + telegramUser.last_name : ''}`;
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