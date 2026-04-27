# Model Card — WakeSafe Eye-State CNN (`wakesafe-eye-v1.0.0`)

## Overview

`wakesafe-eye-v1.0.0` is a binary eye-state classifier (`OPEN` / `CLOSED`) used by the `ml1-service` of the WakeSafe driver-fatigue monitoring pipeline. It is consumed per frame after a face detector localizes the driver and a landmark regressor extracts both eye centers; a square crop around each eye is fed into this model and the two probability vectors are averaged before the temporal `ml2-service` interprets the trend.

This model was trained from scratch in this repository. It is not a fine-tune of any third-party checkpoint.

## Architecture

`WakeSafeEyeNet` (see `training/model.py`):

- 5-block convolutional feature extractor (`Conv → BN → ReLU` × 7 with 3 max-pool stages).
- Channels: 16 → 16 → 32 → 32 → 64 → 64 → 128.
- Global average pooling → dropout(0.2) → linear(128 → 2).
- **146,546 trainable parameters** (~590 KB ONNX).

Input contract:

- Tensor name `input.1`, shape `[N, 3, 32, 32]`, dtype `float32`.
- Color order **BGR** (matches OpenCV defaults).
- Normalization: `(pixel − 127) / 255` (baked into the OpenVINO IR via `PrePostProcessor`).

Output contract:

- Tensor name `logits`, shape `[N, 2]`, raw logits.
- Class index `0` = closed, index `1` = open. The runtime applies softmax (`ml1-service/app/services/model_loader.py::classify_eye`).

## Training data

**MRL Eye Dataset** (Center for Machine Perception, CTU Prague, 2018).

- ~85k labeled eye-region crops across 37 distinct subjects.
- Label encoded at filename token index 4 (`s0001_00001_0_0_0_0_0_01.png` → subject `s0001`, label `0` = closed).
- License: research/non-commercial. Cite the original dataset when redistributing trained models.

## Splits — subject-held-out

Splits are built from the dataset by **distinct subject id**, not random per-image, so the validation and test partitions contain people the model never saw during training:

| Split | Open | Closed | Total | Subjects |
|---|---:|---:|---:|---:|
| Train | 39,610 | 36,626 | 76,236 | 29 |
| Val | 1,551 | 4,452 | 6,003 | 4 |
| Test | 1,791 | 868 | 2,659 | 4 |

## Training recipe

- Optimizer: `AdamW` (`lr=3e-3`, `weight_decay=1e-4`).
- Schedule: cosine annealing over 12 epochs.
- Loss: `CrossEntropyLoss` (logits target).
- Batch size: 256.
- Augmentations: random horizontal flip, brightness/contrast jitter, Gaussian blur, small rotation (±12°), small translation (±8%).
- Hardware: NVIDIA RTX 3070 (CUDA 12.1, PyTorch 2.5.1).
- Wall time: ~4.5 minutes for 12 epochs.

Reproduce with:

```bash
pip install -r training/requirements.txt
python -m training.train --epochs 12 --batch-size 256 --output-dir training/runs/v1
python -m training.export --checkpoint training/runs/v1/best.pt --build-ir
```

## Metrics

| Dataset | Samples | Accuracy | Balanced Accuracy | Open recall | Closed recall |
|---|---:|---:|---:|---:|---:|
| MRL **test** (held-out subjects, classifier alone) | 2,659 | **0.9718** | **0.9684** | 0.9782 | 0.9585 |
| MRL random subset (classifier alone, bypass detector) | 600 | **0.9883** | **0.9885** | 0.9840 | 0.9931 |
| CEW Faces (full pipeline: face detect → landmarks → classifier) | 396 | **0.9343** | **0.9343** | 0.9141 | 0.9545 |
| WakeSafe internal session (full pipeline) | 6 | **1.0000** | **1.0000** | 1.0000 | 1.0000 |

Every benchmark exceeds the third-party `open-closed-eye-0001` model previously used (95.33% MRL / 84.85% CEW / 100% session).

## Artifacts

Stored in `ml1-service/models/`:

| File | Purpose |
|---|---|
| `wakesafe-eye-v1.0.0.onnx` | Trained ONNX (logits output) |
| `wakesafe-eye-v1.0.0.xml` / `.bin` | OpenVINO IR with mean/scale baked in |

ONNX SHA-384:

```
927c44a3e8a860749ec5a06cc4bcae3d44b007112b1d8c529226163fecb764c3e206385624b1bb59f3d08f9eda34c2e8
```

## Intended use and limitations

- Used **only** as a frame-level eye-state classifier within the WakeSafe driver fatigue pipeline.
- Sequence-level decisions (`alert / drowsy / sleeping`) are made by `ml2-service`, not this model.
- Not validated for medical diagnosis or any decision other than fatigue alerts.
- Trained on MRL Eye Dataset which is heavily lab-collected; performance under extreme lighting, occlusion, sunglasses, or non-frontal head pose may degrade. Calibration on real WakeSafe captures is recommended before each rollout.

## Companion models

The pipeline still uses two pretrained Intel models for upstream localization:

- `face-detection-retail-0004` — face bounding box.
- `landmarks-regression-retail-0009` — 5-point landmarks (eye centers used here).

These are **not part of `wakesafe-eye-v1.0.0`** and are downloaded separately by `scripts/fetch_ml1_models.py`. They can be replaced with custom-trained models in a future iteration.

## Authorship and license

- Architecture and training code authored in this repository.
- Trained weights (`wakesafe-eye-v1.0.0.*`) belong to the WakeSafe project.
- MRL Eye Dataset: see the dataset's original license. When redistributing the trained model, cite the dataset.

## Versioning

- `wakesafe-eye-v1.0.0` — initial release. Trained on MRL only with the recipe above.
- Future versions should bump the patch/minor when retrained on additional WakeSafe captures, and the major when the architecture or input contract changes.
