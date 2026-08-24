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

from fastapi import Request

from app.auth.dependencies import get_current_user, require_super_admin, require_pmag_or_super_admin
from app.auth.password import hash_password_async
from app.auth.password_policy import PasswordPolicyError, assert_password_allowed
from app.database import get_db, PoolWrapper
from app.services import account_service as accounts
from app.services import audit_service
from app.services import session_service
from app.services.account_service import AccountError
from app.utils.system_logger import create_system_log
from app.routers.project_utils import resolve_project_id

logger = logging.getLogger("adani-flow.super_admin")
router = APIRouter(prefix="/api/super-admin", tags=["Super Admin"])


# ==========================================================
# USER MANAGEMENT
# ==========================================================

def _serialize_user(row: dict[str, Any]) -> dict[str, Any]:
    """
    Shape a user row for User Management.

    Keeps every key the existing UI already reads (ObjectId/Name/Email/Role/
    IsActive/CreatedAt) and adds the security columns. The password hash and
    the history are never included - an administrator can reset a password but
    can never see one.
    """
    status_info = accounts.get_password_status(row)
    auth_type = accounts.auth_type_of(row)
    return {
        "ObjectId": row["user_id"],
        "Name": row["name"],
        "Email": row["email"],
        "Role": row["role"],
        "IsActive": row.get("is_active") is not False,
        "CreatedAt": row.get("created_at"),
        "AuthenticationType": auth_type,
        "AccountStatus": accounts.compute_account_status(row),
        "RecoveryEmail": row.get("recovery_email"),
        "RecoveryEmailVerified": bool(row.get("recovery_email_verified")),
        # OTP is intrinsic to email login; SSO users get MFA from Entra ID.
        "MfaStatus": "OTP Enabled" if auth_type == accounts.AUTH_EMAIL else "Managed by SSO",
        "PasswordState": status_info["state"],
        "PasswordStatusLabel": status_info["label"],
        "PasswordDaysRemaining": status_info["daysRemaining"],
        "PasswordExpiresAt": status_info["expiresAt"],
        "PasswordChangedAt": status_info["changedAt"],
        "MustChangePassword": bool(row.get("must_change_password")),
        "IsFirstLogin": bool(row.get("is_first_login")),
        "FailedLoginAttempts": row.get("failed_login_attempts") or 0,
        "LockedUntil": row.get("locked_until"),
        "IsLocked": accounts.is_locked(row),
        "LastLoginAt": row.get("last_login_at"),
    }


# Whitelisted sort columns. Anything else falls back to name, so the sort
# parameter can never be used to inject SQL.
_USER_SORT_COLUMNS = {
    "name": "name",
    "email": "email",
    "role": "role",
    "createdAt": "created_at",
    "lastLogin": "last_login_at",
    "passwordExpiry": "password_expires_at",
    "authType": "authentication_type",
}


@router.get("/users")
async def get_all_users(
    q: Optional[str] = None,
    role: Optional[str] = None,
    status: Optional[str] = None,
    authType: Optional[str] = None,
    sort: str = "name",
    order: str = "asc",
    page: int = 1,
    pageSize: int = 25,
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(require_super_admin),
):
    """
    Paginated, searchable, filterable user list.

    Search, role and auth-type filtering and sorting all run in the database.
    Status filtering is applied in Python because two of the five statuses
    ('Password Expired', 'Temporarily Locked') are derived rather than stored,
    so they have no column to filter on.

    Passing pageSize=0 returns every row unpaginated, which keeps older
    callers of this endpoint working.
    """
    where: list[str] = []
    params: list[Any] = []
    idx = 1

    if q:
        where.append(f"(LOWER(name) LIKE ${idx} OR LOWER(email) LIKE ${idx} OR LOWER(role) LIKE ${idx})")
        params.append(f"%{q.strip().lower()}%")
        idx += 1
    if role and role != "all":
        where.append(f"role = ${idx}")
        params.append(role)
        idx += 1
    if authType and authType != "all":
        where.append(f"COALESCE(authentication_type, CASE WHEN sso_provider IS NOT NULL THEN 'SSO' ELSE 'EMAIL' END) = ${idx}")
        params.append(authType.upper())
        idx += 1

    clause = f"WHERE {' AND '.join(where)}" if where else ""
    sort_column = _USER_SORT_COLUMNS.get(sort, "name")
    direction = "DESC" if str(order).lower() == "desc" else "ASC"

    rows = await pool.fetch(
        f"""SELECT {accounts.USER_AUTH_COLUMNS} FROM users {clause}
            ORDER BY {sort_column} {direction} NULLS LAST, user_id ASC""",
        *params,
    )

    items = [_serialize_user(dict(r)) for r in rows]

    if status and status != "all":
        wanted = status.strip().lower()
        # 'active'/'inactive' keep working as the legacy boolean filter.
        if wanted == "active":
            items = [u for u in items if u["AccountStatus"] == accounts.DISPLAY_ACTIVE]
        elif wanted == "inactive":
            items = [u for u in items if u["AccountStatus"] == accounts.DISPLAY_INACTIVE]
        else:
            items = [u for u in items if u["AccountStatus"].lower() == wanted]

    total = len(items)
    if pageSize and pageSize > 0:
        page = max(page, 1)
        start = (page - 1) * pageSize
        items = items[start:start + pageSize]

    return {
        "items": items,
        "total": total,
        "page": page,
        "pageSize": pageSize,
        "totalPages": (total + pageSize - 1) // pageSize if pageSize else 1,
    }


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

    # The password supplied here is TEMPORARY: the account is created with
    # must_change_password set, so the user replaces it during first login.
    # It is still held to the full policy so no weak credential ever exists.
    try:
        assert_password_allowed(password, email=email, name=name)
    except PasswordPolicyError as e:
        raise HTTPException(400, detail={"message": e.errors[0], "errors": e.errors})

    # Normalize and validate role
    role_map = {r.lower(): r for r in ["Supervisor", "Site PM", "PMAG", "Super Admin"]}
    role_lower = role.lower()
    
    if role_lower not in role_map:
        raise HTTPException(400, detail={"message": f"Invalid role. Must be one of: {', '.join(role_map.values())}"})
    
    role = role_map[role_lower]

    try:
        hashed = await hash_password_async(password)
        logger.info("Password hashed. Inserting into database...")
        
        try:
            row = await pool.fetchrow(
                """INSERT INTO users (name, email, password, role, authentication_type,
                                      is_first_login, must_change_password, account_status)
                   VALUES ($1, $2, $3, $4, 'EMAIL', TRUE, TRUE, 'PENDING_SETUP')
                   RETURNING user_id, name, email, role""",
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

        # Account setup notification. It deliberately carries NO password -
        # the administrator hands the temporary one over out of band.
        try:
            from app.services.email_service import send_account_setup_email
            await send_account_setup_email(email, name, role)
            logger.info("Account setup notification sent.")
        except Exception as e:
            logger.error(f"EMAIL ERROR (non-fatal): {e}")

        logger.info("--- CREATE USER COMPLETE ---")
        return {
            "message": "User created. They must set their own password at first login.",
            "user": {
                "ObjectId": row["user_id"], "Name": row["name"], "Email": row["email"],
                "Role": row["role"], "AuthenticationType": "EMAIL",
                "AccountStatus": accounts.DISPLAY_PENDING_SETUP,
            },
            "requiresFirstLoginSetup": True,
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
    row = await accounts.get_user_by_id(pool, user_id)
    if not row:
        raise HTTPException(404, detail={"message": "User not found"})
    return _serialize_user(row)


@router.put("/users/{user_id}")
async def update_user(
    user_id: int,
    request: Request,
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
        # Keep the durable account_status in step with the is_active flag so
        # the computed User Management status cannot drift from reality.
        updates.append(
            f"account_status = CASE WHEN ${idx} THEN "
            f"  CASE WHEN account_status = 'INACTIVE' THEN 'ACTIVE' ELSE account_status END "
            f"ELSE 'INACTIVE' END"
        )
        params.append(body["isActive"]); idx += 1
    if "recoveryEmail" in body:
        # An administrator may clear a recovery address but never set a
        # verified one - verification requires the user to prove ownership.
        updates.append(f"recovery_email = ${idx}"); params.append(body["recoveryEmail"] or None); idx += 1
        updates.append("recovery_email_verified = FALSE")

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
    entity = f"User: {row['Name']} ({row['Email']})"
    if "role" in body and body["role"] != old["role"]:
        await audit_service.record_audit(
            audit_service.ROLE_CHANGED, actor_id=perf_id, target_user_id=user_id,
            target_entity=entity, request=request,
            remarks=f"Role changed from {old['role']} to {body['role']}",
        )
    if "isActive" in body and body["isActive"] != old["is_active"]:
        action = audit_service.USER_ACTIVATED if body["isActive"] else audit_service.USER_DEACTIVATED
        await audit_service.record_audit(
            action, actor_id=perf_id, target_user_id=user_id,
            target_entity=entity, request=request,
            remarks=f"User {'activated' if body['isActive'] else 'deactivated'}",
        )

    # Role and activation both change what this user may reach, so the cached
    # access state must not survive the update.
    await accounts.invalidate_access_state(user_id)

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
    request: Request,
    body: dict[str, Any] = Body(...),
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(require_super_admin),
):
    """
    Set a new TEMPORARY password for an email-login user.

    The user is forced to replace it at their next login, the new value is
    validated against the full policy and recorded in the reuse history, and
    every existing session is revoked. The password is never emailed - the
    administrator passes it on out of band.

    Rejected for SSO accounts: their password is owned by Entra ID.
    """
    new_password = body.get("newPassword") or ""

    target = await accounts.get_user_by_id(pool, user_id)
    if not target:
        raise HTTPException(404, detail={"message": "User not found"})

    try:
        accounts.assert_email_user(target)
        await accounts.set_password(
            pool, user_id, new_password,
            action=audit_service.PASSWORD_RESET,
            actor_id=current_user.get("userId"),
            request=request,
            remarks="Temporary password set by administrator",
        )
        # A reset always ends with the user choosing their own password.
        await pool.execute(
            "UPDATE users SET must_change_password = TRUE WHERE user_id = $1", user_id
        )
        await accounts.invalidate_access_state(user_id)
    except AccountError as e:
        detail = {"message": e.message, "code": e.code}
        detail.update(e.extra)
        raise HTTPException(e.http_status, detail=detail)

    try:
        from app.services.email_service import send_account_setup_email
        await send_account_setup_email(target["email"], target["name"], target["role"])
    except Exception as e:
        logger.error(f"Failed to send password reset notification: {e}")

    return {
        "message": "Temporary password set. The user must change it at next login.",
        "user": {"ObjectId": target["user_id"], "Name": target["name"], "Email": target["email"]},
    }


@router.post("/users/{user_id}/force-password-change")
async def force_password_change(
    user_id: int,
    request: Request,
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(require_super_admin),
):
    """
    Require the user to change their password at next login.

    Unlike a reset this leaves the current password in place: the user
    authenticates with what they already know and is then routed straight into
    the create-password screen. All their sessions are revoked immediately.
    """
    try:
        await accounts.mark_must_change_password(
            pool, user_id, actor_id=current_user.get("userId"), request=request,
        )
    except AccountError as e:
        raise HTTPException(e.http_status, detail={"message": e.message, "code": e.code})
    return {"message": "The user must change their password at next login."}


@router.post("/users/{user_id}/unlock")
async def unlock_user(
    user_id: int,
    request: Request,
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(require_super_admin),
):
    """Clear a temporary lock and the failed-attempt counter."""
    try:
        await accounts.unlock_account(
            pool, user_id, actor_id=current_user.get("userId"), request=request,
        )
    except AccountError as e:
        raise HTTPException(e.http_status, detail={"message": e.message, "code": e.code})
    return {"message": "Account unlocked."}


@router.post("/users/{user_id}/resend-setup-notification")
async def resend_setup_notification(
    user_id: int,
    request: Request,
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(require_super_admin),
):
    """Re-send the credential-free account setup notification."""
    target = await accounts.get_user_by_id(pool, user_id)
    if not target:
        raise HTTPException(404, detail={"message": "User not found"})
    try:
        accounts.assert_email_user(target)
    except AccountError as e:
        raise HTTPException(e.http_status, detail={"message": e.message, "code": e.code})

    from app.services.email_service import send_account_setup_email

    result = await send_account_setup_email(target["email"], target["name"], target["role"])
    await audit_service.record_audit(
        audit_service.ACCOUNT_SETUP_NOTIFIED,
        actor_id=current_user.get("userId"),
        target_user_id=user_id,
        target_entity=audit_service.describe_user(target),
        request=request,
        result=audit_service.RESULT_SUCCESS if result.get("success") else audit_service.RESULT_FAILURE,
        remarks="Account setup notification re-sent by administrator",
    )
    if not result.get("success"):
        raise HTTPException(502, detail={"message": "Could not send the notification email.",
                                         "code": "EMAIL_SEND_FAILED"})
    return {"message": f"Setup notification sent to {target['email']}."}


@router.get("/users/{user_id}/security-events")
async def get_user_security_events(
    user_id: int,
    limit: int = 100,
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(require_super_admin),
):
    """
    Security audit timeline for one account.

    Reads the shared system_logs table, matching either events performed by
    this user or events performed against them, so an administrator sees both
    "they changed their password" and "an admin reset their password".
    """
    target = await accounts.get_user_by_id(pool, user_id)
    if not target:
        raise HTTPException(404, detail={"message": "User not found"})

    rows = await pool.fetch(
        """SELECT l.id, l.action_type, l.target_entity, l.remarks, l.created_at,
                  l.ip_address, l.user_agent, l.result,
                  a.name AS performed_by_name, a.email AS performed_by_email
           FROM system_logs l
           LEFT JOIN users a ON a.user_id = l.performed_by
           WHERE (l.target_user_id = $1 OR l.performed_by = $1)
             AND l.action_type = ANY($2)
           ORDER BY l.created_at DESC
           LIMIT $3""",
        user_id, audit_service.SECURITY_ACTIONS, max(1, min(limit, 500)),
    )

    return {
        "user": {"ObjectId": target["user_id"], "Name": target["name"], "Email": target["email"]},
        "events": [
            {
                "id": r["id"],
                "action": r["action_type"],
                "timestamp": r["created_at"],
                "ipAddress": r["ip_address"],
                "device": r["user_agent"],
                "result": r["result"] or "SUCCESS",
                "performedBy": r["performed_by_name"] or "System",
                "performedByEmail": r["performed_by_email"],
                "remarks": r["remarks"],
            }
            for r in rows
        ],
    }


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
        if "name" in body:
            await pool.execute('UPDATE p6_projects SET "Name" = $1 WHERE "ObjectId" = $2', body["name"], project_object_id)
            await pool.execute('UPDATE projects SET name = $1 WHERE object_id = $2', body["name"], project_object_id)
            
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
    
    # Update p6_projects name as well so sync doesn't overwrite it immediately
    if "name" in body and is_p6:
        await pool.execute('UPDATE p6_projects SET "Name" = $1 WHERE "ObjectId" = $2', body["name"], project_object_id)

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
        SELECT sl.*, sl.created_at as timestamp, u.name as performed_by_name
        FROM system_logs sl LEFT JOIN users u ON sl.performed_by = u.user_id
        ORDER BY sl.created_at DESC LIMIT $1
    """, limit)
    return [dict(r) for r in rows]


# ==========================================================
# ACTIVITY MONITORING
#   Who is online, who signed in when, and who did what.
#   Covers SSO and email users alike - this is access tracking,
#   not part of the email password lifecycle.
# ==========================================================

@router.get("/activity/online")
async def get_online_users(
    windowMinutes: Optional[int] = None,
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(require_super_admin),
):
    """
    Users signed in and active right now.

    "Active" means an open session seen within the presence window
    (SESSION_ONLINE_WINDOW_MINUTES, 5 by default). One row per user, with a
    count if they are signed in from more than one browser.
    """
    from app.config import settings as app_settings

    window = windowMinutes or app_settings.SESSION_ONLINE_WINDOW_MINUTES
    users = await session_service.get_online_users(pool, window)
    return {
        "windowMinutes": window,
        "count": len(users),
        "users": [
            {
                "ObjectId": u["user_id"],
                "Name": u["name"],
                "Email": u["email"],
                "Role": u["role"],
                "AuthenticationType": u["auth_type"],
                "Sessions": u["session_count"],
                "OnlineSince": u["since"],
                "LastSeenAt": u["last_seen"],
                "IpAddress": u["ip_address"],
                "Device": u["user_agent"],
            }
            for u in users
        ],
    }


@router.get("/activity/sessions")
async def get_login_history(
    userId: Optional[int] = None,
    days: int = 7,
    onlyOpen: bool = False,
    limit: int = 100,
    offset: int = 0,
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(require_super_admin),
):
    """
    Login history: who signed in, from where, on what, and when they left.

    logout_reason distinguishes a deliberate sign-out from a session that was
    revoked by a password change or simply went idle.
    """
    result = await session_service.get_sessions(
        pool, user_id=userId, days=days, only_open=onlyOpen,
        limit=max(1, min(limit, 500)), offset=max(offset, 0),
    )
    return {
        "total": result["total"],
        "items": [
            {
                "SessionId": s["session_id"],
                "ObjectId": s["user_id"],
                "Name": s["name"],
                "Email": s["email"],
                "Role": s["role"],
                "AuthenticationType": s["auth_type"],
                "LoginAt": s["login_at"],
                "LastSeenAt": s["last_seen_at"],
                "LogoutAt": s["logout_at"],
                "LogoutReason": s["logout_reason"],
                "DurationSeconds": int(s["duration_seconds"] or 0),
                "IsOnline": s["logout_at"] is None,
                "IpAddress": s["ip_address"],
                "Device": s["user_agent"],
            }
            for s in result["items"]
        ],
    }


@router.get("/activity/audit")
async def get_audit_log(
    q: Optional[str] = None,
    action: Optional[str] = None,
    userId: Optional[int] = None,
    result: Optional[str] = None,
    days: int = 30,
    limit: int = 100,
    offset: int = 0,
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(require_super_admin),
):
    """
    Filterable audit trail: who did what, to whom, from where, and whether it
    worked.

    Reads the shared system_logs table, so operational events recorded by the
    rest of the application appear here alongside the security ones.
    """
    from datetime import datetime, timedelta, timezone

    where = ["l.created_at >= $1"]
    params: list[Any] = [datetime.now(timezone.utc) - timedelta(days=max(days, 1))]
    idx = 2

    if action and action != "all":
        where.append(f"l.action_type = ${idx}"); params.append(action); idx += 1
    if result and result != "all":
        where.append(f"COALESCE(l.result, 'SUCCESS') = ${idx}"); params.append(result.upper()); idx += 1
    if userId:
        where.append(f"(l.performed_by = ${idx} OR l.target_user_id = ${idx})")
        params.append(userId); idx += 1
    if q:
        where.append(
            f"(LOWER(COALESCE(l.target_entity, '')) LIKE ${idx}"
            f" OR LOWER(COALESCE(l.remarks, '')) LIKE ${idx}"
            f" OR LOWER(COALESCE(a.name, '')) LIKE ${idx}"
            f" OR LOWER(COALESCE(a.email, '')) LIKE ${idx})"
        )
        params.append(f"%{q.strip().lower()}%"); idx += 1

    clause = "WHERE " + " AND ".join(where)

    total = await pool.fetchval(
        f"""SELECT COUNT(*) FROM system_logs l
            LEFT JOIN users a ON a.user_id = l.performed_by
            {clause}""",
        *params,
    )

    params.extend([max(1, min(limit, 500)), max(offset, 0)])
    rows = await pool.fetch(
        f"""SELECT l.id, l.action_type, l.target_entity, l.remarks, l.created_at,
                   l.ip_address, l.user_agent, l.result,
                   a.name AS actor_name, a.email AS actor_email,
                   t.name AS target_name, t.email AS target_email
            FROM system_logs l
            LEFT JOIN users a ON a.user_id = l.performed_by
            LEFT JOIN users t ON t.user_id = l.target_user_id
            {clause}
            ORDER BY l.created_at DESC
            LIMIT ${idx} OFFSET ${idx + 1}""",
        *params,
    )

    return {
        "total": total or 0,
        "items": [
            {
                "id": r["id"],
                "action": r["action_type"],
                "timestamp": r["created_at"],
                "performedBy": r["actor_name"] or "System",
                "performedByEmail": r["actor_email"],
                "target": r["target_name"] or r["target_entity"],
                "targetEmail": r["target_email"],
                "result": r["result"] or "SUCCESS",
                "ipAddress": r["ip_address"],
                "device": r["user_agent"],
                "remarks": r["remarks"],
            }
            for r in rows
        ],
    }


@router.get("/activity/summary")
async def get_activity_summary(
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(require_super_admin),
):
    """Headline counts for the Activity dashboard."""
    from app.config import settings as app_settings

    online = await session_service.get_online_users(pool)
    stats = await pool.fetchrow(
        """SELECT
             COUNT(*) FILTER (WHERE login_at >= CURRENT_TIMESTAMP - INTERVAL '24 hours') AS logins_today,
             COUNT(DISTINCT user_id) FILTER (WHERE login_at >= CURRENT_TIMESTAMP - INTERVAL '24 hours') AS users_today,
             COUNT(DISTINCT user_id) FILTER (WHERE login_at >= CURRENT_TIMESTAMP - INTERVAL '7 days') AS users_week
           FROM user_sessions"""
    )
    failures = await pool.fetchval(
        """SELECT COUNT(*) FROM system_logs
           WHERE action_type = 'LOGIN_FAILED'
             AND created_at >= CURRENT_TIMESTAMP - INTERVAL '24 hours'"""
    )
    never = await pool.fetchval(
        "SELECT COUNT(*) FROM users WHERE last_login_at IS NULL AND COALESCE(is_active, TRUE)"
    )
    return {
        "onlineNow": len(online),
        "onlineWindowMinutes": app_settings.SESSION_ONLINE_WINDOW_MINUTES,
        "loginsLast24h": stats["logins_today"] or 0,
        "distinctUsersLast24h": stats["users_today"] or 0,
        "distinctUsersLast7d": stats["users_week"] or 0,
        "failedLoginsLast24h": failures or 0,
        "neverLoggedIn": never or 0,
    }


@router.post("/activity/sessions/{session_id}/terminate")
async def terminate_session(
    session_id: str,
    request: Request,
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(require_super_admin),
):
    """
    Sign a user's session out from the administrator side.

    Deletes the refresh token as well, so the session cannot be revived. The
    access token remains valid until it expires - it is stateless - which is
    why the caller is told to combine this with a deactivation for an
    immediate cut-off.
    """
    user_id = await session_service.end_session(
        pool, session_id=session_id, reason=session_service.REASON_ADMIN
    )
    if not user_id:
        raise HTTPException(404, detail={"message": "Session not found or already closed"})

    await pool.execute("DELETE FROM refresh_tokens WHERE session_id = $1", session_id)

    target = await accounts.get_user_by_id(pool, user_id)
    await audit_service.record_audit(
        audit_service.SESSION_TERMINATED,
        actor_id=current_user.get("userId"),
        target_user_id=user_id,
        target_entity=audit_service.describe_user(target),
        request=request,
        remarks="Session terminated by administrator",
    )
    return {"message": "Session terminated."}


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


# ==========================================================
# PMAG EPS-BASED PROJECT ASSIGNMENT
# ==========================================================

@router.get("/eps-list")
async def get_eps_list(
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(require_super_admin),
):
    """Get all unique EPS values with project counts."""
    rows = await pool.fetch("""
        SELECT parent_eps AS "epsName", COUNT(*) AS "projectCount"
        FROM projects
        WHERE parent_eps IS NOT NULL AND parent_eps != ''
        GROUP BY parent_eps
        ORDER BY parent_eps
    """)
    return [dict(r) for r in rows]


@router.get("/eps/{eps_name}/projects")
async def get_eps_projects(
    eps_name: str,
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(require_super_admin),
):
    """Get all projects under a specific EPS."""
    rows = await pool.fetch("""
        SELECT object_id AS "projectId", name AS "projectName", id AS "p6Id",
               project_type AS "projectType", app_status AS "appStatus"
        FROM projects
        WHERE parent_eps = $1
        ORDER BY name
    """, eps_name)
    return [dict(r) for r in rows]


@router.get("/pmag/{user_id}/assignments")
async def get_pmag_assignments(
    user_id: int,
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(require_super_admin),
):
    """Get all project assignments for a PMAG user."""
    rows = await pool.fetch("""
        SELECT ppa.id, ppa.project_id AS "projectId", ppa.eps_name AS "epsName",
               ppa.assigned_at AS "assignedAt",
               p.name AS "projectName", p.id AS "p6Id", p.project_type AS "projectType"
        FROM pmag_project_assignments ppa
        LEFT JOIN projects p ON ppa.project_id = p.object_id
        WHERE ppa.user_id = $1
        ORDER BY ppa.eps_name, p.name
    """, user_id)
    return [dict(r) for r in rows]


@router.post("/pmag/assign-projects")
async def assign_pmag_projects(
    body: dict[str, Any] = Body(...),
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(require_super_admin),
):
    """Assign selected projects to a PMAG user."""
    user_id = body.get("userId")
    project_ids = body.get("projectIds", [])
    eps_name = body.get("epsName", "")

    if not user_id or not project_ids:
        raise HTTPException(400, detail={"message": "userId and projectIds are required"})

    # Verify user is PMAG
    user_row = await pool.fetchrow("SELECT role FROM users WHERE user_id = $1", user_id)
    if not user_row or user_row["role"] != "PMAG":
        raise HTTPException(400, detail={"message": "User is not a PMAG user"})

    assigned_by = current_user.get("userId")
    count = 0
    for pid in project_ids:
        try:
            await pool.execute("""
                INSERT INTO pmag_project_assignments (user_id, project_id, eps_name, assigned_by)
                VALUES ($1, $2, $3, $4)
                ON CONFLICT (user_id, project_id) DO UPDATE SET eps_name = $3
            """, user_id, int(pid), eps_name, assigned_by)
            count += 1
        except Exception as e:
            logger.error(f"Error assigning project {pid} to PMAG user {user_id}: {e}")

    from app.services.cache_service import cache
    await cache.flush_all()
    return {"message": f"Successfully assigned {count} projects", "assigned": count}


@router.post("/pmag/unassign-project")
async def unassign_pmag_project(
    body: dict[str, Any] = Body(...),
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(require_super_admin),
):
    """Remove a project assignment from a PMAG user."""
    user_id = body.get("userId")
    project_id = body.get("projectId")

    if not user_id or not project_id:
        raise HTTPException(400, detail={"message": "userId and projectId are required"})

    await pool.execute(
        "DELETE FROM pmag_project_assignments WHERE user_id = $1 AND project_id = $2",
        user_id, int(project_id)
    )
    from app.services.cache_service import cache
    await cache.flush_all()
    return {"message": "Project unassigned successfully"}


@router.get("/pmag/access-requests")
async def get_pmag_access_requests(
    status: Optional[str] = "pending",
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(require_super_admin),
):
    """Get all PMAG access requests."""
    query = """
        SELECT ar.id, ar.user_id AS "userId", ar.request_type AS "requestType",
               ar.eps_name AS "epsName", ar.project_id AS "projectId",
               ar.justification, ar.status,
               ar.reviewed_by AS "reviewedBy", ar.review_notes AS "reviewNotes",
               ar.reviewed_at AS "reviewedAt", ar.created_at AS "createdAt",
               u.name AS "userName", u.email AS "userEmail",
               p.name AS "projectName"
        FROM pmag_access_requests ar
        LEFT JOIN users u ON ar.user_id = u.user_id
        LEFT JOIN projects p ON ar.project_id = p.object_id
    """
    params = []
    if status and status != "all":
        query += " WHERE ar.status = $1"
        params.append(status)
    query += " ORDER BY ar.created_at DESC"

    rows = await pool.fetch(query, *params)
    return [dict(r) for r in rows]


@router.put("/pmag/access-requests/{request_id}")
async def review_pmag_access_request(
    request_id: int,
    body: dict[str, Any] = Body(...),
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(require_super_admin),
):
    """Approve or reject a PMAG access request."""
    action = body.get("action")  # 'approve' or 'reject'
    review_notes = body.get("reviewNotes", "")

    if action not in ("approve", "reject"):
        raise HTTPException(400, detail={"message": "action must be 'approve' or 'reject'"})

    # Get request details
    req = await pool.fetchrow("SELECT * FROM pmag_access_requests WHERE id = $1", request_id)
    if not req:
        raise HTTPException(404, detail={"message": "Request not found"})

    if req["status"] != "pending":
        raise HTTPException(400, detail={"message": "Request already reviewed"})

    new_status = "approved" if action == "approve" else "rejected"
    reviewer_id = current_user.get("userId")

    await pool.execute("""
        UPDATE pmag_access_requests
        SET status = $1, reviewed_by = $2, review_notes = $3, reviewed_at = CURRENT_TIMESTAMP
        WHERE id = $4
    """, new_status, reviewer_id, review_notes, request_id)

    # If approved, create the actual assignment(s)
    if action == "approve":
        if req["request_type"] == "eps":
            # Assign all projects under this EPS
            eps = req["eps_name"]
            projects = await pool.fetch(
                "SELECT object_id FROM projects WHERE parent_eps = $1", eps
            )
            for p in projects:
                try:
                    await pool.execute("""
                        INSERT INTO pmag_project_assignments (user_id, project_id, eps_name, assigned_by)
                        VALUES ($1, $2, $3, $4)
                        ON CONFLICT (user_id, project_id) DO NOTHING
                    """, req["user_id"], p["object_id"], eps, reviewer_id)
                except Exception as e:
                    logger.error(f"Error auto-assigning project {p['object_id']}: {e}")
        elif req["request_type"] == "project" and req["project_id"]:
            # Assign the specific project
            eps_row = await pool.fetchrow(
                "SELECT parent_eps FROM projects WHERE object_id = $1", req["project_id"]
            )
            try:
                await pool.execute("""
                    INSERT INTO pmag_project_assignments (user_id, project_id, eps_name, assigned_by)
                    VALUES ($1, $2, $3, $4)
                    ON CONFLICT (user_id, project_id) DO NOTHING
                """, req["user_id"], req["project_id"],
                    eps_row["parent_eps"] if eps_row else "", reviewer_id)
            except Exception as e:
                logger.error(f"Error assigning requested project: {e}")

        from app.services.cache_service import cache
        await cache.flush_all()

    try:
        from app.services.email_service import send_access_approved_email, send_access_rejected_email
        req_user = await pool.fetchrow("SELECT name, email FROM users WHERE user_id = $1", req["user_id"])
        if req_user and req_user["email"]:
            requested_target = f"EPS: {req['eps_name']}" if req["request_type"] == "eps" else f"Project: {req['project_id']}"
            if action == "approve":
                await send_access_approved_email(req_user["email"], req_user["name"], f"Project Access ({requested_target})")
            else:
                await send_access_rejected_email(req_user["email"], req_user["name"], review_notes)
    except Exception as e:
        logger.error(f"Failed to send access review email: {e}")

    return {"message": f"Request {new_status} successfully"}
