const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();

// CORS: управляем через CORS_ORIGINS (CSV список), иначе * в dev
const corsOrigins = (process.env.CORS_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
const corsOptions = corsOrigins.length > 0 ? {
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (corsOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('CORS not allowed from this origin'));
  },
  credentials: true,
} : {};
app.use(cors(corsOptions));
app.use(express.json());

// Инициализация Passport
const passport = require('./config/passport');
app.use(passport.initialize());

// Стартовый роут (ДОЛЖЕН БЫТЬ ПЕРВЫМ!)
app.get('/api/ping', (req, res) => {
  res.json({ message: 'pong' });
});

// Роуты
app.use('/api/auth', require('./routes/auth'));
app.use('/api/matches', require('./routes/matches'));
app.use('/api/results', require('./routes/results'));
app.use('/api/users', require('./routes/users'));
// ВАЖНО: более специфичный префикс должен идти раньше, иначе попадём в общий /api/admin
app.use('/api/admin/courts', require('./routes/courts'));
app.use('/api/admin', require('./routes/admin'));

// Публичные корты (чтение)
app.use('/api/courts', (req, res, next) => {
  // Делаем прокси на те же контроллеры, но без auth и только чтение
  if (req.method === 'GET') {
    // Переиспользуем контроллеры с безопасными параметрами
    const courtController = require('./controllers/courtController');
    if (req.path === '/' || req.path === '') {
      return courtController.getAllCourts(req, res);
    }
    // /:id и /:id/stats
    const parts = req.path.split('/').filter(Boolean);
    if (parts.length === 1) {
      req.params.id = parts[0];
      return courtController.getCourtById(req, res);
    }
    if (parts.length === 2 && parts[1] === 'stats') {
      req.params.id = parts[0];
      return courtController.getCourtStats(req, res);
    }
  }
  return res.status(405).json({ code: 'METHOD_NOT_ALLOWED' });
});

// Catch-all для несуществующих API-роутов: возвращает 404 и JSON с ошибкой
app.use('/api', (req, res) => {
  res.status(404).json({ code: 'NOT_FOUND', message: 'API route not found' });
});

// Подключение к MongoDB
const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI;
const JWT_SECRET = process.env.JWT_SECRET;

module.exports = app;

if (require.main === module) {
  if (!MONGODB_URI) {
    console.error('Ошибка: переменная окружения MONGODB_URI не задана!');
    process.exit(1);
  }
  if (!JWT_SECRET) {
    console.error('Ошибка: переменная окружения JWT_SECRET не задана!');
    process.exit(1);
  }
  const { connectDB } = require('./utils/db');
  
  connectDB()
    .then(() => {
      app.listen(PORT, () => console.log(`Server started on port ${PORT}`));
    })
    .catch(err => {
      console.error('Failed to start server:', err);
      process.exit(1);
    });
}
