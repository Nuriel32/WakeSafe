const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const auth = require('../middlewares/auth');
const { authLimiter } = require('../middlewares/rateLimit');
const validateRequest = require('../middlewares/validateRequest');

// הרשמה והתחברות
router.post(
  '/register',
  authLimiter,
  validateRequest({
    body: {
      firstName: { required: true, type: 'string' },
      lastName: { required: true, type: 'string' },
      email: { required: true, type: 'string', regex: /\S+@\S+\.\S+/, message: 'body.email format is invalid' },
      password: { required: true, type: 'string' },
      phone: { required: true, type: 'string', regex: /^05\d{8}$/ },
      carNumber: { required: true, type: 'string', regex: /^\d{7,8}$/ },
    },
  }),
  authController.register
);
router.post(
  '/login',
  authLimiter,
  validateRequest({
    body: {
      email: { required: true, type: 'string', regex: /\S+@\S+\.\S+/ },
      password: { required: true, type: 'string' },
    },
  }),
  authController.login
);
router.post('/logout', auth, authController.logout);

module.exports = router;
