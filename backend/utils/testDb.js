const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

let mongoServer;
let isConnected = false;

async function connectTestDB() {
  if (isConnected) {
    console.log('Using existing test database connection');
    return;
  }

  try {
    // Создаем in-memory MongoDB сервер
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    
    console.log('Starting in-memory MongoDB for tests...');
    
    await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      maxPoolSize: 10,
      minPoolSize: 1,
      maxIdleTimeMS: 30000,
    });

    isConnected = true;
    console.log('Test MongoDB connected successfully');

    // Обработка отключения
    mongoose.connection.on('disconnected', () => {
      console.log('Test MongoDB disconnected');
      isConnected = false;
    });

    // Обработка ошибок
    mongoose.connection.on('error', (error) => {
      console.error('Test MongoDB connection error:', error);
      isConnected = false;
    });

  } catch (error) {
    console.error('Test MongoDB connection failed:', error);
    throw error;
  }
}

async function disconnectTestDB() {
  if (!isConnected) return;
  
  try {
    await mongoose.connection.close();
    if (mongoServer) {
      await mongoServer.stop();
    }
    isConnected = false;
    console.log('Test MongoDB disconnected');
  } catch (error) {
    console.error('Error disconnecting from test MongoDB:', error);
    throw error;
  }
}

async function clearTestDB() {
  if (!isConnected) return;
  
  try {
    const collections = mongoose.connection.collections;
    for (const key in collections) {
      const collection = collections[key];
      await collection.deleteMany({});
    }
    console.log('Test database cleared');
  } catch (error) {
    console.error('Error clearing test database:', error);
    throw error;
  }
}

module.exports = {
  connectTestDB,
  disconnectTestDB,
  clearTestDB,
  isConnected: () => isConnected
}; 