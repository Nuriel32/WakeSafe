require('dotenv').config(); // ✅ קודם כל טען את המשתנים מהסביבה

const { Storage } = require('@google-cloud/storage');
const crypto = require('crypto');
const path = require('path');

const bucketName = process.env.GCS_BUCKET;

if (!bucketName) {
  throw new Error('❌ GCS_BUCKET environment variable is missing.');
}

const storage = new Storage({
  keyFilename: path.join(__dirname, '../config/gcp-key.json'), // אם צריך credentials ידניים
});

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
        gcsPath,
        smartName,
        publicUrl: `https://storage.googleapis.com/${bucket.name}/${blob.name}`
      });
    }).on('error', reject).end(file.buffer);
  });
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
  getFileStream,
  deleteFile,
  generateSignedUrl,
  generateSignedUrls
};
