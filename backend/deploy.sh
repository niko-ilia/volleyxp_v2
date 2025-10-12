#!/bin/bash

echo "🚀 Подготовка к деплою бэкенда..."

# Проверяем, что мы в папке backend
if [ ! -f "server.js" ]; then
    echo "❌ Ошибка: Запустите скрипт из папки backend"
    exit 1
fi

# Проверяем наличие .env файла
if [ ! -f ".env" ]; then
    echo "⚠️  Предупреждение: Файл .env не найден"
    echo "Создайте файл .env с переменными окружения:"
    echo "MONGODB_URI=your-mongodb-uri"
    echo "JWT_SECRET=your-secret-key"
    echo "PORT=5001"
fi

# Устанавливаем зависимости
echo "📦 Установка зависимостей..."
npm install

# Проверяем, что сервер запускается (macOS совместимая версия)
echo "🔍 Проверка сервера..."
node server.js &
SERVER_PID=$!
sleep 3

if kill -0 $SERVER_PID 2>/dev/null; then
    echo "✅ Сервер запускается успешно"
    kill $SERVER_PID
else
    echo "❌ Ошибка запуска сервера"
    exit 1
fi

echo ""
echo "🎉 Бэкенд готов к деплою!"
echo ""
echo "📋 Следующие шаги:"
echo "1. Создайте аккаунт на Render.com или Railway.app"
echo "2. Подключите ваш GitHub репозиторий"
echo "3. Создайте Web Service"
echo "4. Добавьте переменные окружения:"
echo "   - MONGODB_URI (MongoDB Atlas connection string)"
echo "   - JWT_SECRET (любая строка для JWT)"
echo "   - NODE_ENV=production"
echo ""
echo "🔗 Полезные ссылки:"
echo "- Render.com: https://render.com"
echo "- Railway.app: https://railway.app"
echo "- MongoDB Atlas: https://mongodb.com/atlas"
echo ""
echo "📖 Подробные инструкции в README.md" 