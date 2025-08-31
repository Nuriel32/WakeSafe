"""
Redis client module for WakeSafe AI Server
"""

import redis.asyncio as redis
from loguru import logger

from app.config import settings

# Global Redis client
redis_client: redis.Redis = None


async def init_redis():
    """Initialize Redis connection"""
    global redis_client
    
    try:
        # Create Redis client
        redis_client = redis.from_url(
            settings.REDIS_URL,
            db=settings.REDIS_DB,
            decode_responses=True
        )
        
        # Test connection
        await redis_client.ping()
        
        logger.info("✅ Redis connection established")
        
    except Exception as e:
        logger.error(f"❌ Failed to connect to Redis: {e}")
        raise


async def close_redis():
    """Close Redis connection"""
    global redis_client
    
    if redis_client:
        await redis_client.close()
        logger.info("✅ Redis connection closed")


def get_redis_client():
    """Get Redis client instance"""
    return redis_client


async def cache_set(key: str, value: str, expire: int = 3600):
    """Set cache value"""
    if redis_client:
        await redis_client.set(key, value, ex=expire)


async def cache_get(key: str) -> str:
    """Get cache value"""
    if redis_client:
        return await redis_client.get(key)
    return None


async def cache_delete(key: str):
    """Delete cache value"""
    if redis_client:
        await redis_client.delete(key)


async def cache_exists(key: str) -> bool:
    """Check if cache key exists"""
    if redis_client:
        return await redis_client.exists(key) > 0
    return False

