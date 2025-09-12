const express = require('express');
const dotenv = require('dotenv');
const connectDB = require('./config/db');
const requestLogger = require('./middlewares/requestLogger');

// Load environment variables
if (process.env.NODE_ENV === 'production') {
  // In production, load from .env file
  dotenv.config();
} else {
  // In development, try env.local first, then fallback to .env
  dotenv.config({ path: './env.local' });
  if (!process.env.MONGO_URI) {
    dotenv.config();
  }
}

connectDB();

const app = express();

// Trust proxy for proper IP detection behind load balancers/proxies
// For Google Cloud Run, trust only the first proxy (load balancer)
app.set('trust proxy', 1);


// CORS middleware for mobile app access
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

app.use(express.json());
app.use(requestLogger);

// Rate Limiters
const { generalLimiter, authLimiter, uploadLimiter, apiLimiter } = require('./middlewares/rateLimit');

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

// Apply specific rate limiting to sensitive routes
// Temporarily disable rate limiting for debugging
// app.use('/api/auth', authLimiter, require('./routes/authRoutes'));
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/upload', uploadLimiter, require('./routes/uploadRoutes'));
app.use('/api/upload', uploadLimiter, require('./routes/presignedUploadRoutes'));

// Apply API rate limiting to other routes
app.use('/api/users', apiLimiter, require('./routes/userRoutes'));
app.use('/api/sessions', apiLimiter, require('./routes/sessionRoutes'));
app.use('/api/trips', apiLimiter, require('./routes/tripRoute')); // trip as driver session
app.use('/api/fatigue', apiLimiter, require('./routes/fatigueRoutes'));
app.use('/api/location', apiLimiter, require('./routes/locationRoutes'));
app.use('/api/photos', apiLimiter, require('./routes/photoRoutes'));

// Apply general rate limiting to all other routes
app.use(generalLimiter);

module.exports = app;
