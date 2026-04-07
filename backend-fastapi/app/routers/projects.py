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
        rows = await pool.fetch("""
            SELECT "ObjectId" AS "id", "ObjectId" AS "ObjectId", "Name" AS "Name", NULL AS "Location",
                   "Status" AS "Status", 0 AS "PercentComplete",
                   "StartDate" as "PlannedStartDate", "FinishDate" as "PlannedFinishDate",
                   NULL AS "ActualStartDate", NULL AS "ActualFinishDate", 'p6' as "Source", 
                   project_type AS "projectType", "Id" as "P6Id", "LastSyncAt" as "p6_last_sync", 
                   "DataDate" as "p6_data_date", "LastUpdateDate" as "p6_last_updated"
            FROM p6_projects 
            ORDER BY "Name", "ObjectId" DESC
        """)
    else:
        rows = await pool.fetch("""
            SELECT p."ObjectId" AS "id", p."ObjectId" AS "ObjectId", p."Name" AS "Name", NULL AS "Location",
                   p."Status" AS "Status", 0 AS "PercentComplete",
                   p."StartDate" as "PlannedStartDate", p."FinishDate" as "PlannedFinishDate",
                   NULL AS "ActualStartDate", NULL AS "ActualFinishDate", 'p6' as "Source", 
                   p.project_type AS "projectType", p."Id" as "P6Id", p."LastSyncAt" as "p6_last_sync", 
                   p."DataDate" as "p6_data_date", p."LastUpdateDate" as "p6_last_updated"
            FROM p6_projects p
            INNER JOIN project_assignments pa ON p."ObjectId" = pa.project_id
            WHERE pa.user_id = $1
            ORDER BY p."Name", p."ObjectId" DESC
        """, user_id)

    result = [dict(r) for r in rows]
    await cache.set(cache_key, result, 300)
    return result


@router.get("")
async def get_user_projects(
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(get_current_user),
):
    """Get all projects for the authenticated user."""
    user_id = current_user["userId"]
    user_role = current_user["role"]

    cache_key = f"user_projects_{user_id}_{user_role}_all_sources"
    # cached = await cache.get(cache_key)
    # if cached:
    #     return cached

    privileged_roles = ("PMAG", "Super Admin", "admin")
    if user_role in privileged_roles:
        rows = await pool.fetch("""
            SELECT "ObjectId" AS "id", "ObjectId" AS "ObjectId", "Name" AS "Name", NULL AS "Location",
                   "Status" AS "Status", 0 AS "PercentComplete",
                   "StartDate" as "PlannedStartDate", "FinishDate" as "PlannedFinishDate",
                   "Description" AS "Description", "Id" as "P6Id", 'p6' as "Source",
                   NULL AS "sheetTypes", project_type AS "projectType",
                   "LastSyncAt" as "p6_last_sync", "DataDate" as "p6_data_date", 
                   "LastUpdateDate" as "p6_last_updated", "LastUpdateUser" as "p6_last_user", "LastUpdateUser" as "LastUpdateUser"
            FROM p6_projects 
            ORDER BY "Name" ASC, "ObjectId" DESC
        """)
    else:
        rows = await pool.fetch("""
            SELECT p."ObjectId" AS "id", p."ObjectId" AS "ObjectId", p."Name" AS "Name", NULL AS "Location",
                   p."Status" AS "Status", 0 AS "PercentComplete",
                   p."StartDate" as "PlannedStartDate", p."FinishDate" as "PlannedFinishDate",
                   p."Description" AS "Description", p."Id" as "P6Id", 'p6' as "Source",
                   pa.sheet_types AS "sheetTypes", p.project_type AS "projectType",
                   p."LastSyncAt" as "p6_last_sync", p."DataDate" as "p6_data_date", 
                   p."LastUpdateDate" as "p6_last_updated", p."LastUpdateUser" as "p6_last_user"
            FROM p6_projects p
            INNER JOIN project_assignments pa ON p."ObjectId" = pa.project_id
            WHERE pa.user_id = $1
            ORDER BY p."Name" ASC, p."ObjectId" DESC
        """, user_id)

    result = [dict(r) for r in rows]
    # DEBUG LOG FOR SUPERVISOR DASHBOARD:
    if result:
        print(f"\n[DEBUG] Supervisor API responding with {len(result)} projects.")
        print(f"[DEBUG] Sample fields for first project: {list(result[0].keys())}")
        print(f"[DEBUG] Sample p6_last_user for first project: {result[0].get('p6_last_user')}\n")
    # Cache temporarily disabled to ensure fresh P6 audit data
    # await cache.set(cache_key, result, 300)
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
                   'local' as "Source", pa.sheet_types AS "sheetTypes"
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
                   'local' as "Source", NULL AS "sheetTypes"
            FROM projects WHERE id = $1
        """, project_object_id)

    # If not found, try p6_projects table
    if not row:
        if user_role in ("supervisor", "Site PM"):
            row = await pool.fetchrow("""
                SELECT p."ObjectId" AS "ObjectId", p."Name" AS "Name", NULL AS "Location",
                       p."Status" AS "Status", 0 AS "PercentComplete",
                       p."StartDate" as "PlannedStartDate", p."FinishDate" as "PlannedFinishDate",
                       NULL AS "ActualStartDate", NULL AS "ActualFinishDate",
                       p."Description" AS "Description", 'p6' as "Source",
                       pa.sheet_types AS "sheetTypes", p.project_type AS "projectType",
                       p."LastSyncAt" as "p6_last_sync", p."DataDate" as "p6_data_date", p."LastUpdateDate" as "p6_last_updated"
                FROM p6_projects p
                INNER JOIN project_assignments pa ON p."ObjectId" = pa.project_id
                WHERE p."ObjectId" = $1 AND pa.user_id = $2
            """, project_object_id, user_id)
        else:
            row = await pool.fetchrow("""
                SELECT "ObjectId" AS "ObjectId", "Name" AS "Name", NULL AS "Location",
                       "Status" AS "Status", 0 AS "PercentComplete",
                       "StartDate" as "PlannedStartDate", "FinishDate" as "PlannedFinishDate",
                       NULL AS "ActualStartDate", NULL AS "ActualFinishDate",
                       "Description" AS "Description", 'p6' as "Source",
                       NULL AS "sheetTypes", project_type AS "projectType",
                       "LastSyncAt" as "p6_last_sync", "DataDate" as "p6_data_date", "LastUpdateDate" as "p6_last_updated"
                FROM p6_projects WHERE "ObjectId" = $1
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
            actual_start = COALESCE($7, actual_start), actual_end = COALESCE($8, actual_end)
        WHERE id = $9
        RETURNING id AS "ObjectId", name AS "Name", location AS "Location",
                  status AS "Status", progress AS "PercentComplete",
                  plan_start as "PlannedStartDate", plan_end as "PlannedFinishDate",
                  actual_start as "ActualStartDate", actual_end as "ActualFinishDate"
    """,
        body.get("name"), body.get("location"), body.get("status"),
        body.get("progress"), body.get("planStart"), body.get("planEnd"),
        body.get("actualStart"), body.get("actualEnd"), project_id,
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
