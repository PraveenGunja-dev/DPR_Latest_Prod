# app/routers/issues.py
"""
Issues router – CRUD + stats.
Direct port of Express routes/issues.js
"""

import logging
from typing import Optional, Any

from fastapi import APIRouter, Depends, HTTPException, Query

from app.auth.dependencies import get_current_user
from app.database import get_db, PoolWrapper
from app.routers.project_utils import resolve_project_id

logger = logging.getLogger("adani-flow.issues")

router = APIRouter(prefix="/api/issues", tags=["Issues"])

ALLOWED_ROLES = {"site pm", "pmag", "super admin", "supervisor"}


def _check_pm_or_admin(user: dict[str, Any]):
    role = (user.get("role") or "").lower()
    if role not in ALLOWED_ROLES:
        raise HTTPException(403, detail={"error": "Access denied. Site PM, Supervisor, or Admin required."})


@router.get("")
async def get_issues(
    status: Optional[str] = None,
    priority: Optional[str] = None,
    project_id: Optional[str] = None,
    issue_type: Optional[str] = None,
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(get_current_user),
):
    _check_pm_or_admin(current_user)

    conditions = ["1=1"]
    params: list[Any] = []
    idx: int = 1

    if status:
        conditions.append(f"il.status = ${idx}"); params.append(status); idx += 1
    if priority:
        conditions.append(f"il.priority = ${idx}"); params.append(priority); idx += 1
    if project_id:
        project_object_id = await resolve_project_id(project_id, pool)
        conditions.append(f"il.project_id = ${idx}"); params.append(project_object_id); idx += 1
    if issue_type:
        conditions.append(f"il.issue_type = ${idx}"); params.append(issue_type); idx += 1

    where = " AND ".join(conditions)

    query = f"""
        SELECT il.*, u1.name as created_by_name, u1.email as created_by_email,
               u2.name as assigned_to_name, u3.name as resolved_by_name,
               COALESCE(p.name, p6."Name", 'No Project') as project_name
        FROM issue_logs il
        LEFT JOIN users u1 ON il.created_by = u1.user_id
        LEFT JOIN users u2 ON il.assigned_to = u2.user_id
        LEFT JOIN users u3 ON il.resolved_by = u3.user_id
        LEFT JOIN projects p ON il.project_id = p.id
        LEFT JOIN p6_projects p6 ON il.project_id = p6."ObjectId"
        WHERE {where}
        ORDER BY CASE il.priority WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 WHEN 'low' THEN 4 END,
                 il.created_at DESC
        LIMIT ${idx} OFFSET ${idx + 1}
    """
    params.extend([limit, offset])

    rows = await pool.fetch(query, *params)

    # Count
    count_query = f"SELECT COUNT(*) FROM issue_logs il WHERE {where}"
    count_row = await pool.fetchval(count_query, *params[0:idx-1])

    return {
        "success": True,
        "issues": [dict(r) for r in rows],
        "total": count_row,
        "limit": limit,
        "offset": offset,
    }


@router.get("/stats/summary")
async def get_issue_stats(
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(get_current_user),
):
    _check_pm_or_admin(current_user)

    row = await pool.fetchrow("""
        SELECT
            COUNT(*) FILTER (WHERE status = 'open') as open_count,
            COUNT(*) FILTER (WHERE status = 'in_progress') as in_progress_count,
            COUNT(*) FILTER (WHERE status = 'resolved') as resolved_count,
            COUNT(*) FILTER (WHERE status = 'closed') as closed_count,
            COUNT(*) FILTER (WHERE priority = 'critical') as critical_count,
            COUNT(*) FILTER (WHERE priority = 'high') as high_count,
            COUNT(*) as total_count
        FROM issue_logs
    """)
    if not row:
        return {"success": True, "stats": {
            "open_count": 0, "in_progress_count": 0, "resolved_count": 0,
            "closed_count": 0, "critical_count": 0, "high_count": 0, "total_count": 0
        }}

    return {"success": True, "stats": dict(row)}


@router.get("/{issue_id}")
async def get_issue(
    issue_id: int,
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(get_current_user),
):
    _check_pm_or_admin(current_user)

    row = await pool.fetchrow("""
        SELECT il.*, u1.name as created_by_name, u1.email as created_by_email,
               u2.name as assigned_to_name, u3.name as resolved_by_name,
               COALESCE(p.name, p6."Name", 'No Project') as project_name
        FROM issue_logs il
        LEFT JOIN users u1 ON il.created_by = u1.user_id
        LEFT JOIN users u2 ON il.assigned_to = u2.user_id
        LEFT JOIN users u3 ON il.resolved_by = u3.user_id
        LEFT JOIN projects p ON il.project_id = p.id
        LEFT JOIN p6_projects p6 ON il.project_id = p6."ObjectId"
        WHERE il.id = $1
    """, issue_id)

    if not row:
        raise HTTPException(404, detail={"error": "Issue not found"})
    return {"success": True, "issue": dict(row)}


@router.post("", status_code=201)
async def create_issue(
    body: dict[str, Any],
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(get_current_user),
):
    title = body.get("title")
    description = body.get("description")
    if not title or not description:
        raise HTTPException(400, detail={"error": "Title and description are required"})

    project_id = await resolve_project_id(body.get("project_id"), pool)

    row = await pool.fetchrow("""
        INSERT INTO issue_logs (project_id, entry_id, sheet_type, issue_type, title, description, priority, status, created_by, assigned_to)
        VALUES ($1, $2, $3, $4, $5, $6, $7, 'open', $8, $9)
        RETURNING *
    """,
        project_id, body.get("entry_id"), body.get("sheet_type"),
        body.get("issue_type", "general"), title, description,
        body.get("priority", "medium"), current_user["userId"],
        body.get("assigned_to"),
    )
    return {"success": True, "message": "Issue created successfully", "issue": dict(row)}


@router.put("/{issue_id}")
async def update_issue(
    issue_id: int,
    body: dict[str, Any],
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(get_current_user),
):
    _check_pm_or_admin(current_user)

    updates: list[str] = []
    params: list[Any] = []
    idx: int = 1

    for field in ["title", "description", "issue_type", "priority", "status", "assigned_to", "resolution_notes"]:
        val = body.get(field)
        if val is not None:
            updates.append(f"{field} = ${idx}")
            params.append(val)
            idx += 1
            if field == "status" and val in ("resolved", "closed"):
                updates.append(f"resolved_by = ${idx}")
                params.append(current_user["userId"])
                idx += 1
                updates.append("resolved_at = CURRENT_TIMESTAMP")

    if not updates:
        raise HTTPException(400, detail={"error": "No fields to update"})

    params.append(issue_id)
    row = await pool.fetchrow(
        f"UPDATE issue_logs SET {', '.join(updates)} WHERE id = ${idx} RETURNING *",
        *params,
    )
    if not row:
        raise HTTPException(404, detail={"error": "Issue not found"})
    return {"success": True, "message": "Issue updated successfully", "issue": dict(row)}


@router.delete("/{issue_id}")
async def delete_issue(
    issue_id: int,
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(get_current_user),
):
    if current_user["role"] not in ("PMAG", "Super Admin"):
        raise HTTPException(403, detail={"error": "Only Admin can delete issues"})

    row = await pool.fetchrow("DELETE FROM issue_logs WHERE id = $1 RETURNING *", issue_id)
    if not row:
        raise HTTPException(404, detail={"error": "Issue not found"})
    return {"success": True, "message": "Issue deleted successfully"}
