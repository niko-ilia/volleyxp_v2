const mongoose = require('mongoose');

let isConnected = false;

async function connectDB() {
  if (isConnected) {
    console.log('Using existing database connection');
    return;
  }

  try {
    const MONGODB_URI = process.env.MONGODB_URI;
    if (!MONGODB_URI) {
      throw new Error('MONGODB_URI environment variable is required');
    }

    await mongoose.connect(MONGODB_URI, {
      // Современные опции подключения
      serverSelectionTimeoutMS: 5000, // Таймаут выбора сервера
      socketTimeoutMS: 45000, // Таймаут сокета
      maxPoolSize: 10, // Максимальный размер пула соединений
      minPoolSize: 1, // Минимальный размер пула
      maxIdleTimeMS: 30000, // Время жизни неактивного соединения
    });

    isConnected = true;
    console.log('MongoDB connected successfully');

    // Обработка отключения
    mongoose.connection.on('disconnected', () => {
      console.log('MongoDB disconnected');
      isConnected = false;
    });

    // Обработка ошибок
    mongoose.connection.on('error', (error) => {
      console.error('MongoDB connection error:', error);
      isConnected = false;
    });

  } catch (error) {
    console.error('MongoDB connection failed:', error);
    throw error;
  }
}

async function disconnectDB() {
  if (!isConnected) return;
  
  try {
    await mongoose.connection.close();
    isConnected = false;
    console.log('MongoDB disconnected');
  } catch (error) {
    console.error('Error disconnecting from MongoDB:', error);
    throw error;
  }
}

module.exports = {
  connectDB,
  disconnectDB,
  isConnected: () => isConnected
}; 