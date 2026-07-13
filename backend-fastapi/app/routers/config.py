# app/routers/config.py
from fastapi import APIRouter, Depends
from typing import List, Dict, Any
from app.database import PoolWrapper, get_db

router = APIRouter(prefix="/api/config", tags=["Configuration"])

@router.get("/project/{p6_id}")
async def get_project_config(p6_id: str, db: PoolWrapper = Depends(get_db)):
    """Fetch configuration for a specific project."""
    query = "SELECT * FROM project_configurations WHERE p6_id = $1"
    row = await db.fetchrow(query, p6_id)
    if not row:
        return {
            "p6_id": p6_id,
            "enable_drone_integration": False,
            "dashboard_layout_type": "standard"
        }
    return row

@router.get("/wbs-patterns")
async def get_wbs_patterns(db: PoolWrapper = Depends(get_db)):
    """Fetch WBS matching patterns dynamically."""
    query = "SELECT * FROM wbs_sheet_mappings"
    rows = await db.fetch(query)
    
    patterns = {}
    for row in rows:
        sheet = row["sheet_identifier"]
        if sheet not in patterns:
            patterns[sheet] = []
        patterns[sheet].append({
            "match_pattern": row["match_pattern"],
            "is_regex": row["is_regex"]
        })
    return patterns

@router.get("/activities/{sheet_type}")
async def get_activity_master_list(sheet_type: str, db: PoolWrapper = Depends(get_db)):
    """Fetch the master list of activities for a sheet to order correctly."""
    query = "SELECT activity_name, display_order FROM activity_master_lists WHERE sheet_type = $1 ORDER BY display_order ASC"
    rows = await db.fetch(query, sheet_type)
    return [r["activity_name"] for r in rows]
