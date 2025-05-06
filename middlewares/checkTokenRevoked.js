const cache = require('../services/cacheService');

/**
 * Middleware: checks if the token jti is blacklisted
 */
async function checkTokenRevoked(req, res, next) {
    const jti = req.user?.jti;

    if (!jti) {
        return res.status(401).json({ error: 'Missing token ID' });
    }

    const isBlacklisted = await cache.isTokenBlacklisted(jti);
    if (isBlacklisted) {
        return res.status(401).json({ error: 'Token has been revoked' });
    }

    next();
}

module.exports = checkTokenRevoked;
