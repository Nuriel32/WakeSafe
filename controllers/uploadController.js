const { uploadFile } = require('../services/gcpStorageService.js');
const Photo = require('../models/PhotoSchema');
const DriverSession = require('../models/DriverSession');
const logger = require('../utils/logger');

/**
 * Handles photo upload from the client with enhanced metadata for AI processing
 * - Uploads photo to GCP (organized by drivers/userId/sessions/sessionId/photos)
 * - Creates a Photo document in MongoDB with AI-ready metadata
 * - Links photo to the session and updates counter
 * - Sets processing status for AI server
 */
async function uploadPhoto(req, res) {
    try {
        const { sessionId, location, clientMeta } = req.body;
        const userId = req.user.id;
        const file = req.file;
        const session = req.session;

        if (!file || !sessionId) {
            logger.warn(`From UploadController: Upload attempt missing file or sessionId. User: ${userId}`);
            return res.status(400).json({ error: 'Missing photo or sessionId' });
        }

        // Prepare metadata for AI processing
        const metadata = {
            processingStatus: 'pending',
            location: location ? JSON.parse(location) : null,
            clientMeta: clientMeta ? JSON.parse(clientMeta) : null,
            deviceInfo: {
                userAgent: req.headers['user-agent'],
                contentType: file.mimetype,
                fileSize: file.size
            }
        };

        const { gcsPath, smartName, metadata: fileMetadata } = await uploadFile(file, userId, sessionId, metadata);

        // Create photo document with AI-ready data
        const photo = await Photo.create({
            sessionId,
            userId,
            gcsPath,
            name: smartName,
            location: metadata.location,
            clientMeta: metadata.clientMeta,
            prediction: 'pending', // Will be updated by AI server
            aiProcessingStatus: 'pending'
        });

        // Update session statistics
        session.totalImagesUploaded += 1;
        session.photos.push(photo._id);
        await session.save();

        logger.info(`From UploadController: Photo uploaded by user ${userId} to session ${sessionId}. Photo ID: ${photo._id}, GCS Path: ${gcsPath}`);
        
        res.status(201).json({ 
            message: 'Photo uploaded successfully',
            photoId: photo._id,
            gcsPath,
            processingStatus: 'pending',
            metadata: fileMetadata
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

module.exports = {
    uploadPhoto
};
