const { Storage } = require('@google-cloud/storage');
const logger = require('../utils/logger');
const fs = require('fs');
const path = require('path');

// Lazy initialization to avoid errors when GCS_BUCKET is not set
let storage = null;
let bucket = null;
const LOCAL_UPLOAD_ROOT = process.env.LOCAL_UPLOAD_DIR || path.join(__dirname, '..', 'uploads');

function isLocalStorage() {
  return (process.env.STORAGE_PROVIDER || '').toLowerCase() === 'local'
    || (process.env.ENV_PROFILE || '').toLowerCase() === 'local';
}

function getLocalBaseUrl() {
  return process.env.LOCAL_UPLOAD_BASE_URL || `http://127.0.0.1:${process.env.PORT || 5000}`;
}

function ensureLocalDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function normalizeStoragePath(storagePath = '') {
  if (storagePath.startsWith('local://')) {
    return storagePath.replace('local://', '');
  }
  if (storagePath.startsWith('gs://')) {
    const bucketName = process.env.GCS_BUCKET;
    if (bucketName && storagePath.startsWith(`gs://${bucketName}/`)) {
      return storagePath.replace(`gs://${bucketName}/`, '');
    }
  }
  return storagePath;
}

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
    if (isLocalStorage()) {
      const relativePath = destinationPath.replace(/^[/\\]+/, '');
      const absoluteDest = path.join(LOCAL_UPLOAD_ROOT, relativePath);
      ensureLocalDir(path.dirname(absoluteDest));
      fs.copyFileSync(filePath, absoluteDest);
      logger.info(`File uploaded to local storage: ${absoluteDest}`);
      return `local://${relativePath}`;
    }
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
    // Generate unique filename with timestamp and sequence number
    const timestamp = Date.now();
    const sequenceNumber = metadata.sequenceNumber || 0;
    const random = require('crypto').randomBytes(4).toString('hex');
    const extension = file.originalname?.split('.').pop() || 'jpg';
    const smartName = `photo_${sequenceNumber.toString().padStart(6, '0')}_${timestamp}_${random}.${extension}`;
    
    // Create organized folder structure: drivers/{userId}/sessions/{sessionId}/photos/{folderType}/
    const storagePath = `drivers/${userId}/sessions/${sessionId}/photos/${folderType}/${smartName}`;

    if (isLocalStorage()) {
      const absoluteDest = path.join(LOCAL_UPLOAD_ROOT, storagePath);
      ensureLocalDir(path.dirname(absoluteDest));
      fs.writeFileSync(absoluteDest, file.buffer);

      logger.info(`Session photo uploaded to local storage: ${absoluteDest} (sequence: ${sequenceNumber})`);

      return {
        gcsPath: `local://${storagePath}`,
        smartName,
        metadata: {
          ...metadata,
          gcsPath: `local://${storagePath}`,
          uploadedAt: new Date().toISOString(),
          fileSize: file.size,
          contentType: file.mimetype
        }
      };
    }

    checkGCSAvailability();
    const fileObj = bucket.file(storagePath);
    
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
    
    logger.info(`Session photo uploaded to GCS: ${storagePath} (sequence: ${sequenceNumber})`);
    
    return {
      gcsPath: `gs://${process.env.GCS_BUCKET}/${storagePath}`,
      smartName,
      metadata: {
        ...metadata,
        gcsPath: `gs://${process.env.GCS_BUCKET}/${storagePath}`,
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
    if (isLocalStorage()) {
      const relativePath = normalizeStoragePath(gcsPath);
      const absolutePath = path.join(LOCAL_UPLOAD_ROOT, relativePath);
      if (fs.existsSync(absolutePath)) {
        fs.unlinkSync(absolutePath);
      }
      logger.info(`File deleted from local storage: ${absolutePath}`);
      return true;
    }
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
    if (isLocalStorage()) {
      throw new Error('Presigned upload URLs are disabled in local storage mode. Use /api/upload multipart endpoint.');
    }
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
    if (isLocalStorage()) {
      const relativePath = normalizeStoragePath(gcsPath);
      const encoded = relativePath.split('/').map(encodeURIComponent).join('/');
      return `${getLocalBaseUrl()}/local-uploads/${encoded}`;
    }
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
    if (isLocalStorage()) {
      const root = path.join(LOCAL_UPLOAD_ROOT, 'drivers');
      if (!fs.existsSync(root)) return [];
      // Keep behavior simple in local mode; DB remains source of truth.
      return [];
    }
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
    if (isLocalStorage()) {
      return [];
    }
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
    if (isLocalStorage()) {
      logger.info(`Local storage status update skipped for ${gcsPath} -> ${status}`);
      return true;
    }
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
