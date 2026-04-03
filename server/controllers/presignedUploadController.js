const { generatePresignedUploadUrl } = require('../services/gcpStorageService');
const Photo = require('../models/PhotoSchema');
const DriverSession = require('../models/DriverSession');
const logger = require('../utils/logger');

function safeJsonParse(str) {
    try { return JSON.parse(str); } catch { return null; }
}

function sanitizeFileName(input) {
    const normalized = String(input || '').replace(/[^a-zA-Z0-9._-]/g, '_');
    return normalized.slice(0, 128);
}

function isValidObjectId(value) {
    return /^[a-fA-F0-9]{24}$/.test(String(value || ''));
}

function normalizeLocation(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const lat = Number(raw.latitude ?? raw.lat);
    const lng = Number(raw.longitude ?? raw.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
    return { lat, lng, accuracy: Number(raw.accuracy || 0), timestamp: Number(raw.timestamp || Date.now()) };
}

/**
 * Generate presigned URL for direct client upload to GCS
 * @route POST /api/upload/presigned
 * @access Private
 */
async function generatePresignedUrl(req, res) {
    try {
        const { fileName, sessionId, sequenceNumber, timestamp, location, clientMeta } = req.body;
        const userId = req.user.id;
        const safeFileName = sanitizeFileName(fileName);

        if (!safeFileName || !sessionId) {
            logger.warn(`Presigned URL request missing fileName or sessionId. User: ${userId}`);
            return res.status(400).json({ error: 'Missing fileName or sessionId' });
        }
        if (!isValidObjectId(sessionId)) {
            return res.status(400).json({ error: 'Invalid sessionId format' });
        }

        // Validate and load session owned by user
        const session = await DriverSession.findOne({ _id: sessionId, userId });
        if (!session) {
            logger.warn(`Presigned URL request for non-existent or unauthorized session. User: ${userId}, sessionId: ${sessionId}`);
            return res.status(404).json({ error: 'Session not found' });
        }

        // Validate file extension
        const extension = safeFileName.split('.').pop().toLowerCase();
        const allowedExtensions = ['jpg', 'jpeg', 'png', 'webp'];
        if (!allowedExtensions.includes(extension)) {
            return res.status(400).json({ error: `Unsupported file format: ${extension}` });
        }

        // Generate presigned URL
        const contentType = `image/${extension === 'jpg' ? 'jpeg' : extension}`;
        const gcsPath = `sessions/${sessionId}/photos/${safeFileName}`;
        
        console.log(`🔗 Generating presigned URL for: ${fileName}`);
        console.log(`📁 GCS Path: ${gcsPath}`);
        console.log(`📋 Content Type: ${contentType}`);
        console.log(`👤 User ID: ${userId}`);
        console.log(`📸 Session ID: ${sessionId}`);
        console.log(`🔢 Sequence Number: ${sequenceNumber}`);
        
        const presignedUrl = await generatePresignedUploadUrl(gcsPath, contentType, 60);
        
        console.log(`✅ Presigned URL generated successfully`);
        console.log(`🔗 Presigned URL: ${presignedUrl.substring(0, 100)}...`);
        
        // Normalize metadata
        const seqNum = sequenceNumber !== undefined && sequenceNumber !== null ? parseInt(sequenceNumber) : null;
        const captureTs = timestamp !== undefined && timestamp !== null ? parseInt(timestamp) : Date.now();
        const parsedLocationRaw = typeof location === 'string' ? safeJsonParse(location) : location;
        const parsedLocation = normalizeLocation(parsedLocationRaw);
        const parsedClientMeta = typeof clientMeta === 'string' ? safeJsonParse(clientMeta) : clientMeta;

        // Build response info
        const uploadInfo = {
            presignedUrl,
            gcsPath,
            fileName: safeFileName,
            contentType,
            uploadInfo: {
                sequenceNumber: seqNum,
                captureTimestamp: captureTs,
                folderType: 'before-ai'
            },
            expiresIn: 3600
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
            gcsPath,
            fileName,
            contentType,
            sequenceNumber: seqNum ?? 0,
            captureTimestamp: captureTs,
            folderType: 'before-ai',
            location: parsedLocation || undefined,
            clientMeta: parsedClientMeta || undefined,
            prediction: 'pending',
            aiProcessingStatus: 'pending',
            uploadStatus: 'pending'
        });

        // Update session statistics
        session.totalImagesUploaded = (session.totalImagesUploaded || 0) + 1;
        if (Array.isArray(session.photos)) {
            session.photos.push(photo._id);
        } else {
            session.photos = [photo._id];
        }
        await session.save();

        logger.info(`Presigned URL generated for user ${userId}, session ${sessionId}. Photo ID: ${photo._id}, GCS Path: ${uploadInfo.gcsPath}`);

        const responseData = {
            presignedUrl,
            photoId: photo._id,
            gcsPath,
            fileName,
            contentType,
            expiresIn: 3600,
            uploadInfo: uploadInfo.uploadInfo
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

        if (!photoId || !isValidObjectId(photoId)) {
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
        if (!isValidObjectId(photoId)) {
            return res.status(400).json({ error: 'Invalid photoId format' });
        }

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
