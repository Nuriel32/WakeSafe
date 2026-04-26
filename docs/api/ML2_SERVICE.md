# ML2 Service — Temporal Fatigue Decision Engine

FastAPI microservice that takes a sequence of recent ML1 outputs and decides the driver's current state (`alert`, `drowsy`, `sleeping`, `unknown`).

- Source: `ml2-service/`
- Default port: `8002` (configurable via `PORT`)
- Internal-only: not exposed publicly; reached over the internal network from the backend (`mlAdapter.ml2Analyze`).
- The current implementation is a **rule-based decision engine** operating on temporal features. A learned sequence model is on the roadmap.

## Endpoints

### `GET /health`

Health probe. No auth.

**Response (200)**:
```json
{ "status": "ok", "service": "ml2-service" }
```

---

### `POST /analyze`

Compute temporal features from a sequence and emit a fatigue decision.

**Request body** (`ML2AnalyzeRequest`):

```json
{
  "user_id": "650...",
  "session_id": "650...",
  "sequence": [
    {
      "timestamp": "2026-04-26T11:20:00Z",
      "eye_state": "OPEN",
      "confidence": 0.98,
      "ear": 0.30,
      "head_pose": { "pitch": 0.0, "yaw": 0.0, "roll": 0.0 }
    },
    { "timestamp": "...", "eye_state": "CLOSED", "confidence": 0.99, "ear": 0.12 }
  ]
}
```

- `sequence` must be non-empty (validated at the schema level).
- Each item is sorted by `timestamp` server-side before features are extracted.

**Response (200)** (`ML2AnalyzeResponse`):

```json
{
  "user_id": "650...",
  "session_id": "650...",
  "driver_state": "drowsy",            // "alert" | "drowsy" | "sleeping" | "unknown"
  "fatigued": true,                    // true when state is drowsy or sleeping
  "severity": 0.83,                    // 0..1
  "features": {
    "blink_rate": 12.0,
    "avg_eye_closure_time": 0.42,
    "max_eye_closure_time": 1.2,
    "closed_eye_ratio": 0.55,
    "frame_count": 20
  },
  "processing_time_ms": 4,
  "processed_at": "2026-04-26T11:20:05Z"
}
```

**Errors**:

- `422 Unprocessable Entity` — payload validation failed.
- `500 Internal Server Error` — unhandled error (response body says `"Failed to analyze sequence"`).

---

## Internal classes

### `TemporalFeatureService`
File: `ml2-service/app/services/feature_service.py`

Computes temporal features from a sequence of `SequenceItem` objects.

| Field | Computation |
|---|---|
| `closed_eye_ratio` | Weighted closure count / total frames. `CLOSED` = 1.0; `PARTIAL` = `partial_as_closed_weight` (default 0.55). |
| `avg_eye_closure_time` | Mean duration (seconds) of contiguous closed runs. |
| `max_eye_closure_time` | Longest closed run duration (seconds). |
| `blink_rate` | Number of closures shorter than 0.8s, normalized to per-minute. |
| `frame_count` | Length of the sequence after sorting. |

```python
@dataclass(frozen=True)
class TemporalFeatures:
    blink_rate: float
    avg_eye_closure_time: float
    max_eye_closure_time: float
    closed_eye_ratio: float
    frame_count: int
```

---

### `RuleBasedDecisionEngine`
File: `ml2-service/app/services/decision_engine.py`

Maps `TemporalFeatures` to a `DecisionResult` using simple ratio rules.

```python
@dataclass(frozen=True)
class DecisionResult:
    driver_state: Literal["alert", "drowsy", "sleeping", "unknown"]
    fatigued: bool
    severity: float
```

Decision logic:

1. If `frame_count < min_frames_for_fatigue` → `alert`, severity 0.05.
2. If features are all zero → `alert`, severity 0.05.
3. Compute `sleeping_score = max(closed_ratio / sleeping_closed_ratio_threshold, avg_closure / (avg_closure_threshold * 2))`. If ≥ 1.0 → `sleeping`, severity ≈ 0.8 + 0.2·min(score, 1.5).
4. Compute `drowsy_score = max(closed_ratio / drowsy_closed_ratio_threshold, avg_closure / avg_closure_threshold, blink_rate_penalty)`. If ≥ 1.0 → `drowsy`, severity ≈ 0.45 + 0.35·min(score, 1.5).
5. Otherwise → `alert`, severity ≈ min(0.35, drowsy_score · 0.3).

`_blink_penalty(blink_rate)`:
- if `blink_rate < blink_rate_low_threshold`: penalty grows linearly toward 1 as blink rate approaches zero (suppressed blinks);
- if `blink_rate > blink_rate_high_threshold`: penalty grows linearly above the high threshold (excessive blinks);
- otherwise 0.

---

### `TemporalDecisionService`
File: `ml2-service/app/services/decision_service.py`

Glue between schemas, the feature service, and the decision engine.

| Method | Returns | Description |
|---|---|---|
| `analyze(payload: ML2AnalyzeRequest)` | `ML2AnalyzeResponse` | Sorts the sequence, computes features, calls the decision engine, returns the response with timing metadata. |

---

## Schemas

File: `ml2-service/app/schemas/`

### `ML2AnalyzeRequest` — `request.py`

| Field | Type | Required | Notes |
|---|---|---|---|
| `user_id` | `str?` | no | |
| `session_id` | `str?` | no | |
| `sequence` | `list[SequenceItem]` | yes | Non-empty. |

### `SequenceItem`

| Field | Type | Notes |
|---|---|---|
| `timestamp` | `datetime` | |
| `eye_state` | `Literal['OPEN','CLOSED','PARTIAL','UNKNOWN']` | |
| `confidence` | `float` | 0..1 |
| `ear` | `float?` | optional |
| `head_pose` | `HeadPoseInput` | `pitch`, `yaw`, `roll` each `float?`. |

### `ML2AnalyzeResponse` — `response.py`

| Field | Type | Notes |
|---|---|---|
| `user_id` | `str?` | echoed |
| `session_id` | `str?` | echoed |
| `driver_state` | `Literal['alert','drowsy','sleeping','unknown']` | |
| `fatigued` | `bool` | |
| `severity` | `float` | 0..1 |
| `features` | `FeatureResponse` | see below |
| `processing_time_ms` | `int` | ≥ 0 |
| `processed_at` | `datetime` | UTC |

### `FeatureResponse`

Mirrors `TemporalFeatures` exactly.

| Field | Type |
|---|---|
| `blink_rate` | `float` |
| `avg_eye_closure_time` | `float` |
| `max_eye_closure_time` | `float` |
| `closed_eye_ratio` | `float` |
| `frame_count` | `int` |

### `HealthResponse`

| Field | Type |
|---|---|
| `status` | `str` |
| `service` | `str` |

---

## Configuration

See [`CONFIGURATION.md`](./CONFIGURATION.md#ml2-service) for all `ML2_*` env variables. Key knobs:

- `ML2_DROWSY_CLOSED_RATIO_THRESHOLD` (default 0.35)
- `ML2_SLEEPING_CLOSED_RATIO_THRESHOLD` (default 0.7)
- `ML2_AVG_CLOSURE_THRESHOLD` (default 1.5 seconds)
- `ML2_BLINK_RATE_LOW_THRESHOLD` (default 6 per minute)
- `ML2_BLINK_RATE_HIGH_THRESHOLD` (default 30 per minute)
- `ML2_PARTIAL_AS_CLOSED_WEIGHT` (default 0.55)
- `ML2_MIN_FRAMES_FOR_FATIGUE` (default 4)
