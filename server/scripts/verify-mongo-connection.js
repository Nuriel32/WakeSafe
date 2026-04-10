/**
 * Verifies MongoDB connectivity using the official driver.
 *
 * Usage (PowerShell):
 *   $env:MONGO_URI="mongodb+srv://..."
 *   node scripts/verify-mongo-connection.js
 */
const { MongoClient } = require('mongodb');

async function main() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error('Missing MONGO_URI env var');
    process.exit(2);
  }

  const client = new MongoClient(uri, {
    serverSelectionTimeoutMS: 8000,
    connectTimeoutMS: 8000,
    socketTimeoutMS: 8000,
    retryWrites: true,
  });

  try {
    await client.connect();
    const admin = client.db('admin');
    const res = await admin.command({ ping: 1 });
    console.log('MongoDB ping ok:', res);
  } finally {
    await client.close().catch(() => {});
  }
}

main().catch((err) => {
  console.error('MongoDB connection failed:', err?.message || err);
  process.exit(1);
});

