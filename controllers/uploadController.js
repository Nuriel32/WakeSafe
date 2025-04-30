// ======================= CONTROLLER: controllers/uploadController.js =======================

const { uploadFile } = require('../services/gcpStorage');
const Photo = require('../models/Photo');
const DriverSession = require('../models/DriverSession');

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

        res.status(201).json({ message: 'Photo uploaded', photoId: photo._id });
    } catch (err) {
        console.error('Upload failed:', err);
        res.status(500).json({ error: 'Upload failed' });
    }
}

module.exports = {
    uploadPhoto
};
