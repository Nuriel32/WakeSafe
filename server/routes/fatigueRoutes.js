const router = require('express').Router();
const { detectFatigue, deleteRecentImages, ingestMLFatigueDetection } = require('../controllers/fatigueController');
const auth = require('../middlewares/auth');
const validateRequest = require('../middlewares/validateRequest');

router.post(
  '/',
  auth,
  validateRequest({
    body: {
      sessionId: { required: true, type: 'string' },
    },
  }),
  detectFatigue
);
router.post(
  '/ml-detection',
  validateRequest({
    body: {
      userId: { required: true, type: 'string' },
      sessionId: { required: true, type: 'string' },
      detectionTimestamp: { required: true, type: 'string' },
      fatigueLevel: { required: true, type: 'number', min: 0, max: 1 },
      confidenceScore: { required: true, type: 'number', min: 0, max: 1 },
      source: { required: true, type: 'string' },
    },
  }),
  ingestMLFatigueDetection
);
router.delete('/recent', auth, deleteRecentImages);

module.exports = router;
