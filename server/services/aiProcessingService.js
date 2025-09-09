const logger = require('../utils/logger');

// AI Processing Service for WakeSafe
// This service handles communication with the AI server for fatigue detection

const AI_SERVER_URL = process.env.AI_SERVER_URL || 'http://localhost:8081';

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
  processPhotoForFatigue,
  processBatchPhotos,
  getAIProcessingStatus,
  healthCheck,
};
