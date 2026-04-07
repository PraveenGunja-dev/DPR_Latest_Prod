# app/routers/project_utils.py
from fastapi import HTTPException
import logging
from app.database import PoolWrapper

logger = logging.getLogger("adani-flow.project_utils")

async def resolve_project_id(project_id, pool: PoolWrapper) -> int:
    """Resolve a project ID (string or numeric) to its internal P6 ObjectId."""
    if project_id is None:
        raise HTTPException(status_code=400, detail="Project ID is required")
        
    try:
        # 1. If it's already an integer, return it
        if isinstance(project_id, int):
            return project_id
            
        # 2. If it's a numeric string, convert to int
        if isinstance(project_id, str) and project_id.isdigit():
            return int(project_id)
            
        # 3. Handle potential numeric string passed as 'null' or 'undefined'
        if project_id in ("undefined", "null", ""):
            raise HTTPException(status_code=400, detail="Valid Project ID is required")
            
        # 4. Resolve human-readable P6 ID (like 'FY26-P13') from p6_projects table
        # We explicitly search against the 'Id' column which contains this friendly format
        row = await pool.fetchrow('SELECT "ObjectId" FROM p6_projects WHERE "Id" = $1', str(project_id))
        if row:
            return row["ObjectId"]
            
        # 5. Fallback: check if it matches a project_object_id in solar_activities 
        # (useful if it's a numeric ID that for some reason wasn't caught yet)
        row = await pool.fetchrow('SELECT project_object_id FROM solar_activities WHERE project_object_id::text = $1 LIMIT 1', str(project_id))
        if row:
            return row["project_object_id"]
            
        # 6. Final attempt: direct int conversion if all else fails
        try:
            return int(project_id)
        except (ValueError, TypeError):
            raise HTTPException(status_code=404, detail=f"Project with ID '{project_id}' not found")
            
    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        logger.error(f"Error resolving project ID '{project_id}': {e}")
        raise HTTPException(status_code=500, detail="Internal error during project ID resolution")
