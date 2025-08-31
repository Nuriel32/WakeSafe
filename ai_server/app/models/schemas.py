"""
Pydantic schemas for WakeSafe AI Server
"""

from datetime import datetime
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field


class PhotoAnalysisRequest(BaseModel):
    """Request model for single photo analysis"""
    photo_id: str = Field(..., description="Photo ID from WakeSafe")
    gcs_url: str = Field(..., description="GCS URL of the photo")


class HeadPose(BaseModel):
    """Head pose measurements"""
    pitch: float = Field(..., description="Pitch angle in degrees")
    yaw: float = Field(..., description="Yaw angle in degrees")
    roll: float = Field(..., description="Roll angle in degrees")


class FatigueAnalysisDetails(BaseModel):
    """Detailed fatigue analysis results"""
    ear: float = Field(..., description="Eye Aspect Ratio")
    head_pose: HeadPose = Field(..., description="Head pose measurements")
    face_detected: bool = Field(..., description="Whether face was detected")
    eyes_detected: bool = Field(..., description="Whether eyes were detected")
    confidence: float = Field(..., description="Overall confidence score")
    processing_time: Optional[float] = Field(None, description="Processing time in milliseconds")
    
    # Additional metrics
    blink_rate: Optional[float] = Field(None, description="Blink rate per minute")
    eye_closure_duration: Optional[float] = Field(None, description="Eye closure duration in seconds")
    yawn_detected: Optional[bool] = Field(None, description="Whether yawning was detected")
    
    # Model-specific results
    haarcascade_results: Optional[Dict[str, Any]] = Field(None, description="HaarCascade detection results")
    dlib_results: Optional[Dict[str, Any]] = Field(None, description="Dlib analysis results")
    mobilenet_results: Optional[Dict[str, Any]] = Field(None, description="MobileNet classification results")


class PhotoAnalysisResponse(BaseModel):
    """Response model for photo analysis"""
    photo_id: str = Field(..., description="Photo ID")
    prediction: str = Field(..., description="Fatigue prediction (alert, drowsy, sleeping, unknown)")
    confidence: float = Field(..., description="Confidence score (0-1)")
    processing_time: float = Field(..., description="Processing time in milliseconds")
    details: FatigueAnalysisDetails = Field(..., description="Detailed analysis results")
    timestamp: datetime = Field(default_factory=datetime.utcnow, description="Analysis timestamp")


class BatchAnalysisRequest(BaseModel):
    """Request model for batch photo analysis"""
    photos: List[PhotoAnalysisRequest] = Field(..., description="List of photos to analyze")
    batch_size: Optional[int] = Field(50, description="Maximum batch size for processing")


class BatchAnalysisResponse(BaseModel):
    """Response model for batch analysis"""
    total_photos: int = Field(..., description="Total number of photos in batch")
    successful: int = Field(..., description="Number of successfully processed photos")
    failed: int = Field(..., description="Number of failed photos")
    results: List[PhotoAnalysisResponse] = Field(..., description="Analysis results for successful photos")
    failed_photos: List[Dict[str, str]] = Field(..., description="Failed photos with error messages")
    total_processing_time: float = Field(..., description="Total processing time for the batch")


class HealthCheckResponse(BaseModel):
    """Health check response model"""
    status: str = Field(..., description="Overall health status")
    services: Dict[str, bool] = Field(..., description="Individual service health status")
    version: str = Field(..., description="API version")
    timestamp: datetime = Field(default_factory=datetime.utcnow, description="Health check timestamp")


class ProcessingStatus(BaseModel):
    """Processing status model"""
    status: str = Field(..., description="Processing status (pending, processing, completed, failed)")
    progress: float = Field(..., description="Progress percentage (0-100)")
    message: str = Field(..., description="Status message")
    timestamp: datetime = Field(default_factory=datetime.utcnow, description="Status timestamp")


class MetricsResponse(BaseModel):
    """Metrics response model"""
    total_analyses: int = Field(..., description="Total number of analyses performed")
    successful_analyses: int = Field(..., description="Number of successful analyses")
    failed_analyses: int = Field(..., description="Number of failed analyses")
    average_processing_time: float = Field(..., description="Average processing time in milliseconds")
    predictions_distribution: Dict[str, int] = Field(..., description="Distribution of predictions")
    error_rate: float = Field(..., description="Error rate percentage")
    uptime: float = Field(..., description="Server uptime in seconds")
    timestamp: datetime = Field(default_factory=datetime.utcnow, description="Metrics timestamp")


class ModelStatus(BaseModel):
    """AI model status model"""
    haarcascade_loaded: bool = Field(..., description="HaarCascade models loaded")
    dlib_loaded: bool = Field(..., description="Dlib models loaded")
    mobilenet_loaded: bool = Field(..., description="MobileNet model loaded")
    gpu_available: bool = Field(..., description="GPU availability")
    model_versions: Dict[str, str] = Field(..., description="Model versions")
    last_updated: datetime = Field(default_factory=datetime.utcnow, description="Last model update")

