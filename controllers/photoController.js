const Photo = require('../models/PhotoSchema');
const DriverSession = require('../models/DriverSession');
const { deleteFile } = require('../services/gcpStorageService');

/**
 * Internal logic: deletes a single photo from GCS, MongoDB, and session reference.
 */
async function deleteSinglePhoto(photoId) {
    const photo = await Photo.findById(photoId);
    if (!photo) throw new Error('Photo not found');

    const session = await DriverSession.findById(photo.sessionId);
    if (!session) throw new Error('Associated session not found');

    await deleteFile(photo.gcsPath);

    session.photos.pull(photo._id);
    session.totalImagesUploaded = Math.max(0, session.totalImagesUploaded - 1);
    await session.save();

    await Photo.deleteOne({ _id: photo._id });

    return true;
}

/**
 * Internal logic: deletes multiple photos by calling deleteSinglePhoto
 */
async function deleteMultiplePhotos(photoIds = []) {
    let deleted = 0;
    let errors = 0;

    for (const photoId of photoIds) {
        try {
            await deleteSinglePhoto(photoId);
            deleted++;
        } catch (err) {
            console.error(`Failed to delete photo ${photoId}:`, err.message);
            errors++;
        }
    }

    return { deleted, errors };
}

module.exports = {
    deleteSinglePhoto,
    deleteMultiplePhotos
};