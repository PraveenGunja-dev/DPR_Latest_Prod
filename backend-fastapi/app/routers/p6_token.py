# app/routers/p6_token.py
"""
P6 Token router.
Direct port of Express routes/p6Token.js
"""

import logging

from fastapi import APIRouter, Depends

from app.auth.dependencies import get_current_user
from app.services.p6_token_service import (
    generate_p6_token,
    get_valid_p6_token,
    is_token_valid,
    clear_cached_token,
)

logger = logging.getLogger("adani-flow.p6-token")

router = APIRouter(prefix="/api/p6-token", tags=["P6 Token"])


@router.post("/generate")
async def generate_token(current_user: dict = Depends(get_current_user)):
    """Generate a new Oracle P6 token."""
    try:
        token = await generate_p6_token()
        return {"success": True, "message": "Token generated successfully", "token": token}
    except Exception as e:
        logger.error(f"P6 token generation failed: {e}", exc_info=True)
        return {"success": False, "message": "Failed to generate the P6 token."}


@router.get("/current")
async def get_current_token(current_user: dict = Depends(get_current_user)):
    """Get the current valid P6 token."""
    try:
        token = await get_valid_p6_token()
        return {"success": True, "token": token}
    except Exception as e:
        logger.error(f"No valid P6 token available: {e}", exc_info=True)
        return {"success": False, "message": "No valid P6 token is available."}


@router.post("/refresh")
async def refresh_token(current_user: dict = Depends(get_current_user)):
    """Force refresh the P6 token."""
    clear_cached_token()
    try:
        token = await generate_p6_token()
        return {"success": True, "message": "Token refreshed successfully", "token": token}
    except Exception as e:
        logger.error(f"P6 token refresh failed: {e}", exc_info=True)
        return {"success": False, "message": "Failed to refresh the P6 token."}


@router.get("/status")
async def get_token_status(current_user: dict = Depends(get_current_user)):
    """Check if the cached P6 token is valid."""
    return {"valid": is_token_valid()}
