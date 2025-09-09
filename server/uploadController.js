const { uploadFile, generateSignedUrl } = require('./services/gcpStorageService.js');
const Photo = require('./models/PhotoSchema');
const DriverSession = require('./models/DriverSession');
const logger = require('./utils/logger');
const crypto = require('crypto');
const aiProcessingService = require('./services/aiProcessingService');

/**
 * Handles photo upload from the client with enhanced metadata for AI processing
 * - Uploads photo to GCP (organized by drivers/userId/sessions/sessionId/photos)
 * - Creates a Photo document in MongoDB with AI-ready metadata
 * - Links photo to the session and updates counter
 * - Sets processing status for AI server
 */
async function uploadPhoto(req, res) {
    try {
        const { sessionId, location, clientMeta, sequenceNumber, timestamp, folderType } = req.body;
        const userId = req.user.id;
        const file = req.file;
        const session = req.session;

        if (!file || !sessionId) {
            logger.warn(`From UploadController: Upload attempt missing file or sessionId. User: ${userId}`);
            return res.status(400).json({ error: 'Missing photo or sessionId' });
        }

        // Determine folder type (before-ai or after-ai)
        const photoFolderType = folderType || 'before-ai';

        // Prepare metadata for AI processing
        const metadata = {
            processingStatus: 'pending',
            location: location ? JSON.parse(location) : null,
            clientMeta: clientMeta ? JSON.parse(clientMeta) : null,
            sequenceNumber: sequenceNumber ? parseInt(sequenceNumber) : null,
            captureTimestamp: timestamp ? parseInt(timestamp) : Date.now(),
            folderType: photoFolderType,
            deviceInfo: {
                userAgent: req.headers['user-agent'],
                contentType: file.mimetype,
                fileSize: file.size
            }
        };

        const { gcsPath, smartName, metadata: fileMetadata } = await uploadFile(file, userId, sessionId, metadata, photoFolderType);

        // Create photo document with AI-ready data
        const photo = await Photo.create({
            sessionId,
            userId,
            gcsPath,
            name: smartName,
            location: metadata.location,
            clientMeta: metadata.clientMeta,
            sequenceNumber: metadata.sequenceNumber,
            captureTimestamp: metadata.captureTimestamp,
            folderType: photoFolderType,
            prediction: 'pending', // Will be updated by AI server
            aiProcessingStatus: 'pending'
        });

        // Update session statistics
        session.totalImagesUploaded += 1;
        session.photos.push(photo._id);
        await session.save();

        // Generate signed URL for AI processing
        const signedUrl = await generateSignedUrl(gcsPath, 3600); // 1 hour expiry

        // Queue photo for AI processing
        aiProcessingService.queuePhotoForProcessing(photo, signedUrl);

        logger.info(`From UploadController: Photo uploaded by user ${userId} to session ${sessionId}. Photo ID: ${photo._id}, GCS Path: ${gcsPath}`);
        
        res.status(201).json({ 
            message: 'Photo uploaded successfully',
            photoId: photo._id,
            gcsPath,
            processingStatus: 'pending',
            metadata: fileMetadata,
            sequenceNumber: metadata.sequenceNumber
        });
    } catch (err) {
        logger.error(`From UploadController: Photo upload failed for user ${req.user?.id}: ${err.message}`);
        
        // Handle specific errors
        if (err.message.includes('Unsupported file format')) {
            return res.status(400).json({ error: err.message });
        }
        
        res.status(500).json({ error: 'Upload failed' });
    }
}

/**
 * Get presigned URL for direct cloud upload
 * - Generates a presigned URL for direct upload to GCP
 * - Creates a Photo document in MongoDB with pending status
 * - Returns the presigned URL and photo metadata
 */
async function getPresignedUrl(req, res) {
    try {
        const { fileName, sessionId, metadata } = req.body;
        const userId = req.user.id;
        const session = req.session;

        if (!fileName || !sessionId) {
            logger.warn(`From UploadController: Presigned URL request missing fileName or sessionId. User: ${userId}`);
            return res.status(400).json({ error: 'Missing fileName or sessionId' });
        }

        // Validate file extension
        const extension = fileName.split('.').pop().toLowerCase();
        const allowedExtensions = ['jpg', 'jpeg', 'png', 'webp'];
        if (!allowedExtensions.includes(extension)) {
            return res.status(400).json({ error: `Unsupported file format: ${extension}` });
        }

        // Generate unique filename
        const timestamp = Date.now();
        const random = crypto.randomBytes(4).toString('hex');
        const smartName = `${timestamp}_${random}.${extension}`;
        const gcsPath = `drivers/${userId}/sessions/${sessionId}/photos/${smartName}`;

        // Generate presigned URL
        const presignedUrl = await generateSignedUrl(gcsPath);

        // Create photo document with pending status
        const photo = await Photo.create({
            sessionId,
            userId,
            gcsPath,
            name: smartName,
            location: metadata?.location || null,
            clientMeta: metadata?.clientMeta || null,
            prediction: 'pending',
            aiProcessingStatus: 'pending',
            uploadStatus: 'pending' // New field to track upload status
        });

        // Update session statistics
        session.totalImagesUploaded += 1;
        session.photos.push(photo._id);
        await session.save();

        logger.info(`From UploadController: Presigned URL generated for user ${userId}, session ${sessionId}. Photo ID: ${photo._id}, GCS Path: ${gcsPath}`);

        res.json({
            presignedUrl,
            photoId: photo._id,
            gcsPath,
            fileName: smartName,
            expiresIn: 3600 // 1 hour
        });

    } catch (err) {
        logger.error(`From UploadController: Presigned URL generation failed for user ${req.user?.id}: ${err.message}`);
        res.status(500).json({ error: 'Failed to generate presigned URL' });
    }
}

module.exports = {
    uploadPhoto,
    getPresignedUrl
};
