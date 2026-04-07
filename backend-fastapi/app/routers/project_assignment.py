# app/routers/project_assignment.py
"""
Project assignment router.
Direct port of Express routes/projectAssignment.js + controllers/projectAssignmentController.js
"""

import json
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException

from app.auth.dependencies import get_current_user
from app.database import get_db, PoolWrapper
from app.services.cache_service import cache
from app.routers.project_utils import resolve_project_id

from typing import Optional, Any

logger = logging.getLogger("adani-flow.project_assignment")

router = APIRouter(prefix="/api/project-assignment", tags=["Project Assignment"])


@router.post("/assign")
async def assign_project(
    body: dict[str, Any],
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(get_current_user),
):
    """Assign a project to a user with optional sheet_types."""
    if current_user["role"] not in ("PMAG", "Site PM", "Super Admin"):
        raise HTTPException(403, detail={"message": "Access denied"})

    user_id = body.get("userId") or body.get("supervisorId")
    project_id = body.get("projectId")
    sheet_types = body.get("sheetTypes")

    if not user_id or not project_id:
        raise HTTPException(400, detail={"message": "userId and projectId are required"})

    project_object_id = await resolve_project_id(project_id, pool)

    existing = await pool.fetchrow(
        "SELECT * FROM project_assignments WHERE user_id = $1 AND project_id = $2",
        user_id, project_object_id,
    )
    if existing:
        if sheet_types is not None:
            await pool.execute(
                "UPDATE project_assignments SET sheet_types = $1 WHERE user_id = $2 AND project_id = $3",
                json.dumps(sheet_types), user_id, project_id,
            )
        return {"message": "Project already assigned, sheet_types updated", "assignment": {"user_id": user_id, "project_id": project_id}}

    await pool.execute(
        "INSERT INTO project_assignments (user_id, project_id, sheet_types) VALUES ($1, $2, $3)",
        user_id, project_object_id, json.dumps(sheet_types) if sheet_types else None,
    )
    await cache.flush_all()
    return {"message": "Project assigned successfully", "assignment": {"user_id": user_id, "project_id": project_object_id}}


@router.post("/assign-projects-multiple")
async def assign_projects_multiple(
    body: dict[str, Any],
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(get_current_user),
):
    """Assign multiple projects to multiple users."""
    if current_user["role"] not in ("PMAG", "Site PM", "Super Admin"):
        raise HTTPException(403, detail={"message": "Access denied"})

    project_ids = body.get("projectIds", [])
    user_ids = body.get("supervisorIds", []) or body.get("userIds", [])
    sheet_types = body.get("sheetTypes")

    if not project_ids or not user_ids:
        raise HTTPException(400, detail={"message": "projectIds and supervisorIds are required"})

    count = 0
    for pid_val in project_ids:
        pid = await resolve_project_id(pid_val, pool)
        for uid in user_ids:
            # Check existing
            existing = await pool.fetchrow(
                "SELECT * FROM project_assignments WHERE user_id = $1 AND project_id = $2",
                uid, pid
            )
            if existing:
                if sheet_types is not None:
                    await pool.execute(
                        "UPDATE project_assignments SET sheet_types = $1 WHERE user_id = $2 AND project_id = $3",
                        json.dumps(sheet_types), uid, pid
                    )
            else:
                await pool.execute(
                    "INSERT INTO project_assignments (user_id, project_id, sheet_types) VALUES ($1, $2, $3)",
                    uid, pid, json.dumps(sheet_types) if sheet_types else None
                )
            count += 1

    await cache.flush_all()
    return {"message": f"Successfully processed {count} assignments"}


@router.post("/unassign")
async def unassign_project(
    body: dict[str, Any],
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(get_current_user),
):
    """Unassign a project from a user."""
    if current_user["role"] not in ("PMAG", "Site PM", "Super Admin"):
        raise HTTPException(403, detail={"message": "Access denied"})

    user_id = body.get("userId") or body.get("supervisorId")
    project_id = body.get("projectId")
    project_object_id = await resolve_project_id(project_id, pool)

    result = await pool.execute(
        "DELETE FROM project_assignments WHERE user_id = $1 AND project_id = $2",
        user_id, project_object_id,
    )
    await cache.flush_all()
    return {"message": "Project unassigned successfully"}


@router.get("/user/{user_id}/projects")
async def get_user_projects(
    user_id: int,
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(get_current_user),
):
    """Get projects assigned to a specific user."""
    rows = await pool.fetch("""
        SELECT p."Name" AS "name", p."ObjectId" AS "id", p."ObjectId" AS "objectId",
               p.project_type AS "projectType", p."Id" AS "P6Id",
               p."LastSyncAt" as "p6_last_sync", p."DataDate" as "p6_data_date", p."LastUpdateDate" as "p6_last_updated"
        FROM p6_projects p
        JOIN project_assignments pa ON p."ObjectId" = pa.project_id
        WHERE pa.user_id = $1
        ORDER BY p."Name"
    """, user_id)
    return [dict(r) for r in rows]


@router.get("/project/{project_id}/supervisors")
async def get_project_supervisors(
    project_id: str,
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(get_current_user),
):
    """Get supervisors assigned to a specific project."""
    if current_user["role"] not in ("PMAG", "Site PM", "Super Admin"):
        raise HTTPException(403, detail={"message": "Access denied"})

    rows = await pool.fetch("""
        SELECT u.user_id AS "ObjectId", u.name AS "Name", u.email AS "Email", u.role AS "Role", pa.sheet_types
        FROM users u
        JOIN project_assignments pa ON u.user_id = pa.user_id
        WHERE pa.project_id = $1 AND u.role = 'supervisor'
        ORDER BY u.name
    """, project_id)
    return [dict(r) for r in rows]


@router.get("/project/{project_id}/users")
async def get_project_users(
    project_id: str,
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(get_current_user),
):
    """Get all users assigned to a specific project."""
    rows = await pool.fetch("""
        SELECT u.user_id AS "ObjectId", u.name AS "Name", u.email AS "Email", u.role AS "Role", pa.sheet_types
        FROM users u
        JOIN project_assignments pa ON u.user_id = pa.user_id
        WHERE pa.project_id = $1
        ORDER BY u.name
    """, project_id)
    return [dict(r) for r in rows]


@router.get("/project/{project_id}/sitepms")
async def get_project_sitepms(
    project_id: str,
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(get_current_user),
):
    """Get Site PMs assigned to a specific project."""
    if current_user["role"] not in ("PMAG", "Super Admin"):
        raise HTTPException(403, detail={"message": "Access denied"})

    rows = await pool.fetch("""
        SELECT u.user_id AS "ObjectId", u.name AS "Name", u.email AS "Email", u.role AS "Role", pa.sheet_types
        FROM users u
        JOIN project_assignments pa ON u.user_id = pa.user_id
        WHERE pa.project_id = $1 AND u.role = 'Site PM'
        ORDER BY u.name
    """, project_id)
    return [dict(r) for r in rows]


@router.put("/update-sheet-types")
async def update_sheet_types(
    body: dict[str, Any],
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(get_current_user),
):
    """Update sheet types for an assignment."""
    if current_user["role"] not in ("PMAG", "Site PM", "Super Admin"):
        raise HTTPException(403, detail={"message": "Access denied"})

    user_id = body.get("userId") or body.get("supervisorId")
    project_object_id = await resolve_project_id(project_id, pool)

    await pool.execute(
        "UPDATE project_assignments SET sheet_types = $1 WHERE user_id = $2 AND project_id = $3",
        json.dumps(sheet_types) if sheet_types else None, user_id, project_object_id,
    )
    await cache.flush_all()
    return {"message": "Sheet types updated successfully"}


@router.get("/assigned")
async def get_assigned_projects(
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(get_current_user),
):
    """Get projects assigned to the current user (Supervisor/Site PM)."""
    user_id = current_user["userId"]
    rows = await pool.fetch("""
        SELECT p."Name" AS "name", p."ObjectId" AS "id", p."ObjectId" AS "objectId",
               p.project_type AS "projectType", p."Id" AS "P6Id",
               p."LastSyncAt" as "p6_last_sync", p."DataDate" as "p6_data_date", p."LastUpdateDate" as "p6_last_updated"
        FROM p6_projects p
        JOIN project_assignments pa ON p."ObjectId" = pa.project_id
        WHERE pa.user_id = $1
        ORDER BY p."Name"
    """, user_id)
    return [dict(r) for r in rows]
