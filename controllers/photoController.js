const Photo = require('../models/PhotoSchema');
const DriverSession = require('../models/DriverSession');
const { deleteFile } = require('../services/gcpStorageService');
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

module.exports = {
    deleteSinglePhoto,
    deleteMultiplePhotos
};
