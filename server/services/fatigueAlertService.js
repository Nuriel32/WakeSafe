const DriverSession = require('../models/DriverSession');
const FatigueLog = require('../models/FatigueLog');
const Photo = require('../models/PhotoSchema');
const googleMapService = require('./googleMapService');
const cache = require('./cacheService');
const monitoring = require('./monitoringService');
const logger = require('../utils/logger');
const { randomUUID } = require('crypto');

const alertStateCache = new Map();
const DEFAULT_COOLDOWN_MS = Number(process.env.FATIGUE_ALERT_COOLDOWN_MS || 45000);
const MIN_CONFIDENCE = Number(process.env.FATIGUE_ALERT_MIN_CONFIDENCE || 0.6);
const MIN_LEVEL = Number(process.env.FATIGUE_ALERT_MIN_LEVEL || 0.6);
const SAFE_STOP_RECOMMENDATION_COOLDOWN_MS = Number(process.env.SAFE_STOP_RECOMMENDATION_COOLDOWN_MS || 120000);

function normalizeDetectionPayload(payload = {}) {
  return {
    userId: payload.userId || payload.user_id || null,
    sessionId: payload.sessionId || payload.session_id || payload.tripId || payload.trip_id || null,
    detectionTimestamp: payload.detectionTimestamp || payload.detection_timestamp || new Date().toISOString(),
    fatigueLevel: Number(payload.fatigueLevel ?? payload.fatigue_level ?? 0),
    confidenceScore: Number(payload.confidenceScore ?? payload.confidence_score ?? payload.confidence ?? 0),
    source: payload.source || 'ml',
    metrics: payload.metrics || {},
    photoId: payload.photoId || payload.imageId || payload.image_id || null,
    prediction: payload.prediction || payload.driverState || payload.driver_state || null
  };
}

function validatePayload(payload) {
  const errors = [];
  if (!payload.userId) errors.push('userId is required');
  if (!payload.sessionId) errors.push('sessionId is required');
  if (!payload.source) errors.push('source is required');
  if (Number.isNaN(payload.fatigueLevel) || payload.fatigueLevel < 0 || payload.fatigueLevel > 1) {
    errors.push('fatigueLevel must be a number between 0 and 1');
  }
  if (Number.isNaN(payload.confidenceScore) || payload.confidenceScore < 0 || payload.confidenceScore > 1) {
    errors.push('confidenceScore must be a number between 0 and 1');
  }
  if (Number.isNaN(Date.parse(payload.detectionTimestamp))) {
    errors.push('detectionTimestamp must be a valid date');
  }
  return errors;
}

function inferSeverity(fatigueLevel, confidenceScore, prediction) {
  if (prediction === 'sleeping' || fatigueLevel >= 0.9 || confidenceScore >= 0.9) return 'critical';
  if (prediction === 'drowsy' || fatigueLevel >= 0.75 || confidenceScore >= 0.75) return 'warning';
  return 'info';
}

function shouldTriggerAlert({ fatigueLevel, confidenceScore, prediction }) {
  // Always escalate sleeping predictions, even if confidence/level thresholds are lower.
  if (prediction === 'sleeping') return true;
  return fatigueLevel >= MIN_LEVEL && confidenceScore >= MIN_CONFIDENCE;
}

async function dedupeDecision(cacheKey, severity, nowMs) {
  let prev = alertStateCache.get(cacheKey);
  const cached = await cache.get(`fatigue_alert_state:${cacheKey}`);
  if (cached && typeof cached === 'object' && cached.severity && cached.emittedAt) {
    prev = cached;
  }

  if (!prev) {
    const next = { severity, emittedAt: nowMs };
    alertStateCache.set(cacheKey, next);
    await cache.set(`fatigue_alert_state:${cacheKey}`, next, Math.ceil(DEFAULT_COOLDOWN_MS / 1000) + 60);
    return true;
  }
  const cooldownPassed = nowMs - prev.emittedAt >= DEFAULT_COOLDOWN_MS;
  const severityEscalated = (prev.severity === 'warning' && severity === 'critical');
  if (cooldownPassed || severityEscalated) {
    const next = { severity, emittedAt: nowMs };
    alertStateCache.set(cacheKey, next);
    await cache.set(`fatigue_alert_state:${cacheKey}`, next, Math.ceil(DEFAULT_COOLDOWN_MS / 1000) + 60);
    return true;
  }
  return false;
}

function normalizeLatLng(raw = {}) {
  const latitude = Number(raw.latitude ?? raw.lat ?? raw?.location?.latitude ?? raw?.location?.lat);
  const longitude = Number(raw.longitude ?? raw.lng ?? raw?.location?.longitude ?? raw?.location?.lng);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
  return { latitude, longitude };
}

async function resolveLatestDriverLocation(session) {
  const route = Array.isArray(session.route) ? session.route : [];
  if (route.length > 0) {
    const lastRoutePoint = route[route.length - 1];
    const routeLocation = normalizeLatLng(lastRoutePoint);
    if (routeLocation) return routeLocation;
  }

  const latestPhoto = await Photo.findOne({ sessionId: session._id, userId: session.userId })
    .sort({ captureTimestamp: -1, uploadedAt: -1 })
    .select('location')
    .lean();
  if (latestPhoto?.location) {
    const photoLocation = normalizeLatLng(latestPhoto.location);
    if (photoLocation) return photoLocation;
  }

  const startLocation = normalizeLatLng(session.startLocation || {});
  if (startLocation) return startLocation;
  return null;
}

async function shouldEmitSafeStop(cacheKey, nowMs) {
  const safeKey = `${cacheKey}:safeStop`;
  let prev = alertStateCache.get(safeKey);
  const cached = await cache.get(`fatigue_safe_stop_state:${safeKey}`);
  if (cached && typeof cached === 'object' && cached.emittedAt) {
    prev = cached;
  }
  if (!prev) {
    const next = { emittedAt: nowMs };
    alertStateCache.set(safeKey, next);
    await cache.set(`fatigue_safe_stop_state:${safeKey}`, next, Math.ceil(SAFE_STOP_RECOMMENDATION_COOLDOWN_MS / 1000) + 60);
    return true;
  }
  if (nowMs - prev.emittedAt >= SAFE_STOP_RECOMMENDATION_COOLDOWN_MS) {
    const next = { emittedAt: nowMs };
    alertStateCache.set(safeKey, next);
    await cache.set(`fatigue_safe_stop_state:${safeKey}`, next, Math.ceil(SAFE_STOP_RECOMMENDATION_COOLDOWN_MS / 1000) + 60);
    return true;
  }
  return false;
}

async function emitToUserRoom(userId, payload) {
  if (!global.io) return { emitted: false, reason: 'io_not_available' };
  const room = `user:${userId}`;
  const sockets = await global.io.in(room).fetchSockets();
  if (!sockets || sockets.length === 0) {
    logger.warn(`[fatigue-alert] user disconnected userId=${userId} sessionId=${payload.sessionId}`);
    return { emitted: false, reason: 'user_disconnected' };
  }
  global.io.to(room).emit('driver_fatigue_alert', payload);
  return { emitted: true };
}

async function emitSafeStopRecommendation(payload, safeStopPayload) {
  if (!global.io) return { emitted: false, reason: 'io_not_available' };
  const room = `user:${payload.userId}`;
  const sockets = await global.io.in(room).fetchSockets();
  if (!sockets || sockets.length === 0) {
    return { emitted: false, reason: 'user_disconnected' };
  }
  global.io.to(room).emit('fatigue_safe_stop', safeStopPayload);
  return { emitted: true };
}

async function processDetection(rawPayload, options = {}) {
  const payload = normalizeDetectionPayload(rawPayload);
  const validationErrors = validatePayload(payload);
  if (validationErrors.length > 0) {
    return { ok: false, statusCode: 400, error: 'invalid_payload', validationErrors };
  }

  const session = await DriverSession.findOne({
    _id: payload.sessionId,
    userId: payload.userId,
    isActive: true
  });
  if (!session) {
    logger.warn(`[fatigue-alert] session not active or mismatch userId=${payload.userId} sessionId=${payload.sessionId}`);
    return { ok: false, statusCode: 404, error: 'session_not_found' };
  }

  const meaningful = shouldTriggerAlert(payload);
  if (!meaningful) {
    return { ok: true, emitted: false, skipped: 'below_threshold' };
  }

  const severity = inferSeverity(payload.fatigueLevel, payload.confidenceScore, payload.prediction);
  const nowMs = Date.now();
  const cacheKey = `${payload.userId}:${payload.sessionId}`;
  if (!(await dedupeDecision(cacheKey, severity, nowMs))) {
    return { ok: true, emitted: false, skipped: 'cooldown' };
  }

  const eventPayload = {
    eventId: randomUUID(),
    type: 'fatigue_alert',
    severity,
    message: severity === 'critical' ? 'Critical fatigue detected. Stop safely now.' : 'Driver fatigue detected',
    tripId: payload.sessionId,
    sessionId: payload.sessionId,
    timestamp: payload.detectionTimestamp,
    confidenceScore: payload.confidenceScore,
    fatigueLevel: payload.fatigueLevel,
    source: payload.source,
    recommendation:
      severity === 'critical'
        ? 'Pull over at the nearest safe spot immediately.'
        : 'Take a short break and hydrate.',
    metrics: payload.metrics || {},
    photoId: payload.photoId || undefined
  };

  const emitResult = await emitToUserRoom(payload.userId, eventPayload);
  if (emitResult.emitted && typeof global.sendNotificationToUser === 'function') {
    const notificationType = severity === 'critical' ? 'error' : 'warning';
    const notificationMessage =
      severity === 'critical'
        ? 'WAKE UP! Severe fatigue detected. Stop driving immediately.'
        : 'Fatigue detected. Please stay alert and take a break soon.';
    global.sendNotificationToUser(payload.userId, notificationMessage, notificationType, 12000);
  }
  let safeStopResult = { emitted: false, reason: 'not_attempted' };
  let safeStopPayload = null;

  const nowForSafeStop = Date.now();
  if (await shouldEmitSafeStop(cacheKey, nowForSafeStop)) {
    try {
      const location = await resolveLatestDriverLocation(session);
      if (location) {
        const nearest = await googleMapService.findNearestSafeStop(location, session.route || []);
        if (nearest?.found) {
          const bestStop = nearest.best || nearest;
          safeStopPayload = {
            eventId: randomUUID(),
            type: 'fatigue_safe_stop',
            severity,
            message: 'Nearest safe stop recommendation',
            tripId: payload.sessionId,
            sessionId: payload.sessionId,
            timestamp: payload.detectionTimestamp,
            placeName: bestStop.placeName,
            address: bestStop.address,
            latitude: bestStop.latitude,
            longitude: bestStop.longitude,
            placeId: bestStop.placeId,
            distanceMeters: bestStop.distanceMeters,
            durationSeconds: bestStop.durationSeconds,
            googleMapsUrl: bestStop.googleMapsUrl,
            recommendations: Array.isArray(nearest.suggestions) ? nearest.suggestions : [bestStop]
          };
          safeStopResult = await emitSafeStopRecommendation(payload, safeStopPayload);
        } else {
          safeStopResult = { emitted: false, reason: nearest?.reason || 'not_found' };
        }
      } else {
        safeStopResult = { emitted: false, reason: 'missing_driver_location' };
      }
    } catch (error) {
      logger.warn(`[fatigue-alert] safe-stop recommendation failed userId=${payload.userId}: ${error.message}`);
      await monitoring.trackFailure('google_maps_failure', {
        userId: payload.userId,
        tripId: payload.sessionId,
        requestId: null,
        source: 'safe_stop_recommendation',
        message: error.message,
      });
      safeStopResult = { emitted: false, reason: 'safe_stop_lookup_failed' };
    }
  } else {
    safeStopResult = { emitted: false, reason: 'safe_stop_cooldown' };
  }

  await FatigueLog.create({
    userId: payload.userId,
    sessionId: payload.sessionId,
    imageId: payload.photoId || undefined,
    fatigued: true,
    timestamp: new Date(payload.detectionTimestamp),
    fatigueLevel: payload.fatigueLevel,
    confidenceScore: payload.confidenceScore,
    source: payload.source,
    severity,
    metrics: payload.metrics || {}
  });

  await session.addEvent(
    'driver_fatigue_alert',
    {
      fatigueLevel: payload.fatigueLevel,
      confidenceScore: payload.confidenceScore,
      severity,
      source: payload.source,
      emitted: emitResult.emitted,
      safeStopEmitted: safeStopResult.emitted,
      safeStopReason: safeStopResult.reason || null
    },
    options.eventSource || 'ai'
  );

  logger.info(
    `[fatigue-alert] processed userId=${payload.userId} sessionId=${payload.sessionId} severity=${severity} emitted=${emitResult.emitted} safeStop=${safeStopResult.emitted}`
  );

  return {
    ok: true,
    emitted: emitResult.emitted,
    severity,
    event: eventPayload,
    emitResult,
    safeStop: safeStopPayload,
    safeStopEmitResult: safeStopResult
  };
}

module.exports = {
  processDetection,
  normalizeDetectionPayload,
  validatePayload
};
