const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth');
const controller = require('../controllers/TripController');

/**
 * @api {post} /api/trips Create new trip
 * @apiName CreateTrip
 * @apiGroup Trip
 * @apiSuccess {Object} tripId Created trip ID
 */
router.post('/trips', auth, controller.createTrip);

/**
 * @api {post} /api/trips/detect-fatigue Detect fatigue and upload image
 * @apiName DetectFatigue
 * @apiGroup Trip
 * @apiParam {String} image Base64 image
 * @apiParam {Number} ear Eye aspect ratio
 * @apiParam {Object} headPose Pose object with pitch/yaw/roll
 * @apiParam {String} tripId Trip ID
 */
router.post('/trips/detect-fatigue', auth, controller.detectFatigue);

/**
 * @api {delete} /api/trips/images/recent Delete recent uploaded images
 * @apiName DeleteImages
 * @apiGroup Trip
 * @apiSuccess {Number} deletedCount Number of images deleted
 */
router.delete('/trips/images/recent', auth, controller.deleteImagesFromLastMinute);

module.exports = router;
