import time

from app.schemas.request import ML2AnalyzeRequest
from app.schemas.response import FeatureResponse, ML2AnalyzeResponse
from app.services.decision_engine import RuleBasedDecisionEngine
from app.services.feature_service import TemporalFeatureService
from app.utils.time_utils import utc_now


class TemporalDecisionService:
    def __init__(self) -> None:
        self.feature_service = TemporalFeatureService()
        self.decision_engine = RuleBasedDecisionEngine()

    def analyze(self, payload: ML2AnalyzeRequest) -> ML2AnalyzeResponse:
        start = time.perf_counter()
        ordered = sorted(payload.sequence, key=lambda item: item.timestamp)
        features = self.feature_service.extract(ordered)
        decision = self.decision_engine.decide(features)
        processing_time_ms = int((time.perf_counter() - start) * 1000)

        return ML2AnalyzeResponse(
            user_id=payload.user_id,
            session_id=payload.session_id,
            driver_state=decision.driver_state,
            fatigued=decision.fatigued,
            severity=decision.severity,
            features=FeatureResponse(
                blink_rate=features.blink_rate,
                avg_eye_closure_time=features.avg_eye_closure_time,
                max_eye_closure_time=features.max_eye_closure_time,
                closed_eye_ratio=features.closed_eye_ratio,
                frame_count=features.frame_count,
            ),
            processing_time_ms=processing_time_ms,
            processed_at=utc_now(),
        )
