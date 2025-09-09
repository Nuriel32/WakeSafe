const Trip = require('../models/DriverSession');
const ImageLog = require('../models/ImageLog');
const { uploadFile, deleteFile } = require('../services/gcpStorageService');
const logger = require('../utils/logger');

/**
 * @route   POST /api/trips
 * @desc    Create a new trip for a user
 * @access  Private
 */
exports.createTrip = async (req, res) => {
  try {
    const trip = new Trip({ userId: req.user.id });
    await trip.save();
    logger.info(`From TripController: Trip created for user ${req.user.id}, Trip ID: ${trip._id}`);
    res.status(201).json({ tripId: trip._id });
  } catch (err) {
    logger.error(`From TripController: Failed to create trip for user ${req.user.id}: ${err.message}`);
    res.status(500).json({ error: 'From TripController: Failed to create trip' });
  }
};

/**
 * @route   POST /api/trips/detect-fatigue
 * @desc    Receive image and stats, store image in GCP and metadata in DB
 * @access  Private
 * @body    { image: base64, ear: float, headPose: {pitch,yaw,roll}, tripId }
 */
exports.detectFatigue = async (req, res) => {
  const { image, ear, headPose, tripId } = req.body;
  if (!image || !ear || !headPose || !tripId) {
    logger.warn(`From TripController: Fatigue detection missing data for user ${req.user.id}`);
    return res.status(400).json({ error: "From TripController:  Missing required data" });
  }

  try {
    const filename = `fatigue-${Date.now()}.jpg`;
    const url = await uploadImage(image, filename);

    const log = new ImageLog({
      tripId,
      userId: req.user.id,
      imageId: filename,
      url,
      timestamp: new Date()
    });

    await log.save();

    await Trip.findByIdAndUpdate(tripId, {
      $push: {
        'stats.earReadings': { value: ear, timestamp: new Date() },
        'stats.headPoseData': { ...headPose, timestamp: new Date() }
      }
    });

    const isFatigued = ear < 0.2 || Math.abs(headPose.pitch) > 15;
    logger.info(`From TripController:  Fatigue detection processed for user ${req.user.id} (fatigued: ${isFatigued})`);

    res.json({ fatigued: isFatigued, url });
  } catch (err) {
    logger.error(`From TripController: Fatigue detection failed for user ${req.user.id}: ${err.message}`);
    res.status(500).json({ error: 'From TripController: Fatigue detection failed' });
  }
};

/**
 * @route   DELETE /api/trips/images/recent
 * @desc    Deletes all images from GCP and DB that were created in the last 60 seconds
 * @access  Private
 */
exports.deleteImagesFromLastMinute = async (req, res) => {
  const cutoff = new Date(Date.now() - 60 * 1000);

  try {
    const images = await ImageLog.find({
      userId: req.user.id,
      timestamp: { $gte: cutoff }
    });

    for (const image of images) {
      const filename = image.url.split('/').pop();
      await deleteFileFromGCP(filename);
      await ImageLog.findByIdAndDelete(image._id);
    }

    logger.info(`From TripController:  Deleted ${images.length} image(s) from last minute for user ${req.user.id}`);
    res.json({ deletedCount: images.length });
  } catch (err) {
    logger.error(`From TripController:  Failed to delete recent images for user ${req.user.id}: ${err.message}`);
    res.status(500).json({ error: 'From TripController: Failed to delete recent images' });
  }
};
