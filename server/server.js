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

// Create Socket.IO server with proper configuration
const io = new Server(server, {
  cors: { 
    origin: CORS_ORIGIN, 
    methods: ['GET', 'POST'],
    credentials: true
  },
  path: '/socket.io',
  transports: ['websocket', 'polling'],
  allowEIO3: true
});

// ---- Lazy revocation check (non-blocking before Redis is ready) ----
let isTokenRevoked = async (_jti) => false;

// ---- Socket.IO Authentication Middleware ----
io.use(async (socket, next) => {
  try {
    console.log('🔐 WebSocket authentication attempt');
    console.log('Handshake auth:', socket.handshake.auth);
    console.log('Handshake query:', socket.handshake.query);
    
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    
    if (!token) {
      console.log('❌ No token provided');
      return next(new Error('Authentication token required'));
    }
    
    if (!JWT_SECRET) {
      console.log('❌ JWT_SECRET not configured');
      return next(new Error('Server JWT secret not configured'));
    }

    console.log('🔍 Verifying JWT token...');
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
      console.log('✅ JWT verified successfully');
      console.log('Decoded payload:', { id: decoded.id, email: decoded.email });
    } catch (jwtError) {
      console.log('❌ JWT verification failed:', jwtError.message);
      return next(new Error('Invalid token'));
    }

    // Check if token is revoked
    const jti = decoded.jti;
    if (jti) {
      const revoked = await isTokenRevoked(jti);
      if (revoked) {
        console.log('❌ Token has been revoked');
        return next(new Error('Token has been revoked'));
      }
    }

    // Attach user info to socket
    socket.userId = decoded.id;
    socket.userEmail = decoded.email;
    socket.jti = jti;
    
    console.log('✅ WebSocket authentication successful for user:', decoded.email);
    return next();
  } catch (err) {
    console.log('❌ WebSocket authentication error:', err.message);
    return next(new Error('Authentication failed'));
  }
});

// ---- Socket.IO Connection Handler ----
io.on('connection', (socket) => {
  console.log('🎉 WebSocket client connected successfully!');
  console.log('User ID:', socket.userId);
  console.log('User Email:', socket.userEmail);
  console.log('Socket ID:', socket.id);
  
  // Join user-specific room
  const room = `user:${socket.userId}`;
  socket.join(room);
  console.log(`📡 User joined room: ${room}`);

  // Send welcome message
  socket.emit('connected', {
    message: 'Connected to WakeSafe server',
    userId: socket.userId,
    timestamp: Date.now()
  });

  // ---- Session Management Events ----
  socket.on('session_start', (data = {}) => {
    console.log(`🚀 Session started for user ${socket.userId}: ${data.sessionId}`);
    socket.emit('session_started', {
      sessionId: data.sessionId,
      status: 'active',
      timestamp: Date.now()
    });
  });

  socket.on('session_end', (data = {}) => {
    console.log(`🛑 Session ended for user ${socket.userId}: ${data.sessionId}`);
    socket.emit('session_ended', {
      sessionId: data.sessionId,
      status: 'ended',
      timestamp: Date.now()
    });
  });

  // ---- Photo Capture Events ----
  socket.on('continuous_capture_start', (data = {}) => {
    console.log(`📸 Continuous photo capture started for user ${socket.userId}, session: ${data.sessionId}`);
    socket.emit('continuous_capture_started', {
      sessionId: data.sessionId,
      captureRate: '1 photo per second',
      timestamp: Date.now()
    });
  });

  socket.on('continuous_capture_stop', (data = {}) => {
    console.log(`⏹️ Continuous photo capture stopped for user ${socket.userId}, session: ${data.sessionId}`);
    socket.emit('continuous_capture_stopped', {
      sessionId: data.sessionId,
      timestamp: Date.now()
    });
  });

  socket.on('photo_captured', (data = {}) => {
    console.log(`📷 Photo captured for user ${socket.userId}, sequence: ${data.sequenceNumber}`);
    socket.emit('photo_capture_confirmed', {
      sequenceNumber: data.sequenceNumber,
      timestamp: data.timestamp,
      sessionId: data.sessionId
    });
  });

  // ---- Upload Events ----
  socket.on('upload_started', (data = {}) => {
    console.log(`⬆️ Photo upload started for user ${socket.userId}: ${data.fileName}`);
    socket.emit('upload_progress', {
      photoId: data.photoId,
      progress: 0,
      fileName: data.fileName,
      status: 'uploading'
    });
  });

  socket.on('upload_progress', (data = {}) => {
    const progress = Math.max(0, Math.min(100, data.progress || 0));
    socket.emit('upload_progress', {
      photoId: data.photoId,
      progress,
      fileName: data.fileName,
      status: 'uploading'
    });
  });

  socket.on('upload_completed', (data = {}) => {
    console.log(`✅ Photo upload completed for user ${socket.userId}: ${data.fileName}`);
    socket.emit('upload_completed', {
      photoId: data.photoId,
      fileName: data.fileName,
      gcsPath: data.gcsPath,
      status: 'completed',
      aiProcessingQueued: data.aiProcessingQueued || false
    });
  });

  socket.on('upload_failed', (data = {}) => {
    console.log(`❌ Photo upload failed for user ${socket.userId}: ${data.error}`);
    socket.emit('upload_failed', {
      photoId: data.photoId,
      fileName: data.fileName,
      error: data.error,
      status: 'failed'
    });
  });

  // ---- Location Updates ----
  socket.on('location_update', (data = {}) => {
    console.log(`📍 Location update from user ${socket.userId}`);
    socket.to(room).emit('location_update', {
      location: data.location,
      timestamp: Date.now()
    });
  });

  // ---- Ping/Pong for connection health ----
  socket.on('ping', () => {
    socket.emit('pong', { timestamp: Date.now() });
  });

  // ---- Disconnect Handler ----
  socket.on('disconnect', (reason) => {
    console.log(`👋 WebSocket client disconnected: ${socket.userId}, reason: ${reason}`);
  });

  // ---- Error Handler ----
  socket.on('error', (error) => {
    console.log(`💥 WebSocket error for user ${socket.userId}: ${error?.message || error}`);
  });
});

// ---- Global broadcast helpers ----
function broadcastFatigueDetection(userId, sessionId, fatigueLevel, confidence, photoId, aiResults) {
  console.log(`🚨 Broadcasting fatigue detection for user ${userId}: ${fatigueLevel}`);
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
  console.log(`🤖 Broadcasting AI processing complete for user ${userId}`);
  io.to(`user:${userId}`).emit('ai_processing_complete', {
    photoId,
    results,
    processingTime,
    timestamp: Date.now(),
  });
}

function sendNotificationToUser(userId, message, type = 'info', duration = 5000) {
  console.log(`📢 Sending notification to user ${userId}: ${message}`);
  io.to(`user:${userId}`).emit('notification', {
    message,
    type,
    duration,
    timestamp: Date.now(),
  });
}

// Make them globally available
global.broadcastFatigueDetection = broadcastFatigueDetection;
global.broadcastAIProcessingComplete = broadcastAIProcessingComplete;
global.sendNotificationToUser = sendNotificationToUser;

// ---- Start server immediately; init dependencies in background ----
server.listen(PORT, HOST, () => {
  console.log(`🚀 Server is running on port ${PORT}`);
  console.log(`🌐 HTTP listening on http://${HOST}:${PORT}`);
  console.log(`🔌 WebSocket listening on ws://${HOST}:${PORT}`);
  initBackground().catch((err) => console.error(`Background init error: ${err.message}`));
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
        console.error(`Revocation check failed: ${e.message}`);
        return false; // fail-open for availability
      }
    };
  }
}

async function connectMongo() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.warn('MONGO_URI is not set; skipping Mongo connection');
    return;
  }
  try {
    const mongoose = require('mongoose');
    await mongoose.connect(uri, {
      dbName: process.env.MONGO_DB,
      serverSelectionTimeoutMS: 5000,
    });
    console.log('✅ MongoDB Connected');
  } catch (err) {
    console.error(`Mongo connect failed (continuing): ${err.message}`);
  }
}

let redisClient;
async function connectRedis() {
  try {
    const { createClient } = require('redis');
    redisClient = createClient({ socket: { host: REDIS_HOST, port: REDIS_PORT } });
    redisClient.on('error', (err) => console.error(`Redis error: ${err.message}`));
    await redisClient.connect();
    app.locals.redis = redisClient;
    console.log(`✅ Redis connected at ${REDIS_HOST}:${REDIS_PORT}`);
  } catch (err) {
    console.error(`Redis connect failed (continuing): ${err.message}`);
  }
}

// ---- Global process error handlers (log-only; never exit on smoke) ----
process.on('unhandledRejection', (r) => console.error(`unhandledRejection: ${r}`));
process.on('uncaughtException', (e) => console.error(`uncaughtException: ${e?.message || e}`));

// ---- Graceful shutdown ----
function shutdown(signal) {
  console.log(`Received ${signal}, shutting down...`);
  Promise.resolve()
    .then(() => (redisClient ? redisClient.quit().catch(() => {}) : null))
    .then(() => new Promise((res) => server.close(() => res())))
    .then(() => {
      console.log('Shutdown complete');
      process.exit(0);
    })
    .catch((e) => {
      console.error(`Shutdown error: ${e.message}`);
      process.exit(1);
    });
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// ---- Combined exports ----
module.exports = {
  server,
  io,
  broadcastFatigueDetection,
  broadcastAIProcessingComplete,
  sendNotificationToUser,
};
