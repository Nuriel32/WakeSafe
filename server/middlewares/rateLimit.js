// server/middlewares/rateLimit.js
const rateLimit = require('express-rate-limit');

function buildRateLimiter() {
  return rateLimit({
    windowMs: 60 * 1000,          // 1 minute
    max: 60,                      // 60 req/min per IP
    standardHeaders: true,        // RateLimit-* headers
    legacyHeaders: false,         // no X-RateLimit-*
    keyGenerator: (req) => req.ip // uses trust proxy if enabled
    // If you *really* want to silence validations:
    // validate: { xForwardedForHeader: false },
  });
}

module.exports = { buildRateLimiter };
