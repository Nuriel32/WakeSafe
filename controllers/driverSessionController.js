const DriverSession = require('../models/DriverSession');
const cache = require('../services/cacheService');
const logger = require('../utils/logger');

exports.createSession = async (req, res) => {
  try {
    const userId = req.user.id;

    const session = await DriverSession.create({ userId });


    await cache.setActiveSession(session._id.toString(), userId);

    logger.info(`From driverSessionController: Cached session in Redis: session:${session._id} -> userId ${userId}`);

    res.status(201).json({ sessionId: session._id });
  } catch (error) {
    logger.error('From driverSessionController: Failed to create driver session:', error);
    res.status(500).json({ message: 'Could not create session' });
  }
};
