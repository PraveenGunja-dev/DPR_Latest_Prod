# app/routers/dpr_supervisor.py
"""
DPR Supervisor router – complete DPR workflow.
Direct port of Express routes/dprSupervisor.js + controllers/dprSupervisorController.js
"""

import json
import logging
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks

from app.auth.dependencies import get_current_user
from app.database import get_db, PoolWrapper
from app.services.cache_service import cache
from app.utils.system_logger import create_system_log
from app.routers.project_utils import resolve_project_id

from typing import Optional, Any, List
from app.routers.notifications import create_notification
from app.models.dpr import DPREntryCreate
from app.utils.history_migration import extract_to_history_array, flatten_history_array

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
            
            # Parse cumulative (actual) for today
            cum_str = str(row.get("cumulative", row.get("actual", "")) or "").strip()
            try:
                cumulative_val = float(cum_str.replace(",", "")) if cum_str else 0.0
            except (ValueError, TypeError):
                cumulative_val = 0.0

            # Collect dates and values
            updates_to_write = {}
            
            if "todayValue" in row:
                today_val_str = str(row.get("todayValue") or "").strip()
                try:
                    updates_to_write[str(entry_date)] = float(today_val_str.replace(",", "")) if today_val_str else 0.0
                except (ValueError, TypeError):
                    pass
                    
            if "yesterdayValue" in row:
                yesterday_val_str = str(row.get("yesterdayValue") or "").strip()
                try:
                    updates_to_write[str(entry_date - timedelta(days=1))] = float(yesterday_val_str.replace(",", "")) if yesterday_val_str else 0.0
                except (ValueError, TypeError):
                    pass
                    
            history_values = row.get("historyValues")
            if isinstance(history_values, dict):
                for d_str, v_str in history_values.items():
                    v_str = str(v_str or "").strip()
                    try:
                        updates_to_write[d_str] = float(v_str.replace(",", "")) if v_str else 0.0
                    except (ValueError, TypeError):
                        pass
                        
            history = row.get("history")
            if isinstance(history, list):
                for entry in history:
                    d_str = entry.get("date")
                    if not d_str: continue
                    v_str = str(entry.get("actual") or "").strip()
                    try:
                        updates_to_write[d_str] = float(v_str.replace(",", "")) if v_str else 0.0
                    except (ValueError, TypeError):
                        pass

            if not updates_to_write:
                continue
            
            # Resolve activityId string -> activity_object_id (numeric)
            # Try solar_activities first
            act_row = await pool.fetchrow(
                "SELECT object_id FROM solar_activities WHERE TRIM(activity_id) ILIKE TRIM($1)",
                activity_id_str
            )
            
            if not act_row:
                try:
                    obj_id_int = int(activity_id_str)
                    act_row = await pool.fetchrow(
                        "SELECT object_id FROM solar_activities WHERE object_id = $1",
                        obj_id_int
                    )
                except ValueError:
                    pass
            
            is_custom_activity = False
            if not act_row:
                # Try by name match as fallback in solar_activities
                desc = row.get("description") or row.get("activities") or ""
                if desc:
                    act_row = await pool.fetchrow(
                        "SELECT object_id FROM solar_activities WHERE TRIM(name) ILIKE TRIM($1)",
                        desc
                    )
            
            if not act_row:
                # Try custom activities
                act_row = await pool.fetchrow(
                    "SELECT id as object_id FROM dpr_custom_activities WHERE TRIM(activity_id) ILIKE TRIM($1) AND project_id = $2",
                    activity_id_str, project_id
                )
                if act_row:
                    is_custom_activity = True

            if not act_row:
                # Last resort: try by id if it matches DPR-{project}-{id}
                if activity_id_str.startswith(f"DPR-{project_id}-"):
                    try:
                        custom_id = int(activity_id_str.split("-")[-1])
                        act_row = await pool.fetchrow(
                            "SELECT id as object_id FROM dpr_custom_activities WHERE id = $1 AND project_id = $2",
                            custom_id, project_id
                        )
                        if act_row:
                            is_custom_activity = True
                    except ValueError:
                        pass
                        
            if not act_row:
                continue
            
            act_obj_id = int(act_row["object_id"])
            
            # UPSERT into dpr_daily_progress for all collected dates
            for d_str, d_val in updates_to_write.items():
                try:
                    dt = datetime.strptime(d_str, "%Y-%m-%d").date()
                except ValueError:
                    continue
                    
                # We apply cumulative_val only to today's date for simplicity
                c_val = cumulative_val if dt == entry_date else 0.0
                
                await pool.execute("""
                    INSERT INTO dpr_daily_progress 
                    (progress_date, activity_object_id, today_value, cumulative_value, sheet_type)
                    VALUES ($1, $2, $3, $4, $5)
                    ON CONFLICT (activity_object_id, progress_date, sheet_type) 
                    DO UPDATE SET 
                        today_value = EXCLUDED.today_value,
                        cumulative_value = CASE WHEN EXCLUDED.progress_date = $1 THEN EXCLUDED.cumulative_value ELSE dpr_daily_progress.cumulative_value END
                """, dt, act_obj_id, d_val, c_val, sheet_type)
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
            "rows": [],
        }
    elif sheet_type == "dp_vendor_block":
        return {"rows": []}
    elif sheet_type == "manpower_details":
        return {"totalManpower": 0, "rows": []}
    elif sheet_type == "dp_block":
        return {"rows": []}
    elif sheet_type == "dp_vendor_idt":
        return {"rows": []}
    elif sheet_type == "testing_commissioning":
        return {"rows": []}
    elif sheet_type == "manpower_details_2":
        return {"rows": []}
    elif sheet_type in ("switchyard", "transmission_line", "infra_works", "ac_sheet", "dc_sheet"):
        return {"rows": []}
    return {"rows": []}
async def rebuild_dp_qty_json(pool, entry_row: dict) -> dict:
    project_object_id = entry_row["project_id"]
    target_date = entry_row["entry_date"]
    if isinstance(target_date, str):
        target_date = datetime.strptime(target_date, "%Y-%m-%d").date()
    yesterday_date = target_date - timedelta(days=1)
    
    rows = await pool.fetch("""
        SELECT sa.object_id as activity_object_id, sa.activity_id, sa.name as description,
               sa.planned_start as base_plan_start, sa.planned_finish as base_plan_finish,
               sa.start_date as forecast_start, sa.finish_date as forecast_finish,
               sa.actual_start,
               sa.percent_complete as "PercentComplete", sa.total_quantity, sa.uom,
               sa.block_capacity, sa.spv_no,
               sa.scope, sa.front, sa.hold, sa.priority, sa.plot, sa.new_block_nom,
               sa.wbs_object_id, sa.wbs_name, sa.primary_resource as resource_name,
               sa.uom as ra_uom
        FROM solar_activities sa
        WHERE sa.project_object_id = $1 ORDER BY sa.planned_start
    """, project_object_id)

    # Fetch cummulative progress from DB (strictly before target_date)
    cum_rows = await pool.fetch("""
        SELECT dp.activity_object_id, SUM(dp.today_value) as cumulative_value
        FROM dpr_daily_progress dp
        JOIN solar_activities sa ON sa.object_id = dp.activity_object_id
        WHERE dp.progress_date < $1 AND dp.sheet_type = 'dp_qty' AND sa.project_object_id = $2
        GROUP BY dp.activity_object_id
    """, target_date, project_object_id)
    cum_map = {r["activity_object_id"]: float(r["cumulative_value"] or 0) for r in cum_rows}

    # Fetch yesterday's exact progress
    yest_rows = await pool.fetch("""
        SELECT dp.activity_object_id, dp.today_value
        FROM dpr_daily_progress dp
        JOIN solar_activities sa ON dp.activity_object_id = sa.object_id
        WHERE dp.progress_date = $1 AND dp.sheet_type = 'dp_qty' AND sa.project_object_id = $2
    """, yesterday_date, project_object_id)
    yest_map = {r["activity_object_id"]: float(r["today_value"] or 0) for r in yest_rows}

    # Fetch today's exact progress
    today_rows = await pool.fetch("""
        SELECT dp.activity_object_id, dp.today_value
        FROM dpr_daily_progress dp
        JOIN solar_activities sa ON dp.activity_object_id = sa.object_id
        WHERE dp.progress_date = $1 AND dp.sheet_type = 'dp_qty' AND sa.project_object_id = $2
    """, target_date, project_object_id)
    today_map = {r["activity_object_id"]: float(r["today_value"]) for r in today_rows if r["today_value"] is not None}

    draft_data = entry_row["data_json"]
    if isinstance(draft_data, str):
        draft_data = json.loads(draft_data)
    draft_rows = draft_data.get("rows", [])
    
    draft_map = {}
    for dr in draft_rows:
        act_id = dr.get("activityId")
        if act_id:
            draft_map[str(act_id).upper().strip()] = dr

    final_rows = []
    for i, r in enumerate(rows):
        act_id = str(r["activity_id"]) if r.get("activity_id") else ""
        act_obj_id = r["activity_object_id"]
        
        row_dict = {
            "slNo": str(i + 1),
            "activityId": act_id,
            "description": r["description"] or "",
            "totalQuantity": str(r["total_quantity"]) if r["total_quantity"] else "",
            "uom": str(r.get("uom") or r.get("ra_uom") or "Days"),
            "basePlanStart": r["base_plan_start"].strftime("%Y-%m-%d") if r["base_plan_start"] else "",
            "basePlanFinish": r["base_plan_finish"].strftime("%Y-%m-%d") if r["base_plan_finish"] else "",
            "forecastStart": r["forecast_start"].strftime("%Y-%m-%d") if r["forecast_start"] else "",
            "forecastFinish": r["forecast_finish"].strftime("%Y-%m-%d") if r["forecast_finish"] else "",
            "blockCapacity": str(r.get("block_capacity")) if r.get("block_capacity") else "", 
            "phase": r["wbs_name"] or "",
            "block": "", 
            "spvNumber": str(r.get("spv_no")) if r.get("spv_no") else "",
            "actualStart": r["actual_start"].strftime("%Y-%m-%d") if r["actual_start"] else "",
            "actualFinish": "",
            "priority": str(r.get("priority")) if r.get("priority") else "",
            "plot": str(r.get("plot")) if r.get("plot") else "",
            "newBlockNom": str(r.get("new_block_nom")) if r.get("new_block_nom") else "",
            "scope": str(r.get("scope")) if r.get("scope") else "",
            "front": str(r.get("front")) if r.get("front") else "",
            "hold": str(r.get("hold")) if r.get("hold") else "",
        }
        
        def fmt_val(v):
            if v in (None, ""): return ""
            try:
                fv = float(v)
                return str(int(fv)) if fv.is_integer() else str(fv)
            except (TypeError, ValueError):
                return str(v)
                
        calculated_cum = cum_map.get(act_obj_id, 0.0)
        yest_val = yest_map.get(act_obj_id, 0.0)
        
        draft_row = draft_map.get(act_id.upper().strip() if act_id else "", {})
        # Prioritize draft value if present, otherwise DB value
        draft_today_val = draft_row.get("todayValue")
        if draft_today_val not in (None, ""):
            today_val = fmt_val(draft_today_val)
        elif act_obj_id in today_map:
            today_val = fmt_val(today_map[act_obj_id]) if today_map[act_obj_id] > 0 else "0"
        else:
            today_val = ""
            
        try:
            tod = float(today_val) if today_val else 0.0
        except ValueError:
            tod = 0.0
        total_cum = calculated_cum + tod
            
        remarks = draft_row.get("remarks", "")
        
        row_dict["cumulative"] = fmt_val(total_cum) if total_cum > 0 else ""
        row_dict["yesterdayValue"] = fmt_val(yest_val) if yest_val > 0 else fmt_val(draft_row.get("yesterdayValue", ""))
        row_dict["todayValue"] = today_val
        row_dict["remarks"] = remarks
        
        # Preserve draft-edited metadata (dates, scope, priority, etc.)
        # Without this, supervisor's edits to actualStart/forecastStart etc.
        # get overwritten by solar_activities column values on every reload.
        DRAFT_OVERRIDE_KEYS = [
            "actualStart", "actualFinish", "forecastStart", "forecastFinish",
            "scope", "front", "hold", "priority", "plot", "newBlockNom",
            "block", "spvNumber", "blockCapacity",
        ]
        for key in DRAFT_OVERRIDE_KEYS:
            draft_val = draft_row.get(key)
            if draft_val is not None and str(draft_val).strip() not in ("", "-"):
                row_dict[key] = str(draft_val).strip()
        
        try:
            tot = float(row_dict["totalQuantity"]) if row_dict["totalQuantity"] else 0.0
            bal = tot - total_cum
            if bal < 0: bal = 0
            row_dict["balance"] = fmt_val(bal) if tot > 0 else ""
        except ValueError:
            pass

        final_rows.append(row_dict)

    draft_data["rows"] = final_rows
    return draft_data


async def universal_progress_rebuild(pool, entry_row: dict) -> dict:
    project_object_id = entry_row["project_id"]
    sheet_type = entry_row["sheet_type"]
    target_date = entry_row["entry_date"]
    if isinstance(target_date, str):
        target_date = datetime.strptime(target_date, "%Y-%m-%d").date()
    yesterday_date = target_date - timedelta(days=1)

    # Fetch cumulative progress from DB — keyed by BOTH activity_id (string) and object_id (numeric)
    # so draft rows (which use string activity_id like 'ACL1-CC-1000') can match
    cum_rows = await pool.fetch("""
        SELECT 
            sa.object_id as activity_object_id, 
            sa.activity_id, 
            COALESCE(sa.cumulative, 0) + COALESCE(dp_sum.cumulative_value, 0) as cumulative_value
        FROM solar_activities sa
        JOIN projects p ON p.object_id = sa.project_object_id
        LEFT JOIN (
            SELECT dp.activity_object_id, SUM(dp.today_value) as cumulative_value
            FROM dpr_daily_progress dp
            JOIN solar_activities sa2 ON sa2.object_id = dp.activity_object_id
            JOIN projects p2 ON p2.object_id = sa2.project_object_id
            WHERE dp.progress_date < $1 
              AND dp.sheet_type = $2 
              AND dp.progress_date > COALESCE(p2.data_date, '1970-01-01'::date)
            GROUP BY dp.activity_object_id
        ) dp_sum ON dp_sum.activity_object_id = sa.object_id
        WHERE sa.project_object_id = $3
    """, target_date, sheet_type, project_object_id)
    # Build maps keyed by BOTH the string activity_id AND the numeric object_id
    cum_map = {}
    for r in cum_rows:
        val = float(r["cumulative_value"] or 0)
        cum_map[str(r["activity_object_id"])] = val
        if r["activity_id"]:
            cum_map[str(r["activity_id"]).upper().strip()] = val

    # Fetch yesterday's exact progress
    yest_rows = await pool.fetch("""
        SELECT dp.activity_object_id, sa.activity_id, dp.today_value
        FROM dpr_daily_progress dp
        JOIN solar_activities sa ON dp.activity_object_id = sa.object_id
        WHERE dp.progress_date = $1 AND dp.sheet_type = $2 AND sa.project_object_id = $3
    """, yesterday_date, sheet_type, project_object_id)
    yest_map = {}
    for r in yest_rows:
        val = float(r["today_value"] or 0)
        yest_map[str(r["activity_object_id"])] = val
        if r["activity_id"]:
            yest_map[str(r["activity_id"]).upper().strip()] = val

    # Fetch today's exact progress
    today_rows = await pool.fetch("""
        SELECT dp.activity_object_id, sa.activity_id, dp.today_value
        FROM dpr_daily_progress dp
        JOIN solar_activities sa ON dp.activity_object_id = sa.object_id
        WHERE dp.progress_date = $1 AND dp.sheet_type = $2 AND sa.project_object_id = $3
    """, target_date, sheet_type, project_object_id)
    today_map = {}
    for r in today_rows:
        if r["today_value"] is not None:
            val = float(r["today_value"])
            today_map[str(r["activity_object_id"])] = val
            if r["activity_id"]:
                today_map[str(r["activity_id"]).upper().strip()] = val

    # Fetch persisted DPR metadata and dates from solar_activities
    # This ensures metadata survives across date changes
    meta_rows = await pool.fetch("""
        SELECT sa.activity_id, sa.object_id,
               sa.actual_start, sa.actual_finish,
               sa.start_date as forecast_start, sa.finish_date as forecast_finish,
               sa.dpr_metadata
        FROM solar_activities sa
        WHERE sa.project_object_id = $1
    """, project_object_id)
    metadata_map = {}
    for r in meta_rows:
        meta = {}
        # Add persisted dates
        if r["actual_start"]:
            meta["actualStart"] = r["actual_start"].strftime("%Y-%m-%d") if hasattr(r["actual_start"], "strftime") else str(r["actual_start"])
        if r["actual_finish"]:
            meta["actualFinish"] = r["actual_finish"].strftime("%Y-%m-%d") if hasattr(r["actual_finish"], "strftime") else str(r["actual_finish"])
        if r["forecast_start"]:
            meta["forecastStart"] = r["forecast_start"].strftime("%Y-%m-%d") if hasattr(r["forecast_start"], "strftime") else str(r["forecast_start"])
        if r["forecast_finish"]:
            meta["forecastFinish"] = r["forecast_finish"].strftime("%Y-%m-%d") if hasattr(r["forecast_finish"], "strftime") else str(r["forecast_finish"])
        # Add JSONB metadata
        dpr_meta = r["dpr_metadata"] or {}
        if isinstance(dpr_meta, str):
            try: dpr_meta = json.loads(dpr_meta)
            except: dpr_meta = {}
        meta.update(dpr_meta)

        if meta:
            metadata_map[str(r["object_id"])] = meta
            if r["activity_id"]:
                metadata_map[str(r["activity_id"]).upper().strip()] = meta

    draft_data = entry_row["data_json"]
    if isinstance(draft_data, str):
        draft_data = json.loads(draft_data)
        
    def fmt_val(v):
        if v in (None, ""): return ""
        try:
            fv = float(v)
            return str(int(fv)) if fv.is_integer() else str(fv)
        except (TypeError, ValueError):
            return str(v)
    
    draft_rows = draft_data.get("rows", [])
    for row in draft_rows:
        act_id = str(row.get("activityId", ""))
        if not act_id:
            continue
        
        # IMPORTANT: Capture the draft's todayValue BEFORE any mutations below
        saved_draft_today = row.get("todayValue")
        
        act_id_lookup = act_id.upper().strip()
        
        calculated_cum = cum_map.get(act_id_lookup, cum_map.get(act_id, 0.0))
        yest_val = yest_map.get(act_id_lookup, yest_map.get(act_id, 0.0))
        
        row["cumulative"] = fmt_val(calculated_cum) if calculated_cum > 0 else ""
        
        if yest_val > 0:
            row["yesterdayValue"] = fmt_val(yest_val)
        else:
            row["yesterdayValue"] = fmt_val(row.get("yesterdayValue", ""))
        
        # Prioritize draft value if present, otherwise DB value
        if saved_draft_today not in (None, ""):
            row["todayValue"] = fmt_val(saved_draft_today)
        elif act_id_lookup in today_map or act_id in today_map:
            val = today_map.get(act_id_lookup, today_map.get(act_id, 0))
            row["todayValue"] = fmt_val(val) if val > 0 else "0"
        else:
            row["todayValue"] = ""
            
        today_val = row["todayValue"]
        try:
            tod = float(today_val) if today_val else 0.0
        except ValueError:
            tod = 0.0
        total_cum = calculated_cum + tod
            
        row["cumulative"] = fmt_val(total_cum) if total_cum > 0 else ""
        
        # Always update "actual" if present
        if "actual" in row:
            row["actual"] = fmt_val(total_cum) if total_cum > 0 else ""
        
        try:
            scope_val = row.get("scope") or row.get("totalQuantity") or 0.0
            tot = float(scope_val) if scope_val else 0.0
            bal = tot - total_cum
            if bal < 0: bal = 0
            
            if "balance" in row or "totalQuantity" in row:
                row["balance"] = fmt_val(bal) if tot > 0 else ""
        except ValueError:
            pass

        # Inject persisted metadata from solar_activities into draft rows
        # This ensures metadata (feeder, vendor, dates, etc.) survives date changes
        persisted_meta = metadata_map.get(act_id_lookup, metadata_map.get(act_id, {}))
        if persisted_meta:
            for mk, mv in persisted_meta.items():
                # Only fill if the draft row doesn't already have a value
                current_val = row.get(mk)
                if current_val is None or str(current_val).strip() == "" or current_val == "-":
                    row[mk] = mv

    draft_data["rows"] = draft_rows
    return draft_data


async def _finalize_entry(pool, entry: dict) -> dict:
    sheet_type = entry.get("sheet_type")
    # Before processing, ensure history is flattened for calculation
    if entry.get("data_json"):
        entry["data_json"] = flatten_history_array(entry["data_json"], entry.get("entry_date"))
    try:
        if sheet_type == "dp_qty":
            rebuilt_data = await rebuild_dp_qty_json(pool, entry)
            entry["data_json"] = json.dumps(rebuilt_data)
        elif sheet_type in ("dc_sheet", "ac_sheet", "testing_commissioning", "dp_vendor_block", "dp_vendor_idt", "dp_block", "switchyard", "transmission_line", "infra_works", "pss_civil_peb", "pss_electrical", "pss_tl_visual", "pss_transmission", "wind_progress", "wind_33kv", "wind_pss", "wind_ehv"):
            rebuilt_data = await universal_progress_rebuild(pool, entry)
            entry["data_json"] = json.dumps(rebuilt_data)
    except Exception as e:
        logger.error(f"Failed to rebuild json dynamically for {sheet_type}: {e}")
    return entry


@router.get("/daily-progress-history")
async def get_daily_progress_history(
    projectId: str,
    sheetType: str,
    days: int = 7,
    date: Optional[str] = None,
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(get_current_user),
):
    """
    Returns daily progress values for each activity over the last N days.
    Response: { activityObjectId: { "YYYY-MM-DD": value, ... }, ... }
    """
    from datetime import timedelta as td
    project_object_id = int(projectId)
    if date:
        target = datetime.strptime(date, "%Y-%m-%d").date() if isinstance(date, str) else date
    else:
        target = datetime.now().date()
    start_date = target - td(days=days - 1)

    rows = await pool.fetch("""
        SELECT dp.activity_object_id,
               sa.activity_id,
               dp.progress_date,
               dp.today_value
        FROM dpr_daily_progress dp
        JOIN solar_activities sa ON sa.object_id = dp.activity_object_id
        WHERE sa.project_object_id = $1
          AND dp.sheet_type = $2
          AND dp.progress_date >= $3
          AND dp.progress_date <= $4
        ORDER BY dp.progress_date
    """, project_object_id, sheetType, start_date, target)

    result: dict = {}
    for r in rows:
        obj_id = str(r["activity_object_id"])
        act_id = str(r["activity_id"]) if r["activity_id"] else None
        date_str = r["progress_date"].isoformat() if hasattr(r["progress_date"], "isoformat") else str(r["progress_date"])
        val = float(r["today_value"]) if r["today_value"] is not None else 0.0

        if obj_id not in result:
            result[obj_id] = {}
        result[obj_id][date_str] = val

        # Also index by string activity_id for draft matching
        if act_id:
            if act_id not in result:
                result[act_id] = {}
            result[act_id][date_str] = val

    return {"data": result, "startDate": start_date.isoformat(), "endDate": target.isoformat(), "days": days}


@router.get("/project-summary-draft")
async def get_project_summary_draft(
    projectId: str,
    sheetType: str = 'summary',
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(get_current_user),
):
    """Fetch the latest draft for a project, accessible by PMs."""
    user_role = current_user.get("role", "").lower()
    if user_role not in ("supervisor", "site pm", "pmag", "super admin", "admin"):
        raise HTTPException(403, detail={"message": "Access denied"})
        
    project_object_id = await resolve_project_id(projectId, pool)
    
    # Get ALL drafts for this project and sheet_type (to cover all blocks)
    rows = await pool.fetch("""
        SELECT * FROM dpr_supervisor_entries
        WHERE project_id = $1 AND sheet_type = $2 AND status = 'draft'
        ORDER BY updated_at DESC
    """, project_object_id, sheetType)
    
    if rows:
        results = [await _finalize_entry(pool, dict(row)) for row in rows]
        # To maintain compatibility with frontend expecting a single object, 
        # we could merge the rows array, OR return the array directly.
        # Since frontend expects a single object with `data_json: { rows: [...] }`,
        # let's merge the rows of all drafts together into one combined draft object.
        combined_rows = []
        for r in results:
            data = r.get("data_json", {})
            if isinstance(data, str):
                import json
                try: data = json.loads(data)
                except: data = {}
            r_rows = data.get("rows", []) if isinstance(data, dict) else data
            if isinstance(r_rows, list):
                combined_rows.extend(r_rows)
        
        # Return a merged draft object
        first_draft = results[0]
        if isinstance(first_draft.get("data_json"), dict):
            first_draft["data_json"]["rows"] = combined_rows
        elif isinstance(first_draft.get("data_json"), list):
            first_draft["data_json"] = combined_rows
        elif isinstance(first_draft.get("data_json"), str):
            import json
            first_draft["data_json"] = json.dumps({"rows": combined_rows})
            
        return first_draft
        
    return None

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
            return await _finalize_entry(pool, entry)

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
        return await _finalize_entry(pool, entry)

    # Return existing submitted/approved entry — prevents duplicate entries in PM queue.
    # Previously disabled ("to allow multiple submissions"), which caused the bug where
    # opening the same sheet after submitting would create a new empty draft each time.
    row = await pool.fetchrow("""
        SELECT * FROM dpr_supervisor_entries
        WHERE supervisor_id = $1 AND project_id = $2 AND sheet_type = $3 AND entry_date = $4
          AND status IN ('submitted_to_pm', 'approved_by_pm', 'final_approved')
        ORDER BY updated_at DESC LIMIT 1
    """, user_id, project_object_id, sheetType, target_date)
    if row:
        entry: dict[str, Any] = dict(row)
        if entry["status"] == "submitted_to_pm":
            entry["message"] = "This entry is pending PM review. Any new edits will be tracked."
        elif entry["status"] == "approved_by_pm":
            entry["message"] = "This entry is approved by PM. New edits will restart the review process."
        elif entry["status"] == "final_approved":
            entry["message"] = "This entry is fully approved. New edits will restart the review process."
        return await _finalize_entry(pool, entry)

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

    return await _finalize_entry(pool, entry)


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
        "SELECT id, supervisor_id, project_id, entry_date, data_json, status FROM dpr_supervisor_entries WHERE id = $1",
        entry_id,
    )
    
    if not check:
        logger.error(f"save_draft_entry: Entry {entry_id} NOT FOUND in DB at all")
        raise HTTPException(404, detail={"message": f"Entry {entry_id} not found"})
    
    if check["supervisor_id"] != current_user["userId"]:
        logger.error(f"save_draft_entry: Access denied. Entry {entry_id} belongs to supervisor {check['supervisor_id']}, but current user is {current_user['userId']}")
        raise HTTPException(403, detail={"message": "Access denied: This entry belongs to another supervisor"})

    # Prevent race condition where a delayed save-draft reverts a freshly submitted entry
    # (Commented out: Users requested the ability to edit 'submitted_to_pm' sheets directly)
    # if current_user.get("role", "").lower() == "supervisor":
    #     if check["status"] in ('submitted_to_pm', 'approved_by_pm', 'final_approved'):
    #         logger.warning(f"save_draft_entry: Ignoring save for entry {entry_id} because status is {check['status']}")
    #         return {"message": "Draft save ignored - entry already submitted", "entry": dict(check)}

    # Convert flat keys to history array for storage
    final_data = extract_to_history_array(new_data, check["entry_date"])

    # Log partial update details
    if is_partial and check["data_json"]:
        logger.info(f"Performing partial update for entry {entry_id}")
        try:
            existing_data = check["data_json"]
            if isinstance(existing_data, str):
                existing_data = json.loads(existing_data)
            
            # If existing_data is a list, convert to a dict
            if isinstance(existing_data, list):
                merged_data = {"rows": existing_data}
            else:
                merged_data = existing_data.copy()
            
            # Merge top-level meta fields (like staticHeader)
            # Use final_data (history-array-converted) instead of new_data (flat keys)
            for key, val in final_data.items():
                if key != "rows":
                    merged_data[key] = val
            
            # Merge rows if present
            if "rows" in final_data and "rows" in merged_data:
                new_rows = final_data["rows"]
                existing_rows = merged_data["rows"]
                
                def get_row_key(r):
                    key_parts = []
                    
                    # Order of precedence for unique identifiers
                    if r.get("assignmentId"): 
                        key_parts.append(f"ass:{r['assignmentId']}")
                    elif r.get("activityId"): 
                        key_parts.append(f"act:{r['activityId']}")
                    elif r.get("id"): 
                        key_parts.append(f"id:{r['id']}")
                    elif r.get("typeOfMachine"): 
                        key_parts.append(f"machine:{r['typeOfMachine']}")
                    elif r.get("type"): 
                        key_parts.append(f"type:{r['type']}")
                    else:
                        # For stringing/erection which might use description/activities
                        desc = r.get("description") or r.get("activities")
                        if desc: 
                            key_parts.append(f"desc:{desc}")
                    
                    # Append description and block to disambiguate duplicated activityIds (like Solar Manpower)
                    if r.get("description"):
                        key_parts.append(f"d:{r['description']}")
                    if r.get("block"):
                        key_parts.append(f"b:{r['block']}")
                        
                    if key_parts:
                        return "|".join(key_parts)
                    return None

                existing_dict = {}
                for i, e_row in enumerate(existing_rows):
                    k = get_row_key(e_row)
                    if k:
                        existing_dict[k] = i
                
                for n_row in new_rows:
                    k = get_row_key(n_row)
                    if k and k in existing_dict:
                        idx = existing_dict[k]
                        merged_row = {**existing_rows[idx], **n_row}
                        # If the new row has a history array (from extract_to_history_array),
                        # clean up stale flat keys from the existing row to avoid conflicts
                        if isinstance(n_row.get("history"), list):
                            merged_row.pop("todayValue", None)
                            merged_row.pop("yesterdayValue", None)
                            merged_row.pop("historyValues", None)
                            keys_to_drop = [k2 for k2 in merged_row if k2.startswith("actual_") and len(k2) == 17]
                            for k2 in keys_to_drop:
                                merged_row.pop(k2, None)
                        existing_rows[idx] = merged_row
                    else:
                        # Append new row
                        new_idx = len(existing_rows)
                        existing_rows.append(n_row)
                        if k:
                            existing_dict[k] = new_idx
                
                merged_data["rows"] = existing_rows
            
            final_data = merged_data
        except Exception as e:
            logger.error(f"Merge failed for entry {entry_id}: {e}")
            # Fallback to overwrite if merge fails
            
    # Perform the update
    # If the entry was already submitted or approved, revert it based on who is editing
    user_role = current_user.get("role", "").lower()
    
    if user_role == "site pm":
        status_case = "CASE WHEN status IN ('approved_by_pm', 'final_approved', 'rejected_by_pmag') THEN 'rejected_by_pm' ELSE status END"
    elif user_role == "pmag":
        status_case = "CASE WHEN status IN ('final_approved') THEN 'rejected_by_pmag' ELSE status END"
    else: # supervisor
        status_case = "CASE WHEN status IN ('approved_by_pm', 'final_approved', 'rejected_by_pm', 'rejected_by_pmag') THEN 'draft' ELSE status END"

    row = await pool.fetchrow(
        f"""
        UPDATE dpr_supervisor_entries 
        SET data_json = $1, 
            status = {status_case},
            updated_at = CURRENT_TIMESTAMP 
        WHERE id = $2 RETURNING *
        """,
        json.dumps(final_data), entry_id,
    )
    
    # After saving, flatten it again for the response so the UI receives flat keys
    final_data_flattened = flatten_history_array(final_data, check["entry_date"])

    # ── Persist ALL user-edited fields back to solar_activities ──────────
    # This ensures data survives across date changes and is visible to all
    # users on the same project (last-write-wins for concurrent edits).
    project_id = check["project_id"]
    for r in final_data_flattened.get("rows", []):
        act_id_str = str(r.get("activityId") or r.get("activityObjectId") or "")
        if not act_id_str:
            continue

        # 1. Persist scope / totalQuantity
        scope_val_str = str(r.get("scope") or r.get("totalQuantity") or "")
        if scope_val_str:
            try:
                scope_val = float(scope_val_str)
                await pool.execute("""
                    UPDATE solar_activities
                    SET total_quantity = $1
                    WHERE (activity_id = $2 OR object_id::text = $2)
                      AND project_object_id = $3
                """, scope_val, act_id_str, project_id)
            except ValueError:
                pass

        # 2. Persist date changes to dedicated columns (actual/forecast start/finish)
        from app.services.p6_push_service import parse_date
        date_updates = {}
        for field, col in [
            ("actualStart", "actual_start"),
            ("actualFinish", "actual_finish"),
            ("forecastStart", "start_date"),
            ("forecastFinish", "finish_date"),
        ]:
            if field in r:
                val = r.get(field)
                if val is None or str(val).strip() == "" or val == "-":
                    date_updates[col] = None
                else:
                    parsed = parse_date(val)
                    if parsed:
                        date_updates[col] = parsed

        if date_updates:
            set_clauses = []
            params = []
            idx = 1
            for col, val in date_updates.items():
                set_clauses.append(f"{col} = ${idx}")
                params.append(val)
                idx += 1
            params.append(act_id_str)
            params.append(project_id)
            sql = f"""
                UPDATE solar_activities
                SET {', '.join(set_clauses)}
                WHERE (activity_id = ${idx} OR object_id::text = ${idx})
                  AND project_object_id = ${idx + 1}
            """
            try:
                await pool.execute(sql, *params)
            except Exception as e:
                logger.error(f"Failed to persist dates for {act_id_str}: {e}")

        # 3. Persist wind/PSS metadata to dpr_metadata JSONB column
        #    This covers ALL non-P6 columns shown in the UI.
        metadata = {}
        METADATA_KEYS = [
            "feeder", "wtgFdnVendor", "fdnAllotmentDate",
            "stoneColumnContractor", "soilTestStatus",
            "wtgCoordE", "wtgCoordN", "substation", "spv",
            "locations", "vendorName", "soVendorName",
            "contractorName", "priority", "noOfDays",
            "selectedResourceId", "completed",
            "remarks", "agencyName",
            "plot", "newBlockNom", "block", "holdDueToWtg", "front", "vendor", "baselinePriority"
        ]
        for key in METADATA_KEYS:
            if key in r:
                val = r.get(key)
                if val is None:
                    metadata[key] = ""
                else:
                    metadata[key] = str(val).strip()

        # Also persist extraData sub-fields if present
        extra = r.get("extraData")
        if isinstance(extra, dict):
            for key in METADATA_KEYS:
                if key in extra:
                    val = extra.get(key)
                    if val is None:
                        metadata[key] = ""
                    else:
                        metadata[key] = str(val).strip()

        if metadata:
            try:
                await pool.execute("""
                    UPDATE solar_activities
                    SET dpr_metadata = COALESCE(dpr_metadata, '{}'::jsonb) || $1::jsonb
                    WHERE (activity_id = $2 OR object_id::text = $2)
                      AND project_object_id = $3
                """, json.dumps(metadata), act_id_str, project_id)
            except Exception as e:
                logger.error(f"Failed to persist metadata for {act_id_str}: {e}")

    # Also write daily progress so yesterday-values picks it up immediately, even before submission
    try:
        # Pass flattened row to _write_daily_progress_from_entry so it finds todayValue etc.
        # But wait, we updated _write_daily_progress_from_entry to support 'history' array too.
        # It's safest to pass the one with flat keys just in case.
        row_dict = dict(row)
        row_dict["data_json"] = final_data_flattened
        await _write_daily_progress_from_entry(pool, row_dict, logger)
    except Exception as e:
        logger.error(f"Failed to write daily progress on save_draft_entry: {e}")

    row_dict = dict(row)
    row_dict["data_json"] = final_data_flattened
    return row_dict


@router.post("/submit")
async def submit_entry(
    body: dict[str, Any],
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(get_current_user),
):
    entry_id = body.get("entryId")
    edit_reason = body.get("editReason")
    expected_sheet_type = body.get("sheetType")  # Optional safety check from frontend
    user_id = current_user["userId"]

    # DEBUG LOGGING for 404 investigation
    logger.info(f"submit_entry: entryId={entry_id}, userId={user_id}, expectedSheetType={expected_sheet_type}")
    
    check = await pool.fetchrow(
        "SELECT id, supervisor_id, status, project_id, sheet_type, entry_date FROM dpr_supervisor_entries WHERE id = $1",
        entry_id,
    )
    
    if not check:
        logger.error(f"submit_entry: Entry {entry_id} NOT FOUND in DB at all")
        raise HTTPException(404, detail={"message": f"Entry {entry_id} not found"})
    
    # Safety check: if frontend sent sheetType, verify it matches the entry's actual sheet_type.
    # This prevents a race condition where tab-switching overwrites the draft entry and the
    # wrong entry ID gets submitted.
    if expected_sheet_type and check["sheet_type"] != expected_sheet_type:
        logger.error(
            f"submit_entry: SHEET TYPE MISMATCH! Entry {entry_id} is '{check['sheet_type']}' "
            f"but frontend expected '{expected_sheet_type}'. Rejecting to prevent wrong-sheet submission."
        )
        raise HTTPException(400, detail={
            "message": f"Sheet type mismatch: you tried to submit '{expected_sheet_type}' "
                       f"but entry {entry_id} is '{check['sheet_type']}'. Please refresh and try again."
        })

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
        pms = await pool.fetch("""
            SELECT u.user_id 
            FROM users u
            JOIN project_assignments pa ON u.user_id = pa.user_id
            WHERE u.role = 'Site PM' AND pa.project_id = $1
        """, check["project_id"])
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
        from app.services.email_service import send_dpr_status_email, send_dpr_submission_email
        from app.config import settings
        pms = await pool.fetch("""
            SELECT u.name, u.email 
            FROM users u
            JOIN project_assignments pa ON u.user_id = pa.user_id
            WHERE u.role = 'Site PM' AND pa.project_id = $1
        """, check["project_id"])
        proj = await pool.fetchval('SELECT "Name" FROM p6_projects WHERE "ObjectId" = $1', check["project_id"])
        
        # Notify Super Admin
        if settings.SUPER_ADMIN_EMAIL:
            await send_dpr_status_email(
                settings.SUPER_ADMIN_EMAIL, "Super Admin", check["sheet_type"], "Submitted to PM",
                proj or "Project", check["entry_date"].isoformat(), f"By Supervisor: {current_user.get('name', current_user.get('email', 'Supervisor'))}"
            )
            
        # Notify Site PMs via email as well
        supervisor_name = current_user.get('name', current_user.get('email', 'Supervisor'))
        for pm in pms:
            if pm["email"]:
                await send_dpr_submission_email(
                    pm["email"], pm["name"], supervisor_name, proj or "Project", check["entry_date"].isoformat()
                )
    except Exception as ee:
        logger.error(f"Submission email notification failed: {ee}")

    await cache.flush_all()
    # Finalize the entry data so the frontend gets rebuilt progress values
    finalized_entry = await _finalize_entry(pool, dict(row))
    return {"message": "Entry submitted successfully", "entry": finalized_entry}


@router.post("/submit-all")
async def submit_all_entries(
    body: dict[str, Any],
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(get_current_user),
):
    project_id = body.get("projectId")
    entry_date = body.get("entryDate")
    edit_reason = body.get("editReason")
    user_id = current_user["userId"]
    
    if not project_id or not entry_date:
        raise HTTPException(400, detail={"message": "Missing projectId or entryDate"})
        
    project_object_id = await resolve_project_id(project_id, pool)
    
    try:
        dt_entry = datetime.strptime(entry_date, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(400, detail={"message": "Invalid entryDate format"})
        
    rows = await pool.fetch(
        "SELECT id, status, sheet_type, data_json FROM dpr_supervisor_entries WHERE project_id = $1 AND supervisor_id = $2 AND status = 'draft'",
        project_object_id, user_id
    )
    
    if not rows:
        return {"message": "No draft entries found to submit", "submittedCount": 0}
    
    # Filter: only submit drafts that have been actually modified (have real data rows)
    submittable = []
    skipped_sheets = []
    for r in rows:
        sheet_type = r["sheet_type"]
        # Skip summary/issues sheets - they don't need independent submission
        if sheet_type in ("summary", "wind_summary", "pss_summary"):
            skipped_sheets.append(sheet_type)
            continue
        
        dj = r["data_json"]
        if isinstance(dj, str):
            dj = json.loads(dj)
        
        data_rows = dj.get("rows", [])
        # Check if there are any rows with actual data
        # Note: after extract_to_history_array, todayValue/yesterdayValue are moved into
        # a 'history' array, so we must check for that format too.
        def row_has_data(row):
            if row.get("isCategoryHeading") or row.get("isCategoryRow"):
                return False
            # Flat format (fresh draft not yet saved)
            if row.get("activityId") or row.get("todayValue") or row.get("description"):
                return True
            # History array format (after save-draft converts fields)
            history = row.get("history")
            if isinstance(history, list) and any(
                float(h.get("actual", 0) or 0) > 0 for h in history
            ):
                return True
            # historyValues dict format
            hv = row.get("historyValues")
            if isinstance(hv, dict) and any(float(v or 0) > 0 for v in hv.values()):
                return True
            return False

        has_data = any(row_has_data(row) for row in data_rows)
        
        if has_data:
            submittable.append(r)
        else:
            skipped_sheets.append(sheet_type)
    
    if not submittable:
        return {"message": "No changed draft sheets found to submit", "submittedCount": 0}
        
    submitted_count = 0
    for r in submittable:
        await pool.execute("""
            UPDATE dpr_supervisor_entries 
            SET status = 'submitted_to_pm', submitted_at = CURRENT_TIMESTAMP, submitted_by = $2, updated_at = CURRENT_TIMESTAMP, entry_date = $3
            WHERE id = $1
        """, r["id"], user_id, dt_entry)
        submitted_count += 1
        
        await _save_snapshot(
            pool, r["id"], "submitted", r["data_json"],
            r["status"], "submitted_to_pm", user_id, edit_reason
        )

    if skipped_sheets:
        logger.info(f"Global submit: skipped empty/unchanged sheets: {skipped_sheets}")

    # Write daily progress for all submitted entries
    for r in submittable:
        try:
            full_row = await pool.fetchrow("SELECT * FROM dpr_supervisor_entries WHERE id = $1", r["id"])
            if full_row:
                await _write_daily_progress_from_entry(pool, full_row, logger)
        except Exception as e:
            logger.error(f"Failed to write daily progress for entry {r['id']}: {e}")

    # Notify Site PM(s) assigned to this project — in-app notifications
    try:
        proj_name = await _get_project_name(pool, project_object_id)
        submitted_sheet_labels = [_format_sheet_type(r["sheet_type"]) for r in submittable]
        sheets_summary = ", ".join(submitted_sheet_labels[:3])
        if len(submitted_sheet_labels) > 3:
            sheets_summary += f" (+{len(submitted_sheet_labels) - 3} more)"
        date_label = _format_date(dt_entry)

        pms = await pool.fetch("""
            SELECT u.user_id, u.name, u.email 
            FROM users u
            JOIN project_assignments pa ON u.user_id = pa.user_id
            WHERE u.role = 'Site PM' AND pa.project_id = $1
        """, project_object_id)

        supervisor_name = current_user.get('name', current_user.get('email', 'Supervisor'))

        for pm in pms:
            await create_notification(
                pool, pm["user_id"], 
                "New DPR Submission", 
                f"{supervisor_name} submitted {submitted_count} sheet(s) [{sheets_summary}] for {proj_name} ({date_label})",
                "info", project_object_id, None, None
            )
    except Exception as e:
        logger.error(f"Failed to send global submit in-app notifications: {e}")

    # EMAIL NOTIFICATION TO SITE PMS & SUPER ADMIN
    try:
        from app.services.email_service import send_dpr_status_email, send_dpr_submission_email
        from app.config import settings

        pms = await pool.fetch("""
            SELECT u.name, u.email 
            FROM users u
            JOIN project_assignments pa ON u.user_id = pa.user_id
            WHERE u.role = 'Site PM' AND pa.project_id = $1
        """, project_object_id)
        proj = await pool.fetchval('SELECT "Name" FROM p6_projects WHERE "ObjectId" = $1', project_object_id)

        supervisor_name = current_user.get('name', current_user.get('email', 'Supervisor'))

        # Notify Super Admin
        if settings.SUPER_ADMIN_EMAIL:
            await send_dpr_status_email(
                settings.SUPER_ADMIN_EMAIL, "Super Admin", 
                f"{submitted_count} sheets", "Submitted to PM",
                proj or "Project", entry_date, 
                f"By Supervisor: {supervisor_name}"
            )

        # Notify Site PMs via email
        for pm in pms:
            if pm["email"]:
                await send_dpr_submission_email(
                    pm["email"], pm["name"], supervisor_name, 
                    proj or "Project", entry_date
                )
    except Exception as ee:
        logger.error(f"Global submission email notification failed: {ee}")

    await cache.flush_all()
    return {"message": f"Successfully submitted {submitted_count} entries", "submittedCount": submitted_count}



@router.get("/pm/debug-entries/{project_id}")
async def debug_entries(
    project_id: str,
    pool: PoolWrapper = Depends(get_db)
):
    try:
        from app.routers.project_utils import resolve_project_id
        resolved = await resolve_project_id(project_id, pool)
        
        # Raw dump from dpr_supervisor_entries
        raw_entries = await pool.fetch(
            "SELECT id, project_id, status, sheet_type, supervisor_id FROM dpr_supervisor_entries WHERE project_id = $1 ORDER BY updated_at DESC LIMIT 10",
            int(resolved) if isinstance(resolved, int) else 0
        )
        
        return {
            "requested_project_id": project_id,
            "resolved_object_id": resolved,
            "raw_db_entries": [dict(r) for r in raw_entries]
        }
    except Exception as e:
        return {"error": str(e)}

@router.get("/pm/entries")
async def get_entries_for_pm_review(
    projectId: Optional[str] = None,
    limit: int = 100,
    offset: int = 0,
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(get_current_user),
):
    user_role = current_user.get("role", "").lower()
    if user_role not in ("site pm", "pmag", "super admin"):
        raise HTTPException(403, detail={"message": "Access denied"})

    cache_key = f"pm_entries_{current_user['userId']}_{projectId or 'all'}_{limit}_{offset}"
    # In-memory cache disabled to prevent multi-worker desync on VMs
    # cached = await cache.get(cache_key)
    # if cached:
    #     return cached

    valid_pid = projectId and str(projectId) not in ("null", "undefined", "")
    project_object_id = None
    if valid_pid:
        project_object_id = await resolve_project_id(projectId, pool)

    if project_object_id:
        if isinstance(project_object_id, list):
            rows = await pool.fetch("""
                SELECT dse.*, u.name as supervisor_name, u.email as supervisor_email
                FROM dpr_supervisor_entries dse JOIN users u ON dse.supervisor_id = u.user_id
                WHERE dse.project_id = ANY($1::int[]) AND dse.status IN ('submitted_to_pm', 'approved_by_pm', 'rejected_by_pm', 'final_approved')
                ORDER BY dse.submitted_at DESC
                LIMIT $2 OFFSET $3
            """, project_object_id, limit, offset)
        else:
            rows = await pool.fetch("""
                SELECT dse.*, u.name as supervisor_name, u.email as supervisor_email
                FROM dpr_supervisor_entries dse JOIN users u ON dse.supervisor_id = u.user_id
                WHERE dse.project_id = $1 AND dse.status IN ('submitted_to_pm', 'approved_by_pm', 'rejected_by_pm', 'final_approved')
                ORDER BY dse.submitted_at DESC
                LIMIT $2 OFFSET $3
            """, project_object_id, limit, offset)
    else:
        # When no projectId is specified, only show entries for projects assigned to this PM
        rows = await pool.fetch("""
            SELECT dse.*, u.name as supervisor_name, u.email as supervisor_email
            FROM dpr_supervisor_entries dse 
            JOIN users u ON dse.supervisor_id = u.user_id
            JOIN project_assignments pa ON pa.project_id = dse.project_id AND pa.user_id = $1
            WHERE dse.status IN ('submitted_to_pm', 'approved_by_pm', 'rejected_by_pm', 'final_approved')
            ORDER BY dse.submitted_at DESC
            LIMIT $2 OFFSET $3
        """, current_user["userId"], limit, offset)

    result = []
    for r in rows:
        entry = dict(r)
        # Flatten history array back to flat UI fields (todayValue, historyValues, etc.)
        # so ManpowerDetailsTable and graph components can read them
        if entry.get("data_json") and entry.get("entry_date"):
            try:
                dj = entry["data_json"]
                if isinstance(dj, str):
                    import json as _json
                    dj = _json.loads(dj)
                entry["data_json"] = flatten_history_array(dj, entry["entry_date"])
            except Exception as e:
                logger.warning(f"pm/entries: Failed to flatten history for entry {entry.get('id')}: {e}")
        result.append(entry)
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
        # Notify and Email PMAG
        pmags = await pool.fetch("""
            SELECT u.user_id, u.email, u.name 
            FROM users u
            JOIN pmag_project_assignments pa ON u.user_id = pa.user_id
            WHERE u.role = 'PMAG' AND pa.project_id = $1
        """, entry["project_id"])
        
        try:
            from app.services.email_service import send_dpr_status_email
            proj = await pool.fetchval('SELECT "Name" FROM p6_projects WHERE "ObjectId" = $1', entry["project_id"])
            for pmag in pmags:
                await create_notification(
                    pool, pmag["user_id"], 
                    "PM-Approved DPR", 
                    f"{sheet_label} for {proj_name} ({date_label}) approved by PM. Pending your review.",
                    "info", entry["project_id"], entry_id, entry["sheet_type"]
                )
                if pmag["email"]:
                    await send_dpr_status_email(
                        pmag["email"], pmag["name"], entry["sheet_type"], "Approved by PM (Pending PMAG Review)", 
                        proj or "Project", entry["entry_date"].isoformat(), f"Approved by PM: {current_user.get('name', '')}"
                    )
        except Exception as ee:
            logger.error(f"PMAG notification failed: {ee}")
            
        # EMAIL NOTIFICATION TO SUPERVISOR
        try:
            from app.services.email_service import send_dpr_status_email
            # Fetch supervisor info and project name
            sup = await pool.fetchrow("SELECT name, email FROM users WHERE user_id = $1", entry["supervisor_id"])
            if not proj:
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
        "UPDATE dpr_supervisor_entries SET data_json = $1, status = 'rejected_by_pm', updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *",
        json.dumps(data), entry_id,
    )
    
    # Notify Supervisor about the edit
    try:
        entry = dict(row)
        from app.services.email_service import send_dpr_status_email
        sup = await pool.fetchrow("SELECT name, email FROM users WHERE user_id = $1", entry["supervisor_id"])
        proj = await pool.fetchval('SELECT "Name" FROM p6_projects WHERE "ObjectId" = $1', entry["project_id"])
        if sup and sup["email"]:
            await send_dpr_status_email(
                sup["email"], sup["name"], entry["sheet_type"], "Edited by PM", 
                proj or "Project", entry["entry_date"].isoformat(), "Your DPR entry was modified by the Site PM."
            )
    except Exception as ee:
        logger.error(f"Email notification for PM edit failed: {ee}")
        
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
    
    # Notify Supervisor about the PMAG edit
    try:
        entry = dict(row)
        from app.services.email_service import send_dpr_status_email
        sup = await pool.fetchrow("SELECT name, email FROM users WHERE user_id = $1", entry["supervisor_id"])
        proj = await pool.fetchval('SELECT "Name" FROM p6_projects WHERE "ObjectId" = $1', entry["project_id"])
        if sup and sup["email"]:
            await send_dpr_status_email(
                sup["email"], sup["name"], entry["sheet_type"], "Edited by PMAG", 
                proj or "Project", entry["entry_date"].isoformat(), "Your DPR entry was modified by the PMAG."
            )
    except Exception as ee:
        logger.error(f"Email notification for PMAG edit failed: {ee}")
        
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

    return await _finalize_entry(pool, dict(row))


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
    # In-memory cache disabled to prevent multi-worker desync on VMs
    # cached = await cache.get(cache_key)
    # if cached:
    #     return cached

    valid_pid = projectId and str(projectId) not in ("null", "undefined", "")
    project_object_id = None
    if valid_pid:
        project_object_id = await resolve_project_id(projectId, pool)

    if project_object_id:
        if isinstance(project_object_id, list):
            rows = await pool.fetch("""
                SELECT dse.*, u.name as supervisor_name, u.email as supervisor_email
                FROM dpr_supervisor_entries dse JOIN users u ON dse.supervisor_id = u.user_id
                WHERE dse.project_id = ANY($1::int[]) AND dse.status IN ('approved_by_pm', 'final_approved')
                  AND dse.pushed_at IS NULL
                ORDER BY dse.updated_at DESC
                LIMIT $2 OFFSET $3
            """, project_object_id, limit, offset)
        else:
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
    user_role = current_user.get("role", "").lower()
    if user_role not in ("site pm", "super admin", "pmag"):
        raise HTTPException(403, detail={"message": "Access denied"})

    params = []
    conditions = ["dse.status IN ('approved_by_pm', 'final_approved')"]
    idx = 1

    if projectId:
        project_object_id = await resolve_project_id(projectId, pool)
        if isinstance(project_object_id, list):
            conditions.append(f"dse.project_id = ANY(${idx}::int[])")
        else:
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

    result = []
    for r in rows:
        entry = dict(r)
        if entry.get("data_json") and entry.get("entry_date"):
            try:
                dj = entry["data_json"]
                if isinstance(dj, str):
                    import json as _json
                    dj = _json.loads(dj)
                entry["data_json"] = flatten_history_array(dj, entry["entry_date"])
            except Exception as e:
                logger.warning(f"pmag-history: Failed to flatten history for entry {entry.get('id')}: {e}")
        result.append(entry)
    return result



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
        if isinstance(project_object_id, list):
            rows = await pool.fetch("""
                SELECT dse.*, u.name as supervisor_name, u.email as supervisor_email
                FROM dpr_supervisor_entries dse JOIN users u ON dse.supervisor_id = u.user_id
                WHERE dse.project_id = ANY($1::int[]) AND dse.status = 'final_approved'
                  AND dse.updated_at < CURRENT_TIMESTAMP - INTERVAL '7 days'
                ORDER BY dse.updated_at DESC
            """, project_object_id)
        else:
            rows = await pool.fetch("""
                SELECT dse.*, u.name as supervisor_name, u.email as supervisor_email
                FROM dpr_supervisor_entries dse JOIN users u ON dse.supervisor_id = u.user_id
                WHERE dse.project_id = $1 AND dse.status = 'final_approved'
                  AND dse.updated_at < CURRENT_TIMESTAMP - INTERVAL '7 days'
                ORDER BY dse.updated_at DESC
            """, project_object_id)
    else:
        rows = await pool.fetch("""
            SELECT dse.*, u.name as supervisor_name, u.email as supervisor_email
            FROM dpr_supervisor_entries dse JOIN users u ON dse.supervisor_id = u.user_id
            WHERE dse.status = 'final_approved' AND dse.updated_at < CURRENT_TIMESTAMP - INTERVAL '7 days'
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
    background_tasks: BackgroundTasks,
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(get_current_user),
):
    from app.config import get_p6_password_last_reset_date
    last_reset = get_p6_password_last_reset_date()
    if last_reset:
        try:
            reset_date = datetime.strptime(last_reset, "%Y-%m-%d").date()
            if (datetime.now().date() - reset_date).days >= 45:
                raise HTTPException(status_code=403, detail="P6 integration password has expired and needs to be upgraded. Sorry for the inconvenience, we will clear this issue soon.")
        except Exception as e:
            if isinstance(e, HTTPException): raise e

    user_role = current_user.get("role", "").lower()
    if user_role not in ("pmag", "super admin", "supervisor", "site pm"):
        raise HTTPException(403, detail={"message": "You are not authorized to push to P6"})

    entry_id = body.get("entryId")
    dry_run = body.get("dryRun", False)

    # Verify entry exists and has correct status
    entry = await pool.fetchrow("""
        SELECT id, project_id, status, sheet_type FROM dpr_supervisor_entries WHERE id = $1
    """, entry_id)

    if not entry:
        raise HTTPException(404, detail={"message": "Entry not found"})

    if entry["status"] not in ("approved_by_pm", "final_approved"):
        raise HTTPException(400, detail={"message": f"Entry status '{entry['status']}' is not eligible for P6 push. Must be 'approved_by_pm' or 'final_approved'."})

    # Check if sheet type supports P6 push
    supported_sheets = ["dp_vendor_idt", "dp_vendor_block", "dc_sheet", "ac_sheet", "manpower_details", "dp_qty", "dp_block", "wind_progress", "pss_progress",
                        "bess_civil", "bess_electrical", "bess_bop", "bess_testing", "bess_dp_qty", "bess_manpower"]
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
        
        # Trigger background sync after successful push
        from sync_all_p6_data import sync_data
        background_tasks.add_task(sync_data, target_project_id=str(entry["project_id"]), full_sync=False, pool=pool)

    return {
        "message": "P6 push completed" if result["success"] else "P6 push completed with errors",
        "result": result
    }

@router.get("/pmag-push-status/{entry_id}")
async def get_push_status(entry_id: int):
    from app.services.p6_push_service import push_statuses
    status = push_statuses.get(entry_id)
    if not status:
        return {"is_pushing": False, "progress": 0, "total": 0, "message": "No active push operation found."}
    return status


# ── Snapshot Endpoints ─────────────────────────────────────────────

@router.get("/push-history/{project_id}")
async def get_push_history(
    project_id: str,
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(get_current_user),
):
    """Get all pushed entries for a project with audit summary."""
    project_oid = await resolve_project_id(project_id, pool)
    if isinstance(project_oid, list):
        where_cond = "e.project_id = ANY($1::int[])"
    else:
        where_cond = "e.project_id = $1"
        
    rows = await pool.fetch(f"""
        SELECT e.id as entry_id, e.sheet_type, e.entry_date, e.pushed_at,
               e.status, u_push.name as pushed_by_name, u_sup.name as supervisor_name,
               COALESCE(pa.success_count, 0) as activities_pushed,
               COALESCE(pa.failed_count, 0) as activities_failed,
               COALESCE(pa.skipped_count, 0) as activities_skipped
        FROM dpr_supervisor_entries e
        LEFT JOIN users u_push ON e.pushed_by = u_push.user_id
        LEFT JOIN users u_sup ON e.supervisor_id = u_sup.user_id
        LEFT JOIN LATERAL (
            SELECT 
                COUNT(*) FILTER (WHERE push_status = 'success') as success_count,
                COUNT(*) FILTER (WHERE push_status = 'failed') as failed_count,
                COUNT(*) FILTER (WHERE push_status = 'skipped') as skipped_count
            FROM push_audit WHERE entry_id = e.id
        ) pa ON true
        WHERE {where_cond} AND e.status = 'final_approved' AND e.pushed_at IS NOT NULL
        ORDER BY e.pushed_at DESC
        LIMIT 200
    """, project_oid)
    return [dict(r) for r in rows]


@router.get("/push-audit-detail/{entry_id}")
async def get_push_audit_detail(
    entry_id: int,
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(get_current_user),
):
    """Get detailed push audit log for a specific entry."""
    rows = await pool.fetch("""
        SELECT pa.id, pa.activity_object_id, sa.activity_id, sa.name as activity_name,
               pa.field_name, pa.old_value, pa.new_value, pa.push_status,
               pa.error_message, pa.pushed_at
        FROM push_audit pa
        LEFT JOIN solar_activities sa ON pa.activity_object_id = sa.object_id
        WHERE pa.entry_id = $1
        ORDER BY pa.pushed_at ASC
    """, entry_id)
    return [dict(r) for r in rows]


@router.get("/push-comparison")
async def get_push_comparison(
    project_id: str,
    date_from: str,
    date_to: str,
    sheet_type: Optional[str] = None,
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(get_current_user),
):
    """Compare progress between two dates for a project."""
    from datetime import date as dt_date
    project_oid = await resolve_project_id(project_id, pool)
    d_from = datetime.strptime(date_from, "%Y-%m-%d").date()
    d_to = datetime.strptime(date_to, "%Y-%m-%d").date()

    if isinstance(project_oid, list):
        base_filter = "sa.project_object_id = ANY($1::int[])"
    else:
        base_filter = "sa.project_object_id = $1"
    params_from = [project_oid, d_from]
    params_to = [project_oid, d_to]
    
    if sheet_type:
        base_filter += " AND dp.sheet_type = $3"
        params_from.append(sheet_type)
        params_to.append(sheet_type)

    from_rows = await pool.fetch(f"""
        SELECT sa.activity_id, sa.name as activity_name,
               SUM(dp.today_value) as today_value,
               SUM(dp.cumulative_value) as cumulative_value
        FROM dpr_daily_progress dp
        JOIN solar_activities sa ON dp.activity_object_id = sa.object_id
        WHERE {base_filter} AND dp.progress_date = $2
        GROUP BY sa.activity_id, sa.name
    """, *params_from)

    to_rows = await pool.fetch(f"""
        SELECT sa.activity_id, sa.name as activity_name,
               SUM(dp.today_value) as today_value,
               SUM(dp.cumulative_value) as cumulative_value
        FROM dpr_daily_progress dp
        JOIN solar_activities sa ON dp.activity_object_id = sa.object_id
        WHERE {base_filter} AND dp.progress_date = $2
        GROUP BY sa.activity_id, sa.name
    """, *params_to)

    from_map = {r["activity_id"]: dict(r) for r in from_rows}
    to_map = {r["activity_id"]: dict(r) for r in to_rows}
    
    all_ids = set(from_map.keys()) | set(to_map.keys())
    result = []
    for aid in sorted(all_ids):
        f = from_map.get(aid, {})
        t = to_map.get(aid, {})
        f_cum = float(f.get("cumulative_value") or 0)
        t_cum = float(t.get("cumulative_value") or 0)
        result.append({
            "activity_id": aid,
            "activity_name": f.get("activity_name") or t.get("activity_name") or aid,
            "from_cumulative": f_cum,
            "to_cumulative": t_cum,
            "variance": round(t_cum - f_cum, 2),
            "from_today": float(f.get("today_value") or 0),
            "to_today": float(t.get("today_value") or 0),
        })
    return result


@router.get("/push-analytics/{project_id}")
async def get_push_analytics(
    project_id: str,
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(get_current_user),
):
    """Aggregated analytics for P6 pushes."""
    project_oid = await resolve_project_id(project_id, pool)

    # Push timeline (last 30 days)
    timeline = await pool.fetch("""
        SELECT pushed_at::date as push_date, COUNT(*) as push_count
        FROM dpr_supervisor_entries
        WHERE project_id = $1 AND pushed_at IS NOT NULL
          AND pushed_at >= CURRENT_DATE - INTERVAL '30 days'
        GROUP BY 1 ORDER BY 1
    """, project_oid)

    # Sheet breakdown
    breakdown = await pool.fetch("""
        SELECT sheet_type, COUNT(*) as total_pushed, MAX(pushed_at) as last_pushed
        FROM dpr_supervisor_entries
        WHERE project_id = $1 AND status = 'final_approved' AND pushed_at IS NOT NULL
        GROUP BY sheet_type ORDER BY total_pushed DESC
    """, project_oid)

    # Cumulative progress trend (daily progress sum over last 30 days)
    progress_trend = await pool.fetch("""
        SELECT dp.progress_date, SUM(dp.cumulative_value) as total_cumulative,
               COUNT(DISTINCT dp.activity_object_id) as activity_count
        FROM dpr_daily_progress dp
        JOIN solar_activities sa ON dp.activity_object_id = sa.object_id
        WHERE sa.project_object_id = $1
          AND dp.progress_date >= CURRENT_DATE - INTERVAL '30 days'
        GROUP BY dp.progress_date ORDER BY dp.progress_date
    """, project_oid)

    # Success rate from push_audit
    rate = await pool.fetchrow("""
        SELECT 
            COUNT(*) FILTER (WHERE pa.push_status = 'success') as success,
            COUNT(*) FILTER (WHERE pa.push_status = 'failed') as failed,
            COUNT(*) FILTER (WHERE pa.push_status NOT IN ('success','failed')) as skipped
        FROM push_audit pa
        JOIN dpr_supervisor_entries e ON pa.entry_id = e.id
        WHERE e.project_id = $1
    """, project_oid)

    return {
        "push_timeline": [{"date": str(r["push_date"]), "count": int(r["push_count"])} for r in timeline],
        "sheet_breakdown": [{"sheet_type": r["sheet_type"], "total_pushed": int(r["total_pushed"]), "last_pushed": r["last_pushed"].isoformat() if r["last_pushed"] else None} for r in breakdown],
        "cumulative_progress": [{"date": str(r["progress_date"]), "total_cumulative": float(r["total_cumulative"] or 0), "activity_count": int(r["activity_count"])} for r in progress_trend],
        "success_rate": {"success": int(rate["success"] or 0), "failed": int(rate["failed"] or 0), "skipped": int(rate["skipped"] or 0)} if rate else {"success": 0, "failed": 0, "skipped": 0}
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
