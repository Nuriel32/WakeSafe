const express = require('express');
const dotenv = require('dotenv');
const connectDB = require('./config/db');
const requestLogger = require('./middlewares/requestLogger');

dotenv.config();

connectDB();

const app = express();

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

// Rate Limiter (אם יש)
const rateLimiter = require('./middlewares/rateLimit');
app.use(rateLimiter);

app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/users', require('./routes/userRoutes'));

app.use('/api/sessions', require('./routes/sessionRoutes'));
app.use('/api/trips', require('./routes/tripRoute')); // trip as driver session
app.use('/api/fatigue', require('./routes/fatigueRoutes'));
app.use('/api/location', require('./routes/locationRoutes'));
app.use('/api/upload', require('./routes/uploadRoutes'));
app.use('/api/upload', require('./routes/presignedUploadRoutes'));
app.use('/api/photos', require('./routes/photoRoutes'));

module.exports = app;
