const logger = require('../utils/logger');
const { broadcastFatigueDetection, broadcastAIProcessingComplete } = require('../server');

/**
 * AI Processing Service
 * Handles communication with external AI service for fatigue detection
 * 
 * This service is designed to work with your AI endpoint when provided.
 * For now, it includes the structure and mock processing capabilities.
 */

class AIProcessingService {
    constructor() {
        this.processingQueue = [];
        this.isProcessing = false;
        this.aiEndpoint = process.env.AI_ENDPOINT || null;
        this.apiKey = process.env.AI_API_KEY || null;
    }

    /**
     * Add photo to AI processing queue
     * @param {Object} photo - Photo document from MongoDB
     * @param {string} signedUrl - GCS signed URL for the photo
     */
    async queuePhotoForProcessing(photo, signedUrl) {
        try {
            const processingItem = {
                photoId: photo._id,
                userId: photo.userId,
                sessionId: photo.sessionId,
                gcsPath: photo.gcsPath,
                signedUrl,
                sequenceNumber: photo.sequenceNumber,
                captureTimestamp: photo.captureTimestamp,
                queuedAt: Date.now()
            };

            this.processingQueue.push(processingItem);
            logger.info(`Photo ${photo._id} queued for AI processing. Queue size: ${this.processingQueue.length}`);

            // Start processing if not already running
            if (!this.isProcessing) {
                this.processQueue();
            }

            return true;
        } catch (error) {
            logger.error(`Error queuing photo for AI processing: ${error.message}`);
            return false;
        }
    }

    /**
     * Process the AI processing queue
     */
    async processQueue() {
        if (this.isProcessing || this.processingQueue.length === 0) {
            return;
        }

        this.isProcessing = true;
        logger.info(`Starting AI processing queue. Items: ${this.processingQueue.length}`);

        while (this.processingQueue.length > 0) {
            const item = this.processingQueue.shift();
            await this.processPhoto(item);
        }

        this.isProcessing = false;
        logger.info('AI processing queue completed');
    }

    /**
     * Process a single photo with AI service
     * @param {Object} item - Processing item from queue
     */
    async processPhoto(item) {
        const startTime = Date.now();
        
        try {
            logger.info(`Processing photo ${item.photoId} with AI service`);

            // Update photo status to processing
            await this.updatePhotoStatus(item.photoId, 'processing');

            let aiResults;
            
            if (this.aiEndpoint && this.apiKey) {
                // Call actual AI service
                aiResults = await this.callAIService(item);
            } else {
                // Mock processing for development
                aiResults = await this.mockAIProcessing(item);
            }

            const processingTime = Date.now() - startTime;

            // Update photo with AI results
            await this.updatePhotoWithResults(item.photoId, aiResults, processingTime);

            // Broadcast results via WebSocket
            broadcastAIProcessingComplete(item.userId, item.photoId, aiResults, processingTime);

            // Check if fatigue detection requires alert
            if (aiResults.fatigueLevel !== 'alert' && aiResults.confidence > 0.6) {
                broadcastFatigueDetection(
                    item.userId,
                    item.sessionId,
                    aiResults.fatigueLevel,
                    aiResults.confidence,
                    item.photoId,
                    aiResults
                );
            }

            logger.info(`Photo ${item.photoId} processed successfully in ${processingTime}ms`);

        } catch (error) {
            logger.error(`Error processing photo ${item.photoId}: ${error.message}`);
            await this.updatePhotoStatus(item.photoId, 'failed');
        }
    }

    /**
     * Call actual AI service (when endpoint is provided)
     * @param {Object} item - Processing item
     */
    async callAIService(item) {
        const axios = require('axios');
        
        const requestData = {
            image_url: item.signedUrl,
            metadata: {
                photoId: item.photoId,
                userId: item.userId,
                sessionId: item.sessionId,
                sequenceNumber: item.sequenceNumber,
                captureTimestamp: item.captureTimestamp
            }
        };

        const response = await axios.post(this.aiEndpoint, requestData, {
            headers: {
                'Authorization': `Bearer ${this.apiKey}`,
                'Content-Type': 'application/json'
            },
            timeout: 30000 // 30 second timeout
        });

        return this.parseAIResponse(response.data);
    }

    /**
     * Mock AI processing for development/testing
     * @param {Object} item - Processing item
     */
    async mockAIProcessing(item) {
        // Simulate processing delay
        await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 2000));

        // Mock results based on sequence number (for testing)
        const mockResults = [
            { fatigueLevel: 'alert', confidence: 0.95 },
            { fatigueLevel: 'alert', confidence: 0.88 },
            { fatigueLevel: 'drowsy', confidence: 0.72 },
            { fatigueLevel: 'alert', confidence: 0.91 },
            { fatigueLevel: 'sleeping', confidence: 0.85 }, // Every 5th photo shows fatigue
        ];

        const resultIndex = item.sequenceNumber % mockResults.length;
        const baseResult = mockResults[resultIndex];

        return {
            fatigueLevel: baseResult.fatigueLevel,
            confidence: baseResult.confidence + (Math.random() - 0.5) * 0.1, // Add some variance
            ear: 0.25 + Math.random() * 0.1, // Eye Aspect Ratio
            headPose: {
                pitch: (Math.random() - 0.5) * 20,
                yaw: (Math.random() - 0.5) * 30,
                roll: (Math.random() - 0.5) * 10
            },
            processingTime: 1000 + Math.random() * 2000,
            processedAt: new Date(),
            mockData: true // Flag to indicate this is mock data
        };
    }

    /**
     * Parse AI service response
     * @param {Object} response - Response from AI service
     */
    parseAIResponse(response) {
        // This will be customized based on your AI service response format
        return {
            fatigueLevel: response.prediction || response.fatigue_level || 'unknown',
            confidence: response.confidence || response.score || 0.5,
            ear: response.ear || response.eye_aspect_ratio || null,
            headPose: response.head_pose || {
                pitch: response.pitch || 0,
                yaw: response.yaw || 0,
                roll: response.roll || 0
            },
            processingTime: response.processing_time || null,
            processedAt: new Date(),
            rawResponse: response
        };
    }

    /**
     * Update photo processing status
     * @param {string} photoId - Photo ID
     * @param {string} status - Processing status
     */
    async updatePhotoStatus(photoId, status) {
        try {
            const Photo = require('../models/PhotoSchema');
            await Photo.findByIdAndUpdate(photoId, {
                aiProcessingStatus: status
            });
        } catch (error) {
            logger.error(`Error updating photo status: ${error.message}`);
        }
    }

    /**
     * Update photo with AI results
     * @param {string} photoId - Photo ID
     * @param {Object} results - AI processing results
     * @param {number} processingTime - Processing time in ms
     */
    async updatePhotoWithResults(photoId, results, processingTime) {
        try {
            const Photo = require('../models/PhotoSchema');
            await Photo.findByIdAndUpdate(photoId, {
                prediction: results.fatigueLevel,
                aiProcessingStatus: 'completed',
                aiResults: {
                    confidence: results.confidence,
                    ear: results.ear,
                    headPose: results.headPose,
                    processingTime: processingTime,
                    processedAt: results.processedAt
                }
            });
        } catch (error) {
            logger.error(`Error updating photo with AI results: ${error.message}`);
        }
    }

    /**
     * Get processing queue status
     */
    getQueueStatus() {
        return {
            queueSize: this.processingQueue.length,
            isProcessing: this.isProcessing,
            hasAIEndpoint: !!this.aiEndpoint
        };
    }

    /**
     * Clear processing queue
     */
    clearQueue() {
        this.processingQueue = [];
        logger.info('AI processing queue cleared');
    }
}

module.exports = new AIProcessingService();
