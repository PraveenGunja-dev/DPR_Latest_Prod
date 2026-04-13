# app/routers/project_utils.py
from fastapi import HTTPException
import logging
from app.database import PoolWrapper

logger = logging.getLogger("adani-flow.project_utils")

async def resolve_project_id(project_id, pool: PoolWrapper) -> Any:
    """
    Resolve a project ID or EPS Type (Solar/Wind/PSS) to project ObjectIds.
    Returns a single int for a project, or a list of ints for a portfolio.
    """
    if project_id is None:
        raise HTTPException(status_code=400, detail="Project identity is required")
        
    try:
        # 1. Handle Portfolio Types (Parent EPS nodes dynamically)
        # Check if the project_id string exists in the parent_eps column
        is_eps = await pool.fetchval('SELECT EXISTS(SELECT 1 FROM projects WHERE parent_eps = $1)', str(project_id))
        if is_eps:
            rows = await pool.fetch('SELECT object_id FROM projects WHERE parent_eps = $1', str(project_id))
            return [int(r["object_id"]) for r in rows] if rows else []

        # 2. If it's already a numeric ID
        if isinstance(project_id, int):
            return project_id
        if isinstance(project_id, str) and project_id.isdigit():
            return int(project_id)
            
        if project_id in ("undefined", "null", "", "all"):
            return None # Handle 'All' view

        # 3. Resolve by P6 Project ID (e.g., 'FY26-P13')
        row = await pool.fetchrow('SELECT object_id FROM projects WHERE id = $1', str(project_id))
        if row:
            return row["object_id"]
            
        # 4. Fallback search
        row = await pool.fetchrow('SELECT project_object_id FROM dpr_activities WHERE project_object_id::text = $1 LIMIT 1', str(project_id))
        if row:
            return row["project_object_id"]
            
        # 5. Final attempt: direct int conversion
        try:
            return int(project_id)
        except (ValueError, TypeError):
            # If still not found, it might be an un-synced project
            return None
            
    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        logger.error(f"Error resolving project identity '{project_id}': {e}")
        raise HTTPException(status_code=500, detail="Internal error during project resolution")
