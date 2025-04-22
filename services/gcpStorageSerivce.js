const { Storage } = require('@google-cloud/storage');

const storage = new Storage({ keyFilename: 'gcp-service-account.json' });
const bucket = storage.bucket('your-bucket-name');

exports.uploadImage = async (base64, filename) => {
  const buffer = Buffer.from(base64, 'base64');
  const file = bucket.file(filename);
  await file.save(buffer, { metadata: { contentType: 'image/jpeg' } });
  return `https://storage.googleapis.com/${bucket.name}/${filename}`;
};

exports.deleteFileFromGCP = async (filename) => {
  await bucket.file(filename).delete();
};
