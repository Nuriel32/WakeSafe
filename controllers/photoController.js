const Photo = require('../models/PhotoSchema');
const DriverSession = require('../models/DriverSession');
const { deleteFile, getUnprocessedPhotos: getGCSUnprocessedPhotos, updatePhotoProcessingStatus } = require('../services/gcpStorageService');
const logger = require('../utils/logger');

/**
 * Internal logic: deletes a single photo from GCS, MongoDB, and session reference.
 * Used by: photoApiController
 */
async function deleteSinglePhoto(photoId) {
    const photo = await Photo.findById(photoId);
    if (!photo) {
        logger.warn(`From PhotoController : Photo not found for ID: ${photoId}`);
        throw new Error('Photo not found');
    }

    const session = await DriverSession.findById(photo.sessionId);
    if (!session) {
        logger.warn(`From PhotoController: Session not found for photo ID: ${photoId}`);
        throw new Error('Associated session not found');
    }

    try {
        await deleteFile(photo.gcsPath);
        logger.info(`From PhotoController:  Deleted photo file from GCS: ${photo.gcsPath}`);
    } catch (err) {
        logger.error(`From PhotoController: Failed to delete GCS file: ${photo.gcsPath}`, err);
    }

    // Remove reference in session
    session.photos.pull(photo._id);
    session.totalImagesUploaded = Math.max(0, session.totalImagesUploaded - 1);
    await session.save();
    logger.info(`From PhotoController:  Removed photo ${photoId} from session ${session._id}`);

    await Photo.deleteOne({ _id: photo._id });
    logger.info(`From PhotoController: Deleted photo document ${photoId} from MongoDB`);

    return true;
}

/**
 * Internal logic: deletes multiple photos by ID array
 * Used by: photoApiController
 */
async function deleteMultiplePhotos(photoIds = []) {
    let deleted = 0;
    let errors = 0;

    for (const photoId of photoIds) {
        try {
            await deleteSinglePhoto(photoId);
            deleted++;
        } catch (err) {
            logger.warn(`From PhotoController: Failed to delete photo ${photoId}: ${err.message}`);
            errors++;
        }
    }

    logger.info(`From PhotoController: Bulk deletion summary: ${deleted} succeeded, ${errors} failed`);
    return { deleted, errors };
}

/**
 * Get all unprocessed photos for AI analysis
 * @route GET /api/photos/unprocessed
 */
exports.getUnprocessedPhotos = async (req, res) => {
    try {
        const { limit = 50, status = 'pending' } = req.query;
        
        // Get photos from MongoDB
        const photos = await Photo.find({ 
            aiProcessingStatus: status 
        })
        .sort({ uploadedAt: 1 })
        .limit(parseInt(limit))
        .populate('sessionId', 'startTime endTime isActive')
        .populate('userId', 'firstName lastName email');

        // Get corresponding GCS files
        const gcsPhotos = await getGCSUnprocessedPhotos(status);
        const gcsMap = new Map(gcsPhotos.map(p => [p.gcsPath, p]));

        // Combine MongoDB and GCS data
        const enrichedPhotos = photos.map(photo => {
            const gcsData = gcsMap.get(photo.gcsPath);
            return {
                ...photo.toObject(),
                gcsUrl: `https://storage.googleapis.com/${process.env.GCS_BUCKET}/${photo.gcsPath}`,
                gcsMetadata: gcsData?.metadata || {}
            };
        });

        logger.info(`From photoController: Retrieved ${enrichedPhotos.length} unprocessed photos for AI analysis`);
        
        res.json({
            photos: enrichedPhotos,
            count: enrichedPhotos.length,
            status
        });
    } catch (error) {
        logger.error(`From photoController: Failed to get unprocessed photos: ${error.message}`);
        res.status(500).json({ error: 'Failed to retrieve unprocessed photos' });
    }
};

/**
 * Update AI analysis results for a photo
 * @route PUT /api/photos/:id/ai-results
 */
exports.updatePhotoAIResults = async (req, res) => {
    try {
        const { id } = req.params;
        const { 
            prediction, 
            confidence, 
            ear, 
            headPose, 
            processingTime,
            aiResults 
        } = req.body;

        const photo = await Photo.findById(id);
        if (!photo) {
            return res.status(404).json({ error: 'Photo not found' });
        }

        // Update photo with AI results
        const results = {
            prediction: prediction || 'unknown',
            confidence,
            ear,
            headPose,
            processingTime,
            ...aiResults
        };

        await photo.updateAIResults(results);

        // Update GCS metadata
        await updatePhotoProcessingStatus(photo.gcsPath, 'completed', results);

        logger.info(`From photoController: Updated AI results for photo ${id}, prediction: ${prediction}`);

        res.json({
            message: 'AI results updated successfully',
            photoId: id,
            prediction,
            confidence
        });
    } catch (error) {
        logger.error(`From photoController: Failed to update AI results for photo ${req.params.id}: ${error.message}`);
        res.status(500).json({ error: 'Failed to update AI results' });
    }
};

/**
 * Get all photos for a specific session
 * @route GET /api/photos/session/:sessionId
 */
exports.getSessionPhotos = async (req, res) => {
    try {
        const { sessionId } = req.params;
        const { limit = 100, prediction } = req.query;

        const query = { sessionId };
        if (prediction) {
            query.prediction = prediction;
        }

        const photos = await Photo.find(query)
            .sort({ uploadedAt: -1 })
            .limit(parseInt(limit))
            .populate('userId', 'firstName lastName');

        logger.info(`From photoController: Retrieved ${photos.length} photos for session ${sessionId}`);

        res.json({
            photos,
            count: photos.length,
            sessionId
        });
    } catch (error) {
        logger.error(`From photoController: Failed to get session photos: ${error.message}`);
        res.status(500).json({ error: 'Failed to retrieve session photos' });
    }
};

exports.getPhotoStats = async (req, res) => {
    try {
        const stats = await Photo.aggregate([
            {
                $group: {
                    _id: null,
                    totalPhotos: { $sum: 1 },
                    pendingPhotos: {
                        $sum: { $cond: [{ $eq: ['$aiProcessingStatus', 'pending'] }, 1, 0] }
                    },
                    processingPhotos: {
                        $sum: { $cond: [{ $eq: ['$aiProcessingStatus', 'processing'] }, 1, 0] }
                    },
                    completedPhotos: {
                        $sum: { $cond: [{ $eq: ['$aiProcessingStatus', 'completed'] }, 1, 0] }
                    },
                    failedPhotos: {
                        $sum: { $cond: [{ $eq: ['$aiProcessingStatus', 'failed'] }, 1, 0] }
                    },
                    alertPhotos: {
                        $sum: { $cond: [{ $eq: ['$prediction', 'alert'] }, 1, 0] }
                    },
                    drowsyPhotos: {
                        $sum: { $cond: [{ $eq: ['$prediction', 'drowsy'] }, 1, 0] }
                    },
                    sleepingPhotos: {
                        $sum: { $cond: [{ $eq: ['$prediction', 'sleeping'] }, 1, 0] }
                    },
                    unknownPhotos: {
                        $sum: { $cond: [{ $eq: ['$prediction', 'unknown'] }, 1, 0] }
                    },
                    avgProcessingTime: { $avg: '$aiResults.processingTime' }
                }
            }
        ]);

        const result = stats[0] || {
            totalPhotos: 0,
            pendingPhotos: 0,
            processingPhotos: 0,
            completedPhotos: 0,
            failedPhotos: 0,
            alertPhotos: 0,
            drowsyPhotos: 0,
            sleepingPhotos: 0,
            unknownPhotos: 0,
            avgProcessingTime: 0
        };

        // Calculate error rate
        const errorRate = result.totalPhotos > 0 
            ? (result.failedPhotos / result.totalPhotos) * 100 
            : 0;

        // Calculate success rate
        const successRate = result.totalPhotos > 0 
            ? (result.completedPhotos / result.totalPhotos) * 100 
            : 0;

        res.json({
            totalPhotos: result.totalPhotos,
            processingStatus: {
                pending: result.pendingPhotos,
                processing: result.processingPhotos,
                completed: result.completedPhotos,
                failed: result.failedPhotos
            },
            predictions: {
                alert: result.alertPhotos,
                drowsy: result.drowsyPhotos,
                sleeping: result.sleepingPhotos,
                unknown: result.unknownPhotos
            },
            performance: {
                avgProcessingTime: Math.round(result.avgProcessingTime || 0),
                errorRate: Math.round(errorRate * 100) / 100,
                successRate: Math.round(successRate * 100) / 100
            },
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        logger.error(`Error getting photo stats: ${error.message}`);
        res.status(500).json({ error: 'Failed to get photo statistics' });
    }
};

module.exports = {
    deleteSinglePhoto,
    deleteMultiplePhotos,
    getUnprocessedPhotos: exports.getUnprocessedPhotos,
    updatePhotoAIResults: exports.updatePhotoAIResults,
    getSessionPhotos: exports.getSessionPhotos,
    getPhotoStats: exports.getPhotoStats
};
