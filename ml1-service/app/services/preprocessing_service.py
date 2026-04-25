"""Preprocessing for ML1.

Replaces the previous fixed-crop heuristic. The preprocessor now:

1. Converts the loaded PIL image to a BGR numpy array compatible with the
   OpenVINO models.
2. Runs face detection and landmark regression to locate the eyes.
3. Crops a square region around each eye landmark whose side length is a
   configurable multiple of the inter-eye distance.

Returning the eye patches (rather than a single fixed luminance feature
band) lets the trained classifier in ``model_loader`` make the actual
eye-state decision.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import List, Optional

import cv2
import numpy as np
from PIL import Image

from app.core.config import settings
from app.services.model_loader import (
    EyeStateModelProvider,
    FaceBox,
    FaceLandmarks,
)


@dataclass
class PreprocessedFrame:
    bgr_image: np.ndarray
    face: Optional[FaceBox] = None
    landmarks: Optional[FaceLandmarks] = None
    eye_patches: List[np.ndarray] = field(default_factory=list)
    failure_reason: Optional[str] = None


class PreprocessingService:
    def __init__(self, model_provider: EyeStateModelProvider) -> None:
        self._provider = model_provider

    def preprocess(self, image: Image.Image) -> PreprocessedFrame:
        bgr = self._to_bgr(image)
        result = PreprocessedFrame(bgr_image=bgr)

        face = self._provider.detect_face(bgr)
        if face is None:
            result.failure_reason = "no_face"
            return result
        result.face = face

        landmarks = self._provider.predict_landmarks(bgr, face)
        if landmarks is None:
            result.failure_reason = "no_landmarks"
            return result
        result.landmarks = landmarks

        patches = self._extract_eye_patches(bgr, landmarks)
        if not patches:
            result.failure_reason = "no_eye_patches"
            return result
        result.eye_patches = patches
        return result

    # ---- helpers ----
    @staticmethod
    def _to_bgr(image: Image.Image) -> np.ndarray:
        rgb = np.array(image.convert("RGB"))
        return cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)

    def _extract_eye_patches(
        self, bgr: np.ndarray, landmarks: FaceLandmarks
    ) -> List[np.ndarray]:
        height, width = bgr.shape[:2]
        lex, ley = landmarks.left_eye
        rex, rey = landmarks.right_eye
        inter_eye = max(40, int(abs(rex - lex)))
        side = max(8, int(settings.eye_crop_scale * inter_eye))

        patches: List[np.ndarray] = []
        for cx, cy in (landmarks.left_eye, landmarks.right_eye):
            x = max(0, cx - side // 2)
            y = max(0, cy - side // 2)
            w = min(width - x, side)
            h = min(height - y, side)
            if w < 8 or h < 8:
                continue
            patch = bgr[y : y + h, x : x + w]
            if patch.size == 0:
                continue
            patches.append(patch)
        return patches
