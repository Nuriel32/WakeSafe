const redis = require('../config/redis');

exports.getFromCache = async (key) => {
    const data = await redis.get(key);
    return data ? JSON.parse(data) : null;
};

exports.setInCache = async (key, value, ttlSeconds = 1800) => {
    console.log('Setting in cache:', key, value, ttlSeconds);
    await redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
};

exports.deleteFromCache = async (key) => {
    await redis.del(key);
};

// ✨ Token blacklist support
exports.blacklistToken = async (jti, ttlSeconds = 3600) => {
    await redis.set(`blacklist:${jti}`, '1', 'EX', ttlSeconds);
};

exports.isTokenBlacklisted = async (jti) => {
    return !!(await redis.get(`blacklist:${jti}`));
    console.log('Checking blacklist:', jti, !!(await redis.get(`blacklist:${jti}`)));
};


/**
 * Set an active session in Redis with TTL (default 30 min)
 * key: session:<sessionId> = userId
 */
exports.setActiveSession = async (sessionId, userId, ttlSeconds = 1800) => {
    await redis.set(`session:${sessionId}`, userId, 'EX', ttlSeconds);
};

/**
 * Validate that sessionId exists and belongs to userId
 * @returns {Boolean}
 */
exports.validateSessionOwner = async (sessionId, userId) => {
    const cachedUserId = await redis.get(`session:${sessionId}`);
    return cachedUserId === userId;
};

