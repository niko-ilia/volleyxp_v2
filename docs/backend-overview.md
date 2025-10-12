## Backend overview

Обновлено: 2025-10-12

### Технологии и устройство
- **Стек**: Node.js + Express, MongoDB (Mongoose), JWT, Passport (Google OAuth 2.0), Mailgun.
- **Точка входа**: `backend/server.js`.
- **Префикс API**: все эндпоинты под `/api`.
- **Маршрутизация**: группы роутов в `backend/routes/*` и контроллеры в `backend/controllers/*`.
- **Аутентификация**: JWT (Bearer в заголовке `Authorization`), refresh-токены. Дополнительно Google OAuth и Telegram.
- **Роли и доступ**: роли `player`, `admin_view`, `court_admin`, `super_admin`; middleware в `backend/middleware/adminAuth.js`.

### Базовые URL
- Dev (через `start-dev.sh`):
  - Backend: `http://localhost:3000`
  - Frontend: `http://localhost:5174`
- Prod/Stage:
  - Backend порт задается `PORT` (по умолчанию 3000, либо платформенный). API доступен по `<host>/api`.

Здоровье:
```http
GET /api/ping -> { "message": "pong" }
```

### Middleware
- `backend/middleware/auth.js`: проверка JWT из `Authorization: Bearer <token>`, добавляет `req.user`.
- `backend/middleware/adminAuth.js`:
  - `requireSuperAdmin`
  - `requireAdminView` (просмотр админки без изменений)
  - `requireCourtAccess` (проверка управления указанным кортом)
  - `requirePermission(permission)` (точечные права)
  - `logAdminAction(action)` (логирует действие и метаданные в консоль)
- `backend/config/passport.js`: интеграция Google OAuth 2.0.

### Аутентификация и OAuth
- JWT: создается на логине/регистрации/телеграм/гугл, хранится на клиенте, отправляется в `Authorization: Bearer`.
- Refresh токен: `POST /api/auth/refresh` (в теле: `{ refreshToken }`) -> новые `token` и `refreshToken`.
- Google OAuth:
  - `GET /api/auth/google?redirectBase=<allowed>` — начало потока, `redirectBase` whitelisted.
  - `GET /api/auth/google/callback` — редиректит на фронт: `/auth/google-callback?token=...&refreshToken=...`.
- Email подтверждение: `POST /api/auth/send-confirmation`, `GET|POST /api/auth/confirm-email?token=...`.
- Сброс пароля: `POST /api/auth/request-password-reset`, `POST /api/auth/reset-password`.
- Telegram: `POST /api/auth/telegram`, `POST /api/auth/link-telegram` (линк существующего аккаунта; поддерживает `force`).

### Группы эндпоинтов

#### Auth (`/api/auth`)
```text
POST   /api/auth/register                   — регистрация (создает token/refreshToken)
POST   /api/auth/login                      — логин (token/refreshToken)
POST   /api/auth/refresh                    — обновление токенов по refreshToken
GET    /api/auth/google                     — старт Google OAuth (passport)
GET    /api/auth/google/callback            — callback Google; редирект на фронт с токенами
GET    /api/auth/me                         — [auth] текущий пользователь
POST   /api/auth/send-confirmation          — [auth] отправка письма подтверждения email
GET    /api/auth/confirm-email              — подтверждение email по токену
POST   /api/auth/confirm-email              — подтверждение email по токену
POST   /api/auth/request-password-reset     — запрос сброса пароля
POST   /api/auth/reset-password             — сброс пароля
POST   /api/auth/telegram                   — Telegram вход/создание tg-only пользователя
POST   /api/auth/link-telegram              — линк tg к существующему аккаунту (поддержка force)
```

Ответы (основные):
```json
// login/register/telegram/link-telegram/refresh
{
  "token": "...",
  "refreshToken": "...",
  "user": { "_id": "...", "email": "...", "name": "...", ... }
}
```

#### Users (`/api/users`)
```text
GET    /api/users/:id/public                — публичный профиль (masked email)
GET    /api/users/:id/match-history         — публичная история матчей пользователя

// ниже только [auth]
GET    /api/users/profile                   — получить профиль
PUT    /api/users/profile                   — обновить профиль (частично; email триггерит re-confirm)
GET    /api/users/match-history             — история матчей по собственной ratingHistory
GET    /api/users/email/:email              — получить пользователя по email
GET    /api/users/search?q=...              — быстрый поиск по имени/email (умная сортировка)
```

Ответы (примеры):
```json
// getProfile
{ "id": "...", "name": "...", "email": "...", "rating": 2.0, ... }

// public profile
{ "item": { "id": "...", "name": "...", "emailMasked": "na***@domain" } }
```

#### Matches (`/api/matches`) [auth]
```text
POST   /api/matches                         — создать матч (creator auto-join)
GET    /api/matches                         — список матчей (поддержка future=1; приватные — только участникам)
GET    /api/matches/:id                     — матч по id
POST   /api/matches/:id/join                — присоединиться (ограничения по времени/вместимости)
POST   /api/matches/:id/add-player          — добавить игрока (creator или admin/court_admin с доступом)
POST   /api/matches/:id/leave               — выйти (creator не может)
DELETE /api/matches/:id/participants/:pid   — удалить участника (creator/admin, с ограничениями)
PATCH  /api/matches/:id                     — action=delete|cancel (см. правила в контроллере)
```

Поля создания матча: `title, description, place | courtId, startDateTime, duration, level, maxParticipants?, isPrivate?`.

#### Results (`/api/results`) [auth]
```text
POST   /api/results                         — создать черновик результата (matchId, games[])
GET    /api/results                         — список результатов
GET    /api/results/:matchId                — результат по матчу
GET    /api/results/:matchId/stats          — агрегированная статистика по результату
PUT    /api/results/:resultId               — обновить черновик результата
POST   /api/results/:resultId/confirm       — подтвердить результат (24ч от старта), пересчёт рейтингов
DELETE /api/results/:resultId               — удалить результат (24ч от старта)
```

Пересчёт рейтингов: `backend/utils/rating.js` (Эло-подобная формула per-game, K=0.1, учитывает joinRating).

#### Admin (`/api/admin`) [auth]
- Все admin эндпоинты требуют минимум `admin_view` (просмотр) или `super_admin` (изменения). См. каждую строку.

```text
// Users
GET    /api/admin/users                     — [admin_view] список пользователей (фильтры/сортировка)
GET    /api/admin/users/:id/stats           — [admin_view] персональная статистика
PUT    /api/admin/users/:id/role            — [super_admin] задать роли/permissions/managedCourts
POST   /api/admin/users/:id/block           — [super_admin] блокировка
POST   /api/admin/users/:id/unblock         — [super_admin] разблокировка
DELETE /api/admin/users/:id                 — [super_admin] удалить
POST   /api/admin/users/:id/reset-password  — [super_admin] сброс пароля
POST   /api/admin/users/merge               — [super_admin] объединить аккаунты

// Matches
GET    /api/admin/matches                   — [admin_view] список матчей (фильтры/сортировка)
DELETE /api/admin/matches/:id               — [super_admin] принудительно удалить матч (+чистка результатов/истории)
POST   /api/admin/matches/:id/cancel        — [super_admin] принудительно отменить матч
PUT    /api/admin/matches/:id/result        — [super_admin] задать/обновить результат

// Analytics
GET    /api/admin/analytics/overview        — [admin_view] общая панель
GET    /api/admin/analytics/users           — [admin_view] пользовательская аналитика
GET    /api/admin/analytics/matches         — [admin_view] аналитика матчей
GET    /api/admin/analytics/activity        — [admin_view] активность

// Settings
GET    /api/admin/settings                  — [admin_view] текущие настройки (заглушка)
PUT    /api/admin/settings                  — [super_admin] обновить настройки (заглушка)

// Export
GET    /api/admin/export/users              — [admin_view] экспорт пользователей (JSON payload)
GET    /api/admin/export/matches            — [admin_view] экспорт матчей (JSON payload)
```

#### Courts: Admin (`/api/admin/courts`) и Public (`/api/courts`)
Admin (все [auth]; доступ по ролям):
```text
GET    /api/admin/courts                    — [super_admin] список всех кортов (пагинация/фильтры)
GET    /api/admin/courts/mine               — [court_admin|super_admin] корты под управлением
GET    /api/admin/courts/:id                — [court_access] корт по id
POST   /api/admin/courts                    — [super_admin] создать корт
PUT    /api/admin/courts/:id                — [court_access] обновить корт
DELETE /api/admin/courts/:id                — [court_access] мягкое удаление
POST   /api/admin/courts/:id/assign-manager — [super_admin] назначить менеджера
POST   /api/admin/courts/:id/assign-owner   — [super_admin] назначить владельца
GET    /api/admin/courts/:id/stats          — [court_access] статистика
GET    /api/admin/courts/:id/schedule       — [court_access] расписание (+матчи как busy-слоты)
POST   /api/admin/courts/:id/reservations   — [court_access] создать резервацию
PUT    /api/admin/courts/:id/reservations/:reservationId    — [court_access] обновить
DELETE /api/admin/courts/:id/reservations/:reservationId    — [court_access] удалить
```

Public (только GET, без авторизации; проксируется теми же контроллерами):
```text
GET    /api/courts                          — список кортов (поиск/фильтры/пагинация)
GET    /api/courts/:id                      — корт по id
GET    /api/courts/:id/stats                — статистика корта
```

### Форматы ответов и ошибки
- Списки: `{ items: [], total, totalPages, currentPage }` или специализированные ключи (`courts`, `users`, `matches` и т.п.) — фронт поддерживает оба варианта в разных местах.
- Один элемент: `{ item: {} }` либо сам объект.
- Действие/успех: `{ success: true, message: '...' }`.
- Ошибки: HTTP статус + `{ error?: 'Сообщение на русском', code?: 'ERROR_CODE', message?: '...' }`.
- Логи: ошибки/предупреждения/инфо выводятся в консоль с эмодзи-префиксами.

### Общие query-параметры
- Пагинация: `page`, `limit`.
- Поиск: `search` (строка), иногда `q` (поиск пользователей).
- Сортировка: `sortBy`, `sortOrder`.
- Фильтры по сущностям: `status`, `future=1`, `role`, `isBlocked`, `managerId`, `ownerId` и т.д.

### Переменные окружения
Обязательные/используемые:
```text
MONGODB_URI             — строка подключения MongoDB
JWT_SECRET              — секрет для JWT
EMAIL_CONFIRM_SECRET    — секрет для email подтверждения (fallback: "email_secret")
RESET_PASSWORD_SECRET   — секрет для сброса пароля (fallback: "reset_secret")
FRONTEND_URL            — базовый фронтенд для ссылок в письмах/редиректах
ALLOWED_FRONTENDS       — CSV whitelist URL'ов фронтов для OAuth ("http://localhost:5174,https://volleyxp.com")
CORS_ORIGINS            — CSV whitelist для CORS (пусто = * в dev)
MAILGUN_API_KEY         — API ключ Mailgun (опционально, иначе письма логируются и пропускаются)
MAILGUN_DOMAIN          — домен Mailgun
GOOGLE_CLIENT_ID        — Google OAuth клиент
GOOGLE_CLIENT_SECRET    — Google OAuth секрет
GOOGLE_CALLBACK_URL     — продовый callback (dev: http://localhost:3000/api/auth/google/callback)
PORT                    — порт сервера (по умолчанию 3000; dev через start-dev.sh = 3000)
NODE_ENV                — окружение (development/test/production)
```

### База данных
- Подключение: `backend/utils/db.js` (`connectDB()`), единичное соединение, логирование разрывов.
- Тестовая БД: `backend/utils/testDb.js` — in-memory MongoDB (mongodb-memory-server) с `connectTestDB/clearTestDB/disconnectTestDB`.

### Модели (вкратце)
- `User`: auth, рейтинг, истории, роли/permissions, managedCourts, флаги `isBlocked`, `emailConfirmed` и др.
- `Match`: поля матча, участники, `joinSnapshots` (снимки рейтинга при присоединении), `status`.
- `Result`: игры (команды/счёты), подтверждение, связь с матчем, `confirmedBy/At`.
- `Court`, `CourtReservation`: сущности площадок и резерваций, `courtsCount`, статусы, цены, адрес и т.д.

### Dev запуск
```bash
./start-dev.sh
# Остановить: pkill -f 'node server.js' && pkill -f 'vite'
```
Скрипт поднимает backend на `:3000` и фронт на `:5174`, проверяет `/api/ping`.

### Примечания по безопасности
- Всегда требовать JWT для защищённых роутов, не доверять клиентским полям.
- Валидация входных данных в контроллерах (минимальная уже реализована, усиливать по мере надобности).
- Логи админ-действий доступны в консоли (`logAdminAction`).


### Схемы моделей (важные поля)

User
```json
{
  "name": "string",
  "email": "string",
  "password?": "string",
  "telegramId?": 123,
  "googleId?": "string",
  "rating": 2.0,
  "ratingHistory": [
    { "date": "ISO", "delta": 0.05, "newRating": 2.05, "matchId": "ObjectId", "comment": "...", "joinRating": 2.0,
      "details": [{ "gameIndex": 1, "team1": ["uid"], "team2": ["uid"], "team1Score": 11, "team2Score": 8, "expected": 0.62, "score": 1, "delta": 0.04 }]}
  ],
  "role": "player|court_admin|admin_view|super_admin",
  "roles?": ["..."],
  "permissions?": ["..."],
  "managedCourts?": ["courtId"],
  "isBlocked": false,
  "preferences?": { "profileFilters": { "hideFinishedNoResult": true, "hideCancelled": true } }
}
```

Match
```json
{
  "title": "string",
  "description?": "string",
  "place": "string",
  "courtId?": "ObjectId",
  "level": "string",
  "startDateTime": "ISO",
  "duration": 90,
  "creator": "ObjectId(User)",
  "participants": ["ObjectId(User)"],
  "maxParticipants": 6,
  "isPrivate": false,
  "status": "upcoming|finished|cancelled",
  "joinSnapshots": [{ "userId": "ObjectId(User)", "rating": 2.0, "joinedAt": "ISO" }]
}
```

Result
```json
{
  "match": "ObjectId(Match)",
  "games": [ { "team1": ["uid"], "team2": ["uid"], "team1Score": 11, "team2Score": 8 } ],
  "isConfirmed": false,
  "confirmedBy?": "ObjectId(User)",
  "confirmedAt?": "ISO"
}
```

Court
```json
{
  "name": "string",
  "address": "string",
  "location": { "type": "Point", "coordinates": [lon, lat] },
  "status": "active|inactive|maintenance",
  "courtsCount": 1,
  "isPaid": false,
  "price?": 10,
  "pricesEUR?": { "oneHour": 10, "twoHours": 18 },
  "workingHours?": { "monday": { "open": "09:00", "close": "22:00" }, ... },
  "amenities?": ["parking", "shower"],
  "photos?": ["https://..."],
  "ownerId?": "ObjectId(User)",
  "managerId?": "ObjectId(User)",
  "isDeleted": false
}
```

CourtReservation
```json
{ "courtId": "ObjectId(Court)", "startDateTime": "ISO", "endDateTime": "ISO", "reservedBy": "uid", "forUserId?": "uid", "note?": "string" }
```

### Примеры запросов/ответов

Auth /login
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"secret"}'
```
```json
{ "token": "...", "refreshToken": "...", "user": { "_id": "...", "email": "user@example.com", "name": "User" } }
```

Auth /refresh
```bash
curl -X POST http://localhost:3000/api/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{"refreshToken":"..."}'
```

Users /search
```bash
curl "http://localhost:3000/api/users/search?q=nik"
```

Matches create
```bash
curl -X POST http://localhost:3000/api/matches \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{
    "title":"Пятничный микс", "description":"2 часа",
    "place":"Local Gym", "level":"M2",
    "startDateTime":"2025-12-01T18:00:00.000Z", "duration":120,
    "maxParticipants":6, "isPrivate":false
  }'
```

Results confirm
```bash
curl -X POST http://localhost:3000/api/results/RESULT_ID/confirm \
  -H "Authorization: Bearer $TOKEN"
```

Admin update user role
```bash
curl -X PUT http://localhost:3000/api/admin/users/USER_ID/role \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
  -d '{"roles":["court_admin"], "managedCourts":["COURT_ID"]}'
```

Admin courts create
```bash
curl -X POST http://localhost:3000/api/admin/courts \
  -H "Authorization: Bearer $SUPER_TOKEN" -H "Content-Type: application/json" \
  -d '{
    "name":"Volley Center", "address":"Main st, 1",
    "coordinates":[24.123, 60.123], "status":"active",
    "isPaid":true, "pricesEUR":{"oneHour":20, "twoHours":35},
    "courtsCount":2
  }'
```

Public courts
```bash
curl "http://localhost:3000/api/courts"
curl "http://localhost:3000/api/courts/COURT_ID"
```

### Валидация и бизнес-правила (ключевое)
- Auth/login: неверные пары -> `INVALID_CREDENTIALS` (400).
- Users/updateProfile: смена email требует повторного подтверждения (письмо отправляется).
- Matches/create: обязательны `title, startDateTime, duration, level` и (`place` или `courtId`); `startDateTime` должен быть в будущем.
- Matches/join: нельзя если прошло >12ч от начала; не больше `maxParticipants`; не допускается дублирование участника.
- Matches/leave: создатель не может выйти; нельзя если матч уже прошёл.
- Matches/removeParticipant: нельзя удалить создателя; ограничение >24ч (кроме super_admin); при черновом результате игрок вычищается из геймов.
- Matches/update (action):
  - `delete`: до старта; либо после окончания при наличии результата (также чистится `ratingHistory`).
  - `cancel`: только после окончания, без результата, и не позже 48ч.
- Results/update: запрещено если `isConfirmed=true`.
- Results/confirm: только участник; в течение 24ч от старта; пересчёт рейтингов per-game (см. `utils/rating.js`).
- Results/delete: только участник; в течение 24ч от старта; откатывает `rating` и `ratingHistory`.
- Admin/users/role: допустимые роли `player|court_admin|admin_view|super_admin`; себе менять нельзя; super_admin трогать нельзя.
- Courts/create: обязательны `name, address, coordinates`; при `isPaid=true` нужны `pricesEUR.oneHour` и `pricesEUR.twoHours` (или legacy `price`).
- Courts/reservations: временной интервал `start < end`; проверка конфликтов по вместимости `courtsCount`.

### Справочник кодов ошибок (неполный)
```text
NOT_FOUND, METHOD_NOT_ALLOWED
NOT_AUTHENTICATED, ACCOUNT_BLOCKED, INSUFFICIENT_PERMISSIONS
INVALID_CREDENTIALS, INVALID_PASSWORD
USER_NOT_FOUND, MATCH_NOT_FOUND, RESULT_NOT_FOUND, COURT_NOT_FOUND, COURT_NOT_ACTIVE
ALREADY_JOINED, NOT_JOINED, MATCH_FULL, MATCH_ALREADY_PASSED
CREATOR_CANNOT_LEAVE, CANNOT_REMOVE_CREATOR, PARTICIPANT_NOT_FOUND, REMOVE_TOO_LATE
RESULT_CONFIRMED, RESULT_ALREADY_CONFIRMED, RESULT_EXISTS
MATCH_IN_PROGRESS, CANNOT_DELETE_MATCH, CANCEL_TOO_LATE, INVALID_ACTION
DATE_MUST_BE_FUTURE
INVALID_ROLE, INVALID_ROLES, ROLE_REQUIRED, CANNOT_MODIFY_SELF, CANNOT_BLOCK_SELF, CANNOT_BLOCK_SUPER_ADMIN, CANNOT_DELETE_SELF, CANNOT_DELETE_SUPER_ADMIN
SCHEDULE_CONFLICT, INVALID_TIME_RANGE
MISSING_USER_IDS, SAME_USER_ID
SERVER_ERROR
```

