# app/routers/projects.py
"""
Projects router – CRUD + assignment listing.
Direct port of Express routes/projects.js + controllers/projectsController.js
"""

import logging
from typing import Optional, Any

from fastapi import APIRouter, Depends, HTTPException

from app.auth.dependencies import get_current_user
from app.database import get_db, PoolWrapper
from app.services.cache_service import cache
from app.routers.project_utils import resolve_project_id

logger = logging.getLogger("adani-flow.projects")

router = APIRouter(prefix="/api/projects", tags=["Projects"])


@router.get("/all-for-assignment")
async def get_all_projects_for_assignment(
    type: Optional[str] = None,
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(get_current_user),
):
    """Get all projects for assignment dropdown (PMAG and Site PM only)."""
    user_id = current_user["userId"]
    user_role = current_user["role"]

    privileged_roles = ("PMAG", "Super Admin", "Site PM", "admin")
    if user_role not in privileged_roles:
        raise HTTPException(403, detail={"message": "Access denied. Admin privileges required."})

    cache_key = (
        "all_projects_for_assignment_pmag"
        if user_role == "PMAG"
        else f"projects_for_assignment_sitepm_{user_id}"
    )

    cached = await cache.get(cache_key)
    if cached:
        return cached

    if user_role in ("PMAG", "Super Admin", "admin"):
        query = """
            SELECT object_id AS "id", object_id AS "ObjectId", name AS "Name", NULL AS "Location",
                   status AS "Status", 0 AS "PercentComplete",
                   start_date as "PlannedStartDate", finish_date as "PlannedFinishDate",
                   NULL AS "ActualStartDate", NULL AS "ActualFinishDate", 'p6' as "Source", 
                   parent_eps AS "parentEps", id as "P6Id", last_sync_at as "p6_last_sync", 
                   data_date as "p6_data_date", last_update_date as "p6_last_updated",
                   project_type as "projectType", app_status as "appStatus"
            FROM projects 
        """
        if type:
            query += " WHERE parent_eps ILIKE $1 ORDER BY name, object_id DESC"
            rows = await pool.fetch(query, f"%{type}%")
        else:
            query += " ORDER BY name, object_id DESC"
            rows = await pool.fetch(query)
    else:
        query = """
            SELECT p.object_id AS "id", p.object_id AS "ObjectId", p.name AS "Name", NULL AS "Location",
                   p.status AS "Status", 0 AS "PercentComplete",
                   p.start_date as "PlannedStartDate", p.finish_date as "PlannedFinishDate",
                   NULL AS "ActualStartDate", NULL AS "ActualFinishDate", 'p6' as "Source", 
                   p.parent_eps AS "parentEps", p.id as "P6Id", p.last_sync_at as "p6_last_sync", 
                   p.data_date as "p6_data_date", p.last_update_date as "p6_last_updated",
                   p.project_type as "projectType", p.app_status as "appStatus"
            FROM projects p
            INNER JOIN project_assignments pa ON p.object_id = pa.project_id
            WHERE pa.user_id = $1 AND p.app_status = 'live'
        """
        if type:
            query += " AND p.parent_eps ILIKE $2 ORDER BY p.name, p.object_id DESC"
            rows = await pool.fetch(query, user_id, f"%{type}%")
        else:
            query += " ORDER BY p.name, p.object_id DESC"
            rows = await pool.fetch(query, user_id)

    result = [dict(r) for r in rows]
    await cache.set(cache_key, result, 300)
    return result


@router.get("")
async def get_user_projects(
    type: Optional[str] = None,
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(get_current_user),
):
    """Get all projects for the authenticated user."""
    user_id = current_user["userId"]
    user_role = current_user["role"]

    logger.info(f"GET /projects - user_id={user_id}, role='{user_role}', type={type}")

    cache_key = f"user_projects_{user_id}_{user_role}_all_sources"
    cached = await cache.get(cache_key)
    if cached:
        logger.info(f"GET /projects - returning {len(cached)} cached projects for user {user_id}")
        return cached

    privileged_roles = ("PMAG", "Super Admin", "admin")
    if user_role in privileged_roles:
        query = """
            SELECT object_id AS "id", object_id AS "ObjectId", name AS "Name", NULL AS "Location",
                   status AS "Status", 0 AS "PercentComplete",
                   start_date as "PlannedStartDate", finish_date as "PlannedFinishDate",
                   description AS "Description", id as "P6Id", 'p6' as "Source",
                   NULL AS "sheetTypes", parent_eps AS "parentEps",
                   last_sync_at as "p6_last_sync", data_date as "p6_data_date", 
                   last_update_date as "p6_last_updated", last_update_user as "p6_last_user",
                   project_type as "projectType", app_status as "appStatus"
            FROM projects 
        """
        if type:
            query += " WHERE parent_eps ILIKE $1 ORDER BY name ASC, object_id DESC"
            rows = await pool.fetch(query, f"%{type}%")
        else:
            query += " ORDER BY name ASC, object_id DESC"
            rows = await pool.fetch(query)
    else:
        query = """
            SELECT p.object_id AS "id", p.object_id AS "ObjectId", p.name AS "Name", NULL AS "Location",
                   p.status AS "Status", 0 AS "PercentComplete",
                   p.start_date as "PlannedStartDate", p.finish_date as "PlannedFinishDate",
                   p.description AS "Description", p.id as "P6Id", 'p6' as "Source",
                   pa.sheet_types AS "sheetTypes", p.parent_eps AS "parentEps",
                   p.last_sync_at as "p6_last_sync", p.data_date as "p6_data_date", 
                   p.last_update_date as "p6_last_updated", p.last_update_user as "p6_last_user",
                   p.project_type as "projectType", p.app_status as "appStatus"
            FROM projects p
            INNER JOIN project_assignments pa ON p.object_id = pa.project_id
            WHERE pa.user_id = $1 AND p.app_status = 'live'
        """
        if type:
            query += " AND p.parent_eps ILIKE $2 ORDER BY p.name ASC, p.object_id DESC"
            rows = await pool.fetch(query, user_id, f"%{type}%")
        else:
            query += " ORDER BY p.name ASC, p.object_id DESC"
            rows = await pool.fetch(query, user_id)

    result = [dict(r) for r in rows]
    logger.info(f"GET /projects - returning {len(result)} projects for user {user_id} (role={user_role})")
    await cache.set(cache_key, result, 300)
    return result


@router.get("/{project_id}")
async def get_project_by_id(
    project_id: str,
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(get_current_user),
):
    """Get a specific project by ID."""
    user_id = current_user["userId"]
    user_role = current_user["role"]

    project_object_id = await resolve_project_id(project_id, pool)
    cache_key = f"project_{project_object_id}_{user_id}_{user_role}"
    cached = await cache.get(cache_key)
    if cached:
        return cached

    # Try projects table first
    if user_role in ("supervisor", "Site PM"):
        row = await pool.fetchrow("""
            SELECT p.id AS "ObjectId", p.name AS "Name", p.location AS "Location",
                   p.status AS "Status", p.progress AS "PercentComplete",
                   p.plan_start as "PlannedStartDate", p.plan_end as "PlannedFinishDate",
                   p.actual_start as "ActualStartDate", p.actual_end as "ActualFinishDate",
                   'local' as "Source", pa.sheet_types AS "sheetTypes", p.parent_eps AS "parentEps"
            FROM projects p
            INNER JOIN project_assignments pa ON p.id = pa.project_id
            WHERE p.id = $1 AND pa.user_id = $2
        """, project_object_id, user_id)
    else:
        row = await pool.fetchrow("""
            SELECT id AS "ObjectId", name AS "Name", location AS "Location",
                   status AS "Status", progress AS "PercentComplete",
                   plan_start as "PlannedStartDate", plan_end as "PlannedFinishDate",
                   actual_start as "ActualStartDate", actual_end as "ActualFinishDate",
                   'local' as "Source", NULL AS "sheetTypes", parent_eps AS "parentEps"
            FROM projects WHERE id = $1
        """, project_object_id)

    # If not found, try p6_projects table
    if not row:
        if user_role in ("supervisor", "Site PM"):
            row = await pool.fetchrow("""
                SELECT p.object_id AS "ObjectId", p.name AS "Name", NULL AS "Location",
                       p.status AS "Status", 0 AS "PercentComplete",
                       p.start_date as "PlannedStartDate", p.finish_date as "PlannedFinishDate",
                       NULL AS "ActualStartDate", NULL AS "ActualFinishDate",
                       p.description AS "Description", 'p6' as "Source",
                       pa.sheet_types AS "sheetTypes", p.parent_eps AS "parentEps",
                       p.last_sync_at as "p6_last_sync", p.data_date as "p6_data_date", p.last_update_date as "p6_last_updated"
                FROM projects p
                INNER JOIN project_assignments pa ON p.object_id = pa.project_id
                WHERE p.object_id = $1 AND pa.user_id = $2
            """, project_object_id, user_id)
        else:
            row = await pool.fetchrow("""
                SELECT object_id AS "ObjectId", name AS "Name", NULL AS "Location",
                       status AS "Status", 0 AS "PercentComplete",
                       start_date as "PlannedStartDate", finish_date as "PlannedFinishDate",
                       NULL AS "ActualStartDate", NULL AS "ActualFinishDate",
                       description AS "Description", 'p6' as "Source",
                       NULL AS "sheetTypes", parent_eps AS "parentEps",
                       last_sync_at as "p6_last_sync", data_date as "p6_data_date", last_update_date as "p6_last_updated"
                FROM projects WHERE object_id = $1
            """, project_object_id)

    if not row:
        raise HTTPException(404, detail={"message": "Project not found or not assigned to you"})

    result = dict(row)
    await cache.set(cache_key, result, 300)
    return result


@router.post("/", status_code=201)
async def create_project(
    body: dict[str, Any],
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(get_current_user),
):
    """Create a new project (PMAG only)."""
    if current_user["role"] != "PMAG":
        raise HTTPException(403, detail={"message": "Access denied. PMAG privileges required."})

    row = await pool.fetchrow("""
        INSERT INTO projects (name, location, status, progress, plan_start, plan_end, actual_start, actual_end)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id AS "ObjectId", name AS "Name", location AS "Location",
                  status AS "Status", progress AS "PercentComplete",
                  plan_start as "PlannedStartDate", plan_end as "PlannedFinishDate",
                  actual_start as "ActualStartDate", actual_end as "ActualFinishDate"
    """,
        body.get("name"), body.get("location"), body.get("status"),
        body.get("progress"), body.get("planStart"), body.get("planEnd"),
        body.get("actualStart"), body.get("actualEnd"),
    )
    await cache.flush_all()
    return dict(row)


@router.put("/{project_id}")
async def update_project(
    project_id: int,
    body: dict[str, Any],
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(get_current_user),
):
    """Update a project (PMAG only)."""
    if current_user["role"] != "PMAG":
        raise HTTPException(403, detail={"message": "Access denied. PMAG privileges required."})

    row = await pool.fetchrow("""
        UPDATE projects SET
            name = COALESCE($1, name), location = COALESCE($2, location),
            status = COALESCE($3, status), progress = COALESCE($4, progress),
            plan_start = COALESCE($5, plan_start), plan_end = COALESCE($6, plan_end),
            actual_start = COALESCE($7, actual_start), actual_end = COALESCE($8, actual_end),
            app_status = COALESCE($10, app_status)
        WHERE id = $9
        RETURNING id AS "ObjectId", name AS "Name", location AS "Location",
                  status AS "Status", progress AS "PercentComplete",
                  plan_start as "PlannedStartDate", plan_end as "PlannedFinishDate",
                  actual_start as "ActualStartDate", actual_end as "ActualFinishDate",
                  app_status as "appStatus"
    """,
        body.get("name"), body.get("location"), body.get("status"),
        body.get("progress"), body.get("planStart"), body.get("planEnd"),
        body.get("actualStart"), body.get("actualEnd"), body.get("appStatus", "live"), project_id,
    )
    if not row:
        raise HTTPException(404, detail={"message": "Project not found"})
    await cache.flush_all()
    return dict(row)


@router.delete("/{project_id}")
async def delete_project(
    project_id: int,
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(get_current_user),
):
    """Delete a project (PMAG only)."""
    if current_user["role"] != "PMAG":
        raise HTTPException(403, detail={"message": "Access denied. PMAG privileges required."})

    await pool.execute("DELETE FROM project_assignments WHERE project_id = $1", project_id)
    row = await pool.fetchrow(
        'DELETE FROM projects WHERE id = $1 RETURNING id AS "ObjectId"', project_id
    )
    if not row:
        raise HTTPException(404, detail={"message": "Project not found"})
    await cache.flush_all()
    return {"message": "Project deleted successfully", "project": dict(row)}
