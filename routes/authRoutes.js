const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const auth = require('../middlewares/auth');
const rateLimiter = require('../middlewares/rateLimit');

// הרשמה והתחברות
router.post('/register', rateLimiter, authController.register);
router.post('/login', rateLimiter, authController.login);
router.post('/logout', auth, authController.logout);

module.exports = router;
