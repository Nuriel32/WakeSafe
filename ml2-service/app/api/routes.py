import logging

from fastapi import APIRouter, HTTPException, status

from app.schemas.request import ML2AnalyzeRequest
from app.schemas.response import HealthResponse, ML2AnalyzeResponse
from app.services.decision_service import TemporalDecisionService

logger = logging.getLogger(__name__)
router = APIRouter()
decision_service = TemporalDecisionService()


@router.get("/health", response_model=HealthResponse)
def health_check() -> HealthResponse:
    return HealthResponse(status="ok", service="ml2-service")


@router.post("/analyze", response_model=ML2AnalyzeResponse)
def analyze(payload: ML2AnalyzeRequest) -> ML2AnalyzeResponse:
    try:
        return decision_service.analyze(payload)
    except ValueError as exc:
        logger.exception("Validation/decision error for /analyze")
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc
    except Exception as exc:  # pragma: no cover
        logger.exception("Unhandled error for /analyze")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to analyze sequence",
        ) from exc
