const express = require('express');
const router = express.Router();
const { register, login, getMe, sendConfirmation, requestPasswordReset, resetPassword, telegramAuth, linkTelegramAccount, linkTelegramForAuthed } = require('../controllers/authController');
const auth = require('../middleware/auth');
const passport = require('passport');
const jwt = require('jsonwebtoken');

// POST /api/auth/register
router.post('/register', register);

// POST /api/auth/login
router.post('/login', login);

// POST /api/auth/telegram
router.post('/telegram', telegramAuth);

// POST /api/auth/link-telegram
router.post('/link-telegram', linkTelegramAccount);

// POST /api/auth/link-telegram-authed (JWT)
router.post('/link-telegram-authed', auth, linkTelegramForAuthed);

// POST /api/auth/refresh - Refresh token endpoint
router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;
    
    if (!refreshToken) {
      return res.status(400).json({ message: 'Refresh token is required' });
    }

    // Проверяем refresh token
    const decoded = jwt.verify(refreshToken, process.env.JWT_SECRET);
    
    // Получаем пользователя
    const User = require('../models/User');
    const user = await User.findById(decoded.userId).select('-password');
    
    if (!user) {
      return res.status(401).json({ message: 'Invalid refresh token' });
    }

    // Генерируем новые токены
    const newToken = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    const newRefreshToken = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.json({
      token: newToken,
      refreshToken: newRefreshToken,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        isEmailConfirmed: user.isEmailConfirmed,
        rating: user.rating,
        ratingHistory: user.ratingHistory,
        telegramId: user.telegramId
      }
    });
  } catch (error) {
    console.error('Refresh token error:', error);
    res.status(401).json({ message: 'Invalid refresh token' });
  }
});

// Google OAuth routes
// Старт: поддержка redirectBase через state
router.get('/google', (req, res, next) => {
  const { redirectBase } = req.query;

  // Белый список допустимых фронтов из окружения (CSV)
  const defaultFrontend = process.env.NODE_ENV === 'development'
    ? (process.env.FRONTEND_URL || 'http://localhost:5174')
    : (process.env.FRONTEND_URL || 'https://volleyxp.com');
  const envAllowed = (process.env.ALLOWED_FRONTENDS || '')
    .split(',').map(s => s.trim()).filter(Boolean);
  const allowedFrontends = new Set([defaultFrontend, ...envAllowed]);

  let state;
  if (redirectBase && allowedFrontends.has(redirectBase)) {
    // Кодируем только допустимые значения
    state = encodeURIComponent(redirectBase);
  }

  return passport.authenticate('google', {
    scope: ['profile', 'email'],
    state,
  })(req, res, next);
});

router.get('/google/callback', passport.authenticate('google', { session: false }), (req, res) => {
  // Генерируем JWT токен
  const token = jwt.sign(
    { userId: req.user._id },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );

  // Генерируем refresh token
  const refreshToken = jwt.sign(
    { userId: req.user._id },
    process.env.JWT_SECRET,
    { expiresIn: '30d' }
  );

  // Редирект на фронтенд с токеном
  const defaultFrontend = process.env.NODE_ENV === 'development'
    ? (process.env.FRONTEND_URL || 'http://localhost:5174')
    : (process.env.FRONTEND_URL || 'https://volleyxp.com');

  const envAllowed = (process.env.ALLOWED_FRONTENDS || '')
    .split(',').map(s => s.trim()).filter(Boolean);
  const allowedFrontends = new Set([defaultFrontend, ...envAllowed]);

  // Пытаемся прочитать redirectBase из state, если передавали
  let redirectBase;
  try {
    if (req.query && req.query.state) {
      const decoded = decodeURIComponent(req.query.state);
      if (allowedFrontends.has(decoded)) {
        redirectBase = decoded;
      }
    }
  } catch (e) {
    // Игнорируем и используем стандартный редирект
  }

  const finalFrontend = redirectBase || defaultFrontend;
  const redirectUrl = `${finalFrontend}/auth/google-callback?token=${token}&refreshToken=${refreshToken}`;
  res.redirect(redirectUrl);
});

// GET /api/auth/me
router.get('/me', auth, getMe);

// POST /api/auth/send-confirmation
router.post('/send-confirmation', auth, sendConfirmation);

// GET /api/auth/confirm-email
router.get('/confirm-email', require('../controllers/authController').confirmEmail);

// POST /api/auth/confirm-email
router.post('/confirm-email', require('../controllers/authController').confirmEmail);

// POST /api/auth/request-password-reset
router.post('/request-password-reset', requestPasswordReset);

// POST /api/auth/reset-password
router.post('/reset-password', resetPassword);

module.exports = router; 