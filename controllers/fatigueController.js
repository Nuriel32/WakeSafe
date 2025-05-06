const { uploadImage, deleteFileFromGCP } = require('../services/gcpStorageService');
const FatigueLog = require('../models/FatigueLog');
const DriverSession = require('../models/DriverSession');
const fatigueService = require('../services/fatigueService');
const logger = require('../utils/logger');

exports.detectFatigue = async (req, res) => {
  try {
    const result = await fatigueService.processFatigue({
      userId: req.user.id,
      sessionId: req.body.sessionId,
      image: req.body.image,
      ear: req.body.ear,
      headPose: req.body.headPose
    });
    logger.info(`Fatigue detection completed for user ${req.user.id} (fatigued: ${result.fatigued})`);
    res.json(result);
  } catch (err) {
    logger.error(`Fatigue processing failed for user ${req.user.id}: ${err.message}`);
    res.status(500).json({ message: 'Failed to process fatigue log' });
  }
};

exports.deleteRecentImages = async (req, res) => {
  try {
    const cutoff = new Date(Date.now() - 60 * 1000);
    const logs = await FatigueLog.find({ userId: req.user.id, timestamp: { $gte: cutoff } });

    for (let log of logs) {
      await deleteFileFromGCP(log.imageId);
      await FatigueLog.findByIdAndDelete(log._id);
    }

    logger.info(`Deleted ${logs.length} recent fatigue images for user ${req.user.id}`);
    res.json({ deletedCount: logs.length });
  } catch (err) {
    logger.error(`Failed to delete recent fatigue images for user ${req.user.id}: ${err.message}`);
    res.status(500).json({ message: 'Failed to delete images' });
  }
};