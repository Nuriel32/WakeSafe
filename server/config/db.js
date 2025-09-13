// server/config/db.js
const mongoose = require('mongoose');

async function connectDB() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.warn('[DB] MONGO_URI is not set; skipping Mongo connection');
    return;
  }

  // בדיקה אם יש שם DB בתוך ה-URI עצמו
  const hasDbInUri = /mongodb(\+srv)?:\/\/[^/]+\/[^?]+/.test(uri);

  const opts = {
    serverSelectionTimeoutMS: 90000,   // 90s - זמן בחירת שרת
    connectTimeoutMS: 60000,           // 60s - זמן התחברות
    socketTimeoutMS: 180000,           // 180s - זמן סוקט
    maxPoolSize: Number(process.env.MONGO_POOL_SIZE || 5),
    retryWrites: true,
    retryReads: true,
  };

  // אם אין שם DB ב-URI, נוסיף מה-env
  if (!hasDbInUri && process.env.MONGO_DB) {
    opts.dbName = process.env.MONGO_DB;
  }

  const maxRetries = 3;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[DB] Attempting MongoDB connection (attempt ${attempt}/${maxRetries})...`);
      await mongoose.connect(uri, opts);
      console.info(`[DB] MongoDB connected successfully (db: ${mongoose.connection.name})`);
      return;
    } catch (err) {
      console.error(`[DB] MongoDB connection failed (attempt ${attempt}): ${err.message}`);
      if (attempt < maxRetries) {
        const backoff = 5000 * attempt;
        console.log(`[DB] Retrying in ${backoff / 1000}s...`);
        await new Promise(resolve => setTimeout(resolve, backoff));
      } else {
        console.error('[DB] All retries failed');
        console.error('[DB] Full error:', err);
      }
    }
  }
}

module.exports = connectDB;
