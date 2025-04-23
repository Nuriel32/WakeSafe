const jwt = require('jsonwebtoken');
const User = require('../models/User');
const cache = require('../services/cacheService');

const generateToken = (user) =>
  jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '1h' });

/**
 * @route POST /api/auth/register
 * @desc Register new user
 * @access Public
 */
exports.register = async (req, res) => {
  const { email, password, name } = req.body;
  try {
    const user = await User.create({ email, password, name });
    res.status(201).json({ token: generateToken(user) });
  } catch (e) {
    res.status(400).json({ message: 'Email already in use' });
  }
};

/**
 * @route POST /api/auth/login
 * @desc Login user
 * @access Public
 */
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid'); // ודא שהתקנת עם npm i uuid
const redis = require('../config/redis');
const User = require('../models/User');

/**
 * @route POST /api/auth/login
 * @desc Authenticate user and return JWT token (with jti)
 * @access Public
 */
exports.login = async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await User.findOne({ email });
    if (!user || !(await user.comparePassword(password)))
      return res.status(401).json({ message: 'Invalid credentials' });

    const jti = uuidv4(); // מזהה ייחודי לכל טוקן
    const token = jwt.sign(
        { id: user._id, jti },
        process.env.JWT_SECRET,
        { expiresIn: '1h' }
    );

    // שמירה ל־Redis עבור אימות עתידי
    await redis.set(`token:${user._id}`, token, 'EX', 3600);
    await redis.set(`jti:${user._id}`, jti, 'EX', 3600);

    res.json({ token });
  } catch (err) {
    res.status(500).json({ message: 'Login failed' });
  }
};

/**
 * @route POST /api/auth/logout
 * @desc Invalidate token by blacklisting its jti
 * @access Private
 */
exports.logout = async (req, res) => {
  const jti = req.user.jti;
  if (!jti) return res.status(400).json({ message: "Missing token ID" });

  await redis.set(`blacklist:${jti}`, '1', 'EX', 3600); // טוקן ייחסם לשעה
  await redis.del(`token:${req.user.id}`);
  await redis.del(`jti:${req.user.id}`);

  res.json({ message: 'Logout successful' });
};
