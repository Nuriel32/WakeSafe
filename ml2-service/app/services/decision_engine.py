from dataclasses import dataclass
from typing import Literal

from app.core.config import settings
from app.services.feature_service import TemporalFeatures


@dataclass(frozen=True)
class DecisionResult:
    driver_state: Literal["alert", "drowsy", "sleeping", "unknown"]
    fatigued: bool
    severity: float


class RuleBasedDecisionEngine:
    def decide(self, features: TemporalFeatures) -> DecisionResult:
        # Not enough temporal evidence yet (e.g. first frame has closed_eye_ratio=1.0 by definition).
        if features.frame_count < settings.min_frames_for_fatigue:
            return DecisionResult(driver_state="alert", fatigued=False, severity=0.05)

        closed_ratio = features.closed_eye_ratio
        avg_closure = features.avg_eye_closure_time
        blink_rate = features.blink_rate

        # With no closure signals, treat as alert rather than unknown.
        if avg_closure == 0 and features.max_eye_closure_time == 0 and closed_ratio == 0 and blink_rate == 0:
            return DecisionResult(driver_state="alert", fatigued=False, severity=0.05)

        sleeping_score = max(
            self._ratio(closed_ratio, settings.sleeping_closed_ratio_threshold),
            self._ratio(avg_closure, settings.avg_closure_threshold * 2.0),
        )
        if sleeping_score >= 1.0:
            return DecisionResult(
                driver_state="sleeping",
                fatigued=True,
                severity=round(min(1.0, 0.8 + 0.2 * min(sleeping_score, 1.5)), 4),
            )

        drowsy_score = max(
            self._ratio(closed_ratio, settings.drowsy_closed_ratio_threshold),
            self._ratio(avg_closure, settings.avg_closure_threshold),
            self._blink_penalty(blink_rate),
        )
        if drowsy_score >= 1.0:
            return DecisionResult(
                driver_state="drowsy",
                fatigued=True,
                severity=round(min(1.0, 0.45 + 0.35 * min(drowsy_score, 1.5)), 4),
            )

        return DecisionResult(
            driver_state="alert",
            fatigued=False,
            severity=round(min(0.35, drowsy_score * 0.3), 4),
        )

    @staticmethod
    def _ratio(value: float, threshold: float) -> float:
        if threshold <= 0:
            return 0.0
        return value / threshold

    @staticmethod
    def _blink_penalty(blink_rate: float) -> float:
        if blink_rate < settings.blink_rate_low_threshold:
            return (settings.blink_rate_low_threshold - blink_rate) / max(
                settings.blink_rate_low_threshold, 1.0
            )
        if blink_rate > settings.blink_rate_high_threshold:
            return (blink_rate - settings.blink_rate_high_threshold) / max(
                settings.blink_rate_high_threshold, 1.0
            )
        return 0.0
