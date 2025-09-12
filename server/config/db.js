// server/config/db.js
const mongoose = require('mongoose');

async function connectDB() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.warn('[DB] MONGO_URI is not set; skipping Mongo connection');
    return; // <- do nothing if not provided
  }

  const maxRetries = 3;
  let retryCount = 0;

  while (retryCount < maxRetries) {
    try {
      console.log(`[DB] Attempting to connect to MongoDB (attempt ${retryCount + 1}/${maxRetries})...`);
      await mongoose.connect(uri, {
        dbName: process.env.MONGO_DB,
        serverSelectionTimeoutMS: 30000, // 30 seconds for cloud connections
        connectTimeoutMS: 30000, // 30 seconds connection timeout
        socketTimeoutMS: 45000, // 45 seconds socket timeout
        maxPoolSize: 10, // Maintain up to 10 socket connections
        serverSelectionRetryDelayMS: 5000, // Wait 5 seconds between retries
        heartbeatFrequencyMS: 10000, // Send a ping every 10 seconds
        retryWrites: true, // Retry write operations
        retryReads: true, // Retry read operations
      });
      console.info('[DB] MongoDB connected successfully');
      return; // Success, exit the retry loop
    } catch (err) {
      retryCount++;
      console.error(`[DB] MongoDB connection failed (attempt ${retryCount}/${maxRetries}):`, err.message);
      
      if (retryCount < maxRetries) {
        console.log(`[DB] Retrying in 5 seconds...`);
        await new Promise(resolve => setTimeout(resolve, 5000));
      } else {
        console.error('[DB] MongoDB connection failed after all retries:', err.message);
        console.error('[DB] Full error:', err);
      }
    }
  }
}

module.exports = connectDB;
