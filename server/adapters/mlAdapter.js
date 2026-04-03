const { get, post } = require('./httpClient');

const AI_SERVER_URL = process.env.AI_SERVER_URL || 'http://localhost:8081';
const ML1_SERVICE_URL = process.env.ML1_SERVICE_URL || 'http://localhost:8001';
const ML2_SERVICE_URL = process.env.ML2_SERVICE_URL || 'http://localhost:8002';

const defaultRetry = {
  maxRetries: parseInt(process.env.ML_CALL_MAX_RETRIES || '2', 10),
  baseDelayMs: parseInt(process.env.ML_CALL_RETRY_BASE_MS || '400', 10),
};

async function ml1Predict(payload) {
  return post(`${ML1_SERVICE_URL}/predict`, payload, {}, { ...defaultRetry, service: 'ml1' });
}

async function ml2Analyze(payload) {
  return post(`${ML2_SERVICE_URL}/analyze`, payload, {}, { ...defaultRetry, service: 'ml2' });
}

async function aiProcessPhoto(payload) {
  return post(`${AI_SERVER_URL}/api/process-photo`, payload, {}, { ...defaultRetry, service: 'ai_server' });
}

async function aiStatus(photoId) {
  return get(`${AI_SERVER_URL}/api/status/${photoId}`, {}, { ...defaultRetry, service: 'ai_server' });
}

async function aiHealth() {
  try {
    await get(`${AI_SERVER_URL}/health`, {}, { ...defaultRetry, service: 'ai_server' });
    return true;
  } catch {
    return false;
  }
}

module.exports = {
  ml1Predict,
  ml2Analyze,
  aiProcessPhoto,
  aiStatus,
  aiHealth,
};
