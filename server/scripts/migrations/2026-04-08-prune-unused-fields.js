/* eslint-disable no-console */
require('dotenv').config();
const mongoose = require('mongoose');

async function main() {
  const uri =
    process.env.MONGODB_URI ||
    process.env.MONGO_URI ||
    'mongodb://127.0.0.1:27017/wakesafe';

  console.log(`[migration] connecting to ${uri.replace(/\/\/.*@/, '//***:***@')}`);
  await mongoose.connect(uri);

  const db = mongoose.connection.db;

  const photos = db.collection('photos');
  const driversessions = db.collection('driversessions');
  const users = db.collection('users');

  const photoUnset = {
    fileSize: '',
    contentType: '',
    originalName: '',
    fileName: '',
    uploadDuration: '',
    processingQueuePosition: '',
    'clientMeta.userAgent': '',
    'clientMeta.os': '',
    'clientMeta.model': '',
    'clientMeta.deviceId': '',
    'clientMeta.cameraSettings': '',
    'location.altitude': '',
    'location.speed': '',
    'location.heading': '',
    'location.timestamp': '',
    'imageQuality.blurScore': '',
    'imageQuality.brightness': '',
    'imageQuality.contrast': '',
  };

  const sessionUnset = {
    'startLocation.accuracy': '',
    'startLocation.address': '',
    'endLocation.accuracy': '',
    'endLocation.address': '',
    deviceInfo: '',
    'performanceMetrics.networkLatency': '',
    'performanceMetrics.batteryUsage': '',
  };

  // Users: keep as-is (large schema but may be used by Spotify/Profile screen).

  const photoResult = await photos.updateMany({}, { $unset: photoUnset });
  console.log('[migration] photos $unset modified:', photoResult.modifiedCount);

  const sessionResult = await driversessions.updateMany({}, { $unset: sessionUnset });
  console.log('[migration] driversessions $unset modified:', sessionResult.modifiedCount);

  console.log('[migration] done');
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error('[migration] failed:', err);
  try {
    await mongoose.disconnect();
  } catch {
    // ignore
  }
  process.exitCode = 1;
});

