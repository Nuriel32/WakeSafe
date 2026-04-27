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
    vision_status: Literal["ok", "no_eyes_detected"] = "ok"
    guidance_message: Optional[str] = None
    head_pose: HeadPoseResponse
    processing_time_ms: int = Field(ge=0)
    processed_at: datetime
    model_version: Optional[str] = None
    p_open: Optional[float] = Field(default=None, ge=0, le=1)
    p_closed: Optional[float] = Field(default=None, ge=0, le=1)
    eyes_used: Optional[int] = Field(default=None, ge=0)


class ML1PredictResponse(BaseModel):
    image_id: Optional[str] = None
    session_id: Optional[str] = None
    frame_analysis: Optional[FrameAnalysisResponse] = None
    status: Literal["success", "failed"]


class HealthResponse(BaseModel):
    status: str
    service: str
