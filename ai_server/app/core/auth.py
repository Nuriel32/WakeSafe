"""
Authentication module for WakeSafe AI Server
"""

from fastapi import HTTPException, Depends, Header
from typing import Optional
import jwt
from loguru import logger

from app.config import settings


async def verify_ai_token(authorization: Optional[str] = Header(None)) -> str:
    """Verify AI server authentication token"""
    if not authorization:
        raise HTTPException(
            status_code=401,
            detail="Authorization header missing"
        )
    
    try:
        # Extract token from Bearer format
        if not authorization.startswith("Bearer "):
            raise HTTPException(
                status_code=401,
                detail="Invalid authorization format"
            )
        
        token = authorization.replace("Bearer ", "")
        
        # Verify token (in production, you'd verify against a proper secret)
        if token != settings.AI_SERVER_SECRET_KEY:
            raise HTTPException(
                status_code=401,
                detail="Invalid token"
            )
        
        return token
        
    except jwt.InvalidTokenError:
        raise HTTPException(
            status_code=401,
            detail="Invalid token"
        )
    except Exception as e:
        logger.error(f"Authentication error: {e}")
        raise HTTPException(
            status_code=401,
            detail="Authentication failed"
        )

