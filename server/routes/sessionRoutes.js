const router = require('express').Router();
const { createSession, getCurrentSession, endSession, getSessionHistory } = require('../controllers/driverSessionController');
const auth = require('../middlewares/auth');

// Session management routes
router.post('/start', auth, createSession);
router.get('/current', auth, getCurrentSession);
router.get('/', auth, getSessionHistory);
router.put('/:sessionId', auth, endSession);

module.exports = router;
