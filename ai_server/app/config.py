"""
Configuration settings for WakeSafe AI Server
"""

import os
from typing import List
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings"""
    
    # Server Configuration
    HOST: str = "0.0.0.0"
    PORT: int = 8000
    DEBUG: bool = False
    
    # WakeSafe API Configuration
    WAKESAFE_API_URL: str = "http://localhost:5000"
    WAKESAFE_API_TOKEN: str = ""
    
    # AI Model Configuration
    MODELS_DIR: str = "models"
    HAAR_CASCADE_FACE: str = "models/haarcascade_frontalface_default.xml"
    HAAR_CASCADE_EYE: str = "models/haarcascade_eye.xml"
    DLIB_SHAPE_PREDICTOR: str = "models/shape_predictor_68_face_landmarks.dat"
    MOBILENET_MODEL: str = "models/fatigue_detection_model.tflite"
    
    # Database Configuration
    MONGODB_URL: str = "mongodb://localhost:27017"
    MONGODB_DB: str = "wakesafe_ai"
    
    # Redis Configuration
    REDIS_URL: str = "redis://localhost:6379"
    REDIS_DB: int = 0
    
    # Google Cloud Storage
    GCS_BUCKET: str = "wakesafe-bucket"
    GCS_CREDENTIALS_PATH: str = "config/gcp-key.json"
    
    # Security
    AI_SERVER_SECRET_KEY: str = ""
    ALLOWED_ORIGINS: List[str] = ["*"]
    ALLOWED_HOSTS: List[str] = ["*"]
    
    # Processing Configuration
    MAX_BATCH_SIZE: int = 100
    MAX_CONCURRENT_REQUESTS: int = 10
    PROCESSING_TIMEOUT: int = 30
    
    # Performance Configuration
    IMAGE_RESIZE_WIDTH: int = 640
    IMAGE_RESIZE_HEIGHT: int = 480
    ENABLE_GPU: bool = False
    
    # Logging
    LOG_LEVEL: str = "INFO"
    LOG_FILE: str = "logs/ai_server.log"
    
    # Metrics
    ENABLE_METRICS: bool = True
    METRICS_PORT: int = 9090
    
    class Config:
        env_file = ".env"
        case_sensitive = True


# Create settings instance
settings = Settings()

# Ensure required directories exist
os.makedirs(settings.MODELS_DIR, exist_ok=True)
os.makedirs("logs", exist_ok=True)
os.makedirs("config", exist_ok=True)

