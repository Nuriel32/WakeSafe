
const express = require('express');
const router = express.Router();
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });

const auth = require('../middlewares/auth');
const checkTokenRevoked = require('../middlewares/checkTokenRevoked');
const validateSessionViaCache = require('../middlewares/validateSessionViaCache');
const { uploadPhoto, getPresignedUrl, confirmUpload } = require('../controllers/uploadController');

/**
 * @route POST /api/upload
 * @desc Upload a photo (file + sessionId)
 * @access Private
 */
router.post(
    '/',
    auth,
    checkTokenRevoked,
    upload.single('photo'),
    validateSessionViaCache,
    uploadPhoto
);

/**
 * @route POST /api/upload/presigned
 * @desc Get presigned URL for direct cloud upload
 * @access Private
 */
router.post(
    '/presigned',
    auth,
    checkTokenRevoked,
    validateSessionViaCache,
    getPresignedUrl
);

/**
 * @route POST /api/upload/confirm
 * @desc Confirm upload completion and queue for AI processing
 * @access Private
 */
router.post(
    '/confirm',
    auth,
    checkTokenRevoked,
    confirmUpload
);

module.exports = router;
