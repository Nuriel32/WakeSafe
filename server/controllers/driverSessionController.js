const DriverSession = require('../models/DriverSession');
const cache = require('../services/cacheService');
const logger = require('../utils/logger');
const HttpError = require('../utils/httpError');

exports.createSession = async (req, res, next) => {
  try {
    const userId = req.user.id;
    console.log('Creating session for user:', userId);

    // Generate a unique session ID
    const sessionId = `session_${userId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    console.log('Generated sessionId:', sessionId);
    
    const session = await DriverSession.create({ 
      userId,
      sessionId: sessionId,
      status: 'active',
      isActive: true,
      startTime: new Date(),
      sessionConfig: {
        captureInterval: 1000,
        uploadBatchSize: 1,
        aiProcessingEnabled: true,
        locationTrackingEnabled: true,
        websocketEnabled: true
      }
    });

    console.log('Session created successfully:', session._id);

    // Use existing cache functions
    await cache.set(`active_session:${userId}`, session._id.toString(), 7200);

    logger.info(`From driverSessionController: Cached session in Redis: session:${session._id} -> userId ${userId}`);

    return res.success(session, { statusCode: 201, message: 'Session created successfully' });
  } catch (error) {
    console.error('Create session error:', error);
    logger.error('From driverSessionController: Failed to create driver session:', error);
    return next(new HttpError(500, 'Could not create session', null, 'SESSION_CREATE_FAILED'));
  }
};

exports.getCurrentSession = async (req, res, next) => {
  try {
    const userId = req.user.id;
    
    // Check cache first
    const activeSessionId = await cache.get(`active_session:${userId}`);
    
    if (activeSessionId) {
      const session = await DriverSession.findById(activeSessionId);
      if (session && session.isActive) {
        return res.success(session, { message: 'Current session retrieved' });
      }
    }
    
    // If no active session in cache, check database
    const session = await DriverSession.findOne({ userId, isActive: true });
    
    if (session) {
      // Update cache
      await cache.set(`active_session:${userId}`, session._id.toString(), 7200);
      return res.success(session, { message: 'Current session retrieved' });
    }
    
    return next(new HttpError(404, 'No active session found', null, 'SESSION_NOT_FOUND'));
  } catch (error) {
    console.error('Get current session error:', error);
    logger.error('From driverSessionController: Failed to get current session:', error);
    return next(new HttpError(500, 'Could not get current session', null, 'SESSION_FETCH_FAILED'));
  }
};

exports.endSession = async (req, res, next) => {
  try {
    const { sessionId } = req.params;
    const userId = req.user.id;
    console.log('[endSession] incoming', { sessionId, userId, body: req.body });
    
    const session = await DriverSession.findOne({ _id: sessionId, userId });
    
    if (!session) {
      console.log('[endSession] session not found or not owned by user');
      return next(new HttpError(404, 'Session not found', null, 'SESSION_NOT_FOUND'));
    }
    
    // Backfill legacy sessions that might be missing required sessionId
    if (!session.sessionId) {
      session.sessionId = `session_${userId}_${session._id}_${Date.now()}`;
      console.log('[endSession] Backfilled missing sessionId for legacy session', { backfilledSessionId: session.sessionId });
    }

    try {
      // Prefer model method to keep fields consistent
      await session.endSession();
    } catch (e) {
      // Fallback minimal fields
      session.isActive = false;
      session.endTime = new Date();
      session.status = 'ended';
      await session.save();
    }
    
    // Remove from cache
    await cache.del(`active_session:${userId}`);
    
    logger.info(`From driverSessionController: Ended session ${sessionId} for user ${userId}`);
    
    return res.success({ session }, { message: 'Session ended successfully' });
  } catch (error) {
    console.error('End session error:', error);
    logger.error('From driverSessionController: Failed to end session:', error);
    return next(new HttpError(500, 'Could not end session', null, 'SESSION_END_FAILED'));
  }
};

exports.getSessionHistory = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const limit = Math.min(parseInt(req.query.limit || '50', 10), 100);
    const page = Math.max(parseInt(req.query.page || '1', 10), 1);
    const includePhotos = String(req.query.includePhotos || 'false') === 'true';
    const cacheKey = `session_history:${userId}:${page}:${limit}:${includePhotos}`;

    const cached = await cache.get(cacheKey);
    if (cached) {
      return res.success(cached, { message: 'Session history retrieved (cached)' });
    }

    let query = DriverSession.find({ userId })
      .sort({ startTime: -1 })
      .limit(limit)
      .skip((page - 1) * limit)
      .select(
        'sessionId startTime endTime duration isActive status totalImagesUploaded totalImagesProcessed aiProcessingStats uploadStats createdAt updatedAt'
      );

    if (includePhotos) {
      query = query.populate('photos', 'prediction aiProcessingStatus uploadedAt');
    }

    const sessions = await query.lean();
    await cache.set(cacheKey, sessions, 30);
    return res.success(sessions, {
      message: 'Session history retrieved',
      meta: { page, limit, count: sessions.length, includePhotos },
    });
  } catch (error) {
    logger.error('From driverSessionController: Failed to get session history:', error);
    return next(new HttpError(500, 'Could not get session history', null, 'SESSION_HISTORY_FAILED'));
  }
};
