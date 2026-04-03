const { deleteFile } = require('../services/gcpStorageService');
const FatigueLog = require('../models/FatigueLog');
const DriverSession = require('../models/DriverSession');
const fatigueService = require('../services/fatigueService');
const fatigueAlertService = require('../services/fatigueAlertService');
const logger = require('../utils/logger');
const HttpError = require('../utils/httpError');

exports.detectFatigue = async (req, res, next) => {
  try {
    const result = await fatigueService.processFatigue({
      userId: req.user.id,
      sessionId: req.body.sessionId,
      image: req.body.image,
      ear: req.body.ear,
      headPose: req.body.headPose
    });
    logger.info(`From fatigueController: Fatigue detection completed for user ${req.user.id} (fatigued: ${result.fatigued})`);
    return res.success(result, { message: 'Fatigue detection completed' });
  } catch (err) {
    logger.error(`From fatigueController: Fatigue processing failed for user ${req.user.id}: ${err.message}`);
    return next(new HttpError(500, 'Failed to process fatigue log', null, 'FATIGUE_PROCESS_FAILED'));
  }
};

exports.deleteRecentImages = async (req, res, next) => {
  try {
    const cutoff = new Date(Date.now() - 60 * 1000);
    const logs = await FatigueLog.find({ userId: req.user.id, timestamp: { $gte: cutoff } });

    for (let log of logs) {
      if (log.imageUrl) {
        await deleteFile(log.imageUrl);
      }
      await FatigueLog.findByIdAndDelete(log._id);
    }

    logger.info(`From fatigueController: Deleted ${logs.length} recent fatigue images for user ${req.user.id}`);
    return res.success({ deletedCount: logs.length }, { message: 'Recent fatigue images deleted' });
  } catch (err) {
    logger.error(`From fatigueController:  Failed to delete recent fatigue images for user ${req.user.id}: ${err.message}`);
    return next(new HttpError(500, 'Failed to delete images', null, 'FATIGUE_DELETE_FAILED'));
  }
};

exports.ingestMLFatigueDetection = async (req, res, next) => {
  try {
    const expectedApiKey = process.env.ML_WEBHOOK_API_KEY;
    if (!expectedApiKey) {
      logger.error('[fatigueController] ML_WEBHOOK_API_KEY is not configured');
      return next(new HttpError(503, 'ML ingestion is not configured', null, 'ML_INGESTION_NOT_CONFIGURED'));
    }
    const supplied = req.header('x-ml-api-key');
    if (!supplied || supplied !== expectedApiKey) {
      return next(new HttpError(401, 'Unauthorized ML payload source', null, 'ML_SOURCE_UNAUTHORIZED'));
    }

    const result = await fatigueAlertService.processDetection(req.body, { eventSource: 'ai' });
    if (!result.ok) {
      logger.warn(`[fatigueController] ML detection rejected: ${result.error}`);
      return next(
        new HttpError(
          result.statusCode || 400,
          'Invalid fatigue detection event',
          result.validationErrors || null,
          result.error || 'ML_DETECTION_INVALID'
        )
      );
    }

    return res.success({
      emitted: result.emitted,
      severity: result.severity || null,
      skipped: result.skipped || null
    }, { message: 'Fatigue detection processed' });
  } catch (err) {
    logger.error(`[fatigueController] ML detection processing failed: ${err.message}`);
    return next(new HttpError(500, 'Failed to process ML fatigue detection event', null, 'ML_DETECTION_PROCESS_FAILED'));
  }
};