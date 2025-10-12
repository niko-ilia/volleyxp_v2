### Авторизация и регистрация в VolleyXP

#### Обзор
- Бэкенд предоставляет REST-эндпоинты для регистрации, логина, обновления токена, профиля, а также интеграции Google OAuth и Telegram.
- Фронтенд реализует форму логина/регистрации и контекст авторизации, хранит токены в localStorage и автоматически обновляет сессию.

---

### Бэкенд

#### Основные эндпоинты
- POST `/api/auth/register` — регистрация
- POST `/api/auth/login` — логин
- POST `/api/auth/refresh` — обновление JWT по refresh-токену
- GET  `/api/auth/me` — текущий пользователь (требует JWT)
- POST `/api/auth/telegram` — авторизация через Telegram
- POST `/api/auth/link-telegram` — привязка Telegram к существующему аккаунту (под JWT)
- GET  `/api/auth/google` — старт Google OAuth (redirect)
- GET  `/api/auth/google/callback` — коллбек Google OAuth (выдаёт токены и редиректит на фронт)
- POST `/api/auth/send-confirmation` — отправка письма для подтверждения email (под JWT)
- GET/POST `/api/auth/confirm-email` — подтверждение email
- POST `/api/auth/request-password-reset` — запрос на сброс пароля
- POST `/api/auth/reset-password` — сброс пароля

Роутер: `backend/routes/auth.js`

#### Регистрация
- Проверка уникальности email (регистронезависимо)
- Хэш пароля через `bcrypt`
- Создание пользователя с `emailConfirmed=false`
- Отправка письма подтверждения email
- Ответ: `token` (JWT 7d), `refreshToken` (30d), `user` (без пароля)

Пример запроса:
```bash
POST /api/auth/register
Content-Type: application/json

{
  "email": "user@example.com",
  "name": "User Name",
  "password": "secret123"
}
```
Пример ответа (201):
```json
{
  "token": "<jwt>",
  "refreshToken": "<refresh-jwt>",
  "user": {
    "_id": "...",
    "id": "...",
    "email": "user@example.com",
    "name": "User Name",
    "createdAt": "2025-01-01T00:00:00.000Z",
    "isEmailConfirmed": false,
    "rating": 2.0,
    "ratingHistory": [],
    "telegramId": null
  }
}
```
Код: `backend/controllers/authController.js` (функция `register`).

#### Логин
- Поиск пользователя по email (регистронезависимо)
- Сравнение пароля через `bcrypt.compare`
- Обновление `lastLoginAt`
- Ответ: `token` (7d), `refreshToken` (30d), `user`

Пример запроса:
```bash
POST /api/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "secret123"
}
```
Пример ответа (200): аналогичен регистрации.
Код: `backend/controllers/authController.js` (функция `login`).

#### Обновление токена (refresh)
- Принимает `refreshToken` в теле запроса
- Проверяет подпись, находит пользователя
- Возвращает новый `token` (7d) и `refreshToken` (30d) + актуальные поля `user`

Пример запроса:
```bash
POST /api/auth/refresh
Content-Type: application/json

{
  "refreshToken": "<refresh-jwt>"
}
```
Пример ответа (200):
```json
{
  "token": "<new-jwt>",
  "refreshToken": "<new-refresh>",
  "user": {
    "_id": "...",
    "name": "User Name",
    "email": "user@example.com",
    "isEmailConfirmed": true,
    "rating": 2.1,
    "ratingHistory": [],
    "telegramId": null
  }
}
```
Код: `backend/routes/auth.js` (инлайн-обработчик `/refresh`).

#### Текущий пользователь (`/me`)
- Требует заголовок `Authorization: Bearer <jwt>`
- Возвращает пользователя без поля `password`

Пример запроса:
```bash
GET /api/auth/me
Authorization: Bearer <jwt>
```
Ответ (200): объект пользователя.
Мидлварь: `backend/middleware/auth.js` (проверка JWT, подстановка `req.user`).

#### Google OAuth
- Настроен в `backend/config/passport.js`
- При логине через Google создаётся/находится пользователь, ставится `emailConfirmed=true`, обновляется `lastLoginAt`
- В коллбеке генерируются `token`/`refreshToken` и выполняется редирект на фронт `.../auth/google-callback?token=...&refreshToken=...`

#### Telegram
- `POST /api/auth/telegram` принимает `telegramUser`, ищет/создаёт пользователя по `telegramId`
- Выдаёт `token` (30d), `refreshToken` (30d) и `user`
- `POST /api/auth/link-telegram` — привязка для уже авторизованного пользователя
Код: `backend/controllers/authController.js` (`telegramAuth`, `linkTelegramAccount`).

#### JWT и сроки
- `token` (JWT): 7 дней (логин/регистрация/Google), 30 дней (Telegram)
- `refreshToken`: 30 дней
- Секрет: `process.env.JWT_SECRET`

#### Ошибки
- Валидация и бизнес-ошибки возвращаются с кодами/сообщениями; в некоторых местах используются RU‑сообщения и коды (`code: 'INVALID_CREDENTIALS'`).
- Мидлварь `auth` отдаёт 401 при отсутствии/невалидности токена.

---

### Фронтенд

#### Формы и вызовы API
Страница: `src/pages/AuthPage.jsx`.
- Регистрация/логин: `POST /api/auth/register|login` через `apiFetch`
- Успех: сохраняются `volley_token`, `volley_refresh_token` (если есть), `volley_user` в `localStorage`; вызывается `login()` из контекста; затем редирект

Ключевая логика:
- Сохранение: `saveAuth(token, user)` → localStorage
- Обработка ошибок: локализована через i18n и коды ошибок

#### Контекст авторизации
Файл: `src/AuthContext.jsx`.
- Инициализация из `localStorage`
- `refreshUser()` запрашивает `/api/auth/me`; при 401 вызывает `refreshTokenUtil()` (`src/utils/authUtils.js`)
- `logout()` очищает токены
- Поддержка Telegram WebApp: авто‑авторизация через `POST /api/auth/telegram`

#### Обновление токена на фронте
Файл: `src/utils/authUtils.js`.
- Читает `volley_refresh_token` из `localStorage`
- Делает `POST /api/auth/refresh`
- При успехе обновляет `volley_token` и (опционально) `volley_refresh_token`

#### Хранение токенов и заголовки
- `localStorage` ключи: `volley_token`, `volley_refresh_token`, `volley_user`
- Авторизация: заголовок `Authorization: Bearer <token>`

---

### Примеры интеграции

#### Вызов защищённого API на фронтенде
```js
import { authFetch } from '../utils/api.js';

const res = await authFetch('/api/secure-endpoint');
if (res.ok) {
  const data = await res.json();
}
```

#### Проверка в бэкенд‑роутере
```js
const auth = require('../middleware/auth');

router.use(auth);
router.get('/', controller.list);
```

---

### Рекомендации
- Использовать `authFetch` для всех защищённых вызовов на фронте
- Обрабатывать `401` и триггерить refresh

### Формат ошибок (бэкенд → фронтенд)
- Базовый формат (желательно во всех местах):
```json
{
  "error": "Message in english",
  "code": "ERROR_CODE",
  "details": { }
}
```
- Коды, встречающиеся в аутентификации:
  - `INVALID_CREDENTIALS` — неверная пара email/пароль
  - `NOT_AUTHENTICATED` — отсутствует JWT
  - `INSUFFICIENT_PERMISSIONS` — недостаточно прав (админ-модуль)
  - `ACCOUNT_BLOCKED` — аккаунт заблокирован
  - `COURT_ID_REQUIRED`, `COURT_ACCESS_DENIED` — доступ к кортам (админ)
- Рекомендуется привести ответы middleware `auth` и некоторые места в `authController.register` к единому RU-формату.

### Админ-миддлвари и роли
Файл: `backend/middleware/adminAuth.js`.
- `requireSuperAdmin` — доступ только супер-админу
- `requireAdminView` — просмотр админки (без изменений)
- `requireAdmin` — общий админ-доступ (например, `court_admin` или `super_admin`)
- `requirePermission('perm')` — проверка конкретного разрешения
- `requireCourtAccess` — проверка владения кортом (для `court_admin`)
- `logAdminAction('ACTION')` — логирование действий админа

Пример использования в роутере:
```js
const auth = require('../middleware/auth');
const { requireAdmin, requireSuperAdmin, logAdminAction } = require('../middleware/adminAuth');

router.use(auth); // Базовая аутентификация JWT
router.get('/admin/things', requireAdmin, controller.list);
router.post('/admin/things', requireSuperAdmin, logAdminAction('CREATE_THING'), controller.create);
```

### Жизненный цикл сессии и токенов
- После логина/регистрации/Google выдается `token` (7d) и `refreshToken` (30d)
- При 401 на защищённом запросе фронт пытается `POST /api/auth/refresh` с `refreshToken`
- Успех refresh: сохраняет новый `token` (+ новый `refreshToken`, если выдан)
- Неуспех refresh: `logout()` и редирект на страницу входа
- Telegram поток выдаёт `token`/`refreshToken` сразу на 30d

Диаграмма (схематично):
```
[login/register/google] -> (token, refresh) -> [protected fetch]
    ok --------------------------------------> data
    401 -> [refresh(refreshToken)]
              ok -> save new token -> retry
              fail -> logout
```

### Фронтенд: паттерн вызовов с authFetch и i18n ошибок
- Всегда использовать `authFetch`/`authFetchWithRetry` для защищённых эндпоинтов
- Обрабатывать `!res.ok`: читать `code` и маппить на переводы i18n (ru)

Пример:
```js
import { authFetchWithRetry } from '../utils/api.js';
import { useTranslation } from 'react-i18next';

const { t } = useTranslation();
const res = await authFetchWithRetry('/api/resource');
const data = await res.json();
if (!res.ok) {
  const msg = data.code ? t(`errorCodes.${data.code}`) : (data.error || t('errorNetworkOrServer'));
  throw new Error(msg);
}
```

### Google callback на фронтенде
- Роут `auth/google-callback` читает `token` и `refreshToken` из query, сохраняет в `localStorage`, обновляет контекст пользователя, редиректит на исходную страницу.
- Источник: `src/pages/GoogleCallbackPage.jsx`

### Схемы payload'ов (request/response)

#### POST /api/auth/register
Request:
```json
{
  "email": "string (email)",
  "name": "string",
  "password": "string"
}
```
Response (201):
```json
{
  "token": "string (JWT, 7d)",
  "refreshToken": "string (JWT, 30d)",
  "user": {
    "_id": "string",
    "id": "string",
    "email": "string",
    "name": "string",
    "createdAt": "ISODate",
    "isEmailConfirmed": "boolean",
    "rating": "number",
    "ratingHistory": "array",
    "telegramId": "string|null"
  }
}
```

#### POST /api/auth/login
Request:
```json
{
  "email": "string (email)",
  "password": "string"
}
```
Response (200):
```json
{
  "token": "string (JWT, 7d)",
  "refreshToken": "string (JWT, 30d)",
  "user": {
    "_id": "string",
    "id": "string",
    "email": "string",
    "name": "string",
    "createdAt": "ISODate",
    "isEmailConfirmed": "boolean",
    "rating": "number",
    "ratingHistory": "array",
    "telegramId": "string|null"
  }
}
```

#### POST /api/auth/refresh
Request:
```json
{ "refreshToken": "string (JWT)" }
```
Response (200):
```json
{
  "token": "string (JWT, 7d)",
  "refreshToken": "string (JWT, 30d)",
  "user": {
    "_id": "string",
    "name": "string",
    "email": "string",
    "isEmailConfirmed": "boolean",
    "rating": "number",
    "ratingHistory": "array",
    "telegramId": "string|null"
  }
}
```

#### POST /api/auth/telegram
Request:
```json
{
  "telegramUser": {
    "id": "number|string",
    "username": "string|null",
    "first_name": "string|null",
    "last_name": "string|null",
    "name": "string|null"
  }
}
```
Response (200):
```json
{
  "token": "string (JWT, 30d)",
  "refreshToken": "string (JWT, 30d)",
  "user": {
    "_id": "string",
    "name": "string",
    "email": "string",
    "rating": "number",
    "telegramId": "string|number"
  }
}
```

#### POST /api/auth/link-telegram
Request:
```json
{
  "email": "string (email)",
  "password": "string",
  "telegramUser": {
    "id": "number|string",
    "username": "string|null",
    "first_name": "string|null",
    "last_name": "string|null",
    "name": "string|null"
  },
  "force": "boolean (optional)"
}
```
Response (200):
```json
{
  "token": "string (JWT, 30d)",
  "user": {
    "_id": "string",
    "name": "string",
    "email": "string",
    "rating": "number",
    "telegramId": "string|number"
  }
}
```
Ошибки (400):
- `Email, password and Telegram user data are required`
- `User not found`
- `Invalid password`
- `This Telegram account is already linked to another user` (если не передан `force=true` для telegram-only учётки)

#### POST /api/auth/send-confirmation (JWT)
Request headers:
```
Authorization: Bearer <jwt>
```
Request body:
```json
{}
```
Response (200):
```json
{ "ok": true }
```
Ошибки:
- 400: `{ "message": "No user/email" }`
- 500: `{ "message": "Ошибка отправки письма", "error": "..." }`

#### GET /api/auth/confirm-email
Query:
```
?token=<string>
```
Response (200):
```json
{ "ok": true }
```
Прочие ответы:
- Уже подтверждён: `{ "ok": true, "alreadyConfirmed": true }`
- 400: `{ "message": "Нет токена" }` или `{ "message": "Некорректный или просроченный токен" }`
- 404: `{ "message": "Пользователь не найден" }`
- 500: `{ "message": "Ошибка подтверждения", "error": "..." }`

#### POST /api/auth/confirm-email
Body:
```json
{ "token": "string" }
```
Response/ошибки — аналогично GET‑версии.

#### POST /api/auth/request-password-reset
Body:
```json
{ "email": "string (email)" }
```
Response (200):
```json
{ "ok": true }
```
(всегда 200 при несуществующем email, чтобы не палить наличие учётки)
Ошибки:
- 400: `{ "message": "Email is required" }`
- 500: `{ "message": "Ошибка отправки письма", "error": "..." }`

#### POST /api/auth/reset-password
Body:
```json
{
  "token": "string",
  "password": "string"
}
```
Response (200):
```json
{ "ok": true }
```
Ошибки:
- 400: `{ "message": "Token and new password are required" }`
- 400: `{ "message": "Invalid or expired token" }`
- 404: `{ "message": "User not found" }`
- 400: `{ "message": "Token already used or invalid" }`
- 400: `{ "message": "Token expired" }`
- 500: `{ "message": "Password reset error", "error": "..." }`
