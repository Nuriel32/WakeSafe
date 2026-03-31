const logger = require('../utils/logger');
const Photo = require('../models/PhotoSchema');
const DriverSession = require('../models/DriverSession');
const FatigueLog = require('../models/FatigueLog');

// AI Processing Service for WakeSafe
// This service handles communication with the AI server for fatigue detection

const AI_SERVER_URL = process.env.AI_SERVER_URL || 'http://localhost:8081';
const ML1_SERVICE_URL = process.env.ML1_SERVICE_URL || 'http://localhost:8001';
const ML2_SERVICE_URL = process.env.ML2_SERVICE_URL || 'http://localhost:8002';
const ML2_SEQUENCE_WINDOW_SIZE = parseInt(process.env.ML2_SEQUENCE_WINDOW_SIZE || '20', 10);

async function postJson(url, payload) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Request failed (${response.status}) for ${url}: ${text}`);
  }

  return response.json();
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
      eye_state: (() => {
        if (item.aiResults?.ear == null) return 'UNKNOWN';
        if (item.aiResults.ear < 0.18) return 'CLOSED';
        if (item.aiResults.ear < 0.24) return 'PARTIAL';
        return 'OPEN';
      })(),
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

async function queuePhotoForProcessing(photoDoc, signedUrl) {
  const startedAt = Date.now();
  const photoId = photoDoc?._id?.toString();

  if (!photoDoc || !photoId) {
    throw new Error('Invalid photo document for AI processing');
  }

  const imageUrl = signedUrl;
  if (!imageUrl) {
    throw new Error(`Missing signed URL for photo ${photoId}`);
  }

  try {
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

    const ml1Response = await postJson(`${ML1_SERVICE_URL}/predict`, ml1Payload);
    const frame = ml1Response?.frame_analysis;

    if (!frame) {
      throw new Error(`ML1 did not return frame_analysis for photo ${photoId}`);
    }

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

    const ml2Response = await postJson(`${ML2_SERVICE_URL}/analyze`, ml2Payload);
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

    if (global.broadcastFatigueDetection && ml2Response?.fatigued) {
      global.broadcastFatigueDetection(
        photoDoc.userId?.toString(),
        photoDoc.sessionId?.toString(),
        ml2Response?.driver_state,
        Number(frame.confidence || 0),
        photoId,
        ml2Response
      );

      const refreshedPhoto = await Photo.findById(photoDoc._id);
      if (refreshedPhoto && typeof refreshedPhoto.addWebSocketEvent === 'function') {
        await refreshedPhoto.addWebSocketEvent('fatigue_detection', {
          fatigueLevel: ml2Response?.driver_state,
          fatigued: Boolean(ml2Response?.fatigued),
          confidence: Number(frame.confidence || 0),
          severity: Number(ml2Response?.severity || 0),
        });
      }
    }

    if (global.broadcastAIProcessingComplete) {
      global.broadcastAIProcessingComplete(
        photoDoc.userId?.toString(),
        photoId,
        {
          ml1: ml1Response,
          ml2: ml2Response,
          prediction: finalPrediction,
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

    logger.info(`AI queue processing completed for photo ${photoId} with prediction ${finalPrediction}`);
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
    logger.error(`AI queue processing failed for photo ${photoId}:`, error);
    const failedPhoto = await Photo.findById(photoDoc._id);
    if (failedPhoto && typeof failedPhoto.addWebSocketEvent === 'function') {
      await failedPhoto.addWebSocketEvent('ai_processing_failed', {
        message: error.message,
      });
    }
    await Photo.updateOne(
      { _id: photoDoc._id },
      {
        $set: {
          aiProcessingStatus: 'failed',
          processingCompletedAt: new Date(),
        },
        $inc: { uploadRetries: 1 },
      }
    );
    throw error;
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
    const response = await fetch(`${AI_SERVER_URL}/api/process-photo`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    
    if (!response.ok) {
      throw new Error(`AI server responded with status: ${response.status}`);
    }
    
    const results = await response.json();
    
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
    const response = await fetch(`${AI_SERVER_URL}/api/status/${photoId}`, {
      method: 'GET',
    });
    
    if (!response.ok) {
      throw new Error(`AI server responded with status: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    logger.error('Failed to get AI processing status:', error);
    throw error;
  }
}

async function healthCheck() {
  try {
    const response = await fetch(`${AI_SERVER_URL}/health`, {
      method: 'GET',
      timeout: 5000,
    });
    
    return response.ok;
  } catch (error) {
    logger.error('AI server health check failed:', error);
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
