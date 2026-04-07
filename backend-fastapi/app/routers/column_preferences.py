"""
Column preferences router – save/load user column visibility preferences per project.
"""
from fastapi import APIRouter, Depends, HTTPException
from typing import Any
from app.auth.dependencies import get_current_user
from app.database import get_db, PoolWrapper
from app.routers.project_utils import resolve_project_id

router = APIRouter(prefix="/api/column-preferences", tags=["Column Preferences"])


@router.get("/{project_id}/{sheet_type}")
async def get_column_preferences(
    project_id: str,
    sheet_type: str,
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(get_current_user),
):
    user_id = current_user["userId"]
    project_object_id = await resolve_project_id(project_id, pool)

    row = await pool.fetchrow("""
        SELECT visible_columns FROM user_column_preferences
        WHERE user_id = $1 AND project_id = $2 AND sheet_type = $3
    """, user_id, project_object_id, sheet_type)

    if row:
        import json
        return {"visibleColumns": json.loads(row["visible_columns"]) if isinstance(row["visible_columns"], str) else row["visible_columns"]}
    else:
        return {"visibleColumns": None}  # No preferences saved yet, show all columns


@router.put("/{project_id}/{sheet_type}")
async def save_column_preferences(
    project_id: str,
    sheet_type: str,
    body: dict[str, Any],
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(get_current_user),
):
    """Save column visibility preferences for a user/project/sheet."""
    user_id = current_user["userId"]
    hidden_columns = body.get("hiddenColumns", [])

    if not isinstance(hidden_columns, list):
        raise HTTPException(400, detail="hiddenColumns must be an array of column names")

    import json
    hidden_json = json.dumps(hidden_columns)

    project_object_id = await resolve_project_id(project_id, pool)

    await pool.execute("""
        INSERT INTO user_column_preferences (user_id, project_id, sheet_type, visible_columns)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (user_id, project_id, sheet_type)
        DO UPDATE SET visible_columns = $4, updated_at = NOW()
    """, user_id, project_object_id, sheet_type, hidden_json)

    return {"success": True, "message": "Column preferences saved"}
