const mongoose = require('mongoose');
const { connectTestDB, disconnectTestDB } = require('../utils/testDb');

describe('Database Safety Tests', () => {
  beforeAll(async () => {
    process.env.JWT_SECRET = 'test-secret';
  });

  afterAll(async () => {
    await disconnectTestDB();
  });

  it('should use test database, not production', async () => {
    await connectTestDB();
    
    // Проверяем что подключение к тестовой БД
    const connection = mongoose.connection;
    const dbName = connection.name;
    
    console.log('Connected to database:', dbName);
    
    // Тестовая БД должна иметь случайное имя
    expect(dbName).toMatch(/test/);
    
    // Проверяем что это не продакшн БД
    expect(dbName).not.toBe('volley-match');
    
    await disconnectTestDB();
  });

  it('should not have access to production data', async () => {
    await connectTestDB();
    
    // Пытаемся найти данные - их не должно быть
    const users = await mongoose.connection.db.collection('users').find({}).toArray();
    const matches = await mongoose.connection.db.collection('matches').find({}).toArray();
    
    // В тестовой БД должно быть пусто
    expect(users).toHaveLength(0);
    expect(matches).toHaveLength(0);
    
    await disconnectTestDB();
  });
}); 