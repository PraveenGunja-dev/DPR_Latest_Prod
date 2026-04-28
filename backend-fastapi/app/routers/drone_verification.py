from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
from datetime import date, datetime
import logging
import re

from app.database import get_pool
from app.auth.dependencies import get_current_user
from app.services.spectra_service import fetch_drone_block_progress

router = APIRouter(prefix="/api/drone", tags=["drone"])
logger = logging.getLogger("adani-flow.drone")

# Mapping of Drone API keys to DPR 'activities' name regex patterns
ACTIVITY_MAPPING = [
    {"drone_key": "auguring_current", "dpr_pattern": r"aug[eu]ring"},
    {"drone_key": "piling_current", "dpr_pattern": r"piling"},
    {"drone_key": "module_current", "dpr_pattern": r"module\s*(mounting|installation)"},
    {"drone_key": "piling_cap_current", "dpr_pattern": r"pile\s*capping|piling\s*cap"},
    {"drone_key": "rafter_current", "dpr_pattern": r"raft[ea]r"},
    {"drone_key": "bracing_current", "dpr_pattern": r"bracing"},
    {"drone_key": "purlin_current", "dpr_pattern": r"purlin"}
]

def normalize_block_name(name: str) -> str:
    if not name: return ""
    name = re.sub(r'block', '', name, flags=re.IGNORECASE)
    return re.sub(r'[-_\s]', '', name).upper()

class CompareRequest(BaseModel):
    report_date: str = "2026-04-23"
    dpr_rows: List[Dict[str, Any]]

@router.post("/compare/{project_id}")
async def compare_drone_data(
    project_id: int, 
    request: CompareRequest, 
    user: dict = Depends(get_current_user)
):
    """
    Fetches Spectra Drone data and compares it with the provided DPR Block data.
    """
    pool = await get_pool()
    
    # 1. Verify project
    project = await pool.fetchrow("SELECT name FROM projects WHERE object_id = $1", project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
        
    p_name = project["name"].lower()
    if "khavda" not in p_name and "baiya" not in p_name:
        return {"status": "unsupported", "message": "Drone data is only available for Khavda and Baiya projects.", "data": []}

    # 2. Fetch Drone Data
    report_date = request.report_date
    drone_data = await fetch_drone_block_progress(report_date)
    if not drone_data:
        return {"status": "no_data", "message": f"No drone data found for date {report_date}", "data": []}
        
    # Map drone data by block name
    drone_by_block = {row["block_name"]: row for row in drone_data if "block_name" in row}

    # 3. Use provided DPR Block Data
    dpr_rows = request.dpr_rows
    if not dpr_rows:
        return {"status": "no_dpr_data", "message": "No DP Block data provided to compare.", "data": []}
    
    # 4. Compare
    comparison_results = []
    
    for d_row in dpr_rows:
        block_name = d_row.get("block")
        activity_name = (d_row.get("activities") or d_row.get("description") or "").lower()
        
        # Support both 'completed' (from UI edits) and 'cumulative' (from raw P6 mapping)
        completed_val = d_row.get("completed") or d_row.get("cumulative") or "0"
        completed_str = str(completed_val).replace(",", "").strip()
        try:
            dpr_completed = float(completed_str)
        except ValueError:
            dpr_completed = 0.0
            
        if not block_name or not activity_name:
            continue
            
        # Check if block exists in drone data
        drone_block_data = None
        for db_name, db_data in drone_by_block.items():
            norm_dpr = normalize_block_name(block_name)
            norm_drone = normalize_block_name(db_name)
            if norm_dpr and norm_drone and (norm_dpr == norm_drone or norm_drone.endswith(norm_dpr) or norm_dpr.endswith(norm_drone) or norm_dpr in norm_drone or norm_drone in norm_dpr):
                drone_block_data = db_data
                break
                
        if drone_block_data:
            for mapping in ACTIVITY_MAPPING:
                if re.search(mapping["dpr_pattern"], activity_name):
                    drone_val = drone_block_data.get(mapping["drone_key"])
                    if drone_val is not None:
                        drone_val = float(drone_val)
                        variance = dpr_completed - drone_val
                        
                        # Determine status
                        if variance > 0:
                            status = "Over-Reported"
                        elif variance < 0:
                            status = "Under-Reported"
                        else:
                            status = "Verified"
                            
                        comparison_results.append({
                            "block_name": block_name,
                            "activity": d_row.get("activities") or d_row.get("description"),
                            "dpr_actual": dpr_completed,
                            "drone_actual": drone_val,
                            "variance": variance,
                            "status": status
                        })
                    break # Stop looking for mappings once matched

    return {
        "status": "success",
        "report_date": report_date,
        "dpr_entry_date": "Live Data",
        "total_blocks_surveyed": len(drone_by_block),
        "data": comparison_results
    }
