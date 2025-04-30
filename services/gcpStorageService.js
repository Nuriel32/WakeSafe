const { Storage } = require('@google-cloud/storage');
const crypto = require('crypto');

const storage = new Storage();
const bucketName = process.env.GCS_BUCKET;
const bucket = storage.bucket(bucketName);

/**
 * Upload a photo buffer to GCS with smart structure:
 * userId/sessionId/photo_<timestamp>_<random>.ext
 */
async function uploadFile(file, userId, sessionId) {
  const timestamp = Date.now();
  const random = crypto.randomBytes(4).toString('hex');
  const extension = file.originalname.split('.').pop();
  const smartName = `photo_${timestamp}_${random}.${extension}`;
  const gcsPath = `${userId}/${sessionId}/${smartName}`;

  const blob = bucket.file(gcsPath);
  const blobStream = blob.createWriteStream({ resumable: false });

  return new Promise((resolve, reject) => {
    blobStream.on('finish', () => {
      resolve({
        gcsPath, // Return GCS internal path
        smartName,
        publicUrl: `https://storage.googleapis.com/${bucket.name}/${blob.name}`
      });
    }).on('error', reject).end(file.buffer);
  });
}

/**
 * Return a readable stream for a file in the bucket
 */
async function getFileStream(gcsPath) {
  const file = bucket.file(gcsPath);
  return file.createReadStream();
}

/**
 * Delete a file from GCS by path
 */
async function deleteFile(gcsPath) {
  await bucket.file(gcsPath).delete();
}

/**
 * Generate a signed URL for downloading a file
 */
async function generateSignedUrl(gcsPath) {
  const file = bucket.file(gcsPath);
  const [url] = await file.getSignedUrl({
    version: 'v4',
    action: 'read',
    expires: Date.now() + 1000 * 60 * 60 // 1 hour
  });
  return url;
}

/**
 * Generate signed URLs for multiple GCS paths
 */
async function generateSignedUrls(paths) {
  const signedUrls = [];
  for (const path of paths) {
    const url = await generateSignedUrl(path);
    signedUrls.push(url);
  }
  return signedUrls;
}

module.exports = {
  uploadFile,
  getFileStream,
  deleteFile,
  generateSignedUrl,
  generateSignedUrls
};
