const DriverSession = require('../models/DriverSession');
const logger = require('../utils/logger');

exports.createSession = async (req, res) => {
  try {
    const session = await DriverSession.create({ userId: req.user.id });
    logger.info(`Driver session created for user ${req.user.id}. Session ID: ${session._id}`);
    res.status(201).json({ sessionId: session._id });
  } catch (error) {
    logger.error(`Failed to create driver session for user ${req.user.id}: ${error.message}`);
    res.status(500).json({ error: 'Failed to create driver session' });
  }
};
