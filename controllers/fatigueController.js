const { uploadImage, deleteFileFromGCP } = require('../services/gcpStorageService');
const FatigueLog = require('../models/FatigueLog');
const DriverSession = require('../models/DriverSession');

exports.detectFatigue = async (req, res) => {
  const { sessionId, image, ear, headPose } = req.body;
  const imageId = `fatigue-${Date.now()}.jpg`;
  const url = await uploadImage(image, imageId);

  const fatigued = ear < 0.2 || Math.abs(headPose.pitch) > 15;

  await FatigueLog.create({
    sessionId,
    userId: req.user.id,
    imageId,
    imageUrl: url,
    ear,
    headPose,
    fatigued
  });

  await DriverSession.findByIdAndUpdate(sessionId, {
    $push: {
      'stats.earReadings': { value: ear, timestamp: new Date() },
      'stats.headPoseData': { ...headPose, timestamp: new Date() }
    }
  });

  res.json({ fatigued, imageUrl: url });
};

exports.deleteRecentImages = async (req, res) => {
  const cutoff = new Date(Date.now() - 60 * 1000);
  const logs = await FatigueLog.find({ userId: req.user.id, timestamp: { $gte: cutoff } });

  for (let log of logs) {
    await deleteFileFromGCP(log.imageId);
    await FatigueLog.findByIdAndDelete(log._id);
  }

  res.json({ deletedCount: logs.length });
};
