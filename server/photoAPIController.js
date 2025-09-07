const { deleteSinglePhoto, deleteMultiplePhotos } = require('./photoController');
const logger = require('../utils/logger');

/**
 * Express controller: DELETE /api/photos/:id
 * Calls internal logic to delete one photo.
 */
async function deletePhotoById(req, res) {
    try {
        const { id } = req.params;
        await deleteSinglePhoto(id);
        logger.info(`From photoAPIController: Photo ${id} deleted by user ${req.user.id}`);
        res.status(200).json({ message: `Photo ${id} deleted.` });
    } catch (err) {
        logger.error(`Failed to delete photo ${req.params.id}: ${err.message}`);
        res.status(400).json({ error: err.message });
    }
}

/**
 * Express controller: DELETE /api/photos
 * Deletes multiple photos by ID array passed in the request body.
 */
async function deletePhotosInBulk(req, res) {
    const { photoIds } = req.body;

    if (!Array.isArray(photoIds) || photoIds.length === 0) {
        logger.warn(`From photoAPIController: Bulk delete attempt with invalid photoIds by user ${req.user.id}`);
        return res.status(400).json({ error: 'photoIds must be a non-empty array' });
    }

    try {
        const result = await deleteMultiplePhotos(photoIds);
        logger.info(`From photoAPIController: Bulk photo deletion by user ${req.user.id}. Success: ${result.deleted}, Errors: ${result.errors}`);
        res.status(200).json({ message: 'Bulk deletion complete', result });
    } catch (err) {
        logger.error(`From photoAPIController: Bulk delete failed for user ${req.user.id}: ${err.message}`);
        res.status(500).json({ error: 'Bulk deletion failed' });
    }
}

module.exports = {
    deletePhotoById,
    deletePhotosInBulk
};
