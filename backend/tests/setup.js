// Увеличиваем timeout для тестов с MongoDB
jest.setTimeout(30000);

// Mock console.log для чистых тестов
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

// Принудительно используем in-memory MongoDB для всех тестов
// Это защищает от случайного подключения к продакшн БД
process.env.NODE_ENV = 'test';
process.env.FORCE_TEST_DB = 'true'; 