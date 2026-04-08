// CI/CD smoke-change marker: backend
const express = require('express');
const dotenv = require('dotenv');
const helmet = require('helmet');
const mongoSanitize = require('express-mongo-sanitize');
const path = require('path');
const requestLogger = require('./middlewares/requestLogger');
const responseFormat = require('./middlewares/responseFormat');
const logger = require('./utils/logger');
const HttpError = require('./utils/httpError');

// Load environment variables
if (process.env.NODE_ENV === 'production') {
  // In production, load from .env file
  dotenv.config();
} else {
  // In development, choose profile-specific env:
  // ENV_PROFILE=local   -> ./env.local
  // ENV_PROFILE=gcpdev  -> ./env.gcp-dev
  const profile = (process.env.ENV_PROFILE || 'local').toLowerCase();
  const envPath = profile === 'gcpdev' ? './env.gcp-dev' : './env.local';
  dotenv.config({ path: envPath });
  if (!process.env.MONGO_URI) {
    dotenv.config();
  }
}

const app = express();

// Trust proxy for proper IP detection behind load balancers/proxies
// For Google Cloud Run, trust only the first proxy (load balancer)
app.set('trust proxy', 1);


const allowedOrigins = (process.env.CORS_ALLOWED_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

// Baseline security headers
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  })
);

// CORS middleware with allow-list
app.use((req, res, next) => {
  const reqOrigin = req.headers.origin;
  if (!reqOrigin) {
    res.header('Access-Control-Allow-Origin', '*');
  } else if (allowedOrigins.length === 0 || allowedOrigins.includes(reqOrigin)) {
    res.header('Access-Control-Allow-Origin', reqOrigin);
    res.header('Vary', 'Origin');
  } else {
    return res.status(403).json({ message: 'Origin not allowed' });
  }
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.header('Access-Control-Allow-Credentials', 'false');
  
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

app.use(express.json({ limit: '1mb' }));
// express-mongo-sanitize mutates req.query, which is read-only in Express 5.
// Sanitize mutable payload containers only.
app.use((req, _res, next) => {
  const sanitize =
    typeof mongoSanitize?.sanitize === 'function'
      ? mongoSanitize.sanitize.bind(mongoSanitize)
      : typeof mongoSanitize === 'function'
        ? mongoSanitize
        : null;

  if (!sanitize) return next();

  if (req.body && typeof req.body === 'object') {
    const sanitized = sanitize(req.body, { replaceWith: '_' });
    if (sanitized && typeof sanitized === 'object') req.body = sanitized;
  }
  if (req.params && typeof req.params === 'object') {
    const sanitized = sanitize(req.params, { replaceWith: '_' });
    if (sanitized && typeof sanitized === 'object') req.params = sanitized;
  }
  next();
});
app.use(requestLogger);
app.use(responseFormat);

// Serve local uploaded files when running with local storage provider.
app.use('/local-uploads', express.static(process.env.LOCAL_UPLOAD_DIR || path.join(__dirname, 'uploads')));

// Rate Limiters
const { generalLimiter, authLimiter, uploadLimiter, presignedUploadLimiter, apiLimiter } = require('./middlewares/rateLimit');

if (process.env.NODE_ENV !== 'production') {
  // Debug endpoint to test rate limiting (before rate limiting)
  app.get('/api/debug/rate-limit', (req, res) => {
    res.json({
      message: 'Rate limit test endpoint',
      ip: req.ip,
      timestamp: new Date().toISOString()
    });
  });

  // WebSocket test endpoint
  app.get('/api/debug/websocket', (req, res) => {
    res.json({
      message: 'WebSocket test endpoint',
      websocketUrl: `ws://${req.get('host')}/socket.io/`,
      timestamp: new Date().toISOString()
    });
  });
}

// Apply specific rate limiting to sensitive routes
// Temporarily disable rate limiting for debugging
// app.use('/api/auth', authLimiter, require('./routes/authRoutes'));
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api', generalLimiter);
app.use('/api/upload', uploadLimiter, require('./routes/uploadRoutes'));
app.use('/api/upload', presignedUploadLimiter, require('./routes/presignedUploadRoutes'));

// Apply API rate limiting to other routes
app.use('/api/users', apiLimiter, require('./routes/userRoutes'));
app.use('/api/sessions', apiLimiter, require('./routes/sessionRoutes'));
app.use('/api/fatigue', apiLimiter, require('./routes/fatigueRoutes'));
app.use('/api/location', apiLimiter, require('./routes/locationRoutes'));
app.use('/api/photos', apiLimiter, require('./routes/photoRoutes'));
app.use('/api/spotify', apiLimiter, require('./routes/spotifyRoutes'));

// Apply general rate limiting to all other routes
app.use(generalLimiter);

app.use((err, req, res, _next) => {
  const requestId = req.requestId || null;
  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal server error';
  logger.error('unhandled_request_error', {
    requestId,
    userId: req.user?.id || null,
    tripId: req.body?.tripId || req.body?.sessionId || req.params?.sessionId || null,
    method: req.method,
    path: req.originalUrl,
    statusCode,
    error: err,
  });
  if (res.headersSent) return;
  if (typeof res.fail === 'function') {
    return res.fail(message, {
      statusCode,
      code: err.code || (err instanceof HttpError ? err.code : 'INTERNAL_ERROR'),
      details: err.details || undefined,
    });
  }
  return res.status(statusCode).json({ success: false, message, requestId });
});

module.exports = app;
