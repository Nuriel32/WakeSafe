const router = require('express').Router();
const { createSession, getCurrentSession, endSession, getSessionHistory } = require('../controllers/driverSessionController');
const auth = require('../middlewares/auth');
const validateRequest = require('../middlewares/validateRequest');

// Session management routes
router.post('/start', auth, createSession);
router.get('/current', auth, getCurrentSession);
router.get(
  '/',
  auth,
  validateRequest({
    query: {
      limit: { required: false, type: 'string', regex: /^\d+$/ },
      page: { required: false, type: 'string', regex: /^\d+$/ },
      includePhotos: { required: false, type: 'string', enum: ['true', 'false'] },
    },
  }),
  getSessionHistory
);
router.put(
  '/:sessionId',
  auth,
  validateRequest({
    params: {
      sessionId: { required: true, type: 'string' },
    },
  }),
  endSession
);

module.exports = router;
