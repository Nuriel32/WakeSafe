const express = require('express');
const router = express.Router();
const locationController = require('../controllers/locationController');
const auth = require('../middlewares/auth');

router.post('/navigate', auth, locationController.getNavigationRecommendations);

module.exports = router;
