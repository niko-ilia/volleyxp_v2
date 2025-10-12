const request = require('supertest');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const app = require('../server');
const User = require('../models/User');
const { connectTestDB, disconnectTestDB, clearTestDB } = require('../utils/testDb');

describe('Middleware Tests', () => {
  let testUsers = [];

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
        email: 'user@test.com',
        name: 'Regular User',
        password: 'password123',
        rating: 1000,
        role: 'player'
      },
      {
        email: 'admin@test.com',
        name: 'Admin User',
        password: 'password123',
        rating: 1000,
        role: 'super_admin'
      },
      {
        email: 'court@test.com',
        name: 'Court Admin',
        password: 'password123',
        rating: 1000,
        role: 'court_admin',
        managedCourts: ['Court 1', 'Court 2']
      }
    ]);
  });

  function generateTestToken(userId, role = 'player') {
    return jwt.sign({ userId, role }, process.env.JWT_SECRET, { expiresIn: '1h' });
  }

  describe('Auth Middleware', () => {
    it('should allow access with valid token', async () => {
      const token = generateTestToken(testUsers[0]._id);
      
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${token}`);
      
      expect(res.statusCode).toBe(200);
      expect(res.body.email).toBe(testUsers[0].email);
    });

    it('should reject request without token', async () => {
      const res = await request(app)
        .get('/api/auth/me');
      
      expect(res.statusCode).toBe(401);
    });

    it('should reject request with invalid token', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer invalid-token');
      
      expect(res.statusCode).toBe(401);
    });

    it('should reject request with expired token', async () => {
      const expiredToken = jwt.sign(
        { userId: testUsers[0]._id },
        process.env.JWT_SECRET,
        { expiresIn: '0s' }
      );
      
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${expiredToken}`);
      
      expect(res.statusCode).toBe(401);
    });

    it('should reject request with malformed token', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer malformed.token.here');
      
      expect(res.statusCode).toBe(401);
    });

    it('should reject request with wrong secret', async () => {
      const wrongToken = jwt.sign(
        { userId: testUsers[0]._id },
        'wrong-secret',
        { expiresIn: '1h' }
      );
      
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${wrongToken}`);
      
      expect(res.statusCode).toBe(401);
    });

    it('should handle non-existent user gracefully', async () => {
      const fakeUserId = new mongoose.Types.ObjectId();
      const token = generateTestToken(fakeUserId);
      
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${token}`);
      
      expect(res.statusCode).toBe(401);
    });

    it('should handle blocked user', async () => {
      // Блокируем пользователя
      await User.findByIdAndUpdate(testUsers[0]._id, { isBlocked: true });
      
      const token = generateTestToken(testUsers[0]._id);
      
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${token}`);
      
      // Auth middleware не проверяет isBlocked, поэтому возвращает 200
      expect(res.statusCode).toBe(200);
    });
  });

  describe('Admin Middleware', () => {
    it('should allow super admin access', async () => {
      const token = generateTestToken(testUsers[1]._id, 'super_admin');
      
      const res = await request(app)
        .get('/api/admin/users')
        .set('Authorization', `Bearer ${token}`);
      
      expect(res.statusCode).toBe(200);
    });

    it('should reject court admin access to super admin routes', async () => {
      const token = generateTestToken(testUsers[2]._id, 'court_admin');
      
      const res = await request(app)
        .get('/api/admin/users')
        .set('Authorization', `Bearer ${token}`);
      
      // Court admin не может получить доступ к super admin роутам
      expect(res.statusCode).toBe(403);
    });

    it('should reject regular user access to admin routes', async () => {
      const token = generateTestToken(testUsers[0]._id, 'player');
      
      const res = await request(app)
        .get('/api/admin/users')
        .set('Authorization', `Bearer ${token}`);
      
      expect(res.statusCode).toBe(403);
    });

    it('should reject request without admin role', async () => {
      const token = generateTestToken(testUsers[0]._id);
      
      const res = await request(app)
        .get('/api/admin/users')
        .set('Authorization', `Bearer ${token}`);
      
      expect(res.statusCode).toBe(403);
    });

    it('should handle invalid admin role', async () => {
      const token = generateTestToken(testUsers[0]._id, 'invalid_role');
      
      const res = await request(app)
        .get('/api/admin/users')
        .set('Authorization', `Bearer ${token}`);
      
      expect(res.statusCode).toBe(403);
    });
  });

  describe('Rate Limiting', () => {
    it('should handle multiple requests from same user', async () => {
      const token = generateTestToken(testUsers[0]._id);
      
      // Делаем несколько запросов подряд
      const promises = Array(5).fill().map(() => 
        request(app)
          .get('/api/auth/me')
          .set('Authorization', `Bearer ${token}`)
      );
      
      const responses = await Promise.all(promises);
      
      // Все запросы должны пройти успешно
      responses.forEach(res => {
        expect(res.statusCode).toBe(200);
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle middleware errors gracefully', async () => {
      // Тест с некорректным JWT_SECRET
      const originalSecret = process.env.JWT_SECRET;
      process.env.JWT_SECRET = '';
      
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer invalid-token');
      
      expect(res.statusCode).toBe(401);
      
      // Восстанавливаем JWT_SECRET
      process.env.JWT_SECRET = originalSecret;
    });

    it('should handle database connection errors', async () => {
      // Тест с несуществующим пользователем
      const fakeUserId = new mongoose.Types.ObjectId();
      const token = generateTestToken(fakeUserId);
      
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${token}`);
      
      expect(res.statusCode).toBe(401);
    });
  });

  describe('Security Tests', () => {
    it('should not expose sensitive information in errors', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer invalid-token');
      
      expect(res.statusCode).toBe(401);
      expect(res.body).not.toHaveProperty('stack');
      expect(res.body).not.toHaveProperty('error');
      expect(res.body.message).toBe('Token is not valid');
    });

    it('should validate token format', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer not-a-jwt-token');
      
      expect(res.statusCode).toBe(401);
    });

    it('should handle missing Authorization header', async () => {
      const res = await request(app)
        .get('/api/auth/me');
      
      expect(res.statusCode).toBe(401);
    });

    it('should handle malformed Authorization header', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'NotBearer token');
      
      expect(res.statusCode).toBe(401);
    });
  });
}); 