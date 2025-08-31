"""
Photo Processor Service
Handles image downloading and processing workflow
"""

import asyncio
import httpx
from typing import Optional
from loguru import logger

from app.models.schemas import FatigueAnalysisDetails, PhotoAnalysisResponse
from app.services.fatigue_detection import FatigueDetectionService
from app.services.wakesafe_client import WakeSafeClient
from app.utils.metrics import MetricsCollector


class PhotoProcessor:
    """Handles photo processing workflow"""
    
    def __init__(self):
        self.timeout = httpx.Timeout(30.0)
    
    async def download_image(self, gcs_url: str) -> bytes:
        """Download image from GCS URL"""
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.get(gcs_url)
                
                if response.status_code == 200:
                    logger.info(f"📥 Downloaded image from {gcs_url}")
                    return response.content
                else:
                    raise Exception(f"Failed to download image: {response.status_code}")
                    
        except Exception as e:
            logger.error(f"❌ Error downloading image from {gcs_url}: {e}")
            raise
    
    async def process_single_photo(
        self,
        photo_id: str,
        gcs_url: str,
        fatigue_service: FatigueDetectionService,
        wakesafe_client: WakeSafeClient,
        metrics: MetricsCollector
    ) -> PhotoAnalysisResponse:
        """Process a single photo through the complete workflow"""
        try:
            start_time = metrics.start_timer()
            
            # Download image
            image_data = await self.download_image(gcs_url)
            
            # Run fatigue detection
            results = await fatigue_service.analyze_fatigue(image_data)
            
            # Calculate processing time
            processing_time = metrics.end_timer(start_time)
            results.processing_time = processing_time
            
            # Create response
            response = PhotoAnalysisResponse(
                photo_id=photo_id,
                prediction=results.prediction,
                confidence=results.confidence,
                processing_time=processing_time,
                details=results
            )
            
            # Record metrics
            metrics.record_analysis(
                prediction=results.prediction,
                confidence=results.confidence,
                processing_time=processing_time
            )
            
            logger.info(f"✅ Processed photo {photo_id}: {results.prediction} (confidence: {results.confidence:.2f})")
            
            return response
            
        except Exception as e:
            logger.error(f"❌ Failed to process photo {photo_id}: {e}")
            metrics.record_error(str(e))
            raise
    
    async def process_batch_photos(
        self,
        photos: list,
        fatigue_service: FatigueDetectionService,
        wakesafe_client: WakeSafeClient,
        metrics: MetricsCollector,
        max_concurrent: int = 5
    ) -> list:
        """Process multiple photos in batch with concurrency control"""
        try:
            # Create semaphore to limit concurrent processing
            semaphore = asyncio.Semaphore(max_concurrent)
            
            async def process_with_semaphore(photo):
                async with semaphore:
                    return await self.process_single_photo(
                        photo["photo_id"],
                        photo["gcs_url"],
                        fatigue_service,
                        wakesafe_client,
                        metrics
                    )
            
            # Process photos concurrently
            tasks = [process_with_semaphore(photo) for photo in photos]
            results = await asyncio.gather(*tasks, return_exceptions=True)
            
            # Separate successful and failed results
            successful_results = []
            failed_results = []
            
            for i, result in enumerate(results):
                if isinstance(result, Exception):
                    failed_results.append({
                        "photo_id": photos[i]["photo_id"],
                        "error": str(result)
                    })
                else:
                    successful_results.append(result)
            
            logger.info(f"✅ Batch processing completed: {len(successful_results)} successful, {len(failed_results)} failed")
            
            return {
                "successful": successful_results,
                "failed": failed_results,
                "total": len(photos)
            }
            
        except Exception as e:
            logger.error(f"❌ Batch processing failed: {e}")
            raise
    
    async def validate_image(self, image_data: bytes) -> bool:
        """Validate image data"""
        try:
            # Check if image data is not empty
            if not image_data or len(image_data) == 0:
                return False
            
            # Check minimum size (1KB)
            if len(image_data) < 1024:
                return False
            
            # Try to decode image to check if it's valid
            import cv2
            import numpy as np
            
            nparr = np.frombuffer(image_data, np.uint8)
            image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
            
            if image is None:
                return False
            
            # Check minimum dimensions
            height, width = image.shape[:2]
            if width < 100 or height < 100:
                return False
            
            return True
            
        except Exception as e:
            logger.error(f"❌ Image validation failed: {e}")
            return False
    
    async def preprocess_image(self, image_data: bytes) -> bytes:
        """Preprocess image for better analysis"""
        try:
            import cv2
            import numpy as np
            
            # Decode image
            nparr = np.frombuffer(image_data, np.uint8)
            image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
            
            if image is None:
                raise ValueError("Failed to decode image")
            
            # Resize to standard size
            resized = cv2.resize(image, (640, 480))
            
            # Apply basic preprocessing
            # Convert to grayscale for some operations
            gray = cv2.cvtColor(resized, cv2.COLOR_BGR2GRAY)
            
            # Apply histogram equalization for better contrast
            equalized = cv2.equalizeHist(gray)
            
            # Convert back to BGR
            processed = cv2.cvtColor(equalized, cv2.COLOR_GRAY2BGR)
            
            # Encode back to bytes
            _, buffer = cv2.imencode('.jpg', processed, [cv2.IMWRITE_JPEG_QUALITY, 90])
            
            return buffer.tobytes()
            
        except Exception as e:
            logger.error(f"❌ Image preprocessing failed: {e}")
            # Return original image if preprocessing fails
            return image_data
    
    async def extract_image_metadata(self, image_data: bytes) -> dict:
        """Extract basic metadata from image"""
        try:
            import cv2
            import numpy as np
            from PIL import Image
            import io
            
            # Use PIL to get basic metadata
            pil_image = Image.open(io.BytesIO(image_data))
            
            metadata = {
                "format": pil_image.format,
                "mode": pil_image.mode,
                "size": pil_image.size,
                "file_size": len(image_data)
            }
            
            # Get OpenCV image for additional analysis
            nparr = np.frombuffer(image_data, np.uint8)
            cv_image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
            
            if cv_image is not None:
                metadata.update({
                    "cv_shape": cv_image.shape,
                    "brightness": np.mean(cv_image),
                    "contrast": np.std(cv_image)
                })
            
            return metadata
            
        except Exception as e:
            logger.error(f"❌ Metadata extraction failed: {e}")
            return {"error": str(e)}

