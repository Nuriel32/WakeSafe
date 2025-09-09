const rateLimit = require('express-rate-limit');

const limiter = rateLimit({
  windowMs: 60 * 1000,     // 1 minute
  max: 60,                 // 60 requests/min per IP
  standardHeaders: true,   // send RateLimit-* headers
  legacyHeaders: false,    // drop X-RateLimit-* headers
  keyGenerator: (req, _res) => req.ip, // uses trust proxy
  // If you want to silence that validation explicitly (optional):
  validate: { xForwardedForHeader: false },
});

// Use it early, after app.set('trust proxy', ...)
app.use(limiter);
