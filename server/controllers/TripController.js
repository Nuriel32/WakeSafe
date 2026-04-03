const Trip = require('../models/DriverSession');
const ImageLog = require('../models/ImageLog');
const { uploadSessionPhoto, deleteFile } = require('../services/gcpStorageService');
const logger = require('../utils/logger');

/**
 * @route   POST /api/trips
 * @desc    Create a new trip for a user
 * @access  Private
 */
exports.createTrip = async (req, res) => {
  try {
    const sessionId = `trip_${req.user.id}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const trip = new Trip({ userId: req.user.id, sessionId });
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
    const trip = await Trip.findOne({ _id: tripId, userId: req.user.id, isActive: true });
    if (!trip) {
      return res.status(404).json({ error: 'Trip not found' });
    }

    const filename = `fatigue-${Date.now()}.jpg`;
    const base64 = image.includes(',') ? image.split(',')[1] : image;
    const buffer = Buffer.from(base64, 'base64');
    const upload = await uploadSessionPhoto(
      {
        originalname: filename,
        mimetype: 'image/jpeg',
        size: buffer.length,
        buffer
      },
      req.user.id,
      tripId,
      { sequenceNumber: 0, captureTimestamp: Date.now() },
      'before-ai'
    );
    const url = upload.gcsPath;

    const log = new ImageLog({
      tripId,
      userId: req.user.id,
      imageId: filename,
      url,
      timestamp: new Date()
    });

    await log.save();

    await trip.addEvent(
      'fatigue_detected',
      { ear, headPose, fatigued: ear < 0.2 || Math.abs(headPose.pitch) > 15, imageId: filename },
      'api'
    );

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
      await deleteFile(image.url);
      await ImageLog.findByIdAndDelete(image._id);
    }

    logger.info(`From TripController:  Deleted ${images.length} image(s) from last minute for user ${req.user.id}`);
    res.json({ deletedCount: images.length });
  } catch (err) {
    logger.error(`From TripController:  Failed to delete recent images for user ${req.user.id}: ${err.message}`);
    res.status(500).json({ error: 'From TripController: Failed to delete recent images' });
  }
};
