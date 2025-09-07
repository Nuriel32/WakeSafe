const router = require('express').Router();
const { detectFatigue, deleteRecentImages } = require('../controllers/fatigueController');
const auth = require('../middlewares/auth');

router.post('/', auth, detectFatigue);
router.delete('/recent', auth, deleteRecentImages);

module.exports = router;
