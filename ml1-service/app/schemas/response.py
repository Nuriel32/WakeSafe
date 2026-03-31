from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field


class HeadPoseResponse(BaseModel):
    pitch: Optional[float] = None
    yaw: Optional[float] = None
    roll: Optional[float] = None


class FrameAnalysisResponse(BaseModel):
    eye_state: Literal["OPEN", "CLOSED", "PARTIAL", "UNKNOWN"]
    confidence: float = Field(ge=0, le=1)
    ear: Optional[float] = None
    head_pose: HeadPoseResponse
    processing_time_ms: int = Field(ge=0)
    processed_at: datetime


class ML1PredictResponse(BaseModel):
    image_id: Optional[str] = None
    session_id: Optional[str] = None
    frame_analysis: Optional[FrameAnalysisResponse] = None
    status: Literal["success", "failed"]


class HealthResponse(BaseModel):
    status: str
    service: str
