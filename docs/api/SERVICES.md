# WakeSafe — Internal Services

This document covers internal service modules across the backend (Node.js) and AI services (Python). Public API contracts are documented separately in [`REST.md`](./REST.md), [`WEBSOCKET.md`](./WEBSOCKET.md), [`ML1_SERVICE.md`](./ML1_SERVICE.md), and [`ML2_SERVICE.md`](./ML2_SERVICE.md).

---

## Backend (Node.js) services

### `aiProcessingService` — `server/services/aiProcessingService.js`

Bridges the upload pipeline and the ML services. Owns the `queuePhotoForProcessing` flow.

| Function | Description |
|---|---|
| `queuePhotoForProcessing(photoDoc, signedUrl)` | Calls ML1 with the signed URL, builds a temporal sequence from MongoDB, calls ML2, persists results to `Photo` and `DriverSession`, creates a `FatigueLog` record, runs the false-positive guard, fans out the WebSocket alert, broadcasts `ai_processing_complete`. |
| `processPhotoForFatigue(photoData, sessionId, userId)` | Single-shot ad-hoc processing through the legacy AI server (kept for compatibility). |
| `processBatchPhotos(photos, sessionId, userId)` | Sequential batch wrapper. |
| `getAIProcessingStatus(photoId)` | Proxy to AI server status endpoint. |
| `healthCheck()` | Returns `true` when the legacy AI server health endpoint succeeds. |

#### False-positive guard
Helper `passesFalsePositiveGuard(sessionId, ml2Response, confidence)`:

- Requires `confidence ≥ ML_ALERT_MIN_CONFIDENCE` (default 0.75).
- Requires `ml2.severity ≥ ML_ALERT_MIN_SEVERITY` (default 0.7).
- Requires the previous `ML_ALERT_CONSECUTIVE_FRAMES − 1` photos in the session to also be drowsy/sleeping above the confidence threshold.

#### Internal helpers
`validateMl1Payload`, `validateMl1Response`, `validateMl2Payload`, `validateMl2Response`, `normalizeEyeState`, `mapEarToEyeStateFallback`, `normalizeGcsPath`, `buildTemporalSequence`.

---

### `fatigueAlertService` — `server/services/fatigueAlertService.js`

Single source of truth for emitting fatigue alerts.

| Function | Description |
|---|---|
| `processDetection(rawPayload, options)` | Normalize, validate, dedupe, persist `FatigueLog`, append session event, emit `driver_fatigue_alert`, optionally emit `fatigue_safe_stop`. |
| `normalizeDetectionPayload(payload)` | Maps snake_case/camelCase variants to a stable shape. |
| `validatePayload(payload)` | Returns an array of validation errors. |

Severity rules (`inferSeverity`):
- `prediction === 'sleeping'` or `fatigueLevel ≥ 0.9` or `confidenceScore ≥ 0.9` -> `critical`.
- `prediction === 'drowsy'` or `fatigueLevel ≥ 0.75` or `confidenceScore ≥ 0.75` -> `warning`.
- Otherwise -> `info`.

Trigger rule (`shouldTriggerAlert`):
- Always emit when `prediction === 'sleeping'`.
- Otherwise require `fatigueLevel ≥ FATIGUE_ALERT_MIN_LEVEL` and `confidenceScore ≥ FATIGUE_ALERT_MIN_CONFIDENCE`.

Cooldowns:
- `FATIGUE_ALERT_COOLDOWN_MS` (default 45,000 ms) per `userId:sessionId`. Severity escalation from warning to critical bypasses the cooldown.
- `SAFE_STOP_RECOMMENDATION_COOLDOWN_MS` (default 120,000 ms) controls the safe-stop cadence independently.

Safe-stop flow:
- `resolveLatestDriverLocation(session)` picks the latest known location from `session.route`, the latest photo, or `session.startLocation`.
- `googleMapService.findNearestSafeStop(location, session.route)` finds the recommendation.
- `fatigue_safe_stop` is emitted when both the user is connected and a recommendation exists.

---

### `cacheService` — `server/services/cacheService.js`

Thin wrapper around the Redis client (`app.locals.redis`) with safe fallbacks when Redis is unavailable.

| Function | Purpose |
|---|---|
| `set(key, value, ttlSeconds)` | JSON-encoded set with TTL. |
| `get(key)` | JSON-decoded get; returns `null` on miss or error. |
| `del(key)` | Delete one key. |
| `deleteKeysByPattern(pattern)` | Iterate `SCAN` and delete matching keys (used for cache invalidation). |
| `invalidatePhotoCachesForUser(userId, sessionId)` | Drop sleeping-gallery and session-photos caches. |
| `exists(key)`, `expire(key, ttl)`, `ttl(key)`, `flush()` | Key utilities. |
| `setSessionData / getSessionData / deleteSessionData` | `session:<id>` cache. |
| `setUserData / getUserData / deleteUserData` | `user:<id>` cache. |
| `revokeToken(jti, ttl)`, `isTokenRevoked(jti)` | JWT revocation list (`revoked:<jti>`). |
| `incrementRateLimit(key, ttl)` | INCR with TTL on first hit. |
| `validateSessionOwner(sessionId, userId)` | Cached ownership check (`session_owner:<id>`). |

---

### `gcpStorageService` — `server/services/gcpStorageService.js`

Encapsulates storage. Supports two providers:

- **GCS** when `STORAGE_PROVIDER` is unset or `gcs` (default).
- **Local filesystem** when `STORAGE_PROVIDER=local` or `ENV_PROFILE=local`. Files served via `app.use('/local-uploads', express.static(...))`.

Key functions:

| Function | Description |
|---|---|
| `uploadFile(file, gcsPath, metadata?)` | Generic upload. |
| `uploadSessionPhoto(file, userId, sessionId, metadata, folderType)` | Builds the canonical key `drivers/<userId>/sessions/<sessionId>/photos/<folderType>/<smartName>` and uploads. |
| `generatePresignedUploadUrl(gcsPath, contentType, ttlMinutes)` | V4 signed URL for client-direct uploads. |
| `generateSignedUrl(gcsPath, ttlSeconds, options)` | V4 signed read URL (or local public URL). |
| `getPublicBaseUrlFromRequest(req)` | Resolves the LAN-visible base URL for local mode. |
| `deleteFile(gcsPath)` | Delete one object. |
| `getUnprocessedPhotos()` | Pull-style scan of GCS for legacy compatibility (rarely used). |
| `updatePhotoProcessingStatus(gcsPath, status, metadata)` | Update GCS object metadata. |

---

### `mlAdapter` — `server/adapters/mlAdapter.js`

Thin HTTP client wrappers. Each call uses the shared retry policy (`ML_CALL_MAX_RETRIES`, `ML_CALL_RETRY_BASE_MS`).

| Function | Endpoint |
|---|---|
| `ml1Predict(payload)` | `POST {ML1_SERVICE_URL}/predict` |
| `ml2Analyze(payload)` | `POST {ML2_SERVICE_URL}/analyze` |
| `aiProcessPhoto(payload)` | `POST {AI_SERVER_URL}/api/process-photo` (legacy AI server) |
| `aiStatus(photoId)` | `GET {AI_SERVER_URL}/api/status/:photoId` |
| `aiHealth()` | `GET {AI_SERVER_URL}/health` |

---

### `googleMapService` — `server/services/googleMapService.js`

Wraps Google Maps Places + Directions APIs.

- `findNearestSafeStop(location, route)` — searches for nearby fuel/rest stops, scores them by distance and travel time, returns `{ found, best, suggestions, reason }`.
- Used by `fatigueAlertService.processDetection` to emit `fatigue_safe_stop`.

### `monitoringService` — `server/services/monitoringService.js`

Lightweight observability hooks. Exposes `trackFailure`, `trackWarning`, `trackEvent`. Failures from background tasks (e.g., WebSocket disconnects, Google Maps errors) are recorded here instead of crashing the request.

### `spotifyService` — `server/services/spotifyService.js`

Spotify OAuth + Web API wrapper. Used by the controllers under `/api/spotify`.

### `fatigueService` — `server/services/fatigueService.js`

Legacy direct fatigue computation used by `POST /api/fatigue/`. Calls the AI server's `analyze_fatigue` endpoint with raw image data and stores a `FatigueLog`.

### Global helpers in `server/server.js`

The HTTP/WebSocket entry point exposes three globals consumed by other modules:

| Global | Purpose |
|---|---|
| `global.io` | Socket.IO server instance. |
| `global.broadcastFatigueDetection(userId, sessionId, fatigueLevel, confidence, photoId, aiResults)` | Emit `fatigue_detection` to a user room (legacy). |
| `global.broadcastAIProcessingComplete(userId, photoId, results, processingTime)` | Emit `ai_processing_complete`. |
| `global.sendNotificationToUser(userId, message, type, duration)` | Emit `notification`. |

Each emit is deduplicated through `emitToUserWithDedupe(userId, eventName, payload, ttlSeconds)` using Redis key `ws_emit:<eventName>:<userId>:<eventId>`.

---

## ML1 service (Python)

| Class | File | Description |
|---|---|---|
| `EyeStateModelProvider` | `app/services/model_loader.py` | Owns OpenVINO models, exposes `detect_face`, `predict_landmarks`, `classify_eye`. Process-wide singleton via `load_model_provider()`. |
| `PreprocessingService` | `app/services/preprocessing_service.py` | PIL → BGR conversion, detector + landmark-driven eye crop extraction. |
| `FrameInferenceService` | `app/services/inference_service.py` | Pipeline orchestrator; produces `ML1PredictResponse`. |
| `Settings` | `app/core/config.py` | Pydantic-settings with `ML1_*` env-var prefix. |

Utilities:

- `app/utils/image_loader.py::load_image(image_url, image_base64)` — fetches from HTTPS, base64, or local filesystem.
- `app/utils/time_utils.py::utc_now()` — timezone-aware UTC datetime.
- `app/core/logging.py::configure_logging()` — root logger formatter.

Entry points:

- `app/main.py::create_app()` — FastAPI factory; wires `app/api/routes.py`.
- `app/api/routes.py` — `health_check`, `predict`.

---

## ML2 service (Python)

| Class | File | Description |
|---|---|---|
| `TemporalFeatureService` | `app/services/feature_service.py` | Extracts blink rate, closure ratio/duration. |
| `RuleBasedDecisionEngine` | `app/services/decision_engine.py` | Maps features to `alert/drowsy/sleeping/unknown` and severity. |
| `TemporalDecisionService` | `app/services/decision_service.py` | Glue: schemas → features → decision → response. |
| `Settings` | `app/core/config.py` | Pydantic-settings with `ML2_*` env-var prefix. |

Entry points:

- `app/main.py::create_app()` — FastAPI factory; wires `app/api/routes.py`.
- `app/api/routes.py` — `health_check`, `analyze`.

---

## Training package (Python)

`training/` is the home of the WakeSafe Eye-State CNN training pipeline.

| Module | Description |
|---|---|
| `training/dataset.py` | `Sample` dataclass, `list_mrl_samples`, `subject_split`, `EyeStateDataset` (eager-loaded), augmentation helpers, `class_balance`. |
| `training/model.py` | `WakeSafeEyeNet` (custom 5-block CNN). `num_parameters(model)`. |
| `training/train.py` | CLI training script: AdamW + cosine LR + best-checkpoint saving + JSON summary. |
| `training/export.py` | CLI exporter: `torch.load(weights_only=True)` -> ONNX -> optional OpenVINO IR with mean/scale baked in. |
| `training/MODEL_CARD.md` | Architecture, datasets, splits, recipe, metrics, license. |
| `training/README.md` | Usage and reproduction instructions. |

CLI shortcuts:

```bash
python -m training.train --epochs 12 --batch-size 256 --output-dir training/runs/v1
python -m training.export --checkpoint training/runs/v1/best.pt --build-ir
```

Companion scripts:

- `scripts/fetch_ml1_models.py` — downloads Intel pretrained companions; verifies legacy eye classifier checksum behind `--fetch-legacy-eye`.
- `scripts/evaluate_eye_state_model.py` — runs the trained model on `session`, `mrl`, `cew` datasets; supports `--bypass-detector` for classifier-only evaluation.
- `scripts/bulk_eye_cycle.py` — historical heuristic calibration tool (kept for context, no longer used).
