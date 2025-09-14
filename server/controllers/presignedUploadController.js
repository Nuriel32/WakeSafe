const { generatePresignedUploadUrl } = require('../services/gcpStorageService');
const Photo = require('../models/PhotoSchema');
const DriverSession = require('../models/DriverSession');
const logger = require('../utils/logger');

/**
 * Generate presigned URL for direct client upload to GCS
 * @route POST /api/upload/presigned
 * @access Private
 */
async function generatePresignedUrl(req, res) {
    try {
        const { fileName, sessionId, sequenceNumber, timestamp, location, clientMeta } = req.body;
        const userId = req.user.id;
        const session = req.session;

        if (!fileName || !sessionId) {
            logger.warn(`Presigned URL request missing fileName or sessionId. User: ${userId}`);
            return res.status(400).json({ error: 'Missing fileName or sessionId' });
        }

        // Validate file extension
        const extension = fileName.split('.').pop().toLowerCase();
        const allowedExtensions = ['jpg', 'jpeg', 'png', 'webp'];
        if (!allowedExtensions.includes(extension)) {
            return res.status(400).json({ error: `Unsupported file format: ${extension}` });
        }

        // Generate presigned URL
        const contentType = `image/${extension === 'jpg' ? 'jpeg' : extension}`;
        const gcsPath = `sessions/${sessionId}/photos/${fileName}`;
        
        console.log(`🔗 Generating presigned URL for: ${fileName}`);
        console.log(`📁 GCS Path: ${gcsPath}`);
        console.log(`📋 Content Type: ${contentType}`);
        console.log(`👤 User ID: ${userId}`);
        console.log(`📸 Session ID: ${sessionId}`);
        console.log(`🔢 Sequence Number: ${sequenceNumber}`);
        
        const presignedUrl = await generatePresignedUploadUrl(gcsPath, contentType, 60);
        
        console.log(`✅ Presigned URL generated successfully`);
        console.log(`🔗 Presigned URL: ${presignedUrl.substring(0, 100)}...`);
        
        // Create upload info object
        const uploadInfo = {
            presignedUrl,
            photoId: `photo_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
            gcsPath,
            fileName,
            contentType,
            uploadInfo: {
                sequenceNumber: sequenceNumber ? parseInt(sequenceNumber) : null,
                captureTimestamp: timestamp ? parseInt(timestamp) : Date.now(),
                folderType: 'before-ai'
            },
            expiresIn: 60
        };
        
        console.log(`📦 Upload info created:`, {
            photoId: uploadInfo.photoId,
            fileName: uploadInfo.fileName,
            gcsPath: uploadInfo.gcsPath,
            sequenceNumber: uploadInfo.uploadInfo.sequenceNumber
        });

        // Create photo document with pending status
        const photo = await Photo.create({
            sessionId,
            userId,
            gcsPath: uploadInfo.gcsPath,
            name: uploadInfo.fileName,
            sequenceNumber: uploadInfo.metadata.sequenceNumber,
            captureTimestamp: uploadInfo.metadata.captureTimestamp,
            folderType: 'before-ai',
            location: uploadInfo.metadata.location,
            clientMeta: uploadInfo.metadata.clientMeta,
            prediction: 'pending',
            aiProcessingStatus: 'pending',
            uploadStatus: 'pending'
        });

        // Update session statistics
        session.totalImagesUploaded += 1;
        session.photos.push(photo._id);
        await session.save();

        logger.info(`Presigned URL generated for user ${userId}, session ${sessionId}. Photo ID: ${photo._id}, GCS Path: ${uploadInfo.gcsPath}`);

        const responseData = {
            presignedUrl: uploadInfo.presignedUrl,
            photoId: photo._id,
            gcsPath: uploadInfo.gcsPath,
            fileName: uploadInfo.fileName,
            contentType: uploadInfo.contentType,
            expiresIn: 3600, // 1 hour
            uploadInfo: {
                sequenceNumber: uploadInfo.uploadInfo.sequenceNumber,
                captureTimestamp: uploadInfo.uploadInfo.captureTimestamp,
                folderType: uploadInfo.uploadInfo.folderType
            }
        };

        console.log(`📤 Sending presigned URL response to client:`, {
            photoId: responseData.photoId,
            fileName: responseData.fileName,
            gcsPath: responseData.gcsPath,
            expiresIn: responseData.expiresIn,
            sequenceNumber: responseData.uploadInfo.sequenceNumber
        });

        res.json(responseData);

    } catch (err) {
        logger.error(`Presigned URL generation failed for user ${req.user?.id}: ${err.message}`);
        res.status(500).json({ error: 'Failed to generate presigned URL' });
    }
}

/**
 * Confirm successful upload and trigger AI processing
 * @route POST /api/upload/confirm
 * @access Private
 */
async function confirmUpload(req, res) {
    try {
        const { photoId, uploadSuccess } = req.body;
        const userId = req.user.id;

        console.log(`📥 Received upload confirmation:`, {
            photoId,
            uploadSuccess,
            userId
        });

        if (!photoId) {
            return res.status(400).json({ error: 'Missing photoId' });
        }

        // Find the photo
        const photo = await Photo.findOne({ _id: photoId, userId });
        if (!photo) {
            console.log(`❌ Photo not found: ${photoId} for user ${userId}`);
            return res.status(404).json({ error: 'Photo not found' });
        }

        console.log(`📸 Found photo:`, {
            photoId: photo._id,
            fileName: photo.name,
            gcsPath: photo.gcsPath,
            uploadStatus: photo.uploadStatus
        });

        if (uploadSuccess) {
            // Update photo status to uploaded
            photo.uploadStatus = 'uploaded';
            photo.uploadedAt = new Date();
            await photo.save();

            // Trigger AI processing
            const aiProcessingService = require('../services/aiProcessingService');
            const signedUrl = await require('../services/gcpStorageService').generateSignedUrl(photo.gcsPath, 3600);
            await aiProcessingService.queuePhotoForProcessing(photo, signedUrl);

            logger.info(`Upload confirmed for photo ${photoId}. AI processing queued.`);

            res.json({
                message: 'Upload confirmed successfully',
                photoId: photo._id,
                aiProcessingQueued: true,
                gcsPath: photo.gcsPath
            });
        } else {
            // Upload failed, mark as failed
            photo.uploadStatus = 'failed';
            await photo.save();

            logger.warn(`Upload failed for photo ${photoId}`);

            res.json({
                message: 'Upload marked as failed',
                photoId: photo._id,
                uploadStatus: 'failed'
            });
        }

    } catch (err) {
        logger.error(`Upload confirmation failed for user ${req.user?.id}: ${err.message}`);
        res.status(500).json({ error: 'Failed to confirm upload' });
    }
}

/**
 * Get upload status for a photo
 * @route GET /api/upload/status/:photoId
 * @access Private
 */
async function getUploadStatus(req, res) {
    try {
        const { photoId } = req.params;
        const userId = req.user.id;

        const photo = await Photo.findOne({ _id: photoId, userId });
        if (!photo) {
            return res.status(404).json({ error: 'Photo not found' });
        }

        res.json({
            photoId: photo._id,
            uploadStatus: photo.uploadStatus,
            aiProcessingStatus: photo.aiProcessingStatus,
            prediction: photo.prediction,
            uploadedAt: photo.uploadedAt,
            gcsPath: photo.gcsPath
        });

    } catch (err) {
        logger.error(`Failed to get upload status for photo ${req.params.photoId}: ${err.message}`);
        res.status(500).json({ error: 'Failed to get upload status' });
    }
}

module.exports = {
    generatePresignedUrl,
    confirmUpload,
    getUploadStatus
};
