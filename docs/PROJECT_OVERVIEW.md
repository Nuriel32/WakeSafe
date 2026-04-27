# WakeSafe — Project Overview

A presentation-ready description of the WakeSafe driver fatigue detection system, suitable for a final-year project review.

---

## 1. Overview

**WakeSafe** is a real-time driver fatigue detection system designed for active drivers, fleet operators, and ride-share professionals. The mobile application continuously captures the driver's face using the front camera, streams the frames to a cloud backend, and applies a two-stage machine-learning pipeline to classify the driver's state (alert, drowsy, sleeping). When fatigue is detected, the system raises an immediate audio-visual alert on the device and recommends the nearest safe stop.

The product is intended for any driver who spends extended hours behind the wheel, where micro-sleeps and prolonged blinks are a known cause of road accidents.

---

## 2. Problem Statement

Driver fatigue is a leading cause of road accidents worldwide. Studies estimate that drowsiness contributes to roughly **20% of serious crashes**, comparable to drunk driving. Practical implications:

- Long-haul truck and delivery drivers often work shifts of 8–14 hours.
- Fatigue impairment is gradual and self-assessment is unreliable — drivers underestimate their own drowsiness.
- Existing in-car solutions are expensive (built into premium vehicles) or intrusive (wearables).
- Most drivers already carry a smartphone with a front camera that goes unused while driving.

**The real problem WakeSafe solves**: provide an affordable, software-only, real-time fatigue monitor that runs on a driver's existing phone — no extra hardware required.

---

## 3. Solution

WakeSafe captures one photo per second from the device's front camera, sends each frame to a cloud pipeline that runs computer-vision models, and decides whether the driver is becoming drowsy based on a sliding window of recent frames.

What makes the solution distinctive:

- **Custom trained CNN** for eye-state classification (`wakesafe-eye-v1.0.0`), trained on a subject-held-out split of the MRL Eye Dataset — it generalizes to people the model has never seen.
- **Two-stage ML pipeline**: a per-frame classifier (ML1) followed by a temporal decision engine (ML2) that interprets sequences of frames. This drastically reduces false positives caused by single blinks.
- **End-to-end real-time** via WebSockets: frame upload, AI processing, and alert delivery happen in the same continuous channel, with sub-second latency.
- **Cloud-native and scalable**: containerized services deployed on Google Cloud Run, with MongoDB for persistence and Redis for caching and event deduplication.
- **Safety follow-through**: when fatigue is confirmed, the system queries Google Maps for the nearest safe stop and sends the recommendation to the driver's device.

---

## 4. System Architecture

### Components

| Layer | Technology | Responsibility |
|---|---|---|
| Mobile client | React Native / Expo | Camera capture, session management, alert UX |
| Backend API | Node.js, Express, MVC | Auth, photo ingestion, orchestration, WebSocket gateway |
| ML1 service | FastAPI (Python) + OpenVINO + ONNX | Frame-level eye-state classification |
| ML2 service | FastAPI (Python) | Temporal decision engine (alert/drowsy/sleeping) |
| Database | MongoDB Atlas | Users, sessions, photos, fatigue events, AI results |
| Cache / pub-sub | Redis | Token revocation, event deduplication, hot reads |
| Object storage | Google Cloud Storage | Raw photo persistence |
| Maps integration | Google Maps Places + Directions APIs | Nearest safe-stop recommendations |
| Hosting | Google Cloud Run | Containerized auto-scaling deployment |

### Data flow (per frame)

1. The mobile app captures a photo every second.
2. The photo is uploaded to the backend over HTTPS (or via a presigned GCS URL); the backend writes the binary to **GCS** and a metadata record to **MongoDB**.
3. The backend asynchronously calls **ML1** with a signed URL.
4. **ML1** runs three models in sequence on the frame:
   - Face detection (`face-detection-retail-0004`) — locates the driver's face.
   - 5-point landmarks (`landmarks-regression-retail-0009`) — extracts both eye centers.
   - **WakeSafe Eye-State CNN** (`wakesafe-eye-v1.0.0`) — classifies each eye crop as OPEN or CLOSED with a probability.
5. The backend appends the new frame to the recent sequence (stored in MongoDB, capped window) and calls **ML2** with the sequence.
6. **ML2** computes temporal features (closed-eye ratio, average closure duration, blink rate) and decides the state.
7. If a fatigue event is confirmed, the backend emits a `driver_fatigue_alert` over WebSocket to the user's room; Redis ensures the same event is not delivered twice.
8. If the severity is high enough, the backend queries Google Maps and emits a `fatigue_safe_stop` recommendation alongside the alert.
9. The mobile client receives the alert and triggers a sound + visual warning.

---

## 5. Core Technologies

| Technology | Why chosen |
|---|---|
| **React Native / Expo** | One codebase for Android and iOS with native camera access; fast iteration. |
| **Node.js + Express (MVC)** | Mature ecosystem, Socket.IO support, simple to deploy on Cloud Run. |
| **Python + FastAPI** | Standard for ML serving, excellent type-safe request/response, native OpenVINO + PyTorch interop. |
| **PyTorch (training) + OpenVINO (inference)** | Train on GPU, deploy CPU-friendly via ONNX/IR — same pipeline works in development and production. |
| **MongoDB** | Flexible schema for evolving AI metadata (frame analysis, head pose, eye state, etc.). |
| **Redis** | Sub-millisecond cache, dedupe of WebSocket events, JWT revocation. |
| **Google Cloud Storage** | Durable photo storage with signed URL access for ML services. |
| **Google Cloud Run** | Auto-scaling, container-based deployment that scales to zero when idle. |
| **Socket.IO** | Real-time bi-directional channel with auth middleware and rooms. |

---

## 6. Key Features

- **Real-time fatigue detection** at one frame per second with end-to-end latency under one second.
- **Two-stage AI pipeline** (frame classification + temporal decision) that reduces false positives from natural blinks.
- **Cross-person generalization** — the model was validated on subjects it never saw during training.
- **Live alerts** via WebSocket with severity levels (low / medium / high) and action recommendations.
- **Safe-stop recommendation** — Google Maps integration for nearest rest spot when severity is critical.
- **Session lifecycle** — drivers start and end driving sessions explicitly; each session aggregates statistics, route data, and detected events.
- **Authentication and security** — JWT-based with revocation tracked in Redis; rate limiting and CORS allow-listing.
- **Cache-busting and deduplication** — the same photo or event is never processed or alerted twice.
- **Observability** — structured logging, monitoring service hooks, and per-photo processing metrics.
- **Spotify integration** — optional, lets drivers control music without leaving the app.

---

## 7. Challenges

### Accuracy and generalization
The first version of ML1 was a heuristic threshold model that worked on one face but failed for another. We replaced it with a **trained CNN**, validated using a **subject-held-out split** to guarantee cross-person robustness. Result: 97% accuracy on people the model never saw.

### Real-time pipeline performance
Initial inference round-trips were too slow for one-frame-per-second cadence. Mitigations:
- Compiled the eye classifier to OpenVINO IR with baked-in preprocessing.
- Cached compiled models as a process-wide singleton.
- Async WebSocket emission with Redis-based deduplication.

### Edge cases in computer vision
Eye localization with classical Haar cascades was unreliable on close-up faces. We replaced it with a learned 5-point landmark regressor, fixed the eye crop size as a fraction of inter-eye distance, and verified on a multi-person dataset (CEW Faces) that the pipeline holds up.

### Service integration
The pipeline crosses four services (mobile, backend, ML1, ML2) and three external systems (MongoDB, Redis, GCS). We adopted strict request/response schemas (Pydantic on Python, Mongoose on Node), idempotent event handlers, and additive contract changes (new fields default to `None`) to keep upgrades safe.

---

## 8. Results

- **Frame-level model accuracy** (subject-held-out test set, 2,659 unseen-subject samples): **97.18%** overall, **96.84%** balanced.
- **Cross-dataset accuracy** (CEW Faces, multi-person, low-resolution): **93.43%**.
- **Real-world session test** (six labeled frames from a live driver): **6 of 6 correct**, including the open-eye frame at 100% confidence and all closed-eye frames at ≥99% confidence.
- **Inference latency**: 60–80 ms per frame on a single CPU container; well within the 1 frame/sec budget.
- **Model size**: 590 KB ONNX, 146,546 parameters — fits comfortably in any deployment environment.
- **Stability**: heartbeat-based WebSocket health checks, automatic stale-connection cleanup, fail-open Redis revocation, and graceful shutdown.

---

## 9. Demo Flow (5–10 min presentation)

### Introduction (1 min)
"WakeSafe is a real-time fatigue detection system that turns any smartphone into a driver-safety device. It runs a custom-trained convolutional neural network on every frame coming from the front camera and warns the driver before drowsiness becomes dangerous."

### Architecture walkthrough (2 min)
- Show the architecture diagram.
- Briefly explain the two-stage AI pipeline (frame model + temporal model).
- Mention the cloud stack: Cloud Run, MongoDB, Redis, GCS.

### Live demo (3–4 min)
1. **Login** on the mobile app.
2. **Start a driving session** — show the WebSocket connecting and the server sending a session-started event.
3. **Look at the camera with eyes open** — terminal shows `eye_state=OPEN`, `p_open≈1.0`, system reports `alert`.
4. **Close eyes for 3–5 seconds** — terminal shows `eye_state=CLOSED` for several frames, ML2 shifts to `drowsy` then `sleeping`, the phone plays an audio alert and shows a banner.
5. **Open eyes again** — system returns to `alert`.
6. **End session** — show the session summary view (total frames, fatigue events, processing stats).

### Backend / training story (1–2 min)
- Show the `training/MODEL_CARD.md` and the per-epoch training logs.
- Highlight the subject-held-out methodology.
- Show the evaluation script output on the held-out test set.

### Closing (30 sec)
"The end result is an affordable, software-only fatigue monitor with measured 97% accuracy on people the model has never seen, real-time end-to-end latency under one second, and a reproducible training and deployment pipeline."

---

## 10. Authorship and References

- Architecture, training pipeline, mobile and backend code, and trained model authored in this repository.
- Pretrained companion models from Intel OpenVINO `open_model_zoo` (face detection and 5-point landmarks).
- MRL Eye Dataset (CTU Prague) used for the WakeSafe Eye-State CNN; cited per the dataset's research-use license.
- See `training/MODEL_CARD.md` for full training details and metrics.
