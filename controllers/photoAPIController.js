const { deleteSinglePhoto, deleteMultiplePhotos } = require('./photoController');

/**
 * Express controller: DELETE /api/photos/:id
 * Calls internal logic to delete one photo.
 */
async function deletePhotoById(req, res) {
    try {
        const { id } = req.params;
        await deleteSinglePhoto(id);
        res.status(200).json({ message: `Photo ${id} deleted.` });
    } catch (err) {
        console.error('Single delete failed:', err.message);
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
        return res.status(400).json({ error: 'photoIds must be a non-empty array' });
    }

    try {
        const result = await deleteMultiplePhotos(photoIds);
        res.status(200).json({ message: 'Bulk deletion complete', result });
    } catch (err) {
        console.error('Bulk delete error:', err.message);
        res.status(500).json({ error: 'Bulk deletion failed' });
    }
}

module.exports = {
    deletePhotoById,
    deletePhotosInBulk
};
