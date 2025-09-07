const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth');
const checkTokenRevoked = require('../middlewares/checkTokenRevoked');
const { generatePresignedUrl, confirmUpload, getUploadStatus } = require('../controllers/presignedUploadController');

/**
 * @route POST /api/upload/presigned
 * @desc Generate presigned URL for direct client upload to GCS
 * @access Private
 */
router.post('/presigned', auth, checkTokenRevoked, generatePresignedUrl);

/**
 * @route POST /api/upload/confirm
 * @desc Confirm successful upload and trigger AI processing
 * @access Private
 */
router.post('/confirm', auth, checkTokenRevoked, confirmUpload);

/**
 * @route GET /api/upload/status/:photoId
 * @desc Get upload status for a photo
 * @access Private
 */
router.get('/status/:photoId', auth, checkTokenRevoked, getUploadStatus);

module.exports = router;
