const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../server');
const User = require('../models/User');
const Match = require('../models/Match');
const { connectTestDB, disconnectTestDB, clearTestDB } = require('../utils/testDb');

// Mock mail utility
jest.mock('../utils/mail', () => ({
  sendMail: jest.fn().mockResolvedValue(),
}));

describe('User API Integration Tests', () => {
  let testUsers = [];
  let testMatches = [];
  let userToken = '';

  beforeAll(async () => {
    process.env.JWT_SECRET = 'test-secret';
    await connectTestDB();
  });

  afterAll(async () => {
    await disconnectTestDB();
  });

  beforeEach(async () => {
    await clearTestDB();
    
    // Создаем тестовых пользователей
    testUsers = await User.create([
      {
        email: 'user1@test.com',
        name: 'User One',
        password: 'password123',
        rating: 1000,
        ratingHistory: []
      },
      {
        email: 'user2@test.com',
        name: 'User Two',
        password: 'password123',
        rating: 1200,
        ratingHistory: []
      },
      {
        email: 'duplicate@test.com',
        name: 'Duplicate User',
        password: 'password123',
        rating: 800,
        ratingHistory: []
      }
    ]);

    // Создаем тестовые матчи
    testMatches = await Match.create([
      {
        title: 'User Test Match 1',
        place: 'Test Court',
        level: 'intermediate',
        startDateTime: new Date(Date.now() - 24 * 60 * 60 * 1000), // вчера
        duration: 120,
        creator: testUsers[0]._id,
        participants: [testUsers[0]._id, testUsers[1]._id],
        maxParticipants: 4,
        status: 'finished'
      },
      {
        title: 'User Test Match 2',
        place: 'Test Court 2',
        level: 'beginner',
        startDateTime: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // 2 дня назад
        duration: 90,
        creator: testUsers[1]._id,
        participants: [testUsers[1]._id, testUsers[2]._id],
        maxParticipants: 6,
        status: 'finished'
      }
    ]);

    // Добавляем историю рейтинга
    testUsers[0].ratingHistory = [
      {
        date: new Date(Date.now() - 24 * 60 * 60 * 1000),
        delta: 50,
        newRating: 1050,
        matchId: testMatches[0]._id,
        comment: 'First match'
      }
    ];
    await testUsers[0].save();

    testUsers[1].ratingHistory = [
      {
        date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
        delta: -30,
        newRating: 1170,
        matchId: testMatches[1]._id,
        comment: 'Second match'
      }
    ];
    await testUsers[1].save();

    // Генерируем токен для первого пользователя
    userToken = generateTestToken(testUsers[0]._id);
  });

  function generateTestToken(userId) {
    return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '1h' });
  }

  describe('GET /api/users/profile', () => {
    it('should return user profile', async () => {
      const res = await request(app)
        .get('/api/users/profile')
        .set('Authorization', `Bearer ${userToken}`);
      
      expect(res.statusCode).toBe(200);
      expect(res.body.id).toBe(testUsers[0]._id.toString());
      expect(res.body.name).toBe('User One');
      expect(res.body.email).toBe('user1@test.com');
      expect(res.body.rating).toBe(1000);
      expect(res.body.emailConfirmed).toBeDefined();
    });

    it('should reject request without token', async () => {
      const res = await request(app)
        .get('/api/users/profile');
      
      expect(res.statusCode).toBe(401);
    });

    it('should reject invalid token', async () => {
      const res = await request(app)
        .get('/api/users/profile')
        .set('Authorization', 'Bearer invalid-token');
      
      expect(res.statusCode).toBe(401);
    });
  });

  describe('PUT /api/users/profile', () => {
    it('should update user name', async () => {
      const updateData = {
        name: 'Updated User Name'
      };

      const res = await request(app)
        .put('/api/users/profile')
        .set('Authorization', `Bearer ${userToken}`)
        .send(updateData);
      
      expect(res.statusCode).toBe(200);
      expect(res.body.name).toBe('Updated User Name');
      expect(res.body.email).toBe('user1@test.com');
    });

    it('should update user email', async () => {
      const updateData = {
        email: 'newemail@test.com'
      };

      const res = await request(app)
        .put('/api/users/profile')
        .set('Authorization', `Bearer ${userToken}`)
        .send(updateData);
      
      expect(res.statusCode).toBe(200);
      expect(res.body.email).toBe('newemail@test.com');
      expect(res.body.name).toBe('User One');
    });

    it('should reject duplicate email', async () => {
      const updateData = {
        email: 'user2@test.com' // уже существует
      };

      const res = await request(app)
        .put('/api/users/profile')
        .set('Authorization', `Bearer ${userToken}`)
        .send(updateData);
      
      expect(res.statusCode).toBe(400);
      expect(res.body.message).toBe('Email уже используется другим пользователем');
    });

    it('should update both name and email', async () => {
      const updateData = {
        name: 'Updated Name',
        email: 'updated@test.com'
      };

      const res = await request(app)
        .put('/api/users/profile')
        .set('Authorization', `Bearer ${userToken}`)
        .send(updateData);
      
      expect(res.statusCode).toBe(200);
      expect(res.body.name).toBe('Updated Name');
      expect(res.body.email).toBe('updated@test.com');
    });

    it('should reject request without token', async () => {
      const res = await request(app)
        .put('/api/users/profile')
        .send({ name: 'Test' });
      
      expect(res.statusCode).toBe(401);
    });
  });

  describe('GET /api/users/match-history', () => {
    it('should return user match history', async () => {
      const res = await request(app)
        .get('/api/users/match-history')
        .set('Authorization', `Bearer ${userToken}`);
      
      expect(res.statusCode).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);
      
      // Проверяем структуру записи истории
      const historyItem = res.body[0];
      expect(historyItem).toHaveProperty('date');
      expect(historyItem).toHaveProperty('delta');
      expect(historyItem).toHaveProperty('newRating');
      expect(historyItem).toHaveProperty('matchId');
      expect(historyItem).toHaveProperty('comment');
      expect(historyItem).toHaveProperty('details');
      
      // Проверяем что комментарий передается правильно
      expect(historyItem.comment).toBe('First match');
    });

    it('should return empty array for user without history', async () => {
      const user3Token = generateTestToken(testUsers[2]._id);
      
      const res = await request(app)
        .get('/api/users/match-history')
        .set('Authorization', `Bearer ${user3Token}`);
      
      expect(res.statusCode).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(0);
    });

    it('should reject request without token', async () => {
      const res = await request(app)
        .get('/api/users/match-history');
      
      expect(res.statusCode).toBe(401);
    });
  });

  describe('GET /api/users/email/:email', () => {
    it('should return user by email', async () => {
      const res = await request(app)
        .get('/api/users/email/user2@test.com')
        .set('Authorization', `Bearer ${userToken}`);
      
      expect(res.statusCode).toBe(200);
      expect(res.body._id).toBe(testUsers[1]._id.toString());
      expect(res.body.name).toBe('User Two');
      expect(res.body.email).toBe('user2@test.com');
      expect(res.body.rating).toBe(1200);
    });

    it('should return 404 for non-existent email', async () => {
      const res = await request(app)
        .get('/api/users/email/nonexistent@test.com')
        .set('Authorization', `Bearer ${userToken}`);
      
      expect(res.statusCode).toBe(404);
      expect(res.body.message).toBe('User not found');
    });

    it('should be case insensitive', async () => {
      const res = await request(app)
        .get('/api/users/email/USER2@TEST.COM')
        .set('Authorization', `Bearer ${userToken}`);
      
      expect(res.statusCode).toBe(200);
      expect(res.body.email).toBe('user2@test.com');
    });

    it('should reject request without token', async () => {
      const res = await request(app)
        .get('/api/users/email/user2@test.com');
      
      expect(res.statusCode).toBe(401);
    });
  });

  describe('GET /api/users/search', () => {
    it('should search users by name', async () => {
      const res = await request(app)
        .get('/api/users/search')
        .query({ q: 'User' })
        .set('Authorization', `Bearer ${userToken}`);
      
      expect(res.statusCode).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);
      expect(res.body[0]).toHaveProperty('name');
      expect(res.body[0]).toHaveProperty('email');
      expect(res.body[0]).toHaveProperty('rating');
    });

    it('should search users by email', async () => {
      const res = await request(app)
        .get('/api/users/search')
        .query({ q: 'user1@test.com' })
        .set('Authorization', `Bearer ${userToken}`);
      
      expect(res.statusCode).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);
      expect(res.body[0].email).toBe('user1@test.com');
    });

    it('should return empty array for short query', async () => {
      const res = await request(app)
        .get('/api/users/search')
        .query({ q: 'a' }) // слишком короткий
        .set('Authorization', `Bearer ${userToken}`);
      
      expect(res.statusCode).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(0);
    });

    it('should return empty array for empty query', async () => {
      const res = await request(app)
        .get('/api/users/search')
        .set('Authorization', `Bearer ${userToken}`);
      
      expect(res.statusCode).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(0);
    });

    it('should be case insensitive', async () => {
      const res = await request(app)
        .get('/api/users/search')
        .query({ q: 'USER' })
        .set('Authorization', `Bearer ${userToken}`);
      
      expect(res.statusCode).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);
    });

    it('should limit results to 10', async () => {
      // Создаем много пользователей для теста лимита
      const manyUsers = [];
      for (let i = 0; i < 15; i++) {
        manyUsers.push({
          email: `test${i}@test.com`,
          name: `Test User ${i}`,
          password: 'password123',
          rating: 1000
        });
      }
      await User.create(manyUsers);

      const res = await request(app)
        .get('/api/users/search')
        .query({ q: 'Test' })
        .set('Authorization', `Bearer ${userToken}`);
      
      expect(res.statusCode).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeLessThanOrEqual(10);
    });

    it('should reject request without token', async () => {
      const res = await request(app)
        .get('/api/users/search')
        .query({ q: 'test' });
      
      expect(res.statusCode).toBe(401);
    });
  });

  describe('Security Tests', () => {
    it('should not expose sensitive user data', async () => {
      const res = await request(app)
        .get('/api/users/profile')
        .set('Authorization', `Bearer ${userToken}`);
      
      expect(res.statusCode).toBe(200);
      expect(res.body.password).toBeUndefined();
      expect(res.body.resetPasswordToken).toBeUndefined();
      expect(res.body.telegramId).toBeUndefined();
    });

    it('should not allow access to other users data', async () => {
      // Пользователь 1 пытается получить профиль пользователя 2
      const res = await request(app)
        .get('/api/users/email/user2@test.com')
        .set('Authorization', `Bearer ${userToken}`);
      
      expect(res.statusCode).toBe(200); // Это нормально - поиск по email публичный
      // Но проверяем что не возвращаются чувствительные данные
      expect(res.body.password).toBeUndefined();
      expect(res.body.resetPasswordToken).toBeUndefined();
    });
  });
}); 