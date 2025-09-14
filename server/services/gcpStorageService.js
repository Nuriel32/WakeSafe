const { Storage } = require('@google-cloud/storage');
const logger = require('../utils/logger');

// Lazy initialization to avoid errors when GCS_BUCKET is not set
let storage = null;
let bucket = null;

function getBucketName() {
  const name = (process.env.GCS_BUCKET || '').trim();
  if (!name) {
    throw new Error('GCS_BUCKET environment variable is not set. GCS operations are disabled.');
  }
  return name;
}

function checkGCSAvailability() {
  const bucketName = getBucketName();

  if (!storage) {
    try {
      const keyFile = process.env.GCLOUD_KEY_FILE || process.env.GOOGLE_APPLICATION_CREDENTIALS;
      const projectId = process.env.GCLOUD_PROJECT_ID;
      const storageOpts = {};
      if (keyFile) storageOpts.keyFilename = keyFile;
      if (projectId) storageOpts.projectId = projectId;
      storage = new Storage(storageOpts);
      bucket = storage.bucket(bucketName);
      logger.info(`GCS Storage initialized successfully (bucket: ${bucketName})`);
    } catch (error) {
      logger.error('Failed to initialize GCS Storage:', error);
      throw error;
    }
  }

  return { storage, bucket };
}

async function uploadFile(filePath, destinationPath, metadata = {}) {
  try {
    checkGCSAvailability();
    
    const file = bucket.file(destinationPath);
    await file.upload(filePath, {
      metadata: {
        ...metadata,
        cacheControl: 'public, max-age=31536000',
      },
    });
    
    logger.info(`File uploaded to GCS: ${destinationPath}`);
    return `gs://${process.env.GCS_BUCKET}/${destinationPath}`;
  } catch (error) {
    logger.error('GCS upload failed:', error);
    throw error;
  }
}

// Enhanced upload function for continuous photo capture
async function uploadSessionPhoto(file, userId, sessionId, metadata = {}, folderType = 'before-ai') {
  try {
    checkGCSAvailability();
    
    // Generate unique filename with timestamp and sequence number
    const timestamp = Date.now();
    const sequenceNumber = metadata.sequenceNumber || 0;
    const random = require('crypto').randomBytes(4).toString('hex');
    const extension = file.originalname?.split('.').pop() || 'jpg';
    const smartName = `photo_${sequenceNumber.toString().padStart(6, '0')}_${timestamp}_${random}.${extension}`;
    
    // Create organized folder structure: drivers/{userId}/sessions/{sessionId}/photos/{folderType}/
    const gcsPath = `drivers/${userId}/sessions/${sessionId}/photos/${folderType}/${smartName}`;
    
    const fileObj = bucket.file(gcsPath);
    
    // Upload file buffer
    await fileObj.upload(file.buffer, {
      metadata: {
        contentType: file.mimetype,
        cacheControl: 'public, max-age=31536000',
        metadata: {
          userId: userId,
          sessionId: sessionId,
          sequenceNumber: sequenceNumber.toString(),
          captureTimestamp: metadata.captureTimestamp?.toString() || timestamp.toString(),
          folderType: folderType,
          location: metadata.location ? JSON.stringify(metadata.location) : null,
          clientMeta: metadata.clientMeta ? JSON.stringify(metadata.clientMeta) : null,
          processingStatus: 'pending',
          uploadedAt: new Date().toISOString(),
        }
      },
    });
    
    logger.info(`Session photo uploaded to GCS: ${gcsPath} (sequence: ${sequenceNumber})`);
    
    return {
      gcsPath: `gs://${process.env.GCS_BUCKET}/${gcsPath}`,
      smartName,
      metadata: {
        ...metadata,
        gcsPath: `gs://${process.env.GCS_BUCKET}/${gcsPath}`,
        uploadedAt: new Date().toISOString(),
        fileSize: file.size,
        contentType: file.mimetype
      }
    };
  } catch (error) {
    logger.error('Session photo upload failed:', error);
    throw error;
  }
}

async function deleteFile(gcsPath) {
  try {
    checkGCSAvailability();
    
    const fileName = gcsPath.replace(`gs://${process.env.GCS_BUCKET}/`, '');
    const file = bucket.file(fileName);
    await file.delete();
    
    logger.info(`File deleted from GCS: ${fileName}`);
    return true;
  } catch (error) {
    logger.error('GCS delete failed:', error);
    throw error;
  }
}

async function generatePresignedUploadUrl(fileName, contentType, expiresInMinutes = 60) {
  try {
    checkGCSAvailability();
    
    const file = bucket.file(fileName);
    const [url] = await file.getSignedUrl({
      version: 'v4',
      action: 'write',
      expires: Date.now() + expiresInMinutes * 60 * 1000,
      contentType,
    });
    
    return url;
  } catch (error) {
    logger.error(`Failed to generate presigned upload URL for ${fileName}: ${error.message}`);
    throw error;
  }
}

async function generateSignedUrl(gcsPath, expiresInMinutes = 60) {
  try {
    checkGCSAvailability();
    
    const fileName = gcsPath.replace(`gs://${process.env.GCS_BUCKET}/`, '');
    const file = bucket.file(fileName);
    const [url] = await file.getSignedUrl({
      version: 'v4',
      action: 'read',
      expires: Date.now() + expiresInMinutes * 60 * 1000,
    });
    
    return url;
  } catch (error) {
    logger.error('Failed to generate signed URL:', error);
    throw error;
  }
}

async function getSessionPhotos(sessionId) {
  try {
    checkGCSAvailability();
    
    const [files] = await bucket.getFiles({
      prefix: `sessions/${sessionId}/`,
    });
    
    return files.map(file => ({
      name: file.name,
      gcsPath: `gs://${process.env.GCS_BUCKET}/${file.name}`,
      size: file.metadata.size,
      created: file.metadata.timeCreated,
    }));
  } catch (error) {
    logger.error('Failed to get session photos:', error);
    throw error;
  }
}

async function getUnprocessedPhotos() {
  try {
    checkGCSAvailability();
    
    const [files] = await bucket.getFiles({
      prefix: 'photos/',
    });
    
    // Filter for unprocessed photos (you might want to add metadata filtering here)
    return files.map(file => ({
      name: file.name,
      gcsPath: `gs://${process.env.GCS_BUCKET}/${file.name}`,
      size: file.metadata.size,
      created: file.metadata.timeCreated,
    }));
  } catch (error) {
    logger.error('Failed to get unprocessed photos:', error);
    throw error;
  }
}

async function updatePhotoProcessingStatus(gcsPath, status, results = {}) {
  try {
    checkGCSAvailability();
    
    const fileName = gcsPath.replace(`gs://${process.env.GCS_BUCKET}/`, '');
    const file = bucket.file(fileName);
    
    await file.setMetadata({
      metadata: {
        processingStatus: status,
        processingResults: JSON.stringify(results),
        processedAt: new Date().toISOString(),
      },
    });
    
    logger.info(`Photo processing status updated: ${fileName} -> ${status}`);
    return true;
  } catch (error) {
    logger.error('Failed to update photo processing status:', error);
    throw error;
  }
}

module.exports = {
  uploadFile,
  uploadSessionPhoto,
  deleteFile,
  generatePresignedUploadUrl,
  generateSignedUrl,
  getSessionPhotos,
  getUnprocessedPhotos,
  updatePhotoProcessingStatus,
};
