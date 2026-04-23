# app/routers/dpr_supervisor.py
"""
DPR Supervisor router – complete DPR workflow.
Direct port of Express routes/dprSupervisor.js + controllers/dprSupervisorController.js
"""

import json
import logging
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException

from app.auth.dependencies import get_current_user
from app.database import get_db, PoolWrapper
from app.services.cache_service import cache
from app.utils.system_logger import create_system_log
from app.routers.project_utils import resolve_project_id

from typing import Optional, Any, List
from app.routers.notifications import create_notification

logger = logging.getLogger("adani-flow.dpr_supervisor")

router = APIRouter(prefix="/api/dpr-supervisor", tags=["DPR Supervisor"])


def _format_sheet_type(sheet_type: str) -> str:
    """Convert raw sheet_type to human-readable name."""
    mapping = {
        "dp_qty": "DP Qty",
        "dp_block": "DP Block",
        "dp_vendor_block": "AC Side",
        "dp_vendor_idt": "DC Side",
        "manpower_details": "Manpower Details",
        "manpower_details_2": "Manpower Details 2",
        "testing_commissioning": "Testing & Commissioning",
        "switchyard": "Switchyard",
        "transmission_line": "Transmission Line",
        "infra_works": "Infra Works",
    }
    return mapping.get(sheet_type, sheet_type.replace("_", " ").title())


def _format_date(d) -> str:
    """Format a date object or string to DD-Mon-YY (e.g. 28-Mar-26)."""
    if d is None:
        return "N/A"
    if hasattr(d, 'strftime'):
        return d.strftime("%d-%b-%y")
    try:
        return datetime.strptime(str(d), "%Y-%m-%d").strftime("%d-%b-%y")
    except Exception:
        return str(d)


async def _get_project_name(pool, project_id: str) -> str:
    """Fetch project name from DB."""
    try:
        project_object_id = await resolve_project_id(project_id, pool)
        name = await pool.fetchval('SELECT \"Name\" FROM p6_projects WHERE \"ObjectId\" = $1', project_object_id)
        return name or f"Project #{project_id}"
    except Exception:
        return f"Project #{project_id}"


async def _save_snapshot(
    pool, entry_id: int, action: str, data_json,
    status_before: str, status_after: str,
    performed_by: int, remarks: str = None
):
    """Save a versioned snapshot of data_json for audit/comparison.
    
    Actions: 'submitted', 'approved_by_pm', 'rejected_by_pm', 
             'final_approved', 'pushed_to_p6', 'resubmitted'
    """
    try:
        # Get next version number for this entry
        last_version = await pool.fetchval(
            "SELECT COALESCE(MAX(version), 0) FROM dpr_entry_snapshots WHERE entry_id = $1",
            entry_id
        )
        next_version = last_version + 1

        data_str = json.dumps(data_json) if not isinstance(data_json, str) else data_json

        await pool.execute("""
            INSERT INTO dpr_entry_snapshots 
                (entry_id, version, action, data_json, status_before, status_after, performed_by, remarks)
            VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8)
        """, entry_id, next_version, action, data_str, status_before, status_after, performed_by, remarks)

        logger.info(f"Snapshot v{next_version} saved for entry {entry_id}: {action}")
    except Exception as e:
        logger.error(f"Failed to save snapshot for entry {entry_id}: {e}")


def _get_today_and_yesterday():
    today = datetime.now()
    yesterday = today - timedelta(days=1)
    return today.strftime("%Y-%m-%d"), yesterday.strftime("%Y-%m-%d")


async def _write_daily_progress_from_entry(pool, entry_row, logger):
    """
    Write daily progress records from a submitted entry's data_json.
    This ensures the yesterday-values API picks up progress immediately,
    not just after P6 push.
    
    Uses activityId (string like 'ACL1-CC-1000') to resolve the numeric
    activity_object_id needed for the dpr_daily_progress table.
    """
    try:
        data_json = entry_row["data_json"]
        if isinstance(data_json, str):
            data_json = json.loads(data_json)
        
        rows = data_json.get("rows", [])
        if not rows:
            return
        
        project_id = entry_row["project_id"]
        entry_date = entry_row["entry_date"]
        sheet_type = entry_row["sheet_type"]
        written = 0
        
        for row in rows:
            # Skip category headers
            if row.get("isCategoryHeading") or row.get("isCategoryRow"):
                continue
            
            activity_id_str = row.get("activityId", "")
            if not activity_id_str:
                continue
            
            # Parse todayValue
            today_val_str = str(row.get("todayValue", "") or "").strip()
            if not today_val_str or today_val_str == "0":
                continue
            
            try:
                today_val = float(today_val_str.replace(",", ""))
            except (ValueError, TypeError):
                continue
            
            # Parse cumulative
            cum_str = str(row.get("cumulative", "") or "").strip()
            try:
                cumulative_val = float(cum_str.replace(",", "")) if cum_str else 0.0
            except (ValueError, TypeError):
                cumulative_val = 0.0
            
            # Resolve activityId string -> activity_object_id (numeric)
            act_row = await pool.fetchrow(
                "SELECT object_id FROM solar_activities WHERE activity_id = $1 AND project_object_id = $2",
                activity_id_str, project_id
            )
            if not act_row:
                # Try by name match as fallback
                desc = row.get("description") or row.get("activities") or ""
                if desc:
                    act_row = await pool.fetchrow(
                        "SELECT object_id FROM solar_activities WHERE name = $1 AND project_object_id = $2",
                        desc, project_id
                    )
            
            if not act_row:
                continue
            
            act_obj_id = int(act_row["object_id"])
            
            # UPSERT into dpr_daily_progress
            await pool.execute("""
                INSERT INTO dpr_daily_progress 
                (progress_date, activity_object_id, today_value, cumulative_value, sheet_type)
                VALUES ($1, $2, $3, $4, $5)
                ON CONFLICT (activity_object_id, progress_date, sheet_type) 
                DO UPDATE SET 
                    today_value = EXCLUDED.today_value,
                    cumulative_value = EXCLUDED.cumulative_value
            """, entry_date, act_obj_id, today_val, cumulative_val, sheet_type)
            written += 1
        
        logger.info(f"Wrote {written} daily progress records for entry {entry_row['id']}")
    except Exception as e:
        logger.error(f"Failed to write daily progress from entry {entry_row.get('id')}: {e}")


def _get_empty_data(sheet_type: str, today: str, yesterday: str) -> dict:
    """Return empty initial data structure based on sheet type."""
    if sheet_type == "dp_qty":
        return {
            "staticHeader": {
                "projectInfo": "PLOT - A-06 135 MW - KHAVDA HYBRID SOLAR PHASE 3 (YEAR 2025-26)",
                "reportingDate": today,
                "progressDate": yesterday,
            },
            "rows": [{"slNo": "", "description": "", "totalQuantity": "", "uom": "", "basePlanStart": "", "basePlanFinish": "", "forecastStart": "", "forecastFinish": "", "blockCapacity": "", "phase": "", "block": "", "spvNumber": "", "actualStart": "", "actualFinish": "", "remarks": "", "priority": "", "balance": "", "cumulative": ""}],
        }
    elif sheet_type == "dp_vendor_block":
        return {"rows": [{"activityId": "", "description": "", "plot": "", "newBlockNom": "", "priority": "", "baselinePriority": "", "contractorName": "", "scope": "", "holdDueToWtg": "", "front": "", "actual": "", "completionPercentage": "", "remarks": "", "yesterdayValue": "", "todayValue": ""}]}
    elif sheet_type == "manpower_details":
        return {"totalManpower": 0, "rows": [{"activityId": "", "slNo": "", "block": "", "contractorName": "", "activity": "", "section": "", "yesterdayValue": "", "todayValue": ""}]}
    elif sheet_type == "dp_block":
        return {"rows": [{"slNo": "", "description": "", "totalQuantity": "", "uom": "", "basePlanStart": "", "basePlanFinish": "", "forecastStart": "", "forecastFinish": "", "blockCapacity": "", "phase": "", "block": "", "spvNumber": "", "actualStart": "", "actualFinish": "", "remarks": "", "priority": "", "balance": "", "cumulative": ""}]}
    elif sheet_type == "dp_vendor_idt":
        return {"rows": [{"activityId": "", "description": "", "plot": "", "vendor": "", "idtDate": "", "actualDate": "", "status": "", "yesterdayValue": "", "todayValue": ""}]}
    elif sheet_type == "testing_commissioning":
        return {"rows": [{"activityId": "", "description": "", "plot": "", "newBlockNom": "", "priority": "", "baselinePriority": "", "contractorName": "", "scope": "", "holdDueToWtg": "", "front": "", "actual": "", "completionPercentage": "", "remarks": "", "yesterdayValue": "", "todayValue": ""}]}
    elif sheet_type == "manpower_details_2":
        return {"rows": []}
    elif sheet_type in ("switchyard", "transmission_line", "infra_works"):
        return {"rows": [{"activityId": "", "description": "", "plot": "", "newBlockNom": "", "priority": "", "baselinePriority": "", "contractorName": "", "scope": "", "holdDueToWtg": "", "front": "", "actual": "", "completionPercentage": "", "remarks": "", "yesterdayValue": "", "todayValue": ""}]}
    return {"rows": [{}]}


@router.get("/draft")
async def get_draft_entry(
    projectId: str,
    sheetType: str,
    date: Optional[str] = None,
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(get_current_user),
):
    """Get or create a draft entry for a supervisor."""
    user_id = current_user["userId"]
    user_role = current_user.get("role")

    # Normalize role
    user_role_lower = user_role.lower() if user_role else ""
    is_admin = user_role_lower in ("super admin", "pmag", "admin")
    is_pm = user_role_lower == "site pm"
    
    # Check if supervisor or PM/Admin
    if user_role_lower not in ("supervisor", "site pm", "pmag", "super admin", "admin"):
        raise HTTPException(403, detail={"message": f"Access denied. Role: {user_role}"})

    # Verify project assignment (Bypass for Super Admin/PMAG)
    project_object_id = await resolve_project_id(projectId, pool)
    
    # Admins/PMAGs don't need explicit assignment entries to view
    if not is_admin:
        assignment = await pool.fetchrow(
            "SELECT sheet_types FROM project_assignments WHERE user_id = $1 AND project_id = $2",
            user_id, project_object_id,
        )
        if not assignment and not is_pm: # Site PM also usually assigned, but we can be lenient
            raise HTTPException(403, detail={"message": "Access denied: You are not assigned to this project"})

        # Check sheet permissions if present
        if assignment:
            permitted = assignment["sheet_types"]
            if permitted:
                try:
                    sheets = json.loads(permitted) if isinstance(permitted, str) else permitted
                    if sheets and sheetType not in sheets:
                        raise HTTPException(403, detail={"message": f"Access denied. You do not have permission for the sheet: {sheetType}"})
                except (json.JSONDecodeError, TypeError):
                    pass

    today_str, yesterday_str = _get_today_and_yesterday()
    target_date = date or today_str

    # Date validation - allow access to any historical date
    if date:
        from datetime import date as dt_date
        req = datetime.strptime(date, "%Y-%m-%d").date()
        target_yesterday = (req - timedelta(days=1)).isoformat()
    else:
        target_yesterday = yesterday_str

    # Check for rejected entry first (for today)
    if not date or date == today_str:
        row = await pool.fetchrow("""
            SELECT * FROM dpr_supervisor_entries
            WHERE supervisor_id = $1 AND project_id = $2 AND sheet_type = $3 AND status = 'rejected_by_pm'
            ORDER BY updated_at DESC LIMIT 1
        """, user_id, project_object_id, sheetType)
        if row:
            entry: dict[str, Any] = dict(row)
            entry["isRejected"] = True
            entry["rejectionMessage"] = "This entry was rejected by PM. Please review and resubmit."
            entry["rejectionReason"] = entry.get("rejection_reason")
            return entry

    # Check existing draft
    row = await pool.fetchrow("""
        SELECT * FROM dpr_supervisor_entries
        WHERE supervisor_id = $1 AND project_id = $2 AND sheet_type = $3 AND entry_date = $4 AND status = 'draft'
    """, user_id, project_object_id, sheetType, target_date)
    if row:
        entry = dict(row)
        db_date = entry["entry_date"].strftime("%Y-%m-%d") if entry.get("entry_date") else None
        if db_date and db_date < today_str:
            entry["isPastEdit"] = True
            entry["readOnlyMessage"] = "This is an edit for a past date. A reason is required upon submission."
        return entry

    # Check submitted/approved entries
    row = await pool.fetchrow("""
        SELECT * FROM dpr_supervisor_entries
        WHERE supervisor_id = $1 AND project_id = $2 AND sheet_type = $3 AND entry_date = $4
          AND status IN ('submitted_to_pm', 'approved_by_pm', 'final_approved')
    """, user_id, project_object_id, sheetType, target_date)
    if row:
        entry: dict[str, Any] = dict(row)
        # RELAXED FOR TESTING: Allow editing even if submitted/approved
        entry["isLocked"] = False 
        if entry["status"] == "submitted_to_pm":
            entry["message"] = "This entry is currently with PM for review. You can still make changes and resubmit."
        elif entry["status"] in ("approved_by_pm", "final_approved"):
            entry["pastEntry"] = True
            entry["message"] = "This is an already approved entry. Edits will trigger a re-review."
        return entry

    # Create new draft
    empty_data = _get_empty_data(sheetType, target_date, target_yesterday)
    row = await pool.fetchrow("""
        INSERT INTO dpr_supervisor_entries (supervisor_id, project_id, sheet_type, entry_date, previous_date, data_json, status)
        VALUES ($1, $2, $3, $4, $5, $6, 'draft') RETURNING *
    """, user_id, project_object_id, sheetType, target_date, target_yesterday, json.dumps(empty_data))

    entry = dict(row)
    db_date = entry["entry_date"].strftime("%Y-%m-%d") if entry.get("entry_date") else None
    if db_date and db_date < today_str:
        entry["isPastEdit"] = True
        entry["readOnlyMessage"] = "This is an edit for a past date. A reason is required upon submission."

    return entry


@router.post("/save-draft")
async def save_draft_entry(
    body: dict[str, Any],
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(get_current_user),
):
    entry_id = body.get("entryId")
    new_data = body.get("data")
    is_partial = body.get("isPartial", False)

    # DEBUG LOGGING for 404 investigation
    logger.info(f"save_draft_entry: entryId={entry_id}, userId={current_user['userId']}, isPartial={is_partial}")
    
    check = await pool.fetchrow(
        "SELECT id, supervisor_id, data_json, status FROM dpr_supervisor_entries WHERE id = $1",
        entry_id,
    )
    
    if not check:
        logger.error(f"save_draft_entry: Entry {entry_id} NOT FOUND in DB at all")
        raise HTTPException(404, detail={"message": f"Entry {entry_id} not found"})
    
    if check["supervisor_id"] != current_user["userId"]:
        logger.error(f"save_draft_entry: Access denied. Entry {entry_id} belongs to supervisor {check['supervisor_id']}, but current user is {current_user['userId']}")
        raise HTTPException(403, detail={"message": "Access denied: This entry belongs to another supervisor"})

    final_data = new_data

    # Log partial update details
    if is_partial and check["data_json"]:
        logger.info(f"Performing partial update for entry {entry_id}")
        try:
            existing_data = check["data_json"]
            if isinstance(existing_data, str):
                existing_data = json.loads(existing_data)
            
            # Start with existing data
            merged_data = existing_data.copy()
            
            # Merge top-level meta fields (like staticHeader)
            for key, val in new_data.items():
                if key != "rows":
                    merged_data[key] = val
            
            # Merge rows if present
            if "rows" in new_data and "rows" in merged_data:
                new_rows = new_data["rows"]
                existing_rows = merged_data["rows"]
                
                # Determine identification key
                for n_row in new_rows:
                    # Priority for identification: assignmentId (for MP2), activityId, then description
                    n_ass_id = n_row.get("assignmentId")
                    n_act_id = n_row.get("activityId")
                    n_desc = n_row.get("description") or n_row.get("activities")
                    
                    found = False
                    for i, e_row in enumerate(existing_rows):
                        e_ass_id = e_row.get("assignmentId")
                        e_act_id = e_row.get("activityId")
                        e_desc = e_row.get("description") or e_row.get("activities")

                        # If both have assignment IDs, they must match
                        if n_ass_id and e_ass_id:
                            if n_ass_id == e_ass_id:
                                existing_rows[i] = {**e_row, **n_row}
                                found = True
                                break
                            continue # Don't match on activityId if assignmentIds differ

                        # Fallback to activityId or description if assignmentId is NOT present
                        match_id = n_act_id and n_act_id == e_act_id
                        match_desc = n_desc and n_desc == e_desc
                        
                        if match_id or match_desc:
                            existing_rows[i] = {**e_row, **n_row}
                            found = True
                            break
                    
                    if not found:
                        # Append new row
                        existing_rows.append(n_row)
                
                merged_data["rows"] = existing_rows
            
            final_data = merged_data
        except Exception as e:
            logger.error(f"Merge failed for entry {entry_id}: {e}")
            # Fallback to overwrite if merge fails

    # Perform the update
    row = await pool.fetchrow(
        "UPDATE dpr_supervisor_entries SET data_json = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *",
        json.dumps(final_data), entry_id,
    )
    return dict(row)


@router.post("/submit")
async def submit_entry(
    body: dict[str, Any],
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(get_current_user),
):
    entry_id = body.get("entryId")
    edit_reason = body.get("editReason")
    user_id = current_user["userId"]

    # DEBUG LOGGING for 404 investigation
    logger.info(f"submit_entry: entryId={entry_id}, userId={user_id}")
    
    check = await pool.fetchrow(
        "SELECT id, supervisor_id, status, project_id, sheet_type, entry_date FROM dpr_supervisor_entries WHERE id = $1",
        entry_id,
    )
    
    if not check:
        logger.error(f"submit_entry: Entry {entry_id} NOT FOUND in DB at all")
        raise HTTPException(404, detail={"message": f"Entry {entry_id} not found"})
    
    if check["supervisor_id"] != user_id:
        logger.error(f"submit_entry: Access denied. Entry {entry_id} belongs to supervisor {check['supervisor_id']}, but current user is {user_id}")
        raise HTTPException(403, detail={"message": "Access denied: This entry belongs to another supervisor"})

    today_str, _ = _get_today_and_yesterday()
    db_date = check["entry_date"].strftime("%Y-%m-%d") if check.get("entry_date") else None
    is_past = (check["status"] in ("approved_by_pm", "final_approved")) or (db_date and db_date < today_str)
    reason_text = f"PAST EDIT REASON: {edit_reason}" if is_past and edit_reason else (edit_reason or None)

    row = await pool.fetchrow("""
        UPDATE dpr_supervisor_entries SET status = 'submitted_to_pm', submitted_at = CURRENT_TIMESTAMP,
        submitted_by = $2, updated_at = CURRENT_TIMESTAMP, pushed_at = NULL,
        rejection_reason = COALESCE($3::text, rejection_reason)
        WHERE id = $1 RETURNING *
    """, entry_id, user_id, reason_text)

    # Save snapshot
    action = "resubmitted" if check["status"] in ("rejected_by_pm", "rejected_by_pmag") else "submitted"
    await _save_snapshot(
        pool, entry_id, action, row["data_json"],
        check["status"], "submitted_to_pm", user_id, reason_text
    )

    # Write daily progress to dpr_daily_progress so yesterday-values query picks it up
    await _write_daily_progress_from_entry(pool, row, logger)

    # Notify Site PM(s)
    try:
        proj_name = await _get_project_name(pool, check["project_id"])
        sheet_label = _format_sheet_type(check['sheet_type'])
        date_label = _format_date(db_date)
        pms = await pool.fetch("SELECT user_id FROM users WHERE role = 'Site PM'")
        for pm in pms:
            await create_notification(
                pool, pm["user_id"], 
                "New DPR Submission", 
                f"{current_user.get('name', current_user['email'])} submitted {sheet_label} for {proj_name} ({date_label})",
                "info", check["project_id"], entry_id, check["sheet_type"]
            )
    except Exception as e:
        logger.error(f"Failed to send submission notification: {e}")

    # EMAIL NOTIFICATION TO SITE PMS & SUPER ADMIN (Optional but useful for oversight)
    try:
        from app.services.email_service import send_dpr_status_email
        from app.config import settings
        pms = await pool.fetch("SELECT name, email FROM users WHERE role = 'Site PM'")
        proj = await pool.fetchval('SELECT "Name" FROM p6_projects WHERE "ObjectId" = $1', check["project_id"])
        
        # Notify Super Admin
        if settings.SUPER_ADMIN_EMAIL:
            await send_dpr_status_email(
                settings.SUPER_ADMIN_EMAIL, "Super Admin", check["sheet_type"], "Submitted to PM",
                proj or "Project", check["entry_date"].isoformat(), f"By Supervisor: {current_user['name']}"
            )
            
        # Notify Site PMs via email as well
        for pm in pms:
            if pm["email"]:
                await send_dpr_status_email(
                    pm["email"], pm["name"], check["sheet_type"], "New Submission (Pending PM Review)",
                    proj or "Project", check["entry_date"].isoformat(), f"Submitted by {current_user.get('name', current_user['email'])}"
                )
    except Exception as ee:
        logger.error(f"Submission email notification failed: {ee}")

    await cache.flush_all()
    return {"message": "Entry submitted successfully", "entry": dict(row)}


@router.get("/pm/entries")
async def get_entries_for_pm_review(
    projectId: Optional[str] = None,
    limit: int = 100,
    offset: int = 0,
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(get_current_user),
):
    if current_user["role"] != "Site PM":
        raise HTTPException(403, detail={"message": "Access denied"})

    cache_key = f"pm_entries_{current_user['role']}_{projectId or 'all'}_{limit}_{offset}"
    cached = await cache.get(cache_key)
    if cached:
        return cached

    valid_pid = projectId and str(projectId) not in ("null", "undefined", "")
    project_object_id = None
    if valid_pid:
        project_object_id = await resolve_project_id(projectId, pool)

    if project_object_id:
        rows = await pool.fetch("""
            SELECT dse.*, u.name as supervisor_name, u.email as supervisor_email
            FROM dpr_supervisor_entries dse JOIN users u ON dse.supervisor_id = u.user_id
            WHERE dse.project_id = $1 AND dse.status IN ('submitted_to_pm', 'approved_by_pm', 'rejected_by_pm', 'final_approved')
            ORDER BY dse.submitted_at DESC
            LIMIT $2 OFFSET $3
        """, project_object_id, limit, offset)
    else:
        rows = await pool.fetch("""
            SELECT dse.*, u.name as supervisor_name, u.email as supervisor_email
            FROM dpr_supervisor_entries dse JOIN users u ON dse.supervisor_id = u.user_id
            WHERE dse.status IN ('submitted_to_pm', 'approved_by_pm', 'rejected_by_pm', 'final_approved')
            ORDER BY dse.submitted_at DESC
            LIMIT $1 OFFSET $2
        """, limit, offset)

    result = [dict(r) for r in rows]
    await cache.set(cache_key, result, 120)
    return result


@router.post("/pm/approve")
async def approve_entry_by_pm(
    body: dict[str, Any],
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(get_current_user),
):
    user_role = current_user.get("role", "").lower()
    if user_role not in ("site pm", "super admin", "pmag"):
        raise HTTPException(403, detail={"message": "Only Site PM or Admins can approve entries"})

    entry_id = body.get("entryId")
    row = await pool.fetchrow("""
        UPDATE dpr_supervisor_entries SET status = 'approved_by_pm', pm_reviewed_at = CURRENT_TIMESTAMP,
        pm_reviewed_by = $2, updated_at = CURRENT_TIMESTAMP
        WHERE id = $1 AND status = 'submitted_to_pm' RETURNING *
    """, entry_id, current_user["userId"])

    if not row:
        raise HTTPException(404, detail={"message": "Entry not found or invalid status"})
        
    # Save snapshot
    await _save_snapshot(
        pool, entry_id, "approved_by_pm", row["data_json"],
        "submitted_to_pm", "approved_by_pm", current_user["userId"]
    )
    
    await cache.flush_all()
    # Notify Supervisor and PMAG
    try:
        entry = dict(row)
        proj_name = await _get_project_name(pool, entry["project_id"])
        sheet_label = _format_sheet_type(entry['sheet_type'])
        date_label = _format_date(entry['entry_date'])
        # Notify Supervisor
        await create_notification(
            pool, entry["supervisor_id"], 
            "DPR Approved by PM", 
            f"Your {sheet_label} for {proj_name} ({date_label}) has been approved by Site PM.",
            "success", entry["project_id"], entry_id, entry["sheet_type"]
        )
        # Notify PMAG
        pmags = await pool.fetch("SELECT user_id, email, name FROM users WHERE role = 'PMAG'")
        for pmag in pmags:
            await create_notification(
                pool, pmag["user_id"], 
                "PM-Approved DPR", 
                f"{sheet_label} for {proj_name} ({date_label}) approved by PM. Pending your review.",
                "info", entry["project_id"], entry_id, entry["sheet_type"]
            )
            
        # EMAIL NOTIFICATION
        try:
            from app.services.email_service import send_dpr_status_email
            # Fetch supervisor info and project name
            sup = await pool.fetchrow("SELECT name, email FROM users WHERE user_id = $1", entry["supervisor_id"])
            proj = await pool.fetchval('SELECT "Name" FROM p6_projects WHERE "ObjectId" = $1', entry["project_id"])
            if sup and sup["email"]:
                await send_dpr_status_email(
                    sup["email"], sup["name"], entry["sheet_type"], "Approved by PM", 
                    proj or "Project", entry["entry_date"].isoformat(), None
                )
        except Exception as ee:
            logger.error(f"Email notification failed: {ee}")
            
        # Notify Super Admin
        try:
            from app.config import settings
            if settings.SUPER_ADMIN_EMAIL:
                from app.services.email_service import send_dpr_status_email
                proj = await pool.fetchval('SELECT "Name" FROM p6_projects WHERE "ObjectId" = $1', entry["project_id"])
                await send_dpr_status_email(
                    settings.SUPER_ADMIN_EMAIL, "Super Admin", entry["sheet_type"], "Approved by PM",
                    proj or "Project", entry["entry_date"].isoformat(), f"Reviewer: {current_user['name']}"
                )
        except Exception as ee:
            logger.error(f"Super Admin email notification failed: {ee}")
    except Exception as e:
        logger.error(f"Failed to send PM approval notification: {e}")

    return {"message": "Entry approved successfully", "entry": dict(row)}


@router.put("/pm/update")
async def update_entry_by_pm(
    body: dict[str, Any],
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(get_current_user),
):
    user_role = current_user.get("role", "").lower()
    if user_role not in ("site pm", "super admin", "pmag"):
        raise HTTPException(403, detail={"message": "Only Site PM can update entries"})

    entry_id = body.get("entryId")
    data = body.get("data")

    check = await pool.fetchrow(
        "SELECT * FROM dpr_supervisor_entries WHERE id = $1 AND status IN ('submitted_to_pm', 'rejected_by_pm')",
        entry_id,
    )
    if not check:
        raise HTTPException(404, detail={"message": "Entry not found or cannot be edited"})

    row = await pool.fetchrow(
        "UPDATE dpr_supervisor_entries SET data_json = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *",
        json.dumps(data), entry_id,
    )
    await cache.flush_all()
    return {"message": "Entry updated successfully", "entry": dict(row)}


@router.put("/pmag/update")
async def update_entry_by_pmag(
    body: dict[str, Any],
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(get_current_user),
):
    user_role = current_user.get("role", "").lower()
    if user_role not in ("site pm", "super admin", "pmag"):
        raise HTTPException(403, detail={"message": "Only Admins/PMAG can update entries"})

    entry_id = body.get("entryId")
    data = body.get("data")

    # PMAG/Admin can update even approved/final entries for correction
    check = await pool.fetchrow(
        "SELECT * FROM dpr_supervisor_entries WHERE id = $1",
        entry_id,
    )
    if not check:
        raise HTTPException(404, detail={"message": "Entry not found"})

    row = await pool.fetchrow(
        "UPDATE dpr_supervisor_entries SET data_json = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *",
        json.dumps(data), entry_id,
    )
    
    # Save snapshot for PMAG edit
    await _save_snapshot(
        pool, entry_id, "pmag_edit", data,
        check["status"], check["status"], current_user["userId"], "Corrected by PMAG"
    )
    
    await cache.flush_all()
    return {"message": "Entry updated successfully by PMAG", "entry": dict(row)}


@router.post("/pm/reject")
async def reject_entry_by_pm(
    body: dict[str, Any],
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(get_current_user),
):
    user_role = current_user.get("role", "").lower()
    if user_role not in ("site pm", "super admin", "pmag"):
        raise HTTPException(403, detail={"message": "Only PM can reject entries"})

    entry_id = body.get("entryId")
    rejection_reason = body.get("rejectionReason")

    # Check for cell rejection comments
    try:
        comments_count = await pool.fetchval(
            "SELECT COUNT(*) FROM cell_comments WHERE sheet_id = $1 AND comment_type = 'REJECTION' AND is_deleted = FALSE",
            entry_id,
        )
        if comments_count == 0:
            raise HTTPException(400, detail={"message": "Please add rejection comments on specific cells before rejecting the sheet", "requiresComments": True})
    except Exception:
        pass

    row = await pool.fetchrow("""
        UPDATE dpr_supervisor_entries SET status = 'rejected_by_pm', rejection_reason = $2,
        pm_reviewed_at = CURRENT_TIMESTAMP, pm_reviewed_by = $3, updated_at = CURRENT_TIMESTAMP
        WHERE id = $1 AND status = 'submitted_to_pm' RETURNING *
    """, entry_id, rejection_reason, current_user["userId"])

    if not row:
        raise HTTPException(404, detail={"message": "Entry not found or invalid status"})

    # Save snapshot
    await _save_snapshot(
        pool, entry_id, "rejected_by_pm", row["data_json"],
        "submitted_to_pm", "rejected_by_pm", current_user["userId"], rejection_reason
    )

    await cache.flush_all()
    entry = dict(row)
    await create_system_log(
        "SHEET_REJECTED", current_user["userId"],
        f"Entry: {entry_id}, Project: {entry['project_id']}, Type: {entry['sheet_type']}",
        f"Entry {entry_id} ({entry['sheet_type']}) rejected by PM. Reason: {rejection_reason or 'No reason'}",
    )

    # Notify Supervisor
    proj_name = await _get_project_name(pool, entry["project_id"])
    sheet_label = _format_sheet_type(entry['sheet_type'])
    date_label = _format_date(entry['entry_date'])
    await create_notification(
        pool, entry["supervisor_id"], 
        "DPR Rejected by PM", 
        f"Your {sheet_label} for {proj_name} ({date_label}) was rejected. Reason: {rejection_reason or 'No reason provided'}",
        "error", entry["project_id"], entry_id, entry["sheet_type"]
    )
    
    # EMAIL NOTIFICATION
    try:
        from app.services.email_service import send_dpr_status_email
        sup = await pool.fetchrow("SELECT name, email FROM users WHERE user_id = $1", entry["supervisor_id"])
        proj = await pool.fetchval('SELECT "Name" FROM p6_projects WHERE "ObjectId" = $1', entry["project_id"])
        if sup and sup["email"]:
            await send_dpr_status_email(
                sup["email"], sup["name"], entry["sheet_type"], "Rejected by PM", 
                proj or "Project", entry["entry_date"].isoformat(), rejection_reason
            )
    except Exception as ee:
        logger.error(f"Email notification failed: {ee}")
        
    # Notify Super Admin
    try:
        from app.config import settings
        if settings.SUPER_ADMIN_EMAIL:
            from app.services.email_service import send_dpr_status_email
            proj = await pool.fetchval('SELECT "Name" FROM p6_projects WHERE "ObjectId" = $1', entry["project_id"])
            await send_dpr_status_email(
                settings.SUPER_ADMIN_EMAIL, "Super Admin", entry["sheet_type"], "Rejected by PM",
                proj or "Project", entry["entry_date"].isoformat(), f"Reason: {rejection_reason}"
            )
    except Exception as ee:
        logger.error(f"Super Admin email notification failed: {ee}")
    except Exception as e:
        logger.error(f"Failed to send rejection notification: {e}")

    return {"message": "Entry rejected and sent back to Supervisor", "entry": entry}


@router.get("/entry/{entry_id}")
async def get_entry_by_id(
    entry_id: int,
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(get_current_user),
):
    row = await pool.fetchrow("""
        SELECT dse.*, u.name as supervisor_name
        FROM dpr_supervisor_entries dse JOIN users u ON dse.supervisor_id = u.user_id
        WHERE dse.id = $1
    """, entry_id)

    if not row:
        raise HTTPException(404, detail={"message": "Entry not found"})

    if current_user["role"] == "supervisor" and row["supervisor_id"] != current_user["userId"]:
        raise HTTPException(403, detail={"message": "Access denied"})

    return dict(row)


@router.get("/pmag/entries")
async def get_entries_for_pmag_review(
    projectId: Optional[str] = None,
    limit: int = 100,
    offset: int = 0,
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(get_current_user),
):
    if current_user["role"] != "PMAG":
        raise HTTPException(403, detail={"message": "Access denied"})

    cache_key = f"pmag_entries_{current_user['role']}_{projectId or 'all'}_{limit}_{offset}"
    cached = await cache.get(cache_key)
    if cached:
        return cached

    valid_pid = projectId and str(projectId) not in ("null", "undefined", "")
    project_object_id = None
    if valid_pid:
        project_object_id = await resolve_project_id(projectId, pool)

    if project_object_id:
        rows = await pool.fetch("""
            SELECT dse.*, u.name as supervisor_name, u.email as supervisor_email
            FROM dpr_supervisor_entries dse JOIN users u ON dse.supervisor_id = u.user_id
            WHERE dse.project_id = $1 AND dse.status IN ('approved_by_pm', 'final_approved')
              AND dse.pushed_at IS NULL
            ORDER BY dse.updated_at DESC
            LIMIT $2 OFFSET $3
        """, project_object_id, limit, offset)
    else:
        rows = await pool.fetch("""
            SELECT dse.*, u.name as supervisor_name, u.email as supervisor_email
            FROM dpr_supervisor_entries dse JOIN users u ON dse.supervisor_id = u.user_id
            WHERE dse.status IN ('approved_by_pm', 'final_approved')
              AND dse.pushed_at IS NULL
            ORDER BY dse.updated_at DESC
            LIMIT $1 OFFSET $2
        """, limit, offset)

    result = [dict(r) for r in rows]
    await cache.set(cache_key, result, 120)
    return result


@router.get("/pmag-history")
async def get_entries_history_for_pmag(
    projectId: Optional[str] = None,
    days: Optional[int] = None,
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(get_current_user),
):
    if current_user["role"] != "PMAG":
        raise HTTPException(403, detail={"message": "Access denied"})

    params = []
    conditions = ["dse.status IN ('approved_by_pm', 'final_approved')"]
    idx = 1

    if projectId:
        project_object_id = await resolve_project_id(projectId, pool)
        conditions.append(f"dse.project_id = ${idx}")
        params.append(project_object_id)
        idx += 1
    if days:
        conditions.append(f"dse.updated_at >= NOW() - INTERVAL '{int(days)} days'")

    where = " AND ".join(conditions)
    rows = await pool.fetch(f"""
        SELECT dse.*, u.name as supervisor_name, u.email as supervisor_email
        FROM dpr_supervisor_entries dse JOIN users u ON dse.supervisor_id = u.user_id
        WHERE {where} ORDER BY dse.updated_at DESC
    """, *params)

    return [dict(r) for r in rows]


@router.get("/pmag-archived")
async def get_archived_entries_for_pmag(
    projectId: Optional[str] = None,
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(get_current_user),
):
    if current_user["role"] != "PMAG":
        raise HTTPException(403, detail={"message": "Access denied"})

    if projectId:
        project_object_id = await resolve_project_id(projectId, pool)
        rows = await pool.fetch("""
            SELECT dse.*, u.name as supervisor_name, u.email as supervisor_email
            FROM dpr_supervisor_entries dse JOIN users u ON dse.supervisor_id = u.user_id
            WHERE dse.project_id = $1 AND dse.status = 'final_approved'
              AND dse.updated_at < CURRENT_TIMESTAMP - INTERVAL '2 days'
            ORDER BY dse.updated_at DESC
        """, project_object_id)
    else:
        rows = await pool.fetch("""
            SELECT dse.*, u.name as supervisor_name, u.email as supervisor_email
            FROM dpr_supervisor_entries dse JOIN users u ON dse.supervisor_id = u.user_id
            WHERE dse.status = 'final_approved' AND dse.updated_at < CURRENT_TIMESTAMP - INTERVAL '2 days'
            ORDER BY dse.updated_at DESC
        """)

    return [dict(r) for r in rows]


@router.post("/pmag/approve")
async def approve_entry_by_pmag(
    body: dict[str, Any],
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(get_current_user),
):
    if current_user["role"] != "PMAG":
        raise HTTPException(403, detail={"message": "Only PMAG can approve entries"})

    entry_id = body.get("entryId")
    row = await pool.fetchrow("""
        UPDATE dpr_supervisor_entries SET status = 'final_approved', pm_reviewed_at = CURRENT_TIMESTAMP,
        pm_reviewed_by = $2, updated_at = CURRENT_TIMESTAMP
        WHERE id = $1 AND status = 'approved_by_pm' RETURNING *
    """, entry_id, current_user["userId"])

    if not row:
        raise HTTPException(404, detail={"message": "Entry not found or invalid status"})
        
    # Save snapshot
    await _save_snapshot(
        pool, entry_id, "final_approved", row["data_json"],
        "approved_by_pm", "final_approved", current_user["userId"]
    )
    
    await cache.flush_all()
    # Notify Supervisor and PM(s)
    try:
        entry = dict(row)
        proj_name = await _get_project_name(pool, entry["project_id"])
        sheet_label = _format_sheet_type(entry['sheet_type'])
        date_label = _format_date(entry['entry_date'])
        # Notify Supervisor
        await create_notification(
            pool, entry["supervisor_id"], 
            "DPR Final Approved", 
            f"Your {sheet_label} for {proj_name} ({date_label}) has received final approval from PMAG.",
            "success", entry["project_id"], entry_id, entry["sheet_type"]
        )
        # Notify Site PM(s)
        pms = await pool.fetch("SELECT user_id, name, email FROM users WHERE role = 'Site PM'")
        for pm in pms:
            await create_notification(
                pool, pm["user_id"], 
                "DPR Final Approved", 
                f"{sheet_label} for {proj_name} ({date_label}) has been given final approval by PMAG.",
                "success", entry["project_id"], entry_id, entry["sheet_type"]
            )
            
        # EMAIL NOTIFICATION
        try:
            from app.services.email_service import send_dpr_status_email
            sup = await pool.fetchrow("SELECT name, email FROM users WHERE user_id = $1", entry["supervisor_id"])
            proj = await pool.fetchval('SELECT "Name" FROM p6_projects WHERE "ObjectId" = $1', entry["project_id"])
            if sup and sup["email"]:
                await send_dpr_status_email(
                    sup["email"], sup["name"], entry["sheet_type"], "Final Approved", 
                    proj or "Project", entry["entry_date"].isoformat(), None
                )
            for pm in pms:
                if pm["email"]:
                    await send_dpr_status_email(
                        pm["email"], pm["name"], entry["sheet_type"], "Final Approved (by PMAG)", 
                        proj or "Project", entry["entry_date"].isoformat(), None
                    )
        except Exception as ee:
            logger.error(f"Email notification failed: {ee}")
            
        # Notify Super Admin
        try:
            from app.config import settings
            if settings.SUPER_ADMIN_EMAIL:
                from app.services.email_service import send_dpr_status_email
                proj = await pool.fetchval('SELECT "Name" FROM p6_projects WHERE "ObjectId" = $1', entry["project_id"])
                await send_dpr_status_email(
                    settings.SUPER_ADMIN_EMAIL, "Super Admin", entry["sheet_type"], "Final Approved by PMAG",
                    proj or "Project", entry["entry_date"].isoformat(), f"Reviewer: {current_user['name']}"
                )
        except Exception as ee:
            logger.error(f"Super Admin email notification failed: {ee}")
    except Exception as e:
        logger.error(f"Failed to send PMAG approval notification: {e}")

    return {"message": "Entry approved by PMAG successfully", "entry": dict(row)}


@router.post("/pmag-push-to-p6")
async def push_to_p6(
    body: dict[str, Any],
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(get_current_user),
):
    user_role = current_user.get("role", "").lower()
    if user_role not in ("pmag", "super admin", "supervisor", "site pm"):
        raise HTTPException(403, detail={"message": "You are not authorized to push to P6"})

    entry_id = body.get("entryId")
    dry_run = body.get("dryRun", False)

    # Verify entry exists and has correct status
    entry = await pool.fetchrow("""
        SELECT id, status, sheet_type FROM dpr_supervisor_entries WHERE id = $1
    """, entry_id)

    if not entry:
        raise HTTPException(404, detail={"message": "Entry not found"})

    if entry["status"] not in ("approved_by_pm", "final_approved"):
        raise HTTPException(400, detail={"message": f"Entry status '{entry['status']}' is not eligible for P6 push. Must be 'approved_by_pm' or 'final_approved'."})

    # Check if sheet type supports P6 push
    supported_sheets = ["dp_vendor_idt", "dp_vendor_block", "manpower_details", "dp_qty", "dp_block", "wind_progress", "pss_progress"]
    if entry["sheet_type"] not in supported_sheets:
        raise HTTPException(400, detail={"message": f"Sheet type '{entry['sheet_type']}' does not support pushing to P6. Supported: {', '.join(supported_sheets)}"})

    try:
        from app.services.p6_push_service import push_approved_entry_to_p6
        result = await push_approved_entry_to_p6(pool, entry_id, current_user["userId"], dry_run=dry_run)
    except Exception as e:
        logger.error(f"P6 Push Error Traceback: {e}", exc_info=True)
        raise HTTPException(500, detail={"message": f"P6 push failed due to internal error: {str(e)}"})

    # Update entry status if push was successful and not dry run
    if result["success"] and not dry_run:
        row = await pool.fetchrow("""
            UPDATE dpr_supervisor_entries
            SET status = 'final_approved', pushed_at = CURRENT_TIMESTAMP,
                pushed_by = $2, updated_at = CURRENT_TIMESTAMP
            WHERE id = $1 RETURNING *
        """, entry_id, current_user["userId"])
        
        if row:
            # Save snapshot
            await _save_snapshot(
                pool, entry_id, "pushed_to_p6", row["data_json"],
                entry["status"], "final_approved", current_user["userId"], "Pushed to P6"
            )
            
        await cache.flush_all()

    return {
        "message": "P6 push completed" if result["success"] else "P6 push completed with errors",
        "result": result
    }


@router.post("/pmag-reject")
async def reject_entry_by_pmag(
    body: dict[str, Any],
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(get_current_user),
):
    user_role = current_user.get("role", "").lower()
    if user_role not in ("site pm", "pmag", "super admin"):
        raise HTTPException(403, detail={"message": "Only PM or Admins can reject entries"})

    entry_id = body.get("entryId")
    rejection_reason = body.get("rejectionReason")

    row = await pool.fetchrow("""
        UPDATE dpr_supervisor_entries SET status = 'submitted_to_pm', rejection_reason = $2,
        updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND status = 'approved_by_pm' RETURNING *
    """, entry_id, rejection_reason)

    if not row:
        raise HTTPException(404, detail={"message": "Entry not found or invalid status"})

    # Save snapshot
    await _save_snapshot(
        pool, entry_id, "rejected_by_pmag", row["data_json"],
        "approved_by_pm", "submitted_to_pm", current_user["userId"], rejection_reason
    )

    await cache.flush_all()
    return {"message": "Entry rejected and sent back to PM", "entry": dict(row)}


@router.get("/entry/{entry_id}/snapshots")
async def get_entry_snapshots(
    entry_id: int,
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(get_current_user),
):
    """Get the version history of a specific DPR entry."""
    # First verify access
    entry = await pool.fetchrow("SELECT supervisor_id, project_id FROM dpr_supervisor_entries WHERE id = $1", entry_id)
    if not entry:
        raise HTTPException(404, detail={"message": "Entry not found"})
        
    if current_user["role"] == "supervisor" and entry["supervisor_id"] != current_user["userId"]:
        raise HTTPException(403, detail={"message": "Access denied"})

    rows = await pool.fetch("""
        SELECT s.id, s.version, s.action, s.status_before, s.status_after, 
               s.remarks, s.created_at, u.name as performed_by_name
        FROM dpr_entry_snapshots s
        LEFT JOIN users u ON s.performed_by = u.user_id
        WHERE s.entry_id = $1
        ORDER BY s.version DESC
    """, entry_id)

    return [dict(r) for r in rows]


@router.get("/entry/{entry_id}/snapshot/{version}")
async def get_entry_snapshot_data(
    entry_id: int,
    version: int,
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(get_current_user),
):
    """Get the full data_json for a specific version of a DPR entry."""
    entry = await pool.fetchrow("SELECT supervisor_id FROM dpr_supervisor_entries WHERE id = $1", entry_id)
    if not entry:
        raise HTTPException(404, detail={"message": "Entry not found"})
        
    if current_user["role"] == "supervisor" and entry["supervisor_id"] != current_user["userId"]:
        raise HTTPException(403, detail={"message": "Access denied"})

    row = await pool.fetchrow("""
        SELECT data_json FROM dpr_entry_snapshots
        WHERE entry_id = $1 AND version = $2
    """, entry_id, version)

    if not row:
        raise HTTPException(404, detail={"message": f"Version {version} not found for entry {entry_id}"})

    return {"data": row["data_json"]}
