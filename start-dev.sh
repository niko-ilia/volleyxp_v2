#!/bin/bash

echo "🧹 Очистка старых процессов..."
pkill -f "node server.js" 2>/dev/null
pkill -f "vite" 2>/dev/null
pkill -f "esbuild" 2>/dev/null

# Дополнительно: освобождаем занятые порты 3000 и 5174 (если зависшие процессы)
if lsof -i :3000 -sTCP:LISTEN -t >/dev/null; then
  kill -9 $(lsof -i :3000 -sTCP:LISTEN -t) 2>/dev/null || true
fi
if lsof -i :5174 -sTCP:LISTEN -t >/dev/null; then
  kill -9 $(lsof -i :5174 -sTCP:LISTEN -t) 2>/dev/null || true
fi

echo "⏳ Ожидание освобождения портов..."
sleep 2

echo "🚀 Запуск бэкенда..."
cd backend && NODE_ENV=development PORT=3000 npm run dev &
BACKEND_PID=$!

echo "⏳ Ожидание запуска бэкенда..."
sleep 5

# Быстрая проверка наличия .env
if [ ! -f "/Users/niko/Projects/VolleyXP_v2/backend/.env" ]; then
  echo "⚠️  backend/.env не найден. Создайте на основе docs/backend-overview.md (раздел Переменные окружения)."
fi

echo "🌐 Запуск фронтенда..."
if lsof -i :5174 -sTCP:LISTEN -t >/dev/null; then
  echo "ℹ️  Фронтенд уже запущен на 5174, пропускаю старт"
else
  cd /Users/niko/Projects/VolleyXP_v2 && npm run dev -- -p 5174 &
  FRONTEND_PID=$!
fi

echo "⏳ Ожидание запуска фронтенда..."
sleep 5

echo "✅ Проверка сервисов..."
curl -s http://localhost:3000/api/ping > /dev/null && echo "✅ Бэкенд работает" || echo "❌ Бэкенд не отвечает"
curl -s http://localhost:5174 > /dev/null && echo "✅ Фронтенд работает (5174)" || echo "❌ Фронтенд не отвечает (5174)"

echo "🎯 Готово! Откройте http://localhost:5174"
echo "Для остановки: pkill -f 'node server.js' && pkill -f 'vite'"