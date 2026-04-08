const logger = require('../utils/logger');
const Photo = require('../models/PhotoSchema');
const DriverSession = require('../models/DriverSession');
const FatigueLog = require('../models/FatigueLog');
const fatigueAlertService = require('./fatigueAlertService');
const monitoring = require('./monitoringService');
const mlAdapter = require('../adapters/mlAdapter');
const cache = require('./cacheService');

// AI Processing Service for WakeSafe
// This service handles communication with the AI server for fatigue detection

const ML2_SEQUENCE_WINDOW_SIZE = parseInt(process.env.ML2_SEQUENCE_WINDOW_SIZE || '20', 10);
const ML_ALERT_MIN_CONFIDENCE = Number(process.env.ML_ALERT_MIN_CONFIDENCE || 0.75);
const ML_ALERT_MIN_SEVERITY = Number(process.env.ML_ALERT_MIN_SEVERITY || 0.7);
const ML_ALERT_CONSECUTIVE_FRAMES = parseInt(process.env.ML_ALERT_CONSECUTIVE_FRAMES || '2', 10);

function validateMl1Payload(payload) {
  if (!payload || typeof payload !== 'object') throw new Error('Invalid ML1 payload');
  if (!payload.image_url || typeof payload.image_url !== 'string') throw new Error('ML1 payload missing image_url');
  if (!payload.image_id || typeof payload.image_id !== 'string') throw new Error('ML1 payload missing image_id');
}

function validateMl2Payload(payload) {
  if (!payload || typeof payload !== 'object') throw new Error('Invalid ML2 payload');
  if (!Array.isArray(payload.sequence) || payload.sequence.length === 0) {
    throw new Error('ML2 payload requires non-empty sequence');
  }
}

function validateMl1Response(response) {
  const frame = response?.frame_analysis;
  if (!frame || typeof frame !== 'object') throw new Error('ML1 response missing frame_analysis');
  if (typeof frame.confidence !== 'number' || Number.isNaN(frame.confidence)) {
    throw new Error('ML1 response has invalid confidence');
  }
}

function validateMl2Response(response) {
  if (!response || typeof response !== 'object') throw new Error('Invalid ML2 response');
  if (typeof response.fatigued !== 'boolean') throw new Error('ML2 response missing fatigued');
  if (typeof response.driver_state !== 'string') throw new Error('ML2 response missing driver_state');
  if (typeof response.severity !== 'number' || Number.isNaN(response.severity)) {
    throw new Error('ML2 response has invalid severity');
  }
}

function mapEarToEyeState(ear) {
  if (ear == null || Number.isNaN(Number(ear))) return 'UNKNOWN';
  const value = Number(ear);
  // Be conservative: only strong closure is considered CLOSED.
  return value < 0.18 ? 'CLOSED' : 'OPEN';
}

function normalizeGcsPath(gcsPath) {
  const bucket = process.env.GCS_BUCKET;
  if (bucket && gcsPath.startsWith(`gs://${bucket}/`)) {
    return gcsPath;
  }

  if (gcsPath.startsWith('gs://')) {
    return gcsPath;
  }

  if (!bucket) {
    return gcsPath;
  }

  return `gs://${bucket}/${gcsPath}`;
}

async function buildTemporalSequence(sessionId, currentFrame) {
  const recentPhotos = await Photo.find({
    sessionId,
    aiProcessingStatus: 'completed',
  })
    .sort({ captureTimestamp: -1, uploadedAt: -1 })
    .limit(Math.max(ML2_SEQUENCE_WINDOW_SIZE - 1, 1))
    .lean();

  const sequence = recentPhotos
    .filter((item) => item?.aiResults?.processedAt)
    .map((item) => ({
      timestamp: new Date(item.aiResults.processedAt).toISOString(),
      eye_state: mapEarToEyeState(item.aiResults?.ear),
      confidence: Number(item.aiResults?.confidence || 0),
      ear: item.aiResults?.ear ?? null,
      head_pose: {
        pitch: item.aiResults?.headPose?.pitch ?? null,
        yaw: item.aiResults?.headPose?.yaw ?? null,
        roll: item.aiResults?.headPose?.roll ?? null,
      },
    }))
    .reverse();

  sequence.push(currentFrame);
  return sequence.slice(-ML2_SEQUENCE_WINDOW_SIZE);
}

async function passesFalsePositiveGuard(sessionId, ml2Response, confidence) {
  if (!ml2Response?.fatigued) return false;
  const severity = Number(ml2Response?.severity || 0);
  if (confidence < ML_ALERT_MIN_CONFIDENCE || severity < ML_ALERT_MIN_SEVERITY) {
    return false;
  }

  if (ML_ALERT_CONSECUTIVE_FRAMES <= 1) {
    return true;
  }

  const recent = await Photo.find({
    sessionId,
    aiProcessingStatus: 'completed',
    prediction: { $in: ['drowsy', 'sleeping'] },
    'aiResults.confidence': { $gte: ML_ALERT_MIN_CONFIDENCE },
  })
    .sort({ captureTimestamp: -1, uploadedAt: -1 })
    .limit(Math.max(ML_ALERT_CONSECUTIVE_FRAMES - 1, 1))
    .select('prediction aiResults.confidence')
    .lean();

  const priorHits = recent.length;
  return priorHits + 1 >= ML_ALERT_CONSECUTIVE_FRAMES;
}

async function queuePhotoForProcessing(photoDoc, signedUrl) {
  const startedAt = Date.now();
  const photoId = photoDoc?._id?.toString();
  const userId = photoDoc?.userId?.toString() || null;
  const sessionId = photoDoc?.sessionId?.toString() || null;
  const log = logger.child({ requestId: null, userId, tripId: sessionId, photoId });

  if (!photoDoc || !photoId) {
    throw new Error('Invalid photo document for AI processing');
  }

  const imageUrl = signedUrl;
  if (!imageUrl) {
    throw new Error(`Missing signed URL for photo ${photoId}`);
  }

  try {
    log.info('ai_processing_started');
    if (typeof photoDoc.addWebSocketEvent === 'function') {
      await photoDoc.addWebSocketEvent('ai_processing_started', {
        photoId,
        sessionId: photoDoc.sessionId?.toString(),
      });
    }

    photoDoc.aiProcessingStatus = 'processing';
    photoDoc.processingStartedAt = new Date();
    await photoDoc.save();

    const ml1Payload = {
      image_url: imageUrl,
      user_id: photoDoc.userId?.toString() || null,
      session_id: photoDoc.sessionId?.toString() || null,
      image_id: photoId,
      image_metadata: {
        sequence_number: photoDoc.sequenceNumber ?? null,
        capture_timestamp: photoDoc.captureTimestamp ?? null,
      },
    };

    validateMl1Payload(ml1Payload);
    const ml1Response = await mlAdapter.ml1Predict(ml1Payload);
    validateMl1Response(ml1Response);
    const frame = ml1Response?.frame_analysis;

    const ml2CurrentFrame = {
      timestamp: frame.processed_at || new Date().toISOString(),
      eye_state: frame.eye_state || 'UNKNOWN',
      confidence: Number(frame.confidence || 0),
      ear: frame.ear ?? null,
      head_pose: {
        pitch: frame.head_pose?.pitch ?? null,
        yaw: frame.head_pose?.yaw ?? null,
        roll: frame.head_pose?.roll ?? null,
      },
    };

    const sequence = await buildTemporalSequence(photoDoc.sessionId, ml2CurrentFrame);
    const ml2Payload = {
      user_id: photoDoc.userId?.toString() || null,
      session_id: photoDoc.sessionId?.toString() || null,
      sequence,
    };

    validateMl2Payload(ml2Payload);
    const ml2Response = await mlAdapter.ml2Analyze(ml2Payload);
    validateMl2Response(ml2Response);
    const finalPrediction = ml2Response?.driver_state || 'unknown';
    const totalProcessingTime = Date.now() - startedAt;

    await photoDoc.updateAIResults({
      prediction: finalPrediction,
      confidence: Number(frame.confidence || 0),
      ear: frame.ear ?? null,
      headPose: {
        pitch: frame.head_pose?.pitch ?? null,
        yaw: frame.head_pose?.yaw ?? null,
        roll: frame.head_pose?.roll ?? null,
      },
      processingTime: Number(frame.processing_time_ms || totalProcessingTime),
    });

    await Photo.updateOne(
      { _id: photoDoc._id },
      {
        $set: {
          prediction: finalPrediction,
          aiProcessingStatus: 'completed',
          processingCompletedAt: new Date(),
        },
      }
    );
    await cache.invalidatePhotoCachesForUser(photoDoc.userId, photoDoc.sessionId);

    await FatigueLog.create({
      userId: photoDoc.userId,
      sessionId: photoDoc.sessionId,
      imageId: photoId,
      imageUrl: normalizeGcsPath(photoDoc.gcsPath),
      ear: frame.ear ?? null,
      headPose: {
        pitch: frame.head_pose?.pitch ?? null,
        yaw: frame.head_pose?.yaw ?? null,
        roll: frame.head_pose?.roll ?? null,
      },
      fatigued: Boolean(ml2Response?.fatigued),
      timestamp: new Date(),
    });

    const session = await DriverSession.findById(photoDoc.sessionId);
    if (session) {
      session.totalImagesProcessed = (session.totalImagesProcessed || 0) + 1;
      await session.updateAIStats(
        finalPrediction,
        Number(frame.confidence || 0),
        Number(frame.processing_time_ms || totalProcessingTime)
      );
    }

    const alertAllowed = await passesFalsePositiveGuard(photoDoc.sessionId, ml2Response, Number(frame.confidence || 0));
    if (ml2Response?.fatigued && alertAllowed) {
      await fatigueAlertService.processDetection(
        {
          userId: photoDoc.userId?.toString(),
          sessionId: photoDoc.sessionId?.toString(),
          detectionTimestamp: new Date().toISOString(),
          fatigueLevel: Number(ml2Response?.severity || 0),
          confidenceScore: Number(frame.confidence || 0),
          source: 'ml_pipeline',
          prediction: ml2Response?.driver_state,
          photoId,
          metrics: ml2Response?.features || {}
        },
        { eventSource: 'ai' }
      );

      const refreshedPhoto = await Photo.findById(photoDoc._id);
      if (refreshedPhoto && typeof refreshedPhoto.addWebSocketEvent === 'function') {
        await refreshedPhoto.addWebSocketEvent('driver_fatigue_alert', {
          fatigueLevel: ml2Response?.driver_state,
          fatigued: Boolean(ml2Response?.fatigued),
          confidence: Number(frame.confidence || 0),
          severity: Number(ml2Response?.severity || 0),
          guard: {
            minConfidence: ML_ALERT_MIN_CONFIDENCE,
            minSeverity: ML_ALERT_MIN_SEVERITY,
            minConsecutiveFrames: ML_ALERT_CONSECUTIVE_FRAMES,
          },
        });
      }
    } else if (ml2Response?.fatigued && !alertAllowed) {
      log.info('fatigue_alert_suppressed', {
        confidence: Number(frame.confidence || 0),
        severity: Number(ml2Response?.severity || 0),
        minConfidence: ML_ALERT_MIN_CONFIDENCE,
        minSeverity: ML_ALERT_MIN_SEVERITY,
        minConsecutiveFrames: ML_ALERT_CONSECUTIVE_FRAMES,
      });
    }

    if (global.broadcastAIProcessingComplete) {
      const alertEmitted = Boolean(ml2Response?.fatigued && alertAllowed);
      global.broadcastAIProcessingComplete(
        photoDoc.userId?.toString(),
        photoId,
        {
          ml1: ml1Response,
          ml2: ml2Response,
          prediction: finalPrediction,
          alertEmitted,
        },
        totalProcessingTime
      );

      const refreshedPhoto = await Photo.findById(photoDoc._id);
      if (refreshedPhoto && typeof refreshedPhoto.addWebSocketEvent === 'function') {
        await refreshedPhoto.addWebSocketEvent('ai_processing_complete', {
          prediction: finalPrediction,
          confidence: Number(frame.confidence || 0),
          processingTime: totalProcessingTime,
        });
      }
    }

    log.info('ai_processing_completed', {
      prediction: finalPrediction,
      fatigueDetected: Boolean(ml2Response?.fatigued),
      processingTimeMs: totalProcessingTime,
    });
    return {
      photo_id: photoId,
      prediction: finalPrediction,
      confidence: Number(frame.confidence || 0),
      fatigue_detected: Boolean(ml2Response?.fatigued),
      processing_time: totalProcessingTime,
      ml1: ml1Response,
      ml2: ml2Response,
    };
  } catch (error) {
    log.error('ai_processing_failed', { error });
    await monitoring.trackFailure('ml_service_failure', {
      userId,
      tripId: sessionId,
      photoId,
      requestId: null,
      source: 'ai_processing_service',
      message: error.message,
    });
    const failedPhoto = await Photo.findById(photoDoc._id);
    if (failedPhoto && typeof failedPhoto.addWebSocketEvent === 'function') {
      await failedPhoto.addWebSocketEvent('ai_processing_failed', {
        message: error.message,
      });
    }
    // Fallback behavior: gracefully mark completion with unknown prediction
    await Photo.updateOne(
      { _id: photoDoc._id },
      {
        $set: {
          prediction: 'unknown',
          aiProcessingStatus: 'completed',
          processingCompletedAt: new Date(),
        },
        $inc: { uploadRetries: 1 },
      }
    );
    await cache.invalidatePhotoCachesForUser(photoDoc.userId, photoDoc.sessionId);
    if (global.broadcastAIProcessingComplete) {
      global.broadcastAIProcessingComplete(
        photoDoc.userId?.toString(),
        photoId,
        {
          prediction: 'unknown',
          fallback: true,
          reason: 'ml_service_unavailable',
          error: error.message,
        },
        Date.now() - startedAt
      );
    }
    return {
      photo_id: photoId,
      prediction: 'unknown',
      confidence: 0,
      fatigue_detected: false,
      processing_time: Date.now() - startedAt,
      fallback: true,
      error: error.message,
    };
  }
}

async function processPhotoForFatigue(photoData, sessionId, userId) {
  try {
    logger.info(`Processing photo for fatigue detection: session ${sessionId}, user ${userId}`);
    
    // Prepare the request payload
    const payload = {
      image_data: photoData,
      session_id: sessionId,
      user_id: userId,
      timestamp: new Date().toISOString(),
    };
    
    // Make request to AI server
    const results = await mlAdapter.aiProcessPhoto(payload);
    
    // Broadcast results if fatigue is detected
    if (results.fatigue_detected && global.broadcastFatigueDetection) {
      global.broadcastFatigueDetection(
        userId,
        sessionId,
        results.fatigue_level,
        results.confidence,
        results.photo_id,
        results
      );
    }
    
    // Broadcast processing completion
    if (global.broadcastAIProcessingComplete) {
      global.broadcastAIProcessingComplete(
        userId,
        results.photo_id,
        results,
        results.processing_time
      );
    }
    
    logger.info(`AI processing completed for photo: ${results.photo_id}`);
    return results;
    
  } catch (error) {
    logger.error('AI processing failed:', error);
    
    // Broadcast error notification
    if (global.sendNotificationToUser) {
      global.sendNotificationToUser(
        userId,
        'AI processing failed. Please try again.',
        'error',
        5000
      );
    }
    
    throw error;
  }
}

async function processBatchPhotos(photos, sessionId, userId) {
  try {
    logger.info(`Processing batch of ${photos.length} photos for session ${sessionId}`);
    
    const results = [];
    
    for (const photo of photos) {
      try {
        const result = await processPhotoForFatigue(photo, sessionId, userId);
        results.push(result);
        
        // Add small delay between requests to avoid overwhelming the AI server
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        logger.error(`Failed to process photo in batch: ${error.message}`);
        results.push({
          error: error.message,
          photo_id: photo.id || 'unknown',
        });
      }
    }
    
    return results;
  } catch (error) {
    logger.error('Batch photo processing failed:', error);
    throw error;
  }
}

async function getAIProcessingStatus(photoId) {
  try {
    return await mlAdapter.aiStatus(photoId);
  } catch (error) {
    logger.error('Failed to get AI processing status:', error);
    throw error;
  }
}

async function healthCheck() {
  try {
    return await mlAdapter.aiHealth();
  } catch (_error) {
    return false;
  }
}

module.exports = {
  queuePhotoForProcessing,
  processPhotoForFatigue,
  processBatchPhotos,
  getAIProcessingStatus,
  healthCheck,
};
