# app/routers/super_admin.py
"""
Super Admin router – user CRUD, project CRUD, stats, system logs, assignments.
Direct port of Express routes/superAdmin.js
"""

import json
import logging
import re
from typing import Optional, Any
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Body

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


async def _notify_quietly(sender, *args) -> None:
    """Run a notification email after the response has gone out.

    Account-setup, password-reset and access-review mails are courtesy notifications: the admin
    action is complete once the database row is written. They used to be awaited inline, so with
    the mail relay unreachable every one of those clicks hung for the SMTP timeout. A failure here
    is logged and nothing else - the explicit "resend setup email" endpoint still awaits and
    reports its result, because there the mail *is* the action.
    """
    try:
        await sender(*args)
    except Exception as e:  # noqa: BLE001 - best-effort by design
        logger.error(f"Background notification email failed ({getattr(sender, '__name__', sender)}): {e}")


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
    background: BackgroundTasks,
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
            logger.error(f"DATABASE INSERT FAILED: {e}", exc_info=True)
            # Map the one constraint an administrator can actually act on; the
            # raw error names the constraint, column and type.
            if "users_email_key" in str(e):
                raise HTTPException(409, detail={"message": "A user with this email address already exists"})
            raise HTTPException(400, detail={"message": "Could not create the user. Check the details and try again."})

        logger.info(f"User created in DB with ID: {row['user_id']}. Logging action...")
        
        try:
            perf_id = current_user.get("userId")
            await create_system_log("USER_CREATED", perf_id, f"User: {name} ({email})", f"Created user {name} with role {role}")
            logger.info("Action logged to system_logs successfully")
        except Exception as e:
            logger.error(f"SYSTEM LOG ERROR (non-fatal): {e}")

        # Account setup notification. It deliberately carries NO password -
        # the administrator hands the temporary one over out of band.
        from app.services.email_service import send_account_setup_email
        background.add_task(_notify_quietly, send_account_setup_email, email, name, role)

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
        raise HTTPException(500, detail={"message": "Internal server error"})


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
    """Roles with their editable description and a live user count.

    Counts are matched case-insensitively: users carry 'Supervisor' while the old hard-coded list
    keyed on 'supervisor', so that row always read 0. A role found on a user but missing from
    role_definitions is still listed, so nothing is hidden.
    """
    defs = await pool.fetch(
        "SELECT role, description, display_order, updated_at FROM role_definitions ORDER BY display_order, role"
    )
    counts = await pool.fetch("SELECT LOWER(TRIM(role)) AS role_key, COUNT(*) AS count FROM users GROUP BY 1")
    found = {r["role_key"]: int(r["count"]) for r in counts}
    active = await pool.fetch(
        "SELECT LOWER(TRIM(role)) AS role_key, COUNT(*) AS count FROM users WHERE is_active IS NOT FALSE GROUP BY 1"
    )
    found_active = {r["role_key"]: int(r["count"]) for r in active}

    results = []
    seen = set()
    for d in defs:
        key = d["role"].strip().lower()
        seen.add(key)
        results.append({
            "id": d["role"], "name": d["role"], "permissions": d["description"],
            "userCount": found.get(key, 0), "activeUserCount": found_active.get(key, 0),
            "updatedAt": d["updated_at"],
        })
    for r in counts:
        if r["role_key"] not in seen:
            raw = await pool.fetchval("SELECT role FROM users WHERE LOWER(TRIM(role)) = $1 LIMIT 1", r["role_key"])
            results.append({
                "id": raw, "name": raw, "permissions": "",
                "userCount": int(r["count"]), "activeUserCount": found_active.get(r["role_key"], 0),
                "updatedAt": None,
            })
    return results


@router.put("/roles/{role}")
async def update_role(
    role: str,
    body: dict[str, Any] = Body(...),
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(require_super_admin),
):
    """Update a role's description. The name itself is immutable - it is matched by string
    throughout the application, so renaming it would silently strip every user of that role."""
    description = str(body.get("permissions", body.get("description", "")) or "").strip()
    if not description:
        raise HTTPException(400, detail={"message": "Description cannot be empty"})
    if len(description) > 1000:
        raise HTTPException(400, detail={"message": "Description is too long (max 1000 characters)"})

    row = await pool.fetchrow("""
        INSERT INTO role_definitions (role, description, updated_by, updated_at)
        VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
        ON CONFLICT (role) DO UPDATE
            SET description = EXCLUDED.description, updated_by = EXCLUDED.updated_by, updated_at = CURRENT_TIMESTAMP
        RETURNING role, description, updated_at
    """, role.strip(), description, current_user["userId"])

    await create_system_log("ROLE_UPDATED", current_user.get("userId"), f"Role: {role}", f"Description updated: {description[:120]}")
    return {"message": "Role updated", "role": dict(row)}


# ==========================================================
# WORKFLOW OVERRIDES
#   The Super Admin's override of the maker / checker flow: force an entry forward
#   (approve), send it back (reject) or reopen it for the supervisor, regardless of
#   which stage it is stuck at. Every override is snapshotted, logged and notified.
# ==========================================================

_WORKFLOW_STATUSES = ("submitted_to_pm", "approved_by_pm", "rejected_by_pm", "rejected_by_pmag", "final_approved")

_OVERRIDE_ACTIONS = {
    # action: (resulting status, snapshot action, human label)
    "reopen":        ("draft",          "reopened_by_admin",       "Reopened for the supervisor"),
    "approve_pm":    ("approved_by_pm", "approved_by_admin",       "Approved on behalf of the Site PM"),
    "final_approve": ("final_approved", "final_approved_by_admin", "Final approved on behalf of PMAG"),
    "reject":        ("rejected_by_pm", "rejected_by_admin",       "Rejected back to the supervisor"),
}


@router.get("/workflow/entries")
async def list_workflow_entries(
    status: Optional[str] = None,
    projectId: Optional[str] = None,
    search: Optional[str] = None,
    days: int = 60,
    limit: int = 200,
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(require_super_admin),
):
    """Entries currently inside the review workflow (anything past draft), newest first."""
    conditions = ["e.status = ANY($1)"]
    args: list[Any] = [list(_WORKFLOW_STATUSES)]
    if status and status in _WORKFLOW_STATUSES:
        conditions.append(f"e.status = ${len(args) + 1}")
        args.append(status)
    if projectId and str(projectId) not in ("all", "null", "undefined", ""):
        conditions.append(f"e.project_id = ${len(args) + 1}")
        args.append(await resolve_project_id(projectId, pool))
    if days and days > 0:
        conditions.append(f"e.updated_at >= NOW() - (${len(args) + 1} || ' days')::interval")
        args.append(str(int(days)))
    if search and search.strip():
        conditions.append(
            f"(p.name ILIKE ${len(args) + 1} OR u.name ILIKE ${len(args) + 1} OR e.sheet_type ILIKE ${len(args) + 1} OR CAST(e.id AS TEXT) = ${len(args) + 2})"
        )
        args.append(f"%{search.strip()}%")
        args.append(search.strip())
    args.append(max(1, min(int(limit), 500)))

    rows = await pool.fetch(f"""
        SELECT e.id, e.project_id AS "projectId", p.name AS "projectName", p.id AS "p6Id",
               e.sheet_type AS "sheetType", e.entry_date AS "entryDate", e.status,
               e.submitted_at AS "submittedAt", e.updated_at AS "updatedAt",
               e.pm_reviewed_at AS "reviewedAt", e.rejection_reason AS "rejectionReason",
               u.user_id AS "supervisorId", u.name AS "submittedBy", u.email AS "submittedByEmail",
               r.name AS "reviewedBy"
        FROM dpr_supervisor_entries e
        LEFT JOIN projects p ON p.object_id = e.project_id
        LEFT JOIN users u ON u.user_id = e.supervisor_id
        LEFT JOIN users r ON r.user_id = e.pm_reviewed_by
        WHERE {' AND '.join(conditions)}
        ORDER BY e.updated_at DESC
        LIMIT ${len(args)}
    """, *args)
    return [dict(r) for r in rows]


@router.post("/workflow/entries/{entry_id}/override")
async def override_workflow_entry(
    entry_id: int,
    body: dict[str, Any] = Body(...),
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(require_super_admin),
):
    action = str(body.get("action") or "").strip()
    reason = str(body.get("reason") or "").strip()
    if action not in _OVERRIDE_ACTIONS:
        raise HTTPException(400, detail={"message": f"Unknown override action '{action}'"})
    if action in ("reject", "reopen") and not reason:
        raise HTTPException(400, detail={"message": "A reason is required to reject or reopen an entry"})

    entry = await pool.fetchrow(
        "SELECT id, project_id, sheet_type, entry_date, status, supervisor_id, data_json FROM dpr_supervisor_entries WHERE id = $1",
        entry_id,
    )
    if not entry:
        raise HTTPException(404, detail={"message": f"Entry {entry_id} not found"})
    if entry["status"] == "superseded":
        raise HTTPException(409, detail={"message": "A superseded entry cannot be overridden"})

    new_status, snapshot_action, label = _OVERRIDE_ACTIONS[action]
    if entry["status"] == new_status:
        raise HTTPException(409, detail={"message": f"Entry is already '{new_status}'"})

    admin_id = current_user["userId"]
    admin_name = current_user.get("name") or current_user.get("email") or "Super Admin"
    remarks = f"[Super Admin override by {admin_name}] {label}" + (f": {reason}" if reason else "")

    if action in ("approve_pm", "final_approve"):
        await pool.execute("""
            UPDATE dpr_supervisor_entries
            SET status = $2, pm_reviewed_at = CURRENT_TIMESTAMP, pm_reviewed_by = $3, updated_at = CURRENT_TIMESTAMP
            WHERE id = $1
        """, entry_id, new_status, admin_id)
    elif action == "reject":
        await pool.execute("""
            UPDATE dpr_supervisor_entries
            SET status = $2, rejection_reason = $3, pm_reviewed_at = CURRENT_TIMESTAMP, pm_reviewed_by = $4, updated_at = CURRENT_TIMESTAMP
            WHERE id = $1
        """, entry_id, new_status, remarks, admin_id)
    else:  # reopen
        await pool.execute("""
            UPDATE dpr_supervisor_entries
            SET status = 'draft', rejection_reason = $2, updated_at = CURRENT_TIMESTAMP
            WHERE id = $1
        """, entry_id, remarks)

    from app.routers.dpr_supervisor import _save_snapshot
    from app.routers.notifications import create_notification
    from app.services.cache_service import cache

    await _save_snapshot(pool, entry_id, snapshot_action, entry["data_json"], entry["status"], new_status, admin_id, remarks)
    await create_system_log(
        "WORKFLOW_OVERRIDE", admin_id,
        f"Entry #{entry_id} ({entry['sheet_type']}, {entry['entry_date']})",
        f"{entry['status']} -> {new_status}. {remarks}",
    )
    try:
        proj = await pool.fetchval("SELECT name FROM projects WHERE object_id = $1", entry["project_id"])
        if entry["supervisor_id"]:
            await create_notification(
                pool, entry["supervisor_id"], f"Entry {label.lower()} by Super Admin",
                f"Your {entry['sheet_type'].replace('_', ' ')} entry for {entry['entry_date']} on {proj or 'the project'} was {label.lower()}."
                + (f" Reason: {reason}" if reason else ""),
                "warning" if action in ("reject", "reopen") else "success",
                project_id=entry["project_id"], entry_id=entry_id, sheet_type=entry["sheet_type"],
            )
    except Exception as e:
        logger.warning(f"Override notification failed for entry {entry_id}: {e}")
    await cache.flush_all()

    return {"message": f"{label}.", "entry": {"id": entry_id, "status": new_status, "previousStatus": entry["status"]}}


@router.get("/analytics/overview")
async def analytics_overview(
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(require_super_admin),
):
    """The four headline figures on the Analytics tab, from the database rather than placeholders."""
    users = await pool.fetchrow("""
        SELECT COUNT(*) AS total,
               COUNT(*) FILTER (WHERE is_active IS NOT FALSE AND COALESCE(account_status, 'ACTIVE') NOT IN ('DEACTIVATED', 'LOCKED')) AS active,
               COUNT(*) FILTER (WHERE last_login_at >= NOW() - INTERVAL '30 days') AS active_30d
        FROM users
    """)
    projects = await pool.fetchrow("""
        SELECT COUNT(*) AS total,
               COUNT(*) FILTER (WHERE COALESCE(app_status, 'live') = 'live') AS live
        FROM projects
    """)
    sheets = await pool.fetchrow("""
        SELECT COUNT(*) AS total,
               COUNT(*) FILTER (WHERE status <> 'superseded') AS current,
               COUNT(*) FILTER (WHERE status = 'draft') AS draft,
               COUNT(*) FILTER (WHERE status = 'submitted_to_pm') AS submitted,
               COUNT(*) FILTER (WHERE status = 'approved_by_pm') AS approved_by_pm,
               COUNT(*) FILTER (WHERE status = 'final_approved') AS final_approved,
               COUNT(*) FILTER (WHERE status IN ('rejected_by_pm', 'rejected_by_pmag')) AS rejected,
               COUNT(*) FILTER (WHERE submitted_at >= NOW() - INTERVAL '30 days') AS submitted_30d
        FROM dpr_supervisor_entries
    """)
    return {
        "totalUsers": int(users["total"]), "activeUsers": int(users["active"]), "activeUsers30d": int(users["active_30d"]),
        "totalProjects": int(projects["live"]), "allProjects": int(projects["total"]),
        "totalSheets": int(sheets["current"]), "allSheets": int(sheets["total"]),
        "sheetsByStatus": {
            "draft": int(sheets["draft"]), "submitted": int(sheets["submitted"]),
            "approvedByPm": int(sheets["approved_by_pm"]), "finalApproved": int(sheets["final_approved"]),
            "rejected": int(sheets["rejected"]),
        },
        "submittedLast30Days": int(sheets["submitted_30d"]),
    }


@router.post("/users/{user_id}/reset-password")
async def reset_password(
    user_id: int,
    request: Request,
    background: BackgroundTasks,
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

    from app.services.email_service import send_account_setup_email
    background.add_task(_notify_quietly, send_account_setup_email, target["email"], target["name"], target["role"])

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
        WITH act_prog AS (
            SELECT project_object_id,
                   ROUND(AVG(CASE 
                       WHEN actual_finish IS NOT NULL OR status = 'Completed' THEN 1.0 
                       ELSE LEAST(GREATEST(COALESCE(percent_complete, 0), 0), 1) 
                   END) * 100, 1) as progress
            FROM solar_activities
            GROUP BY project_object_id
        )
        SELECT p6."ObjectId", p6."Name", NULL AS "Location", p6."Status",
               COALESCE(ap.progress, 
                   CASE WHEN p6."SummaryPlannedLaborUnits" > 0 AND p6."SummaryActualLaborUnits" > 0 
                        THEN ROUND((p6."SummaryActualLaborUnits" / p6."SummaryPlannedLaborUnits" * 100)::numeric, 1)
                        ELSE COALESCE(p.progress, 0)
                   END, 
                   0
               ) AS "Progress",
               p6."PlannedStartDate" AS "PlanStart", p6."PlannedFinishDate" AS "PlanEnd",
               COALESCE(p6."LastSyncAt", CURRENT_TIMESTAMP) AS "CreatedAt", 'p6' AS "Source",
               COALESCE(p.project_type, 'solar') AS "ProjectType",
               COALESCE(p.app_status, 'live') AS "appStatus",
               p.parent_eps AS "parentEps", p.id AS "P6Id"
        FROM p6_projects p6
        LEFT JOIN projects p ON p6."ObjectId" = p.object_id
        LEFT JOIN act_prog ap ON p6."ObjectId" = ap.project_object_id
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

    # resolve_project_id() returns projects.object_id (integer). projects.id is
    # the P6 project id (character varying), so filtering on it raised
    # "operator does not exist: character varying = $N" and this branch could
    # never have worked. The P6 branch above already filters on object_id.
    row = await pool.fetchrow(
        f"UPDATE projects SET {', '.join(updates)}, updated_at = CURRENT_TIMESTAMP WHERE object_id = ${idx} RETURNING *", *params
    )
    if not row:
        raise HTTPException(404, detail={"message": "Project not found"})
    from app.services.cache_service import cache
    await cache.flush_all()
    return {"message": "Project updated successfully", "project": {"ObjectId": row["object_id"], "Name": row["name"]}}


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
        SELECT DISTINCT 
            COALESCE(p6."ObjectId", p.object_id) AS id,
            COALESCE(p6."Name", p.name) AS name,
            COALESCE(p6."Status", p.status) AS status,
            u.role AS role,
            assignments.sheet_types AS "sheetTypes"
        FROM (
            SELECT project_id, sheet_types FROM project_assignments WHERE user_id = $1
            UNION ALL
            SELECT project_id, NULL::jsonb AS sheet_types FROM pmag_project_assignments WHERE user_id = $1
        ) assignments
        JOIN users u ON u.user_id = $1
        LEFT JOIN p6_projects p6 ON assignments.project_id = p6."ObjectId"
        LEFT JOIN projects p ON assignments.project_id = p.object_id
        ORDER BY name
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
    actionType: Optional[str] = None,
    search: Optional[str] = None,
    sinceMinutes: Optional[int] = None,
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(require_super_admin),
):
    """System logs, newest first.

    actionType   comma-separated action types to keep (e.g. "LOGIN_SUCCESS,LOGIN_FAILED")
    search       text matched against the action, target, remarks and the name of who did it
    sinceMinutes only logs from the last N minutes
    The filters run in the database so they cover the whole log, not just the newest `limit` rows.
    """
    where: list[str] = []
    params: list[Any] = []

    if actionType:
        types = [t.strip() for t in actionType.split(",") if t.strip()]
        if types:
            params.append(types)
            where.append(f"sl.action_type = ANY(${len(params)}::text[])")
    if search and search.strip():
        params.append(f"%{search.strip()}%")
        n = len(params)
        where.append(
            f"(sl.action_type ILIKE ${n} OR COALESCE(sl.target_entity, '') ILIKE ${n} "
            f"OR COALESCE(sl.remarks, '') ILIKE ${n} OR COALESCE(u.name, '') ILIKE ${n})"
        )
    if sinceMinutes and sinceMinutes > 0:
        params.append(int(sinceMinutes))
        where.append(f"sl.created_at >= NOW() - (${len(params)} * INTERVAL '1 minute')")

    params.append(max(1, min(int(limit), 2000)))
    clause = f"WHERE {' AND '.join(where)}" if where else ""
    rows = await pool.fetch(f"""
        SELECT sl.*, sl.created_at as timestamp, u.name as performed_by_name
        FROM system_logs sl LEFT JOIN users u ON sl.performed_by = u.user_id
        {clause}
        ORDER BY sl.created_at DESC LIMIT ${len(params)}
    """, *params)
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
          d.rejection_reason,
          d.entry_date
        FROM dpr_supervisor_entries d
        -- An entry with no sheet rows (an untouched auto-created draft) has nothing to show, and there are
        -- thousands of them: left in, they crowd the newest-1000 list and every View opens an empty sheet.
        WHERE COALESCE(jsonb_array_length(NULLIF(d.data_json::jsonb -> 'rows', 'null'::jsonb)), 0) > 0
      )
      SELECT 
        e.id,
        e.sheet_type,
        e.project_id,
        COALESCE(p.name, p6."Name") AS project_name,
        e.user_id,
        u.name AS submitted_by,
        u.name AS supervisor_name,
        u.role AS user_role,
        e.entry_date,
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
        WHERE COALESCE(jsonb_array_length(NULLIF(data_json::jsonb -> 'rows', 'null'::jsonb)), 0) > 0
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
    background: BackgroundTasks,
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

    req_user = await pool.fetchrow("SELECT name, email FROM users WHERE user_id = $1", req["user_id"])
    if req_user and req_user["email"]:
        from app.services.email_service import send_access_approved_email, send_access_rejected_email
        requested_target = f"EPS: {req['eps_name']}" if req["request_type"] == "eps" else f"Project: {req['project_id']}"
        if action == "approve":
            background.add_task(_notify_quietly, send_access_approved_email, req_user["email"], req_user["name"], f"Project Access ({requested_target})")
        else:
            background.add_task(_notify_quietly, send_access_rejected_email, req_user["email"], req_user["name"], review_notes)

    return {"message": f"Request {new_status} successfully"}


# ==========================================================
# PRIVACY - RECORDED DAILY PROGRESS
# ==========================================================
#
# The same operation scripts/purge_daily_progress.py performs, exposed so it can be triggered
# without a shell on the host. It deletes recorded history, so the guards are the point:
#
#   * Super Admin only, via require_super_admin.
#   * A preview (mode="preview") reports what would go and changes nothing. The UI shows that
#     first, so nobody confirms a number they have not seen.
#   * The caller has to echo back the project type it is clearing. A mis-click cannot delete
#     wind's history while the operator believed they were clearing solar.
#   * Every deleted row is copied to dpr_daily_progress_purge_backup inside the same
#     transaction, so the delete is reversible from the database.
#
# Scope is one project type at a time on purpose - there is no "everything" option, because the
# blast radius of that is a whole site's recorded work and nobody needs it in one click.

PURGEABLE_PROJECT_TYPES = ("solar", "wind", "pss", "bess")

def _purge_scope(by_project: bool) -> str:
    """
    Rows in scope, either for a whole project type or for one project.

    $1 is the project type when clearing a type, and the project's object_id when clearing a
    single project. Both halves of the activity_source split have to be covered: a project's
    DPR-level activities are as much its recorded history as its P6 ones.
    """
    match = "p.object_id = $1" if by_project else "LOWER(p.project_type) = $1"
    return f"""
    (
      (dp.activity_source = 'p6' AND dp.activity_object_id IN (
          SELECT sa.object_id FROM solar_activities sa
          JOIN projects p ON p.object_id = sa.project_object_id
          WHERE {match}
      ))
      OR
      (dp.activity_source = 'dpr' AND dp.activity_object_id IN (
          SELECT ca.id FROM dpr_custom_activities ca
          JOIN projects p ON p.object_id = ca.project_id
          WHERE {match}
      ))
    )
"""


@router.post("/daily-progress/purge")
async def purge_daily_progress(
    body: dict[str, Any],
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(require_super_admin),
):
    """Preview or clear the recorded daily-progress history for one project type."""
    mode = str(body.get("mode") or "preview").strip().lower()
    confirm = str(body.get("confirm") or "").strip().lower()
    raw_project = body.get("projectId")

    if mode not in ("preview", "apply"):
        raise HTTPException(400, detail={"message": "mode must be 'preview' or 'apply'"})

    # A project id narrows the reset to one site; without it the whole project type goes. The
    # project is looked up rather than trusted, so the preview can name it - clearing the wrong
    # site is the mistake worth designing against, and an object id alone is unreadable.
    project_row = None
    if raw_project not in (None, ""):
        try:
            project_object_id = int(str(raw_project).strip())
        except (TypeError, ValueError):
            raise HTTPException(400, detail={"message": "projectId must be a numeric object id"})
        project_row = await pool.fetchrow(
            "SELECT object_id, name, id, project_type FROM projects WHERE object_id = $1",
            project_object_id,
        )
        if not project_row:
            raise HTTPException(404, detail={
                "message": f"No project with object id {project_object_id}"
            })
        scope_param: Any = project_object_id
        project_type = str(project_row["project_type"] or "").strip().lower()
    else:
        project_type = str(body.get("projectType") or "").strip().lower()
        if project_type not in PURGEABLE_PROJECT_TYPES:
            raise HTTPException(400, detail={
                "message": f"projectType must be one of {', '.join(PURGEABLE_PROJECT_TYPES)}"
            })
        scope_param = project_type

    by_project = project_row is not None
    _PURGE_SCOPE = _purge_scope(by_project)

    summary = await pool.fetchrow(f"""
        SELECT COUNT(*)                                              AS rows_selected,
               COUNT(*) FILTER (WHERE dp.pushed_at IS NULL)          AS unpushed,
               COUNT(*) FILTER (WHERE dp.pushed_at IS NOT NULL)      AS already_absorbed,
               COUNT(DISTINCT dp.activity_object_id)                 AS activities,
               MIN(dp.progress_date)                                 AS earliest,
               MAX(dp.progress_date)                                 AS latest
        FROM dpr_daily_progress dp WHERE {_PURGE_SCOPE}
    """, scope_param)

    # The only figure that actually moves on screen: un-pushed progress sitting on top of P6.
    impact = await pool.fetchrow(f"""
        SELECT COUNT(DISTINCT dp.activity_object_id) AS activities_whose_completed_drops,
               COALESCE(SUM(dp.today_value), 0)      AS units_removed_from_completed
        FROM dpr_daily_progress dp
        WHERE dp.pushed_at IS NULL AND COALESCE(dp.today_value, 0) <> 0 AND {_PURGE_SCOPE}
    """, scope_param)

    result = {
        "projectType": project_type,
        "projectId": project_row["object_id"] if by_project else None,
        "projectName": project_row["name"] if by_project else None,
        "projectCode": project_row["id"] if by_project else None,
        "rowsSelected": summary["rows_selected"] or 0,
        "unpushed": summary["unpushed"] or 0,
        "alreadyAbsorbed": summary["already_absorbed"] or 0,
        "activities": summary["activities"] or 0,
        "earliest": summary["earliest"].isoformat() if summary["earliest"] else None,
        "latest": summary["latest"].isoformat() if summary["latest"] else None,
        "activitiesWhoseCompletedDrops": impact["activities_whose_completed_drops"] or 0,
        "unitsRemovedFromCompleted": float(impact["units_removed_from_completed"] or 0),
        "applied": False,
    }

    if mode == "preview":
        return result

    # Echo back exactly what is being cleared: the object id for one project, the type for a
    # whole type. Confirming a project reset by typing "solar" would make the two indistinguishable.
    expected = str(project_row["object_id"]) if by_project else project_type
    if confirm != expected:
        raise HTTPException(400, detail={
            "message": (f"Type '{expected}' to confirm clearing "
                        + ("this project's history" if by_project else "that project type's history"))
        })

    if result["rowsSelected"] == 0:
        return {**result, "applied": True, "rowsDeleted": 0}

    await pool.execute("""
        CREATE TABLE IF NOT EXISTS dpr_daily_progress_purge_backup (
            LIKE dpr_daily_progress INCLUDING DEFAULTS,
            purged_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            purge_note TEXT
        )
    """)
    note = (f"super-admin purge "
            + (f"project={project_row['object_id']} ({project_row['name']})" if by_project
               else f"project_type={project_type}")
            + f" by user {current_user.get('userId')}")
    await pool.execute(
        f"INSERT INTO dpr_daily_progress_purge_backup "
        f"SELECT dp.*, NOW(), $2 FROM dpr_daily_progress dp WHERE {_PURGE_SCOPE}",
        scope_param, note,
    )
    await pool.execute(f"DELETE FROM dpr_daily_progress dp WHERE {_PURGE_SCOPE}", scope_param)

    await create_system_log(
        "DAILY_PROGRESS_PURGED",
        current_user.get("userId"),
        (f"project: {project_row['object_id']} ({project_row['name']})" if by_project
         else f"project_type: {project_type}"),
        f"Cleared {result['rowsSelected']} daily-progress rows across "
        f"{result['activities']} activities; {result['unitsRemovedFromCompleted']:g} units "
        f"removed from Completed. Rows recoverable from dpr_daily_progress_purge_backup.",
    )
    from app.services.cache_service import cache
    await cache.flush_all()

    return {**result, "applied": True, "rowsDeleted": result["rowsSelected"]}


# ── External API client credentials (OAuth2 client_credentials grant) ──────────────────
# See app/services/external_client_service.py and POST /api/external/token. A client_id/secret
# pair authenticates as an existing 'External'-role user; this is where that user's credentials
# are issued, listed and revoked. The secret itself is returned exactly once, at creation.

@router.get("/external-clients")
async def list_external_clients(
    userId: Optional[int] = None,
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(require_super_admin),
):
    from app.services import external_client_service as ext_clients
    rows = await ext_clients.list_clients(pool, user_id=userId)
    return {"clients": rows}


@router.post("/external-clients", status_code=201)
async def create_external_client(
    body: dict[str, Any] = Body(...),
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(require_super_admin),
):
    user_id = body.get("userId")
    if not user_id:
        raise HTTPException(400, detail={"message": "userId is required"})

    target = await pool.fetchrow("SELECT user_id, role, is_active FROM users WHERE user_id = $1", int(user_id))
    if not target:
        raise HTTPException(404, detail={"message": "User not found"})
    if target["role"] != "External":
        raise HTTPException(400, detail={"message": "Client credentials can only be issued for an 'External'-role account."})

    from app.services import external_client_service as ext_clients
    result = await ext_clients.create_client(
        pool, user_id=int(user_id), label=body.get("label"), created_by=current_user["userId"],
    )

    await create_system_log(
        "EXTERNAL_CLIENT_CREATED", current_user.get("userId"),
        f"user_id: {user_id}", f"Created external API client {result['client_id']}",
    )

    return {
        "message": "Save this client_secret now - it will not be shown again.",
        "clientId": result["client_id"],
        "clientSecret": result["clientSecret"],
        "label": result.get("label"),
        "id": result["id"],
    }


@router.delete("/external-clients/{client_row_id}")
async def revoke_external_client(
    client_row_id: int,
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(require_super_admin),
):
    from app.services import external_client_service as ext_clients
    revoked = await ext_clients.revoke_client(pool, client_row_id)
    if not revoked:
        raise HTTPException(404, detail={"message": "Client not found or already revoked."})

    await create_system_log(
        "EXTERNAL_CLIENT_REVOKED", current_user.get("userId"),
        f"client row: {client_row_id}", "Revoked external API client",
    )
    return {"message": "Client credential revoked.", "id": client_row_id}


# ── Master Project Groups (SuperAdmin bulk-assignment) ──────────────────────────────────
# A named group of projects (Master Solar, Master Wind, ...) that can be bulk-assigned to a
# user in one action, either replacing their current assignments or adding to them. See
# app/migrations.py (_seed_master_project_groups) for the schema and the default seed data.

@router.get("/master-groups")
async def list_master_groups(
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(require_super_admin),
):
    rows = await pool.fetch("""
        SELECT g.id, g.name, g.category, g.created_at, g.updated_at,
               COUNT(mgp.id) AS "projectCount"
        FROM master_project_groups g
        LEFT JOIN master_group_projects mgp ON mgp.group_id = g.id
        GROUP BY g.id
        ORDER BY g.name
    """)
    return {"groups": [dict(r) for r in rows]}


@router.post("/master-groups", status_code=201)
async def create_master_group(
    body: dict[str, Any] = Body(...),
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(require_super_admin),
):
    name = (body.get("name") or "").strip()
    category = (body.get("category") or "").strip().lower()
    if not name or not category:
        raise HTTPException(400, detail={"message": "name and category are required"})

    existing = await pool.fetchval("SELECT 1 FROM master_project_groups WHERE name = $1", name)
    if existing:
        raise HTTPException(409, detail={"message": f'A group named "{name}" already exists.'})

    row = await pool.fetchrow(
        "INSERT INTO master_project_groups (name, category) VALUES ($1, $2) RETURNING id, name, category, created_at, updated_at",
        name, category,
    )
    await create_system_log("MASTER_GROUP_CREATED", current_user.get("userId"), name, f"category: {category}")
    return {**dict(row), "projectCount": 0}


@router.put("/master-groups/{group_id}")
async def rename_master_group(
    group_id: int,
    body: dict[str, Any] = Body(...),
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(require_super_admin),
):
    existing = await pool.fetchrow("SELECT id, name FROM master_project_groups WHERE id = $1", group_id)
    if not existing:
        raise HTTPException(404, detail={"message": "Group not found"})

    updates = {}
    if "name" in body and (body["name"] or "").strip():
        updates["name"] = body["name"].strip()
    if "category" in body and (body["category"] or "").strip():
        updates["category"] = body["category"].strip().lower()
    if not updates:
        raise HTTPException(400, detail={"message": "Nothing to update"})

    if "name" in updates:
        clash = await pool.fetchval(
            "SELECT 1 FROM master_project_groups WHERE name = $1 AND id <> $2", updates["name"], group_id,
        )
        if clash:
            raise HTTPException(409, detail={"message": f'A group named "{updates["name"]}" already exists.'})

    set_clauses = [f"{col} = ${i+1}" for i, col in enumerate(updates.keys())]
    params = list(updates.values()) + [group_id]
    row = await pool.fetchrow(
        f"""
        UPDATE master_project_groups SET {', '.join(set_clauses)}, updated_at = NOW()
        WHERE id = ${len(params)}
        RETURNING id, name, category, created_at, updated_at
        """,
        *params,
    )
    await create_system_log(
        "MASTER_GROUP_RENAMED", current_user.get("userId"),
        f"group {group_id}", f"{existing['name']} -> {row['name']}",
    )
    return dict(row)


@router.delete("/master-groups/{group_id}")
async def delete_master_group(
    group_id: int,
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(require_super_admin),
):
    row = await pool.fetchrow("DELETE FROM master_project_groups WHERE id = $1 RETURNING name", group_id)
    if not row:
        raise HTTPException(404, detail={"message": "Group not found"})
    await create_system_log("MASTER_GROUP_DELETED", current_user.get("userId"), row["name"], None)
    return {"message": "Group deleted.", "id": group_id}


@router.get("/master-groups/{group_id}/projects")
async def get_master_group_projects(
    group_id: int,
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(require_super_admin),
):
    group = await pool.fetchrow("SELECT id, name, category FROM master_project_groups WHERE id = $1", group_id)
    if not group:
        raise HTTPException(404, detail={"message": "Group not found"})

    rows = await pool.fetch("""
        SELECT COALESCE(p6."ObjectId", p.object_id) AS id,
               COALESCE(p6."Name", p.name) AS name,
               COALESCE(p6."Status", p.status) AS status
        FROM master_group_projects mgp
        LEFT JOIN p6_projects p6 ON mgp.project_id = p6."ObjectId"
        LEFT JOIN projects p ON mgp.project_id = p.object_id
        WHERE mgp.group_id = $1
        ORDER BY name
    """, group_id)
    return {"group": dict(group), "projects": [dict(r) for r in rows]}


@router.post("/master-groups/{group_id}/projects/add")
async def add_master_group_projects(
    group_id: int,
    body: dict[str, Any] = Body(...),
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(require_super_admin),
):
    group = await pool.fetchrow("SELECT id, name FROM master_project_groups WHERE id = $1", group_id)
    if not group:
        raise HTTPException(404, detail={"message": "Group not found"})

    project_ids = body.get("projectIds") or []
    if not isinstance(project_ids, list) or not project_ids:
        raise HTTPException(400, detail={"message": "projectIds (non-empty list) is required"})

    added = 0
    for pid in project_ids:
        result = await pool.execute(
            "INSERT INTO master_group_projects (group_id, project_id) VALUES ($1, $2) ON CONFLICT (group_id, project_id) DO NOTHING",
            group_id, int(pid),
        )
        if "1" in str(result):
            added += 1

    await create_system_log(
        "MASTER_GROUP_PROJECTS_ADDED", current_user.get("userId"),
        group["name"], f"added {added} of {len(project_ids)} requested project(s)",
    )
    return {"message": f"Added {added} project(s).", "added": added}


@router.post("/master-groups/{group_id}/projects/remove")
async def remove_master_group_projects(
    group_id: int,
    body: dict[str, Any] = Body(...),
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(require_super_admin),
):
    group = await pool.fetchrow("SELECT id, name FROM master_project_groups WHERE id = $1", group_id)
    if not group:
        raise HTTPException(404, detail={"message": "Group not found"})

    project_ids = body.get("projectIds") or []
    if not isinstance(project_ids, list) or not project_ids:
        raise HTTPException(400, detail={"message": "projectIds (non-empty list) is required"})

    await pool.execute(
        "DELETE FROM master_group_projects WHERE group_id = $1 AND project_id = ANY($2::bigint[])",
        group_id, [int(p) for p in project_ids],
    )
    await create_system_log(
        "MASTER_GROUP_PROJECTS_REMOVED", current_user.get("userId"),
        group["name"], f"removed {len(project_ids)} project(s)",
    )
    return {"message": f"Removed {len(project_ids)} project(s)."}


@router.post("/master-groups/{group_id}/assign")
async def assign_master_group(
    group_id: int,
    body: dict[str, Any] = Body(...),
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(require_super_admin),
):
    """
    Bulk-assigns every project in this group to one or more users.

    mode="reset" (Reset & Assign): deletes ALL of each user's existing assignments first, so
    afterwards they have exactly this group's projects and nothing else. Every row deleted this
    way is backed up first (same pattern as the daily-progress purge above) - a reset is not
    recoverable through the UI, but the data is never actually gone.
    mode="add" (Add to Existing, the default): keeps current assignments, adds the group's
    projects on top - ON CONFLICT DO NOTHING skips anything already assigned.

    Accepts either userIds (a list, for assigning several users in one call) or the older
    single userId - both land in the same per-user loop below.

    Which table a user's assignments live in depends on role: PMAG's own dashboard (see
    projects.py get_all_projects) reads project visibility from pmag_project_assignments only -
    project_assignments is not consulted for PMAG at all. Writing to the wrong table for a PMAG
    user would silently do nothing from their point of view: "Add" would grant no visible access,
    and "Reset" would leave every one of their real (often EPS-bulk-assigned) projects in place,
    which is exactly the "still has the old ones" symptom this fixes. Every other role uses
    project_assignments, same as the regular Assign Projects screen.
    """
    group = await pool.fetchrow("SELECT id, name FROM master_project_groups WHERE id = $1", group_id)
    if not group:
        raise HTTPException(404, detail={"message": "Group not found"})

    raw_ids = body.get("userIds")
    if raw_ids is None:
        raw_ids = [body.get("userId")] if body.get("userId") else []
    if not isinstance(raw_ids, list) or not raw_ids:
        raise HTTPException(400, detail={"message": "userIds (non-empty list) is required"})
    user_ids = [int(u) for u in raw_ids]

    mode = body.get("mode", "add")
    if mode not in ("reset", "add"):
        raise HTTPException(400, detail={"message": "mode must be 'reset' or 'add'"})

    project_ids = [r["project_id"] for r in await pool.fetch(
        "SELECT project_id FROM master_group_projects WHERE group_id = $1", group_id,
    )]
    if not project_ids:
        raise HTTPException(400, detail={"message": f'"{group["name"]}" has no projects to assign.'})

    if mode == "reset":
        await pool.execute("""
            CREATE TABLE IF NOT EXISTS project_assignments_reset_backup (
                LIKE project_assignments INCLUDING DEFAULTS,
                reset_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                reset_note TEXT
            )
        """)
        await pool.execute("""
            CREATE TABLE IF NOT EXISTS pmag_project_assignments_reset_backup (
                LIKE pmag_project_assignments INCLUDING DEFAULTS,
                reset_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                reset_note TEXT
            )
        """)

    per_user: list[dict[str, Any]] = []
    total_removed = 0
    total_assigned = 0
    missing_users: list[int] = []
    touched_pmag = False

    for uid in user_ids:
        user_row = await pool.fetchrow("SELECT user_id, name, role FROM users WHERE user_id = $1", uid)
        if not user_row:
            missing_users.append(uid)
            continue
        is_pmag = user_row["role"] == "PMAG"

        removed = 0
        if mode == "reset":
            note = f'master group "{group["name"]}" reset-assign by user {current_user.get("userId")}'
            if is_pmag:
                await pool.execute(
                    "INSERT INTO pmag_project_assignments_reset_backup "
                    "SELECT ppa.*, NOW(), $2 FROM pmag_project_assignments ppa WHERE ppa.user_id = $1",
                    uid, note,
                )
                result = await pool.execute("DELETE FROM pmag_project_assignments WHERE user_id = $1", uid)
                touched_pmag = True
            else:
                await pool.execute(
                    "INSERT INTO project_assignments_reset_backup "
                    "SELECT pa.*, NOW(), $2 FROM project_assignments pa WHERE pa.user_id = $1",
                    uid, note,
                )
                result = await pool.execute("DELETE FROM project_assignments WHERE user_id = $1", uid)
            # PoolWrapper.execute() returns the driver's status message (e.g. "DELETE 12");
            # best-effort parse for the log, not load-bearing for the assignment itself.
            try:
                removed = int(str(result).split()[-1])
            except (ValueError, IndexError):
                pass

        assigned = 0
        for pid in project_ids:
            if is_pmag:
                result = await pool.execute(
                    """
                    INSERT INTO pmag_project_assignments (user_id, project_id, eps_name, assigned_by)
                    VALUES ($1, $2, $3, $4)
                    ON CONFLICT (user_id, project_id) DO NOTHING
                    """,
                    uid, pid, f'Master Group: {group["name"]}', current_user.get("userId"),
                )
                touched_pmag = True
            else:
                result = await pool.execute(
                    "INSERT INTO project_assignments (user_id, project_id) VALUES ($1, $2) ON CONFLICT (project_id, user_id) DO NOTHING",
                    uid, pid,
                )
            if "1" in str(result):
                assigned += 1

        total_removed += removed
        total_assigned += assigned
        per_user.append({
            "userId": uid, "userName": user_row["name"], "role": user_row["role"],
            "removedPriorAssignments": removed, "assigned": assigned,
        })

    if touched_pmag:
        # PMAG's project list is cached - see app/routers/projects.py and the existing
        # /pmag/assign-projects endpoint, which flushes it for the same reason.
        from app.services.cache_service import cache
        await cache.flush_all()

    await create_system_log(
        "MASTER_GROUP_ASSIGNED", current_user.get("userId"),
        f'{len(per_user)} user(s)',
        f'{group["name"]}: mode={mode}, removed {total_removed} prior assignment(s) total, '
        f'assigned {total_assigned} project(s) total across {len(per_user)} user(s)'
        + (f'; {len(missing_users)} user id(s) not found: {missing_users}' if missing_users else ''),
    )

    names = ", ".join(u["userName"] for u in per_user)
    return {
        "message": f'Assigned "{group["name"]}" ({len(project_ids)} project(s)) to {len(per_user)} user(s): {names}.'
                   + (f' {len(missing_users)} user id(s) were not found.' if missing_users else ''),
        "mode": mode,
        "totalInGroup": len(project_ids),
        "totalRemovedPriorAssignments": total_removed,
        "totalAssigned": total_assigned,
        "perUser": per_user,
        "missingUserIds": missing_users,
    }

# DPR usage report ---------------------------------------------------------------------------
# A user "used" a DPR on a day when they saved/submitted something in it that day, i.e. a row of
# dpr_supervisor_entries or dpr_sheets they own was created or updated that calendar day.
# Logins alone do not count - the report is about the DPR, not the portal.
USAGE_REPORT_DAYS = 30
USAGE_DAILY_MIN_DAYS = 20   # "uses it daily" = active on at least this many of the 30 days


def _usage_dpr_group(name: str, parent_eps: str, project_type: str = "wind") -> Optional[str]:
    """Which DPR a project belongs to for the usage report: all Solar projects form one DPR, all BESS
    projects another, and Wind is split by site (Wind Khavda, Mandvi, Mundra)."""
    ptype = (project_type or "").strip().lower()
    # Solar and BESS: one DPR per EPS (the EPC / vendor folder the project sits in in P6).
    if ptype in ("solar", "bess"):
        label = "Solar" if ptype == "solar" else "BESS"
        return f"{label} - {(parent_eps or '').strip() or 'Others'}"
    text = f"{parent_eps or ''} {name or ''}".lower()
    if "mandvi" in text:
        return "Mandvi"
    if "mundra" in text:
        return "Mundra"
    if "khavda" in text:
        return "Wind Khavda"
    return None


@router.get("/solar-projects-excel")
async def get_solar_projects_excel(
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(require_pmag_or_super_admin),
):
    """Plain Excel dump of the Solar projects: Object ID, Project ID and Project Name (P6's description of
    the project). A PMAG user gets the Solar projects assigned to them; a Super Admin gets all of them."""
    import io
    import openpyxl
    from openpyxl.styles import Alignment, Font, PatternFill
    from fastapi.responses import StreamingResponse

    params: list[Any] = []
    scope = ""
    if (current_user.get("role") or "").strip().lower() == "pmag":
        scope = "AND p.object_id IN (SELECT project_id FROM pmag_project_assignments WHERE user_id = $1)"
        params.append(current_user["userId"])
    rows = await pool.fetch(f"""
        SELECT p.object_id, p.id AS project_id, p.name, COALESCE(p.parent_eps, '') AS eps
        FROM projects p
        WHERE LOWER(COALESCE(p.project_type, '')) = 'solar' {scope}
        ORDER BY p.name, p.object_id
    """, *params)
    if not rows:
        raise HTTPException(404, detail={"message": "No Solar projects are assigned to you."})

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Solar Projects"
    ws.append(["Object ID", "Project ID", "Project Description", "EPS"])
    for c in ws[1]:
        c.font = Font(bold=True, color="FFFFFF")
        c.fill = PatternFill("solid", start_color="1F4E78", end_color="1F4E78")
        c.alignment = Alignment(horizontal="center", vertical="center")
    for r in rows:
        ws.append([int(r["object_id"]), r["project_id"], r["name"], r["eps"]])
    for col, w in zip("ABCD", (14, 34, 70, 28)):
        ws.column_dimensions[col].width = w
    ws.freeze_panes = "A2"
    ws.auto_filter.ref = ws.dimensions

    stream = io.BytesIO()
    wb.save(stream)
    stream.seek(0)
    from datetime import date
    return StreamingResponse(
        stream,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename=Solar_Projects_{date.today():%Y-%m-%d}.xlsx",
                 "Access-Control-Expose-Headers": "Content-Disposition"},
    )


@router.get("/usage-report-excel")
async def get_usage_report_excel(
    projectType: Optional[str] = None,
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(require_pmag_or_super_admin),
):
    """Excel usage report (last 30 days): one DPR per EPS for Solar and BESS, and Wind Khavda / Mandvi / Mundra for Wind.

    projectType  solar | wind | bess - limit the report to that type.
    A PMAG user only ever gets the projects assigned to them (their EPS / project assignments); a Super
    Admin gets every project.
    """
    import io
    from datetime import date, timedelta
    import openpyxl
    from openpyxl.styles import Alignment, Font, PatternFill
    from openpyxl.utils import get_column_letter
    from fastapi.responses import StreamingResponse

    today = date.today()
    days = [today - timedelta(days=i) for i in range(USAGE_REPORT_DAYS - 1, -1, -1)]
    start = days[0]

    wind = await pool.fetch(
        """
        SELECT p.object_id, p.name, COALESCE(p.parent_eps, p6."ParentEPSName", '') AS eps,
               LOWER(COALESCE(p.project_type, '')) AS ptype
        FROM projects p
        LEFT JOIN p6_projects p6 ON p6."ObjectId" = p.object_id
        WHERE LOWER(COALESCE(p.project_type, '')) IN ('solar', 'wind', 'bess') AND p.object_id IS NOT NULL
        """
    )
    wanted_type = (projectType or "").strip().lower()
    if wanted_type and wanted_type not in ("solar", "wind", "bess"):
        raise HTTPException(400, detail={"message": "projectType must be solar, wind or bess"})

    allowed_ids: Optional[set] = None
    if (current_user.get("role") or "").strip().lower() == "pmag":
        allowed_ids = {
            int(r["project_id"]) for r in await pool.fetch(
                "SELECT project_id FROM pmag_project_assignments WHERE user_id = $1", current_user["userId"]
            )
        }

    group_of: dict[int, str] = {}
    for r in wind:
        if wanted_type and r["ptype"] != wanted_type:
            continue
        if allowed_ids is not None and int(r["object_id"]) not in allowed_ids:
            continue
        g = _usage_dpr_group(r["name"], r["eps"], r["ptype"])
        if g:
            group_of[int(r["object_id"])] = g
    pids = list(group_of)
    if not pids:
        raise HTTPException(404, detail={
            "message": f"No {wanted_type or ''} projects are assigned to you, so there is no usage to report.".replace("  ", " ")
        })

    # (dpr, user_id) -> {date, ...}
    active: dict[tuple[str, int], set] = {}
    users: dict[int, dict[str, Any]] = {}
    if pids:
        assigned = await pool.fetch(
            "SELECT user_id, project_id FROM project_assignments WHERE project_id = ANY($1::bigint[])"
            " UNION SELECT user_id, project_id FROM pmag_project_assignments WHERE project_id = ANY($1::bigint[])",
            pids,
        )
        for a in assigned:
            active.setdefault((group_of[int(a["project_id"])], a["user_id"]), set())

        acts = await pool.fetch(
            """
            SELECT supervisor_id AS user_id, project_id, d::date AS day FROM (
                SELECT supervisor_id, project_id, created_at AS d FROM dpr_supervisor_entries
                UNION ALL SELECT supervisor_id, project_id, updated_at FROM dpr_supervisor_entries
                UNION ALL SELECT supervisor_id, project_id, created_at FROM dpr_sheets
                UNION ALL SELECT supervisor_id, project_id, updated_at FROM dpr_sheets
            ) t
            WHERE project_id = ANY($1::bigint[]) AND d >= $2
            GROUP BY 1, 2, 3
            """,
            pids, start,
        )
        for a in acts:
            active.setdefault((group_of[int(a["project_id"])], a["user_id"]), set()).add(a["day"])

        uids = list({k[1] for k in active})
        if uids:
            for u in await pool.fetch(
                "SELECT user_id, name, email, role FROM users WHERE user_id = ANY($1::int[])", uids
            ):
                users[u["user_id"]] = dict(u)

    # Contractor accounts (any non-Adani email) that are not on any of these projects yet and have not used
    # the DPR still belong in the report - as 0 days - so nobody drops out of it just because no one has
    # assigned their projects. They sit in their own group since there is no DPR to put them under.
    UNASSIGNED = "Not assigned to a project"
    for u in await pool.fetch(
        """
        SELECT user_id, name, email, role FROM users
        WHERE role IN ('Supervisor', 'Site PM') AND COALESCE(is_active, TRUE)
          AND RIGHT(LOWER(COALESCE(email, '')), 10) <> '@adani.com'
          AND NOT (user_id = ANY($1::int[]))
        """,
        list({k[1] for k in active}) or [0],
    ):
        users[u["user_id"]] = dict(u)
        active[(UNASSIGNED, u["user_id"])] = set()

    # A sign-in counts as a day of use, so a user who logged in but saved nothing still shows 1 for that day -
    # the same for every user, Adani or contractor.
    login_uids = list({k[1] for k in active})
    if login_uids:
        logins: dict[int, set] = {}
        for l in await pool.fetch(
            """
            SELECT performed_by AS user_id, created_at::date AS day FROM system_logs
            WHERE action_type IN ('LOGIN_SUCCESS', 'USER_LOGIN') AND performed_by = ANY($1::int[])
              AND created_at >= $2
            GROUP BY 1, 2
            """,
            login_uids, start,
        ):
            logins.setdefault(l["user_id"], set()).add(l["day"])
        for (g, uid), ds in active.items():
            ds |= logins.get(uid, set())

    # Only the DPRs in this report: a Solar report lists Solar alone, not the other four with zeros.
    wind_order = ["Wind Khavda", "Mandvi", "Mundra"]
    present = set(group_of.values())
    order = sorted((g for g in present if g not in wind_order), key=lambda g: (not g.startswith("Solar"), g.lower()))         + [g for g in wind_order if g in present]
    if any(k[0] == UNASSIGNED for k in active):
        order.append(UNASSIGNED)
    keys = sorted(active, key=lambda k: (order.index(k[0]), (users.get(k[1], {}).get("name") or "").lower()))

    head_font = Font(bold=True, color="FFFFFF")
    head_fill = PatternFill("solid", start_color="1F4E78", end_color="1F4E78")
    yes_fill = PatternFill("solid", start_color="C6EFCE", end_color="C6EFCE")
    no_fill = PatternFill("solid", start_color="FFC7CE", end_color="FFC7CE")

    def style_header(ws, row=1):
        for c in ws[row]:
            c.font, c.fill = head_font, head_fill
            c.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)

    wb = openpyxl.Workbook()

    # Sheet 1: per-DPR summary
    ws = wb.active
    ws.title = "Summary"
    ws.append([f"DPR usage report - {start:%d-%b-%Y} to {today:%d-%b-%Y} ({USAGE_REPORT_DAYS} days)"])
    ws["A1"].font = Font(bold=True, size=13)
    ws.append([f"Daily user = used the DPR on at least {USAGE_DAILY_MIN_DAYS} of the {USAGE_REPORT_DAYS} days."])
    ws.append([])
    ws.append(["DPR", "Assigned / Active Users", "Used in Last 30 Days", "Never Used (30 Days)",
               "Daily Users", "Avg Active Days per User", "Avg Users Active per Day"])
    style_header(ws, 4)
    for g in order:
        gk = [k for k in keys if k[0] == g]
        counts = [len(active[k]) for k in gk]
        used = sum(1 for c in counts if c)
        daily = sum(1 for c in counts if c >= USAGE_DAILY_MIN_DAYS)
        ws.append([g, len(gk), used, len(gk) - used, daily,
                   round(sum(counts) / len(gk), 1) if gk else 0,
                   round(sum(counts) / USAGE_REPORT_DAYS, 1)])
    for col, w in zip("ABCDEFG", (18, 22, 22, 22, 14, 24, 24)):
        ws.column_dimensions[col].width = w

    # Sheet 2: per-user
    ws = wb.create_sheet("User Usage")
    ws.append(["DPR", "User Name", "Email", "Role", "Active Days (30)", "% of Days",
               "Last Active", "Uses Daily?"])
    style_header(ws)
    for k in keys:
        u, ds = users.get(k[1], {}), active[k]
        n = len(ds)
        ws.append([k[0], u.get("name"), u.get("email"), u.get("role"), n,
                   round(n * 100 / USAGE_REPORT_DAYS), max(ds).strftime("%d-%b-%Y") if ds else "Never",
                   "Yes" if n >= USAGE_DAILY_MIN_DAYS else "No"])
        ws.cell(row=ws.max_row, column=8).fill = yes_fill if n >= USAGE_DAILY_MIN_DAYS else no_fill
    # The DPR name repeats on every user row of its group: merge each run into one centred cell.
    run_start = 2
    for r in range(2, ws.max_row + 2):
        if r > ws.max_row or ws.cell(row=r, column=1).value != ws.cell(row=run_start, column=1).value:
            if r - 1 > run_start:
                ws.merge_cells(start_row=run_start, start_column=1, end_row=r - 1, end_column=1)
            ws.cell(row=run_start, column=1).alignment = Alignment(horizontal="center", vertical="center")
            ws.cell(row=run_start, column=1).font = Font(bold=True)
            run_start = r
    for col, w in zip("ABCDEFGH", (14, 28, 34, 16, 16, 10, 14, 12)):
        ws.column_dimensions[col].width = w
    ws.freeze_panes = "B2"
    ws.auto_filter.ref = ws.dimensions

    # Sheet 3: day-by-day matrix, one row per user, 1 = used the DPR that day
    ws = wb.create_sheet("Daily Matrix")
    ws.append(["DPR", "User Name", "Role"] + [d.strftime("%d-%b") for d in days] + ["Total"])
    style_header(ws)
    for g in order:
        gk = [k for k in keys if k[0] == g]
        if not gk:
            continue
        # The group's "Users active" heading row comes first, directly under the column headings.
        ws.append([g, "Users active", ""] + [sum(1 for k in gk if d in active[k]) for d in days])
        for c in ws[ws.max_row]:
            c.font = Font(bold=True)
            c.fill = PatternFill("solid", start_color="DDEBF7", end_color="DDEBF7")
        for k in gk:
            u = users.get(k[1], {})
            flags = [1 if d in active[k] else 0 for d in days]
            ws.append([g, u.get("name"), u.get("role")] + flags + [sum(flags)])
            for ci in range(4, 4 + USAGE_REPORT_DAYS):
                cell = ws.cell(row=ws.max_row, column=ci)
                cell.fill = yes_fill if cell.value else no_fill
                cell.alignment = Alignment(horizontal="center")
        ws.append([])
    ws.column_dimensions["A"].width = 14
    ws.column_dimensions["B"].width = 28
    ws.column_dimensions["C"].width = 16
    for ci in range(4, 5 + USAGE_REPORT_DAYS):
        ws.column_dimensions[get_column_letter(ci)].width = 7
    ws.freeze_panes = "D2"

    stream = io.BytesIO()
    wb.save(stream)
    stream.seek(0)
    filename = f"DPR_Usage_Report{('_' + wanted_type.capitalize()) if wanted_type else ''}_{today:%Y-%m-%d}.xlsx"
    return StreamingResponse(
        stream,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}",
                 "Access-Control-Expose-Headers": "Content-Disposition"},
    )
