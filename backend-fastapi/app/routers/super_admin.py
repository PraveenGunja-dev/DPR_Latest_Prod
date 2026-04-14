# app/routers/super_admin.py
"""
Super Admin router – user CRUD, project CRUD, stats, system logs, assignments.
Direct port of Express routes/superAdmin.js
"""

import json
import logging
import re
from typing import Optional, Any
from fastapi import APIRouter, Depends, HTTPException, Body

from app.auth.dependencies import get_current_user, require_super_admin, require_pmag_or_super_admin
from app.auth.password import hash_password
from app.database import get_db, PoolWrapper
from app.utils.system_logger import create_system_log
from app.routers.project_utils import resolve_project_id

logger = logging.getLogger("adani-flow.super_admin")
router = APIRouter(prefix="/api/super-admin", tags=["Super Admin"])


# ==========================================================
# USER MANAGEMENT
# ==========================================================

@router.get("/users")
async def get_all_users(
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(require_super_admin),
):
    rows = await pool.fetch("""
        SELECT user_id AS "ObjectId", name AS "Name", email AS "Email", role AS "Role",
               COALESCE(is_active, true) AS "IsActive", created_at AS "CreatedAt"
        FROM users ORDER BY name
    """)
    return [dict(r) for r in rows]


@router.post("/users", status_code=201)
async def create_user(
    body: dict[str, Any] = Body(...),
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(require_super_admin),
):
    logger.info("--- CREATE USER START ---")
    
    name: str = str(body.get("name", ""))
    email: str = str(body.get("email", ""))
    password: str = str(body.get("password", ""))
    role: str = str(body.get("role", ""))

    logger.info(f"Payload: name={name}, email={email}, role={role}")

    if not all([name, email, password, role]):
        raise HTTPException(400, detail={"message": "All fields are required: name, email, password, role"})

    if not re.match(r"^[^\s@]+@[^\s@]+\.[^\s@]+$", email):
        raise HTTPException(400, detail={"message": "Invalid email format"})

    if len(password) < 8:
        raise HTTPException(400, detail={"message": "Password must be at least 8 characters long"})

    # Normalize and validate role
    role_map = {r.lower(): r for r in ["Supervisor", "Site PM", "PMAG", "Super Admin"]}
    role_lower = role.lower()
    
    if role_lower not in role_map:
        raise HTTPException(400, detail={"message": f"Invalid role. Must be one of: {', '.join(role_map.values())}"})
    
    role = role_map[role_lower]

    try:
        hashed = hash_password(password)
        logger.info("Password hashed. Inserting into database...")
        
        try:
            row = await pool.fetchrow(
                "INSERT INTO users (name, email, password, role) VALUES ($1, $2, $3, $4) RETURNING user_id, name, email, role",
                name, email, hashed, role,
            )
        except Exception as e:
            logger.error(f"DATABASE INSERT FAILED: {e}")
            raise HTTPException(400, detail={"message": f"Database insertion failure: {e}"})

        logger.info(f"User created in DB with ID: {row['user_id']}. Logging action...")
        
        try:
            perf_id = current_user.get("userId")
            await create_system_log("USER_CREATED", perf_id, f"User: {name} ({email})", f"Created user {name} with role {role}")
            logger.info("Action logged to system_logs successfully")
        except Exception as e:
            logger.error(f"SYSTEM LOG ERROR (non-fatal): {e}")

        # Send welcome email (non-blocking)
        try:
            from app.services.email_service import send_welcome_email
            await send_welcome_email(email, name, password)
            logger.info("Welcome email script executed.")
        except Exception as e:
            logger.error(f"EMAIL ERROR (non-fatal): {e}")

        logger.info("--- CREATE USER COMPLETE ---")
        return {
            "message": "User created successfully",
            "user": {"ObjectId": row["user_id"], "Name": row["name"], "Email": row["email"], "Role": row["role"]},
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"UNEXPECTED 500 CRASH in create_user: {e}", exc_info=True)
        raise HTTPException(500, detail={"message": "Internal server error", "error": str(e)})


@router.get("/users/{user_id}")
async def get_user(
    user_id: int,
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(require_super_admin),
):
    row = await pool.fetchrow("""
        SELECT user_id AS "ObjectId", name AS "Name", email AS "Email", role AS "Role",
               COALESCE(is_active, true) AS "IsActive", created_at AS "CreatedAt"
        FROM users WHERE user_id = $1
    """, user_id)
    if not row:
        raise HTTPException(404, detail={"message": "User not found"})
    return dict(row)


@router.put("/users/{user_id}")
async def update_user(
    user_id: int,
    body: dict[str, Any] = Body(...),
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(require_super_admin),
):
    updates: list[str] = []
    params: list[Any] = []
    idx: int = 1

    if "name" in body:
        updates.append(f"name = ${idx}"); params.append(str(body["name"])); idx += 1
    if "email" in body:
        email_val = str(body["email"])
        if not re.match(r"^[^\s@]+@[^\s@]+\.[^\s@]+$", email_val):
            raise HTTPException(400, detail={"message": "Invalid email format"})
        updates.append(f"email = ${idx}"); params.append(email_val); idx += 1
    if "role" in body:
        role_val = str(body["role"])
        role_map = {r.lower(): r for r in ["Supervisor", "Site PM", "PMAG", "Super Admin"]}
        role_lower = role_val.lower()
        
        if role_lower not in role_map:
            raise HTTPException(400, detail={"message": f"Invalid role. Must be one of: {', '.join(role_map.values())}"})
        
        role_val = role_map[role_lower]
        updates.append(f"role = ${idx}"); params.append(role_val); idx += 1
    if "isActive" in body:
        updates.append(f"is_active = ${idx}"); params.append(body["isActive"]); idx += 1

    if not updates:
        raise HTTPException(400, detail={"message": "No fields to update"})

    # Get old data for logging
    old = await pool.fetchrow("SELECT role, COALESCE(is_active, true) as is_active FROM users WHERE user_id = $1", user_id)
    if not old:
        raise HTTPException(404, detail={"message": "User not found"})

    params.append(user_id)
    row = await pool.fetchrow(
        f"""UPDATE users SET {', '.join(updates)}, updated_at = CURRENT_TIMESTAMP
            WHERE user_id = ${idx}
            RETURNING user_id AS "ObjectId", name AS "Name", email AS "Email", role AS "Role", COALESCE(is_active, true) AS "IsActive" """,
        *params,
    )
    if not row:
        raise HTTPException(404, detail={"message": "User not found"})

    perf_id = current_user.get("userId")
    if "role" in body and body["role"] != old["role"]:
        await create_system_log("USER_ROLE_CHANGED", perf_id, f"User: {row['Name']} ({row['Email']})", f"Role changed from {old['role']} to {body['role']}")
    if "isActive" in body and body["isActive"] != old["is_active"]:
        action = "USER_ACTIVATED" if body["isActive"] else "USER_DEACTIVATED"
        await create_system_log(action, perf_id, f"User: {row['Name']} ({row['Email']})", f"User {'activated' if body['isActive'] else 'deactivated'}")

    return {"message": "User updated successfully", "user": dict(row)}


@router.delete("/users/{user_id}")
async def delete_user(
    user_id: int,
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(require_super_admin),
):
    if user_id == current_user["userId"]:
        raise HTTPException(400, detail={"message": "Cannot delete your own account"})

    row = await pool.fetchrow("DELETE FROM users WHERE user_id = $1 RETURNING user_id", user_id)
    if not row:
        raise HTTPException(404, detail={"message": "User not found"})
    return {"message": "User deleted successfully"}


@router.get("/roles")
async def get_roles(
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(require_super_admin),
):
    rows = await pool.fetch("SELECT role, COUNT(*) as count FROM users GROUP BY role")
    
    roles_metadata = {
        "supervisor": "Site supervisor for entering daily progress reports",
        "Site PM": "Project Manager responsible for reviewing and approving site entries",
        "PMAG": "Project Management Advisory Group - Final reviewer",
        "Super Admin": "Full system access, user management, and configuration",
        "pending_approval": "User awaiting initial admin review"
    }
    
    found_roles = {r["role"]: r["count"] for r in rows}
    results = []
    
    for role_name, description in roles_metadata.items():
        results.append({
            "id": role_name,
            "name": role_name,
            "permissions": description,
            "userCount": found_roles.get(role_name, 0)
        })
        
    return results


@router.post("/users/{user_id}/reset-password")
async def reset_password(
    user_id: int,
    body: dict[str, Any] = Body(...),
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(require_super_admin),
):
    new_password = body.get("newPassword")
    if not new_password or len(new_password) < 8:
        raise HTTPException(400, detail={"message": "Password must be at least 8 characters long"})

    hashed = hash_password(new_password)
    row = await pool.fetchrow(
        "UPDATE users SET password = $1, updated_at = CURRENT_TIMESTAMP WHERE user_id = $2 RETURNING user_id, name, email",
        hashed, user_id,
    )
    if not row:
        raise HTTPException(404, detail={"message": "User not found"})
        
    try:
        from app.services.email_service import send_welcome_email
        await send_welcome_email(row["email"], row["name"], new_password)
    except Exception as e:
        logger.error(f"Failed to send password reset email: {e}")

    return {"message": "Password reset successfully", "user": {"ObjectId": row["user_id"], "Name": row["name"], "Email": row["email"]}}


# ==========================================================
# PROJECT MANAGEMENT
# ==========================================================

@router.get("/projects")
async def get_all_projects(
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(require_pmag_or_super_admin),
):
    rows = await pool.fetch("""
        SELECT p6."ObjectId", p6."Name", NULL AS "Location", p6."Status", 0 AS "Progress",
               p6."PlannedStartDate" AS "PlanStart", p6."PlannedFinishDate" AS "PlanEnd",
               COALESCE(p6."LastSyncAt", CURRENT_TIMESTAMP) AS "CreatedAt", 'p6' AS "Source",
               COALESCE(p.project_type, 'solar') AS "ProjectType",
               COALESCE(p.app_status, 'live') AS "appStatus"
        FROM p6_projects p6
        LEFT JOIN projects p ON p6."ObjectId" = p.object_id
        ORDER BY p6."Name"
    """)
    return [dict(r) for r in rows]


@router.post("/projects", status_code=201)
async def create_project(
    body: dict[str, Any] = Body(...),
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(require_super_admin),
):
    if not body.get("name"):
        raise HTTPException(400, detail={"message": "Project name is required"})

    row = await pool.fetchrow(
        "INSERT INTO projects (name, location, status, progress, plan_start, plan_end) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *",
        body["name"], body.get("location"), body.get("status", "planning"), body.get("progress", 0), body.get("planStart"), body.get("planEnd"),
    )
    return {"message": "Project created successfully", "project": {"ObjectId": row["id"], "Name": row["name"]}}


@router.put("/projects/{project_id}")
async def update_project(
    project_id: str,
    body: dict[str, Any] = Body(...),
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(require_pmag_or_super_admin),
):
    project_object_id = await resolve_project_id(project_id, pool)

    # Check if it's a P6 project
    is_p6 = await pool.fetchrow('SELECT 1 FROM p6_projects WHERE "ObjectId" = $1', project_object_id)
    if is_p6:
        if "projectType" in body:
            pt_lower = str(body["projectType"]).lower()
            await pool.execute('UPDATE p6_projects SET project_type = $1 WHERE "ObjectId" = $2', pt_lower, project_object_id)
            await pool.execute('UPDATE projects SET project_type = $1 WHERE object_id = $2', pt_lower, project_object_id)
        if "appStatus" in body:
            await pool.execute('UPDATE projects SET app_status = $1 WHERE object_id = $2', body["appStatus"], project_object_id)
            
        from app.services.cache_service import cache
        await cache.flush_all()
        return {"message": "Project updated successfully"}
    
    # Fallback for manual legacy projects
    updates = []
    params = []
    idx = 1
    for field, col in [
        ("name", "name"), ("location", "location"), ("status", "status"), 
        ("progress", "progress"), ("planStart", "plan_start"), ("planEnd", "plan_end"), 
        ("projectType", "project_type"), ("appStatus", "app_status")
    ]:
        if field in body:
            val = body[field]
            if field == "projectType":
                val = str(val).lower()
            updates.append(f"{col} = ${idx}"); params.append(val); idx += 1
    if not updates:
        raise HTTPException(400, detail={"message": "No fields to update"})
    params.append(project_object_id)
    row = await pool.fetchrow(
        f"UPDATE projects SET {', '.join(updates)}, updated_at = CURRENT_TIMESTAMP WHERE id = ${idx} RETURNING *", *params
    )
    if not row:
        raise HTTPException(404, detail={"message": "Project not found"})
    from app.services.cache_service import cache
    await cache.flush_all()
    return {"message": "Project updated successfully", "project": {"ObjectId": row["id"], "Name": row["name"]}}


@router.delete("/projects/{project_id}")
async def delete_project(
    project_id: str,
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(require_super_admin),
):
    project_object_id = await resolve_project_id(project_id, pool)
    row = await pool.fetchrow("DELETE FROM projects WHERE id = $1 RETURNING id", project_object_id)
    if not row:
        raise HTTPException(404, detail={"message": "Project not found"})
    return {"message": "Project deleted successfully"}


# ==========================================================
# STATS & ANALYTICS
# ==========================================================

@router.get("/stats")
async def get_stats(
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(require_super_admin),
):
    user_stats = await pool.fetch("SELECT role, COUNT(*) as count FROM users GROUP BY role ORDER BY role")
    project_stats = await pool.fetch('SELECT "Status" as status, COUNT(*) as count FROM p6_projects GROUP BY "Status" ORDER BY "Status"')
    sheets_stats = await pool.fetchrow("""
        SELECT COUNT(*) as total_sheets,
               COUNT(*) FILTER (WHERE status = 'draft') as draft_sheets,
               COUNT(*) FILTER (WHERE status = 'submitted') as submitted_sheets,
               COUNT(*) FILTER (WHERE status = 'approved') as approved_sheets
        FROM dpr_sheets
    """)
    return {
        "userStats": [dict(r) for r in user_stats],
        "projectStats": [dict(r) for r in project_stats],
        "sheetsStats": dict(sheets_stats) if sheets_stats else {},
    }


@router.get("/users/{user_id}/projects")
async def get_user_projects(
    user_id: int,
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(require_super_admin),
):
    rows = await pool.fetch("""
        SELECT p."ObjectId" as id, p."Name" as name
        FROM p6_projects p JOIN project_assignments pa ON p."ObjectId" = pa.project_id
        WHERE pa.user_id = $1 ORDER BY p."Name"
    """, user_id)
    return [dict(r) for r in rows]


@router.get("/users/{user_id}/analytics")
async def get_user_analytics(
    user_id: int,
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(require_super_admin),
):
    row = await pool.fetchrow("""
        SELECT COUNT(*) as total_sheets,
               COUNT(*) FILTER (WHERE status = 'approved') as approved_sheets,
               COUNT(*) FILTER (WHERE status = 'submitted') as pending_sheets,
               MAX(created_at) as last_submission
        FROM dpr_sheets WHERE user_id = $1
    """, user_id)
    return {
        "totalSheets": int(row["total_sheets"] or 0),
        "approvedSheets": int(row["approved_sheets"] or 0),
        "pendingSheets": int(row["pending_sheets"] or 0),
        "lastSubmission": row["last_submission"].isoformat().split("T")[0] if row["last_submission"] else None,
    }


@router.get("/users/{user_id}/sheets")
async def get_user_sheets(
    user_id: int,
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(require_super_admin),
):
    rows = await pool.fetch("""
        SELECT ds.id, ds.sheet_date as date, ds.status, p."Name" as project
        FROM dpr_sheets ds JOIN p6_projects p ON ds.project_id = p."ObjectId"
        WHERE ds.user_id = $1 ORDER BY ds.sheet_date DESC LIMIT 10
    """, user_id)
    return [{"id": f"SHT-{r['id']:03d}", "date": r["date"].isoformat().split("T")[0], "status": r["status"].capitalize(), "project": r["project"]} for r in rows]


# ==========================================================
# ASSIGN/UNASSIGN PROJECTS
# ==========================================================

@router.post("/users/assign-project")
async def assign_project(
    body: dict[str, Any] = Body(...),
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(require_super_admin),
):
    user_id = body.get("userId")
    raw_project_id = body.get("projectId")
    project_id = await resolve_project_id(raw_project_id, pool)
    sheet_types = body.get("sheetTypes")

    if not user_id or not project_id:
        raise HTTPException(400, detail={"message": "userId and projectId are required"})

    existing = await pool.fetchrow("SELECT * FROM project_assignments WHERE user_id = $1 AND project_id = $2", user_id, project_id)
    if existing:
        return {"message": "Project already assigned to user"}

    await pool.execute(
        "INSERT INTO project_assignments (user_id, project_id, sheet_types) VALUES ($1, $2, $3)",
        user_id, project_id, json.dumps(sheet_types) if sheet_types else None,
    )
    return {"message": "Project assigned successfully"}


@router.post("/users/unassign-project")
async def unassign_project(
    body: dict[str, Any] = Body(...),
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(require_super_admin),
):
    project_id = await resolve_project_id(body.get("projectId"), pool)
    await pool.execute("DELETE FROM project_assignments WHERE user_id = $1 AND project_id = $2", body.get("userId"), project_id)
    return {"message": "Project unassigned successfully"}


# ==========================================================
# SYSTEM LOGS
# ==========================================================

@router.get("/system-logs")
async def get_system_logs(
    limit: int = 50,
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(require_super_admin),
):
    rows = await pool.fetch("""
        SELECT sl.*, u.name as performer_name
        FROM system_logs sl LEFT JOIN users u ON sl.performed_by = u.user_id
        ORDER BY sl.created_at DESC LIMIT $1
    """, limit)
    return [dict(r) for r in rows]


@router.get("/entries")
async def get_all_entries(
    status: Optional[str] = "all",
    projectId: Optional[str] = "all",
    sheetType: Optional[str] = "all",
    limit: int = 50,
    offset: int = 0,
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(require_super_admin),
):
    """Get all sheet entries (Super Admin only)."""
    
    query = """
      WITH combined_entries AS (
        SELECT 
          d.id,
          d.sheet_type::text,
          d.project_id,
          d.supervisor_id AS user_id,
          d.status,
          d.data_json,
          d.created_at,
          d.updated_at,
          d.submitted_at,
          d.pm_reviewed_at AS approved_at,
          NULL::timestamp AS final_approved_at
        FROM dpr_supervisor_entries d
      )
      SELECT 
        e.id,
        e.sheet_type,
        e.project_id,
        COALESCE(p.name, p6."Name") AS project_name,
        e.user_id,
        u.name AS submitted_by,
        e.status,
        e.data_json,
        e.created_at,
        e.updated_at,
        e.submitted_at,
        e.approved_at,
        e.final_approved_at
      FROM combined_entries e
      LEFT JOIN projects p ON e.project_id = p.object_id
      LEFT JOIN p6_projects p6 ON e.project_id = p6."ObjectId"
      LEFT JOIN users u ON e.user_id = u.user_id
      WHERE 1=1
    """

    params: list[Any] = []
    idx: int = 1

    if status and status != 'all':
        query += f" AND e.status = ${idx}"; params.append(status); idx += 1
    if projectId and projectId != 'all':
        project_object_id = await resolve_project_id(projectId, pool)
        query += f" AND e.project_id = ${idx}"; params.append(project_object_id); idx += 1
    if sheetType and sheetType != 'all':
        query += f" AND e.sheet_type = ${idx}"; params.append(sheetType); idx += 1

    query += f" ORDER BY e.updated_at DESC, e.created_at DESC LIMIT ${idx} OFFSET ${idx+1}"
    params.extend([limit, offset])

    rows = await pool.fetch(query, *params)

    count_query = """
      WITH combined_entries AS (
        SELECT sheet_type::text, project_id, status FROM dpr_supervisor_entries
      )
      SELECT COUNT(*) FROM combined_entries e WHERE 1=1
    """
    c_params = []
    c_idx = 1
    if status and status != 'all':
        count_query += f" AND e.status = ${c_idx}"; c_params.append(status); c_idx += 1
    if projectId and projectId != 'all':
        project_object_id = await resolve_project_id(projectId, pool)
        count_query += f" AND e.project_id = ${c_idx}"; c_params.append(project_object_id); c_idx += 1
    if sheetType and sheetType != 'all':
        count_query += f" AND e.sheet_type = ${c_idx}"; c_params.append(sheetType); c_idx += 1

    total = await pool.fetchval(count_query, *c_params)

    return {
        "entries": [dict(r) for r in rows],
        "total": total,
        "limit": limit,
        "offset": offset
    }


@router.get("/snapshot")
async def get_snapshot(
    startDate: Optional[str] = None,
    endDate: Optional[str] = None,
    projectId: Optional[str] = None,
    sheetType: Optional[str] = None,
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(require_super_admin),
):
    query = """
      WITH combined_entries AS (
        SELECT 
          d.id,
          d.sheet_type::text,
          d.project_id,
          d.supervisor_id AS user_id,
          d.status,
          d.data_json,
          d.created_at,
          d.updated_at,
          d.submitted_at,
          d.pm_reviewed_at AS approved_at,
          NULL::timestamp AS final_approved_at,
          d.rejection_reason
        FROM dpr_supervisor_entries d
      )
      SELECT 
        e.id,
        e.sheet_type,
        e.project_id,
        COALESCE(p.name, p6."Name") AS project_name,
        e.user_id,
        u.name AS submitted_by,
        u.role AS user_role,
        e.status,
        e.data_json,
        e.created_at,
        e.updated_at,
        e.submitted_at,
        e.approved_at,
        e.final_approved_at,
        e.rejection_reason
      FROM combined_entries e
      LEFT JOIN projects p ON e.project_id = p.object_id
      LEFT JOIN p6_projects p6 ON e.project_id = p6."ObjectId"
      LEFT JOIN users u ON e.user_id = u.user_id
      WHERE 1=1
    """

    params = []
    idx = 1

    if startDate:
        query += f" AND e.created_at >= ${idx}"
        params.append(startDate)
        idx += 1

    if endDate:
        query += f" AND e.created_at < (${idx}::date + interval '1 day')"
        params.append(endDate)
        idx += 1

    if projectId and projectId != 'all':
        project_object_id = await resolve_project_id(projectId, pool)
        query += f" AND e.project_id = ${idx}"
        params.append(project_object_id)
        idx += 1

    if sheetType and sheetType != 'all':
        sheet_types = sheetType.split(',')
        query += f" AND e.sheet_type = ANY(${idx}::text[])"
        params.append(sheet_types)
        idx += 1

    query += " ORDER BY e.created_at DESC, e.id DESC LIMIT 1000"

    entries = await pool.fetch(query, *params)

    stats_query = """
      SELECT 
        COUNT(*) as total_entries,
        COUNT(CASE WHEN status = 'draft' THEN 1 END) as draft_count,
        COUNT(CASE WHEN status = 'submitted_to_pm' THEN 1 END) as submitted_count,
        COUNT(CASE WHEN status = 'approved_by_pm' THEN 1 END) as approved_count,
        COUNT(CASE WHEN status = 'final_approved' THEN 1 END) as final_approved_count,
        COUNT(CASE WHEN status IN ('rejected_by_pm', 'rejected_by_pmag') THEN 1 END) as rejected_count,
        COUNT(DISTINCT project_id) as unique_projects,
        COUNT(DISTINCT user_id) as unique_users
      FROM (
        SELECT id, status, project_id, supervisor_id as user_id, created_at, sheet_type
        FROM dpr_supervisor_entries
      ) e
      WHERE 1=1
    """
    
    stats_params = []
    s_idx = 1
    if startDate:
        stats_query += f" AND e.created_at >= ${s_idx}"; stats_params.append(startDate); s_idx += 1
    if endDate:
        stats_query += f" AND e.created_at < (${s_idx}::date + interval '1 day')"; stats_params.append(endDate); s_idx += 1
    if projectId and projectId != 'all':
        project_object_id = await resolve_project_id(projectId, pool)
        stats_query += f" AND e.project_id = ${s_idx}"; stats_params.append(project_object_id); s_idx += 1
    if sheetType and sheetType != 'all':
        sheet_types = sheetType.split(',')
        stats_query += f" AND e.sheet_type = ANY(${s_idx}::text[])"; stats_params.append(sheet_types); s_idx += 1

    stats = await pool.fetchrow(stats_query, *stats_params)

    return {
        "entries": [dict(r) for r in entries],
        "statistics": dict(stats) if stats else {},
        "filters": {
            "startDate": startDate,
            "endDate": endDate,
            "projectId": projectId,
            "sheetType": sheetType,
        }
    }
