
const cacheService = require('../services/cacheService');
const logger = require('../utils/logger');

/**
 * Middleware to validate session ownership using Redis
 * - Ensures the provided sessionId belongs to the authenticated user
 * - Prevents unauthorized access to other users' sessions
 */
async function validateSessionViaCache(req, res, next) {
    const { sessionId } = req.body;
    const userId = req.user.id;

    if (!sessionId) {
        logger.warn(`Missing sessionId in request body by user ${userId}`);
        return res.status(400).json({ error: 'Missing sessionId' });
    }

    try {
        const isValid = await cacheService.validateSessionOwner(sessionId, userId);
        if (!isValid) {
            logger.warn(`Invalid or expired session. userId: ${userId}, sessionId: ${sessionId}`);
            return res.status(403).json({ error: 'Session invalid or expired' });
        }

        req.sessionId = sessionId; // pass forward if needed
        logger.info(`Session validation passed. userId: ${userId}, sessionId: ${sessionId}`);
        next();
    } catch (err) {
        logger.error(`Redis validation failure for session ${sessionId}: ${err.message}`);
        res.status(500).json({ error: 'Internal session validation error' });
    }
}

module.exports = validateSessionViaCache;
