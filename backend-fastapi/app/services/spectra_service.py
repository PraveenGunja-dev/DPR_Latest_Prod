import httpx
import logging
from typing import Dict, Any, List, Optional

from app.config import settings

logger = logging.getLogger("adani-flow.spectra")

SPECTRA_HEADERS = {"X-API-Key": settings.SPECTRA_API_KEY}
SPECTRA_TIMEOUT = 30.0


async def _fetch_spectra_endpoint(endpoint: str, date_str: str, project_id: Optional[int] = None) -> List[Dict[str, Any]]:
    """
    Generic helper to fetch data from any Spectra Drone API endpoint.
    Optionally filters by project_id (1=Baiya, 2=Khavda).
    Returns the 'rows' list from the JSON response.
    """
    url = f"{settings.SPECTRA_BASE_URL}/{endpoint}?date={date_str}"
    if project_id is not None:
        url += f"&project_id={project_id}"
    try:
        async with httpx.AsyncClient(timeout=SPECTRA_TIMEOUT) as client:
            response = await client.get(url, headers=SPECTRA_HEADERS)
            if response.status_code == 200:
                data = response.json()
                return data.get("rows", data if isinstance(data, list) else [])
            else:
                logger.error(f"Spectra API [{endpoint}] error: {response.status_code} {response.text}")
                return []
    except Exception as e:
        logger.error(f"Error fetching Spectra [{endpoint}]: {e}")
        return []


async def fetch_spectra_projects() -> List[Dict[str, Any]]:
    """Fetches the list of projects from Spectra (id + name)."""
    url = f"{settings.SPECTRA_BASE_URL}/projects"
    try:
        async with httpx.AsyncClient(timeout=SPECTRA_TIMEOUT) as client:
            response = await client.get(url, headers=SPECTRA_HEADERS)
            if response.status_code == 200:
                data = response.json()
                return data.get("projects", [])
            else:
                logger.error(f"Spectra projects API error: {response.status_code}")
                return []
    except Exception as e:
        logger.error(f"Error fetching Spectra projects: {e}")
        return []


async def fetch_drone_block_progress(date_str: str, project_id: Optional[int] = None) -> List[Dict[str, Any]]:
    """Fetches block-level progress (piling, module, rafter, purlin, pile cap, etc.)."""
    return await _fetch_spectra_endpoint("block_progress", date_str, project_id)


async def fetch_drone_inverter_progress(date_str: str, project_id: Optional[int] = None) -> List[Dict[str, Any]]:
    """Fetches inverter-level progress (count_piling, count_inverter_completed, etc.)."""
    return await _fetch_spectra_endpoint("inverter_progress", date_str, project_id)


async def fetch_drone_robot_progress(date_str: str, project_id: Optional[int] = None) -> List[Dict[str, Any]]:
    """Fetches robotic docking station progress (count_piling, count_robot_installed, etc.)."""
    return await _fetch_spectra_endpoint("robot_progress", date_str, project_id)


async def fetch_drone_ac_work_progress(date_str: str, project_id: Optional[int] = None) -> List[Dict[str, Any]]:
    """Fetches AC/DC electrical work progress (IDT, HT/LT, fencing, cables, etc.)."""
    return await _fetch_spectra_endpoint("ac_work_progress", date_str, project_id)


async def fetch_all_drone_data(date_str: str, project_id: Optional[int] = None) -> Dict[str, List[Dict[str, Any]]]:
    """
    Fetches data from all 4 Spectra Drone APIs in parallel, filtered by project_id.
    """
    import asyncio
    block, inverter, robot, ac_work = await asyncio.gather(
        fetch_drone_block_progress(date_str, project_id),
        fetch_drone_inverter_progress(date_str, project_id),
        fetch_drone_robot_progress(date_str, project_id),
        fetch_drone_ac_work_progress(date_str, project_id),
    )
    return {
        "block_progress": block,
        "inverter_progress": inverter,
        "robot_progress": robot,
        "ac_work_progress": ac_work,
    }
