const request = require('supertest');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const app = require('../server');
const User = require('../models/User');
const Match = require('../models/Match');
const Result = require('../models/Result');
const { connectTestDB, disconnectTestDB, clearTestDB } = require('../utils/testDb');

// Mock mail utility
jest.mock('../utils/mail', () => ({
  sendMail: jest.fn().mockResolvedValue(),
  sendPasswordResetMail: jest.fn().mockResolvedValue(),
}));

describe('Admin API Integration Tests', () => {
  let testUsers = [];
  let testMatches = [];
  let testResults = [];
  let adminToken = '';

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
        email: 'admin@test.com',
        name: 'Admin User',
        password: 'password123',
        rating: 1000,
        role: 'super_admin'
      },
      {
        email: 'court_admin@test.com',
        name: 'Court Admin',
        password: 'password123',
        rating: 1000,
        role: 'court_admin',
        managedCourts: ['Court 1', 'Court 2']
      },
      {
        email: 'player1@test.com',
        name: 'Player 1',
        password: 'password123',
        rating: 1000,
        role: 'player'
      },
      {
        email: 'player2@test.com',
        name: 'Player 2',
        password: 'password123',
        rating: 1200,
        role: 'player'
      },
      {
        email: 'blocked@test.com',
        name: 'Blocked User',
        password: 'password123',
        rating: 800,
        role: 'player',
        isBlocked: true
      }
    ]);

    // Создаем тестовые матчи
    testMatches = await Match.create([
      {
        title: 'Admin Test Match 1',
        place: 'Test Court',
        level: 'intermediate',
        startDateTime: new Date(Date.now() + 24 * 60 * 60 * 1000),
        duration: 120,
        creator: testUsers[2]._id,
        participants: [testUsers[2]._id, testUsers[3]._id],
        maxParticipants: 4,
        status: 'upcoming'
      },
      {
        title: 'Admin Test Match 2',
        place: 'Test Court 2',
        level: 'beginner',
        startDateTime: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 часа назад
        duration: 90,
        creator: testUsers[3]._id,
        participants: [testUsers[3]._id],
        maxParticipants: 6,
        status: 'finished'
      }
    ]);

    // Создаем тестовые результаты
    testResults = await Result.create([
      {
        match: testMatches[1]._id,
        games: [
          {
            team1: [testUsers[2]._id],
            team2: [testUsers[3]._id],
            team1Score: 25,
            team2Score: 20
          }
        ],
        confirmedBy: testUsers[2]._id
      }
    ]);

    // Генерируем токены
    adminToken = generateTestToken(testUsers[0]._id, 'super_admin');
  });

  function generateTestToken(userId, role = 'player') {
    return jwt.sign({ userId, role }, process.env.JWT_SECRET, { expiresIn: '1h' });
  }

  describe('GET /api/admin/users', () => {
    it('should return all users with pagination', async () => {
      const res = await request(app)
        .get('/api/admin/users')
        .set('Authorization', `Bearer ${adminToken}`);
      
      expect(res.statusCode).toBe(200);
      expect(res.body.users).toBeDefined();
      expect(res.body.total).toBeDefined();
      expect(res.body.currentPage).toBeDefined();
      expect(res.body.totalPages).toBeDefined();
      expect(Array.isArray(res.body.users)).toBe(true);
    });

    it('should filter users by role', async () => {
      const res = await request(app)
        .get('/api/admin/users')
        .query({ role: 'player' })
        .set('Authorization', `Bearer ${adminToken}`);
      
      expect(res.statusCode).toBe(200);
      expect(res.body.users.every(user => user.role === 'player')).toBe(true);
    });

    it('should filter blocked users', async () => {
      const res = await request(app)
        .get('/api/admin/users')
        .query({ isBlocked: 'true' })
        .set('Authorization', `Bearer ${adminToken}`);
      
      expect(res.statusCode).toBe(200);
      expect(res.body.users.every(user => user.isBlocked === true)).toBe(true);
    });

    it('should search users by name or email', async () => {
      const res = await request(app)
        .get('/api/admin/users')
        .query({ search: 'Player' })
        .set('Authorization', `Bearer ${adminToken}`);
      
      expect(res.statusCode).toBe(200);
      expect(res.body.users.some(user => user.name.includes('Player'))).toBe(true);
    });

    it('should reject non-admin access', async () => {
      const playerToken = generateTestToken(testUsers[2]._id, 'player');
      
      const res = await request(app)
        .get('/api/admin/users')
        .set('Authorization', `Bearer ${playerToken}`);
      
      expect(res.statusCode).toBe(403);
    });
  });

  describe('PUT /api/admin/users/:id/role', () => {
    it('should update user role', async () => {
      const userId = testUsers[2]._id;
      const newRole = 'court_admin';
      
      const res = await request(app)
        .put(`/api/admin/users/${userId}/role`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ role: newRole });
      
      expect(res.statusCode).toBe(200);
      expect(res.body.user.role).toBe(newRole);
    });

    it('should reject invalid role', async () => {
      const userId = testUsers[2]._id;
      
      const res = await request(app)
        .put(`/api/admin/users/${userId}/role`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ role: 'invalid_role' });
      
      expect(res.statusCode).toBe(400);
    });

    it('should prevent self-modification', async () => {
      const adminUserId = testUsers[0]._id;
      
      const res = await request(app)
        .put(`/api/admin/users/${adminUserId}/role`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ role: 'player' });
      
      expect(res.statusCode).toBe(400);
    });

    it('should handle non-existent user', async () => {
      const fakeUserId = new mongoose.Types.ObjectId();
      
      const res = await request(app)
        .put(`/api/admin/users/${fakeUserId}/role`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ role: 'court_admin' });
      
      expect(res.statusCode).toBe(404);
    });
  });

  describe('POST /api/admin/users/:id/block', () => {
    it('should block user', async () => {
      const userId = testUsers[2]._id;
      
      const res = await request(app)
        .post(`/api/admin/users/${userId}/block`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ reason: 'Test blocking' });
      
      expect(res.statusCode).toBe(200);
      
      // Проверяем что пользователь заблокирован
      const blockedUser = await User.findById(userId);
      expect(blockedUser.isBlocked).toBe(true);
    });

    it('should prevent self-blocking', async () => {
      const adminUserId = testUsers[0]._id;
      
      const res = await request(app)
        .post(`/api/admin/users/${adminUserId}/block`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ reason: 'Self blocking' });
      
      expect(res.statusCode).toBe(400);
    });
  });

  describe('POST /api/admin/users/:id/unblock', () => {
    it('should unblock user', async () => {
      const userId = testUsers[4]._id; // заблокированный пользователь
      
      const res = await request(app)
        .post(`/api/admin/users/${userId}/unblock`)
        .set('Authorization', `Bearer ${adminToken}`);
      
      expect(res.statusCode).toBe(200);
      
      // Проверяем что пользователь разблокирован
      const unblockedUser = await User.findById(userId);
      expect(unblockedUser.isBlocked).toBe(false);
    });
  });

  describe('DELETE /api/admin/users/:id', () => {
    it('should delete user', async () => {
      const userId = testUsers[3]._id;
      
      const res = await request(app)
        .delete(`/api/admin/users/${userId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      
      expect(res.statusCode).toBe(200);
      
      // Проверяем что пользователь удален
      const deletedUser = await User.findById(userId);
      expect(deletedUser).toBeNull();
    });

    it('should prevent self-deletion', async () => {
      const adminUserId = testUsers[0]._id;
      
      const res = await request(app)
        .delete(`/api/admin/users/${adminUserId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      
      expect(res.statusCode).toBe(400);
    });
  });

  describe('POST /api/admin/users/:id/reset-password', () => {
    it('should reset user password', async () => {
      const userId = testUsers[2]._id;
      
      const res = await request(app)
        .post(`/api/admin/users/${userId}/reset-password`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ newPassword: 'newpassword123' });
      
      expect(res.statusCode).toBe(200);
      expect(res.body.message).toBe('Password reset successfully');
    });
  });

  describe('GET /api/admin/matches', () => {
    it('should return all matches', async () => {
      const res = await request(app)
        .get('/api/admin/matches')
        .set('Authorization', `Bearer ${adminToken}`);
      
      expect(res.statusCode).toBe(200);
      expect(res.body.matches).toBeDefined();
      expect(Array.isArray(res.body.matches)).toBe(true);
      expect(res.body.matches.length).toBeGreaterThan(0);
    });

    it('should filter matches by status', async () => {
      const res = await request(app)
        .get('/api/admin/matches')
        .query({ status: 'upcoming' })
        .set('Authorization', `Bearer ${adminToken}`);
      
      expect(res.statusCode).toBe(200);
      expect(res.body.matches.every(match => match.status === 'upcoming')).toBe(true);
    });
  });

  describe('DELETE /api/admin/matches/:id', () => {
    it('should force delete match', async () => {
      const matchId = testMatches[0]._id;
      
      const res = await request(app)
        .delete(`/api/admin/matches/${matchId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      
      expect(res.statusCode).toBe(200);
      
      // Проверяем что матч удален
      const deletedMatch = await Match.findById(matchId);
      expect(deletedMatch).toBeNull();
    });

    it('should handle non-existent match', async () => {
      const fakeMatchId = new mongoose.Types.ObjectId();
      
      const res = await request(app)
        .delete(`/api/admin/matches/${fakeMatchId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      
      expect(res.statusCode).toBe(404);
    });
  });

  describe('POST /api/admin/matches/:id/cancel', () => {
    it('should cancel finished match', async () => {
      const matchId = testMatches[1]._id; // finished match
      
      const res = await request(app)
        .post(`/api/admin/matches/${matchId}/cancel`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ reason: 'Test cancellation' });
      
      expect(res.statusCode).toBe(200);
      expect(res.body.message).toBe('Match force cancelled successfully');
      
      // Проверяем что матч отменен
      const cancelledMatch = await Match.findById(matchId);
      expect(cancelledMatch.status).toBe('cancelled');
    });
  });

  describe('GET /api/admin/analytics/overview', () => {
    it('should return analytics overview', async () => {
      const res = await request(app)
        .get('/api/admin/analytics/overview')
        .set('Authorization', `Bearer ${adminToken}`);
      
      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('totalUsers');
      expect(res.body).toHaveProperty('totalMatches');
      expect(res.body).toHaveProperty('totalResults');
    });
  });

  describe('GET /api/admin/analytics/users', () => {
    it('should return user analytics', async () => {
      const res = await request(app)
        .get('/api/admin/analytics/users')
        .set('Authorization', `Bearer ${adminToken}`);
      
      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('blockedUsers');
      expect(res.body).toHaveProperty('registrationsByMonth');
      expect(res.body).toHaveProperty('topPlayersByRating');
    });
  });

  describe('GET /api/admin/analytics/matches', () => {
    it('should return match analytics', async () => {
      const res = await request(app)
        .get('/api/admin/analytics/matches')
        .set('Authorization', `Bearer ${adminToken}`);
      
      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('avgParticipants');
      expect(res.body).toHaveProperty('matchesByMonth');
      expect(res.body).toHaveProperty('popularCourts');
    });
  });

  describe('GET /api/admin/settings', () => {
    it('should return system settings', async () => {
      const res = await request(app)
        .get('/api/admin/settings')
        .set('Authorization', `Bearer ${adminToken}`);
      
      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('defaultRating');
      expect(res.body).toHaveProperty('maxParticipants');
      expect(res.body).toHaveProperty('maxMatchDuration');
    });
  });

  describe('PUT /api/admin/settings', () => {
    it('should update system settings', async () => {
      const newSettings = {
        maxParticipants: 8,
        defaultMatchDuration: 90
      };
      
      const res = await request(app)
        .put('/api/admin/settings')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(newSettings);
      
      expect(res.statusCode).toBe(200);
    });
  });

  describe('GET /api/admin/export/users', () => {
    it('should export users data', async () => {
      const res = await request(app)
        .get('/api/admin/export/users')
        .set('Authorization', `Bearer ${adminToken}`);
      
      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toContain('application/json');
    });
  });

  describe('GET /api/admin/export/matches', () => {
    it('should export matches data', async () => {
      const res = await request(app)
        .get('/api/admin/export/matches')
        .set('Authorization', `Bearer ${adminToken}`);
      
      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toContain('application/json');
    });
  });

  describe('Security Tests', () => {
    it('should reject non-admin access to all admin routes', async () => {
      const playerToken = generateTestToken(testUsers[2]._id, 'player');
      
      const adminRoutes = [
        { method: 'get', path: '/api/admin/users' },
        { method: 'put', path: `/api/admin/users/${testUsers[2]._id}/role` },
        { method: 'post', path: `/api/admin/users/${testUsers[2]._id}/block` },
        { method: 'delete', path: `/api/admin/users/${testUsers[2]._id}` },
        { method: 'get', path: '/api/admin/matches' },
        { method: 'delete', path: `/api/admin/matches/${testMatches[0]._id}` },
        { method: 'get', path: '/api/admin/analytics/overview' },
        { method: 'get', path: '/api/admin/settings' },
        { method: 'get', path: '/api/admin/export/users' }
      ];

      for (const route of adminRoutes) {
        const res = await request(app)[route.method](route.path)
          .set('Authorization', `Bearer ${playerToken}`);
        
        expect(res.statusCode).toBe(403);
      }
    });

    it('should handle invalid admin tokens', async () => {
      const invalidToken = 'invalid-token';
      
      const res = await request(app)
        .get('/api/admin/users')
        .set('Authorization', `Bearer ${invalidToken}`);
      
      expect(res.statusCode).toBe(401);
    });
  });
}); 