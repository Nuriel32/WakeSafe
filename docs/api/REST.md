# WakeSafe Backend — REST API

All routes are prefixed with `/api`. Authenticated routes require `Authorization: Bearer <jwt>`. Responses follow the success/fail envelope described in [`API.md`](../API.md).

## Authentication — `/api/auth`

### `POST /api/auth/register`
Register a new user. Also creates a paired empty driver session for the user.

| Field | Type | Required | Notes |
|---|---|---|---|
| `firstName` | string | yes | |
| `lastName` | string | yes | |
| `email` | string | yes | Must match `\S+@\S+\.\S+`. Unique. |
| `password` | string | yes | Hashed with bcrypt before storage. |
| `phone` | string | yes | Israeli format, regex `^05\d{8}$`. |
| `carNumber` | string | yes | 7–8 digits, regex `^\d{7,8}$`. |

**Success (201)**: `{ token: "<jwt>" }`

**Errors**: `400 VALIDATION_ERROR`, `400 REGISTER_FAILED`.

---

### `POST /api/auth/login`
Authenticate an existing user.

| Field | Type | Required |
|---|---|---|
| `email` | string | yes |
| `password` | string | yes |

**Success (200)**: `{ token: "<jwt>" }` — JWT contains `id`, `jti`, `firstName`, `lastName`, `email`, `phone`, `carNumber`. Expires in 24h.

**Errors**: `401 INVALID_CREDENTIALS`, `500 LOGIN_FAILED`.

---

### `POST /api/auth/logout` *(auth required)*
Revoke the current JWT. The `jti` is stored as `revoked:<jti>` in Redis and the token cache is cleared.

**Success (200)**: empty data.

**Errors**: `400 TOKEN_ID_MISSING`.

---

## Users — `/api/users`

All routes require auth.

| Method | Path | Description |
|---|---|---|
| `GET` | `/me` | Returns the current user document (password excluded). |
| `PUT` | `/me` | Updates the current user (the `password` field is silently dropped — use a dedicated endpoint to change it). |
| `DELETE` | `/me` | Deletes the current user. |

---

## Driver Sessions — `/api/sessions`

All routes require auth.

### `POST /api/sessions/start`
Create a new active driving session. If an active session already exists for the user, the existing one is returned (single-active-session invariant enforced by a partial unique index).

**Success (201 / 200)**: full `DriverSession` document.

**Errors**: `409 SESSION_ALREADY_ACTIVE`, `500 SESSION_CREATE_FAILED`.

---

### `GET /api/sessions/current`
Return the current active session for the user. Reads from Redis cache first (`active_session:<userId>`).

**Errors**: `404 SESSION_NOT_FOUND`.

---

### `GET /api/sessions/`
Return the user's session history.

| Query | Type | Default |
|---|---|---|
| `limit` | number string | 50 (capped at 100) |
| `page` | number string | 1 |
| `includePhotos` | `'true' \| 'false'` | `'false'` |

The response includes `meta: { page, limit, count, includePhotos }`.

---

### `PUT /api/sessions/:sessionId`
End the named session. Sets `isActive=false`, `status='ended'`, computes `duration`, and clears the Redis active-session cache.

**Errors**: `404 SESSION_NOT_FOUND`, `500 SESSION_END_FAILED`.

---

## Photo Uploads — `/api/upload`

All routes require auth and check JWT revocation.

### `POST /api/upload/`
Upload a single photo through the backend (multipart/form-data, field `photo`).

- Allowed mime types: `image/jpeg`, `image/png`, `image/webp`.
- Max file size: 8 MB.
- Body fields (form-data): `sessionId` (required), `sequenceNumber`, `timestamp`, `location` (JSON), `clientMeta` (JSON), `folderType` (`before-ai` | `after-ai`).

The handler:
1. Validates the session is active and owned by the user.
2. Uploads the binary to GCS at `drivers/<userId>/sessions/<sessionId>/photos/<folderType>/<smartName>`.
3. Creates a `Photo` document and links it to the session.
4. Generates a 1-hour signed URL.
5. Calls `aiProcessingService.queuePhotoForProcessing` asynchronously.

**Success (201)**: `{ message, photoId, gcsPath, processingStatus, metadata, sequenceNumber }`.

**Errors**: `400` invalid input, `404` session not found, `413` file too large, `500` upload failed.

---

### `POST /api/upload/presigned`
Generate a presigned GCS upload URL so the client can upload directly to GCS (the recommended path).

| Field | Type | Required |
|---|---|---|
| `fileName` | string | yes |
| `sessionId` | string (ObjectId) | yes |
| `sequenceNumber` | number | optional |
| `timestamp` | number (epoch ms) | optional |
| `location` | object | optional |
| `clientMeta` | object | optional |

**Success (200)**:
```json
{
  "presignedUrl": "https://storage.googleapis.com/...",
  "photoId": "650...",
  "gcsPath": "sessions/<sid>/photos/<file>",
  "fileName": "...",
  "contentType": "image/jpeg",
  "expiresIn": 3600,
  "uploadInfo": { "sequenceNumber": 0, "captureTimestamp": 1730000000000, "folderType": "before-ai" }
}
```

---

### `POST /api/upload/confirm`
Client calls this after a successful direct GCS upload to mark the photo as uploaded and trigger AI processing.

| Field | Type | Required |
|---|---|---|
| `photoId` | string (ObjectId) | yes |
| `uploadSuccess` | boolean | yes |

**Success (200)**: `{ message, photoId, aiProcessingQueued, gcsPath }` or `{ message, photoId, uploadStatus: 'failed' }`.

---

### `GET /api/upload/status/:photoId`
Return upload + AI processing status for a single photo.

**Success (200)**: `{ photoId, uploadStatus, aiProcessingStatus, prediction, uploadedAt, gcsPath }`.

---

## Photos — `/api/photos`

All routes require auth and check JWT revocation.

### `GET /api/photos/unprocessed`
List photos pending AI processing.

| Query | Type | Default |
|---|---|---|
| `limit` | number | 50 (capped at 200) |
| `status` | `pending \| processing \| completed \| failed` | `pending` |
| `includeGcsMetadata` | `'true' \| 'false'` | `'false'` |

Response items include the `gcsUrl` and (if requested) `gcsMetadata`. Cached in Redis for 20s.

---

### `GET /api/photos/session/:sessionId`
List photos in a session, newest first. Each item is enriched with a 60-second signed URL (`fileUrl`).

| Query | Type | Default |
|---|---|---|
| `limit` | number | 100 (capped at 300) |
| `prediction` | `alert \| drowsy \| sleeping \| unknown \| pending` | filter (optional) |

Cached for 15s.

---

### `GET /api/photos/gallery/sleeping-rides`
Group recent **sleeping** photos by ride. Returns one entry per session with up to `maxPhotosPerRide` photos, each with a fresh signed URL.

| Query | Type | Default |
|---|---|---|
| `maxRides` | number | 20 (capped at 100) |
| `maxPhotosPerRide` | number | 20 (capped at 100) |

Response shape: `{ rides: [{ ride, sleepingPhotoCount, photos[] }], count, totalSleepingPhotos }`. Cached for 15s.

---

### `PUT /api/photos/:id/ai-results`
Update a photo with AI results. Used by the backend after an ML pipeline run.

Body fields: `prediction`, `confidence`, `ear`, `headPose`, `processingTime`, `aiResults` (object with extra fields). Calls `Photo.updateAIResults()` and `gcpStorageService.updatePhotoProcessingStatus()`. Invalidates user/session caches.

---

### `DELETE /api/photos/:id`
Delete a photo (GCS object, Mongo document, and session reference).

### `DELETE /api/photos/`
Delete photos in bulk.

| Field | Type | Required |
|---|---|---|
| `photoIds` | string[] | yes — non-empty array of ObjectIds. |

Response: `{ message, result: { deleted, errors } }`.

---

### `GET /api/photos/stats`
Aggregate photo statistics across the system: counts by `aiProcessingStatus` and `prediction`, plus average processing time, error rate, success rate. Cached for 30s.

---

## Fatigue — `/api/fatigue`

### `POST /api/fatigue/` *(auth required)*
Run a one-off fatigue computation against a payload. Used internally and for diagnostics.

| Field | Type | Required |
|---|---|---|
| `sessionId` | string | yes |
| `image` | base64 / URL | optional |
| `ear` | number | optional |
| `headPose` | object | optional |

---

### `POST /api/fatigue/ml-detection`
Webhook entry for ML pipelines pushing detections.

- Requires header `x-ml-api-key: <ML_WEBHOOK_API_KEY>`. The key is configured by env.
- Validated body fields: `userId`, `sessionId`, `detectionTimestamp` (ISO), `fatigueLevel` (0–1), `confidenceScore` (0–1), `source`. Optional: `metrics`, `prediction`, `photoId`.

The handler invokes `fatigueAlertService.processDetection(...)`, which de-duplicates, persists a `FatigueLog`, fans out the WebSocket alert, and (when severity is critical) emits a `fatigue_safe_stop` recommendation via Google Maps.

**Errors**: `401 ML_SOURCE_UNAUTHORIZED`, `400 ML_DETECTION_INVALID`, `503 ML_INGESTION_NOT_CONFIGURED`.

---

### `DELETE /api/fatigue/recent` *(auth required)*
Delete fatigue logs and their GCS images created within the last 60 seconds for the current user.

---

## Location — `/api/location`

### `POST /api/location/navigate` *(auth required)*
Return navigation recommendations (e.g., nearest safe stops) based on driver location. Implementation lives in `controllers/locationController.js`.

---

## Spotify — `/api/spotify`

Optional integration for in-car music control.

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/callback` | public | Spotify OAuth callback. |
| `GET` | `/login` | yes | Redirects to Spotify auth. |
| `GET` | `/login-url` | yes | Returns the Spotify login URL. |
| `GET` | `/status` | yes | Returns connection status. |
| `GET` | `/me` | yes | Spotify profile of the connected account. |
| `GET` | `/playlists` | yes | List the user's playlists. |
| `GET` | `/playlists/:id` | yes | Tracks of a playlist. |
| `GET` | `/player/current` | yes | Current playback state. |
| `PUT` | `/player/play` | yes | Play. |
| `PUT` | `/player/pause` | yes | Pause. |
| `POST` | `/player/next` | yes | Next track. |
| `POST` | `/player/previous` | yes | Previous track. |

---

## Health and debug

| Method | Path | Description |
|---|---|---|
| `GET` | `/healthz` | Liveness probe (always 200 once HTTP is up). |
| `GET` | `/readyz` | Readiness probe — 200 only when MongoDB is connected, else 503. |
| `GET` | `/api/debug/rate-limit` | Non-production only — echoes the caller's IP for rate-limit testing. |
| `GET` | `/api/debug/websocket` | Non-production only — returns the WebSocket URL. |

---

## Rate limits

Configured in `server/middlewares/rateLimit.js`. Routes use:

- `authLimiter` — `/api/auth/*`
- `uploadLimiter` and `presignedUploadLimiter` — `/api/upload/*`
- `apiLimiter` — `/api/users`, `/api/sessions`, `/api/fatigue`, `/api/location`, `/api/photos`, `/api/spotify`
- `generalLimiter` — global fallback
