require('dotenv').config();

const { Storage } = require('@google-cloud/storage');
const crypto = require('crypto');
const path = require('path');

const bucketName = process.env.GCS_BUCKET;

if (!bucketName) {
  throw new Error(' GCS_BUCKET environment variable is missing.');
}

const storage = new Storage({
  keyFilename: path.join(__dirname, '../config/gcp-key.json'),
});

const bucket = storage.bucket(bucketName);

/**
 * Upload a photo buffer to GCS with optimized structure for AI analysis:
 * Structure: drivers/{userId}/sessions/{sessionId}/{folderType}/{timestamp}_{random}.{ext}
 * 
 * @param {Object} file - Multer file object
 * @param {string} userId - Driver's user ID
 * @param {string} sessionId - Active session ID
 * @param {Object} metadata - Additional metadata for AI processing
 * @param {string} folderType - 'before-ai' or 'after-ai'
 * @returns {Object} Upload result with paths and metadata
 */
async function uploadFile(file, userId, sessionId, metadata = {}, folderType = 'before-ai') {
  const timestamp = metadata.captureTimestamp || Date.now();
  const random = crypto.randomBytes(4).toString('hex');
  const extension = file.originalname.split('.').pop().toLowerCase();
  
  // Ensure only image formats
  const allowedExtensions = ['jpg', 'jpeg', 'png', 'webp'];
  if (!allowedExtensions.includes(extension)) {
    throw new Error(`Unsupported file format: ${extension}. Allowed: ${allowedExtensions.join(', ')}`);
  }

  // Optimized naming for AI processing with sequence number
  const sequenceNumber = metadata.sequenceNumber ? metadata.sequenceNumber.toString().padStart(6, '0') : '000000';
  const smartName = `${sequenceNumber}_${timestamp}_${random}.${extension}`;
  const gcsPath = `drivers/${userId}/sessions/${sessionId}/${folderType}/${smartName}`;

  const blob = bucket.file(gcsPath);
  
  // Set metadata for AI processing
  const fileMetadata = {
    contentType: `image/${extension === 'jpg' ? 'jpeg' : extension}`,
    metadata: {
      userId,
      sessionId,
      timestamp: timestamp.toString(),
      uploadTime: new Date().toISOString(),
      originalName: file.originalname,
      fileSize: file.size.toString(),
      ...metadata
    }
  };

  const blobStream = blob.createWriteStream({ 
    resumable: false,
    metadata: fileMetadata
  });

  return new Promise((resolve, reject) => {
    blobStream.on('finish', () => {
      resolve({
        gcsPath,
        smartName,
        publicUrl: `https://storage.googleapis.com/${bucket.name}/${blob.name}`,
        metadata: fileMetadata.metadata
      });
    }).on('error', reject).end(file.buffer);
  });
}

/**
 * Get all photos for a specific session (for AI processing)
 * @param {string} userId - Driver's user ID
 * @param {string} sessionId - Session ID
 * @returns {Array} Array of photo objects with GCS paths
 */
async function getSessionPhotos(userId, sessionId) {
  const prefix = `drivers/${userId}/sessions/${sessionId}/photos/`;
  const [files] = await bucket.getFiles({ prefix });
  
  return files.map(file => ({
    name: file.name,
    gcsPath: file.name,
    metadata: file.metadata,
    size: file.metadata.size,
    uploadedAt: file.metadata.uploadTime
  }));
}

/**
 * Get all unprocessed photos for AI analysis
 * @param {string} status - Filter by processing status
 * @returns {Array} Array of unprocessed photos
 */
async function getUnprocessedPhotos(status = 'pending') {
  const [files] = await bucket.getFiles({ prefix: 'drivers/' });
  
  return files
    .filter(file => file.metadata?.processingStatus === status)
    .map(file => ({
      name: file.name,
      gcsPath: file.name,
      userId: file.metadata.userId,
      sessionId: file.metadata.sessionId,
      metadata: file.metadata
    }));
}

/**
 * Update photo processing status for AI tracking
 * @param {string} gcsPath - GCS file path
 * @param {string} status - Processing status
 * @param {Object} aiResults - AI analysis results
 */
async function updatePhotoProcessingStatus(gcsPath, status, aiResults = {}) {
  const file = bucket.file(gcsPath);
  const [metadata] = await file.getMetadata();
  
  metadata.metadata = {
    ...metadata.metadata,
    processingStatus: status,
    processedAt: new Date().toISOString(),
    aiResults: JSON.stringify(aiResults)
  };
  
  await file.setMetadata(metadata);
}

async function getFileStream(gcsPath) {
  const file = bucket.file(gcsPath);
  return file.createReadStream();
}

async function deleteFile(gcsPath) {
  await bucket.file(gcsPath).delete();
}

async function generateSignedUrl(gcsPath) {
  const file = bucket.file(gcsPath);
  const [url] = await file.getSignedUrl({
    version: 'v4',
    action: 'read',
    expires: Date.now() + 1000 * 60 * 60
  });
  return url;
}

async function generateSignedUrls(paths) {
  return Promise.all(paths.map(generateSignedUrl));
}

module.exports = {
  uploadFile,
  getSessionPhotos,
  getUnprocessedPhotos,
  updatePhotoProcessingStatus,
  getFileStream,
  deleteFile,
  generateSignedUrl,
  generateSignedUrls
};
