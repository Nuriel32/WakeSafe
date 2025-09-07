const logger = require('../utils/logger');

function requestLogger(req, res, next) {
    const userId = req.user?.id || 'anonymous';
    logger.info(`Incoming ${req.method} request to ${req.originalUrl} from user ${userId}`);
    next();
}

module.exports = requestLogger;
