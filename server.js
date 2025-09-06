const app = require('./app');
const { createServer } = require('http');
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const cache = require('./services/cacheService');
const logger = require('./utils/logger');

const PORT = process.env.PORT || 8080;
const HOST = '0.0.0.0';

// Create HTTP server
const server = createServer(app);

// Initialize Socket.IO
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// WebSocket authentication middleware
io.use(async (socket, next) => {
  try {
    const token = socket.handshake.query.token;
    
    if (!token) {
      return next(new Error('Authentication token required'));
    }

    // Verify JWT token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Check if token is revoked
    const isRevoked = await cache.isTokenRevoked(decoded.jti);
    if (isRevoked) {
      return next(new Error('Token has been revoked'));
    }

    // Attach user info to socket
    socket.userId = decoded.id;
    socket.jti = decoded.jti;
    
    next();
  } catch (error) {
    logger.error(`WebSocket authentication failed: ${error.message}`);
    next(new Error('Authentication failed'));
  }
});

// WebSocket connection handling
io.on('connection', (socket) => {
  logger.info(`WebSocket client connected: ${socket.userId}`);
  
  // Join user-specific room
  socket.join(`user:${socket.userId}`);
  
  // Handle photo upload events
  socket.on('photo_upload_start', (data) => {
    logger.info(`Photo upload started for user ${socket.userId}: ${data.fileName}`);
    socket.emit('photo_upload_progress', {
      photoId: data.photoId || 'temp',
      progress: 0,
      fileName: data.fileName
    });
  });
  
  socket.on('photo_upload_chunk', (data) => {
    // Handle chunked upload progress
    const progress = Math.round((data.chunkIndex / data.totalChunks) * 100);
    socket.emit('photo_upload_progress', {
      photoId: data.photoId,
      progress,
      fileName: data.fileName
    });
  });
  
  socket.on('photo_upload_complete', (data) => {
    logger.info(`Photo upload completed for user ${socket.userId}: ${data.fileName}`);
    socket.emit('photo_upload_complete', {
      photoId: data.photoId,
      fileName: data.fileName,
      gcsPath: data.gcsPath,
      metadata: data.metadata
    });
  });
  
  socket.on('photo_upload_error', (data) => {
    logger.error(`Photo upload error for user ${socket.userId}: ${data.error}`);
    socket.emit('photo_upload_error', {
      photoId: data.photoId,
      fileName: data.fileName,
      error: data.error
    });
  });
  
  // Handle session events
  socket.on('session_start', (data) => {
    logger.info(`Session started for user ${socket.userId}: ${data.sessionId}`);
    socket.to(`user:${socket.userId}`).emit('session_update', {
      sessionId: data.sessionId,
      status: 'active',
      timestamp: Date.now()
    });
  });
  
  socket.on('session_end', (data) => {
    logger.info(`Session ended for user ${socket.userId}: ${data.sessionId}`);
    socket.to(`user:${socket.userId}`).emit('session_update', {
      sessionId: data.sessionId,
      status: 'ended',
      timestamp: Date.now()
    });
  });
  
  // Handle location updates
  socket.on('location_update', (data) => {
    // Broadcast location update to user's room
    socket.to(`user:${socket.userId}`).emit('location_update', {
      location: data.location,
      timestamp: Date.now()
    });
  });
  
  // Handle disconnection
  socket.on('disconnect', (reason) => {
    logger.info(`WebSocket client disconnected: ${socket.userId}, reason: ${reason}`);
  });
  
  // Handle errors
  socket.on('error', (error) => {
    logger.error(`WebSocket error for user ${socket.userId}: ${error.message}`);
  });
});

// Function to broadcast fatigue detection results
function broadcastFatigueDetection(userId, sessionId, fatigueLevel, confidence) {
  io.to(`user:${userId}`).emit('fatigue_detection', {
    sessionId,
    fatigueLevel,
    confidence,
    timestamp: Date.now()
  });
}

// Function to broadcast AI processing results
function broadcastAIProcessingComplete(userId, photoId, results, processingTime) {
  io.to(`user:${userId}`).emit('ai_processing_complete', {
    photoId,
    results,
    processingTime,
    timestamp: Date.now()
  });
}

// Function to send notifications to user
function sendNotificationToUser(userId, message, type = 'info', duration = 5000) {
  io.to(`user:${userId}`).emit('notification', {
    message,
    type,
    duration,
    timestamp: Date.now()
  });
}

// Make functions available globally
global.broadcastFatigueDetection = broadcastFatigueDetection;
global.broadcastAIProcessingComplete = broadcastAIProcessingComplete;
global.sendNotificationToUser = sendNotificationToUser;

// Start server
server.listen(PORT, HOST, () => {
  console.log(`✅ Server is running on http://${HOST}:${PORT}`);
  console.log(`✅ WebSocket server is running on ws://${HOST}:${PORT}`);
});
