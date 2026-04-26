# ML1 Service — Frame-Level Eye-State Classifier

FastAPI microservice that classifies a single image frame's eye state using the **WakeSafe Eye-State CNN** (`wakesafe-eye-v1.0.0`) trained in this repository, with face localization provided by Intel OpenVINO open_model_zoo models.

- Source: `ml1-service/`
- Default port: `8001` (configurable via `PORT`)
- Runtime: Python 3.10, OpenVINO, ONNX, OpenCV
- Internal-only: not exposed publicly; reached over the internal network from the backend (`mlAdapter.ml1Predict`).

## Endpoints

### `GET /health`

Health probe. No auth.

**Response (200)**:
```json
{ "status": "ok", "service": "ml1-service" }
```

---

### `POST /predict`

Run face detection + landmarks + eye-state classification on a single image.

**Request body** (`ML1PredictRequest`):

```json
{
  "image_url": "https://...",          // OR image_base64 (one of the two is required)
  "image_base64": "data:image/...",
  "user_id": "650...",
  "session_id": "650...",
  "image_id": "650...",
  "image_metadata": {
    "sequence_number": 0,
    "capture_timestamp": 1730000000000
  }
}
```

- `image_url` may be a public/signed HTTPS URL or, for development, a local filesystem path (handled by `app/utils/image_loader.py`).
- `image_base64` may include the `data:image/...;base64,` prefix; it is stripped automatically.
- Either `image_url` or `image_base64` is required (validated by `model_validator(mode="after")`).

**Response (200)** (`ML1PredictResponse`):

```json
{
  "image_id": "650...",
  "session_id": "650...",
  "frame_analysis": {
    "eye_state": "OPEN",                // "OPEN" | "CLOSED" | "PARTIAL" | "UNKNOWN"
    "confidence": 1.0,                  // 0..1
    "ear": 0.30,                        // approximate, mapped from eye_state
    "vision_status": "ok",              // "ok" | "no_eyes_detected"
    "guidance_message": null,           // human-readable hint when vision_status != ok
    "head_pose": { "pitch": 19.2, "yaw": 0.7, "roll": 0.8 },
    "processing_time_ms": 67,
    "processed_at": "2026-04-26T11:21:40.497Z",
    "model_version": "wakesafe-eye-v1.0.0",
    "p_open": 1.0,                      // 0..1, average over both eyes
    "p_closed": 0.0,                    // 0..1
    "eyes_used": 2                      // 0, 1, or 2
  },
  "status": "success"
}
```

**Errors**:

- `422 Unprocessable Entity` — payload validation failed.
- `500 Internal Server Error` — unhandled inference error (the response body says `"Failed to process image"`).

---

## Internal classes

### `EyeStateModelProvider`
File: `ml1-service/app/services/model_loader.py`

Process-wide singleton that owns three OpenVINO models and exposes thin numpy-friendly methods.

| Method | Returns | Description |
|---|---|---|
| `model_version` *(property)* | `str` | Returns `settings.model_version`. |
| `detect_face(bgr_image: np.ndarray)` | `FaceBox \| None` | Runs `face-detection-retail-0004`, returns the largest detection above `face_detector_min_confidence`. |
| `predict_landmarks(bgr_image, face: FaceBox)` | `FaceLandmarks \| None` | Runs `landmarks-regression-retail-0009` on the face crop and returns 5 absolute-coordinate points. |
| `classify_eye(eye_patch: np.ndarray)` | `EyeProbabilities` | Runs `wakesafe-eye-v1.0.0` on a 32×32 BGR patch and returns softmaxed `(p_open, p_closed)`. |

Constructor compiles all three models with OpenVINO (`device=settings.device`, default `CPU`). Models are read from `settings.models_dir`.

#### Dataclasses

```python
@dataclass(frozen=True)
class FaceBox:
    x: int; y: int; width: int; height: int; confidence: float

@dataclass(frozen=True)
class FaceLandmarks:
    left_eye: tuple[int, int]
    right_eye: tuple[int, int]
    nose: tuple[int, int]
    left_mouth: tuple[int, int]
    right_mouth: tuple[int, int]

@dataclass(frozen=True)
class EyeProbabilities:
    p_open: float
    p_closed: float
```

#### Module-level

- `load_model_provider() -> EyeStateModelProvider` — returns the singleton.

---

### `PreprocessingService`
File: `ml1-service/app/services/preprocessing_service.py`

Detector + landmark-driven eye crop extractor. Accepts a PIL image; produces square BGR eye patches whose side length is `eye_crop_scale × inter-eye distance`.

| Method | Returns | Description |
|---|---|---|
| `preprocess(image: PIL.Image)` | `PreprocessedFrame` | Runs face → landmarks → eye crops. On failure, populates `failure_reason` (`'no_face'`, `'no_landmarks'`, `'no_eye_patches'`). |

```python
@dataclass
class PreprocessedFrame:
    bgr_image: np.ndarray
    face: FaceBox | None
    landmarks: FaceLandmarks | None
    eye_patches: list[np.ndarray]
    failure_reason: str | None
```

---

### `FrameInferenceService`
File: `ml1-service/app/services/inference_service.py`

Orchestrates the full pipeline and produces an `ML1PredictResponse`.

| Method | Returns | Description |
|---|---|---|
| `predict(payload: ML1PredictRequest)` | `ML1PredictResponse` | Loads the image, runs the preprocessor, classifies each eye patch, averages probabilities, decides eye state, returns the response with timings and metadata. |

Decision logic (`_decide`):
- `partial_low ≤ p_open ≤ partial_high` → `PARTIAL` (default 0.4 ≤ p_open ≤ 0.6).
- `p_open > partial_high` and `p_open ≥ confidence_threshold` → `OPEN`.
- `p_open < partial_low` and `p_closed ≥ confidence_threshold` → `CLOSED`.
- Otherwise → `UNKNOWN`.

If preprocessing returns no eye patches, the service emits `eye_state="UNKNOWN"`, `vision_status="no_eyes_detected"`, and a `guidance_message` derived from the failure reason.

`_head_pose_from(landmarks)` returns a coarse 2D head-pose proxy computed from the landmark geometry (roll from inter-eye angle, yaw/pitch from nose offset).

---

### Schemas

File: `ml1-service/app/schemas/`

#### `ML1PredictRequest` — `request.py`

| Field | Type | Required | Notes |
|---|---|---|---|
| `image_url` | `str?` | conditional | Either `image_url` or `image_base64` is required. |
| `image_base64` | `str?` | conditional | |
| `user_id` | `str?` | no | |
| `session_id` | `str?` | no | |
| `image_id` | `str?` | no | |
| `image_metadata.sequence_number` | `int?` | no | |
| `image_metadata.capture_timestamp` | `int?` | no | |

#### `ML1PredictResponse` — `response.py`

| Field | Type | Notes |
|---|---|---|
| `image_id` | `str?` | echoed |
| `session_id` | `str?` | echoed |
| `frame_analysis` | `FrameAnalysisResponse?` | see below |
| `status` | `'success' \| 'failed'` | |

#### `FrameAnalysisResponse`

| Field | Type | Notes |
|---|---|---|
| `eye_state` | `Literal['OPEN','CLOSED','PARTIAL','UNKNOWN']` | |
| `confidence` | `float` | 0..1 |
| `ear` | `float?` | mapped from `eye_state` |
| `vision_status` | `Literal['ok','no_eyes_detected']` | |
| `guidance_message` | `str?` | |
| `head_pose` | `HeadPoseResponse` | `pitch`, `yaw`, `roll` (each `float?`) |
| `processing_time_ms` | `int` | ≥ 0 |
| `processed_at` | `datetime` | UTC |
| `model_version` | `str?` | e.g. `wakesafe-eye-v1.0.0` |
| `p_open` | `float?` | 0..1 |
| `p_closed` | `float?` | 0..1 |
| `eyes_used` | `int?` | ≥ 0 |

#### `HealthResponse`

| Field | Type |
|---|---|
| `status` | `str` |
| `service` | `str` |

---

## Configuration

See [`CONFIGURATION.md`](./CONFIGURATION.md#ml1-service) for all `ML1_*` env variables. Key knobs:

- `ML1_EYE_CLASSIFIER_XML` — path/filename of the IR model used for inference (default `wakesafe-eye-v1.0.0.xml`).
- `ML1_EYE_CLASSIFIER_OPEN_INDEX` — output index for the OPEN class (default `1`).
- `ML1_EYE_CROP_SCALE` — eye crop side length as a multiple of inter-eye distance (default `1.0`).
- `ML1_PARTIAL_LOW`, `ML1_PARTIAL_HIGH`, `ML1_CONFIDENCE_THRESHOLD` — decision thresholds.
- `ML1_ENABLE_HEURISTIC_FALLBACK` — must remain `false` in production.
- `ML1_DEVICE` — OpenVINO device, default `CPU`.

## Companion model artifacts

Stored under `ml1-service/models/`:

| File | Origin |
|---|---|
| `wakesafe-eye-v1.0.0.onnx` / `.xml` / `.bin` | Trained in this repo (`training/`) |
| `face-detection-retail-0004.xml` / `.bin` | Intel OpenVINO open_model_zoo (pretrained) |
| `landmarks-regression-retail-0009.xml` / `.bin` | Intel OpenVINO open_model_zoo (pretrained) |
| `open_closed_eye.onnx` / `open_closed_eye_ir.*` | Optional fallback (`ML1_ENABLE_HEURISTIC_FALLBACK=true`) |

`scripts/fetch_ml1_models.py` downloads the Intel pretrained companions; `scripts/evaluate_eye_state_model.py` benchmarks the trained model on multiple datasets.
