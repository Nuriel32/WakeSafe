// CommonJS
const rateLimit = require('express-rate-limit');

/**
 * Factory that returns an express-rate-limit middleware instance.
 * @param {object} opts
 */
function buildRateLimiter(opts = {}) {
  const {
    windowMs = 60 * 1000, // 1 minute
    max = 60,             // 60 requests / min / IP
    standardHeaders = true,
    legacyHeaders = false,
    message = 'Too many requests, please try again later.',
    skipSuccessfulRequests = false,
    skipFailedRequests = false,
  } = opts;

  return rateLimit({
    windowMs,
    max,
    standardHeaders,
    legacyHeaders,
    message,
    skipSuccessfulRequests,
    skipFailedRequests,
  });
}

// Specialized rate limiters for different endpoints
const authLimiter = buildRateLimiter({ 
  max: 5, 
  windowMs: 15 * 60 * 1000, // 15 minutes
  message: 'Too many authentication attempts, please try again in 15 minutes.'
});

const uploadLimiter = buildRateLimiter({ 
  max: 10, 
  windowMs: 60 * 1000, // 1 minute
  message: 'Too many upload attempts, please slow down.'
});

const apiLimiter = buildRateLimiter({ 
  max: 100, 
  windowMs: 15 * 60 * 1000, // 15 minutes
  message: 'Too many API requests, please try again later.'
});

const strictLimiter = buildRateLimiter({ 
  max: 20, 
  windowMs: 60 * 1000, // 1 minute
  message: 'Rate limit exceeded, please slow down.'
});

// General purpose limiter
const generalLimiter = buildRateLimiter({
  max: 60,
  windowMs: 60 * 1000,
  message: 'Too many requests from this IP, please try again later.'
});

module.exports = {
  buildRateLimiter,
  authLimiter,
  uploadLimiter,
  apiLimiter,
  strictLimiter,
  generalLimiter,
};
