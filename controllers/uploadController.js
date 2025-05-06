const { uploadFile } = require('../services/gcpStorageService.js');
const Photo = require('../models/PhotoSchema');
const DriverSession = require('../models/DriverSession');
const logger = require('../utils/logger');

/**
 * Handles photo upload from the client
 * - Uploads photo to GCP (organized by userId/sessionId)
 * - Creates a Photo document in MongoDB
 * - Links photo to the session and updates counter
 */
async function uploadPhoto(req, res) {
    try {
        const { sessionId } = req.body;
        const userId = req.user.id;
        const file = req.file;
        const session = req.session;

        if (!file || !sessionId) {
            logger.warn(`Upload attempt missing file or sessionId. User: ${userId}`);
            return res.status(400).json({ error: 'Missing photo or sessionId' });
        }

        const { gcsPath, smartName } = await uploadFile(file, userId, sessionId);

        const photo = await Photo.create({
            sessionId,
            userId,
            gcsPath,
            name: smartName,
        });

        session.totalImagesUploaded += 1;
        session.photos.push(photo._id);
        await session.save();

        logger.info(`Photo uploaded by user ${userId} to session ${sessionId}. Photo ID: ${photo._id}`);
        res.status(201).json({ message: 'Photo uploaded', photoId: photo._id });
    } catch (err) {
        logger.error(`Photo upload failed for user ${req.user?.id}: ${err.message}`);
        res.status(500).json({ error: 'Upload failed' });
    }
}

module.exports = {
    uploadPhoto
};
