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

/**
 * Get active session ID for a user
 * @returns {String|null} sessionId
 */
exports.getActiveSession = async (userId) => {
    // We need to search for the session key that has this userId as value
    // This is a simplified approach - in production you might want to use a different pattern
    const keys = await redis.keys('session:*');
    for (const key of keys) {
        const value = await redis.get(key);
        if (value === userId) {
            return key.replace('session:', '');
        }
    }
    return null;
};

/**
 * Remove active session for a user
 */
exports.removeActiveSession = async (userId) => {
    const sessionId = await exports.getActiveSession(userId);
    if (sessionId) {
        await redis.del(`session:${sessionId}`);
    }
};

// ===== METADATA STORAGE FUNCTIONS =====

/**
 * Store photo metadata in Redis
 * @param {string} photoId - Photo ID
 * @param {object} metadata - Photo metadata
 * @param {number} ttlSeconds - TTL in seconds (default 1 hour)
 */
exports.storePhotoMetadata = async (photoId, metadata, ttlSeconds = 3600) => {
    const key = `photo:${photoId}`;
    await redis.set(key, JSON.stringify({
        ...metadata,
        cachedAt: new Date().toISOString()
    }), 'EX', ttlSeconds);
};

/**
 * Get photo metadata from Redis
 * @param {string} photoId - Photo ID
 * @returns {object|null} Photo metadata
 */
exports.getPhotoMetadata = async (photoId) => {
    const key = `photo:${photoId}`;
    const data = await redis.get(key);
    return data ? JSON.parse(data) : null;
};

/**
 * Store session metadata in Redis
 * @param {string} sessionId - Session ID
 * @param {object} metadata - Session metadata
 * @param {number} ttlSeconds - TTL in seconds (default 30 minutes)
 */
exports.storeSessionMetadata = async (sessionId, metadata, ttlSeconds = 1800) => {
    const key = `session_meta:${sessionId}`;
    await redis.set(key, JSON.stringify({
        ...metadata,
        cachedAt: new Date().toISOString()
    }), 'EX', ttlSeconds);
};

/**
 * Get session metadata from Redis
 * @param {string} sessionId - Session ID
 * @returns {object|null} Session metadata
 */
exports.getSessionMetadata = async (sessionId) => {
    const key = `session_meta:${sessionId}`;
    const data = await redis.get(key);
    return data ? JSON.parse(data) : null;
};

/**
 * Store user metadata in Redis
 * @param {string} userId - User ID
 * @param {object} metadata - User metadata
 * @param {number} ttlSeconds - TTL in seconds (default 1 hour)
 */
exports.storeUserMetadata = async (userId, metadata, ttlSeconds = 3600) => {
    const key = `user:${userId}`;
    await redis.set(key, JSON.stringify({
        ...metadata,
        cachedAt: new Date().toISOString()
    }), 'EX', ttlSeconds);
};

/**
 * Get user metadata from Redis
 * @param {string} userId - User ID
 * @returns {object|null} User metadata
 */
exports.getUserMetadata = async (userId) => {
    const key = `user:${userId}`;
    const data = await redis.get(key);
    return data ? JSON.parse(data) : null;
};

/**
 * Store AI processing queue metadata
 * @param {string} queueId - Queue ID
 * @param {object} metadata - Queue metadata
 * @param {number} ttlSeconds - TTL in seconds (default 1 hour)
 */
exports.storeQueueMetadata = async (queueId, metadata, ttlSeconds = 3600) => {
    const key = `queue:${queueId}`;
    await redis.set(key, JSON.stringify({
        ...metadata,
        cachedAt: new Date().toISOString()
    }), 'EX', ttlSeconds);
};

/**
 * Get AI processing queue metadata
 * @param {string} queueId - Queue ID
 * @returns {object|null} Queue metadata
 */
exports.getQueueMetadata = async (queueId) => {
    const key = `queue:${queueId}`;
    const data = await redis.get(key);
    return data ? JSON.parse(data) : null;
};

/**
 * Store system analytics data
 * @param {string} date - Date string (YYYY-MM-DD)
 * @param {object} analytics - Analytics data
 * @param {number} ttlSeconds - TTL in seconds (default 24 hours)
 */
exports.storeSystemAnalytics = async (date, analytics, ttlSeconds = 86400) => {
    const key = `analytics:${date}`;
    await redis.set(key, JSON.stringify({
        ...analytics,
        cachedAt: new Date().toISOString()
    }), 'EX', ttlSeconds);
};

/**
 * Get system analytics data
 * @param {string} date - Date string (YYYY-MM-DD)
 * @returns {object|null} Analytics data
 */
exports.getSystemAnalytics = async (date) => {
    const key = `analytics:${date}`;
    const data = await redis.get(key);
    return data ? JSON.parse(data) : null;
};

/**
 * Store upload progress metadata
 * @param {string} uploadId - Upload ID
 * @param {object} progress - Upload progress data
 * @param {number} ttlSeconds - TTL in seconds (default 1 hour)
 */
exports.storeUploadProgress = async (uploadId, progress, ttlSeconds = 3600) => {
    const key = `upload:${uploadId}`;
    await redis.set(key, JSON.stringify({
        ...progress,
        updatedAt: new Date().toISOString()
    }), 'EX', ttlSeconds);
};

/**
 * Get upload progress metadata
 * @param {string} uploadId - Upload ID
 * @returns {object|null} Upload progress data
 */
exports.getUploadProgress = async (uploadId) => {
    const key = `upload:${uploadId}`;
    const data = await redis.get(key);
    return data ? JSON.parse(data) : null;
};

/**
 * Store WebSocket connection metadata
 * @param {string} socketId - Socket ID
 * @param {object} metadata - Connection metadata
 * @param {number} ttlSeconds - TTL in seconds (default 30 minutes)
 */
exports.storeWebSocketMetadata = async (socketId, metadata, ttlSeconds = 1800) => {
    const key = `websocket:${socketId}`;
    await redis.set(key, JSON.stringify({
        ...metadata,
        connectedAt: new Date().toISOString()
    }), 'EX', ttlSeconds);
};

/**
 * Get WebSocket connection metadata
 * @param {string} socketId - Socket ID
 * @returns {object|null} Connection metadata
 */
exports.getWebSocketMetadata = async (socketId) => {
    const key = `websocket:${socketId}`;
    const data = await redis.get(key);
    return data ? JSON.parse(data) : null;
};

/**
 * Store real-time metrics
 * @param {string} metricType - Type of metric (e.g., 'performance', 'users', 'photos')
 * @param {object} metrics - Metrics data
 * @param {number} ttlSeconds - TTL in seconds (default 5 minutes)
 */
exports.storeRealTimeMetrics = async (metricType, metrics, ttlSeconds = 300) => {
    const key = `metrics:${metricType}`;
    await redis.set(key, JSON.stringify({
        ...metrics,
        timestamp: new Date().toISOString()
    }), 'EX', ttlSeconds);
};

/**
 * Get real-time metrics
 * @param {string} metricType - Type of metric
 * @returns {object|null} Metrics data
 */
exports.getRealTimeMetrics = async (metricType) => {
    const key = `metrics:${metricType}`;
    const data = await redis.get(key);
    return data ? JSON.parse(data) : null;
};

/**
 * Increment counter in Redis
 * @param {string} key - Counter key
 * @param {number} increment - Increment value (default 1)
 * @param {number} ttlSeconds - TTL in seconds (default 1 hour)
 */
exports.incrementCounter = async (key, increment = 1, ttlSeconds = 3600) => {
    const counterKey = `counter:${key}`;
    const result = await redis.incrby(counterKey, increment);
    await redis.expire(counterKey, ttlSeconds);
    return result;
};

/**
 * Get counter value from Redis
 * @param {string} key - Counter key
 * @returns {number} Counter value
 */
exports.getCounter = async (key) => {
    const counterKey = `counter:${key}`;
    const value = await redis.get(counterKey);
    return value ? parseInt(value) : 0;
};

/**
 * Store list data in Redis
 * @param {string} key - List key
 * @param {array} items - Array of items
 * @param {number} ttlSeconds - TTL in seconds (default 1 hour)
 */
exports.storeList = async (key, items, ttlSeconds = 3600) => {
    const listKey = `list:${key}`;
    await redis.del(listKey); // Clear existing list
    if (items.length > 0) {
        await redis.lpush(listKey, ...items.map(item => JSON.stringify(item)));
        await redis.expire(listKey, ttlSeconds);
    }
};

/**
 * Get list data from Redis
 * @param {string} key - List key
 * @returns {array} Array of items
 */
exports.getList = async (key) => {
    const listKey = `list:${key}`;
    const items = await redis.lrange(listKey, 0, -1);
    return items.map(item => JSON.parse(item));
};

/**
 * Add item to list in Redis
 * @param {string} key - List key
 * @param {object} item - Item to add
 * @param {number} ttlSeconds - TTL in seconds (default 1 hour)
 */
exports.addToList = async (key, item, ttlSeconds = 3600) => {
    const listKey = `list:${key}`;
    await redis.lpush(listKey, JSON.stringify(item));
    await redis.expire(listKey, ttlSeconds);
};

/**
 * Get list length from Redis
 * @param {string} key - List key
 * @returns {number} List length
 */
exports.getListLength = async (key) => {
    const listKey = `list:${key}`;
    return await redis.llen(listKey);
};

