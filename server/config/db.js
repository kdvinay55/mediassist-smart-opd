const mongoose = require('mongoose');

let _mongod = null;

const connectDB = async () => {
  // If MONGO_URI is not set, optionally start an in-memory MongoDB for local development
  if (!process.env.MONGO_URI) {
    if (process.env.DEV_USE_MEMORY_DB === 'true') {
      try {
        const { MongoMemoryServer } = require('mongodb-memory-server');
        _mongod = await MongoMemoryServer.create();
        process.env.MONGO_URI = _mongod.getUri();
        console.log('Using in-memory MongoDB for development');
      } catch (err) {
        console.error('Failed to start in-memory MongoDB:', err.message);
        throw err;
      }
    } else {
      throw new Error('MONGO_URI is not set');
    }
  }

  const conn = await mongoose.connect(process.env.MONGO_URI, {
    serverSelectionTimeoutMS: 4000
  });
  console.log(`MongoDB Connected: ${conn.connection.host}`);
  return conn;
};

connectDB.stop = async () => {
  try {
    if (mongoose.connection.readyState) await mongoose.disconnect();
    if (_mongod) await _mongod.stop();
  } catch (err) {
    // ignore stop errors
  }
};

module.exports = connectDB;
