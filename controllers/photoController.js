const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcrypt');
const cache = require('../services/cacheService');
const User = require('../models/Users');
const DriverSession = require('../models/DriverSession');
const logger = require('../utils/logger');

// פונקציה פנימית ליצירת JWT
function generateToken(user, jti) {
    return jwt.sign({ id: user._id, jti }, process.env.JWT_SECRET, { expiresIn: '1h' });
}

/**
 * @route POST /api/auth/register
 * @desc Register a new user and create a driver session
 * @access Public
 */
async function register(req, res) {
    const { firstName, lastName, email, password, phone, carNumber } = req.body;

    if (!firstName || !lastName || !email || !password || !phone || !carNumber) {
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

        await DriverSession.create({ userId: user._id });

        const jti = uuidv4();
        const token = generateToken(user, jti);

        await cache.setInCache(`token:${user._id}`, token, 3600);
        await cache.setInCache(`jti:${user._id}`, jti, 3600);

        logger.info(`User registered successfully: ${email}`);
        res.status(201).json({ token });
    } catch (error) {
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
            logger.warn(`Login attempt failed for email: ${email}`);
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        const jti = uuidv4();
        const token = generateToken(user, jti);

        await cache.setInCache(`token:${user._id}`, token, 3600);
        await cache.setInCache(`jti:${user._id}`, jti, 3600);

        logger.info(`User logged in successfully: ${email}`);
        res.json({ token });
    } catch (error) {
        logger.error(`Login failed for email ${email}: ${error.message}`);
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

    await cache.blacklistToken(jti);
    await cache.deleteFromCache(`token:${req.user.id}`);
    await cache.deleteFromCache(`jti:${req.user.id}`);

    logger.info(`User ${req.user.id} logged out successfully`);
    res.json({ message: 'Logout successful' });
}

module.exports = {
    register,
    login,
    logout
};
