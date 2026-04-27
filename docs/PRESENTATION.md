---
marp: true
title: WakeSafe — Driver Fatigue Detection
description: One-slide-per-section presentation deck (Marp / Slidev compatible)
paginate: true
theme: default
---

# WakeSafe

### Real-time driver fatigue detection on any smartphone

**Final-Year Project**
WakeSafe Team

---

## Overview

- Real-time fatigue detection using the front camera of any smartphone.
- Built for active drivers, fleet operators, and ride-share professionals.
- Captures **1 photo / second**, classifies the driver's eye state, and raises an alert before drowsiness becomes dangerous.
- Software-only — no special hardware required.

---

## Problem Statement

- Driver fatigue causes ~20% of serious crashes worldwide.
- Long-haul drivers routinely work 8–14 hour shifts.
- Drivers consistently underestimate their own drowsiness.
- Existing solutions are either expensive (built into premium cars) or intrusive (wearables).
- **Gap**: an affordable, real-time, software-only fatigue monitor.

---

## Solution

- Mobile camera streams frames continuously.
- Two-stage ML pipeline:
  - **ML1** classifies each frame's eye state.
  - **ML2** interprets a sequence of frames into `alert / drowsy / sleeping`.
- Real-time alerts over WebSocket.
- Recommends nearest safe stop via Google Maps when fatigue is critical.

---

## System Architecture

```
[Mobile] -- HTTPS upload --> [Node Backend (Express, MVC)]
                                  |
                                  v
                  +-------------- + ---------------+
                  |               |                |
              [MongoDB]        [Redis]         [Google Cloud Storage]
                                  |
                                  v
                       [ML1 Service (FastAPI + OpenVINO)]
                                  |
                                  v
                       [ML2 Service (FastAPI)]
                                  |
                                  v
                       Backend emits WebSocket -> [Mobile]
```

- All services containerized and deployed on Cloud Run.
- Socket.IO carries real-time alerts back to the device.

---

## Core Technologies

- **Mobile**: React Native / Expo
- **Backend**: Node.js, Express, Socket.IO
- **AI services**: Python, FastAPI, PyTorch (training), OpenVINO (inference)
- **Database**: MongoDB Atlas
- **Cache / pub-sub**: Redis
- **Object storage**: Google Cloud Storage
- **Hosting**: Google Cloud Run

---

## Key Features

- Real-time per-frame inference (60–80 ms per frame on CPU).
- Cross-person generalization — validated on people the model has never seen.
- Severity-aware alerts: `info`, `warning`, `critical`.
- Safe-stop recommendation when severity is critical.
- Per-session statistics: photos, predictions, processing time.
- Authentication, JWT revocation, rate limiting, CORS allow-list.

---

## Challenges

- **Accuracy across faces** → trained a dedicated CNN with subject-held-out splits.
- **Real-time latency** → OpenVINO IR with baked preprocessing + singleton model loader.
- **Computer-vision edge cases** → replaced Haar eye detection with learned landmarks; eye crop sized by inter-eye distance.
- **Service integration** → strict Pydantic / Mongoose schemas + idempotent event handlers + Redis dedupe.

---

## Results

| Dataset | Accuracy |
|---|---:|
| MRL test (held-out subjects) | **97.18%** |
| MRL random sample (classifier alone) | **98.83%** |
| CEW Faces (multi-person, full pipeline) | **93.43%** |
| WakeSafe live session (6 labeled frames) | **100%** |

- Inference latency: **60–80 ms / frame** on CPU.
- Model footprint: **590 KB ONNX**, 146,546 parameters.

---

## Demo Flow

1. Login on the mobile app.
2. Start driving session — WebSocket connects, server confirms.
3. Eyes open → state stays `alert`.
4. Eyes closed for several seconds → state shifts to `drowsy`, then `sleeping`.
5. Phone plays alarm and shows banner; safe-stop recommendation appears.
6. Eyes open again → state returns to `alert`.
7. End session — show summary (frames, events, statistics).

---

## Custom-Trained Model

- **Architecture**: `WakeSafeEyeNet`, custom 5-block CNN.
- **Parameters**: 146,546 (~590 KB).
- **Input**: 32×32 BGR eye crop.
- **Training data**: MRL Eye Dataset, ~85k images, 37 distinct subjects.
- **Split**: subject-based — train, val and test contain different people.
- **Training**: 12 epochs, AdamW, cosine LR — ~4.5 minutes on RTX 3070.

---

## Reproducibility

```bash
pip install -r training/requirements.txt
python -m training.train --epochs 12 --batch-size 256 \
    --output-dir training/runs/v1
python -m training.export --checkpoint training/runs/v1/best.pt \
    --build-ir
```

- Checkpoint, ONNX, and OpenVINO IR are committed to the repo.
- `training/MODEL_CARD.md` documents architecture, splits, recipe, metrics, license.
- `scripts/evaluate_eye_state_model.py` reproduces every metric.

---

## What's Next

- Integrate WakeSafe captures into a `wakesafe-eye-v1.1.0` retrain.
- Replace ML2 rule engine with a trained sequence model (LSTM / GRU).
- Add telemetry: model drift, real-world precision/recall over time.
- Optional: on-device inference path for offline use.

---

## Thank you

- Repository, model card, and API docs available in this codebase.
- Live demo and Q&A.
