// server.js
// Non-blocking startup for Cloud Run: start HTTP immediately, init Mongo/Redis in background.

const http = require('http');
const app = require('./app');
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const logger = require('./utils/logger');
const connectMongo = require('./config/db');
const monitoring = require('./services/monitoringService');
const cache = require('./services/cacheService');
const { randomUUID } = require('crypto');

// ---- Config ----
const PORT = Number(process.env.PORT) || 5000;
const HOST = process.env.HOST || '0.0.0.0';
const JWT_SECRET = process.env.JWT_SECRET || '';
const CORS_ORIGIN = process.env.SOCKET_IO_ORIGIN || '*';
const socketAllowedOrigins = CORS_ORIGIN === '*'
  ? true
  : CORS_ORIGIN.split(',').map((origin) => origin.trim()).filter(Boolean);

// Redis local-in-container defaults (Dockerfile launches redis-server separately)
const REDIS_HOST = process.env.REDIS_HOST || '127.0.0.1';
const REDIS_PORT = Number(process.env.REDIS_PORT || 6379);

// ---- Health endpoints (ready immediately) ----
let mongoReady = false;
mongoose.connection.on('connected', () => { mongoReady = true; });
mongoose.connection.on('disconnected', () => { mongoReady = false; });

app.get('/healthz', (_req, res) => res.status(200).send('ok'));
app.get('/readyz', (_req, res) => (mongoReady ? res.status(200).send('ready') : res.status(503).send('not ready')));

// ---- HTTP server + Socket.IO ----
const server = http.createServer(app);
server.keepAliveTimeout = 65_000;
server.headersTimeout = 66_000;

// Create Socket.IO server with proper configuration
const io = new Server(server, {
  cors: { 
    origin: socketAllowedOrigins,
    methods: ['GET', 'POST'],
    credentials: false,
    allowedHeaders: ['Authorization', 'Content-Type']
  },
  path: '/socket.io',
  transports: ['websocket', 'polling'],
  allowEIO3: true,
  pingTimeout: 60000,
  pingInterval: 25000
});
global.io = io;

// ---- Lazy revocation check (non-blocking before Redis is ready) ----
let isTokenRevoked = async (_jti) => false;

// ---- Socket.IO Authentication Middleware ----
io.use(async (socket, next) => {
  try {
    logger.info('WebSocket authentication attempt');
    const token = socket.handshake.auth?.token;
    
    if (!token) {
      logger.warn('WebSocket auth failed: No token provided');
      return next(new Error('Authentication token required'));
    }
    
    if (!JWT_SECRET) {
      logger.error('WebSocket auth failed: JWT_SECRET not configured');
      return next(new Error('Server JWT secret not configured'));
    }

    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
      logger.info(`WebSocket JWT verified for user ${decoded.id}`);
    } catch (jwtError) {
      logger.warn(`WebSocket JWT verification failed: ${jwtError.message}`);
      return next(new Error('Invalid token'));
    }

    // Check if token is revoked
    const jti = decoded.jti;
    if (jti) {
      const revoked = await isTokenRevoked(jti);
      if (revoked) {
        logger.warn(`WebSocket token revoked for user ${decoded.id}`);
        return next(new Error('Token has been revoked'));
      }
    }

    // Attach user info to socket
    socket.userId = decoded.id;
    socket.userEmail = decoded.email;
    socket.jti = jti;
    
    logger.info(`WebSocket authentication successful for user ${decoded.id}`);
    return next();
  } catch (err) {
    logger.error(`WebSocket authentication error: ${err.message}`);
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
  socket.join(`session:${socket.userId}`);
  socket.data.lastHeartbeatAt = Date.now();
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

  // ---- Application heartbeat ----
  socket.on('heartbeat', (data = {}) => {
    socket.data.lastHeartbeatAt = Date.now();
    socket.emit('heartbeat_ack', {
      timestamp: Date.now(),
      clientTimestamp: data.timestamp || null,
    });
  });

  // ---- Disconnect Handler ----
  socket.on('disconnect', (reason) => {
    console.log(`👋 WebSocket client disconnected: ${socket.userId}, reason: ${reason}`);
    monitoring.trackWarning('websocket_disconnect', {
      requestId: null,
      userId: socket.userId || null,
      tripId: null,
      socketId: socket.id,
      reason,
    }).catch(() => {});
  });

  // ---- Error Handler ----
  socket.on('error', (error) => {
    console.log(`💥 WebSocket error for user ${socket.userId}: ${error?.message || error}`);
    monitoring.trackFailure('websocket_error', {
      requestId: null,
      userId: socket.userId || null,
      tripId: null,
      socketId: socket.id,
      message: error?.message || String(error),
    }).catch(() => {});
  });
});

const SOCKET_HEARTBEAT_STALE_MS = Number(process.env.SOCKET_HEARTBEAT_STALE_MS || 70000);
const SOCKET_HEARTBEAT_SWEEP_MS = Number(process.env.SOCKET_HEARTBEAT_SWEEP_MS || 30000);
const heartbeatSweep = setInterval(async () => {
  try {
    const sockets = await io.fetchSockets();
    const now = Date.now();
    for (const s of sockets) {
      const last = Number(s.data?.lastHeartbeatAt || 0);
      if (last > 0 && now - last > SOCKET_HEARTBEAT_STALE_MS) {
        logger.warn(`Disconnecting stale socket userId=${s.userId} socketId=${s.id}`);
        s.disconnect(true);
      }
    }
  } catch (error) {
    logger.warn(`Heartbeat sweep failed: ${error.message}`);
  }
}, SOCKET_HEARTBEAT_SWEEP_MS);
heartbeatSweep.unref?.();

async function emitToUserWithDedupe(userId, eventName, payload, ttlSeconds = 60) {
  const room = `user:${userId}`;
  const eventId = payload?.eventId || `${eventName}:${payload?.sessionId || 'na'}:${payload?.photoId || 'na'}:${payload?.timestamp || Date.now()}`;
  const dedupeKey = `ws_emit:${eventName}:${userId}:${eventId}`;
  const already = await cache.get(dedupeKey);
  if (already) return false;
  await cache.set(dedupeKey, '1', ttlSeconds);
  io.to(room).emit(eventName, { ...payload, eventId });
  return true;
}

// ---- Global broadcast helpers ----
function broadcastFatigueDetection(userId, sessionId, fatigueLevel, confidence, photoId, aiResults) {
  console.log(`🚨 Broadcasting fatigue detection for user ${userId}: ${fatigueLevel}`);
  emitToUserWithDedupe(userId, 'fatigue_detection', {
    eventId: randomUUID(),
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
  }, 120).catch(() => {});
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
  emitToUserWithDedupe(userId, 'ai_processing_complete', {
    eventId: randomUUID(),
    photoId,
    results,
    processingTime,
    timestamp: Date.now(),
  }, 30).catch(() => {});
}

function sendNotificationToUser(userId, message, type = 'info', duration = 5000) {
  console.log(`📢 Sending notification to user ${userId}: ${message}`);
  emitToUserWithDedupe(userId, 'notification', {
    eventId: randomUUID(),
    message,
    type,
    duration,
    timestamp: Date.now(),
  }, 15).catch(() => {});
}

// Make them globally available
global.broadcastFatigueDetection = broadcastFatigueDetection;
global.broadcastAIProcessingComplete = broadcastAIProcessingComplete;
global.sendNotificationToUser = sendNotificationToUser;

// ---- Initialize dependencies before starting server ----
async function startServer() {
  try {
    console.log('🔄 Initializing dependencies...');

    // Start HTTP immediately so health checks can pass even if Mongo is slow/unavailable.
    server.listen(PORT, HOST, () => {
      console.log(`🚀 Server is running on port ${PORT}`);
      console.log(`🌐 HTTP listening on http://${HOST}:${PORT}`);
      console.log(`🔌 WebSocket listening on ws://${HOST}:${PORT}`);
    });

    // Kick off Mongo/Redis initialization in background.
    console.log('📊 Connecting to MongoDB...');
    connectMongo()
      .then(() => console.log('✅ MongoDB connected successfully'))
      .catch((e) => console.error(`❌ MongoDB connect failed (continuing): ${e?.message || e}`));

    console.log('🔴 Connecting to Redis...');
    await connectRedis();
    
  } catch (error) {
    console.error('❌ Failed to initialize dependencies:', error.message);
    console.error('❌ Server startup error (continuing):', error.message);
  }
}

// ---- Background initialization (non-blocking) ----
async function initBackground() {
  // This function is now called after server starts, but dependencies are already connected
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

// Remove duplicate connectMongo function - using the one from config/db.js

let redisClient;
async function connectRedis() {
  try {
    const { createClient } = require('redis');
    redisClient = createClient({ socket: { host: REDIS_HOST, port: REDIS_PORT } });
    redisClient.on('error', (err) => console.error(`Redis error: ${err.message}`));
    await redisClient.connect();
    app.locals.redis = redisClient;
    await initBackground();
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
    .then(() => clearInterval(heartbeatSweep))
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

// ---- Start the server ----
startServer().catch((error) => {
  console.error('❌ Failed to start server:', error.message);
  process.exit(1);
});

// ---- Combined exports ----
module.exports = {
  server,
  io,
  broadcastFatigueDetection,
  broadcastAIProcessingComplete,
  sendNotificationToUser,
};
