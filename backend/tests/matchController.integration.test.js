const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../server');
const Match = require('../models/Match');
const User = require('../models/User');
const { connectTestDB, disconnectTestDB, clearTestDB } = require('../utils/testDb');

// Mock mail utility
jest.mock('../utils/mail', () => ({
  sendMail: jest.fn().mockResolvedValue(true),
  sendPasswordResetMail: jest.fn().mockResolvedValue(true)
}));

// Mock rating utility
jest.mock('../utils/rating', () => ({
  updateRatingsAfterMatch: jest.fn().mockResolvedValue(true)
}));

describe('Match API Integration', () => {
  let testUsers = [];
  let testMatches = [];

  beforeAll(async () => {
    process.env.JWT_SECRET = 'test-secret';
    
    // Подключаемся к безопасной тестовой БД
    await connectTestDB();
  });

  afterAll(async () => {
    await disconnectTestDB();
  });

  beforeEach(async () => {
    // Очищаем тестовую БД
    await clearTestDB();

    // Создаем тестовых пользователей
    testUsers = await User.create([
      {
        name: 'Player 1',
        email: 'player1@test.com',
        password: 'password123',
        rating: 2.0
      },
      {
        name: 'Player 2',
        email: 'player2@test.com', 
        password: 'password123',
        rating: 2.5
      },
      {
        name: 'Player 3',
        email: 'player3@test.com',
        password: 'password123', 
        rating: 1.8
      },
      {
        name: 'Player 4',
        email: 'player4@test.com',
        password: 'password123',
        rating: 2.2
      }
    ]);

    // Создаем тестовые матчи
    testMatches = await Match.create([
      {
        title: 'Test Match 1',
        place: 'Test Court',
        level: 'beginner',
        startDateTime: new Date(),
        duration: 120,
        creator: testUsers[0]._id,
        participants: [testUsers[0]._id],
        maxParticipants: 4,
        status: 'upcoming'
      },
      {
        title: 'Test Match 2',
        place: 'Test Court 2',
        level: 'intermediate',
        startDateTime: new Date(),
        duration: 90,
        creator: testUsers[1]._id,
        participants: [testUsers[1]._id, testUsers[2]._id],
        maxParticipants: 6,
        status: 'upcoming'
      }
    ]);
  });

  describe('GET /api/matches', () => {
    it('should return all matches', async () => {
      const token = generateTestToken(testUsers[0]._id);
      
      const res = await request(app)
        .get('/api/matches')
        .set('Authorization', `Bearer ${token}`);
      
      expect(res.statusCode).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(2);
    });

    it('should filter matches by status', async () => {
      const token = generateTestToken(testUsers[0]._id);
      
      const res = await request(app)
        .get('/api/matches')
        .query({ status: 'waiting' })
        .set('Authorization', `Bearer ${token}`);
      
      expect(res.statusCode).toBe(200);
      expect(res.body.every(match => match.status === 'upcoming')).toBe(true);
    });
  });

  describe('GET /api/matches/:id', () => {
    it('should return match by id', async () => {
      const match = testMatches[0];
      const token = generateTestToken(testUsers[0]._id);
      
      const res = await request(app)
        .get(`/api/matches/${match._id}`)
        .set('Authorization', `Bearer ${token}`);
      
      expect(res.statusCode).toBe(200);
      expect(res.body._id).toBe(match._id.toString());
      expect(res.body.title).toBe(match.title);
    });

    it('should return 404 for non-existent match', async () => {
      const fakeId = new mongoose.Types.ObjectId();
      const token = generateTestToken(testUsers[0]._id);
      
      const res = await request(app)
        .get(`/api/matches/${fakeId}`)
        .set('Authorization', `Bearer ${token}`);
      
      expect(res.statusCode).toBe(404);
    });
  });

  describe('POST /api/matches', () => {
    it('should create new match', async () => {
      const matchData = {
        title: 'New Test Match',
        place: 'New Court',
        level: 'beginner',
        startDateTime: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // завтра
        duration: 120,
        maxParticipants: 4,
        description: 'Test match'
      };
      const token = generateTestToken(testUsers[0]._id);

      const res = await request(app)
        .post('/api/matches')
        .send(matchData)
        .set('Authorization', `Bearer ${token}`);
      
      expect(res.statusCode).toBe(201);
      expect(res.body.title).toBe(matchData.title);
      expect(res.body.status).toBe('upcoming');
      expect(res.body.creator._id).toBe(testUsers[0]._id.toString());
    });

    it('should validate required fields', async () => {
      const token = generateTestToken(testUsers[0]._id);
      
      const res = await request(app)
        .post('/api/matches')
        .send({ title: 'Invalid Match' })
        .set('Authorization', `Bearer ${token}`);
      
      expect(res.statusCode).toBe(400);
    });
  });

  describe('POST /api/matches/:id/join', () => {
    it('should allow player to join match', async () => {
      const match = testMatches[0];
      const player = testUsers[3];
      const token = generateTestToken(player._id);

      const res = await request(app)
        .post(`/api/matches/${match._id}/join`)
        .set('Authorization', `Bearer ${token}`);
      
      expect(res.statusCode).toBe(200);
      expect(res.body.participants.some(p => p._id === player._id.toString())).toBe(true);
    });

    it('should prevent joining full match', async () => {
      const fullMatch = await Match.create({
        title: 'Full Match',
        place: 'Test Court',
        level: 'beginner',
        startDateTime: new Date(),
        duration: 120,
        creator: testUsers[0]._id,
        participants: [testUsers[0]._id, testUsers[1]._id],
        maxParticipants: 2,
        status: 'upcoming'
      });
      const token = generateTestToken(testUsers[2]._id);

      const res = await request(app)
        .post(`/api/matches/${fullMatch._id}/join`)
        .set('Authorization', `Bearer ${token}`);
      
      expect(res.statusCode).toBe(400);
    });

    it('should prevent joining active/finished match', async () => {
      // Создаем матч в прошлом (более 12 часов назад)
      const pastMatch = await Match.create({
        title: 'Past Match',
        place: 'Test Court',
        level: 'beginner',
        startDateTime: new Date(Date.now() - 15 * 60 * 60 * 1000), // 15 часов назад
        duration: 120,
        creator: testUsers[0]._id,
        participants: [testUsers[0]._id],
        maxParticipants: 4,
        status: 'upcoming'
      });
      const token = generateTestToken(testUsers[3]._id);

      const res = await request(app)
        .post(`/api/matches/${pastMatch._id}/join`)
        .set('Authorization', `Bearer ${token}`);
      
      expect(res.statusCode).toBe(400);
    });
  });

  describe('POST /api/matches/:id/leave', () => {
    it('should allow player to leave match', async () => {
      // Создаем специальный матч для теста покидания
      const leaveMatch = await Match.create({
        title: 'Leave Test Match',
        place: 'Test Court',
        level: 'beginner',
        startDateTime: new Date(Date.now() + 24 * 60 * 60 * 1000), // завтра
        duration: 120,
        creator: testUsers[0]._id,
        participants: [testUsers[0]._id, testUsers[1]._id, testUsers[2]._id], // добавляем участников
        maxParticipants: 4,
        status: 'upcoming'
      });
      
      const player = testUsers[1]; // используем testUsers[1] который участник, но не создатель
      const token = generateTestToken(player._id);

      const res = await request(app)
        .post(`/api/matches/${leaveMatch._id}/leave`)
        .set('Authorization', `Bearer ${token}`);
      
      expect(res.statusCode).toBe(200);
      expect(res.body.participants.some(p => p._id === player._id.toString())).toBe(false);
    });
  });

  describe('Full match lifecycle', () => {
    it('should handle complete match flow', async () => {
      // 1. Создаем матч
      const matchData = {
        title: 'Integration Test Match',
        place: 'Test Court',
        level: 'beginner',
        startDateTime: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // завтра
        duration: 120,
        maxParticipants: 4,
        description: 'Integration test'
      };
      const creator = testUsers[0];
      const token = generateTestToken(creator._id);

      const createRes = await request(app)
        .post('/api/matches')
        .send(matchData)
        .set('Authorization', `Bearer ${token}`);
      
      expect(createRes.statusCode).toBe(201);
      const matchId = createRes.body._id;

      // 2. Игроки присоединяются
      for (let i = 1; i < 4; i++) {
        const playerToken = generateTestToken(testUsers[i]._id);
        const joinRes = await request(app)
          .post(`/api/matches/${matchId}/join`)
          .set('Authorization', `Bearer ${playerToken}`);
        
        expect(joinRes.statusCode).toBe(200);
      }

      // 3. Проверяем что матч полный
      const getMatchRes = await request(app)
        .get(`/api/matches/${matchId}`)
        .set('Authorization', `Bearer ${token}`);
      
      expect(getMatchRes.statusCode).toBe(200);
      expect(getMatchRes.body.participants).toHaveLength(4);

      // 4. Пытаемся добавить еще одного игрока
      const extraPlayerToken = generateTestToken(testUsers[3]._id);
      const extraJoinRes = await request(app)
        .post(`/api/matches/${matchId}/join`)
        .set('Authorization', `Bearer ${extraPlayerToken}`);
      
      expect(extraJoinRes.statusCode).toBe(400);
    });
  });
});

// Helper function to generate test JWT token
function generateTestToken(userId) {
  const jwt = require('jsonwebtoken');
  return jwt.sign({ userId: userId.toString() }, 'test-secret', { expiresIn: '1h' });
} 