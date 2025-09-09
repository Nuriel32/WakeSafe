const logger = require('../utils/logger');

// Cache Service for WakeSafe
// This service handles Redis caching operations

let redisClient = null;

function getRedisClient() {
  if (!redisClient) {
    // Try to get Redis client from app locals (set by server.js)
    const app = require('../app');
    redisClient = app.locals?.redis;
    
    if (!redisClient) {
      logger.warn('Redis client not available. Cache operations will be disabled.');
    }
  }
  
  return redisClient;
}

async function set(key, value, ttlSeconds = 3600) {
  try {
    const client = getRedisClient();
    if (!client) {
      logger.warn('Redis not available, skipping cache set operation');
      return false;
    }
    
    const serializedValue = typeof value === 'string' ? value : JSON.stringify(value);
    await client.setEx(key, ttlSeconds, serializedValue);
    
    logger.debug(`Cache set: ${key} (TTL: ${ttlSeconds}s)`);
    return true;
  } catch (error) {
    logger.error('Cache set failed:', error);
    return false;
  }
}

async function get(key) {
  try {
    const client = getRedisClient();
    if (!client) {
      logger.warn('Redis not available, skipping cache get operation');
      return null;
    }
    
    const value = await client.get(key);
    
    if (value === null) {
      logger.debug(`Cache miss: ${key}`);
      return null;
    }
    
    logger.debug(`Cache hit: ${key}`);
    
    // Try to parse as JSON, fallback to string
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  } catch (error) {
    logger.error('Cache get failed:', error);
    return null;
  }
}

async function del(key) {
  try {
    const client = getRedisClient();
    if (!client) {
      logger.warn('Redis not available, skipping cache delete operation');
      return false;
    }
    
    const result = await client.del(key);
    logger.debug(`Cache delete: ${key} (${result} keys removed)`);
    return result > 0;
  } catch (error) {
    logger.error('Cache delete failed:', error);
    return false;
  }
}

async function exists(key) {
  try {
    const client = getRedisClient();
    if (!client) {
      logger.warn('Redis not available, skipping cache exists check');
      return false;
    }
    
    const result = await client.exists(key);
    return result === 1;
  } catch (error) {
    logger.error('Cache exists check failed:', error);
    return false;
  }
}

async function expire(key, ttlSeconds) {
  try {
    const client = getRedisClient();
    if (!client) {
      logger.warn('Redis not available, skipping cache expire operation');
      return false;
    }
    
    const result = await client.expire(key, ttlSeconds);
    logger.debug(`Cache expire: ${key} (TTL: ${ttlSeconds}s, result: ${result})`);
    return result === 1;
  } catch (error) {
    logger.error('Cache expire failed:', error);
    return false;
  }
}

async function ttl(key) {
  try {
    const client = getRedisClient();
    if (!client) {
      logger.warn('Redis not available, skipping cache TTL check');
      return -1;
    }
    
    const result = await client.ttl(key);
    return result;
  } catch (error) {
    logger.error('Cache TTL check failed:', error);
    return -1;
  }
}

async function flush() {
  try {
    const client = getRedisClient();
    if (!client) {
      logger.warn('Redis not available, skipping cache flush operation');
      return false;
    }
    
    await client.flushAll();
    logger.info('Cache flushed successfully');
    return true;
  } catch (error) {
    logger.error('Cache flush failed:', error);
    return false;
  }
}

// Session-specific cache operations
async function setSessionData(sessionId, data, ttlSeconds = 7200) {
  return await set(`session:${sessionId}`, data, ttlSeconds);
}

async function getSessionData(sessionId) {
  return await get(`session:${sessionId}`);
}

async function deleteSessionData(sessionId) {
  return await del(`session:${sessionId}`);
}

// User-specific cache operations
async function setUserData(userId, data, ttlSeconds = 3600) {
  return await set(`user:${userId}`, data, ttlSeconds);
}

async function getUserData(userId) {
  return await get(`user:${userId}`);
}

async function deleteUserData(userId) {
  return await del(`user:${userId}`);
}

// Token revocation cache operations
async function revokeToken(jti, ttlSeconds = 86400) {
  return await set(`revoked:${jti}`, '1', ttlSeconds);
}

async function isTokenRevoked(jti) {
  const result = await get(`revoked:${jti}`);
  return result === '1' || result === 'true';
}

// Rate limiting cache operations
async function incrementRateLimit(key, ttlSeconds = 60) {
  try {
    const client = getRedisClient();
    if (!client) {
      logger.warn('Redis not available, skipping rate limit increment');
      return 1;
    }
    
    const result = await client.incr(key);
    if (result === 1) {
      await client.expire(key, ttlSeconds);
    }
    
    return result;
  } catch (error) {
    logger.error('Rate limit increment failed:', error);
    return 1;
  }
}

module.exports = {
  set,
  get,
  del,
  exists,
  expire,
  ttl,
  flush,
  setSessionData,
  getSessionData,
  deleteSessionData,
  setUserData,
  getUserData,
  deleteUserData,
  revokeToken,
  isTokenRevoked,
  incrementRateLimit,
};
