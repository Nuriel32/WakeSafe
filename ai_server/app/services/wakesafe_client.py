"""
WakeSafe API Client Service
Handles communication with the main WakeSafe server
"""

import asyncio
import httpx
from typing import List, Dict, Any, Optional
from loguru import logger

from app.config import settings
from app.models.schemas import FatigueAnalysisDetails, PhotoAnalysisResponse


class WakeSafeClient:
    """Client for communicating with WakeSafe API"""
    
    def __init__(self):
        self.base_url = settings.WAKESAFE_API_URL
        self.api_token = settings.WAKESAFE_API_TOKEN
        self.client = None
        self.timeout = httpx.Timeout(30.0)
    
    async def _get_client(self) -> httpx.AsyncClient:
        """Get or create HTTP client"""
        if self.client is None:
            self.client = httpx.AsyncClient(
                timeout=self.timeout,
                headers={
                    "Authorization": f"Bearer {self.api_token}",
                    "Content-Type": "application/json"
                }
            )
        return self.client
    
    async def check_connection(self) -> bool:
        """Check connection to WakeSafe API"""
        try:
            client = await self._get_client()
            response = await client.get(f"{self.base_url}/health")
            return response.status_code == 200
        except Exception as e:
            logger.error(f"❌ WakeSafe API connection check failed: {e}")
            return False
    
    async def get_unprocessed_photos(self, limit: int = 50, status: str = "pending") -> List[Dict[str, Any]]:
        """Fetch unprocessed photos from WakeSafe API"""
        try:
            client = await self._get_client()
            
            params = {
                "limit": limit,
                "status": status
            }
            
            response = await client.get(
                f"{self.base_url}/api/photos/unprocessed",
                params=params
            )
            
            if response.status_code == 200:
                data = response.json()
                photos = data.get("photos", [])
                logger.info(f"📸 Fetched {len(photos)} unprocessed photos from WakeSafe API")
                return photos
            else:
                logger.error(f"❌ Failed to fetch unprocessed photos: {response.status_code}")
                return []
                
        except Exception as e:
            logger.error(f"❌ Error fetching unprocessed photos: {e}")
            return []
    
    async def update_ai_results(self, photo_id: str, results: FatigueAnalysisDetails) -> bool:
        """Update AI analysis results for a photo"""
        try:
            client = await self._get_client()
            
            payload = {
                "prediction": results.prediction,
                "confidence": results.confidence,
                "ear": results.ear,
                "headPose": {
                    "pitch": results.head_pose.pitch,
                    "yaw": results.head_pose.yaw,
                    "roll": results.head_pose.roll
                },
                "processingTime": results.processing_time,
                "aiResults": {
                    "face_detected": results.face_detected,
                    "eyes_detected": results.eyes_detected,
                    "haarcascade_results": results.haarcascade_results,
                    "dlib_results": results.dlib_results,
                    "mobilenet_results": results.mobilenet_results
                }
            }
            
            response = await client.put(
                f"{self.base_url}/api/photos/{photo_id}/ai-results",
                json=payload
            )
            
            if response.status_code == 200:
                logger.info(f"✅ Updated AI results for photo {photo_id}")
                return True
            else:
                logger.error(f"❌ Failed to update AI results for photo {photo_id}: {response.status_code}")
                return False
                
        except Exception as e:
            logger.error(f"❌ Error updating AI results for photo {photo_id}: {e}")
            return False
    
    async def update_batch_results(self, results: List[PhotoAnalysisResponse]) -> bool:
        """Update AI results for multiple photos in batch"""
        try:
            if not results:
                return True
            
            # Update results in parallel
            tasks = []
            for result in results:
                task = self.update_ai_results(result.photo_id, result.details)
                tasks.append(task)
            
            # Wait for all updates to complete
            update_results = await asyncio.gather(*tasks, return_exceptions=True)
            
            # Count successful updates
            successful = sum(1 for result in update_results if result is True)
            failed = len(results) - successful
            
            logger.info(f"✅ Batch update completed: {successful} successful, {failed} failed")
            return failed == 0
            
        except Exception as e:
            logger.error(f"❌ Error in batch update: {e}")
            return False
    
    async def get_session_photos(self, session_id: str, limit: int = 100) -> List[Dict[str, Any]]:
        """Get all photos for a specific session"""
        try:
            client = await self._get_client()
            
            params = {"limit": limit}
            
            response = await client.get(
                f"{self.base_url}/api/photos/session/{session_id}",
                params=params
            )
            
            if response.status_code == 200:
                data = response.json()
                photos = data.get("photos", [])
                logger.info(f"📸 Fetched {len(photos)} photos for session {session_id}")
                return photos
            else:
                logger.error(f"❌ Failed to fetch session photos: {response.status_code}")
                return []
                
        except Exception as e:
            logger.error(f"❌ Error fetching session photos: {e}")
            return []
    
    async def get_photo_by_id(self, photo_id: str) -> Optional[Dict[str, Any]]:
        """Get photo details by ID"""
        try:
            client = await self._get_client()
            
            response = await client.get(
                f"{self.base_url}/api/photos/{photo_id}"
            )
            
            if response.status_code == 200:
                return response.json()
            else:
                logger.error(f"❌ Failed to fetch photo {photo_id}: {response.status_code}")
                return None
                
        except Exception as e:
            logger.error(f"❌ Error fetching photo {photo_id}: {e}")
            return None
    
    async def delete_photo(self, photo_id: str) -> bool:
        """Delete a photo"""
        try:
            client = await self._get_client()
            
            response = await client.delete(
                f"{self.base_url}/api/photos/{photo_id}"
            )
            
            if response.status_code == 200:
                logger.info(f"✅ Deleted photo {photo_id}")
                return True
            else:
                logger.error(f"❌ Failed to delete photo {photo_id}: {response.status_code}")
                return False
                
        except Exception as e:
            logger.error(f"❌ Error deleting photo {photo_id}: {e}")
            return False
    
    async def get_processing_stats(self) -> Dict[str, Any]:
        """Get processing statistics from WakeSafe API"""
        try:
            client = await self._get_client()
            
            response = await client.get(
                f"{self.base_url}/api/photos/stats"
            )
            
            if response.status_code == 200:
                return response.json()
            else:
                logger.error(f"❌ Failed to fetch processing stats: {response.status_code}")
                return {}
                
        except Exception as e:
            logger.error(f"❌ Error fetching processing stats: {e}")
            return {}
    
    async def close(self):
        """Close HTTP client"""
        if self.client:
            await self.client.aclose()
            self.client = None

