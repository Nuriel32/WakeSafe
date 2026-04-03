const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const cache = require('../services/cacheService');
const User = require('../models/Users');
const DriverSession = require('../models/DriverSession');
const logger = require('../utils/logger');
const HttpError = require('../utils/httpError');

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
async function register(req, res, next) {
  const log = req.log || logger.child({
    requestId: req.requestId || null,
    userId: null,
    tripId: req.body?.sessionId || req.body?.tripId || null,
  });
  const { firstName, lastName, email, password, phone, carNumber } = req.body;

  if (!firstName || !lastName || !email || !password || !phone || !carNumber) {
    log.warn('register_validation_failed', { reason: 'missing_required_fields', email });
    return next(new HttpError(400, 'Missing required fields', null, 'VALIDATION_ERROR'));
  }

  if (!/\S+@\S+\.\S+/.test(email)) {
    return next(new HttpError(400, 'Invalid email format', null, 'VALIDATION_ERROR'));
  }

  if (!/^05\d{8}$/.test(phone)) {
    return next(new HttpError(400, 'Invalid phone number format', null, 'VALIDATION_ERROR'));
  }

  if (!/^\d{7,8}$/.test(carNumber)) {
    return next(new HttpError(400, 'Invalid car number format', null, 'VALIDATION_ERROR'));
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

    log.info('register_success', { userId: user._id.toString(), email });
    return res.success({ token }, { statusCode: 201, message: 'Registration successful' });
  } catch (error) {
    log.error('register_failed', { email, error });
    return next(new HttpError(400, 'Registration failed, email might already exist', null, 'REGISTER_FAILED'));
  }
}

/**
 * @route POST /api/auth/login
 * @desc Authenticate user and return a JWT token
 * @access Public
 */
async function login(req, res, next) {
  const log = req.log || logger.child({
    requestId: req.requestId || null,
    userId: null,
    tripId: null,
  });
  const { email, password } = req.body;

  try {
    const user = await User.findOne({ email });
    if (!user || !(await user.comparePassword(password))) {
      log.warn('login_failed', { email, reason: 'invalid_credentials' });
      return next(new HttpError(401, 'Invalid credentials', null, 'INVALID_CREDENTIALS'));
    }

    const jti = uuidv4();
    const token = generateToken(user, jti);

    await cache.set(`token:${user._id}`, token, 3600);
    await cache.set(`jti:${user._id}`, jti, 3600);

    log.info('login_success', { userId: user._id.toString(), email });
    return res.success({ token }, { message: 'Login successful' });
  } catch (error) {
    log.error('login_error', { email, error });
    return next(new HttpError(500, 'Login failed', null, 'LOGIN_FAILED'));
  }
}

/**
 * @route POST /api/auth/logout
 * @desc Logout and invalidate JWT
 * @access Private
 */
async function logout(req, res, next) {
  const log = req.log || logger.child({
    requestId: req.requestId || null,
    userId: req.user?.id || null,
    tripId: null,
  });
  const jti = req.user.jti;
  if (!jti) {
    log.warn('logout_failed', { reason: 'missing_jti' });
    return next(new HttpError(400, 'Missing token ID', null, 'TOKEN_ID_MISSING'));
  }

  await cache.revokeToken(jti);
  await cache.del(`token:${req.user.id}`);
  await cache.del(`jti:${req.user.id}`);

  log.info('logout_success');
  return res.success(null, { message: 'Logout successful' });
}

module.exports = {
  register,
  login,
  logout
};
