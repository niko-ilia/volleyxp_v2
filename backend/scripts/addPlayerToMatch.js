const axios = require('axios');

// Конфигурация
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:5001';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'test13@test13.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'test13';

// Функция для авторизации и получения токена
async function getAuthToken() {
  try {
    const response = await axios.post(`${API_BASE_URL}/api/auth/login`, {
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD
    });
    return response.data.token;
  } catch (error) {
    console.error('Ошибка авторизации:', error.response?.data || error.message);
    throw error;
  }
}

// Функция для добавления игрока в матч
async function addPlayerToMatch(matchId, playerEmail) {
  try {
    // Получаем токен авторизации
    const token = await getAuthToken();
    console.log('✅ Получен токен авторизации');

    // Получаем информацию о матче
    const matchResponse = await axios.get(`${API_BASE_URL}/api/matches/${matchId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const match = matchResponse.data;
    console.log(`📋 Матч: ${match.title}`);
    console.log(`👥 Текущих участников: ${match.participants.length}/${match.maxParticipants}`);

    // Получаем информацию о пользователе
    const userResponse = await axios.get(`${API_BASE_URL}/api/users/email/${playerEmail}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const user = userResponse.data;
    console.log(`👤 Пользователь: ${user.name} (${user.email})`);

    // Проверяем, не участвует ли уже пользователь
    const isAlreadyJoined = match.participants.some(p => p._id === user._id);
    if (isAlreadyJoined) {
      console.log('⚠️  Пользователь уже участвует в матче');
      return;
    }

    // Проверяем, есть ли место
    if (match.participants.length >= match.maxParticipants) {
      console.log('❌ Матч заполнен, нет свободных мест');
      return;
    }

    // Добавляем пользователя в матч
    const joinResponse = await axios.post(`${API_BASE_URL}/api/matches/${matchId}/add-player`, {
      playerEmail: playerEmail
    }, {
      headers: { Authorization: `Bearer ${token}` }
    });

    console.log('✅ Пользователь успешно добавлен в матч');
    console.log(`👥 Обновленное количество участников: ${joinResponse.data.participants.length}/${match.maxParticipants}`);

    // Выводим список всех участников
    console.log('\n📋 Участники матча:');
    joinResponse.data.participants.forEach((participant, index) => {
      console.log(`${index + 1}. ${participant.name} (${participant.email}) - рейтинг: ${participant.rating}`);
    });

  } catch (error) {
    if (error.response?.status === 404) {
      console.error('❌ Матч или пользователь не найден');
    } else if (error.response?.status === 400) {
      console.error('❌ Ошибка:', error.response.data.message || error.response.data.code);
    } else {
      console.error('❌ Ошибка:', error.response?.data || error.message);
    }
  }
}

// Основная функция
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length !== 2) {
    console.log('Использование: node addPlayerToMatch.js <matchId> <playerEmail>');
    console.log('Пример: node addPlayerToMatch.js 68810fb2f2e11d16c6f0fa31 test@example.com');
    process.exit(1);
  }

  const [matchId, playerEmail] = args;
  
  console.log(`🎯 Добавление игрока ${playerEmail} в матч ${matchId}`);
  console.log('─'.repeat(50));
  
  await addPlayerToMatch(matchId, playerEmail);
}

// Запуск скрипта
if (require.main === module) {
  main().catch(console.error);
}

module.exports = { addPlayerToMatch, getAuthToken }; 