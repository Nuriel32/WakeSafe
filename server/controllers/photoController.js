const Photo = require('../models/PhotoSchema');
const DriverSession = require('../models/DriverSession');
const {
    deleteFile,
    generateSignedUrl,
    getUnprocessedPhotos: getGCSUnprocessedPhotos,
    updatePhotoProcessingStatus
} = require('../services/gcpStorageService');
const logger = require('../utils/logger');
const cache = require('../services/cacheService');

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

async function enrichPhotosWithFileUrl(photos = []) {
    return Promise.all(
        photos.map(async (photo) => {
            let fileUrl = photo.gcsPath;
            try {
                fileUrl = await generateSignedUrl(photo.gcsPath, 60);
            } catch (error) {
                logger.warn(`From photoController: Failed to generate signed URL for photo ${photo._id}: ${error.message}`);
            }

            return {
                ...photo,
                fileUrl
            };
        })
    );
}

/**
 * Get all unprocessed photos for AI analysis
 * @route GET /api/photos/unprocessed
 */
exports.getUnprocessedPhotos = async (req, res) => {
    try {
        const limit = Math.min(parseInt(req.query.limit || '50', 10), 200);
        const status = req.query.status || 'pending';
        const includeGcsMetadata = String(req.query.includeGcsMetadata || 'false') === 'true';
        const cacheKey = `photos_unprocessed:${status}:${limit}:${includeGcsMetadata}`;

        const cached = await cache.get(cacheKey);
        if (cached) {
            return res.json(cached);
        }
        
        // Get photos from MongoDB
        const photos = await Photo.find({ 
            aiProcessingStatus: status 
        })
        .sort({ uploadedAt: 1 })
        .limit(limit)
        .select('sessionId userId gcsPath uploadedAt sequenceNumber captureTimestamp prediction aiProcessingStatus aiResults')
        .populate('sessionId', 'startTime endTime isActive')
        .populate('userId', 'firstName lastName email')
        .lean();

        let gcsMap = new Map();
        if (includeGcsMetadata) {
            const gcsPhotos = await getGCSUnprocessedPhotos();
            gcsMap = new Map(gcsPhotos.map(p => [p.gcsPath, p]));
        }

        // Combine MongoDB and GCS data
        const enrichedPhotos = photos.map(photo => {
            const gcsData = gcsMap.get(photo.gcsPath);
            return {
                ...photo,
                gcsUrl: `https://storage.googleapis.com/${process.env.GCS_BUCKET}/${photo.gcsPath}`,
                gcsMetadata: gcsData?.metadata || {}
            };
        });

        logger.info(`From photoController: Retrieved ${enrichedPhotos.length} unprocessed photos for AI analysis`);
        
        const payload = {
            photos: enrichedPhotos,
            count: enrichedPhotos.length,
            status
        };
        await cache.set(cacheKey, payload, 20);
        res.json(payload);
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
        const limit = Math.min(parseInt(req.query.limit || '100', 10), 300);
        const { prediction } = req.query;
        const cacheKey = `session_photos:${sessionId}:${prediction || 'all'}:${limit}`;
        const cached = await cache.get(cacheKey);
        if (cached) {
            return res.json(cached);
        }

        const query = { sessionId };
        if (prediction) {
            query.prediction = prediction;
        }

        const photos = await Photo.find(query)
            .sort({ uploadedAt: -1 })
            .limit(limit)
            .select('sessionId userId gcsPath uploadedAt createdAt prediction aiProcessingStatus aiResults location')
            .populate('userId', 'firstName lastName')
            .lean();

        const enrichedPhotos = await enrichPhotosWithFileUrl(photos);

        logger.info(`From photoController: Retrieved ${enrichedPhotos.length} photos for session ${sessionId}`);

        const payload = {
            photos: enrichedPhotos,
            count: enrichedPhotos.length,
            sessionId
        };
        await cache.set(cacheKey, payload, 15);
        res.json(payload);
    } catch (error) {
        logger.error(`From photoController: Failed to get session photos: ${error.message}`);
        res.status(500).json({ error: 'Failed to retrieve session photos' });
    }
};

/**
 * Get gallery rides that contain sleeping photos only
 * @route GET /api/photos/gallery/sleeping-rides
 */
exports.getSleepingGalleryByRide = async (req, res) => {
    try {
        const userId = req.user.id;
        const maxRides = Math.min(parseInt(req.query.maxRides || '20', 10), 100);
        const maxPhotosPerRide = Math.min(parseInt(req.query.maxPhotosPerRide || '20', 10), 100);
        const cacheKey = `sleeping_gallery:${userId}:${maxRides}:${maxPhotosPerRide}`;

        const cached = await cache.get(cacheKey);
        if (cached) {
            return res.json(cached);
        }

        const sleepingPhotos = await Photo.find({
            userId,
            prediction: 'sleeping',
            aiProcessingStatus: 'completed'
        })
            .sort({ uploadedAt: -1 })
            .select('sessionId userId gcsPath uploadedAt createdAt prediction aiProcessingStatus aiResults location')
            .lean();

        const bySession = new Map();
        for (const photo of sleepingPhotos) {
            const key = String(photo.sessionId);
            if (!bySession.has(key)) {
                bySession.set(key, []);
            }
            bySession.get(key).push(photo);
        }

        const sessionIds = Array.from(bySession.keys()).slice(0, maxRides);
        if (sessionIds.length === 0) {
            const emptyPayload = {
                rides: [],
                count: 0,
                totalSleepingPhotos: 0
            };
            await cache.set(cacheKey, emptyPayload, 15);
            return res.json(emptyPayload);
        }

        const sessions = await DriverSession.find({ _id: { $in: sessionIds } })
            .select('_id sessionId startTime endTime status isActive createdAt updatedAt')
            .lean();
        const sessionMap = new Map(sessions.map((session) => [String(session._id), session]));

        const rides = [];
        for (const sessionId of sessionIds) {
            const photos = bySession.get(sessionId) || [];
            const limitedPhotos = photos.slice(0, maxPhotosPerRide);
            const enrichedPhotos = await enrichPhotosWithFileUrl(limitedPhotos);
            rides.push({
                ride: sessionMap.get(sessionId) || { _id: sessionId },
                sleepingPhotoCount: photos.length,
                photos: enrichedPhotos
            });
        }

        const payload = {
            rides,
            count: rides.length,
            totalSleepingPhotos: rides.reduce((acc, ride) => acc + ride.sleepingPhotoCount, 0)
        };
        await cache.set(cacheKey, payload, 15);
        res.json(payload);
    } catch (error) {
        logger.error(`From photoController: Failed to build sleeping gallery: ${error.message}`);
        res.status(500).json({ error: 'Failed to retrieve sleeping gallery' });
    }
};

exports.getPhotoStats = async (req, res) => {
    try {
        const cacheKey = 'photo_stats:global';
        const cached = await cache.get(cacheKey);
        if (cached) {
            return res.json(cached);
        }
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

        const payload = {
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
        };
        await cache.set(cacheKey, payload, 30);
        res.json(payload);

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
    getSleepingGalleryByRide: exports.getSleepingGalleryByRide,
    getPhotoStats: exports.getPhotoStats
};
