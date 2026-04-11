from dataclasses import dataclass

from app.core.config import settings
from app.schemas.request import SequenceItem


@dataclass(frozen=True)
class TemporalFeatures:
    blink_rate: float
    avg_eye_closure_time: float
    max_eye_closure_time: float
    closed_eye_ratio: float


class TemporalFeatureService:
    def __init__(self) -> None:
        # Make PARTIAL handling configurable for mobile-camera noise.
        self.closed_states = {"CLOSED", "PARTIAL"} if settings.treat_partial_as_closed else {"CLOSED"}

    def extract(self, sequence: list[SequenceItem]) -> TemporalFeatures:
        ordered = sorted(sequence, key=lambda item: item.timestamp)
        total = len(ordered)
        closed_count = sum(1 for item in ordered if item.eye_state in self.closed_states)
        closed_eye_ratio = closed_count / total if total else 0.0

        total_seconds = (
            (ordered[-1].timestamp - ordered[0].timestamp).total_seconds() if total > 1 else 0.0
        )
        total_minutes = max(total_seconds / 60.0, 1 / 60.0)

        closure_durations: list[float] = []
        blinks = 0
        run_start_idx = None

        for idx, item in enumerate(ordered):
            is_closed = item.eye_state in self.closed_states
            if is_closed and run_start_idx is None:
                run_start_idx = idx
            if not is_closed and run_start_idx is not None:
                duration = self._compute_duration_seconds(ordered, run_start_idx, idx - 1)
                closure_durations.append(duration)
                if duration < 0.8:
                    blinks += 1
                run_start_idx = None

        if run_start_idx is not None:
            duration = self._compute_duration_seconds(ordered, run_start_idx, total - 1)
            closure_durations.append(duration)

        avg_eye_closure_time = (
            sum(closure_durations) / len(closure_durations) if closure_durations else 0.0
        )
        max_eye_closure_time = max(closure_durations) if closure_durations else 0.0
        blink_rate = blinks / total_minutes

        return TemporalFeatures(
            blink_rate=round(blink_rate, 4),
            avg_eye_closure_time=round(avg_eye_closure_time, 4),
            max_eye_closure_time=round(max_eye_closure_time, 4),
            closed_eye_ratio=round(closed_eye_ratio, 4),
        )

    @staticmethod
    def _compute_duration_seconds(sequence: list[SequenceItem], start_idx: int, end_idx: int) -> float:
        if start_idx == end_idx:
            return 0.2
        duration = (sequence[end_idx].timestamp - sequence[start_idx].timestamp).total_seconds()
        return max(duration, 0.2)
