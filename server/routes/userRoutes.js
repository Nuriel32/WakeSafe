const express = require('express');
const router = express.Router();
const userController = require('../userController');
const auth = require('../middlewares/auth');

// ניהול משתמשים רק למשתמש עצמו
router.get('/me', auth, userController.getCurrentUser); // מידע אישי של המשתמש
router.put('/me', auth, userController.updateUser);     // עדכון אישי
router.delete('/me', auth, userController.deleteUser);   // מחיקה

module.exports = router;
