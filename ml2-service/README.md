# WakeSafe ML2 Service

`ml2-service` is a stateless FastAPI microservice for temporal fatigue decisioning over a full sequence of ML1 frame outputs.

## What it does

- Accepts a full per-request frame sequence (no server-side session memory).
- Sorts by timestamp, computes temporal fatigue features, and applies rule-based decision logic.
- Returns final driver state labels restricted to `alert | drowsy | sleeping | unknown`.

## Run locally

```bash
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8002 --reload
```

## Run with Docker

```bash
docker build -t wakesafe-ml2 .
docker run --rm -p 8002:8002 wakesafe-ml2
```

## Endpoints

- `GET /health`
- `POST /analyze`

## Sample request

```json
{
  "user_id": "u_123",
  "session_id": "s_456",
  "sequence": [
    {
      "timestamp": "2026-03-31T20:00:00Z",
      "eye_state": "OPEN",
      "confidence": 0.95,
      "ear": 0.28,
      "head_pose": {
        "pitch": 1.2,
        "yaw": -3.4,
        "roll": 0.5
      }
    },
    {
      "timestamp": "2026-03-31T20:00:01Z",
      "eye_state": "CLOSED",
      "confidence": 0.92,
      "ear": 0.14,
      "head_pose": {
        "pitch": 0.8,
        "yaw": -2.8,
        "roll": 0.4
      }
    }
  ]
}
```

## Sample response

```json
{
  "user_id": "u_123",
  "session_id": "s_456",
  "driver_state": "drowsy",
  "fatigued": true,
  "severity": 0.67,
  "features": {
    "blink_rate": 12.0,
    "avg_eye_closure_time": 0.6,
    "max_eye_closure_time": 0.6,
    "closed_eye_ratio": 0.5
  },
  "processing_time_ms": 3,
  "processed_at": "2026-03-31T22:00:00.000000+00:00"
}
```

## Integration note

This service is stateless and JSON-only, intended for integration with existing backend persistence and analytics flows. It does not perform MongoDB, Redis, auth, WebSocket, mobile, or frontend logic.
