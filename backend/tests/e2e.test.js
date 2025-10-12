const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../server');
const User = require('../models/User');
const { connectTestDB, disconnectTestDB, clearTestDB } = require('../utils/testDb');

// Mock mail utility
jest.mock('../utils/mail', () => ({
  sendMail: jest.fn().mockResolvedValue(),
  sendPasswordResetMail: jest.fn().mockResolvedValue(),
}));

// Mock rating utility
jest.mock('../utils/rating', () => ({
  updateRatingsAfterMatch: jest.fn().mockResolvedValue(),
}));

describe('E2E Tests - Full Application Flow', () => {
  beforeAll(async () => {
    process.env.JWT_SECRET = 'test-secret';
    await connectTestDB();
  });

  afterAll(async () => {
    await disconnectTestDB();
  });

  beforeEach(async () => {
    await clearTestDB();
  });

  function generateTestToken(userId) {
    return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '1h' });
  }

  describe('Complete User Journey', () => {
    it('should handle full user registration and match flow', async () => {
      // 1. Регистрация пользователей
      const user1Data = {
        email: 'player1@test.com',
        name: 'Player 1',
        password: 'password123'
      };

      const user2Data = {
        email: 'player2@test.com',
        name: 'Player 2',
        password: 'password123'
      };

      const user3Data = {
        email: 'player3@test.com',
        name: 'Player 3',
        password: 'password123'
      };

      const user4Data = {
        email: 'player4@test.com',
        name: 'Player 4',
        password: 'password123'
      };

      // Регистрируем пользователей
      const register1 = await request(app)
        .post('/api/auth/register')
        .send(user1Data);
      expect(register1.statusCode).toBe(201);
      const token1 = register1.body.token;

      const register2 = await request(app)
        .post('/api/auth/register')
        .send(user2Data);
      expect(register2.statusCode).toBe(201);
      const token2 = register2.body.token;

      const register3 = await request(app)
        .post('/api/auth/register')
        .send(user3Data);
      expect(register3.statusCode).toBe(201);
      const token3 = register3.body.token;

      const register4 = await request(app)
        .post('/api/auth/register')
        .send(user4Data);
      expect(register4.statusCode).toBe(201);
      const token4 = register4.body.token;

      // 2. Создание матча
      const matchData = {
        title: 'E2E Test Match',
        description: 'Test match for E2E testing',
        place: 'Test Court',
        level: 'intermediate',
        startDateTime: new Date(Date.now() + 24 * 60 * 60 * 1000), // завтра
        duration: 120,
        maxParticipants: 4
      };

      const createMatch = await request(app)
        .post('/api/matches')
        .set('Authorization', `Bearer ${token1}`)
        .send(matchData);

      expect(createMatch.statusCode).toBe(201);
      const matchId = createMatch.body._id;

      // 3. Присоединение игроков к матчу
      const join2 = await request(app)
        .post(`/api/matches/${matchId}/join`)
        .set('Authorization', `Bearer ${token2}`);
      expect(join2.statusCode).toBe(200);

      const join3 = await request(app)
        .post(`/api/matches/${matchId}/join`)
        .set('Authorization', `Bearer ${token3}`);
      expect(join3.statusCode).toBe(200);

      const join4 = await request(app)
        .post(`/api/matches/${matchId}/join`)
        .set('Authorization', `Bearer ${token4}`);
      expect(join4.statusCode).toBe(200);

      // 4. Проверяем что матч заполнен
      const getMatch = await request(app)
        .get(`/api/matches/${matchId}`)
        .set('Authorization', `Bearer ${token1}`);

      expect(getMatch.statusCode).toBe(200);
      expect(getMatch.body.participants).toHaveLength(4);

      // 5. Создаем результат матча
      const resultData = {
        matchId: matchId,
        games: [
          {
            team1: [register1.body.user._id, register2.body.user._id],
            team2: [register3.body.user._id, register4.body.user._id],
            team1Score: 25,
            team2Score: 20
          },
          {
            team1: [register1.body.user._id, register2.body.user._id],
            team2: [register3.body.user._id, register4.body.user._id],
            team1Score: 22,
            team2Score: 25
          },
          {
            team1: [register1.body.user._id, register2.body.user._id],
            team2: [register3.body.user._id, register4.body.user._id],
            team1Score: 15,
            team2Score: 10
          }
        ]
      };

      const createResult = await request(app)
        .post('/api/results')
        .set('Authorization', `Bearer ${token1}`)
        .send(resultData);

      expect(createResult.statusCode).toBe(201);

      // Подтверждаем результат (новая логика)
      const resultId = createResult.body._id;
      const confirmRes = await request(app)
        .post(`/api/results/${resultId}/confirm`)
        .set('Authorization', `Bearer ${token1}`);
      expect(confirmRes.statusCode).toBe(200);

      // 6. Проверяем что матч стал finished
      const getFinishedMatch = await request(app)
        .get(`/api/matches/${matchId}`)
        .set('Authorization', `Bearer ${token1}`);

      expect(getFinishedMatch.statusCode).toBe(200);
      expect(getFinishedMatch.body.status).toBe('finished');

      // 7. Проверяем результат
      const getResult = await request(app)
        .get(`/api/results/${matchId}`)
        .set('Authorization', `Bearer ${token1}`);

      expect(getResult.statusCode).toBe(200);
      expect(getResult.body.games).toHaveLength(3);
      expect(getResult.body.match._id).toBe(matchId);
    });

    it('should handle user login and profile management', async () => {
      // 1. Регистрация
      const registerRes = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'login@test.com',
          name: 'Login User',
          password: 'password123'
        });

      expect(registerRes.statusCode).toBe(201);
      const token = registerRes.body.token;

      // 2. Логин
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'login@test.com',
          password: 'password123'
        });

      expect(loginRes.statusCode).toBe(200);
      expect(loginRes.body.token).toBeDefined();

      // 3. Получение профиля
      const profileRes = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${token}`);

      expect(profileRes.statusCode).toBe(200);
      expect(profileRes.body.email).toBe('login@test.com');
      expect(profileRes.body.name).toBe('Login User');
    });

    it('should handle match lifecycle with participants', async () => {
      // Создаем пользователей
      const users = await User.create([
        {
          email: 'creator@test.com',
          name: 'Creator',
          password: 'password123',
          rating: 1000
        },
        {
          email: 'player1@test.com',
          name: 'Player 1',
          password: 'password123',
          rating: 1000
        },
        {
          email: 'player2@test.com',
          name: 'Player 2',
          password: 'password123',
          rating: 1000
        }
      ]);

      const token1 = generateTestToken(users[0]._id);
      const token2 = generateTestToken(users[1]._id);
      const token3 = generateTestToken(users[2]._id);

      // 1. Создание матча
      const createMatch = await request(app)
        .post('/api/matches')
        .set('Authorization', `Bearer ${token1}`)
        .send({
          title: 'Lifecycle Test Match',
          place: 'Test Court',
          level: 'intermediate',
          startDateTime: new Date(Date.now() + 24 * 60 * 60 * 1000),
          duration: 90,
          maxParticipants: 3
        });

      expect(createMatch.statusCode).toBe(201);
      const matchId = createMatch.body._id;

      // 2. Присоединение игроков
      const join1 = await request(app)
        .post(`/api/matches/${matchId}/join`)
        .set('Authorization', `Bearer ${token2}`);
      expect(join1.statusCode).toBe(200);

      const join2 = await request(app)
        .post(`/api/matches/${matchId}/join`)
        .set('Authorization', `Bearer ${token3}`);
      expect(join2.statusCode).toBe(200);

      // 3. Проверка участников
      const getMatch = await request(app)
        .get(`/api/matches/${matchId}`)
        .set('Authorization', `Bearer ${token1}`);

      expect(getMatch.statusCode).toBe(200);
      expect(getMatch.body.participants).toHaveLength(3);

      // 4. Покидание матча
      const leave = await request(app)
        .post(`/api/matches/${matchId}/leave`)
        .set('Authorization', `Bearer ${token2}`);

      expect(leave.statusCode).toBe(200);

      // 5. Проверка что игрок покинул матч
      const getMatchAfterLeave = await request(app)
        .get(`/api/matches/${matchId}`)
        .set('Authorization', `Bearer ${token1}`);

      expect(getMatchAfterLeave.statusCode).toBe(200);
      expect(getMatchAfterLeave.body.participants).toHaveLength(2);
    });

    it('should handle error scenarios gracefully', async () => {
      // 1. Попытка доступа без авторизации
      const unauthorizedRes = await request(app)
        .get('/api/matches');

      expect(unauthorizedRes.statusCode).toBe(401);

      // 2. Попытка создания матча с невалидными данными
      const user = await User.create({
        email: 'error@test.com',
        name: 'Error User',
        password: 'password123'
      });

      const token = generateTestToken(user._id);

      const invalidMatchRes = await request(app)
        .post('/api/matches')
        .set('Authorization', `Bearer ${token}`)
        .send({
          // отсутствуют обязательные поля
          title: 'Invalid Match'
        });

      expect(invalidMatchRes.statusCode).toBe(400);

      // 3. Попытка присоединиться к несуществующему матчу
      const fakeMatchId = '507f1f77bcf86cd799439011';
      const joinFakeRes = await request(app)
        .post(`/api/matches/${fakeMatchId}/join`)
        .set('Authorization', `Bearer ${token}`);

      expect(joinFakeRes.statusCode).toBe(404);

      // 4. Попытка получить несуществующий результат
      const getFakeResultRes = await request(app)
        .get(`/api/results/${fakeMatchId}`)
        .set('Authorization', `Bearer ${token}`);

      expect(getFakeResultRes.statusCode).toBe(404);
    });

    it('should handle data consistency across operations', async () => {
      // Создаем пользователей
      const users = await User.create([
        {
          email: 'consistency@test.com',
          name: 'Consistency User',
          password: 'password123',
          rating: 1000
        }
      ]);

      const token = generateTestToken(users[0]._id);

      // 1. Создаем матч
      const createMatch = await request(app)
        .post('/api/matches')
        .set('Authorization', `Bearer ${token}`)
        .send({
          title: 'Consistency Test Match',
          place: 'Test Court',
          level: 'intermediate',
          startDateTime: new Date(Date.now() + 24 * 60 * 60 * 1000),
          duration: 90,
          maxParticipants: 2
        });

      expect(createMatch.statusCode).toBe(201);
      const matchId = createMatch.body._id;

      // 2. Проверяем что матч создан корректно
      const getMatch = await request(app)
        .get(`/api/matches/${matchId}`)
        .set('Authorization', `Bearer ${token}`);

      expect(getMatch.statusCode).toBe(200);
      expect(getMatch.body.title).toBe('Consistency Test Match');
      expect(getMatch.body.creator._id).toBe(users[0]._id.toString());

      // 3. Создаем результат
      const resultData = {
        matchId: matchId,
        games: [
          {
            team1: [users[0]._id],
            team2: [users[0]._id],
            team1Score: 25,
            team2Score: 20
          }
        ]
      };

      const createResult = await request(app)
        .post('/api/results')
        .set('Authorization', `Bearer ${token}`)
        .send(resultData);

      expect(createResult.statusCode).toBe(201);
      // Подтверждаем результат (новая логика)
      const resultId = createResult.body._id;
      const confirmRes = await request(app)
        .post(`/api/results/${resultId}/confirm`)
        .set('Authorization', `Bearer ${token}`);
      expect(confirmRes.statusCode).toBe(200);

      // 4. Проверяем что результат создан и связан с матчем
      const getResult = await request(app)
        .get(`/api/results/${matchId}`)
        .set('Authorization', `Bearer ${token}`);

      expect(getResult.statusCode).toBe(200);
      expect(getResult.body.match._id).toBe(matchId);
      expect(getResult.body.games).toHaveLength(1);

      // 5. Проверяем что матч стал finished
      const getFinishedMatch = await request(app)
        .get(`/api/matches/${matchId}`)
        .set('Authorization', `Bearer ${token}`);

      expect(getFinishedMatch.statusCode).toBe(200);
      expect(getFinishedMatch.body.status).toBe('finished');
    });
  });
}); 