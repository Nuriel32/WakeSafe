// ======================= MIDDLEWARE: middlewares/validateSessionViaCache.js =======================

const cacheService = require('../services/cacheService');

/**
 * Middleware to validate session ownership using Redis only
 * - Checks if sessionId belongs to current user via Redis
 */
async function validateSessionViaCache(req, res, next) {
    const { sessionId } = req.body;
    const userId = req.user.id;

    if (!sessionId) {
        return res.status(400).json({ error: 'Missing sessionId' });
    }

    try {
        const isValid = await cacheService.validateSessionOwner(sessionId, userId);
        if (!isValid) {
            return res.status(403).json({ error: 'Session invalid or expired' });
        }
        req.sessionId = sessionId; // Pass sessionId downstream if needed
        next();
    } catch (err) {
        console.error('Redis session validation error:', err);
        res.status(500).json({ error: 'Internal session validation error' });
    }
}

module.exports = validateSessionViaCache;