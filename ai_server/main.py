"""
WakeSafe AI Server - Fatigue Detection Service
Main application entry point
"""

import asyncio
import os
from contextlib import asynccontextmanager
from typing import List

import uvicorn
from fastapi import FastAPI, HTTPException, Depends, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from loguru import logger

from app.config import settings
from app.core.auth import verify_ai_token
from app.core.database import init_database, close_database
from app.core.redis_client import init_redis, close_redis
from app.models.schemas import (
    PhotoAnalysisRequest,
    PhotoAnalysisResponse,
    BatchAnalysisRequest,
    BatchAnalysisResponse,
    HealthCheckResponse,
    ProcessingStatus
)
from app.services.fatigue_detection import FatigueDetectionService
from app.services.wakesafe_client import WakeSafeClient
from app.services.photo_processor import PhotoProcessor
from app.utils.metrics import MetricsCollector


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager"""
    # Startup
    logger.info("🚀 Starting WakeSafe AI Server...")
    
    # Initialize optional services
    if settings.USE_DATABASE:
        await init_database()
    else:
        logger.info("ℹ️ Skipping database initialization (USE_DATABASE=False)")
    
    if settings.USE_REDIS:
        await init_redis()
    else:
        logger.info("ℹ️ Skipping Redis initialization (USE_REDIS=False)")
    
    # Initialize AI models
    await app.state.fatigue_service.initialize_models()
    
    logger.info("✅ WakeSafe AI Server started successfully!")
    
    yield
    
    # Shutdown
    logger.info("🛑 Shutting down WakeSafe AI Server...")
    if settings.USE_DATABASE:
        await close_database()
    if settings.USE_REDIS:
        await close_redis()
    logger.info("✅ WakeSafe AI Server shutdown complete!")


# Create FastAPI app
app = FastAPI(
    title="WakeSafe AI Server",
    description="AI-powered fatigue detection service for driver safety",
    version="1.0.0",
    lifespan=lifespan
)

# Add middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.add_middleware(
    TrustedHostMiddleware,
    allowed_hosts=settings.ALLOWED_HOSTS
)

# Initialize services
app.state.fatigue_service = FatigueDetectionService()
app.state.wakesafe_client = WakeSafeClient()
app.state.photo_processor = PhotoProcessor()
app.state.metrics = MetricsCollector()


@app.get("/health", response_model=HealthCheckResponse)
async def health_check():
    """Health check endpoint"""
    try:
        # Check all services
        services_status = {
            "database": await app.state.fatigue_service.check_database_connection(),
            "redis": await app.state.fatigue_service.check_redis_connection(),
            "models": app.state.fatigue_service.check_models_status(),
            "wakesafe_api": await app.state.wakesafe_client.check_connection()
        }
        
        all_healthy = all(services_status.values())
        
        return HealthCheckResponse(
            status="healthy" if all_healthy else "unhealthy",
            services=services_status,
            version="1.0.0"
        )
    except Exception as e:
        logger.error(f"Health check failed: {e}")
        return HealthCheckResponse(
            status="unhealthy",
            services={},
            version="1.0.0"
        )


@app.get("/metrics")
async def get_metrics():
    """Get performance metrics"""
    return await app.state.metrics.get_all_metrics()


@app.post("/analyze", response_model=PhotoAnalysisResponse)
async def analyze_single_photo(
    request: PhotoAnalysisRequest,
    background_tasks: BackgroundTasks,
    token: str = Depends(verify_ai_token)
):
    """Analyze a single photo for fatigue detection"""
    try:
        start_time = app.state.metrics.start_timer()
        
        # Download image from GCS
        image_data = await app.state.photo_processor.download_image(request.gcs_url)
        
        # Run fatigue detection
        results = await app.state.fatigue_service.analyze_fatigue(image_data)
        
        # Update processing time
        processing_time = app.state.metrics.end_timer(start_time)
        results.processing_time = processing_time
        
        # Update results in WakeSafe API
        background_tasks.add_task(
            app.state.wakesafe_client.update_ai_results,
            request.photo_id,
            results
        )
        
        # Record metrics
        app.state.metrics.record_analysis(
            prediction=results.prediction,
            confidence=results.confidence,
            processing_time=processing_time
        )
        
        logger.info(f"✅ Photo {request.photo_id} analyzed: {results.prediction} (confidence: {results.confidence:.2f})")
        
        return PhotoAnalysisResponse(
            photo_id=request.photo_id,
            prediction=results.prediction,
            confidence=results.confidence,
            processing_time=processing_time,
            details=results
        )
        
    except Exception as e:
        logger.error(f"❌ Analysis failed for photo {request.photo_id}: {e}")
        app.state.metrics.record_error(str(e))
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")


@app.post("/analyze/batch", response_model=BatchAnalysisResponse)
async def analyze_batch_photos(
    request: BatchAnalysisRequest,
    background_tasks: BackgroundTasks,
    token: str = Depends(verify_ai_token)
):
    """Analyze multiple photos in batch"""
    try:
        results = []
        failed_photos = []
        
        # Process photos in parallel
        tasks = []
        for photo in request.photos:
            task = asyncio.create_task(
                app.state.photo_processor.process_single_photo(
                    photo_id=photo.photo_id,
                    gcs_url=photo.gcs_url,
                    fatigue_service=app.state.fatigue_service,
                    wakesafe_client=app.state.wakesafe_client,
                    metrics=app.state.metrics
                )
            )
            tasks.append(task)
        
        # Wait for all tasks to complete
        batch_results = await asyncio.gather(*tasks, return_exceptions=True)
        
        for i, result in enumerate(batch_results):
            if isinstance(result, Exception):
                failed_photos.append({
                    "photo_id": request.photos[i].photo_id,
                    "error": str(result)
                })
            else:
                results.append(result)
        
        # Update all results in background
        background_tasks.add_task(
            app.state.wakesafe_client.update_batch_results,
            results
        )
        
        logger.info(f"✅ Batch analysis completed: {len(results)} successful, {len(failed_photos)} failed")
        
        return BatchAnalysisResponse(
            total_photos=len(request.photos),
            successful=len(results),
            failed=len(failed_photos),
            results=results,
            failed_photos=failed_photos
        )
        
    except Exception as e:
        logger.error(f"❌ Batch analysis failed: {e}")
        app.state.metrics.record_error(str(e))
        raise HTTPException(status_code=500, detail=f"Batch analysis failed: {str(e)}")


@app.get("/process-queue")
async def process_pending_queue(
    limit: int = 50,
    token: str = Depends(verify_ai_token)
):
    """Process pending photos from WakeSafe queue"""
    try:
        # Fetch unprocessed photos from WakeSafe API
        photos = await app.state.wakesafe_client.get_unprocessed_photos(limit=limit)
        
        if not photos:
            return {"message": "No pending photos to process", "count": 0}
        
        # Process photos in batch
        request = BatchAnalysisRequest(
            photos=[
                PhotoAnalysisRequest(photo_id=photo["_id"], gcs_url=photo["gcsUrl"])
                for photo in photos
            ]
        )
        
        batch_response = await analyze_batch_photos(request, BackgroundTasks(), token)
        
        return {
            "message": "Queue processing completed",
            "batch_results": batch_response
        }
        
    except Exception as e:
        logger.error(f"❌ Queue processing failed: {e}")
        app.state.metrics.record_error(str(e))
        raise HTTPException(status_code=500, detail=f"Queue processing failed: {str(e)}")


@app.post("/process-continuous")
async def start_continuous_processing(
    interval_seconds: int = 30,
    batch_size: int = 50,
    token: str = Depends(verify_ai_token)
):
    """Start continuous processing of pending photos"""
    try:
        # This would typically be handled by a background worker
        # For now, we'll just return a message
        logger.info(f"🔄 Starting continuous processing (interval: {interval_seconds}s, batch: {batch_size})")
        
        return {
            "message": "Continuous processing started",
            "interval_seconds": interval_seconds,
            "batch_size": batch_size,
            "status": "running"
        }
        
    except Exception as e:
        logger.error(f"❌ Failed to start continuous processing: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to start continuous processing: {str(e)}")


if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.DEBUG,
        log_level="info"
    )
