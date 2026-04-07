# app/services/p6_push_service.py
"""
Oracle P6 Push Service.
Pushes approved DPR values back to P6 via REST API.

Sheets supported:
  - dp_vendor_idt   → MT (Material) resource assignments
  - dp_vendor_block → MT (Material) resource assignments
  - manpower_details → MP (Manpower) resource assignments
"""

import logging
import json
from typing import Any, Optional
from datetime import datetime, date as dt_date

def parse_date(date_val: Any) -> Optional[dt_date]:
    """Helper to parse various date formats into a date object."""
    if not date_val:
        return None
    if isinstance(date_val, dt_date):
        return date_val
    if isinstance(date_val, (datetime, dt_date)):
        return date_val if isinstance(date_val, dt_date) else date_val.date()
    
    date_str = str(date_val).strip()
    if not date_str or date_str.lower() in ("null", "none", ""):
        return None

    # P6 often returns dates in YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS
    # Frontend may send DD-Mon-YY or DD-Mon-YYYY
    formats = [
        "%Y-%m-%d",
        "%d-%b-%y",      # 01-Mar-26
        "%d-%b-%Y",      # 01-Mar-2026
        "%Y-%m-%dT%H:%M:%S",
        "%Y-%m-%dT%H:%M:%S.%fZ",
    ]
    
    for fmt in formats:
        try:
            return datetime.strptime(date_str, fmt).date()
        except (ValueError, TypeError):
            continue
            
    # Try fromisoformat as last resort
    try:
        return datetime.fromisoformat(date_str.replace("Z", "+00:00")).date()
    except Exception:
        return None

from app.services.p6_token_service import get_valid_p6_token, get_http_client
from app.config import settings

logger = logging.getLogger("adani-flow.p6_push")

BASE_URL = "https://sin1.p6.oraclecloud.com/adani/p6ws/restapi"

# Map sheet type → resource filter
SHEET_RESOURCE_MAP = {
    "dp_vendor_idt": {"type": "MT", "filter": "Material"},
    "dp_vendor_block": {"type": "MT", "filter": "Material"},
    "dp_qty": {"type": "MT", "filter": "Material"},
    "dp_block": {"type": "MT", "filter": "Material"},
    "manpower_details": {"type": "MP", "filter": "MP"},
    "testing_commissioning": {"type": "MT", "filter": "Material"},
}


async def _get_resource_assignments_for_activity(pool, activity_object_id: int, project_id: int, sheet_type: str):
    """
    Get the P6 resource assignment ObjectIds for an activity,
    filtered by resource type (MT or MP) based on sheet type.
    """
    resource_config = SHEET_RESOURCE_MAP.get(sheet_type)
    if not resource_config:
        return []

    if resource_config["type"] == "MT":
        rows = await pool.fetch("""
            SELECT object_id, resource_id, resource_name, resource_type,
                   planned_units, actual_units, remaining_units
            FROM solar_resource_assignments
            WHERE activity_object_id = $1
              AND project_object_id = $2
              AND (UPPER(resource_id) LIKE CONCAT('%%', 'MT', '%%') OR resource_type = 'Material')
              AND UPPER(resource_id) NOT LIKE CONCAT('%%', 'NL', '%%')
        """, activity_object_id, project_id)
    else:  # MP
        rows = await pool.fetch("""
            SELECT object_id, resource_id, resource_name, resource_type,
                   planned_units, actual_units, remaining_units
            FROM solar_resource_assignments
            WHERE activity_object_id = $1
              AND project_object_id = $2
              AND UPPER(resource_id) LIKE CONCAT('%%', 'MP', '%%')
              AND UPPER(resource_id) NOT LIKE CONCAT('%%', 'NL', '%%')
        """, activity_object_id, project_id)

    return [dict(r) for r in rows]


async def _get_activity_object_id(pool, activity_id: str, project_object_id: int) -> Optional[int]:
    """Resolve activity_id string to object_id."""
    row = await pool.fetchrow(
        "SELECT object_id FROM solar_activities WHERE activity_id = $1 AND project_object_id = $2",
        activity_id, project_object_id
    )
    return int(row["object_id"]) if row else None


async def _push_resource_assignment_to_p6(
    client, headers: dict, ra_object_id: int,
    actual_units: float, remaining_units: float
) -> dict:
    """
    PUT /resourceAssignment to update ActualUnits and RemainingUnits.
    Returns { success, error, response_code }.
    """
    payload = [{
        "ObjectId": ra_object_id,
        "ActualUnits": actual_units,
        "RemainingUnits": remaining_units,
    }]

    try:
        r = await client.put(
            f"{BASE_URL}/resourceAssignment",
            json=payload,
            headers=headers
        )
        if r.status_code in (200, 204):
            logger.info(f"  ✓ RA {ra_object_id}: ActualUnits={actual_units}, RemainingUnits={remaining_units}")
            return {"success": True, "status_code": r.status_code}
        else:
            error_text = r.text[:500]
            logger.error(f"  ✗ RA {ra_object_id}: HTTP {r.status_code} - {error_text}")
            return {"success": False, "status_code": r.status_code, "error": error_text}
    except Exception as e:
        logger.error(f"  ✗ RA {ra_object_id}: Exception - {e}")
        return {"success": False, "status_code": 0, "error": str(e)}


async def _push_activity_to_p6(
    client, headers: dict, activity_object_id: int,
    percent_complete: Optional[float] = None,
    actual_start: Optional[str] = None,
    actual_finish: Optional[str] = None,
) -> dict:
    """
    PUT /activity to update PercentComplete and dates.
    Returns { success, error, response_code }.
    """
    payload = [{"ObjectId": activity_object_id}]

    if percent_complete is not None:
        # P6 expects PercentComplete as decimal (0.0 to 1.0)
        payload[0]["PercentComplete"] = percent_complete / 100.0

    if actual_start:
        p_start = parse_date(actual_start)
        if p_start:
            payload[0]["ActualStartDate"] = f"{p_start.isoformat()}T00:00:00"
            
    if actual_finish:
        p_finish = parse_date(actual_finish)
        if p_finish:
            payload[0]["ActualFinishDate"] = f"{p_finish.isoformat()}T23:59:59"

    try:
        r = await client.put(
            f"{BASE_URL}/activity",
            json=payload,
            headers=headers
        )
        if r.status_code in (200, 204):
            logger.info(f"  ✓ Activity {activity_object_id}: updated")
            return {"success": True, "status_code": r.status_code}
        else:
            error_text = r.text[:500]
            logger.error(f"  ✗ Activity {activity_object_id}: HTTP {r.status_code} - {error_text}")
            return {"success": False, "status_code": r.status_code, "error": error_text}
    except Exception as e:
        logger.error(f"  ✗ Activity {activity_object_id}: Exception - {e}")
        return {"success": False, "status_code": 0, "error": str(e)}


async def _log_push_audit(
    pool, entry_id: int, activity_object_id: int, ra_object_id: Optional[int],
    field_name: str, old_value: str, new_value: str,
    push_status: str, error_message: Optional[str], pushed_by: int
):
    """Log a push attempt to the audit table."""
    try:
        await pool.execute("""
            INSERT INTO push_audit (
                entry_id, activity_object_id, ra_object_id,
                field_name, old_value, new_value,
                push_status, error_message, pushed_by
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        """, entry_id, activity_object_id, ra_object_id,
            field_name, str(old_value), str(new_value),
            push_status, error_message, pushed_by)
    except Exception as e:
        logger.error(f"Failed to log push audit: {e}")


def _extract_rows_from_entry(data_json: dict, sheet_type: str) -> list:
    """Extract pushable rows from the DPR entry data_json."""
    if isinstance(data_json, str):
        data_json = json.loads(data_json)

    rows = data_json.get("rows", [])
    # Filter out category heading rows (they have isCategoryHeading=True)
    return [r for r in rows if not r.get("isCategoryHeading")]


def _parse_today_value(val) -> Optional[float]:
    """Parse a today value string to float, or None if empty/blank."""
    if val is None or str(val).strip() == "":
        return None
    try:
        return float(str(val).replace(",", ""))
    except (ValueError, TypeError):
        return None


def _parse_actual_value(val) -> float:
    """Parse an actual/cumulative value string to float."""
    if val is None or val == "":
        return 0.0
    try:
        return float(str(val).replace(",", "").replace("%", ""))
    except (ValueError, TypeError):
        return 0.0


async def push_approved_entry_to_p6(
    pool, entry_id: int, pushed_by: int, dry_run: bool = False
) -> dict:
    """
    Main orchestrator: Push an approved DPR entry to P6.

    1. Read the entry from DB
    2. Parse rows from data_json
    3. For each row with a todayValue:
       a. Look up the activity_object_id
       b. Find the correct resource assignments (MT or MP)
       c. Calculate new ActualUnits = old ActualUnits + todayValue
       d. Calculate new RemainingUnits = PlannedUnits - new ActualUnits
       e. Push to P6 via PUT /resourceAssignment
       f. Push PercentComplete to P6 via PUT /activity
    4. Log everything to push_audit

    Returns summary with counts.
    """
    # 1. Read entry
    entry = await pool.fetchrow("""
        SELECT id, project_id, sheet_type, data_json, entry_date, status
        FROM dpr_supervisor_entries WHERE id = $1
    """, entry_id)

    if not entry:
        return {"success": False, "error": "Entry not found", "pushed": 0, "failed": 0}

    sheet_type = entry["sheet_type"]
    project_id = entry["project_id"]

    if sheet_type not in SHEET_RESOURCE_MAP:
        return {"success": False, "error": f"Sheet type '{sheet_type}' does not support P6 push", "pushed": 0, "failed": 0}

    # 2. Parse data
    data_json = entry["data_json"]
    if isinstance(data_json, str):
        data_json = json.loads(data_json)

    rows = _extract_rows_from_entry(data_json, sheet_type)
    logger.info(f"Push entry {entry_id}: sheet={sheet_type}, project={project_id}, rows={len(rows)}")

    # 3. Get P6 token and client
    token = await get_valid_p6_token()
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
        "Accept": "application/json",
    }

    pushed = 0
    failed = 0
    skipped = 0
    details = []

    async with get_http_client(timeout=30.0) as client:
        for row in rows:
            # Extract activity ID and today value based on sheet type
            activity_id = row.get("activityId", "")
            today_val = _parse_today_value(row.get("todayValue"))
            
            # Extract additional fields to push
            # Handle both DP Qty (actualStart) and DP Block (actualStartDate) naming conventions
            actual_start = row.get("actualStart") or row.get("actualStartDate")
            actual_finish = row.get("actualFinish") or row.get("actualFinishDate")
            uom = row.get("uom")

            if not activity_id or ((today_val is None or today_val == 0) and not actual_start and not actual_finish and not uom):
                skipped += 1
                continue

            # Resolve activity_object_id
            act_obj_id = await _get_activity_object_id(pool, activity_id, project_id)
            if not act_obj_id:
                logger.warning(f"  Skip: Cannot resolve activity_id={activity_id}")
                skipped += 1
                continue

            # Update local DB solar_activities with dates and UOM if provided
            if not dry_run:
                if actual_start or actual_finish or uom:
                    await pool.execute("""
                        UPDATE solar_activities 
                        SET actual_start = COALESCE($1, actual_start),
                            actual_finish = COALESCE($2, actual_finish),
                            uom = COALESCE($3, uom)
                        WHERE object_id = $4
                    """, 
                    parse_date(actual_start) if actual_start else None,
                    parse_date(actual_finish) if actual_finish else None,
                    uom,
                    act_obj_id
                    )

            # Find resource assignments (MT or MP)
            ras = await _get_resource_assignments_for_activity(pool, act_obj_id, project_id, sheet_type)
            
            # Fetch existing activity data from DB to check for delta changes
            act_db_row = await pool.fetchrow("SELECT actual_start, actual_finish, percent_complete FROM solar_activities WHERE object_id = $1", act_obj_id)
            
            db_actual_start = act_db_row["actual_start"] if act_db_row else None
            db_actual_finish = act_db_row["actual_finish"] if act_db_row else None
            
            # Define normalized dates for comparison
            parsed_row_start = parse_date(actual_start) if actual_start else None
            parsed_row_finish = parse_date(actual_finish) if actual_finish else None
            
            # Did the dates actually change compared to what we already know?
            dates_changed = (parsed_row_start != db_actual_start) or (parsed_row_finish != db_actual_finish)

            if not ras:
                # If no RAs, we might still want to push activity dates if they changed explicitly
                if dates_changed and not dry_run:
                    await _push_activity_to_p6(client, headers, act_obj_id, 
                                             actual_start=actual_start, 
                                             actual_finish=actual_finish)
                    pushed += 1
                    details.append({"activityId": activity_id, "status": "success", "note": "Activity dates pushed (no RAs)"})
                else:
                    skipped += 1
                continue

            # Calculate new values and update P6 resource assignments ONLY if there's actual daily progress
            if today_val is not None and today_val != 0:
                total_planned = sum(float(ra.get("planned_units") or 0) for ra in ras)

                for ra in ras:
                    ra_obj_id = int(ra["object_id"])
                    old_actual = float(ra.get("actual_units") or 0)
                    planned = float(ra.get("planned_units") or 0)

                    if len(ras) == 1:
                        ra_today = today_val or 0
                    else:
                        proportion = planned / total_planned if total_planned > 0 else 1.0 / len(ras)
                        ra_today = (today_val or 0) * proportion

                    new_actual = old_actual + ra_today
                    new_remaining = max(0, planned - new_actual)

                    if dry_run:
                        pushed += 1
                        continue

                    # Push to P6
                    result = await _push_resource_assignment_to_p6(
                        client, headers, ra_obj_id, new_actual, new_remaining
                    )

                    if result["success"]:
                        await pool.execute("""
                            UPDATE solar_resource_assignments SET actual_units = $1, remaining_units = $2 WHERE object_id = $3
                        """, new_actual, new_remaining, ra_obj_id)
                        pushed += 1

            # Also update activity PercentComplete and Dates if dates changed or progress was posted
            pct_str = row.get("completionPercentage") or row.get("percentComplete")
            
            # Check if percentage explicitly changed (as an extra safety check)
            db_pct = float(act_db_row["percent_complete"]) if act_db_row and act_db_row["percent_complete"] is not None else -1
            row_pct = _parse_actual_value(pct_str) if pct_str else None
            pct_changed = (row_pct is not None and abs(row_pct - db_pct) > 0.01)

            if (dates_changed or pct_changed or (today_val is not None and today_val != 0)) and not dry_run:
                # If no dates explicitly modified, use None so P6 endpoint doesn't mutate them
                push_start = actual_start if dates_changed and parsed_row_start != db_actual_start else None
                push_finish = actual_finish if dates_changed and parsed_row_finish != db_actual_finish else None
                
                await _push_activity_to_p6(client, headers, act_obj_id, 
                                         percent_complete=row_pct,
                                         actual_start=push_start,
                                         actual_finish=push_finish)
            elif (today_val is None or today_val == 0) and not dates_changed and not pct_changed:
                skipped += 1

    # Update local DB cumulative values on solar_activities too
    if not dry_run and pushed > 0:
        for row in rows:
            activity_id = row.get("activityId", "")
            if not activity_id: continue
            act_obj_id = await _get_activity_object_id(pool, activity_id, project_id)
            if not act_obj_id: continue

            res_config = SHEET_RESOURCE_MAP.get(sheet_type, {})
            if res_config.get("type") == "MT":
                new_totals = await pool.fetchrow("""
                    SELECT SUM(actual_units) as total_actual, SUM(remaining_units) as total_remaining
                    FROM solar_resource_assignments WHERE activity_object_id = $1 AND project_object_id = $2
                    AND (UPPER(resource_id) LIKE CONCAT('%%', 'MT', '%%') OR resource_type = 'Material') AND UPPER(resource_id) NOT LIKE CONCAT('%%', 'NL', '%%')
                """, act_obj_id, project_id)
            else:
                new_totals = await pool.fetchrow("""
                    SELECT SUM(actual_units) as total_actual, SUM(remaining_units) as total_remaining
                    FROM solar_resource_assignments WHERE activity_object_id = $1 AND project_object_id = $2
                    AND UPPER(resource_id) LIKE CONCAT('%%', 'MP', '%%') AND UPPER(resource_id) NOT LIKE CONCAT('%%', 'NL', '%%')
                """, act_obj_id, project_id)

            if new_totals:
                await pool.execute("UPDATE solar_activities SET cumulative = $1, balance = $2 WHERE object_id = $3", 
                                 float(new_totals["total_actual"] or 0), float(new_totals["total_remaining"] or 0), act_obj_id)

                # Also record the day's progress to `dpr_daily_progress` 
                # so the frontend "yesterday values" query picks it up correctly tomorrow.
                today_val = _parse_today_value(row.get("todayValue"))
                if today_val is not None:
                    # Use ON CONFLICT (UPSERT) to avoid unique constraint violations
                    # This respects the DB constraint: (activity_object_id, progress_date)
                    # It also allows for updates if multiple sheets touch the same activity
                    await pool.execute("""
                        INSERT INTO dpr_daily_progress 
                        (progress_date, activity_object_id, today_value, cumulative_value, sheet_type)
                        VALUES ($1, $2, $3, $4, $5)
                        ON CONFLICT (activity_object_id, progress_date) 
                        DO UPDATE SET 
                            today_value = EXCLUDED.today_value,
                            cumulative_value = EXCLUDED.cumulative_value,
                            sheet_type = EXCLUDED.sheet_type
                    """, entry["entry_date"], act_obj_id, float(today_val), float(new_totals["total_actual"] or 0), sheet_type)

    # FINAL STEP: Update the entry status and track pushed_by
    if not dry_run and pushed > 0:
        await pool.execute("""
            UPDATE dpr_supervisor_entries 
            SET status = 'final_approved', pushed_at = CURRENT_TIMESTAMP, pushed_by = $1
            WHERE id = $2
        """, pushed_by, entry_id)

    summary = {
        "success": failed == 0,
        "entry_id": entry_id,
        "sheet_type": sheet_type,
        "project_id": project_id,
        "dry_run": dry_run,
        "total_rows": len(rows),
        "pushed": pushed,
        "failed": failed,
        "skipped": skipped,
        "details": details,
    }

    logger.info(f"Push complete: pushed={pushed}, failed={failed}, skipped={skipped}")
    return summary
