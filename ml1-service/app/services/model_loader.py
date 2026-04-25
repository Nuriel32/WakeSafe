"""ML1 model loader.

Loads three OpenVINO models that together recognize eye state:

* ``face-detection-retail-0004`` — locates the face bounding box.
* ``landmarks-regression-retail-0009`` — 5 facial landmarks (eye centers,
  nose tip, mouth corners) used to crop both eyes.
* ``open-closed-eye-0001`` — binary classifier that returns the probability
  of OPEN vs CLOSED for each eye patch.

The classifier is consumed via an OpenVINO IR copy that has the documented
mean/scale preprocessing baked into the graph (see ``models/`` folder and
``model.yml`` for the original conversion arguments).
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Optional

import cv2
import numpy as np
import openvino as ov

from app.core.config import settings


@dataclass(frozen=True)
class FaceBox:
    x: int
    y: int
    width: int
    height: int
    confidence: float


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


class EyeStateModelProvider:
    """High-level access point for the ML1 model stack.

    The provider keeps each compiled model in memory once per process and
    exposes thin numpy-friendly methods for face detection, landmark
    extraction, and eye-state classification.
    """

    def __init__(self) -> None:
        self._core = ov.Core()
        self._face_model = self._compile(settings.face_detector_xml)
        self._lm_model = self._compile(settings.landmarks_xml)
        self._eye_model = self._compile(settings.eye_classifier_xml)

        self._face_input_name = self._face_model.inputs[0].any_name
        self._face_output = self._face_model.outputs[0]
        self._lm_output = self._lm_model.outputs[0]
        self._eye_output = self._eye_model.outputs[0]

    # ---- public properties ----
    @property
    def model_version(self) -> str:
        return settings.model_version

    # ---- face detection ----
    def detect_face(self, bgr_image: np.ndarray) -> Optional[FaceBox]:
        if bgr_image is None or bgr_image.size == 0:
            return None
        height, width = bgr_image.shape[:2]
        resized = cv2.resize(bgr_image, (300, 300)).astype(np.float32)
        tensor = np.transpose(resized, (2, 0, 1))[None, ...]

        result = self._face_model(tensor)[self._face_output]
        detections = result.reshape(-1, 7)

        best: Optional[FaceBox] = None
        best_area = 0
        threshold = settings.face_detector_min_confidence
        for det in detections:
            score = float(det[2])
            if score < threshold:
                continue
            x1 = max(0, int(det[3] * width))
            y1 = max(0, int(det[4] * height))
            x2 = min(width - 1, int(det[5] * width))
            y2 = min(height - 1, int(det[6] * height))
            w = x2 - x1
            h = y2 - y1
            if w <= 0 or h <= 0:
                continue
            area = w * h
            if area > best_area:
                best_area = area
                best = FaceBox(x=x1, y=y1, width=w, height=h, confidence=score)
        return best

    # ---- landmark detection ----
    def predict_landmarks(
        self, bgr_image: np.ndarray, face: FaceBox
    ) -> Optional[FaceLandmarks]:
        face_crop = bgr_image[
            face.y : face.y + face.height,
            face.x : face.x + face.width,
        ]
        if face_crop.size == 0:
            return None

        resized = cv2.resize(face_crop, (48, 48)).astype(np.float32)
        tensor = np.transpose(resized, (2, 0, 1))[None, ...]
        out = self._lm_model(tensor)[self._lm_output].reshape(-1)
        if out.size < 10:
            return None

        def to_abs(idx: int) -> tuple[int, int]:
            ax = int(out[idx * 2] * face.width) + face.x
            ay = int(out[idx * 2 + 1] * face.height) + face.y
            return ax, ay

        return FaceLandmarks(
            left_eye=to_abs(0),
            right_eye=to_abs(1),
            nose=to_abs(2),
            left_mouth=to_abs(3),
            right_mouth=to_abs(4),
        )

    # ---- eye classifier ----
    def classify_eye(self, eye_patch: np.ndarray) -> EyeProbabilities:
        if eye_patch is None or eye_patch.size == 0:
            return EyeProbabilities(p_open=0.0, p_closed=0.0)
        if eye_patch.ndim == 2:
            eye_patch = cv2.cvtColor(eye_patch, cv2.COLOR_GRAY2BGR)
        resized = cv2.resize(eye_patch, (32, 32)).astype(np.float32)
        tensor = np.transpose(resized, (2, 0, 1))[None, ...]
        out = self._eye_model(tensor)[self._eye_output].reshape(-1)
        open_idx = settings.eye_classifier_open_index
        closed_idx = 1 - open_idx
        return EyeProbabilities(
            p_open=float(out[open_idx]),
            p_closed=float(out[closed_idx]),
        )

    # ---- helpers ----
    def _compile(self, filename: str):
        path: Path = settings.model_path(filename)
        if not path.exists():
            raise FileNotFoundError(f"ML1 model artifact missing: {path}")
        return self._core.compile_model(self._core.read_model(path), settings.device)


_provider: Optional[EyeStateModelProvider] = None


def load_model_provider() -> EyeStateModelProvider:
    """Return a process-wide singleton model provider."""
    global _provider
    if _provider is None:
        _provider = EyeStateModelProvider()
    return _provider
