# WakeSafe — Data Models

This document covers every persistence schema (Mongoose, MongoDB) and DTO schema (Pydantic, Python) used across the project.

---

## Mongoose schemas (Node.js backend)

### `User`
File: `server/models/Users.js`. Collection: `users`.

#### Fields

| Field | Type | Required | Notes |
|---|---|---|---|
| `firstName` | `String` | yes | |
| `lastName` | `String` | yes | |
| `email` | `String` | yes, unique | |
| `password` | `String` | yes | bcrypt hashed in `pre('save')`. |
| `phone` | `String` | yes | |
| `carNumber` | `String` | yes | |
| `joinDate` | `Date` | default now | |
| `lastLogin` | `Date` | optional | |
| `isActive` | `Boolean` | default `true` | |
| `isVerified` | `Boolean` | default `false` | |
| `verificationToken`, `resetPasswordToken`, `resetPasswordExpires` | tokens | optional | |
| `profile` | embedded object | optional | `avatar`, `dateOfBirth`, `gender`, `address`, `emergencyContact`. |
| `vehicle` | embedded object | optional | `make`, `model`, `year`, `color`, `licensePlate`, `vin`. |
| `usageStats` | embedded counters | default zeros | `totalSessions`, `totalDrivingTime`, `totalPhotosUploaded`, `totalPhotosProcessed`, `totalAlerts`, `totalDrowsyDetections`, `totalSleepingDetections`, `avgSessionDuration`, `lastSessionDate`. |
| `preferences` | embedded object | defaults | `notifications`, `privacy`, `app`. |
| `devices` | embedded array | | each item: `deviceId`, `platform`, `os`, `appVersion`, `model`, `lastSeen`, `isActive`. |
| `subscription` | embedded object | defaults | `plan`, `status`, `startDate`, `endDate`, `autoRenew`. |
| `spotify` | embedded object | optional | `isConnected`, `spotifyUserId`, `accessToken` (select:false), `refreshToken` (select:false), `tokenExpiresAt` (select:false), `connectedAt`, `lastSyncAt`. |
| `security` | embedded object | defaults | `twoFactorEnabled`, `twoFactorSecret`, `loginAttempts`, `lockUntil`, `lastPasswordChange`. |
| `activityLog` | embedded array | | `action`, `timestamp`, `ipAddress`, `userAgent`, `deviceId`, `metadata`. |
| `createdAt`, `updatedAt` | `Date` | timestamps | |

#### Indexes
`email`, `phone`, `carNumber`, `isActive`, `lastLogin`, `usageStats.totalSessions`, `usageStats.totalAlerts`, `devices.deviceId`, `subscription.plan`, `subscription.status`.

#### Instance methods

| Method | Description |
|---|---|
| `comparePassword(plaintext)` | bcrypt compare. |
| `addActivity(action, ipAddress, userAgent, deviceId, metadata)` | Append an entry to `activityLog`. |
| `updateLastLogin()` | Set `lastLogin = now`. |
| `addDevice(deviceInfo)` | Upsert device by `deviceId`. |
| `updateUsageStats(sessionData)` | Increment usage counters. |
| `incrementLoginAttempts()` | +1 attempts; lock account after 5 (2 hours). |
| `resetLoginAttempts()` | Clear lock and counter. |
| `isLocked()` | Boolean. |

#### Static methods

| Method | Description |
|---|---|
| `getUserStats()` | Aggregated counts of users, sessions, photos, alerts. |
| `getTopUsers(limit=10)` | Most active users by `usageStats.totalSessions`. |

---

### `DriverSession`
File: `server/models/DriverSession.js`. Collection: `driversessions`.

#### Fields

| Field | Type | Required | Notes |
|---|---|---|---|
| `userId` | `ObjectId` -> `User` | yes | |
| `sessionId` | `String` | yes, unique | server-generated `session_<uid>_<ms>_<rnd>`. |
| `startTime` | `Date` | default now | |
| `endTime` | `Date` | optional | |
| `duration` | `Number` | optional | ms. |
| `isActive` | `Boolean` | default `true` | |
| `startLocation`, `endLocation` | `Mixed` | optional | |
| `route` | array | | each item `lat, lng, timestamp, speed, heading`. |
| `totalImagesUploaded`, `totalImagesProcessed`, `totalImagesFailed` | `Number` | default 0 | |
| `photos` | `[ObjectId -> Photo]` | | |
| `aiProcessingStats` | embedded counters | | `totalProcessed`, `alertCount`, `drowsyCount`, `sleepingCount`, `unknownCount`, `avgConfidence`, `avgProcessingTime`. |
| `uploadStats` | embedded counters | | `totalUploads`, `successfulUploads`, `failedUploads`, `avgUploadDuration`, `totalUploadDuration`. |
| `deviceInfo` | `Mixed` | | |
| `sessionConfig` | embedded object | defaults | `captureInterval` (ms), `uploadBatchSize`, `aiProcessingEnabled`, `locationTrackingEnabled`, `websocketEnabled`. |
| `performanceMetrics` | embedded object | | `avgPhotoSize`, `totalDataUploaded`, `networkLatency`, `batteryUsage`. |
| `events` | array | | each item: `eventType`, `timestamp`, `data`, `source` (`'mobile'\|'server'\|'ai'\|'websocket'`). |
| `status` | `'active' \| 'paused' \| 'ended' \| 'error'` | default `'active'` | |
| `errorLog` | array | | each item: `errorType`, `message`, `timestamp`, `stack`. |
| `createdAt`, `updatedAt` | timestamps | | |

#### Indexes
`userId+startTime`, `startTime`, `endTime`, `status`, `aiProcessingStats.alertCount/drowsyCount/sleepingCount`.
**Partial unique index** on `userId+isActive` enforces a single active session per user.

#### Instance methods

| Method | Description |
|---|---|
| `addEvent(eventType, data, source='server')` | Append to `events`. |
| `updateAIStats(prediction, confidence, processingTime)` | Update averages and per-class counters. |
| `updateUploadStats(success, duration, fileSize)` | Update upload averages and totals. |
| `addLocationPoint(lat, lng, speed, heading)` | Append to `route`. |
| `endSession(endLocation?)` | Mark `status='ended'`, set `endTime` and `duration`. |
| `addError(errorType, message, stack)` | Append to `errorLog` and set `status='error'`. |

#### Static methods

| Method | Description |
|---|---|
| `getActiveSessions()` | All active sessions, populated with the user. |
| `getSessionStats()` | Aggregated counts and averages. |

---

### `Photo`
File: `server/models/PhotoSchema.js`. Collection: `photos`.

#### Fields

| Field | Type | Required | Notes |
|---|---|---|---|
| `sessionId` | `ObjectId` -> `DriverSession` | yes | |
| `userId` | `ObjectId` -> `User` | yes | |
| `gcsPath` | `String` | yes | |
| `uploadedAt` | `Date` | default now | |
| `sequenceNumber` | `Number` | yes | unique per session. |
| `captureTimestamp` | `Number` | yes | |
| `folderType` | `'before-ai' \| 'after-ai'` | default `'before-ai'` | |
| `prediction` | `'alert' \| 'drowsy' \| 'sleeping' \| 'unknown' \| 'pending'` | default `'pending'` | |
| `aiProcessingStatus` | `'pending' \| 'processing' \| 'completed' \| 'failed'` | default `'pending'` | |
| `aiResults.confidence` | `Number` | 0..1 | |
| `aiResults.ear` | `Number` | optional | |
| `aiResults.eyeState` | `'OPEN' \| 'CLOSED' \| 'PARTIAL' \| 'UNKNOWN'` | | |
| `aiResults.visionStatus` | `'ok' \| 'no_eyes_detected'` | | |
| `aiResults.guidanceMessage` | `String` | optional | |
| `aiResults.headPose.{pitch,yaw,roll}` | `Number` | | |
| `aiResults.processingTime` | `Number` | ms | |
| `aiResults.processedAt` | `Date` | | |
| `location` | `Mixed` | optional | |
| `clientMeta` | `Mixed` | optional | |
| `uploadStatus` | `'pending' \| 'uploading' \| 'uploaded' \| 'failed'` | default `'pending'` | |
| `uploadMethod` | `String` | default `'presigned'` | |
| `uploadRetries` | `Number` | default 0 | |
| `processingStartedAt`, `processingCompletedAt` | `Date` | | |
| `imageQuality.isValid` | `Boolean` | default `true` | |
| `websocketEvents` | array | | `eventType`, `timestamp`, `data`. |
| `createdAt`, `updatedAt` | timestamps | | |

#### Virtuals
- `gcsUrl` -> `https://storage.googleapis.com/<bucket>/<gcsPath>`.

#### Indexes
Multiple compound indexes for fast session/user/timeline queries; **unique** `sessionId+sequenceNumber`.

#### Instance methods

| Method | Description |
|---|---|
| `updateAIResults(results)` | Persist AI results, set `aiProcessingStatus='completed'`. |
| `addWebSocketEvent(eventType, data)` | Append to `websocketEvents`. |
| `updateUploadStatus(status, duration?, retries=0)` | Update status fields. |
| `updateProcessingStatus(status)` | Update `aiProcessingStatus` and timestamps. |

#### Static methods

| Method | Description |
|---|---|
| `getProcessingStats()` | Aggregated counts by status and prediction; average processing time. |

---

### `FatigueLog`
File: `server/models/FatigueLog.js`. Collection: `fatiguelogs`.

| Field | Type | Notes |
|---|---|---|
| `userId` | `ObjectId` -> `User` | required |
| `sessionId` | `ObjectId` -> `DriverSession` | required |
| `imageId` | `String` | optional |
| `imageUrl` | `String` | optional |
| `ear` | `Number` | |
| `headPose.{pitch,yaw,roll}` | `Number` | |
| `fatigued` | `Boolean` | default `false` |
| `fatigueLevel` | `Number` | 0..1 |
| `confidenceScore` | `Number` | 0..1 |
| `severity` | `'info' \| 'warning' \| 'critical'` | |
| `source` | `String` | default `'ml'` |
| `metrics` | `Mixed` | |
| `timestamp` | `Date` | default now |

Indexes for fast per-user / per-session lookups, including severity.

---

## Pydantic schemas (Python services)

### ML1 service

See [`ML1_SERVICE.md`](./ML1_SERVICE.md#schemas) for full field tables. Schemas:

- `ML1PredictRequest`, `ImageMetadata` — `ml1-service/app/schemas/request.py`
- `ML1PredictResponse`, `FrameAnalysisResponse`, `HeadPoseResponse`, `HealthResponse` — `ml1-service/app/schemas/response.py`

### ML2 service

See [`ML2_SERVICE.md`](./ML2_SERVICE.md#schemas) for full field tables. Schemas:

- `ML2AnalyzeRequest`, `SequenceItem`, `HeadPoseInput` — `ml2-service/app/schemas/request.py`
- `ML2AnalyzeResponse`, `FeatureResponse`, `HealthResponse` — `ml2-service/app/schemas/response.py`

---

## Internal dataclasses (Python)

### ML1

- `FaceBox`, `FaceLandmarks`, `EyeProbabilities` — `ml1-service/app/services/model_loader.py`
- `PreprocessedFrame` — `ml1-service/app/services/preprocessing_service.py`

### ML2

- `TemporalFeatures` — `ml2-service/app/services/feature_service.py`
- `DecisionResult` — `ml2-service/app/services/decision_engine.py`

---

## Training package

- `Sample` (`path`, `label`, `subject`) — `training/dataset.py`
- `EyeStateDataset` (PyTorch `Dataset`) — `training/dataset.py`. Eager-loads ~85k MRL eye crops into a contiguous uint8 array on construction; applies BGR normalization `(x − 127) / 255` and CHW transpose at `__getitem__`.
- `WakeSafeEyeNet` (PyTorch `nn.Module`) — `training/model.py`. 5-block CNN, 146,546 parameters, input `1×3×32×32` BGR, output 2-class logits.
