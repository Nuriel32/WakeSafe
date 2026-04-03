# WakeSafe ML1 Service
<!-- CI/CD smoke-change marker: ml1 -->

`ml1-service` is a stateless FastAPI microservice for frame-level visual analysis (eye state, confidence, EAR, head pose). It does not produce final fatigue classes (`alert`, `drowsy`, `sleeping`); that is delegated to ML2.

## What it does

- Accepts a single image via `image_url` or `image_base64`.
- Runs preprocessing + deterministic placeholder inference through a pluggable model abstraction.
- Returns frame-level analysis compatible with existing backend `Photo.aiResults` and `FatigueLog` mappings.

## Run locally

```bash
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8001 --reload
```

## Run with Docker

```bash
docker build -t wakesafe-ml1 .
docker run --rm -p 8001:8001 wakesafe-ml1
```

## Endpoints

- `GET /health`
- `POST /predict`

## Sample request

```json
{
  "image_url": "https://images.pexels.com/photos/935743/pexels-photo-935743.jpeg",
  "user_id": "u_123",
  "session_id": "s_456",
  "image_id": "img_789",
  "image_metadata": {
    "sequence_number": 17,
    "capture_timestamp": 1712312312
  }
}
```

## Sample response

```json
{
  "image_id": "img_789",
  "session_id": "s_456",
  "frame_analysis": {
    "eye_state": "PARTIAL",
    "confidence": 0.77,
    "ear": 0.22,
    "head_pose": {
      "pitch": -0.9,
      "yaw": 2.2,
      "roll": 0.8
    },
    "processing_time_ms": 22,
    "processed_at": "2026-03-31T22:00:00.000000+00:00"
  },
  "status": "success"
}
```

## Integration note

This service is stateless and JSON-only, intended for later integration with the existing backend persistence layer. It does not write to MongoDB, Redis, WebSocket, auth, or frontend/mobile logic.
