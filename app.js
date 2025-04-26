const express = require('express');
const dotenv = require('dotenv');
const connectDB = require('./config/db');

// הגדרות סביבה
dotenv.config();

// חיבור למסד הנתונים
connectDB();

// יצירת האפליקציה
const app = express();

app.use(express.json());

// Rate Limiter (אם יש)
const rateLimiter = require('./middlewares/rateLimit');
app.use(rateLimiter);

app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/users', require('./routes/userRoutes'));

app.use('/api/sessions', require('./routes/sessionRoutes'));
app.use('/api/trips', require('./routes/tripRoute')); // trip as driver session
app.use('/api/fatigue', require('./routes/fatigueRoutes'));
app.use('/api/location', require('./routes/locationRoutes'));

module.exports = app;
