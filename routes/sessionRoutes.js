const router = require('express').Router();
const { createSession } = require('../controllers/driverSessionController');
const auth = require('../middlewares/auth');

router.post('/start', auth, createSession);

module.exports = router;
