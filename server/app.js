// server/app.js
const express = require('express');
const requestLogger = require('./middlewares/requestLogger');
const { buildRateLimiter } = require('./middlewares/rateLimit'); // export a factory from this file

const app = express();

// Behind Cloud Run/GFE → trust X-Forwarded-* headers (req.ip works, rate-limit happy)
app.set('trust proxy', true);

// Liveness/readiness endpoints (must not touch DB/Redis)
app.get('/healthz', (_req, res) => res.status(200).send('ok'));
app.get('/readyz', (_req, res) => res.status(200).send('ready'));

// CORS (keep it simple; adjust as needed)
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*'); // TODO: restrict in prod
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// Body parsers & request logging
app.use(express.json());
app.use(requestLogger);

// Rate limiter (after trust proxy, before routes)
app.use(buildRateLimiter());

// Routes
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/users', require('./routes/userRoutes'));
app.use('/api/sessions', require('./routes/sessionRoutes'));
app.use('/api/trips', require('./routes/tripRoute')); // trip as driver session
app.use('/api/fatigue', require('./routes/fatigueRoutes'));
app.use('/api/location', require('./routes/locationRoutes'));

// If you intend BOTH classic upload and presigned under the same prefix,
// make sure there are no path collisions between these two routers.
app.use('/api/upload', require('./routes/uploadRoutes'));
app.use('/api/upload', require('./routes/presignedUploadRoutes'));

module.exports = app;
