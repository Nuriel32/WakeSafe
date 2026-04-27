# WakeSafe — Configuration Reference

All configuration is provided through environment variables. Each subsystem reads its own prefix.

---

## Backend (Node.js)

Loaded by `server/app.js` from one of:

- `./env.local` when `ENV_PROFILE=local` (default in development).
- `./env.gcp-dev` when `ENV_PROFILE=gcpdev`.
- `.env` in production (`NODE_ENV=production`).

### Core

| Variable | Default | Purpose |
|---|---|---|
| `NODE_ENV` | `development` | Standard Node env. |
| `ENV_PROFILE` | `local` | Selects the env file. |
| `PORT` | `5000` | HTTP listen port. |
| `HOST` | `0.0.0.0` | Bind interface. |
| `JWT_SECRET` | (required) | HS256 signing secret. |

### CORS / WebSocket

| Variable | Default | Purpose |
|---|---|---|
| `CORS_ALLOWED_ORIGINS` | (empty) | Comma-separated allow-list for HTTP CORS. |
| `SOCKET_IO_ORIGIN` | `*` | Comma-separated origins for Socket.IO; `*` means open. |
| `SOCKET_HEARTBEAT_STALE_MS` | `70000` | Disconnect sockets with no heartbeat for this long. |
| `SOCKET_HEARTBEAT_SWEEP_MS` | `30000` | Sweep interval. |

### Database

| Variable | Required | Purpose |
|---|---|---|
| `MONGO_URI` | yes | MongoDB connection string. |

### Redis

| Variable | Default |
|---|---|
| `REDIS_HOST` | `127.0.0.1` |
| `REDIS_PORT` | `6379` |

### Storage (Google Cloud Storage)

| Variable | Default | Purpose |
|---|---|---|
| `STORAGE_PROVIDER` | (gcs) | Set to `local` to switch to filesystem. |
| `GCS_BUCKET` | (required for gcs) | Bucket name for photos. |
| `GCLOUD_PROJECT_ID` | optional | GCP project. |
| `GCLOUD_KEY_FILE` | optional | Service-account JSON path; falls back to `GOOGLE_APPLICATION_CREDENTIALS`. |
| `LOCAL_UPLOAD_DIR` | `server/uploads` | Filesystem root when `STORAGE_PROVIDER=local`. |
| `LOCAL_UPLOAD_BASE_URL` | `http://127.0.0.1:<PORT>` | Base for local URLs. |

### AI services (HTTP clients)

| Variable | Default |
|---|---|
| `ML1_SERVICE_URL` | `http://localhost:8001` |
| `ML2_SERVICE_URL` | `http://localhost:8002` |
| `AI_SERVER_URL` | `http://localhost:8081` |
| `ML_CALL_MAX_RETRIES` | `2` |
| `ML_CALL_RETRY_BASE_MS` | `400` |

### Fatigue alert behavior

| Variable | Default | Purpose |
|---|---|---|
| `ML2_SEQUENCE_WINDOW_SIZE` | `20` | Number of frames sent to ML2 per call. |
| `ML_ALERT_MIN_CONFIDENCE` | `0.75` | Minimum ML1 confidence for an alert. |
| `ML_ALERT_MIN_SEVERITY` | `0.7` | Minimum ML2 severity for an alert. |
| `ML_ALERT_CONSECUTIVE_FRAMES` | `2` | Required consecutive drowsy/sleeping frames. |
| `FATIGUE_ALERT_COOLDOWN_MS` | `45000` | Per-session alert cooldown. |
| `FATIGUE_ALERT_MIN_CONFIDENCE` | `0.6` | Lower bound for triggering the alert path. |
| `FATIGUE_ALERT_MIN_LEVEL` | `0.6` | Lower bound for `fatigueLevel`. |
| `SAFE_STOP_RECOMMENDATION_COOLDOWN_MS` | `120000` | Safe-stop emit cooldown. |
| `ML_WEBHOOK_API_KEY` | (required for `/api/fatigue/ml-detection`) | Shared secret expected in `x-ml-api-key`. |

### Spotify

| Variable | Required | Purpose |
|---|---|---|
| `SPOTIFY_CLIENT_ID` | yes (if Spotify enabled) | OAuth client. |
| `SPOTIFY_CLIENT_SECRET` | yes | OAuth secret. |
| `SPOTIFY_REDIRECT_URI` | yes | OAuth callback URL. |

### Google Maps

| Variable | Required | Purpose |
|---|---|---|
| `GOOGLE_MAPS_API_KEY` | yes | Used by `googleMapService` for Places + Directions. |

---

## ML1 service

Loaded by `ml1-service/app/core/config.py`. Prefix: `ML1_`.

### Service identity

| Variable | Default | Purpose |
|---|---|---|
| `ML1_SERVICE_NAME` | `WakeSafe ML1 Service` | Reported in `/health`. |
| `ML1_SERVICE_VERSION` | `2.0.0` | Reported in `/health`. |
| `ML1_LOG_LEVEL` | `INFO` | |
| `ML1_REQUEST_TIMEOUT_SECONDS` | `10.0` | HTTP fetch timeout for `image_url`. |

### Model artifacts

| Variable | Default |
|---|---|
| `ML1_MODELS_DIR` | `<repo>/ml1-service/models` |
| `ML1_FACE_DETECTOR_XML` | `face-detection-retail-0004.xml` |
| `ML1_FACE_DETECTOR_MIN_CONFIDENCE` | `0.5` |
| `ML1_LANDMARKS_XML` | `landmarks-regression-retail-0009.xml` |
| `ML1_EYE_CLASSIFIER_XML` | `wakesafe-eye-v1.0.0.xml` |
| `ML1_EYE_CLASSIFIER_ONNX` | `wakesafe-eye-v1.0.0.onnx` |
| `ML1_EYE_CLASSIFIER_OPEN_INDEX` | `1` |
| `ML1_MODEL_VERSION` | `wakesafe-eye-v1.0.0` |
| `ML1_MODEL_CHECKSUM_SHA384` | `927c44a3...c2e8` (96 hex chars) |
| `ML1_RUNTIME` | `openvino` (`openvino` or `onnxruntime`) |
| `ML1_DEVICE` | `CPU` (any OpenVINO device, e.g., `GPU`, `AUTO`). |

### Decision thresholds

| Variable | Default | Notes |
|---|---|---|
| `ML1_EYE_CROP_SCALE` | `1.0` | Eye crop side length / inter-eye distance. |
| `ML1_PARTIAL_LOW` | `0.4` | Lower bound of PARTIAL band on `p_open`. |
| `ML1_PARTIAL_HIGH` | `0.6` | Upper bound. |
| `ML1_CONFIDENCE_THRESHOLD` | `0.55` | Below this we report `UNKNOWN`. |
| `ML1_ENABLE_HEURISTIC_FALLBACK` | `false` | Must remain `false` in production. |

---

## ML2 service

Loaded by `ml2-service/app/core/config.py`. Prefix: `ML2_`.

| Variable | Default | Purpose |
|---|---|---|
| `ML2_SERVICE_NAME` | `WakeSafe ML2 Service` | |
| `ML2_SERVICE_VERSION` | `1.0.0` | |
| `ML2_LOG_LEVEL` | `INFO` | |
| `ML2_DROWSY_CLOSED_RATIO_THRESHOLD` | `0.35` | Triggers `drowsy`. |
| `ML2_SLEEPING_CLOSED_RATIO_THRESHOLD` | `0.7` | Triggers `sleeping`. |
| `ML2_AVG_CLOSURE_THRESHOLD` | `1.5` | Seconds. |
| `ML2_BLINK_RATE_LOW_THRESHOLD` | `6.0` | Per minute. |
| `ML2_BLINK_RATE_HIGH_THRESHOLD` | `30.0` | Per minute. |
| `ML2_PARTIAL_AS_CLOSED_WEIGHT` | `0.55` | Weight for `PARTIAL` frames in closure ratio. |
| `ML2_MIN_FRAMES_FOR_FATIGUE` | `4` | Required frames before fatigue can trigger. |

---

## Mobile (Expo / React Native)

Configured in `WakeSafeMobile/.env` and `WakeSafeMobile/.env.local`:

| Variable | Purpose |
|---|---|
| `EXPO_PUBLIC_API_URL` | Backend HTTPS base. |
| `EXPO_PUBLIC_WS_URL` | Backend WebSocket base. |
| `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` | Maps API key (for client-side maps). |

---

## Training pipeline

The training scripts read CLI flags only; they do not depend on env variables. Reproduce with:

```bash
pip install -r training/requirements.txt
python -m training.train --epochs 12 --batch-size 256 --output-dir training/runs/v1
python -m training.export --checkpoint training/runs/v1/best.pt --build-ir
```

The exported artifact is dropped into `ml1-service/models/wakesafe-eye-v1.0.0.{onnx,xml,bin}` and consumed by ML1 via the variables above.
