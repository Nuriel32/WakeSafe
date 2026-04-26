# WakeSafe Eye-State Model — Training

This directory contains the training pipeline for the **WakeSafe Eye-State CNN**, a small custom convolutional classifier used by `ml1-service` to detect open vs. closed eyes per frame.

The trained ONNX/IR replaces the third-party `open-closed-eye-0001` weights so that ML1 ships with a model authored and trained in this repository.

## Files

- `dataset.py` — MRL Eye Dataset loader with **subject-based** train/val/test split.
- `model.py` — `WakeSafeEyeNet`, a custom 5-block CNN at 32×32 BGR input.
- `train.py` — CrossEntropy + AdamW + cosine LR; saves best checkpoint by val balanced accuracy.
- `export.py` — ONNX exporter (and optional OpenVINO IR with baked preprocessing).
- `MODEL_CARD.md` — datasets, architecture, metrics, license, authorship.

## Run

```bash
pip install -r training/requirements.txt
python -m training.train --epochs 12 --batch-size 256 --output-dir training/runs/v1
python -m training.export --checkpoint training/runs/v1/best.pt --build-ir
```

The exported `wakesafe-eye-v1.0.0.onnx` (and matching OpenVINO IR) is dropped into `ml1-service/models/`. Update the service config to point to it:

```bash
ML1_EYE_CLASSIFIER_XML=wakesafe-eye-v1.0.0.xml
ML1_EYE_CLASSIFIER_ONNX=wakesafe-eye-v1.0.0.onnx
ML1_MODEL_VERSION=wakesafe-eye-v1.0.0
ML1_EYE_CLASSIFIER_OPEN_INDEX=1   # WakeSafeEyeNet output is [closed, open]
```
