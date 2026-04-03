
const express = require('express');
const router = express.Router();
const multer = require('multer');
const allowedMimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 8 * 1024 * 1024, // 8 MB
        files: 1
    },
    fileFilter: (_req, file, cb) => {
        if (!allowedMimeTypes.has(file.mimetype)) {
            return cb(new Error('Unsupported file type'));
        }
        cb(null, true);
    }
});

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

router.use((err, _req, res, _next) => {
    if (err && err.message === 'Unsupported file type') {
        return res.status(400).json({ error: 'Unsupported file type' });
    }
    if (err && err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ error: 'File too large' });
    }
    return res.status(400).json({ error: 'Invalid upload request' });
});

// Presigned upload routes moved to presignedUploadRoutes.js to avoid conflicts

module.exports = router;
