
const express = require('express');
const router = express.Router();
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });

const auth = require('../middlewares/auth');
const checkTokenRevoked = require('../middlewares/checkTokenRevoked');
const validateSessionViaCache = require('../middlewares/validateSessionViaCache');
const { uploadPhoto } = require('../controllers/uploadController');

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

// Presigned upload routes moved to presignedUploadRoutes.js to avoid conflicts

module.exports = router;
