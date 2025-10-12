# VolleyXP Backend API

Backend API для приложения управления волейбольными матчами.

## Технологии

- Node.js >= 18.x
- Express.js
- MongoDB
- JWT Authentication
- bcryptjs для хеширования паролей

## Установка и запуск

### Локальная разработка

1. Установите зависимости:
```bash
npm install
```

2. Создайте файл `.env` с переменными окружения:
```env
MONGODB_URI=mongodb://localhost:27017/volleyxp
JWT_SECRET=your-secret-key
PORT=5000
```

3. Запустите сервер:
```bash
npm run dev
```

### Продакшн

```bash
npm start
```

## API Endpoints

### Основные
- `GET /api/ping` - Проверка работоспособности

### Аутентификация
- `POST /api/auth/register` - Регистрация пользователя
- `POST /api/auth/login` - Вход пользователя
- `POST /api/auth/telegram` - Авторизация через Telegram
- `POST /api/auth/forgot-password` - Запрос сброса пароля
- `POST /api/auth/reset-password` - Сброс пароля по токену
- `POST /api/auth/confirm-email` - Подтверждение email

### Пользователи
- `GET /api/users/profile` - Получение профиля пользователя
- `PUT /api/users/profile` - Обновление профиля пользователя
- `GET /api/users/match-history` - Получение истории матчей пользователя
- `GET /api/users/email/:email` - Получение пользователя по email (админ)
- `GET /api/users/search?q=query` - **НОВОЕ**: Умный поиск пользователей по имени или email

### Матчи
- `GET /api/matches` - Получение списка матчей
- `GET /api/matches/:id` - Получение конкретного матча
- `POST /api/matches` - Создание нового матча
- `POST /api/matches/:id/join` - Присоединение к матчу
- `POST /api/matches/:id/leave` - Выход из матча
- `PATCH /api/matches/:id` - Отмена/удаление матча (создатель)
- `POST /api/matches/:id/add-player` - **НОВОЕ**: Добавление игрока в матч (админ/создатель)

### Результаты
- `GET /api/results` - Получение всех результатов
- `GET /api/results/:matchId` - Получение результата конкретного матча
- `POST /api/results` - Создание результата матча
- `PUT /api/results/:id` - Обновление результата матча

## Деплой

### Render.com (Рекомендуется)

1. Создайте аккаунт на [Render.com](https://render.com)
2. Подключите ваш GitHub репозиторий
3. Создайте новый Web Service
4. Укажите:
   - Build Command: `npm install`
   - Start Command: `npm start`
   - Environment Variables:
     - `MONGODB_URI` - URI вашей MongoDB базы данных
     - `JWT_SECRET` - секретный ключ для JWT
     - `NODE_ENV` - production

### Railway

1. Создайте аккаунт на [Railway.app](https://railway.app)
2. Подключите ваш GitHub репозиторий
3. Railway автоматически определит настройки из `railway.json`
4. Добавьте переменные окружения в настройках проекта

### Heroku

1. Установите Heroku CLI
2. Создайте приложение:
```bash
heroku create your-app-name
```

3. Добавьте переменные окружения:
```bash
heroku config:set MONGODB_URI=your-mongodb-uri
heroku config:set JWT_SECRET=your-secret-key
heroku config:set NODE_ENV=production
```

4. Деплойте:
```bash
git push heroku main
```
> ⚠️ Если деплойте на Vercel — проверьте и измените rewrite-домен в vercel.json ("destination": "https://api.volleyxp.com/api/$1") на ваш актуальный backend API.

## База данных

Для продакшна рекомендуется использовать MongoDB Atlas:

1. Создайте кластер на [MongoDB Atlas](https://mongodb.com/atlas)
2. Получите connection string
3. Добавьте его как переменную окружения `MONGODB_URI`

## Переменные окружения

### Основные
- `MONGODB_URI` - URI для подключения к MongoDB
- `JWT_SECRET` - Секретный ключ для JWT токенов
- `PORT` - Порт сервера (по умолчанию 5000)
- `NODE_ENV` - Окружение (development/production)

### Email функциональность
- `FRONTEND_URL` - URL фронтенда, используется для формирования ссылок в email
- `MAILGUN_API_KEY` - API-ключ Mailgun для отправки email (опционально)
- `MAILGUN_DOMAIN` - домен Mailgun, с которого отправляются письма (опционально)
- `EMAIL_CONFIRM_SECRET` - секрет для подписи токенов email-подтверждения
- `RESET_PASSWORD_SECRET` - секрет для подписи токенов сброса пароля

> **Примечание**: Если `MAILGUN_API_KEY` и `MAILGUN_DOMAIN` не заданы, email-уведомления будут логироваться в консоль без отправки.

## Новые функции

### 🔍 Умный поиск игроков
- **Эндпоинт**: `GET /api/users/search?q=query`
- **Описание**: Поиск пользователей по имени или email с умной сортировкой
- **Особенности**:
  - Регистронезависимый поиск
  - Поиск от 2+ символов
  - Умная сортировка: точные совпадения → начинается с → содержит
  - Лимит: 10 результатов
  - Защита от RegExp injection

### ➕ Добавление игроков в матч
- **Эндпоинт**: `POST /api/matches/:id/add-player`
- **Тело запроса**: `{ "playerEmail": "user@example.com" }`
- **Описание**: Позволяет создателю матча добавлять игроков по email
- **Ограничения**:
  - Только для создателя матча
  - Нельзя добавить уже участвующего игрока
  - Нельзя добавить в полный матч
  - Нельзя добавить в прошедший матч

### 🗄️ Оптимизация базы данных
- **Индексы**: Добавлены индексы для всех критических запросов
- **Пул соединений**: Оптимизированы настройки подключения к MongoDB
- **Централизация**: Единый модуль подключения к БД (`utils/db.js`)

## Служебные скрипты

Для всех служебных скриптов (например, check-matches.js, fillMissingHistory.js) используется единый модуль подключения к MongoDB: `backend/utils/db.js`. Подключение всегда берётся из переменной окружения `MONGODB_URI`.

### Доступные скрипты
- `addPlayerToMatch.js` - **НОВОЕ**: Добавление игрока в матч через API
- `checkUserPassword.js` - Проверка пароля пользователя
- `markFinishedMatches.js` - Отметка завершенных матчей
- `resetAllUserRatings.js` - Сброс рейтингов пользователей
- и другие...

Пример .env:
```env
MONGODB_URI=mongodb://localhost:27017/volleyxp
``` 