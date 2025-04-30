const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth');
const checkTokenRevoked = require('../middlewares/checkTokenRevoked');

const {
    deletePhotoById,
    deletePhotosInBulk
} = require('../controllers/photoApiController');

/**
 * @route DELETE /api/photos/:id
 * @desc Delete a single photo by ID
 * @access Private
 */
router.delete('/:id', auth, checkTokenRevoked, deletePhotoById);

/**
 * @route DELETE /api/photos
 * @desc Delete multiple photos by IDs in body
 * @access Private
 * @body { photoIds: [ObjectId, ObjectId, ...] }
 */
router.delete('/', auth, checkTokenRevoked, deletePhotosInBulk);

module.exports = router;
