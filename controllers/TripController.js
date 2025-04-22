const Trip = require('../models/DriverSession');
const ImageLog = require('../models/ImageLog');
const { uploadImage, deleteFileFromGCP } = require('../services/gcpStorageService');

/**
 * @route   POST /api/trips
 * @desc    Create a new trip for a user
 * @access  Private
 */
exports.createTrip = async (req, res) => {
  const trip = new Trip({ userId: req.user.id });
  await trip.save();
  res.status(201).json({ tripId: trip._id });
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
    return res.status(400).json({ error: "Missing required data" });
  }

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

  res.json({ fatigued: isFatigued, url });
};

/**
 * @route   DELETE /api/trips/images/recent
 * @desc    Deletes all images from GCP and DB that were created in the last 60 seconds
 * @access  Private
 */
exports.deleteImagesFromLastMinute = async (req, res) => {
  const cutoff = new Date(Date.now() - 60 * 1000);
  const images = await ImageLog.find({
    userId: req.user.id,
    timestamp: { $gte: cutoff }
  });

  for (const image of images) {
    const filename = image.url.split('/').pop();
    await deleteFileFromGCP(filename);
    await ImageLog.findByIdAndDelete(image._id);
  }

  res.json({ deletedCount: images.length });
};
