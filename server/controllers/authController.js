const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const cache = require('../services/cacheService');
const User = require('../models/Users');
const DriverSession = require('../models/DriverSession');
const logger = require('../utils/logger');

// פונקציה פנימית ליצירת JWT
function generateToken(user, jti) {
  return jwt.sign({ 
    id: user._id, 
    jti,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    phone: user.phone,
    carNumber: user.carNumber
  }, process.env.JWT_SECRET, { expiresIn: '24h' });
}

/**
 * @route POST /api/auth/register
 * @desc Register a new user and create a driver session
 * @access Public
 */
async function register(req, res) {
  console.log('Register endpoint called with body:', req.body);
  const { firstName, lastName, email, password, phone, carNumber } = req.body;

  if (!firstName || !lastName || !email || !password || !phone || !carNumber) {
    console.log('Missing required fields');
    return res.status(400).json({ message: 'Missing required fields' });
  }

  if (!/\S+@\S+\.\S+/.test(email)) {
    return res.status(400).json({ message: 'Invalid email format' });
  }

  if (!/^05\d{8}$/.test(phone)) {
    return res.status(400).json({ message: 'Invalid phone number format' });
  }

  if (!/^\d{7,8}$/.test(carNumber)) {
    return res.status(400).json({ message: 'Invalid car number format' });
  }

  try {
    const user = await User.create({
      firstName,
      lastName,
      email,
      password,
      phone,
      carNumber
    });

    // Generate a unique session ID
    const sessionId = `session_${user._id}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    await DriverSession.create({ 
      userId: user._id,
      sessionId: sessionId
    });

    const jti = uuidv4();
    const token = generateToken(user, jti);

    await cache.set(`token:${user._id}`, token, 3600);
    await cache.set(`jti:${user._id}`, jti, 3600);

    logger.info(`User registered successfully: ${email}`);
    res.status(201).json({ token });
  } catch (error) {
    console.error('Registration error:', error);
    logger.error(`Registration failed for email ${email}: ${error.message}`);
    res.status(400).json({ message: 'Registration failed, email might already exist' });
  }
}

/**
 * @route POST /api/auth/login
 * @desc Authenticate user and return a JWT token
 * @access Public
 */
async function login(req, res) {
  const { email, password } = req.body;

  try {
    const user = await User.findOne({ email });
    if (!user || !(await user.comparePassword(password))) {
      logger.warn(`From authController: Login attempt failed for email: ${email}`);
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    console.log('User found for login:', {
      id: user._id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone,
      carNumber: user.carNumber
    });

    const jti = uuidv4();
    const token = generateToken(user, jti);
    
    console.log('Generated JWT payload:', {
      id: user._id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone,
      carNumber: user.carNumber
    });

    await cache.set(`token:${user._id}`, token, 3600);
    await cache.set(`jti:${user._id}`, jti, 3600);

    logger.info(`From authController: User logged in successfully: ${email}`);
    res.json({ token });
  } catch (error) {
    logger.error(`From authController:  Login failed for email ${email}: ${error.message}`);
    res.status(500).json({ message: 'Login failed' });
  }
}

/**
 * @route POST /api/auth/logout
 * @desc Logout and invalidate JWT
 * @access Private
 */
async function logout(req, res) {
  const jti = req.user.jti;
  if (!jti) {
    logger.warn(`Logout attempt with missing JTI by user ${req.user.id}`);
    return res.status(400).json({ message: "Missing token ID" });
  }

  await cache.revokeToken(jti);
  await cache.del(`token:${req.user.id}`);
  await cache.del(`jti:${req.user.id}`);

  logger.info(`From authController: User ${req.user.id} logged out successfully`);
  res.json({ message: 'Logout successful' });
}

module.exports = {
  register,
  login,
  logout
};
