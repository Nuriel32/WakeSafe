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
    keyPrefix = 'global',
    skip = undefined,
  } = opts;

  return rateLimit({
    windowMs,
    max,
    standardHeaders,
    legacyHeaders,
    message,
    skipSuccessfulRequests,
    skipFailedRequests,
    // Return JSON response instead of HTML
    handler: (req, res) => {
      console.log(`Rate limit exceeded for IP: ${req.ip}, Path: ${req.path}`);
      res.status(429).json({
        error: 'Too many requests',
        message: message,
        retryAfter: Math.round(windowMs / 1000)
      });
    },
    // Additional security: validate IP addresses
    validate: {
      trustProxy: true,
      xForwardedForHeader: true,
    },
    // Key by auth token when available (mobile user), fallback to IP.
    keyGenerator: (req) => {
      const authHeader = req.headers.authorization || '';
      const authKey = authHeader.startsWith('Bearer ')
        ? authHeader.slice(7, 35)
        : '';
      const ip = req.ip || req.connection.remoteAddress || req.socket.remoteAddress || 'unknown';
      return `${keyPrefix}:${authKey || ip}`;
    },
    skip,
  });
}

// Specialized rate limiters for different endpoints
const authLimiter = buildRateLimiter({ 
  max: 10, // Increased for development
  windowMs: 5 * 60 * 1000, // 5 minutes (reduced for development)
  message: 'Too many authentication attempts, please try again in 5 minutes.'
});

const uploadLimiter = buildRateLimiter({ 
  max: 10, 
  windowMs: 60 * 1000, // 1 minute
  message: 'Too many upload attempts, please slow down.',
  keyPrefix: 'upload',
  // Presigned flow has its own dedicated limiter.
  skip: (req) => req.path.startsWith('/presigned') || req.path.startsWith('/confirm') || req.path.startsWith('/status/')
});

// Presigned flow requires higher throughput for continuous capture.
const presignedUploadLimiter = buildRateLimiter({
  max: parseInt(process.env.PRESIGNED_UPLOAD_RATE_LIMIT_MAX || '120', 10),
  windowMs: 60 * 1000,
  message: 'Too many presigned upload requests, please slow down.',
  keyPrefix: 'presigned-upload'
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
  presignedUploadLimiter,
  apiLimiter,
  strictLimiter,
  generalLimiter,
};
