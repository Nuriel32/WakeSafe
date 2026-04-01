import time

from app.schemas.request import ML1PredictRequest
from app.schemas.response import (
    FrameAnalysisResponse,
    HeadPoseResponse,
    ML1PredictResponse,
)
from app.services.model_loader import load_model_provider
from app.services.preprocessing_service import PreprocessingService
from app.utils.image_loader import load_image
from app.utils.time_utils import utc_now


class FrameInferenceService:
    def __init__(self) -> None:
        self.model_provider = load_model_provider()
        self.preprocessor = PreprocessingService()

    def predict(self, payload: ML1PredictRequest) -> ML1PredictResponse:
        start = time.perf_counter()
        image = load_image(image_url=payload.image_url, image_base64=payload.image_base64)
        preprocessed, features = self.preprocessor.preprocess(image)
        model_out = self.model_provider.infer(preprocessed, features)
        processing_time_ms = int((time.perf_counter() - start) * 1000)

        frame_analysis = FrameAnalysisResponse(
            eye_state=model_out["eye_state"],
            confidence=model_out["confidence"],
            ear=model_out["ear"],
            head_pose=HeadPoseResponse(**model_out["head_pose"]),
            processing_time_ms=processing_time_ms,
            processed_at=utc_now(),
        )
        return ML1PredictResponse(
            image_id=payload.image_id,
            session_id=payload.session_id,
            frame_analysis=frame_analysis,
            status="success",
        )
