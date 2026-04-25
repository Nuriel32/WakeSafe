from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field


class FeatureResponse(BaseModel):
    blink_rate: float = Field(ge=0)
    avg_eye_closure_time: float = Field(ge=0)
    max_eye_closure_time: float = Field(ge=0)
    closed_eye_ratio: float = Field(ge=0, le=1)
    frame_count: int = Field(ge=1, description="Frames in the analyzed sequence")


class ML2AnalyzeResponse(BaseModel):
    user_id: Optional[str] = None
    session_id: Optional[str] = None
    driver_state: Literal["alert", "drowsy", "sleeping", "unknown"]
    fatigued: bool
    severity: float = Field(ge=0, le=1)
    features: FeatureResponse
    processing_time_ms: int = Field(ge=0)
    processed_at: datetime


class HealthResponse(BaseModel):
    status: str
    service: str
