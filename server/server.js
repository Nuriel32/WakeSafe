// server.js
// Non-blocking startup for Cloud Run: start HTTP immediately, init Mongo/Redis in background.

const http = require('http');
const app = require('./app');
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const logger = require('./utils/logger');

// ---- Config ----
const PORT = Number(process.env.PORT) || 8080;
const HOST = process.env.HOST || '0.0.0.0';
const JWT_SECRET = process.env.JWT_SECRET || '';
const CORS_ORIGIN = process.env.SOCKET_IO_ORIGIN || '*';

// Redis local-in-container defaults (Dockerfile launches redis-server separately)
const REDIS_HOST = process.env.REDIS_HOST || '127.0.0.1';
const REDIS_PORT = Number(process.env.REDIS_PORT || 6379);

// ---- Health endpoints (ready immediately) ----
app.get('/healthz', (_req, res) => res.status(200).send('ok'));
app.get('/readyz', (_req, res) => res.status(200).send('ready'));

// ---- HTTP server + Socket.IO ----
const server = http.createServer(app);
server.keepAliveTimeout = 65_000;
server.headersTimeout = 66_000;

const io = new Server(server, {
  cors: { origin: CORS_ORIGIN, methods: ['GET', 'POST'] },
  path: '/socket.io',
});

// ---- Lazy revocation check (non-blocking before Redis is ready) ----
let isTokenRevoked = async (_jti) => false;

// ---- Socket.IO auth middleware ----
io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    if (!token) return next(new Error('Authentication token required'));
    if (!JWT_SECRET) return next(new Error('Server JWT secret not configured'));

    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch {
      return next(new Error('Authentication failed'));
    }

    const jti = decoded.jti;
    if (jti) {
      const revoked = await isTokenRevoked(jti);
      if (revoked) return next(new Error('Token has been revoked'));
    }

    socket.userId = decoded.id;
    socket.jti = jti;
    return next();
  } catch (err) {
    safeLog('error', `WebSocket authentication failed: ${err.message}`);
    return next(new Error('Authentication failed'));
  }
});

// ---- Socket.IO handlers ----
io.on('connection', (socket) => {
  safeLog('info', `WebSocket client connected: ${socket.userId}`);
  const room = `user:${socket.userId}`;
  socket.join(room);

  socket.on('photo_upload_start', (data = {}) => {
    safeLog('info', `Photo upload started for user ${socket.userId}: ${data.fileName}`);
    socket.emit('photo_upload_progress', {
      photoId: data.photoId || 'temp',
      progress: 0,
      fileName: data.fileName,
    });
  });

  socket.on('photo_upload_chunk', (data = {}) => {
    const total = Number(data.totalChunks) || 1;
    const idx = Number(data.chunkIndex) || 0;
    const progress = Math.max(0, Math.min(100, Math.round((idx / total) * 100)));
    socket.emit('photo_upload_progress', {
      photoId: data.photoId,
      progress,
      fileName: data.fileName,
    });
  });

  socket.on('photo_upload_complete', (data = {}) => {
    safeLog('info', `Photo upload completed for user ${socket.userId}: ${data.fileName}`);
    socket.emit('photo_upload_complete', {
      photoId: data.photoId,
      fileName: data.fileName,
      gcsPath: data.gcsPath,
      metadata: data.metadata,
    });
  });

  socket.on('photo_upload_error', (data = {}) => {
    safeLog('error', `Photo upload error for user ${socket.userId}: ${data.error}`);
    socket.emit('photo_upload_error', {
      photoId: data.photoId,
      fileName: data.fileName,
      error: data.error,
    });
  });

  socket.on('session_start', (data = {}) => {
    safeLog('info', `Session started for user ${socket.userId}: ${data.sessionId}`);
    socket.to(room).emit('session_update', {
      sessionId: data.sessionId,
      status: 'active',
      timestamp: Date.now(),
    });
  });

  socket.on('session_end', (data = {}) => {
    safeLog('info', `Session ended for user ${socket.userId}: ${data.sessionId}`);
    socket.to(room).emit('session_update', {
      sessionId: data.sessionId,
      status: 'ended',
      timestamp: Date.now(),
    });
  });

  socket.on('location_update', (data = {}) => {
    socket.to(room).emit('location_update', {
      location: data.location,
      timestamp: Date.now(),
    });
  });

  socket.on('continuous_capture_start', (data = {}) => {
    safeLog('info', `Continuous photo capture started for user ${socket.userId}, session: ${data.sessionId}`);
    socket.emit('continuous_capture_started', {
      sessionId: data.sessionId,
      captureRate: '1 photo per second',
      timestamp: Date.now(),
    });
  });

  socket.on('continuous_capture_stop', (data = {}) => {
    safeLog('info', `Continuous photo capture stopped for user ${socket.userId}, session: ${data.sessionId}`);
    socket.emit('continuous_capture_stopped', {
      sessionId: data.sessionId,
      timestamp: Date.now(),
    });
  });

  socket.on('photo_captured', (data = {}) => {
    socket.emit('photo_capture_confirmed', {
      sequenceNumber: data.sequenceNumber,
      timestamp: data.timestamp,
      sessionId: data.sessionId,
    });
  });

  socket.on('upload_started', (data = {}) => {
    safeLog('info', `Photo upload started for user ${socket.userId}: ${data.fileName}`);
    socket.emit('upload_progress', {
      photoId: data.photoId,
      progress: 0,
      fileName: data.fileName,
      status: 'uploading',
    });
  });

  socket.on('upload_progress', (data = {}) => {
    const progress = Math.max(0, Math.min(100, data.progress || 0));
    socket.emit('upload_progress', {
      photoId: data.photoId,
      progress,
      fileName: data.fileName,
      status: 'uploading',
    });
  });

  socket.on('upload_completed', (data = {}) => {
    safeLog('info', `Photo upload completed for user ${socket.userId}: ${data.fileName}`);
    socket.emit('upload_completed', {
      photoId: data.photoId,
      fileName: data.fileName,
      gcsPath: data.gcsPath,
      status: 'completed',
      aiProcessingQueued: data.aiProcessingQueued || false,
    });
  });

  socket.on('upload_failed', (data = {}) => {
    safeLog('error', `Photo upload failed for user ${socket.userId}: ${data.error}`);
    socket.emit('upload_failed', {
      photoId: data.photoId,
      fileName: data.fileName,
      error: data.error,
      status: 'failed',
    });
  });

  socket.on('disconnect', (reason) => {
    safeLog('info', `WebSocket client disconnected: ${socket.userId}, reason: ${reason}`);
  });

  socket.on('error', (error) => {
    safeLog('error', `WebSocket error for user ${socket.userId}: ${error?.message || error}`);
  });
});

// ---- Global broadcast helpers ----
function broadcastFatigueDetection(userId, sessionId, fatigueLevel, confidence, photoId, aiResults) {
  io.to(`user:${userId}`).emit('fatigue_detection', {
    sessionId,
    fatigueLevel,
    confidence,
    photoId,
    aiResults,
    timestamp: Date.now(),
    alert: {
      type: fatigueLevel,
      severity: confidence > 0.8 ? 'high' : confidence > 0.6 ? 'medium' : 'low',
      message: getFatigueMessage(fatigueLevel, confidence),
      actionRequired: fatigueLevel === 'sleeping' || (fatigueLevel === 'drowsy' && confidence > 0.8),
    },
  });
}

function getFatigueMessage(fatigueLevel, confidence) {
  const messages = {
    alert: 'Driver is alert and focused',
    drowsy: `Driver appears drowsy (${Math.round(confidence * 100)}% confidence)`,
    sleeping: `Driver appears to be sleeping (${Math.round(confidence * 100)}% confidence) - IMMEDIATE ATTENTION REQUIRED`,
    unknown: 'Unable to determine driver state',
  };
  return messages[fatigueLevel] || 'Unknown fatigue state';
}

function broadcastAIProcessingComplete(userId, photoId, results, processingTime) {
  io.to(`user:${userId}`).emit('ai_processing_complete', {
    photoId,
    results,
    processingTime,
    timestamp: Date.now(),
  });
}

function sendNotificationToUser(userId, message, type = 'info', duration = 5000) {
  io.to(`user:${userId}`).emit('notification', {
    message,
    type,
    duration,
    timestamp: Date.now(),
  });
}

// Also make them globally available if other modules expect that
global.broadcastFatigueDetection = broadcastFatigueDetection;
global.broadcastAIProcessingComplete = broadcastAIProcessingComplete;
global.sendNotificationToUser = sendNotificationToUser;

// ---- Start server immediately; init dependencies in background ----
server.listen(PORT, HOST, () => {
  safeLog('info', `HTTP listening on http://${HOST}:${PORT}`);
  safeLog('info', `WebSocket listening on ws://${HOST}:${PORT}`);
  initBackground().catch((err) => safeLog('error', `Background init error: ${err.message}`));
});

// ---- Background initialization (non-blocking) ----
async function initBackground() {
  await Promise.allSettled([connectMongo(), connectRedis()]);
  const client = app.locals?.redis;
  if (client) {
    isTokenRevoked = async (jti) => {
      if (!jti) return false;
      try {
        const val = await client.get(`revoked:${jti}`);
        return val === '1' || val === 'true';
      } catch (e) {
        safeLog('error', `Revocation check failed: ${e.message}`);
        return false; // fail-open for availability
      }
    };
  }
}

async function connectMongo() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    safeLog('warn', 'MONGO_URI is not set; skipping Mongo connection');
    return;
  }
  try {
    const mongoose = require('mongoose');
    await mongoose.connect(uri, {
      dbName: process.env.MONGO_DB,
      serverSelectionTimeoutMS: 5000,
    });
    safeLog('info', 'Mongo connected');
  } catch (err) {
    safeLog('error', `Mongo connect failed (continuing): ${err.message}`);
  }
}

let redisClient;
async function connectRedis() {
  try {
    const { createClient } = require('redis');
    redisClient = createClient({ socket: { host: REDIS_HOST, port: REDIS_PORT } });
    redisClient.on('error', (err) => safeLog('error', `Redis error: ${err.message}`));
    await redisClient.connect();
    app.locals.redis = redisClient;
    safeLog('info', `Redis connected at ${REDIS_HOST}:${REDIS_PORT}`);
  } catch (err) {
    safeLog('error', `Redis connect failed (continuing): ${err.message}`);
  }
}

// ---- Global process error handlers (log-only; never exit on smoke) ----
process.on('unhandledRejection', (r) => safeLog('error', `unhandledRejection: ${r}`));
process.on('uncaughtException', (e) => safeLog('error', `uncaughtException: ${e?.message || e}`));

// ---- Graceful shutdown ----
function shutdown(signal) {
  safeLog('info', `Received ${signal}, shutting down...`);
  Promise.resolve()
    .then(() => (redisClient ? redisClient.quit().catch(() => {}) : null))
    .then(() => new Promise((res) => server.close(() => res())))
    .then(() => {
      safeLog('info', 'Shutdown complete');
      process.exit(0);
    })
    .catch((e) => {
      safeLog('error', `Shutdown error: ${e.message}`);
      process.exit(1);
    });
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// ---- Safe logger wrapper ----
function safeLog(level, msg) {
  try {
    if (logger && typeof logger[level] === 'function') {
      logger[level](msg);
    } else {
      const map = { info: 'log', warn: 'warn', error: 'error' };
      console[map[level] || 'log'](msg);
    }
  } catch {
    console.log(msg);
  }
}

// ---- Combined exports (avoid overwrite) ----
module.exports = {
  server,
  io,
  broadcastFatigueDetection,
  broadcastAIProcessingComplete,
  sendNotificationToUser,
};
