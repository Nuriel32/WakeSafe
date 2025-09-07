const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth');
const checkTokenRevoked = require('../middlewares/checkTokenRevoked');

const {
    deletePhotoById,
    deletePhotosInBulk
} = require('../controllers/photoAPIController');

const {
    getUnprocessedPhotos,
    updatePhotoAIResults,
    getSessionPhotos
} = require('../controllers/photoController');

/**
 * @route GET /api/photos/unprocessed
 * @desc Get all unprocessed photos for AI analysis
 * @access Private (AI Server)
 */
router.get('/unprocessed', auth, checkTokenRevoked, getUnprocessedPhotos);

/**
 * @route GET /api/photos/session/:sessionId
 * @desc Get all photos for a specific session
 * @access Private
 */
router.get('/session/:sessionId', auth, checkTokenRevoked, getSessionPhotos);

/**
 * @route PUT /api/photos/:id/ai-results
 * @desc Update AI analysis results for a photo
 * @access Private (AI Server)
 */
router.put('/:id/ai-results', auth, checkTokenRevoked, updatePhotoAIResults);

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
