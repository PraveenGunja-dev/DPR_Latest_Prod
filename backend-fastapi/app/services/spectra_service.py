import httpx
import logging
from typing import Dict, Any, List

from app.config import settings

logger = logging.getLogger("adani-flow.spectra")
async def fetch_drone_block_progress(date_str: str) -> List[Dict[str, Any]]:
    """
    Fetches the block-level progress data from Spectra Drone API for a specific date.
    Returns a list of block data objects.
    """
    url = f"{settings.SPECTRA_BASE_URL}/block_progress?date={date_str}"
    headers = {
        "X-API-Key": settings.SPECTRA_API_KEY
    }
    
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(url, headers=headers)
            if response.status_code == 200:
                data = response.json()
                return data.get("rows", [])
            else:
                logger.error(f"Spectra API error: {response.status_code} {response.text}")
                return []
    except Exception as e:
        logger.error(f"Error fetching from Spectra API: {e}")
        return []
