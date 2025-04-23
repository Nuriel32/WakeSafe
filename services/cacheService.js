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
