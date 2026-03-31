from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field, field_validator


class HeadPoseInput(BaseModel):
    pitch: Optional[float] = None
    yaw: Optional[float] = None
    roll: Optional[float] = None


class SequenceItem(BaseModel):
    timestamp: datetime
    eye_state: Literal["OPEN", "CLOSED", "PARTIAL", "UNKNOWN"]
    confidence: float = Field(ge=0, le=1)
    ear: Optional[float] = None
    head_pose: HeadPoseInput = Field(default_factory=HeadPoseInput)


class ML2AnalyzeRequest(BaseModel):
    user_id: Optional[str] = None
    session_id: Optional[str] = None
    sequence: list[SequenceItem]

    @field_validator("sequence")
    @classmethod
    def validate_sequence(cls, value: list[SequenceItem]) -> list[SequenceItem]:
        if not value:
            raise ValueError("sequence must include at least one item")
        return value
