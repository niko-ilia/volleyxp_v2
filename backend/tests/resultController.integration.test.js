const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../server');
const Match = require('../models/Match');
const User = require('../models/User');
const Result = require('../models/Result');
const { connectTestDB, disconnectTestDB, clearTestDB } = require('../utils/testDb');

// Mock mail utility
jest.mock('../utils/mail', () => ({
  sendMatchResultEmail: jest.fn(),
}));

// Mock rating utility
jest.mock('../utils/rating', () => ({
  updateRatingsAfterMatch: jest.fn(),
}));

describe('Result API Integration', () => {
  let testUsers = [];
  let testMatches = [];
  let testResults = [];

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
        email: 'player1@test.com',
        name: 'Player 1',
        password: 'password123',
        rating: 1000,
        ratingHistory: []
      },
      {
        email: 'player2@test.com',
        name: 'Player 2',
        password: 'password123',
        rating: 1000,
        ratingHistory: []
      },
      {
        email: 'player3@test.com',
        name: 'Player 3',
        password: 'password123',
        rating: 1000,
        ratingHistory: []
      },
      {
        email: 'player4@test.com',
        name: 'Player 4',
        password: 'password123',
        rating: 1000,
        ratingHistory: []
      }
    ]);

    // Создаем тестовые матчи
    testMatches = await Match.create([
      {
        title: 'Test Match 1',
        description: 'Test match for results',
        place: 'Test Court',
        level: 'intermediate',
        startDateTime: new Date(Date.now() + 24 * 60 * 60 * 1000), // завтра
        duration: 120,
        creator: testUsers[0]._id,
        participants: [testUsers[0]._id, testUsers[1]._id],
        maxParticipants: 4,
        status: 'upcoming'
      },
      {
        title: 'Test Match 2',
        description: 'Finished match',
        place: 'Test Court 2',
        level: 'advanced',
        startDateTime: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 часа назад
        duration: 90,
        creator: testUsers[2]._id,
        participants: [testUsers[2]._id, testUsers[3]._id],
        maxParticipants: 4,
        status: 'finished'
      }
    ]);

    // Создаем тестовые результаты
    testResults = await Result.create([
      {
        match: testMatches[1]._id,
        games: [
          {
            team1: [testUsers[2]._id, testUsers[3]._id],
            team2: [testUsers[0]._id, testUsers[1]._id],
            team1Score: 25,
            team2Score: 20
          },
          {
            team1: [testUsers[2]._id, testUsers[3]._id],
            team2: [testUsers[0]._id, testUsers[1]._id],
            team1Score: 22,
            team2Score: 25
          },
          {
            team1: [testUsers[2]._id, testUsers[3]._id],
            team2: [testUsers[0]._id, testUsers[1]._id],
            team1Score: 15,
            team2Score: 10
          }
        ],
        confirmedBy: testUsers[2]._id
      }
    ]);
  });

  function generateTestToken(userId) {
    const jwt = require('jsonwebtoken');
    return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '1h' });
  }

  describe('GET /api/results', () => {
    it('should return all results', async () => {
      const token = generateTestToken(testUsers[0]._id);
      
      const res = await request(app)
        .get('/api/results')
        .set('Authorization', `Bearer ${token}`);
      
      expect(res.statusCode).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(1);
    });

    it('should filter results by match', async () => {
      const token = generateTestToken(testUsers[0]._id);
      
      const res = await request(app)
        .get(`/api/results?matchId=${testMatches[1]._id}`)
        .set('Authorization', `Bearer ${token}`);
      
      expect(res.statusCode).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(1);
      expect(res.body[0].match._id).toBe(testMatches[1]._id.toString());
    });
  });

  describe('GET /api/results/:matchId', () => {
    it('should return result by match id', async () => {
      const token = generateTestToken(testUsers[0]._id);
      
      const res = await request(app)
        .get(`/api/results/${testMatches[1]._id}`)
        .set('Authorization', `Bearer ${token}`);
      
      expect(res.statusCode).toBe(200);
      expect(res.body.match._id).toBe(testMatches[1]._id.toString());
    });

    it('should return 404 for non-existent result', async () => {
      const token = generateTestToken(testUsers[0]._id);
      const fakeId = new mongoose.Types.ObjectId();
      
      const res = await request(app)
        .get(`/api/results/${fakeId}`)
        .set('Authorization', `Bearer ${token}`);
      
      expect(res.statusCode).toBe(404);
    });
  });

  describe('POST /api/results', () => {
    it('should create new result', async () => {
      const token = generateTestToken(testUsers[0]._id); // testUsers[0] - участник testMatches[0]
      
      const resultData = {
        matchId: testMatches[0]._id,
        games: [
          {
            team1: [testUsers[0]._id, testUsers[1]._id],
            team2: [testUsers[2]._id, testUsers[3]._id],
            team1Score: 25,
            team2Score: 20
          },
          {
            team1: [testUsers[0]._id, testUsers[1]._id],
            team2: [testUsers[2]._id, testUsers[3]._id],
            team1Score: 22,
            team2Score: 25
          },
          {
            team1: [testUsers[0]._id, testUsers[1]._id],
            team2: [testUsers[2]._id, testUsers[3]._id],
            team1Score: 15,
            team2Score: 10
          }
        ]
      };
      
      const res = await request(app)
        .post('/api/results')
        .set('Authorization', `Bearer ${token}`)
        .send(resultData);
      
      expect(res.statusCode).toBe(201);
      expect(res.body.match._id).toBe(testMatches[0]._id.toString());
      expect(res.body.games).toHaveLength(3);
    });

    it('should validate required fields', async () => {
      const token = generateTestToken(testUsers[0]._id);
      
      const invalidData = {
        games: []
      };
      
      const res = await request(app)
        .post('/api/results')
        .set('Authorization', `Bearer ${token}`)
        .send(invalidData);
      
      expect(res.statusCode).toBe(404); // matchId отсутствует
    });

    it('should prevent duplicate results for same match', async () => {
      const token = generateTestToken(testUsers[0]._id);
      
      const resultData = {
        matchId: testMatches[1]._id, // уже есть результат
        games: [
          {
            team1: [testUsers[2]._id, testUsers[3]._id],
            team2: [testUsers[0]._id, testUsers[1]._id],
            team1Score: 20,
            team2Score: 25
          },
          {
            team1: [testUsers[2]._id, testUsers[3]._id],
            team2: [testUsers[0]._id, testUsers[1]._id],
            team1Score: 25,
            team2Score: 22
          }
        ]
      };
      
      const res = await request(app)
        .post('/api/results')
        .set('Authorization', `Bearer ${token}`)
        .send(resultData);
      
      expect(res.statusCode).toBe(400);
    });
  });

  describe('PUT /api/results/:id', () => {
    it('should update existing result', async () => {
      const token = generateTestToken(testUsers[2]._id); // используем создателя результата
      
      const updateData = {
        games: [
          {
            team1: [testUsers[2]._id, testUsers[3]._id],
            team2: [testUsers[0]._id, testUsers[1]._id],
            team1Score: 25,
            team2Score: 20
          },
          {
            team1: [testUsers[2]._id, testUsers[3]._id],
            team2: [testUsers[0]._id, testUsers[1]._id],
            team1Score: 25,
            team2Score: 18
          },
          {
            team1: [testUsers[2]._id, testUsers[3]._id],
            team2: [testUsers[0]._id, testUsers[1]._id],
            team1Score: 15,
            team2Score: 10
          }
        ]
      };
      
      const res = await request(app)
        .put(`/api/results/${testResults[0]._id}`)
        .set('Authorization', `Bearer ${token}`)
        .send(updateData);
      
      expect(res.statusCode).toBe(200);
      expect(res.body.games).toHaveLength(3);
    });

    it('should return 404 for non-existent result', async () => {
      const token = generateTestToken(testUsers[0]._id);
      const fakeId = new mongoose.Types.ObjectId();
      
      const res = await request(app)
        .put(`/api/results/${fakeId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ team1Wins: 2, team2Wins: 1 });
      
      expect(res.statusCode).toBe(404);
    });
  });

  describe('DELETE /api/results/:id', () => {
    it('should delete result', async () => {
      const token = generateTestToken(testUsers[2]._id); // используем создателя результата
      
      const res = await request(app)
        .delete(`/api/results/${testResults[0]._id}`)
        .set('Authorization', `Bearer ${token}`);
      
      expect(res.statusCode).toBe(200);
      
      // Проверяем что результат удален
      const getRes = await request(app)
        .get(`/api/results/${testMatches[1]._id}`)
        .set('Authorization', `Bearer ${token}`);
      
      expect(getRes.statusCode).toBe(404);
    });

    it('should return 404 for non-existent result', async () => {
      const token = generateTestToken(testUsers[0]._id);
      const fakeId = new mongoose.Types.ObjectId();
      
      const res = await request(app)
        .delete(`/api/results/${fakeId}`)
        .set('Authorization', `Bearer ${token}`);
      
      expect(res.statusCode).toBe(404);
    });
  });
}); 