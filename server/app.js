const express = require('express');
const dotenv = require('dotenv');
const connectDB = require('./config/db');
const requestLogger = require('./middlewares/requestLogger');

dotenv.config();

connectDB();

const app = express();

// Trust proxy for proper IP detection behind load balancers/proxies
app.set('trust proxy', true); // or a number; `true` is simplest for Cloud Run


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

// Apply general rate limiting to all routes
app.use(generalLimiter);

// Apply specific rate limiting to sensitive routes
app.use('/api/auth', authLimiter, require('./routes/authRoutes'));
app.use('/api/upload', uploadLimiter, require('./routes/uploadRoutes'));
app.use('/api/upload', uploadLimiter, require('./routes/presignedUploadRoutes'));

// Apply API rate limiting to other routes
app.use('/api/users', apiLimiter, require('./routes/userRoutes'));
app.use('/api/sessions', apiLimiter, require('./routes/sessionRoutes'));
app.use('/api/trips', apiLimiter, require('./routes/tripRoute')); // trip as driver session
app.use('/api/fatigue', apiLimiter, require('./routes/fatigueRoutes'));
app.use('/api/location', apiLimiter, require('./routes/locationRoutes'));
app.use('/api/photos', apiLimiter, require('./routes/photoRoutes'));

module.exports = app;
