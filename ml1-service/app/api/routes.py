import logging

from fastapi import APIRouter, HTTPException, status

from app.schemas.request import ML1PredictRequest
from app.schemas.response import HealthResponse, ML1PredictResponse
from app.services.inference_service import FrameInferenceService

logger = logging.getLogger(__name__)
router = APIRouter()
inference_service = FrameInferenceService()


@router.get("/health", response_model=HealthResponse)
def health_check() -> HealthResponse:
    return HealthResponse(status="ok", service="ml1-service")


@router.post("/predict", response_model=ML1PredictResponse)
def predict(payload: ML1PredictRequest) -> ML1PredictResponse:
    try:
        return inference_service.predict(payload)
    except ValueError as exc:
        logger.exception("Validation/inference error for /predict")
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc
    except Exception as exc:  # pragma: no cover - defensive fallback
        logger.exception("Unhandled error for /predict")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to process image",
        ) from exc
