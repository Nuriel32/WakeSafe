const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const auth = require('../middlewares/auth');
const { authLimiter } = require('../middlewares/rateLimit');

// הרשמה והתחברות
router.post('/register', authLimiter, authController.register);
router.post('/login', authLimiter, authController.login);
router.post('/logout', auth, authController.logout);

module.exports = router;
