"""ML1 inference pipeline orchestrator.

Combines the detector + landmark + eye-state models into a single
classification call that produces an :class:`ML1PredictResponse`.

The inference path is deliberately deterministic:

1. Decode the input image.
2. Detect a face. No face -> ``UNKNOWN`` with vision_status ``no_eyes_detected``.
3. Locate eye centers via 5-point landmark regression. Failures -> ``UNKNOWN``.
4. Crop both eyes and run the trained ``open-closed-eye-0001`` classifier.
5. Average the two probability vectors and map them to ``OPEN`` / ``CLOSED``
   /``PARTIAL`` using the configured probability bands.
"""

from __future__ import annotations

import time
from typing import Optional

from app.core.config import settings
from app.schemas.request import ML1PredictRequest
from app.schemas.response import (
    FrameAnalysisResponse,
    HeadPoseResponse,
    ML1PredictResponse,
)
from app.services.model_loader import (
    EyeProbabilities,
    EyeStateModelProvider,
    FaceLandmarks,
    load_model_provider,
)
from app.services.preprocessing_service import PreprocessedFrame, PreprocessingService
from app.utils.image_loader import load_image
from app.utils.time_utils import utc_now


_EAR_LOOKUP = {
    "OPEN": 0.30,
    "PARTIAL": 0.22,
    "CLOSED": 0.12,
    "UNKNOWN": None,
}


class FrameInferenceService:
    def __init__(
        self,
        model_provider: Optional[EyeStateModelProvider] = None,
        preprocessor: Optional[PreprocessingService] = None,
    ) -> None:
        self._model_provider = model_provider or load_model_provider()
        self._preprocessor = preprocessor or PreprocessingService(self._model_provider)

    def predict(self, payload: ML1PredictRequest) -> ML1PredictResponse:
        start = time.perf_counter()
        image = load_image(image_url=payload.image_url, image_base64=payload.image_base64)

        frame = self._preprocessor.preprocess(image)
        analysis = self._build_frame_analysis(
            frame=frame,
            processing_time_ms=int((time.perf_counter() - start) * 1000),
        )

        return ML1PredictResponse(
            image_id=payload.image_id,
            session_id=payload.session_id,
            frame_analysis=analysis,
            status="success",
        )

    # ---- internal ----
    def _build_frame_analysis(
        self, frame: PreprocessedFrame, processing_time_ms: int
    ) -> FrameAnalysisResponse:
        if not frame.eye_patches:
            return FrameAnalysisResponse(
                eye_state="UNKNOWN",
                confidence=0.0,
                ear=_EAR_LOOKUP["UNKNOWN"],
                vision_status="no_eyes_detected",
                guidance_message=self._guidance_for(frame.failure_reason),
                head_pose=self._head_pose_from(frame.landmarks),
                processing_time_ms=processing_time_ms,
                processed_at=utc_now(),
                model_version=self._model_provider.model_version,
                p_open=None,
                p_closed=None,
                eyes_used=0,
            )

        probs = [self._model_provider.classify_eye(p) for p in frame.eye_patches]
        averaged = self._average(probs)
        eye_state, confidence = self._decide(averaged)

        return FrameAnalysisResponse(
            eye_state=eye_state,
            confidence=round(confidence, 4),
            ear=_EAR_LOOKUP[eye_state],
            vision_status="ok",
            guidance_message=None,
            head_pose=self._head_pose_from(frame.landmarks),
            processing_time_ms=processing_time_ms,
            processed_at=utc_now(),
            model_version=self._model_provider.model_version,
            p_open=round(averaged.p_open, 4),
            p_closed=round(averaged.p_closed, 4),
            eyes_used=len(frame.eye_patches),
        )

    @staticmethod
    def _average(probs: list[EyeProbabilities]) -> EyeProbabilities:
        if not probs:
            return EyeProbabilities(p_open=0.0, p_closed=0.0)
        po = sum(p.p_open for p in probs) / len(probs)
        pc = sum(p.p_closed for p in probs) / len(probs)
        return EyeProbabilities(p_open=po, p_closed=pc)

    @staticmethod
    def _decide(probs: EyeProbabilities) -> tuple[str, float]:
        po = probs.p_open
        pc = probs.p_closed
        # Probability band for partial / blink-in-progress frames.
        if settings.partial_low <= po <= settings.partial_high:
            confidence = max(po, pc)
            return ("PARTIAL", confidence)
        if po > settings.partial_high:
            if po < settings.confidence_threshold:
                return ("UNKNOWN", po)
            return ("OPEN", po)
        # po < partial_low → CLOSED
        if pc < settings.confidence_threshold:
            return ("UNKNOWN", pc)
        return ("CLOSED", pc)

    @staticmethod
    def _guidance_for(reason: Optional[str]) -> Optional[str]:
        if reason is None:
            return None
        if reason == "no_face":
            return "No face detected. Center your face in front of the camera and check lighting."
        if reason == "no_landmarks":
            return "Face detected but eyes could not be localized. Reduce motion blur and look at the camera."
        if reason == "no_eye_patches":
            return "Eye region was clipped. Move slightly back from the camera so both eyes are visible."
        return None

    @staticmethod
    def _head_pose_from(landmarks: Optional[FaceLandmarks]) -> HeadPoseResponse:
        # The 5-point regressor does not directly estimate Euler angles; we
        # report a coarse 2D proxy so downstream consumers continue to receive
        # the contract they expect. A future iteration can swap in
        # ``head-pose-estimation-adas-0001``.
        if landmarks is None:
            return HeadPoseResponse(pitch=None, yaw=None, roll=None)

        lex, ley = landmarks.left_eye
        rex, rey = landmarks.right_eye
        nx, ny = landmarks.nose
        eye_dx = rex - lex
        eye_dy = rey - ley
        # Roll: angle of inter-eye line.
        import math

        roll = math.degrees(math.atan2(eye_dy, eye_dx)) if eye_dx else 0.0
        # Yaw proxy: nose offset relative to inter-eye midpoint.
        midx = (lex + rex) / 2.0
        yaw = (nx - midx) / max(abs(eye_dx), 1) * 30.0
        # Pitch proxy: nose vertical offset vs eyes mid.
        midy = (ley + rey) / 2.0
        pitch = (ny - midy) / max(abs(eye_dx), 1) * 30.0
        return HeadPoseResponse(
            pitch=round(float(pitch), 3),
            yaw=round(float(yaw), 3),
            roll=round(float(roll), 3),
        )
