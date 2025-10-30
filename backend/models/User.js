const mongoose = require('mongoose');

/**
 * ratingHistorySchema — история изменения рейтинга пользователя.
 * @property {Date} date — дата изменения рейтинга
 * @property {number} delta — изменение рейтинга за матч
 * @property {number} newRating — новый рейтинг пользователя после матча
 * @property {ObjectId} matchId — ссылка на матч
 * @property {string} comment — комментарий к изменению рейтинга
 * @property {Array<Object>} details — подробности по играм в матче
 *   @property {number} details[].gameIndex — номер игры в матче
 *   @property {string[]} details[].team1 — участники первой команды
 *   @property {string[]} details[].team2 — участники второй команды
 *   @property {number} details[].team1Score — счёт первой команды
 *   @property {number} details[].team2Score — счёт второй команды
 *   @property {string} details[].userTeam — команда пользователя
 *   @property {number} details[].userAvg — средний рейтинг команды пользователя
 *   @property {number} details[].oppAvg — средний рейтинг соперников
 *   @property {number} details[].expected — ожидаемый результат
 *   @property {number} details[].score — фактический результат
 *   @property {number} details[].delta — изменение рейтинга за игру
 */
const ratingHistorySchema = new mongoose.Schema({
  date: { type: Date, default: Date.now },
  delta: Number,
  newRating: Number,
  matchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Match' },
  comment: String,
  // Рейтинг пользователя на момент входа в матч
  joinRating: Number,
  details: [
    {
      gameIndex: Number,
      team1: [String],
      team2: [String],
      team1Score: Number,
      team2Score: Number,
      userTeam: String,
      userAvg: Number,
      oppAvg: Number,
      expected: Number,
      score: Number,
      delta: Number
    }
  ]
}, { _id: false });

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String }, // Делаем необязательным для Telegram пользователей
  telegramId: { type: Number, unique: true, sparse: true }, // Telegram ID
  telegramUsername: { type: String }, // Telegram username
  // Прямой канал общения с пользователем через бота
  telegramChatId: { type: String, unique: true, sparse: true }, // chat_id из Telegram (как строка)
  telegramLanguage: { type: String }, // language_code, например: 'en', 'ru'
  tgLinkedAt: { type: Date }, // когда привязали Telegram
  // Канал Telegram для уведомлений (один на пользователя)
  telegramChannel: {
    type: new mongoose.Schema({
      id: { type: String }, // numeric id as string (can be negative for channels)
      username: { type: String }, // @channel username without @
      title: { type: String },
      linked: { type: Boolean, default: false }, // бот состоит в канале
      addedAt: { type: Date },
      verifiedAt: { type: Date }
    }, { _id: false }),
    default: undefined
  },
  // Согласия пользователя на типы уведомлений в Telegram
  notificationConsents: {
    type: new mongoose.Schema({
      tgReminders: { type: Boolean, default: false }, // напоминания о матчах/резервациях
      tgResults: { type: Boolean, default: false },   // результаты матчей
      tgAdmin: { type: Boolean, default: false }      // админ-алерты/системные сообщения
    }, { _id: false }),
    default: undefined
  },
  googleId: { type: String, unique: true, sparse: true }, // Google ID
  rating: { type: Number, default: 2.0 },
  ratingHistory: [ratingHistorySchema],
  createdAt: { type: Date, default: Date.now },
  emailConfirmed: { type: Boolean, default: false },
  resetPasswordToken: { type: String },
  resetPasswordTokenExpires: { type: Date },
  
  // Административные поля
  role: { 
    type: String, 
    enum: ['player', 'coach', 'court_admin', 'admin_view', 'super_admin'], 
    default: 'player' 
  },
  // Новый формат ролей (множественные роли) — используется совместно со старым полем role
  roles: {
    type: [String],
    default: undefined, // не заполняем автоматически, чтобы не ломать существующие документы; миграция проставит
    enum: ['player', 'coach', 'court_admin', 'admin_view', 'super_admin']
  },
  permissions: [String], // Дополнительные разрешения
  managedCourts: [String], // Для court_admin - какие корты управляет
  isBlocked: { type: Boolean, default: false }, // Блокировка аккаунта
  lastLoginAt: { type: Date }, // Последний вход
  notes: { type: String }, // Административные заметки
  isTestUser: { type: Boolean, default: false } // Флаг тестового пользователя
  ,
  // Пользовательские настройки/предпочтения
  preferences: {
    profileFilters: {
      hideFinishedNoResult: { type: Boolean, default: true },
      hideCancelled: { type: Boolean, default: true }
    }
  },
  // Настройки тренера (для пользователей с ролью coach)
  coachSettings: {
    allowedCreators: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], // пользователи, которым разрешено создавать тренировки с этим тренером
  }
});

// Определяем приоритет основой роли при наличии нескольких
function determinePrimaryRole(roles) {
  if (!Array.isArray(roles) || roles.length === 0) return 'player';
  // Приоритет: super_admin > court_admin > coach > admin_view > player
  if (roles.includes('super_admin')) return 'super_admin';
  if (roles.includes('court_admin')) return 'court_admin';
  if (roles.includes('coach')) return 'coach';
  if (roles.includes('admin_view')) return 'admin_view';
  return 'player';
}

// Перед сохранением поддерживаем legacy поле role в соответствии с roles
userSchema.pre('save', function(next) {
  try {
    if (Array.isArray(this.roles) && this.roles.length > 0) {
      this.role = determinePrimaryRole(this.roles);
    } else if (!this.role) {
      this.role = 'player';
    }
    next();
  } catch (e) {
    next(e);
  }
});

// Индексы для оптимизации производительности
// userSchema.index({ email: 1 }); // Убрано - уже есть unique: true в поле
// userSchema.index({ telegramId: 1 }); // Убрано - уже есть unique: true, sparse: true в поле
userSchema.index({ 'ratingHistory.matchId': 1 }); // Поиск истории по матчам
userSchema.index({ rating: -1 }); // Сортировка по рейтингу
userSchema.index({ resetPasswordToken: 1 }); // Поиск токенов сброса пароля
userSchema.index({ resetPasswordTokenExpires: 1 }); // TTL для токенов
userSchema.index({ role: 1 }); // Поиск по ролям
userSchema.index({ roles: 1 }); // Поиск по новым ролям
userSchema.index({ isBlocked: 1 }); // Фильтрация заблокированных
userSchema.index({ isTestUser: 1 }); // Фильтрация тестовых пользователей
userSchema.index({ lastLoginAt: -1 }); // Сортировка по последнему входу
userSchema.index({ createdAt: -1 }); // Сортировка по дате регистрации
// Быстрые проверки по телеграм-каналам
userSchema.index({ 'telegramChannel.id': 1 });
userSchema.index({ 'telegramChannel.username': 1 });

module.exports = mongoose.model('User', userSchema); 