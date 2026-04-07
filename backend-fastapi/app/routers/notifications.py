# app/routers/notifications.py
from datetime import datetime
from typing import List, Optional, Any
from fastapi import APIRouter, Depends, HTTPException
from app.auth.dependencies import get_current_user
from app.database import get_db, PoolWrapper

router = APIRouter(prefix="/api/notifications", tags=["Notifications"])

@router.get("/")
async def get_notifications(
    limit: int = 50,
    current_user: dict[str, Any] = Depends(get_current_user),
    pool: PoolWrapper = Depends(get_db)
):
    user_id = current_user["userId"]
    
    rows = await pool.fetch("""
        SELECT * FROM notifications 
        WHERE user_id = $1 
        ORDER BY timestamp DESC 
        LIMIT $2
    """, user_id, limit)
    
    return [dict(r) for r in rows]

@router.get("/unread-count")
async def get_unread_count(
    current_user: dict[str, Any] = Depends(get_current_user),
    pool: PoolWrapper = Depends(get_db)
):
    user_id = current_user["userId"]
    count = await pool.fetchval("""
        SELECT COUNT(*) FROM notifications 
        WHERE user_id = $1 AND read = FALSE
    """, user_id)
    return {"count": count or 0}

@router.post("/{notification_id}/read")
async def mark_as_read(
    notification_id: int,
    current_user: dict[str, Any] = Depends(get_current_user),
    pool: PoolWrapper = Depends(get_db)
):
    user_id = current_user["userId"]
    await pool.execute("""
        UPDATE notifications 
        SET read = TRUE 
        WHERE id = $1 AND user_id = $2
    """, notification_id, user_id)
    return {"message": "Notification marked as read"}

@router.post("/read-all")
async def mark_all_as_read(
    current_user: dict[str, Any] = Depends(get_current_user),
    pool: PoolWrapper = Depends(get_db)
):
    user_id = current_user["userId"]
    await pool.execute("""
        UPDATE notifications 
        SET read = TRUE 
        WHERE user_id = $1
    """, user_id)
    return {"message": "All notifications marked as read"}

@router.delete("/clear")
async def clear_notifications(
    current_user: dict[str, Any] = Depends(get_current_user),
    pool: PoolWrapper = Depends(get_db)
):
    user_id = current_user["userId"]
    await pool.execute("""
        DELETE FROM notifications 
        WHERE user_id = $1
    """, user_id)
    return {"message": "Notifications cleared"}

async def create_notification(
    pool: PoolWrapper,
    user_id: int,
    title: str,
    message: str,
    type: str = "info",
    project_id: Optional[Any] = None,
    entry_id: Optional[int] = None,
    sheet_type: Optional[str] = None
):
    from app.routers.project_utils import resolve_project_id
    project_object_id = None
    if project_id:
        project_object_id = await resolve_project_id(project_id, pool)

    await pool.execute("""
        INSERT INTO notifications (user_id, title, message, type, project_id, entry_id, sheet_type)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
    """, user_id, title, message, type, project_object_id, entry_id, sheet_type)
