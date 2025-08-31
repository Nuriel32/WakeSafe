"""
Database connection module for WakeSafe AI Server
"""

from motor.motor_asyncio import AsyncIOMotorClient
from loguru import logger

from app.config import settings

# Global database client
db_client: AsyncIOMotorClient = None
database = None


async def init_database():
    """Initialize database connection"""
    global db_client, database
    
    try:
        # Create MongoDB client
        db_client = AsyncIOMotorClient(settings.MONGODB_URL)
        
        # Get database
        database = db_client[settings.MONGODB_DB]
        
        # Test connection
        await db_client.admin.command('ping')
        
        logger.info("✅ MongoDB connection established")
        
    except Exception as e:
        logger.error(f"❌ Failed to connect to MongoDB: {e}")
        raise


async def close_database():
    """Close database connection"""
    global db_client
    
    if db_client:
        db_client.close()
        logger.info("✅ MongoDB connection closed")


def get_database():
    """Get database instance"""
    return database


def get_collection(collection_name: str):
    """Get collection instance"""
    if database is None:
        raise Exception("Database not initialized")
    return database[collection_name]
