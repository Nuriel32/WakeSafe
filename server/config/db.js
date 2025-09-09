// server/config/db.js
const mongoose = require('mongoose');

async function connectDB() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.warn('[DB] MONGO_URI is not set; skipping Mongo connection');
    return; // <- do nothing if not provided
  }

  try {
    await mongoose.connect(uri, {
      dbName: process.env.MONGO_DB,
      serverSelectionTimeoutMS: 5000,
    });
    console.info('[DB] Mongo connected');
  } catch (err) {
    // Don’t crash the process during smoke/health; just log.
    console.error('[DB] Mongo connection failed:', err.message);
  }
}

module.exports = connectDB;
