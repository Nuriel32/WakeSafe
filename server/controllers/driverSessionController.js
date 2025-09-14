const DriverSession = require('../models/DriverSession');
const cache = require('../services/cacheService');
const logger = require('../utils/logger');

exports.createSession = async (req, res) => {
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

    res.status(201).json(session);
  } catch (error) {
    console.error('Create session error:', error);
    logger.error('From driverSessionController: Failed to create driver session:', error);
    res.status(500).json({ message: 'Could not create session', error: error.message });
  }
};

exports.getCurrentSession = async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Check cache first
    const activeSessionId = await cache.get(`active_session:${userId}`);
    
    if (activeSessionId) {
      const session = await DriverSession.findById(activeSessionId);
      if (session && session.isActive) {
        return res.json(session);
      }
    }
    
    // If no active session in cache, check database
    const session = await DriverSession.findOne({ userId, isActive: true });
    
    if (session) {
      // Update cache
      await cache.set(`active_session:${userId}`, session._id.toString(), 7200);
      return res.json(session);
    }
    
    res.status(404).json({ message: 'No active session found' });
  } catch (error) {
    console.error('Get current session error:', error);
    logger.error('From driverSessionController: Failed to get current session:', error);
    res.status(500).json({ message: 'Could not get current session' });
  }
};

exports.endSession = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const userId = req.user.id;
    console.log('[endSession] incoming', { sessionId, userId, body: req.body });
    
    const session = await DriverSession.findOne({ _id: sessionId, userId });
    
    if (!session) {
      console.log('[endSession] session not found or not owned by user');
      return res.status(404).json({ message: 'Session not found' });
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
    
    res.json({ message: 'Session ended successfully', session });
  } catch (error) {
    console.error('End session error:', error);
    logger.error('From driverSessionController: Failed to end session:', error);
    res.status(500).json({ message: 'Could not end session' });
  }
};

exports.getSessionHistory = async (req, res) => {
  try {
    const userId = req.user.id;
    const { limit = 50, page = 1 } = req.query;
    
    const sessions = await DriverSession.find({ userId })
      .sort({ startTime: -1 })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit))
      .populate('photos', 'prediction aiProcessingStatus uploadedAt');
    
    res.json(sessions);
  } catch (error) {
    logger.error('From driverSessionController: Failed to get session history:', error);
    res.status(500).json({ message: 'Could not get session history' });
  }
};
