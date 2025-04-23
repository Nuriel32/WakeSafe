const redis = require('../config/redis');

exports.getFromCache = async (key) => {
    const data = await redis.get(key);
    return data ? JSON.parse(data) : null;
};

exports.setInCache = async (key, value, ttlSeconds = 1800) => {
    await redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
};

exports.deleteFromCache = async (key) => {
    await redis.del(key);
};

// ✨ NEW: Token blacklist support
exports.blacklistToken = async (jti, ttlSeconds = 3600) => {
    await redis.set(`blacklist:${jti}`, '1', 'EX', ttlSeconds);
};

exports.isTokenBlacklisted = async (jti) => {
    return !!(await redis.get(`blacklist:${jti}`));
};