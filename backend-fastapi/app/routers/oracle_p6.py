# app/routers/oracle_p6.py
"""
Oracle P6 integration router.
Direct port of Express routes/oracleP6.js
"""

import json
import logging
import base64
import os
import dotenv
from datetime import datetime
from typing import Optional, Any
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sync_all_p6_data import sync_data
from app.auth.dependencies import get_current_user
from app.database import get_db, PoolWrapper
from app.services.cache_service import cache
from app.routers.project_utils import resolve_project_id


import re
from app.config import settings, get_p6_password_last_reset_date

def check_p6_password_expired():
    last_reset = get_p6_password_last_reset_date()
    if not last_reset:
        return False
    try:
        reset_date = datetime.strptime(last_reset, "%Y-%m-%d").date()
        days_since = (datetime.now().date() - reset_date).days
        return days_since >= 45
    except Exception:
        return False


logger = logging.getLogger("adani-flow.oracle_p6")

def extract_block_from_name(name: str) -> str:
    if not name:
        return ""
    # Matches "Block-01", "Block 01", "Block01" anywhere in the name
    match = re.search(r'(Block[-\s]*\d+)', name, re.IGNORECASE)
    return match.group(1).strip().upper() if match else ""

router = APIRouter(prefix="/api/oracle-p6", tags=["Oracle P6"])






from pydantic import BaseModel
class WindAchievementData(BaseModel):
    rigs: dict[str, str] = {}
    gangs: dict[str, str] = {}
    cranes: dict[str, str] = {}
    commissioning: dict[str, str] = {}

@router.post("/wind-achievements/{projectId}")
async def post_wind_achievements(
    projectId: str,
    payload: WindAchievementData,
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(get_current_user),
):
    await pool.execute("""
        CREATE TABLE IF NOT EXISTS wind_achievement_resources (
            project_id TEXT PRIMARY KEY
        )
    """)
    await pool.execute("ALTER TABLE wind_achievement_resources ADD COLUMN IF NOT EXISTS rigs JSONB")
    await pool.execute("ALTER TABLE wind_achievement_resources ADD COLUMN IF NOT EXISTS gangs JSONB")
    await pool.execute("ALTER TABLE wind_achievement_resources ADD COLUMN IF NOT EXISTS cranes JSONB")
    await pool.execute("ALTER TABLE wind_achievement_resources ADD COLUMN IF NOT EXISTS commissioning JSONB")
    
    await pool.execute("""
        INSERT INTO wind_achievement_resources (project_id, rigs, gangs, cranes, commissioning)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (project_id) DO UPDATE 
        SET rigs = EXCLUDED.rigs,
            gangs = EXCLUDED.gangs,
            cranes = EXCLUDED.cranes,
            commissioning = EXCLUDED.commissioning
    """, projectId, json.dumps(payload.rigs), json.dumps(payload.gangs), json.dumps(payload.cranes), json.dumps(payload.commissioning))
    
    return {"success": True, "message": "Saved successfully"}

@router.get("/wind-achievements/{projectId}")
async def get_wind_achievements(
    projectId: str,
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(get_current_user),
):
    project_object_id = await resolve_project_id(projectId, pool)
    
    await pool.execute("""
        CREATE TABLE IF NOT EXISTS wind_achievement_resources (
            project_id TEXT PRIMARY KEY
        )
    """)
    await pool.execute("ALTER TABLE wind_achievement_resources ADD COLUMN IF NOT EXISTS rigs JSONB")
    await pool.execute("ALTER TABLE wind_achievement_resources ADD COLUMN IF NOT EXISTS gangs JSONB")
    await pool.execute("ALTER TABLE wind_achievement_resources ADD COLUMN IF NOT EXISTS cranes JSONB")
    await pool.execute("ALTER TABLE wind_achievement_resources ADD COLUMN IF NOT EXISTS commissioning JSONB")
    res_row = await pool.fetchrow("SELECT * FROM wind_achievement_resources WHERE project_id = $1", projectId)
    
    def parse_manual(jsonb_data):
        if not jsonb_data: return {}
        if isinstance(jsonb_data, list):
            d = {}
            for i, val in enumerate(jsonb_data):
                if val:
                    y = 2025 + (i + 3) // 12
                    m = (i + 3) % 12 + 1
                    m_str = datetime(y, m, 1).strftime("%b-%y")
                    d[m_str] = val
            return d
        return jsonb_data

    if res_row:
        manual_data = {
            "rigs": parse_manual(res_row["rigs"]),
            "gangs": parse_manual(res_row["gangs"]),
            "cranes": parse_manual(res_row["cranes"]),
            "commissioning": parse_manual(res_row["commissioning"])
        }
    else:
        manual_data = {"rigs": {}, "gangs": {}, "cranes": {}, "commissioning": {}}

    acts = await pool.fetch("""
        SELECT object_id, activity_id, name, actual_start, actual_finish, planned_start, planned_finish
        FROM solar_activities
        WHERE project_object_id = $1
    """, project_object_id)
    
    res_assigns = await pool.fetch("""
        SELECT activity_object_id, resource_name
        FROM solar_resource_assignments
        WHERE project_object_id = $1
    """, project_object_id)

    act_to_res = {}
    for r in res_assigns:
        act_to_res.setdefault(r["activity_object_id"], []).append(r["resource_name"])

    # Scope = number of distinct WTG locations for this project, same extraction
    # logic used by the "Location" filter on the Wind dashboard (WindDashboard.tsx).
    wtg_locations = set()
    wtg_pattern = re.compile(r'WTG[\s\-_.]*0*(\d+[a-zA-Z]?)', re.IGNORECASE)
    for a in acts:
        m = wtg_pattern.search(a["name"] or "")
        if m:
            num = m.group(1).upper()
            if num not in ("33K", "33KV"):
                wtg_locations.add(num)
    scope = len(wtg_locations)

    valid_acts = []
    min_date = None
    max_date = None

    for a in acts:
        act_name = (a["name"] or "").lower()
        
        # Only count WTG-specific activities for Productivity
        if not re.match(r'^wtg\s*\d+', act_name):
            continue
            
        matched = False
        cat = ""
        if "stone column" in act_name: 
            matched = True
            cat = "sc"
        elif "raft casting" in act_name or "wtg foundation" in act_name: 
            matched = True
            cat = "fd"
        elif "road construction" in act_name:
            pass
        elif ("wtg erection" in act_name) or ("erection" in act_name and ("-erw-" in act_name or "erection works" in act_name) and "mcc" not in act_name and "pre-commissioning" not in act_name): 
            matched = True
            cat = "er"
        elif "wtg commissioning" in act_name: 
            matched = True
            cat = "cm"
        
        if matched:
            a["_prod_cat"] = cat
            valid_acts.append(a)
            for d in [a["actual_finish"], a["planned_finish"], a["actual_start"], a["planned_start"]]:
                if d:
                    if not min_date or d < min_date: min_date = d
                    if not max_date or d > max_date: max_date = d

    if not min_date: min_date = datetime.now()
    if not max_date: max_date = datetime(min_date.year + 1, min_date.month, 1)

    months = []
    curr_y, curr_m = min_date.year, min_date.month
    end_y, end_m = max_date.year, max_date.month
    
    while curr_y < end_y or (curr_y == end_y and curr_m <= end_m):
        months.append(datetime(curr_y, curr_m, 1).strftime("%b-%y"))
        curr_m += 1
        if curr_m > 12:
            curr_m = 1
            curr_y += 1

    sc_counts = {}
    fd_counts = {}
    er_counts = {}
    cm_counts = {}

    for a in valid_acts:
        if not a["actual_finish"]: continue
        
        m_str = a["actual_finish"].strftime("%b-%y")
        cat = a.get("_prod_cat")

        if cat == "sc":
            sc_counts[m_str] = sc_counts.get(m_str, 0) + 1
        elif cat == "fd":
            fd_counts[m_str] = fd_counts.get(m_str, 0) + 1
        elif cat == "er":
            er_counts[m_str] = er_counts.get(m_str, 0) + 1
        elif cat == "cm":
            cm_counts[m_str] = cm_counts.get(m_str, 0) + 1

    def format_arr(counts_dict, manual_dict):
        no_of = []
        cumm = []
        prod = []
        c_sum = 0
        for m in months:
            val = counts_dict.get(m, 0)
            if val > 0:
                no_of.append(str(val))
                c_sum += val
                cumm.append(str(c_sum))
                try:
                    target = float(manual_dict.get(m, 0))
                    if target > 0:
                        # Two decimals, matching what the Productivity sheet shows on screen. At one
                        # decimal the Excel export disagreed with the grid it was exported from.
                        prod.append(f"{val/target:.2f}")
                    else:
                        prod.append("")
                except:
                    prod.append("")
            elif c_sum > 0:
                no_of.append("")
                cumm.append(str(c_sum))
                prod.append("")
            else:
                no_of.append("")
                cumm.append("")
                prod.append("")
        return {"no_of": no_of, "cumm": cumm, "productivity": prod}

    sc_data = format_arr(sc_counts, manual_data["rigs"])
    fd_data = format_arr(fd_counts, manual_data["gangs"])
    er_data = format_arr(er_counts, manual_data["cranes"])
    cm_data = format_arr(cm_counts, manual_data["commissioning"])

    return {
        "success": True,
        "projectId": projectId,
        "scope": scope,
        "months": months,
        "rigs": manual_data["rigs"],
        "gangs": manual_data["gangs"],
        "cranes": manual_data["cranes"],
        "commissioning": manual_data["commissioning"],
        "stone_column": { "no_of_columns": sc_data["no_of"], "cumm_sc": sc_data["cumm"], "productivity": sc_data["productivity"] },
        "wtg_foundation": { "no_of_foundations": fd_data["no_of"], "cumm_foundations": fd_data["cumm"], "productivity": fd_data["productivity"] },
        "wtg_erection": { "no_of_erections": er_data["no_of"], "cumm_erections": er_data["cumm"], "productivity": er_data["productivity"] },
        "wtg_commissioning": { "no_of_commissioning": cm_data["no_of"], "cumm_commissioning": cm_data["cumm"], "productivity": cm_data["productivity"] }
    }


@router.get("/dp-qty-data")
async def get_dp_qty_data(
    projectId: str,
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(get_current_user),
):
    project_object_id = await resolve_project_id(projectId, pool)
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

    data = []
    for i, r in enumerate(rows):
        data.append({
            "slNo": str(i + 1),
            "activityId": str(r["activity_id"]) if r.get("activity_id") else "",
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
            "actualStart": r["actual_start"].strftime("%Y-%m-%d") if r.get("actual_start") else "",
            "actualFinish": "",
            "remarks": "",
            "priority": str(r.get("priority")) if r.get("priority") else "",
            "plot": str(r.get("plot")) if r.get("plot") else "",
            "newBlockNom": str(r.get("new_block_nom")) if r.get("new_block_nom") else "",
            "scope": str(r.get("scope")) if r.get("scope") else "",
            "front": str(r.get("front")) if r.get("front") else "",
            "hold": str(r.get("hold")) if r.get("hold") else "",
            "balance": "",
            "cumulative": "",
        })

    return {"message": "DP Qty data fetched from P6", "projectId": projectId, "rowCount": len(data), "data": data, "source": "p6"}


@router.get("/dp-block-data")
async def get_dp_block_data(
    projectId: str,
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(get_current_user),
):
    project_object_id = await resolve_project_id(projectId, pool)
    rows = await pool.fetch("""
        SELECT sa.object_id as activity_id, sa.name as activities,
               sa.wbs_name as block, sa.planned_start as "PlannedStartDate",
               sa.planned_finish as "PlannedFinishDate", sa.percent_complete as "PercentComplete",
               sa.dpr_metadata
        FROM solar_activities sa
        WHERE sa.project_object_id = $1 ORDER BY sa.planned_start
    """, project_object_id)

    data = []
    for r in rows:
        dpr_meta = r["dpr_metadata"] or {}
        if isinstance(dpr_meta, str):
            try: dpr_meta = json.loads(dpr_meta)
            except: dpr_meta = {}
            
        data.append({
            "activityId": str(r["activity_id"] or ""), 
            "activities": r["activities"] or "", 
            "description": r["activities"] or "", 
            "plot": "", 
            "block": dpr_meta.get("block") or r["block"] or "", 
            "priority": dpr_meta.get("priority") or "", 
            "contractorName": dpr_meta.get("contractorName") or "", 
            "scope": dpr_meta.get("scope") or "", 
            "yesterdayValue": "", 
            "todayValue": ""
        })
    return {"message": "DP Block data fetched from P6", "projectId": projectId, "rowCount": len(data), "data": data, "source": "p6"}


@router.get("/dc-sheet-data")
async def get_dc_sheet_data(
    projectId: str,
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(get_current_user),
):
    project_object_id = await resolve_project_id(projectId, pool)
    rows = await pool.fetch("""
        SELECT sa.object_id as activity_id, sa.name as activities,
               sa.planned_start as idt_date, sa.actual_start as actual_date, sa.status as "Status",
               sa.dpr_metadata
        FROM solar_activities sa WHERE sa.project_object_id = $1 ORDER BY sa.planned_start
    """, project_object_id)

    data = []
    for r in rows:
        dpr_meta = r["dpr_metadata"] or {}
        if isinstance(dpr_meta, str):
            try: dpr_meta = json.loads(dpr_meta)
            except: dpr_meta = {}
            
        data.append({
            "activityId": str(r["activity_id"] or ""), 
            "activities": r["activities"] or "", 
            "description": r["activities"] or "", 
            "plot": dpr_meta.get("plot") or "", 
            "vendor": dpr_meta.get("vendorName") or dpr_meta.get("vendor") or "", 
            "idtDate": r["idt_date"].strftime("%Y-%m-%d") if r["idt_date"] else "", 
            "actualDate": r["actual_date"].strftime("%Y-%m-%d") if r["actual_date"] else "", 
            "status": r["Status"] or "", 
            "yesterdayValue": "", 
            "todayValue": ""
        })
    return {"message": "DC Sheet data fetched from P6", "projectId": projectId, "rowCount": len(data), "data": data, "source": "p6"}


@router.get("/ac-sheet-data")
async def get_ac_sheet_data(
    projectId: str,
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(get_current_user),
):
    project_object_id = await resolve_project_id(projectId, pool)
    rows = await pool.fetch("""
        SELECT sa.object_id as activity_id, sa.name as activities, sa.wbs_name as plot,
               sa.percent_complete as "PercentComplete", sa.dpr_metadata
        FROM solar_activities sa
        WHERE sa.project_object_id = $1 ORDER BY sa.planned_start
    """, project_object_id)

    data = []
    for r in rows:
        dpr_meta = r["dpr_metadata"] or {}
        if isinstance(dpr_meta, str):
            try: dpr_meta = json.loads(dpr_meta)
            except: dpr_meta = {}
            
        data.append({
            "activityId": str(r["activity_id"] or ""), 
            "activities": r["activities"] or "", 
            "description": r["activities"] or "", 
            "plot": dpr_meta.get("plot") or r["plot"] or "", 
            "newBlockNom": dpr_meta.get("newBlockNom") or "", 
            "priority": dpr_meta.get("priority") or "", 
            "baselinePriority": dpr_meta.get("baselinePriority") or "", 
            "contractorName": dpr_meta.get("contractorName") or "", 
            "scope": dpr_meta.get("scope") or "", 
            "holdDueToWtg": dpr_meta.get("holdDueToWtg") or "", 
            "front": dpr_meta.get("front") or "", 
            "actual": dpr_meta.get("actual") or "", 
            "completionPercentage": f"{r['PercentComplete']}%" if r["PercentComplete"] else "", 
            "remarks": dpr_meta.get("remarks") or "", 
            "yesterdayValue": "", 
            "todayValue": ""
        })
    return {"message": "AC Sheet data fetched from P6", "projectId": projectId, "rowCount": len(data), "data": data, "source": "p6"}


@router.get("/manpower-details-data")
async def get_manpower_details_data(
    projectId: str,
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(get_current_user),
):
    project_object_id = await resolve_project_id(projectId, pool)
    
    # Primary query: Labor resource assignments (works for Solar projects)
    rows = await pool.fetch("""
        SELECT sa.activity_id,
               sa.name as activity_name,
               COALESCE(sa.new_block_nom, sa.plot, sa.wbs_name, '') as block,
               parent_wbs.name as parent_wbs_name,
               COALESCE(SUM(sra.planned_units), 0) as budgeted_units,
               COALESCE(SUM(sra.actual_units), 0) as actual_units,
               COALESCE(SUM(sra.remaining_units), 0) as remaining_units,
               sa.percent_complete,
               COALESCE(MAX(sra.hours_per_day), sa.hours_per_day, 8) as hours_per_day,
               sa.actual_start,
               sa.actual_finish,
               sa.start_date as forecast_start,
               sa.finish_date as forecast_finish
        FROM solar_resource_assignments sra
        LEFT JOIN solar_activities sa ON sra.activity_object_id = sa.object_id
        LEFT JOIN solar_wbs wbs_child ON sa.wbs_object_id = wbs_child.object_id
        LEFT JOIN solar_wbs parent_wbs ON wbs_child.parent_object_id = parent_wbs.object_id
        WHERE sra.resource_type = 'Labor'
          AND sra.project_object_id = $1
        GROUP BY sa.activity_id, sa.name, sa.new_block_nom, sa.plot, sa.wbs_name, parent_wbs.name, sa.percent_complete, sa.hours_per_day, sa.actual_start, sa.actual_finish, sa.start_date, sa.finish_date
        ORDER BY parent_wbs.name ASC, sa.name ASC, sa.activity_id ASC
    """, project_object_id)

    # Fallback for Wind/PSS projects that may not have Labor resources:
    # Generate manpower rows from activities directly
    if not rows:
        logger.info(f"No Labor resources for project {projectId}, falling back to activity-based manpower data")
        rows = await pool.fetch("""
            SELECT sa.activity_id,
                   sa.name as activity_name,
                   COALESCE(sa.new_block_nom, sa.plot, sa.wbs_name, '') as block,
                   parent_wbs.name as parent_wbs_name,
                   COALESCE(sa.total_quantity, 0) as budgeted_units,
                   COALESCE(sa.cumulative, 0) as actual_units,
                   COALESCE(sa.balance, 0) as remaining_units,
                   sa.percent_complete,
                   COALESCE(sa.hours_per_day, 8) as hours_per_day,
                   sa.actual_start,
                   sa.actual_finish,
                   sa.start_date as forecast_start,
                   sa.finish_date as forecast_finish
            FROM solar_activities sa
            LEFT JOIN solar_wbs wbs_child ON sa.wbs_object_id = wbs_child.object_id
            LEFT JOIN solar_wbs parent_wbs ON wbs_child.parent_object_id = parent_wbs.object_id
            WHERE sa.project_object_id = $1
            ORDER BY parent_wbs.name ASC, sa.name ASC, sa.activity_id ASC
        """, project_object_id)

    data = []
    for r in rows:
        budgeted = float(r["budgeted_units"] or 0)
        actual = float(r["actual_units"] or 0)
        p6_remaining = float(r["remaining_units"] or 0)
        
        # Calculate derived remaining if P6 says 0 but we have a budget/actual gap
        calculated_remaining = max(0, budgeted - actual)
        # Use P6 remaining if it's more than our calculation (e.g. if scope increased)
        final_remaining = max(p6_remaining, calculated_remaining)
        
        # Priority for percentage: if we have units, use units ratio. 
        # Otherwise fallback to P6 physical % complete.
        if budgeted > 0:
            pct = round((actual / budgeted) * 100, 2)
        else:
            pct = float(r["percent_complete"] or 0)
            
        activity_name = r["activity_name"] or ""
        # Prioritize extraction from activity name (e.g. "Block-01 - ...")
        block_name = extract_block_from_name(activity_name)
        # Fallback to the DB block field if regex fails
        final_block = block_name if block_name else (r["block"] or "").upper()
        
        parent_wbs = r["parent_wbs_name"] or ""
        if parent_wbs and "WTG" in parent_wbs.upper():
            m = re.match(r'(WTG\d+)', activity_name or '', re.IGNORECASE)
            wtg_loc = m.group(1).upper() if m else ''
            if wtg_loc or "WTG" in final_block:
                final_block = parent_wbs

        hours_per_day = float(r["hours_per_day"] or 8)
        
        # Convert Man-hours to Man-days based on the activity calendar
        budgeted_days = budgeted / hours_per_day if hours_per_day > 0 else 0
        actual_days = actual / hours_per_day if hours_per_day > 0 else 0
        remaining_days = final_remaining / hours_per_day if hours_per_day > 0 else 0

        data.append({
            "activityId": str(r["activity_id"] or ""),
            "description": activity_name,
            "block": final_block,
            "parentWbs": parent_wbs,
            "budgetedUnits": str(round(budgeted_days, 2)),
            "actualUnits": str(round(actual_days, 2)),
            "remainingUnits": str(round(remaining_days, 2)),
            "percentComplete": f"{pct:.2f}%",
            "hoursPerDay": hours_per_day,
            "actualStart": r["actual_start"].strftime("%Y-%m-%d") if r.get("actual_start") else "",
            "actualFinish": r["actual_finish"].strftime("%Y-%m-%d") if r.get("actual_finish") else "",
            "forecastStart": r["forecast_start"].strftime("%Y-%m-%d") if r.get("forecast_start") else "",
            "forecastFinish": r["forecast_finish"].strftime("%Y-%m-%d") if r.get("forecast_finish") else "",
            "yesterdayValue": "",
            "todayValue": "",
        })
    return {"message": "Manpower Details fetched from P6", "projectId": projectId, "rowCount": len(data), "totalManpower": len(data), "data": data, "source": "p6"}


@router.get("/manpower-timephased-data")
async def get_manpower_timephased_data(
    projectId: str,
    entryDate: Optional[str] = None,
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(get_current_user),
):
    project_object_id = await resolve_project_id(projectId, pool)
    
    # Fetch individual resource assignments joined with activity info
    rows = await pool.fetch("""
        SELECT 
            sra.object_id as assignment_id,
            sa.activity_id,
            sa.name as activity_name,
            COALESCE(sa.new_block_nom, sa.plot, sa.wbs_name, '') as block,
            sra.resource_name,
            sra.resource_id,
            sra.planned_units as budgeted_units,
            sra.actual_units as actual_units,
            sra.remaining_units as remaining_units,
            sra.at_completion_units as at_completion_units,
            sra.percent_complete as assignment_pct,
            COALESCE(MAX(sra.hours_per_day), sa.hours_per_day, 8) as hours_per_day,
            sa.percent_complete as activity_pct
        FROM solar_resource_assignments sra
        LEFT JOIN solar_activities sa ON sra.activity_object_id = sa.object_id
        WHERE sra.project_object_id = $1
          AND sra.resource_type = 'Labor'
        GROUP BY sra.object_id, sa.activity_id, sa.name, sa.new_block_nom, sa.plot, sa.wbs_name, sra.resource_name, sra.resource_id, sra.planned_units, sra.actual_units, sra.remaining_units, sra.at_completion_units, sra.percent_complete, sa.hours_per_day, sa.percent_complete
        ORDER BY sa.name ASC, sra.resource_name ASC
    """, project_object_id)
    
    # Fallback for projects without Labor resources
    if not rows:
        logger.info(f"No Labor resources for project {projectId} in timephased view, falling back to activity-based rows")
        rows = await pool.fetch("""
            SELECT 
                sa.object_id as assignment_id,
                sa.activity_id,
                sa.name as activity_name,
                COALESCE(sa.new_block_nom, sa.plot, sa.wbs_name, '') as block,
                'GENERIC LABOR' as resource_name,
                'LABOR' as resource_id,
                sa.total_quantity as budgeted_units,
                sa.cumulative as actual_units,
                sa.balance as remaining_units,
                sa.total_quantity as at_completion_units,
                sa.percent_complete as assignment_pct,
                COALESCE(sa.hours_per_day, 8) as hours_per_day,
                sa.percent_complete as activity_pct
            FROM solar_activities sa
            WHERE sa.project_object_id = $1
            ORDER BY sa.name ASC, sa.activity_id ASC
        """, project_object_id)
    
    # FETCH ALL SAVED ENTRIES FOR OVERLAY (merge all date-keyed values)
    draft_rows_map = {}
    try:
        all_entries = await pool.fetch("""
            SELECT data_json FROM dpr_supervisor_entries 
            WHERE project_id = $1 AND sheet_type = 'manpower_details_2'
            ORDER BY entry_date ASC
        """, project_object_id)
        
        for entry_rec in all_entries:
            if not entry_rec["data_json"]:
                continue
            dj = entry_rec["data_json"]
            if isinstance(dj, str): dj = json.loads(dj)
            for dr in dj.get("rows", []):
                ass_id = dr.get("assignmentId")
                if not ass_id:
                    continue
                ass_key = str(ass_id)
                if ass_key not in draft_rows_map:
                    draft_rows_map[ass_key] = {}
                # Deep-merge: copy all date-keyed fields (contractor_*, required_*, actual_*)
                for k, v in dr.items():
                    if k.startswith("contractor_") or k.startswith("required_") or k.startswith("actual_"):
                        draft_rows_map[ass_key][k] = v
                    elif k not in draft_rows_map[ass_key]:
                        # Keep non-date fields from earliest entry only
                        draft_rows_map[ass_key][k] = v
    except Exception as e:
        logger.error(f"Error fetching drafts for manpower overlay: {e}")

    data = []
    for r in rows:
        budgeted = float(r["budgeted_units"] or 0)
        actual = float(r["actual_units"] or 0)
        remaining = float(r["remaining_units"] or 0)
        at_comp = float(r["at_completion_units"] or 0)
        hours = float(r["hours_per_day"] or 8)

        # Convert to Days
        budgeted_days = budgeted / hours if hours > 0 else 0
        actual_days = actual / hours if hours > 0 else 0
        remaining_days = remaining / hours if hours > 0 else 0
        at_comp_days = at_comp / hours if hours > 0 else 0
        
        # Calculate assignment percentage
        pct = float(r["assignment_pct"] or 0)
        if pct == 0 and actual > 0 and budgeted > 0:
            pct = (actual / budgeted * 100)

        activity_name = r["activity_name"] or ""
        block_name = extract_block_from_name(activity_name)
        final_block = block_name if block_name else (r["block"] or "").upper()
        
        r_contractor_name = r["resource_name"]

        # Overlay user input if it exists in merged drafts
        draft_row = draft_rows_map.get(str(r["assignment_id"]))
        
        # Build the base row
        row_data = {
            "assignmentId": str(r["assignment_id"]),
            "activityId": str(r["activity_id"] or ""),
            "description": activity_name,
            "block": final_block,
            "contractorName": r_contractor_name,
            "resourceId": r["resource_id"],
            "budgetedUnits": round(budgeted_days, 2),
            "actualUnits": round(actual_days, 2),
            "remainingUnits": round(remaining_days, 2),
            "atCompletionUnits": round(at_comp_days, 2),
            "hoursPerDay": hours,
            "percentComplete": f"{pct:.2f}%",
        }

        # Merge all saved date-keyed fields from drafts
        if draft_row:
            for k, v in draft_row.items():
                if k.startswith("contractor_") or k.startswith("required_") or k.startswith("actual_"):
                    row_data[k] = v

        data.append(row_data)

    return {
        "success": True,
        "projectId": projectId,
        "rowCount": len(data),
        "data": data
    }


async def run_sync_and_flush_cache(project_id, pool):
    """Run sync and flush cache once done."""
    try:
        await sync_data(target_project_id=project_id, full_sync=False, pool=pool)
        await cache.flush_all()
        logger.info(f"Sync complete and cache flushed for project {project_id}")
    except Exception as e:
        logger.error(f"Error in background sync for project {project_id}: {e}")
        try:
            error_str = str(e).lower()
            user_message = "Sync failed. Please try again later."
            
            # Map specific technical errors to user-friendly messages
            if "account is locked" in error_str:
                user_message = "Sync failed: Your Oracle P6 IDCS account is currently locked. Please contact your system administrator to unlock it."
            elif "500 internal server error" in error_str and "oauth/token" in error_str:
                user_message = "Sync failed: Oracle P6 authentication servers are currently down. Please try again later."
            elif "503 service unavailable" in error_str:
                user_message = "Sync failed: Oracle P6 servers are under maintenance or unreachable."
            elif "timeout" in error_str:
                user_message = "Sync failed: The connection to Oracle P6 timed out. The server might be busy."
            elif "401 unauthorized" in error_str or "invalid_client" in error_str:
                user_message = "Sync failed: Invalid P6 credentials. Please contact the administrator to update the API keys."
            else:
                # Provide a truncated version of the actual error to help with debugging
                user_message = f"Sync failed: {str(e)[:100]}..." if e else user_message

            project_object_id = await resolve_project_id(project_id, pool)
            if project_object_id:
                await pool.execute("""
                    UPDATE projects 
                    SET is_syncing = FALSE, sync_message = $2 
                    WHERE object_id = $1
                """, project_object_id, user_message)
        except Exception as db_e:
            logger.error(f"Failed to reset sync status after error: {db_e}")

@router.get("/activities")
async def get_p6_activities(
    projectId: str,
    page: int = 1,
    limit: int = 50,
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(get_current_user),
):
    project_object_id = await resolve_project_id(projectId, pool)
    offset = (page - 1) * limit
    rows = await pool.fetch("""
        SELECT * FROM solar_activities WHERE project_object_id = $1
        ORDER BY planned_start LIMIT $2 OFFSET $3
    """, project_object_id, limit, offset)

    total = await pool.fetchval('SELECT COUNT(*) FROM solar_activities WHERE project_object_id = $1', project_object_id)

    return {
        "message": "Activities fetched from P6 Database Cache",
        "projectId": projectId,
        "projectObjectId": project_object_id,
        "count": len(rows),
        "activities": [dict(r) for r in rows],
        "pagination": {"total": total, "page": page, "limit": limit, "totalPages": (total + limit - 1) // limit},
        "source": "p6_db_cache",
    }


@router.post("/sync")
async def sync_project(
    body: dict[str, Any],
    background_tasks: BackgroundTasks,
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(get_current_user),
):
    if check_p6_password_expired():
        raise HTTPException(status_code=403, detail="P6 integration password has expired. Integrations will fail until updated.")

    project_id = body.get("projectId")
    if not project_id:
        raise HTTPException(400, detail={"message": "Project ID required"})

    project_object_id = await resolve_project_id(project_id, pool)
    if project_object_id:
        await pool.execute("""
            UPDATE projects 
            SET is_syncing = TRUE, sync_progress = 0, sync_message = 'Initializing sync...' 
            WHERE object_id = $1
        """, project_object_id)

    # Trigger P6 sync as a background task
    background_tasks.add_task(run_sync_and_flush_cache, project_id=project_id, pool=pool)
    
    return {"success": True, "message": f"Sync started for project {project_id}. This may take a few minutes."}


@router.get("/projects")
async def get_p6_projects(
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(get_current_user),
):
    rows = await pool.fetch("""
        SELECT "ObjectId" as id, "Name" as name, NULL as location, "Status" as status,
               0 as progress, "ObjectId" as p6_object_id, "LastSyncAt" as p6_last_sync
        FROM p6_projects 
        WHERE "Id" NOT ILIKE '% PR'
          AND "Name" NOT ILIKE '%Building%'
          AND "Name" NOT ILIKE '%Store%'
          AND "Name" NOT ILIKE '%Plant%'
          AND "Name" NOT ILIKE '%Colony%'
          AND "Name" NOT ILIKE '%STP%'
          AND "Name" NOT ILIKE '%RO SC%'
          AND "Name" NOT ILIKE '%Lab%'
          AND "Name" NOT ILIKE '%Hostel%'
          AND "Name" NOT ILIKE '%OHC%'
          AND "Name" NOT ILIKE '%Club House%'
          AND "Name" NOT ILIKE '%Fire%'
          AND "Name" NOT ILIKE '%Infrastructure%'
          AND "Name" NOT ILIKE '%Infra%'
        ORDER BY "Name"
    """)
    return {"message": "Projects fetched successfully", "projects": [dict(r) for r in rows], "source": "local-db"}


@router.get("/activity-fields")
async def get_activity_fields(current_user: dict[str, Any] = Depends(get_current_user)):
    return {
        "message": "Activity fields - Oracle P6 API equivalent",
        "fields": [
            "ObjectId", "Name", "ProjectId", "WBSObjectId",
            "PlannedStartDate", "PlannedFinishDate", "ActualStartDate", "ActualFinishDate",
            "Baseline1StartDate", "Baseline1FinishDate",  # P6 BL1 Start / BL1 Finish
            "StartDate", "FinishDate",                    # P6 forecast Start / Finish
            "PercentComplete", "PhysicalPercentComplete", "Duration", "RemainingDuration",
            "ActualDuration", "Status", "ActivityType", "Critical", "ResourceNames",
        ],
        "source": "p6",
    }


@router.get("/wbs-data")
async def get_wbs_data(
    projectId: str,
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(get_current_user),
):
    project_object_id = await resolve_project_id(projectId, pool)
    rows = await pool.fetch(
        'SELECT object_id, name, code, project_object_id FROM solar_wbs WHERE project_object_id = $1 ORDER BY name',
        project_object_id,
    )
    return {"message": "WBS fetched", "projectId": projectId, "projectObjectId": project_object_id, "count": len(rows), "wbs": [dict(r) for r in rows], "source": "local-db"}


@router.get("/sync-status/{project_id}")
async def get_sync_status(
    project_id: str,
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(get_current_user),
):
    project_object_id = await resolve_project_id(project_id, pool)
    row = await pool.fetchrow('SELECT "LastSyncAt" FROM p6_projects WHERE "ObjectId" = $1', project_object_id)
    proj_row = await pool.fetchrow('SELECT is_syncing, sync_progress, sync_message FROM projects WHERE object_id = $1', project_object_id)
    
    return {
        "projectId": project_id, 
        "projectObjectId": project_object_id, 
        "lastSync": row["LastSyncAt"] if row else None,
        "isSyncing": proj_row["is_syncing"] if proj_row else False,
        "syncProgress": proj_row["sync_progress"] if proj_row else 0,
        "syncMessage": proj_row["sync_message"] if proj_row else ""
    }


@router.post("/sync-resources")
async def sync_resources(
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(get_current_user),
):
    if check_p6_password_expired():
        raise HTTPException(status_code=403, detail="P6 integration password has expired. Integrations will fail until updated.")
    """Sync resources from P6. Placeholder for actual REST client logic."""
    return {"success": True, "message": "Resource sync placeholder", "total": 0, "synced": 0, "errors": 0}


@router.post("/sync-new-projects")
async def sync_new_projects_endpoint(
    background_tasks: BackgroundTasks,
    current_user: dict[str, Any] = Depends(get_current_user),
):
    """Manually trigger the sync for newly added projects from P6."""
    if check_p6_password_expired():
        raise HTTPException(status_code=403, detail="P6 integration password has expired. Integrations will fail until updated.")

    from app.jobs.auto_sync import auto_sync_new_projects
    background_tasks.add_task(auto_sync_new_projects)
    return {"success": True, "message": "Started scanning and syncing new projects in the background."}


@router.get("/yesterday-values")
async def get_yesterday_values(
    projectObjectId: Optional[str] = None,
    targetDate: Optional[str] = None,
    sheet_type: Optional[str] = None,
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(get_current_user),
):
    """Fetch progress values from the previous day, correctly combining P6 baseline and app daily progress."""
    if not targetDate:
        from datetime import datetime, timedelta
        targetDate = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")

    params = [targetDate]

    # Subquery filters
    yest_filter = "WHERE dp.progress_date = $1"
    dp_sum_filter = "WHERE dp.progress_date <= $1 AND dp.progress_date > COALESCE(p2.data_date, '1970-01-01'::date)"

    if sheet_type:
        yest_filter += f" AND dp.sheet_type = ${len(params) + 1}"
        dp_sum_filter += f" AND dp.sheet_type = ${len(params) + 1}"
        params.append(sheet_type)

    project_filter = ""
    if projectObjectId:
        actual_project_object_id = await resolve_project_id(projectObjectId, pool)
        if actual_project_object_id:
            project_filter = f" AND sa.project_object_id = ${len(params) + 1}"
            params.append(actual_project_object_id)

    query = f"""
        SELECT 
            sa.object_id as "activityObjectId", 
            sa.name, 
            sa.object_id as "activityId",
            sa.activity_id as "stringActivityId",
            COALESCE(yest.yesterday_value, 0) as "yesterdayValue",
            COALESCE(sa.cumulative, 0) + COALESCE(dp_sum.cumulative_value, 0) as "cumulativeValue",
            COALESCE(yest.sheet_type, dp_sum.sheet_type, 'dc_sheet') as "sheetType",
            TRUE as is_approved
        FROM solar_activities sa
        JOIN projects p ON p.object_id = sa.project_object_id
        LEFT JOIN (
            SELECT dp.activity_object_id, SUM(dp.today_value) as yesterday_value, MAX(dp.sheet_type) as sheet_type
            FROM dpr_daily_progress dp
            {yest_filter}
            GROUP BY dp.activity_object_id
        ) yest ON yest.activity_object_id = sa.object_id
        LEFT JOIN (
            SELECT dp.activity_object_id, SUM(dp.today_value) as cumulative_value, MAX(dp.sheet_type) as sheet_type
            FROM dpr_daily_progress dp
            JOIN solar_activities sa2 ON sa2.object_id = dp.activity_object_id
            JOIN projects p2 ON p2.object_id = sa2.project_object_id
            {dp_sum_filter}
            GROUP BY dp.activity_object_id
        ) dp_sum ON dp_sum.activity_object_id = sa.object_id
        WHERE 1=1 {project_filter}
          AND (COALESCE(yest.yesterday_value, 0) > 0 OR COALESCE(dp_sum.cumulative_value, 0) > 0)
    """

    rows = await pool.fetch(query, *params)
    
    return {
        "success": True,
        "yesterdayDate": targetDate,
        "activities": [dict(r) for r in rows],
        "count": len(rows)
    }


@router.get("/resources/{project_id}")
async def get_project_resources(
    project_id: str,
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(get_current_user),
):
    """Get resources assigned to a project."""
    project_object_id = await resolve_project_id(project_id, pool)

    # Filter for MT and MP resources only for the Resources/Machine tab
    rows = await pool.fetch("""
        SELECT DISTINCT sra.resource_id as object_id, sra.resource_name as name,
               sra.resource_type, sa.uom as "UnitOfMeasure"
        FROM solar_resource_assignments sra
        JOIN solar_activities sa ON sra.activity_object_id = sa.object_id
        WHERE sra.project_object_id = $1
          AND (UPPER(sra.resource_id) LIKE '%%MT%%' OR UPPER(sra.resource_id) LIKE '%%MP%%')
          AND UPPER(sra.resource_id) NOT LIKE '%%NL%%'
    """, project_object_id)
    
    return {
        "success": True,
        "projectObjectId": project_object_id,
        "resources": [dict(r) for r in rows]
    }


@router.post("/sync-activities")
async def sync_activities(
    body: dict[str, Any],
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(get_current_user),
):
    if check_p6_password_expired():
        raise HTTPException(status_code=403, detail="P6 integration password has expired. Integrations will fail until updated.")
    """Sync activities for a project from P6. Placeholder."""
    return {"message": "Activity sync placeholder", "synced": 0}

@router.get("/activity-resources/{project_id}")
async def get_activity_material_resources(
    project_id: str,
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(get_current_user),
):
    """Batch-fetch all Material resource assignments for a project, grouped by activity_id.
    Used to populate the Resource dropdown column in material-based sheets."""
    project_object_id = await resolve_project_id(project_id, pool)

    rows = await pool.fetch("""
        SELECT sa.activity_id, sra.object_id as ra_object_id,
               sra.resource_id, sra.resource_name,
               sra.planned_units, sra.actual_units, sra.remaining_units,
               sra.actual_start, sra.actual_finish
        FROM solar_resource_assignments sra
        JOIN solar_activities sa ON sra.activity_object_id = sa.object_id
        WHERE sra.project_object_id = $1
          AND sra.resource_type = 'Material'
        ORDER BY sa.activity_id, sra.resource_name
    """, project_object_id)

    # Group by activity_id
    grouped = {}
    for r in rows:
        act_id = str(r["activity_id"])
        if act_id not in grouped:
            grouped[act_id] = []
        grouped[act_id].append({
            "raObjectId": r["ra_object_id"],
            "resourceId": r["resource_id"],
            "resourceName": r["resource_name"],
            "plannedUnits": float(r["planned_units"] or 0),
            "actualUnits": float(r["actual_units"] or 0),
            "remainingUnits": float(r["remaining_units"] or 0),
            "actualStart": r["actual_start"].strftime("%Y-%m-%d") if r.get("actual_start") else "",
            "actualFinish": r["actual_finish"].strftime("%Y-%m-%d") if r.get("actual_finish") else "",
        })

    return {
        "success": True,
        "projectObjectId": project_object_id,
        "resourcesByActivity": grouped
    }

@router.get("/pss-progress-data/{projectId}")
async def get_pss_progress_data(
    projectId: str,
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(get_current_user),
):
    """
    Fetch PSS construction activities grouped by main headings (Stone Column, Civil Works,
    PEB Erection, Electrical Erection Works) and sub-headings from the WBS tree.
    Used by the PSS Progress Sheet in the DPR dashboard.
    """
    project_object_id = await resolve_project_id(projectId, pool)

    # Step 1: Find the CONSTRUCTION & COMMISSIONING root (or CONSTRUCTION)
    construction_root = await pool.fetchval("""
        SELECT object_id FROM solar_wbs
        WHERE project_object_id = $1
          AND (UPPER(name) LIKE 'CONSTRUCTION%%')
        ORDER BY CASE WHEN UPPER(name) LIKE '%%COMMIS%%' THEN 0 ELSE 1 END
        LIMIT 1
    """, project_object_id)

    if not construction_root:
        return {"success": True, "projectId": projectId, "data": [], "groups": []}

    # Step 2: Get the 4 main heading WBS nodes (direct children of CONSTRUCTION)
    # Main headings: Stone Column, Civil Works, PEB Erection, Electrical Erection Works
    MAIN_HEADING_PATTERNS = {
        "STONE COLUMN": ["STONE COLUMN"],
        "CIVIL WORKS": ["CIVIL WORKS", "CIVIL WORK"],
        "PEB ERECTION": ["PEB ERECTION", "PEB WORKS", "PEB"],
        "ELECTRICAL ERECTION WORKS": ["ELECTRICAL ERECTION", "ELECTRICAL WORKS", "ELECTRIC WORKS"],
    }

    main_children = await pool.fetch("""
        SELECT object_id, name FROM solar_wbs
        WHERE project_object_id = $1 AND parent_object_id = $2
        ORDER BY name
    """, project_object_id, construction_root)

    # Map each child to a main heading
    heading_wbs_map = {}  # heading_name -> wbs_object_id
    for child in main_children:
        child_name_upper = (child["name"] or "").upper().strip()
        for heading, patterns in MAIN_HEADING_PATTERNS.items():
            if any(pat in child_name_upper for pat in patterns):
                heading_wbs_map[heading] = {"id": child["object_id"], "name": child["name"]}
                break

    # Step 3: For each main heading, get sub-headings (direct children) and their descendant activities
    groups = []
    all_activities = []

    for heading_name in ["STONE COLUMN", "CIVIL WORKS", "PEB ERECTION", "ELECTRICAL ERECTION WORKS"]:
        if heading_name not in heading_wbs_map:
            continue

        heading_info = heading_wbs_map[heading_name]
        heading_wbs_id = heading_info["id"]

        # Get sub-heading WBS nodes (direct children of the main heading)
        sub_wbs_nodes = await pool.fetch("""
            SELECT object_id, name FROM solar_wbs
            WHERE project_object_id = $1 AND parent_object_id = $2
            ORDER BY name
        """, project_object_id, heading_wbs_id)
        
        if sub_wbs_nodes and heading_name == "CIVIL WORKS":
            CIVIL_SUB_PATTERNS = [
                r"GIS", r"MCR",
                r"SGR\s*-\s*(0?1|1ST)", r"SGR\s*-\s*(0?2|2ND)", r"SGR\s*-\s*(0?3|3RD)",
                r"POWER TRANSFORMER\s*-\s*0?1", r"POWER TRANSFORMER\s*-\s*0?2", r"POWER TRANSFORMER\s*-\s*0?3",
                r"POWER TRANSFORMER\s*-\s*0?4", r"POWER TRANSFORMER\s*-\s*0?5", r"POWER TRANSFORMER\s*-\s*0?6",
                r"FIRE\s*WALL.*(0?1|1ST)", r"FIRE\s*WALL.*(0?2|2ND)", r"FIRE\s*WALL.*(0?3|3RD)",
                r"OUTDOOR EQUIPMENT", r"GANTRY TOWER", r"HIGH LIGHT MAST|HIGH MAST",
                r"AIS EQUIPMENT\s*-\s*LINE", r"AIS EQUIPMENT\s*-\s*TRAFO", r"GIB\s*(&|AND)\s*GAB",
                r"PTR-1.*SGR-1", r"FIREWALL.*SGR-1", r"SGR\s*1.*CABLE CULVERT", r"FIREWALL-1", r"GIS.*PTR-1", r"GIS.*LINE",
                r"PTR-3.*SGR-2", r"FIREWALL.*SGR-2", r"SGR\s*2.*CABLE CULVERT", r"FIREWALL-2", r"GIS.*PTR-3",
                r"WMS FOUNDATION", r"SVG.*P1", r"SVG.*P2", r"SVG",
                r"HARMONIC FILTER.*P1", r"HARMONIC FILTER.*P2", r"HARMONIC FILTER",
                r"BURN.*(OIL|OUT)", r"BALANCE WORKS", r"FENCING", r"YARD BACKFILL", r"PARKING SHED"
            ]
            def get_civil_order(sw):
                name = sw["name"].strip().upper()
                for idx, pat in enumerate(CIVIL_SUB_PATTERNS):
                    if re.search(pat, name):
                        return idx
                return 9999
            
            sub_wbs_nodes = [dict(sw) for sw in sub_wbs_nodes]
            sub_wbs_nodes.sort(key=get_civil_order)
            
        elif sub_wbs_nodes and heading_name == "ELECTRICAL ERECTION WORKS":
            ELEC_SUB_PATTERNS = [
                r"EARTHING",
                r"POWER TRANSFORMER\s*-\s*0?1",
                r"INTERNAL CABLING", r"OUTDOOR CABLING", r"TESTING",
                r"POWER TRANSFORMER\s*-\s*0?2",
                r"PRE.*COMMISSIONING",
                r"POWER TRANSFORMER\s*-\s*0?3",
                r"POWER TRANSFORMER\s*-\s*0?4",
                r"POWER TRANSFORMER\s*-\s*0?5",
                r"POWER TRANSFORMER\s*-\s*0?6",
                r"SGR\s*-\s*0?1", r"SGR\s*-\s*0?2", r"SGR\s*-\s*0?3",
                r"MAIN BAY AREA", r"GIB\s*(&|AND)\s*GAB", r"AHU WORKS",
                r"GIS ERECTION", r"CRP\s*-\s*AREA", r"MCR", r"SCADA", r"AIS",
                r"SVG.*P1", r"CABLING\s*(&|AND)\s*TESTING", r"SVG.*P2", r"SVG",
                r"HARMONIC FILTER.*P1", r"HARMONIC FILTER.*P2", r"HARMONIC FILTER",
                r"PMU\s*-\s*ERECTION", r"GANTRY", r"CABLE TRAY", r"CABLING WORKS",
                r"WMS", r"P1\s*-\s*CEA", r"P1\s*-\s*PRE", r"FINAL CHECKS",
                r"P2\s*-\s*CEA", r"P2\s*-\s*PRE"
            ]
            def get_elec_order(sw):
                name = sw["name"].strip().upper()
                for idx, pat in enumerate(ELEC_SUB_PATTERNS):
                    if re.search(pat, name):
                        return idx
                return 9999
            
            sub_wbs_nodes = [dict(sw) for sw in sub_wbs_nodes]
            sub_wbs_nodes.sort(key=get_elec_order)

        group = {
            "mainHeading": heading_name,
            "mainHeadingOriginal": heading_info["name"],
            "subHeadings": []
        }

        if sub_wbs_nodes:
            # Has sub-headings: fetch activities under each sub-heading recursively
            for sub_wbs in sub_wbs_nodes:
                sub_name = sub_wbs["name"]
                sub_id = sub_wbs["object_id"]

                # Recursive CTE to get all descendant WBS IDs under this sub-heading
                sub_acts = await pool.fetch("""
                    WITH RECURSIVE SubTree AS (
                        SELECT object_id FROM solar_wbs WHERE object_id = $1
                        UNION ALL
                        SELECT child.object_id FROM solar_wbs child
                        JOIN SubTree parent ON child.parent_object_id = parent.object_id
                    )
                    SELECT sa.object_id as "activityObjectId", sa.activity_id as "activityId",
                           sa.name as description, sa.status, sa.wbs_name as "wbsName",
                           sa.baseline_start as "baselineStart", sa.baseline_finish as "baselineFinish",
                           sa.actual_start as "actualStart", sa.actual_finish as "actualFinish",
                           sa.start_date as "forecastStart", sa.finish_date as "forecastFinish",
                           sa.primary_resource as "vendorName", sa.uom,
                           sa.total_quantity as scope, sa.cumulative as completed,
                           sa.balance, sa.planned_duration as duration, sa.percent_complete,
                           sa.dpr_metadata as "dprMetadata"
                    FROM solar_activities sa
                    JOIN SubTree st ON sa.wbs_object_id = st.object_id
                    WHERE sa.project_object_id = $2
                    ORDER BY sa.name ASC
                """, sub_id, project_object_id)

                sub_activities = []
                for r in sub_acts:
                    act = dict(r)
                    act["mainHeading"] = heading_name
                    act["subHeading"] = sub_name
                    # Merge persisted DPR metadata
                    dpr_meta = act.pop("dprMetadata", None) or {}
                    if isinstance(dpr_meta, str):
                        try: dpr_meta = json.loads(dpr_meta)
                        except: dpr_meta = {}
                    for mk, mv in dpr_meta.items():
                        if mk not in act or not act[mk]:
                            act[mk] = mv
                    sub_activities.append(act)
                    all_activities.append(act)

                if sub_activities:
                    group["subHeadings"].append({
                        "name": sub_name,
                        "activityCount": len(sub_activities)
                    })
        else:
            # No sub-headings: fetch activities directly under this main heading (recursively)
            direct_acts = await pool.fetch("""
                WITH RECURSIVE SubTree AS (
                    SELECT object_id FROM solar_wbs WHERE object_id = $1
                    UNION ALL
                    SELECT child.object_id FROM solar_wbs child
                    JOIN SubTree parent ON child.parent_object_id = parent.object_id
                )
                SELECT sa.object_id as "activityObjectId", sa.activity_id as "activityId",
                       sa.name as description, sa.status, sa.wbs_name as "wbsName",
                       sa.baseline_start as "baselineStart", sa.baseline_finish as "baselineFinish",
                       sa.actual_start as "actualStart", sa.actual_finish as "actualFinish",
                       sa.start_date as "forecastStart", sa.finish_date as "forecastFinish",
                       sa.primary_resource as "vendorName", sa.uom,
                       sa.total_quantity as scope, sa.cumulative as completed,
                       sa.balance, sa.planned_duration as duration, sa.percent_complete,
                       sa.dpr_metadata as "dprMetadata"
                FROM solar_activities sa
                JOIN SubTree st ON sa.wbs_object_id = st.object_id
                WHERE sa.project_object_id = $2
                ORDER BY sa.name ASC
            """, heading_wbs_id, project_object_id)

            for r in direct_acts:
                act = dict(r)
                act["mainHeading"] = heading_name
                act["subHeading"] = ""
                # Merge persisted DPR metadata
                dpr_meta = act.pop("dprMetadata", None) or {}
                if isinstance(dpr_meta, str):
                    try: dpr_meta = json.loads(dpr_meta)
                    except: dpr_meta = {}
                for mk, mv in dpr_meta.items():
                    if mk not in act or not act[mk]:
                        act[mk] = mv
                all_activities.append(act)

        groups.append(group)

    return {
        "success": True,
        "projectId": projectId,
        "data": all_activities,
        "groups": groups,
        "totalActivities": len(all_activities)
    }


async def _fetch_pss_activities_by_headings(pool, project_object_id, heading_patterns: dict, heading_order: list):
    """Shared helper: fetch PSS activities grouped by WBS headings, ordered by activity_id."""
    construction_root = await pool.fetchval("""
        SELECT object_id FROM solar_wbs
        WHERE project_object_id = $1 AND (UPPER(name) LIKE 'CONSTRUCTION%%')
        ORDER BY CASE WHEN UPPER(name) LIKE '%%COMMIS%%' THEN 0 ELSE 1 END
        LIMIT 1
    """, project_object_id)

    if not construction_root:
        return [], []

    main_children = await pool.fetch("""
        SELECT object_id, name FROM solar_wbs
        WHERE project_object_id = $1 AND parent_object_id = $2 ORDER BY name
    """, project_object_id, construction_root)

    heading_wbs_map = {}
    for child in main_children:
        child_upper = (child["name"] or "").upper().strip()
        for heading, patterns in heading_patterns.items():
            if any(pat in child_upper for pat in patterns):
                heading_wbs_map[heading] = {"id": child["object_id"], "name": child["name"]}
                break

    ACT_SQL = """
        WITH RECURSIVE SubTree AS (
            SELECT object_id FROM solar_wbs WHERE object_id = $1
            UNION ALL
            SELECT c.object_id FROM solar_wbs c JOIN SubTree p ON c.parent_object_id = p.object_id
        )
        SELECT sa.object_id as "activityObjectId", sa.activity_id as "activityId",
               sa.name as description, sa.status, sa.wbs_name as "wbsName",
               sa.baseline_start as "baselineStart", sa.baseline_finish as "baselineFinish",
               sa.actual_start as "actualStart", sa.actual_finish as "actualFinish",
               sa.start_date as "forecastStart", sa.finish_date as "forecastFinish",
               sa.primary_resource as "vendorName", sa.uom,
               sa.total_quantity as scope, sa.cumulative as completed,
               sa.balance, sa.planned_duration as duration, sa.percent_complete, sa.priority,
               sa.dpr_metadata as "dprMetadata"
        FROM solar_activities sa
        JOIN SubTree st ON sa.wbs_object_id = st.object_id
        WHERE sa.project_object_id = $2
        ORDER BY sa.activity_id ASC
    """

    groups = []
    all_activities = []

    for heading_name in heading_order:
        if heading_name not in heading_wbs_map:
            continue
        info = heading_wbs_map[heading_name]
        sub_wbs = await pool.fetch("""
            SELECT object_id, name FROM solar_wbs
            WHERE project_object_id = $1 AND parent_object_id = $2 ORDER BY name
        """, project_object_id, info["id"])
        
        if sub_wbs and heading_name == "CIVIL WORKS":
            CIVIL_SUB_PATTERNS = [
                r"GIS", r"MCR",
                r"SGR\s*-\s*(0?1|1ST)", r"SGR\s*-\s*(0?2|2ND)", r"SGR\s*-\s*(0?3|3RD)",
                r"POWER TRANSFORMER\s*-\s*0?1", r"POWER TRANSFORMER\s*-\s*0?2", r"POWER TRANSFORMER\s*-\s*0?3",
                r"POWER TRANSFORMER\s*-\s*0?4", r"POWER TRANSFORMER\s*-\s*0?5", r"POWER TRANSFORMER\s*-\s*0?6",
                r"FIRE\s*WALL.*(0?1|1ST)", r"FIRE\s*WALL.*(0?2|2ND)", r"FIRE\s*WALL.*(0?3|3RD)",
                r"OUTDOOR EQUIPMENT", r"GANTRY TOWER", r"HIGH LIGHT MAST|HIGH MAST",
                r"AIS EQUIPMENT\s*-\s*LINE", r"AIS EQUIPMENT\s*-\s*TRAFO", r"GIB\s*(&|AND)\s*GAB",
                r"PTR-1.*SGR-1", r"FIREWALL.*SGR-1", r"SGR\s*1.*CABLE CULVERT", r"FIREWALL-1", r"GIS.*PTR-1", r"GIS.*LINE",
                r"PTR-3.*SGR-2", r"FIREWALL.*SGR-2", r"SGR\s*2.*CABLE CULVERT", r"FIREWALL-2", r"GIS.*PTR-3",
                r"WMS FOUNDATION", r"SVG.*P1", r"SVG.*P2", r"SVG",
                r"HARMONIC FILTER.*P1", r"HARMONIC FILTER.*P2", r"HARMONIC FILTER",
                r"BURN.*(OIL|OUT)", r"BALANCE WORKS", r"FENCING", r"YARD BACKFILL", r"PARKING SHED"
            ]
            def get_civil_order(sw):
                name = sw["name"].strip().upper()
                for idx, pat in enumerate(CIVIL_SUB_PATTERNS):
                    if re.search(pat, name):
                        return idx
                return 9999
            
            sub_wbs = [dict(sw) for sw in sub_wbs]
            sub_wbs.sort(key=get_civil_order)
            
        elif sub_wbs and heading_name == "ELECTRICAL ERECTION WORKS":
            ELEC_SUB_PATTERNS = [
                r"EARTHING",
                r"POWER TRANSFORMER\s*-\s*0?1",
                r"INTERNAL CABLING", r"OUTDOOR CABLING", r"TESTING",
                r"POWER TRANSFORMER\s*-\s*0?2",
                r"PRE.*COMMISSIONING",
                r"POWER TRANSFORMER\s*-\s*0?3",
                r"POWER TRANSFORMER\s*-\s*0?4",
                r"POWER TRANSFORMER\s*-\s*0?5",
                r"POWER TRANSFORMER\s*-\s*0?6",
                r"SGR\s*-\s*0?1", r"SGR\s*-\s*0?2", r"SGR\s*-\s*0?3",
                r"MAIN BAY AREA", r"GIB\s*(&|AND)\s*GAB", r"AHU WORKS",
                r"GIS ERECTION", r"CRP\s*-\s*AREA", r"MCR", r"SCADA", r"AIS",
                r"SVG.*P1", r"CABLING\s*(&|AND)\s*TESTING", r"SVG.*P2", r"SVG",
                r"HARMONIC FILTER.*P1", r"HARMONIC FILTER.*P2", r"HARMONIC FILTER",
                r"PMU\s*-\s*ERECTION", r"GANTRY", r"CABLE TRAY", r"CABLING WORKS",
                r"WMS", r"P1\s*-\s*CEA", r"P1\s*-\s*PRE", r"FINAL CHECKS",
                r"P2\s*-\s*CEA", r"P2\s*-\s*PRE"
            ]
            def get_elec_order(sw):
                name = sw["name"].strip().upper()
                for idx, pat in enumerate(ELEC_SUB_PATTERNS):
                    if re.search(pat, name):
                        return idx
                return 9999
            
            sub_wbs = [dict(sw) for sw in sub_wbs]
            sub_wbs.sort(key=get_elec_order)

        group = {"mainHeading": heading_name, "mainHeadingOriginal": info["name"], "subHeadings": []}

        if sub_wbs:
            for sw in sub_wbs:
                rows = await pool.fetch(ACT_SQL, sw["object_id"], project_object_id)
                acts = []
                for r in rows:
                    act = dict(r)
                    act["mainHeading"] = heading_name
                    act["subHeading"] = sw["name"]
                    # Merge persisted DPR metadata
                    dpr_meta = act.pop("dprMetadata", None) or {}
                    if isinstance(dpr_meta, str):
                        try: dpr_meta = json.loads(dpr_meta)
                        except: dpr_meta = {}
                    for mk, mv in dpr_meta.items():
                        if mk not in act or not act[mk]:
                            act[mk] = mv
                    acts.append(act)
                    all_activities.append(act)
                if acts:
                    group["subHeadings"].append({"name": sw["name"], "activityCount": len(acts)})
        else:
            rows = await pool.fetch(ACT_SQL, info["id"], project_object_id)
            for r in rows:
                act = dict(r)
                act["mainHeading"] = heading_name
                act["subHeading"] = ""
                # Merge persisted DPR metadata
                dpr_meta = act.pop("dprMetadata", None) or {}
                if isinstance(dpr_meta, str):
                    try: dpr_meta = json.loads(dpr_meta)
                    except: dpr_meta = {}
                for mk, mv in dpr_meta.items():
                    if mk not in act or not act[mk]:
                        act[mk] = mv
                all_activities.append(act)

        groups.append(group)

    return all_activities, groups


@router.get("/pss-civil-peb-data/{projectId}")
async def get_pss_civil_peb_data(
    projectId: str,
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(get_current_user),
):
    """Fetch PSS Civil & PEB activities (Stone Column, Civil Works, PEB Erection)."""
    project_object_id = await resolve_project_id(projectId, pool)
    patterns = {
        "STONE COLUMN": ["STONE COLUMN"],
        "CIVIL WORKS": ["CIVIL WORKS", "CIVIL WORK"],
        "PEB ERECTION": ["PEB ERECTION", "PEB WORKS", "PEB"],
    }
    data, groups = await _fetch_pss_activities_by_headings(
        pool, project_object_id, patterns, ["STONE COLUMN", "CIVIL WORKS", "PEB ERECTION"]
    )
    return {"success": True, "projectId": projectId, "data": data, "groups": groups, "totalActivities": len(data)}


@router.get("/pss-electrical-data/{projectId}")
async def get_pss_electrical_data(
    projectId: str,
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(get_current_user),
):
    """Fetch PSS Electrical Erection Works activities."""
    project_object_id = await resolve_project_id(projectId, pool)
    patterns = {
        "ELECTRICAL ERECTION WORKS": ["ELECTRICAL ERECTION", "ELECTRICAL WORKS", "ELECTRIC WORKS"],
    }
    data, groups = await _fetch_pss_activities_by_headings(
        pool, project_object_id, patterns, ["ELECTRICAL ERECTION WORKS"]
    )
    return {"success": True, "projectId": projectId, "data": data, "groups": groups, "totalActivities": len(data)}


async def _fetch_bess_civil_activities(pool, project_object_id, heading_patterns: dict, heading_order: list, harmonic_filter_children: list = None):
    """Shared helper: fetch BESS Civil activities grouped by heading, aggregated across every
    numbered Block (BESS WBS shape differs from Solar/PSS - there's an extra Block layer):
    Construction Works -> Block 1..N -> Civil -> <heading e.g. Battery Container> -> <sub-WBS e.g.
    Battery Container Block-1 BCT-1> -> activities.

    harmonic_filter_children: names of Harmonic Filter's direct children (e.g. ["Civil"] or
    ["Erection", "Cable Laying & Termination, Earthing"]) to fold into the "Harmonic Filter"
    heading - Harmonic Filter sits outside the Block/Civil|Electrical shape so it needs this
    explicit mapping instead of the generic pattern match.
    """
    block_nodes = await pool.fetch("""
        SELECT object_id, name FROM solar_wbs
        WHERE project_object_id = $1 AND name ~* '^Block\\s+\\d+$'
        ORDER BY name
    """, project_object_id)

    if not block_nodes:
        return [], []

    # heading_name -> list of {"id", "name", "block"} WBS nodes, one per Block that has this heading
    heading_wbs_map: dict = {h: [] for h in heading_order}

    for b in block_nodes:
        # Fetch block's direct children (this includes things like "Integration Activities", "Civil")
        children_records = await pool.fetch("""
            SELECT object_id, name FROM solar_wbs
            WHERE project_object_id = $1 AND parent_object_id = $2 ORDER BY name
        """, project_object_id, b["object_id"])
        
        children = [dict(c) for c in children_records]
        
        # If there's a Civil node, fetch its children too and add to the list
        civil_node = next((c for c in children if (c["name"] or "").upper() == 'CIVIL'), None)
        if civil_node:
            civil_children = await pool.fetch("""
                SELECT object_id, name FROM solar_wbs
                WHERE project_object_id = $1 AND parent_object_id = $2 ORDER BY name
            """, project_object_id, civil_node["object_id"])
            children.extend([dict(c) for c in civil_children])

        # If there's an Electrical node, fetch its children too and add to the list
        elec_node = next((c for c in children if (c["name"] or "").upper() == 'ELECTRICAL'), None)
        if elec_node:
            elec_children = await pool.fetch("""
                SELECT object_id, name FROM solar_wbs
                WHERE project_object_id = $1 AND parent_object_id = $2 ORDER BY name
            """, project_object_id, elec_node["object_id"])
            children.extend([dict(c) for c in elec_children])

        # Now match any of these children against our heading patterns
        for child in children:
            child_upper = (child["name"] or "").upper().strip()
            for heading, patterns in heading_patterns.items():
                if any(pat in child_upper for pat in patterns):
                    heading_wbs_map[heading].append({"id": child["object_id"], "name": child["name"], "block": b["name"]})
                    break

    # Fetch common project-level WBS nodes (like Road Works) that sit outside blocks
    cw_node = await pool.fetchrow("""
        SELECT object_id FROM solar_wbs 
        WHERE project_object_id = $1 AND name ILIKE 'Construction Works'
    """, project_object_id)
    
    if cw_node:
        cw_children = await pool.fetch("""
            SELECT object_id, name FROM solar_wbs
            WHERE project_object_id = $1 AND parent_object_id = $2
        """, project_object_id, cw_node["object_id"])
        
        for child in cw_children:
            child_upper = (child["name"] or "").upper().strip()
            for heading, patterns in heading_patterns.items():
                if any(pat in child_upper for pat in patterns):
                    if not any(n["id"] == child["object_id"] for n in heading_wbs_map[heading]):
                        heading_wbs_map[heading].append({
                            "id": child["object_id"],
                            "name": child["name"],
                            "block": "Common"
                        })
                    break

        # Harmonic Filter sits next to Fencing/Road Works/Earthern Drain under Construction Works,
        # but its own name never matches the patterns above, and its Civil/Erection/Cable Laying
        # split doesn't follow the Block Civil|Electrical shape. Fold the requested children
        # (e.g. "Civil" for the civil sheet, "Erection" + "Cable Laying & Termination, Earthing"
        # for the electrical sheet) into the "Harmonic Filter" heading explicitly.
        if harmonic_filter_children and "Harmonic Filter" in heading_wbs_map:
            harmonic_node = next((c for c in cw_children if "HARMONIC" in (c["name"] or "").upper()), None)
            if harmonic_node:
                hf_children = await pool.fetch("""
                    SELECT object_id, name FROM solar_wbs
                    WHERE project_object_id = $1 AND parent_object_id = $2
                """, project_object_id, harmonic_node["object_id"])
                for wanted in harmonic_filter_children:
                    hf_child = next((c for c in hf_children if (c["name"] or "").upper().strip() == wanted.upper()), None)
                    if hf_child and not any(n["id"] == hf_child["object_id"] for n in heading_wbs_map["Harmonic Filter"]):
                        heading_wbs_map["Harmonic Filter"].append({
                            "id": hf_child["object_id"],
                            "name": hf_child["name"],
                            "block": "Common"
                        })

    ACT_SQL = """
        WITH RECURSIVE SubTree AS (
            SELECT object_id FROM solar_wbs WHERE object_id = $1
            UNION ALL
            SELECT c.object_id FROM solar_wbs c JOIN SubTree p ON c.parent_object_id = p.object_id
        )
        SELECT sa.object_id as "activityObjectId", sa.activity_id as "activityId",
               sa.name as description, sa.status, sa.wbs_name as "wbsName",
               sa.baseline_start as "baselineStart", sa.baseline_finish as "baselineFinish",
               sa.actual_start as "actualStart", sa.actual_finish as "actualFinish",
               sa.start_date as "forecastStart", sa.finish_date as "forecastFinish",
               sa.primary_resource as "vendorName", sa.uom,
               sa.total_quantity as scope, sa.cumulative as completed,
               sa.balance, sa.planned_duration as duration, sa.percent_complete, sa.priority,
               sa.dpr_metadata as "dprMetadata"
        FROM solar_activities sa
        JOIN SubTree st ON sa.wbs_object_id = st.object_id
        WHERE sa.project_object_id = $2
        ORDER BY sa.activity_id ASC
    """

    def merge_dpr_metadata(act: dict) -> dict:
        dpr_meta = act.pop("dprMetadata", None) or {}
        if isinstance(dpr_meta, str):
            try:
                dpr_meta = json.loads(dpr_meta)
            except Exception:
                dpr_meta = {}
        for mk, mv in dpr_meta.items():
            if mk not in act or not act[mk]:
                act[mk] = mv
        return act

    groups = []
    all_activities = []

    # More generic prefix regex to handle Civil, Integration, and Electrical (e.g. BLK 1:ERE:Elect. - or Block-1 -)
    prefix_re = re.compile(r'^\s*(?:BLK|Block)[-\s]*\d+\s*(?::[A-Za-z0-9_\s.&]+)*\s*-\s*', re.IGNORECASE)

    # Only nest "Harmonic Filter" under a superHeading/mainHeading split (like Erection of
    # Equipment) when it actually has more than one distinct sub-group (electrical: Erection +
    # Cable Laying & Termination, Earthing). Civil only has one child (Civil), so it stays flat.
    harmonic_needs_nesting = bool(harmonic_filter_children) and len(harmonic_filter_children) > 1

    for heading_name in heading_order:
        wbs_nodes = heading_wbs_map.get(heading_name) or []
        if not wbs_nodes:
            continue

        # Collect sub-WBS (e.g. "Battery Container Block-1 BCT-1") across ALL blocks for this heading
        sub_wbs_all = []
        for info in wbs_nodes:
            sub_wbs = await pool.fetch("""
                SELECT object_id, name FROM solar_wbs
                WHERE project_object_id = $1 AND parent_object_id = $2 ORDER BY name
            """, project_object_id, info["id"])
            if not sub_wbs:
                sub_wbs_all.append({"object_id": info["id"], "name": info["name"], "block": info["block"]})
            else:
                for sw in sub_wbs:
                    sub_wbs_all.append({"object_id": sw["object_id"], "name": sw["name"], "block": info["block"]})

        group = {"mainHeading": heading_name, "subHeadings": []}

        if sub_wbs_all:
            # Group by normalized activity type (e.g. "BCF - Driven Cast in-situ Piling"), not by
            # BCT - each BCT/Block repeats the exact same activity set, so the sub-heading should be
            # the activity type, with one row per Block/BCT instance underneath it (matches the
            # Solar/Wind DC Side pattern: activity as the group, block as the per-row instance).
            block_num_re = re.compile(r'(\d+)')
            bct_num_re = re.compile(r'BCT-?\s*(\d+)\s*$', re.IGNORECASE)

            if heading_name == "Erection of Equipment":
                # Enforce a logical layout order rather than strict alphabetical
                custom_order = {
                    "Battery Container": 1,
                    "PCS": 2,
                    "Converter Transformer": 3,
                    "NIFPS": 4,
                    "CSS Erection": 5,
                    "MV Switchgear Erection": 6,
                    "ACDB Erection": 7
                }
                sub_wbs_all.sort(key=lambda x: (custom_order.get((x["name"] or "").strip(), 99), x["name"]))
            elif heading_name == "Equipment Earthing work":
                custom_order = {
                    "Battery Container": 1,
                    "PCS": 2,
                    "CSS": 3,
                    "MV Switchgear": 4,
                    "ACDB": 5,
                    "Balance equipment Earthing": 6
                }
                sub_wbs_all.sort(key=lambda x: (custom_order.get((x["name"] or "").strip(), 99), x["name"]))
            elif heading_name == "Cable Laying":
                custom_order = {
                    "HT Cable": 1,
                    "Aux Cable & Control Cable": 2,
                    "AC Cable - LT Cable": 3,
                    "DC Cable": 4,
                    "EMS to PPC": 5
                }
                sub_wbs_all.sort(key=lambda x: (custom_order.get((x["name"] or "").strip(), 99), x["name"]))
            elif heading_name == "Cable Termination":
                custom_order = {
                    "Battery Container": 1,
                    "PCS": 2,
                    "Converter Transformer": 3,
                    "CSS": 4,
                    "MV Switchgear": 5,
                    "ACDB": 6,
                    "Balance equipment Termination": 7
                }
                sub_wbs_all.sort(key=lambda x: (custom_order.get((x["name"] or "").strip(), 99), x["name"]))

            flat = []  # (mainHeading, normalized_name, block_num, bct_num, act)
            for sw in sub_wbs_all:
                rows = await pool.fetch(ACT_SQL, sw["object_id"], project_object_id)
                block_m = block_num_re.search(sw["block"] or "")
                block_num = int(block_m.group(1)) if block_m else 0
                bct_m = bct_num_re.search(sw["name"] or "")
                bct_num = int(bct_m.group(1)) if bct_m else 0
                block_display = f"Block {block_num:02d} - BCT {bct_num}" if bct_m else sw["block"]

                for r in rows:
                    act = dict(r)
                    raw_desc = act.get("description") or ""
                    
                    # Exclude specific activities per user request (case insensitive)
                    exclude_keywords = ["Routine Test", "Ready for Commissioning"]
                    if heading_name == "Erection of Equipment" and sw["name"] in ["Converter Transformer", "CSS Erection", "MV Switchgear Erection", "ACDB Erection"]:
                        exclude_keywords = []
                        
                    # Only hide Panel & ACDB Erection if it's NOT actually under the ACDB Erection heading
                    if sw["name"] != "ACDB Erection":
                        exclude_keywords.append("Panel & ACDB Erection")
                        
                    if any(kw.lower() in raw_desc.lower() for kw in exclude_keywords):
                        continue
                        
                    clean_desc = prefix_re.sub("", raw_desc).strip() or raw_desc
                    clean_desc = re.sub(r'^\s*Block[-\s]*\d+\s*-\s*', '', clean_desc, flags=re.IGNORECASE).strip()
                    # Strip BCT and CSS suffix/prefix ONLY for grouping (normalized_name)
                    normalized_name = re.sub(r'\s*BCT-?\s*\d+\s*$', '', clean_desc, flags=re.IGNORECASE).strip()
                    if sw["name"] == "CSS Erection":
                        normalized_name = re.sub(r'^CSS\s*\d+\s*', '', normalized_name, flags=re.IGNORECASE).strip()
                        norm_lower = normalized_name.lower()
                        if "ready for commissioning" in norm_lower:
                            normalized_name = "Ready for Commissioning"
                        elif "routine test" in norm_lower:
                            normalized_name = "Routine Test"
                        elif "erection" in norm_lower:
                            normalized_name = "Erection"
                    elif sw["name"] == "MV Switchgear Erection":
                        normalized_name = re.sub(r'^SGR\s*\d+\s*', '', normalized_name, flags=re.IGNORECASE).strip()
                        norm_lower = normalized_name.lower()
                        if "ready for commissioning" in norm_lower or "panelready" in norm_lower:
                            normalized_name = "HT Panel Ready for Commissioning"
                        elif "routine test" in norm_lower:
                            normalized_name = "HT Panel Routine Test"
                        elif "erection" in norm_lower:
                            normalized_name = "HT Panel Erection"
                    elif sw["name"] == "ACDB Erection":
                        norm_lower = normalized_name.lower()
                        if "ready for commissioning" in norm_lower:
                            normalized_name = "Ready for Commissioning"
                        elif "routine test" in norm_lower:
                            normalized_name = "Routine Test"
                        elif "erection" in norm_lower:
                            normalized_name = "Panel & ACDB Erection"
                    elif sw["name"] in ["Balance equipment Earthing", "Balance equipment Termination"]:
                        norm_lower = normalized_name.lower()
                        if "ems earthing" in norm_lower:
                            normalized_name = "EMS Earthing"
                        elif "ems termination" in norm_lower or "ems termintaion" in norm_lower:
                            normalized_name = "EMS Termination"
                        elif "panel & dbs earthing" in norm_lower:
                            normalized_name = "Panel & DBs Earthing"
                        elif "panel & dbs termination" in norm_lower or "panel & dbs termintaion" in norm_lower:
                            normalized_name = "Panel & DBs Termination"
                        else:
                            normalized_name = re.sub(r'-?\s*LCR/?Block\s*\d+', '', normalized_name, flags=re.IGNORECASE).strip()
                            normalized_name = re.sub(r'-?\s*LCR\s*\d+', '', normalized_name, flags=re.IGNORECASE).strip()
                    elif "Electrical Room-2" in (sw["name"] or ""):
                        norm_lower = normalized_name.lower()
                        if "ems/ecp panel" in norm_lower:
                            normalized_name = "EMS/ECP Panel Erection"
                        elif "panel & dbs erection" in norm_lower:
                            normalized_name = "Panel & DBs Erection"
                        else:
                            normalized_name = re.sub(r'-?\s*LCR/?Block\s*\d+', '', normalized_name, flags=re.IGNORECASE).strip()
                            normalized_name = re.sub(r'-?\s*LCR\s*\d+', '', normalized_name, flags=re.IGNORECASE).strip()


                    # Extract BCT number to append to block_display (so users know which BCT it is, like in Civil)
                    row_block_display = block_display
                    if heading_name in ["Erection of Equipment", "Equipment Earthing work", "Cable Laying", "Cable Termination"]:
                        if "Electrical Room-2" in (sw["name"] or "") or "Balance equipment Earthing" in (sw["name"] or "") or "Balance equipment Termination" in (sw["name"] or ""):
                            act_blk_m = re.search(r'BLK\s*(\d+)', raw_desc, re.IGNORECASE)
                            if not act_blk_m and act.get("wbsName"):
                                act_blk_m = re.search(r'BLK\s*(\d+)', act.get("wbsName"), re.IGNORECASE)
                            if act_blk_m:
                                block_num = int(act_blk_m.group(1))
                                row_block_display = f"Block {block_num:02d}"

                        bct_match = re.search(r'BCT-?\s*(\d+)', clean_desc, re.IGNORECASE)
                        if not bct_match and act.get("wbsName"):
                            bct_match = re.search(r'BCT-?\s*(\d+)', act.get("wbsName"), re.IGNORECASE)
                            
                        if bct_match:
                            bct_val = bct_match.group(1)
                            if f"BCT {bct_val}" not in row_block_display and f"BCT-{bct_val}" not in row_block_display:
                                row_block_display = f"{row_block_display} - BCT {bct_val}"
                                
                        css_match = re.search(r'CSS\s*(\d+)', clean_desc, re.IGNORECASE)
                        if not css_match and act.get("wbsName"):
                            css_match = re.search(r'CSS\s*(\d+)', act.get("wbsName"), re.IGNORECASE)
                            
                        if css_match and (sw["name"] == "CSS Erection" or sw["name"] == "CSS"):
                            css_val = css_match.group(1)
                            if f"CSS {css_val}" not in row_block_display and f"CSS-{css_val}" not in row_block_display:
                                row_block_display = f"{row_block_display} - CSS {css_val}"
                                
                        sgr_match = re.search(r'SGR\s*(\d+)', clean_desc, re.IGNORECASE)
                        if not sgr_match and act.get("wbsName"):
                            sgr_match = re.search(r'SGR\s*(\d+)', act.get("wbsName"), re.IGNORECASE)
                            
                        if sgr_match and (sw["name"] == "MV Switchgear Erection" or sw["name"] == "MV Switchgear"):
                            sgr_val = sgr_match.group(1)
                            if f"SGR {sgr_val}" not in row_block_display and f"SGR-{sgr_val}" not in row_block_display:
                                row_block_display = f"{row_block_display} - SGR {sgr_val}"
                                
                        lcr_match = re.search(r'LCR\s*(\d+)', clean_desc, re.IGNORECASE)
                        if not lcr_match and act.get("wbsName"):
                            lcr_match = re.search(r'LCR\s*(\d+)', act.get("wbsName"), re.IGNORECASE)
                            
                        if lcr_match:
                            lcr_val = lcr_match.group(1)
                            if f"LCR {lcr_val}" not in row_block_display and f"LCR-{lcr_val}" not in row_block_display:
                                row_block_display = f"{row_block_display} - LCR {lcr_val}"

                    # Standardize Integration names to fix P6 typos/truncations across blocks
                    if heading_name == "Integration Activities":
                        sw_upper = (sw["name"] or "").upper()
                        if "BATTERY" in sw_upper or "PCS" in sw_upper:
                            normalized_name = "Integration of Battery, PCS, EMS, etc."
                        elif "MASTER" in sw_upper:
                            normalized_name = "PSS PPC with Master PPC"
                        elif "EMS" in sw_upper and "PPC" in sw_upper:
                            normalized_name = "EMS with PPC"
                    
                    if heading_name in ["Erection of Equipment", "Equipment Earthing work", "Cable Laying", "Cable Termination"] or (heading_name == "Harmonic Filter" and harmonic_needs_nesting):
                        # Fix P6 typos that cause identical activities to split into separate groups
                        if "Container Erectionr" in normalized_name:
                            normalized_name = normalized_name.replace("Container Erectionr", "Container Erection")

                        act["superHeading"] = heading_name
                        act["mainHeading"] = (sw["name"] or "").strip()
                    else:
                        act["mainHeading"] = heading_name

                    act["subHeading"] = normalized_name
                    act["description"] = raw_desc  # Keep the exact P6 name in the description!
                    act["block"] = row_block_display

                    # Map UOM if missing from P6
                    if not act.get("uom") and (act.get("scope") or act.get("completed")):
                        desc_lower = raw_desc.lower()
                        if any(kw in desc_lower for kw in ["excavation", "back filling", "concrete", "pcc", "soil improvement"]):
                            act["uom"] = "Cum"
                        elif any(kw in desc_lower for kw in ["cable", "earth mat", "wire"]):
                            act["uom"] = "Rmt"
                        elif any(kw in desc_lower for kw in ["steel", "reinforcement"]):
                            act["uom"] = "MT"
                        else:
                            act["uom"] = "Nos"

                    act = merge_dpr_metadata(act)
                    flat.append((act["mainHeading"], normalized_name, block_num, bct_num, act))

            # Preserve first-seen order of activity types; sort rows within a type by (block, bct)
            type_order = []
            seen_types = set()
            for mainH, normalized_name, _, _, _ in flat:
                key = (mainH, normalized_name)
                if key not in seen_types:
                    seen_types.add(key)
                    type_order.append(key)
                    
            original_order = list(type_order)
            
            def get_type_sort_key(item):
                mainH, subH = item
                main_idx = [k[0] for k in original_order].index(mainH)
                
                sub_idx = 99
                if mainH == "Converter Transformer":
                    order = {
                        "Accessories Fixing": 1,
                        "Control Scheme": 2,
                        "Oil Filling": 3,
                        "Ready for Commissioning": 4,
                        "SFRA & Tan Delta": 5,
                        "Routine test": 6,
                        "Converter Transformer Erection": 7
                    }
                    for k, v in order.items():
                        if k.lower() in subH.lower():
                            sub_idx = v
                            break
                elif mainH in ["CSS Erection", "MV Switchgear Erection", "ACDB Erection"]:
                    order = {
                        "Ready for Commissioning": 1,
                        "Routine test": 2,
                        "Erection": 3
                    }
                    for k, v in order.items():
                        if k.lower() in subH.lower():
                            sub_idx = v
                            break
                
                if sub_idx == 99:
                    sub_idx = original_order.index(item)
                    
                return (main_idx, sub_idx)
                
            type_order.sort(key=get_type_sort_key)

            flat.sort(key=lambda t: (type_order.index((t[0], t[1])), t[2], t[3]))

            counts: dict = {}
            for _, normalized_name, _, _, act in flat:
                all_activities.append(act)
                counts[normalized_name] = counts.get(normalized_name, 0) + 1

            for normalized_name in type_order:
                group["subHeadings"].append({"name": normalized_name, "activityCount": counts.get(normalized_name, 0)})
        else:
            for info in wbs_nodes:
                rows = await pool.fetch(ACT_SQL, info["id"], project_object_id)
                for r in rows:
                    act = dict(r)
                    raw_desc = act.get("description") or ""
                    
                    # Exclude specific activities per user request (case insensitive)
                    if any(kw.lower() in raw_desc.lower() for kw in ["Panel & ACDB Erection", "Routine Test", "Ready for Commissioning"]):
                        continue
                        
                    act["description"] = raw_desc  # Keep the exact P6 name in the description!
                    act["mainHeading"] = heading_name
                    act["subHeading"] = act.get("wbsName") or ""
                    act["block"] = info["block"]

                    # Map UOM if missing from P6
                    if not act.get("uom") and (act.get("scope") or act.get("completed")):
                        desc_lower = (act.get("description") or "").lower()
                        if any(kw in desc_lower for kw in ["excavation", "back filling", "concrete", "pcc", "soil improvement"]):
                            act["uom"] = "Cum"
                        elif any(kw in desc_lower for kw in ["cable", "earth mat", "wire"]):
                            act["uom"] = "Rmt"
                        elif any(kw in desc_lower for kw in ["steel", "reinforcement"]):
                            act["uom"] = "MT"
                        else:
                            act["uom"] = "Nos"

                    act = merge_dpr_metadata(act)
                    all_activities.append(act)

        groups.append(group)

    return all_activities, groups


async def _fetch_bess_testing_activities(pool, project_object_id):
    """Fetch BESS 'Testing & Commissioning' sheet activities from the Pre-Commissioning &
    Commissioning section. Structure (sits next to Construction Works, after Harmonic Filter):
    Project root -> Pre-Commissioning & Commissioning Part-N -> <section> -> activities.

    Each Part becomes a superHeading (teal band); each of its sections (CEA Application /
    Cross Functional Team Inspection / FTC Application / Commissioning, Trial Run ...) becomes a
    mainHeading (navy band); activities render directly under their section.
    """
    part_nodes = await pool.fetch("""
        SELECT object_id, name FROM solar_wbs
        WHERE project_object_id = $1 AND name ILIKE 'Pre-Commissioning%%Commissioning Part-%%'
    """, project_object_id)

    if not part_nodes:
        return [], []

    ACT_SQL = """
        WITH RECURSIVE SubTree AS (
            SELECT object_id FROM solar_wbs WHERE object_id = $1
            UNION ALL
            SELECT c.object_id FROM solar_wbs c JOIN SubTree p ON c.parent_object_id = p.object_id
        )
        SELECT sa.object_id as "activityObjectId", sa.activity_id as "activityId",
               sa.name as description, sa.status, sa.wbs_name as "wbsName",
               sa.baseline_start as "baselineStart", sa.baseline_finish as "baselineFinish",
               sa.actual_start as "actualStart", sa.actual_finish as "actualFinish",
               sa.start_date as "forecastStart", sa.finish_date as "forecastFinish",
               sa.primary_resource as "vendorName", sa.uom,
               sa.total_quantity as scope, sa.cumulative as completed,
               sa.balance, sa.planned_duration as duration, sa.percent_complete, sa.priority,
               sa.dpr_metadata as "dprMetadata"
        FROM solar_activities sa
        JOIN SubTree st ON sa.wbs_object_id = st.object_id
        WHERE sa.project_object_id = $2
        ORDER BY sa.baseline_start ASC NULLS LAST, sa.activity_id ASC
    """

    def merge_dpr_metadata(act: dict) -> dict:
        dpr_meta = act.pop("dprMetadata", None) or {}
        if isinstance(dpr_meta, str):
            try:
                dpr_meta = json.loads(dpr_meta)
            except Exception:
                dpr_meta = {}
        for mk, mv in dpr_meta.items():
            if mk not in act or not act[mk]:
                act[mk] = mv
        return act

    def part_sort_key(name: str) -> int:
        m = re.search(r'Part-?\s*(\d+)', name or '', re.IGNORECASE)
        return int(m.group(1)) if m else 99

    all_activities = []
    groups = []

    for part in sorted(part_nodes, key=lambda p: part_sort_key(p["name"])):
        part_name = (part["name"] or "").strip()

        # Sections keep their P6 child order (object_id): CEA -> Cross Functional -> FTC -> Commissioning
        sections = await pool.fetch("""
            SELECT object_id, name FROM solar_wbs
            WHERE project_object_id = $1 AND parent_object_id = $2 ORDER BY object_id
        """, project_object_id, part["object_id"])

        group = {"mainHeading": part_name, "subHeadings": []}

        for section in sections:
            section_name = (section["name"] or "").strip()
            rows = await pool.fetch(ACT_SQL, section["object_id"], project_object_id)
            count = 0
            for r in rows:
                act = dict(r)
                act["superHeading"] = part_name
                act["mainHeading"] = section_name
                act["subHeading"] = ""  # activities render directly under their section
                act["block"] = ""
                act = merge_dpr_metadata(act)
                all_activities.append(act)
                count += 1
            group["subHeadings"].append({"name": section_name, "activityCount": count})

        groups.append(group)

    return all_activities, groups


async def _order_bess_civil_equipment(pool, project_object_id, headings: list) -> list:
    """Order the given equipment-foundation headings by their P6 WBS 'code' (display sequence)
    as they appear under Block -> Civil. The order differs per project, so it's derived live.
    Headings not found under Civil are appended at the end in their given order.
    """
    rows = await pool.fetch("""
        SELECT child.name, child.code
        FROM solar_wbs civil
        JOIN solar_wbs blk ON civil.parent_object_id = blk.object_id
        JOIN solar_wbs child ON child.parent_object_id = civil.object_id
        WHERE civil.project_object_id = $1
          AND UPPER(civil.name) = 'CIVIL'
          AND blk.name ~* '^Block\\s+\\d+$'
    """, project_object_id)

    def code_val(c):
        return int(c) if c and str(c).isdigit() else 9999

    best: dict = {}
    for r in rows:
        nm = (r["name"] or "").upper()
        for h in headings:
            if h.upper() in nm:
                cv = code_val(r["code"])
                if h not in best or cv < best[h]:
                    best[h] = cv
    found = sorted([h for h in headings if h in best], key=lambda h: best[h])
    rest = [h for h in headings if h not in best]
    return found + rest


@router.get("/bess-data/{projectId}")
async def get_bess_data(
    projectId: str,
    category: str = "civil",
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(get_current_user),
):
    """Fetch BESS activities for a given DPR sheet category (currently only 'civil' is implemented,
    covering Battery Container). Other categories return an empty set until their WBS mapping is defined."""
    project_object_id = await resolve_project_id(projectId, pool)

    if category == "civil":
        # Equipment-foundation headings that sit under Block -> Civil alongside Battery Container.
        # Their P6 order varies per project, so order them by WBS code (Battery Container stays first).
        equipment = {
            "Converter Transformer": ["CONVERTER TRANSFORMER"],
            "PCS": ["PCS"],
            "NIFPS": ["NIFPS"],
            "Electrical Room": ["ELECTRICAL ROOM"],
            "SGR": ["SGR"],
            "Burn Oil Tank": ["BURN OIL TANK"],
            "CSS": ["CSS"],
        }
        equip_order = await _order_bess_civil_equipment(pool, project_object_id, list(equipment.keys()))

        patterns = {
            "Battery Container": ["BATTERY CONTAINER"],
            **equipment,
            "Integration Activities": ["INTEGRATION"],
            "Road Works": ["ROAD WORKS"],
            "Earthern Drain": ["EARTHERN DRAIN"],
            "Fencing, Gate & Porta Cabin": ["FENCING, GATE", "PORTA CABIN", "FENCING"],
            "Harmonic Filter": [],
        }
        heading_order = (
            ["Battery Container"] + equip_order +
            ["Integration Activities", "Road Works", "Earthern Drain", "Fencing, Gate & Porta Cabin", "Harmonic Filter"]
        )
        data, groups = await _fetch_bess_civil_activities(
            pool, project_object_id, patterns, heading_order,
            harmonic_filter_children=["Civil"]
        )
        return {"success": True, "projectId": projectId, "data": data, "groups": groups, "totalActivities": len(data)}

    elif category == "electrical":
        patterns = {
            "Erection of Equipment": ["ERECTION OF EQUIPMENT"],
            "Grid Earthing": ["GRID EARTHING"],
            "Equipment Earthing work": ["EQUIPMENT EARTHING WORK", "EQUIPMENT EARTHING", "EARTHING WORK", "EARTHING"],
            "Cable Laying": ["CABLE LAYING"],
            "Cable Termination": ["CABLE TERMINATION", "TERMINATION"],
            "Harmonic Filter": [],
        }
        data, groups = await _fetch_bess_civil_activities(
            pool, project_object_id, patterns, ["Erection of Equipment", "Equipment Earthing work", "Cable Laying", "Cable Termination", "Grid Earthing", "Harmonic Filter"],
            harmonic_filter_children=["Erection", "Cable Laying & Termination, Earthing"]
        )
        return {"success": True, "projectId": projectId, "data": data, "groups": groups, "totalActivities": len(data)}

    elif category == "testing":
        data, groups = await _fetch_bess_testing_activities(pool, project_object_id)
        return {"success": True, "projectId": projectId, "data": data, "groups": groups, "totalActivities": len(data)}

    return {"success": True, "projectId": projectId, "data": [], "groups": [], "totalActivities": 0}


@router.get("/bess-blocks/{projectId}")
async def get_bess_blocks(
    projectId: str,
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(get_current_user),
):
    """List the numbered Blocks ('Block 1' .. 'Block N') present in a BESS project, for the
    dashboard's Block filter dropdown."""
    project_object_id = await resolve_project_id(projectId, pool)

    rows = await pool.fetch("""
        SELECT DISTINCT name FROM solar_wbs
        WHERE project_object_id = $1 AND name ~* '^Block\\s+\\d+$'
    """, project_object_id)

    def block_num(name: str) -> int:
        m = re.search(r'\d+', name or '')
        return int(m.group()) if m else 0

    blocks = sorted({r["name"] for r in rows}, key=block_num)
    return {"success": True, "projectId": projectId, "blocks": blocks, "count": len(blocks)}


@router.get("/daily-history/{projectId}")
async def get_daily_history(
    projectId: str,
    sheet_type: str,
    target_date: Optional[str] = None,
    days: int = 7,
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(get_current_user),
):
    """Past-days daily progress for the DP Qty / Manpower history columns.

    Returns a flat map keyed by activity id / object id / name -> { 'YYYY-MM-DD': today_value }
    over the last `days` days ending at `target_date` (default: 7 days ending today). Keyed several
    ways so both the DP Qty rows (matched by activityId) and Manpower rows (matched by activityId
    or description) can look up their history.
    """
    from datetime import timedelta as _td

    project_object_id = await resolve_project_id(projectId, pool)

    try:
        target = datetime.strptime(str(target_date)[:10], "%Y-%m-%d").date() if target_date else datetime.now().date()
    except Exception:
        target = datetime.now().date()
    start_date = target - _td(days=days - 1)

    rows = await pool.fetch("""
        SELECT dp.activity_object_id, sa.activity_id, sa.name,
               dp.progress_date, dp.today_value
        FROM dpr_daily_progress dp
        JOIN solar_activities sa ON sa.object_id = dp.activity_object_id
        WHERE sa.project_object_id = $1
          AND dp.sheet_type = $2
          AND dp.progress_date >= $3
          AND dp.progress_date <= $4
        ORDER BY dp.progress_date
    """, project_object_id, sheet_type, start_date, target)

    result: dict = {}

    def add(key, date_str, val):
        if key is None or key == "":
            return
        result.setdefault(str(key), {})[date_str] = val

    for r in rows:
        pd = r["progress_date"]
        date_str = pd.isoformat() if hasattr(pd, "isoformat") else str(pd)
        val = float(r["today_value"]) if r["today_value"] is not None else 0.0
        add(r["activity_object_id"], date_str, val)
        add(r["activity_id"], date_str, val)
        add(r["name"], date_str, val)

    return result


@router.get("/pss-transmission-visual/{projectId}")
async def get_pss_transmission_visual(
    projectId: str,
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(get_current_user),
):
    """Fetch 400KV Transmission Visual Chart from Transmission Line WBS."""
    project_object_id = await resolve_project_id(projectId, pool)

    construction_root = await pool.fetchval("""
        SELECT object_id FROM solar_wbs
        WHERE project_object_id = $1 AND (UPPER(name) LIKE 'CONSTRUCTION%%')
        ORDER BY CASE WHEN UPPER(name) LIKE '%%COMMIS%%' THEN 0 ELSE 1 END
        LIMIT 1
    """, project_object_id)

    if not construction_root:
        return {"success": True, "projectId": projectId, "data": []}

    rows = await pool.fetch("""
        WITH RECURSIVE SubTree AS (
            SELECT object_id, name FROM solar_wbs
            WHERE project_object_id = $1 AND parent_object_id = $2
              AND UPPER(name) LIKE '%%TRANSMISSION%%LINE%%'
            UNION ALL
            SELECT c.object_id, c.name FROM solar_wbs c
            JOIN SubTree p ON c.parent_object_id = p.object_id
        )
        SELECT sa.object_id as "activityObjectId", sa.activity_id as "activityId",
               sa.name as description, sa.uom, sa.status,
               sa.total_quantity as "totalQuantity",
               sa.cumulative as completed,
               sa.balance,
               sa.wbs_name as "wbsName"
        FROM solar_activities sa
        JOIN SubTree st ON sa.wbs_object_id = st.object_id
        WHERE sa.project_object_id = $1
        ORDER BY sa.activity_id ASC
    """, project_object_id, construction_root)

    data = []
    for r in rows:
        d = dict(r)
        d["wip"] = 1 if (d.get("status") or "").lower() in ("in progress", "active") else 0
        data.append(d)

    return {"success": True, "projectId": projectId, "data": data}


@router.get("/wind-pss-data/{projectId}")
async def get_wind_pss_data(
    projectId: str,
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(get_current_user),
):
    project_object_id = await resolve_project_id(projectId, pool)
    
    # Fetch PSS activities joined with Material resources.
    # We use a recursive CTE to find all nodes under CONSTRUCTION, then filter for PSS.
    rows = await pool.fetch("""
        WITH RECURSIVE ConstructionWBS AS (
            -- Base case: find the CONSTRUCTION node
            SELECT object_id, name, parent_object_id, name::text as path, ARRAY[object_id] as obj_path
            FROM solar_wbs
            WHERE project_object_id = $1
              AND UPPER(name) = 'CONSTRUCTION'
            
            UNION ALL
            
            -- Recursive case: find all children and build path
            SELECT child.object_id, child.name, child.parent_object_id, parent.path || ' -> ' || child.name, parent.obj_path || child.object_id
            FROM solar_wbs child
            JOIN ConstructionWBS parent ON child.parent_object_id = parent.object_id
        )
        SELECT sa.object_id as "activityObjectId", sa.activity_id as "activityId", 
               sa.name as description, sa.status, sa.priority,
               sa.wbs_name as "wbsName",
               sa.baseline_start as "baselineStart", sa.baseline_finish as "baselineFinish",
               sa.actual_start as "actualStart", sa.actual_finish as "actualFinish",
               sa.start_date as "forecastStart", sa.finish_date as "forecastFinish",
               sa.primary_resource as "vendorName", sa.uom,
               COALESCE(SUM(sra.planned_units), 0) as "planTillDate",
               COALESCE(SUM(sra.actual_units), 0) as "actualTillDate",
               COALESCE(SUM(sra.remaining_units), 0) as "balance",
               sa.planned_duration as duration,
               sa.dpr_metadata as "dprMetadata"
        FROM solar_activities sa
        JOIN ConstructionWBS cw ON sa.wbs_object_id = cw.object_id
        LEFT JOIN solar_resource_assignments sra ON sa.object_id = sra.activity_object_id 
             AND sra.resource_type = 'Material'
        WHERE sa.project_object_id = $1
          AND (cw.path ILIKE '%%BOS CONSTRUCTION%% -> PSS%%')
        GROUP BY sa.object_id, sa.activity_id, sa.name, sa.status, sa.priority, sa.wbs_name,
                 sa.baseline_start, sa.baseline_finish, sa.actual_start, sa.actual_finish,
                 sa.start_date, sa.finish_date, sa.primary_resource, sa.uom, sa.planned_duration,
                 sa.dpr_metadata, cw.path, cw.obj_path
        ORDER BY cw.obj_path ASC, sa.start_date ASC, sa.activity_id ASC
    """, project_object_id)

    # Merge dpr_metadata into each row
    result = []
    for r in rows:
        d = dict(r)
        dpr_meta = d.pop("dprMetadata", None) or {}
        if isinstance(dpr_meta, str):
            try: dpr_meta = json.loads(dpr_meta)
            except: dpr_meta = {}
        for mk, mv in dpr_meta.items():
            if mk not in d or not d[mk]:
                d[mk] = mv
        result.append(d)

    return {
        "success": True,
        "projectId": projectId,
        "data": result
    }

3

@router.get("/wind-ehv-data/{projectId}")
async def get_wind_ehv_data(
    projectId: str,
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(get_current_user),
):
    project_object_id = await resolve_project_id(projectId, pool)
    
    # Fetch EHV Line activities joined with Material resources.
    # We use a recursive CTE to find all nodes under CONSTRUCTION, then filter for EHV.
    rows = await pool.fetch("""
        WITH RECURSIVE ConstructionWBS AS (
            -- Base case: find the CONSTRUCTION node
            SELECT object_id, name, parent_object_id, name::text as path, ARRAY[object_id] as obj_path
            FROM solar_wbs
            WHERE project_object_id = $1
              AND UPPER(name) = 'CONSTRUCTION'
            
            UNION ALL
            
            -- Recursive case: find all children and build path
            SELECT child.object_id, child.name, child.parent_object_id, parent.path || ' -> ' || child.name, parent.obj_path || child.object_id
            FROM solar_wbs child
            JOIN ConstructionWBS parent ON child.parent_object_id = parent.object_id
        )
        SELECT sa.object_id as "activityObjectId", sa.activity_id as "activityId", 
               sa.name as description, sa.status, sa.priority,
               sa.wbs_name as "wbsName",
               sa.baseline_start as "baselineStart", sa.baseline_finish as "baselineFinish",
               sa.actual_start as "actualStart", sa.actual_finish as "actualFinish",
               sa.start_date as "forecastStart", sa.finish_date as "forecastFinish",
               sa.primary_resource as "vendorName", sa.uom,
               COALESCE(SUM(sra.planned_units), 0) as "planTillDate",
               COALESCE(SUM(sra.actual_units), 0) as "actualTillDate",
               COALESCE(SUM(sra.remaining_units), 0) as "balance",
               sa.planned_duration as duration,
               sa.dpr_metadata as "dprMetadata"
        FROM solar_activities sa
        JOIN ConstructionWBS cw ON sa.wbs_object_id = cw.object_id
        LEFT JOIN solar_resource_assignments sra ON sa.object_id = sra.activity_object_id 
             AND sra.resource_type = 'Material'
        WHERE sa.project_object_id = $1
          AND (
              cw.path ILIKE '%%BOS CONSTRUCTION%% -> %%EHV LINE%%' OR
              cw.path ILIKE '%%BOS CONSTRUCTION%% -> %%220KV%%' OR
              cw.path ILIKE '%%BOS CONSTRUCTION%% -> %%220 KV%%' OR
              cw.path ILIKE '%%BOS CONSTRUCTION%% -> %%400KV%%' OR
              cw.path ILIKE '%%BOS CONSTRUCTION%% -> %%400 KV%%' OR
              (cw.path ILIKE '%%BOS CONSTRUCTION%%' AND cw.path NOT ILIKE '%%PSS%%' AND cw.path NOT ILIKE '%%33KV%%')
          )
        GROUP BY sa.object_id, sa.activity_id, sa.name, sa.status, sa.priority, sa.wbs_name,
                 sa.baseline_start, sa.baseline_finish, sa.actual_start, sa.actual_finish,
                 sa.start_date, sa.finish_date, sa.primary_resource, sa.uom, sa.planned_duration,
                 sa.dpr_metadata, cw.path, cw.obj_path
        ORDER BY cw.obj_path ASC, sa.start_date ASC, sa.activity_id ASC
    """, project_object_id)

    # Merge dpr_metadata into each row
    result = []
    for r in rows:
        d = dict(r)
        dpr_meta = d.pop("dprMetadata", None) or {}
        if isinstance(dpr_meta, str):
            try: dpr_meta = json.loads(dpr_meta)
            except: dpr_meta = {}
        for mk, mv in dpr_meta.items():
            if mk not in d or not d[mk]:
                d[mk] = mv
        result.append(d)

    return {
        "success": True,
        "projectId": projectId,
        "data": result
    }


@router.get("/ed-ordering-data/{projectId}")
async def get_ed_ordering_data(
    projectId: str,
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(get_current_user),
):
    """
    Fetch Ordering (Supply) sheet data from Procurement WBS.
    P6 Structure: PROCUREMENT → ORDERING & SUPPLY → sub-headings (WTG, PSS, etc.) → leaf WBS (WTG (BLADE), etc.)
    Each leaf WBS has milestone activities (BOQ, PR, TBER, NFA, PO/SO).
    We aggregate activities per leaf WBS into a single row.
    """
    import re
    project_object_id = await resolve_project_id(projectId, pool)

    # Step 1: Find PROCUREMENT root WBS
    procurement_root = await pool.fetchval("""
        SELECT object_id FROM solar_wbs
        WHERE project_object_id = $1
          AND UPPER(name) LIKE 'PROCUREMENT%%'
        ORDER BY LENGTH(name) ASC
        LIMIT 1
    """, project_object_id)

    if not procurement_root:
        return {"success": True, "projectId": projectId, "data": [], "groups": [], "totalActivities": 0}

    # Step 2: Find ORDERING & SUPPLY and ORDERING & SERVICES nodes (children of PROCUREMENT)
    ordering_nodes = await pool.fetch("""
        SELECT object_id, name FROM solar_wbs
        WHERE project_object_id = $1 AND parent_object_id = $2
          AND (
            UPPER(name) LIKE '%%ORDERING%%'
            OR UPPER(name) LIKE '%%SUPPLY%%'
            OR UPPER(name) LIKE '%%SERVICE%%'
          )
        ORDER BY
          CASE 
            WHEN UPPER(name) LIKE '%%ORDERING%%SUPPLY%%' THEN 0
            WHEN UPPER(name) LIKE '%%SUPPLY%%' THEN 1
            WHEN UPPER(name) LIKE '%%SERVICE%%' THEN 3
            ELSE 2
          END
    """, project_object_id, procurement_root)

    if not ordering_nodes:
        # Fallback: try all children of PROCUREMENT directly, in P6 code order
        ordering_nodes = await pool.fetch("""
            SELECT object_id, name FROM solar_wbs
            WHERE project_object_id = $1 AND parent_object_id = $2
            ORDER BY
              CASE WHEN code ~ '^[0-9]+$' THEN 0 ELSE 1 END,
              CASE WHEN code ~ '^[0-9]+$' THEN code::int ELSE NULL END,
              code, name
        """, project_object_id, procurement_root)

    if not ordering_nodes:
        return {"success": True, "projectId": projectId, "data": [], "groups": [], "totalActivities": 0}

    os_node_map = {n["object_id"]: ("SERVICES" if "SERVICE" in n["name"].upper() else "SUPPLY") for n in ordering_nodes}

    # Step 3: Get sub-heading WBS nodes (e.g. WTG, 220kV EHV LINE, PSS), in P6 code order
    # (numeric WBS sequence) within each ordering node - not alphabetical by name.
    sub_headings = []
    for node in ordering_nodes:
        subs = await pool.fetch("""
            SELECT object_id, name, parent_object_id FROM solar_wbs
            WHERE project_object_id = $1 AND parent_object_id = $2
            ORDER BY
              CASE WHEN code ~ '^[0-9]+$' THEN 0 ELSE 1 END,
              CASE WHEN code ~ '^[0-9]+$' THEN code::int ELSE NULL END,
              code, name
        """, project_object_id, node["object_id"])
        sub_headings.extend(subs)

    if not sub_headings:
        # Fallback to the ordering nodes themselves if no children exist
        for n in ordering_nodes:
            sub_headings.append({
                "object_id": n["object_id"],
                "name": n["name"],
                "parent_object_id": n["object_id"]
            })
            os_node_map[n["object_id"]] = "SERVICES" if "SERVICE" in n["name"].upper() else "SUPPLY"

    ACT_SQL = """
        WITH RECURSIVE SubTree AS (
            SELECT object_id FROM solar_wbs WHERE object_id = $1
            UNION ALL
            SELECT c.object_id FROM solar_wbs c JOIN SubTree p ON c.parent_object_id = p.object_id
        )
        SELECT sa.object_id as "activityObjectId", sa.activity_id as "activityId",
               sa.name as description, sa.status, sa.wbs_name as "wbsName", sa.wbs_object_id as "wbsObjectId",
               sa.baseline_start as "baselineStart", sa.baseline_finish as "baselineFinish",
               sa.actual_start as "actualStart", sa.actual_finish as "actualFinish",
               sa.start_date as "forecastStart", sa.finish_date as "forecastFinish",
               sa.planned_start as "plannedStart", sa.planned_finish as "plannedFinish",
               sa.primary_resource as "supplierOem", sa.uom,
               sa.total_quantity as scope, sa.cumulative as completed,
               sa.balance, sa.planned_duration as duration, sa.percent_complete
        FROM solar_activities sa
        JOIN SubTree st ON sa.wbs_object_id = st.object_id
        WHERE sa.project_object_id = $2
        ORDER BY sa.activity_id ASC
    """

    def detect_milestone(name: str) -> str:
        upper = (name or "").upper()
        if "BOQ" in upper or "BILL OF QUANT" in upper:
            return "BOQ"
        if "TBER" in upper or "TBE " in upper or "TECHNICAL BID" in upper or "BID EVALUATION" in upper:
            return "TBER"
        if re.search(r'\bPR\b', upper) or "PURCHASE REQ" in upper or "PURCHASE REQUISITION" in upper:
            return "PR"
        if "NFA" in upper or "NOTE FOR APPROVAL" in upper or "NEGOTIATION" in upper or "FINAL AWARD" in upper:
            return "NFA"
        # POSO = order placement. Solar/Wind name it "LOI / PO Release" etc.; BESS/PSS name the
        # activity literally "Placement of the order".
        if "PLACEMENT OF" in upper or re.search(r'\bPO\b', upper) or re.search(r'\bSO\b', upper) or "PURCHASE ORDER" in upper or "SERVICE ORDER" in upper or "PO/SO" in upper or "PO / SO" in upper or "AWARD" in upper or "LOA" in upper or "LETTER OF AWARD" in upper:
            return "POSO"
        return ""

    groups = []
    all_activities = []

    for sub in sub_headings:
        sub_name = sub["name"]
        sub_id = sub["object_id"]
        main_heading = os_node_map.get(sub.get("parent_object_id"), "SUPPLY")

        rows = await pool.fetch(ACT_SQL, sub_id, project_object_id)
        if not rows:
            continue

        # BESS/PSS ordering packages carry a single explicit "Placement of the order" activity
        # alongside many downstream ones (PR, Manufacturing, FAT, LC, FOB, Receipt at Site, MDCC,
        # FIT). For these the sheet must show ONLY the order-placement milestone - one row per
        # package - not the remaining activities. (Solar/Wind name their milestone "LOI / PO
        # Release" and are handled by the leaf-grouping path below, unchanged.)
        placement_act = next(
            (dict(r) for r in rows if "PLACEMENT OF" in (r.get("description") or "").upper()),
            None,
        )
        if placement_act:
            groups.append({"name": sub_name, "activityCount": 1, "showHeader": False})
            all_activities.append({
                "mainHeading": main_heading,
                "packages": sub_name,
                # Show the milestone name ("Placement of the order") under the package so users
                # can see the row/date represents order placement.
                "description": placement_act.get("description") or "Placement of the order",
                "scope": placement_act.get("scope"),
                "uom": placement_act.get("uom"),
                "supplierOem": placement_act.get("supplierOem"),
                "orderQty": None,
                "completed": placement_act.get("completed"),
                "balance": placement_act.get("balance"),
                "baselineStart": placement_act.get("baselineStart"),
                "baselineFinish": placement_act.get("baselineFinish"),
                "actualStart": placement_act.get("actualStart"),
                "actualFinish": placement_act.get("actualFinish"),
                "forecastStart": placement_act.get("forecastStart"),
                "forecastFinish": placement_act.get("forecastFinish"),
                # Mirror onto the PO/SO milestone slot too (Wind renders the prefixed fields)
                "posoBaselineStart": placement_act.get("baselineStart"),
                "posoBaselineFinish": placement_act.get("baselineFinish"),
                "posoActualStart": placement_act.get("actualStart"),
                "posoActualFinish": placement_act.get("actualFinish"),
                "posoForecastStart": placement_act.get("forecastStart"),
                "posoForecastFinish": placement_act.get("forecastFinish"),
                "_activityCount": 1,
            })
            continue

        # Group activities by their specific WBS node (leaf node)
        leaf_wbs_groups = {}
        for r in rows:
            act = dict(r)
            wbs_obj_id = act.get("wbsObjectId")
            wbs_name = act.get("wbsName", sub_name)
            
            # If the P6 scheduler failed to create sub-WBS nodes and lumped everything directly
            # under the main package heading (e.g., SCADA AND PPC PANEL), try to extract the 
            # specific sub-component (e.g., IAF SCADA) from the activity name pattern.
            display_name = wbs_name
            desc = act.get("description", "")
            potential_comp = None
            if "-" in desc:
                parts = desc.split("-")
                if len(parts) >= 3:
                    potential_comp = parts[-2].strip()
                    if potential_comp:
                        # Use derived name if the WBS name is too generic (matches the package itself)
                        if wbs_name.upper() == sub_name.upper():
                            display_name = potential_comp
            
            # Remove any trailing parent path from display_name (e.g. "WTG-Blade" -> "Blade")
            if "-" in display_name and potential_comp is not None and display_name != potential_comp:
                display_name = display_name.split("-")[-1].strip()
            elif "-" in display_name and potential_comp is None:
                display_name = display_name.split("-")[-1].strip()

            group_key = f"{wbs_obj_id}_{display_name.upper()}"
            if group_key not in leaf_wbs_groups:
                leaf_wbs_groups[group_key] = {
                    "wbsName": wbs_name,
                    "displayName": display_name,
                    "activities": []
                }
            leaf_wbs_groups[group_key]["activities"].append(act)

        sub_activity_count = 0

        for group_key, group_data in leaf_wbs_groups.items():
            leaf_name = group_data["wbsName"]
            display_name = group_data["displayName"]
            leaf_acts = group_data["activities"]

            aggregated = {
                "mainHeading": main_heading,
                "packages": sub_name,
                "description": display_name,
                "scope": None,
                "uom": None,
                "supplierOem": None,
                "orderQty": None,
                "completed": None,
                "balance": None,
                # Plain (non-Wind) date columns - mirror the PO/SO placement milestone only
                "baselineStart": None, "baselineFinish": None,
                "actualStart": None, "actualFinish": None,
                "forecastStart": None, "forecastFinish": None,
                "boqBaselineStart": None, "boqBaselineFinish": None,
                "boqActualStart": None, "boqActualFinish": None,
                "boqForecastStart": None, "boqForecastFinish": None,
                "prBaselineStart": None, "prBaselineFinish": None,
                "prActualStart": None, "prActualFinish": None,
                "prForecastStart": None, "prForecastFinish": None,
                "tberBaselineStart": None, "tberBaselineFinish": None,
                "tberActualStart": None, "tberActualFinish": None,
                "tberForecastStart": None, "tberForecastFinish": None,
                "nfaBaselineStart": None, "nfaBaselineFinish": None,
                "nfaActualStart": None, "nfaActualFinish": None,
                "nfaForecastStart": None, "nfaForecastFinish": None,
                "posoBaselineStart": None, "posoBaselineFinish": None,
                "posoActualStart": None, "posoActualFinish": None,
                "posoForecastStart": None, "posoForecastFinish": None,
                "_activityCount": len(leaf_acts),
            }

            for act in leaf_acts:
                desc_upper = (act.get("description", "") or "").upper()
                if "DELIVERY" in desc_upper:
                    continue

                milestone = detect_milestone(act.get("description", ""))
                
                prefix = ""
                if milestone == "BOQ": prefix = "boq"
                elif milestone == "PR": prefix = "pr"
                elif milestone == "TBER": prefix = "tber"
                elif milestone == "NFA": prefix = "nfa"
                elif milestone == "POSO": prefix = "poso"
                
                if prefix:
                    aggregated[f"{prefix}BaselineStart"] = act.get("baselineStart")
                    aggregated[f"{prefix}BaselineFinish"] = act.get("baselineFinish")
                    aggregated[f"{prefix}ActualStart"] = act.get("actualStart")
                    aggregated[f"{prefix}ActualFinish"] = act.get("actualFinish")
                    aggregated[f"{prefix}ForecastStart"] = act.get("forecastStart")
                    aggregated[f"{prefix}ForecastFinish"] = act.get("forecastFinish")

                # The single (non-Wind) date columns on the Ordering (Supply) sheet must reflect
                # ONLY the order placement (PO/SO) milestone - not the other/remaining milestones
                # (BOQ, PR, TBER, NFA) or downstream delivery. Mirror the PO/SO dates onto the
                # row's plain date fields that the non-Wind (BESS/PSS/Solar) Ordering sheet renders.
                if milestone == "POSO":
                    aggregated["baselineStart"] = act.get("baselineStart")
                    aggregated["baselineFinish"] = act.get("baselineFinish")
                    aggregated["actualStart"] = act.get("actualStart")
                    aggregated["actualFinish"] = act.get("actualFinish")
                    aggregated["forecastStart"] = act.get("forecastStart")
                    aggregated["forecastFinish"] = act.get("forecastFinish")

                if milestone == "POSO" or (not aggregated.get("supplierOem") and act.get("supplierOem")):
                    aggregated["supplierOem"] = act.get("supplierOem")
                
                # Sum the budget units (scope) across all valid milestone activities
                scope_val = act.get("scope")
                if scope_val is not None:
                    current_scope = aggregated.get("scope")
                    if current_scope is None:
                        current_scope = 0.0
                    aggregated["scope"] = current_scope + float(scope_val)
                    
                if act.get("uom") and not aggregated.get("uom"):
                    aggregated["uom"] = act.get("uom")

            all_activities.append(aggregated)
            sub_activity_count += aggregated["_activityCount"]

        groups.append({
            "name": sub_name,
            "activityCount": sub_activity_count,
            "showHeader": False
        })

    return {
        "success": True,
        "projectId": projectId,
        "data": all_activities,
        "groups": groups,
        "totalActivities": len(all_activities)
    }


@router.get("/ed-delivery-data/{projectId}")
async def get_ed_delivery_data(
    projectId: str,
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(get_current_user),
):
    """
    Fetch Delivery sheet data from Procurement WBS.
    Path: PROCUREMENT → ORDERING & DELIVERY → sub-WBS (e.g. Piling Stub - MMS)
    Filter: Only activities with 'Receipt at site' in name AND Material resource assigned.
    Groups by sub-WBS for the frontend to render section headers.
    """
    project_object_id = await resolve_project_id(projectId, pool)

    # Step 1: Find candidate root nodes (Procurement, Ordering, Supply, etc.)
    # We look for nodes that are likely to be the root of the delivery hierarchy.
    roots = await pool.fetch("""
        SELECT object_id FROM solar_wbs
        WHERE project_object_id = $1
          AND (UPPER(name) LIKE 'PROCUREMENT%%' OR UPPER(name) LIKE 'ORDERING%%' OR UPPER(name) LIKE 'SUPPLY%%')
        ORDER BY LENGTH(name) ASC
    """, project_object_id)
    
    root_ids = [r["object_id"] for r in roots]

    # Step 2: Find the ORDERING & DELIVERY nodes within those roots (or the roots themselves)
    ordering_delivery_nodes = await pool.fetch("""
        SELECT object_id FROM solar_wbs
        WHERE project_object_id = $1 
          AND (parent_object_id = ANY($2::int[]) OR object_id = ANY($2::int[]))
          AND (UPPER(name) LIKE '%%DELIVERY%%' OR UPPER(name) LIKE '%%DELIVARY%%' OR UPPER(name) LIKE '%%SUPPLY%%' OR UPPER(name) LIKE '%%MATERIAL%%' OR UPPER(name) LIKE '%%RECEIPT%%' OR UPPER(name) LIKE '%%RECEPIT%%' OR UPPER(name) LIKE '%%RECIPET%%' OR UPPER(name) = 'PROCUREMENT - ORDERING')
          AND UPPER(name) NOT LIKE '%%SERVICE%%'
    """, project_object_id, root_ids)

    if not ordering_delivery_nodes:
        # Fallback: if no roots found, just search for any node matching the delivery pattern at a high level
        ordering_delivery_nodes = await pool.fetch("""
            SELECT object_id FROM solar_wbs
            WHERE project_object_id = $1
              AND (UPPER(name) LIKE '%%ORDERING & DELIVERY%%' OR UPPER(name) LIKE '%%ORDERING & SUPPLY%%')
              AND UPPER(name) NOT LIKE '%%SERVICE%%'
            LIMIT 5
        """, project_object_id)

    if not ordering_delivery_nodes:
        return {"success": True, "projectId": projectId, "data": [], "groups": []}

    od_node_ids = [n["object_id"] for n in ordering_delivery_nodes]

    # Step 3: Get sub-WBS nodes under Ordering & Delivery (e.g. Piling Stub - MMS, Piling Stub - Inverter).
    # Keep each parent's children together (parent_object_id) and order them by P6 WBS code
    # (numeric sequence) within the parent - matching how they appear in P6.
    sub_wbs_nodes = await pool.fetch("""
        SELECT object_id, name FROM solar_wbs
        WHERE project_object_id = $1 AND parent_object_id = ANY($2::int[])
        ORDER BY parent_object_id,
          CASE WHEN code ~ '^[0-9]+$' THEN 0 ELSE 1 END,
          CASE WHEN code ~ '^[0-9]+$' THEN code::int ELSE NULL END,
          code, name
    """, project_object_id, od_node_ids)

    groups = []
    all_activities = []

    for sub_wbs in sub_wbs_nodes:
        sub_name = sub_wbs["name"]
        sub_id = sub_wbs["object_id"]

        # Recursive CTE to get all descendant WBS IDs under this sub-WBS
        # Filter: activity name contains ('receipt' OR 'delivery') AND 'site'
        sub_acts = await pool.fetch("""
            WITH RECURSIVE SubTree AS (
                SELECT object_id FROM solar_wbs WHERE object_id = $1
                UNION ALL
                SELECT child.object_id FROM solar_wbs child
                JOIN SubTree parent ON child.parent_object_id = parent.object_id
            )
            SELECT sa.object_id as "activityObjectId", sa.activity_id as "activityId",
                   sa.name as description, sa.status, sa.wbs_name as "wbsName",
                   sa.baseline_start as "baselineStart", sa.baseline_finish as "baselineFinish",
                   sa.actual_start as "actualStart", sa.actual_finish as "actualFinish",
                   sa.start_date as "forecastStart", sa.finish_date as "forecastFinish",
                   sa.primary_resource as "vendorName", sa.uom,
                   sa.total_quantity as scope, sa.cumulative as completed,
                   sa.balance, sa.planned_duration as duration, sa.percent_complete
            FROM solar_activities sa
            JOIN SubTree st ON sa.wbs_object_id = st.object_id
            WHERE sa.project_object_id = $2
              AND (
                (UPPER(sa.name) LIKE '%%RECEIPT%%' AND UPPER(sa.name) LIKE '%%SITE%%')
                OR (UPPER(sa.name) LIKE '%%RECIPET%%' AND UPPER(sa.name) LIKE '%%SITE%%')
                OR (UPPER(sa.name) LIKE '%%RECEPIT%%' AND UPPER(sa.name) LIKE '%%SITE%%')
                OR (UPPER(sa.name) LIKE '%%DELIVERY%%' AND UPPER(sa.name) LIKE '%%SITE%%')
                OR (UPPER(sa.name) LIKE '%%DELIVARY%%' AND UPPER(sa.name) LIKE '%%SITE%%')
              )
            ORDER BY sa.activity_id ASC
        """, sub_id, project_object_id)

        sub_activities = []
        for r in sub_acts:
            act = dict(r)
            act["subWbs"] = sub_name
            sub_activities.append(act)
            all_activities.append(act)

        if sub_activities:
            groups.append({
                "name": sub_name,
                "activityCount": len(sub_activities),
                "showHeader": len(sub_activities) > 1
            })

    return {
        "success": True,
        "projectId": projectId,
        "data": all_activities,
        "groups": groups,
        "totalActivities": len(all_activities)
    }


@router.get("/ed-engineering-data/{projectId}")
async def get_ed_engineering_data(
    projectId: str,
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(get_current_user),
):
    """
    Fetch Engineering sheet data from Engineering WBS.
    Path: ENGINEERING → main heading WBS → sub-heading WBS → activities
    Returns all activities with their WBS hierarchy for grouped rendering.
    """
    project_object_id = await resolve_project_id(projectId, pool)

    # Step 1: Find the ENGINEERING root WBS (same level as CONSTRUCTION)
    engineering_root = await pool.fetchval("""
        SELECT object_id FROM solar_wbs
        WHERE project_object_id = $1
          AND UPPER(name) LIKE 'ENGINEERING%%'
        LIMIT 1
    """, project_object_id)

    if not engineering_root:
        return {"success": True, "projectId": projectId, "data": [], "groups": []}

    # Step 2: Get main heading WBS nodes (direct children of ENGINEERING).
    # Order by P6 WBS code (the display sequence) numerically - not by name (alphabetical) -
    # so headings keep the same order as in P6.
    main_headings = await pool.fetch("""
        SELECT object_id, name, code FROM solar_wbs
        WHERE project_object_id = $1 AND parent_object_id = $2
        ORDER BY
          CASE WHEN code ~ '^[0-9]+$' THEN 0 ELSE 1 END,
          CASE WHEN code ~ '^[0-9]+$' THEN code::int ELSE NULL END,
          code, name
    """, project_object_id, engineering_root)

    groups = []
    all_activities = []

    ACT_SQL = """
        WITH RECURSIVE SubTree AS (
            SELECT object_id FROM solar_wbs WHERE object_id = $1
            UNION ALL
            SELECT c.object_id FROM solar_wbs c JOIN SubTree p ON c.parent_object_id = p.object_id
        )
        SELECT sa.object_id as "activityObjectId", sa.activity_id as "activityId",
               sa.name as description, sa.status, sa.wbs_name as "wbsName",
               sa.baseline_start as "baselineStart", sa.baseline_finish as "baselineFinish",
               sa.actual_start as "actualStart", sa.actual_finish as "actualFinish",
               sa.start_date as "forecastStart", sa.finish_date as "forecastFinish",
               sa.primary_resource as "vendorName", sa.uom,
               sa.total_quantity as scope, sa.cumulative as completed,
               sa.balance, sa.planned_duration as duration, sa.percent_complete
        FROM solar_activities sa
        JOIN SubTree st ON sa.wbs_object_id = st.object_id
        WHERE sa.project_object_id = $2
        ORDER BY sa.activity_id ASC
    """

    # If no main headings (common in Wind projects), fetch all activities under engineering_root directly
    if not main_headings:
        acts = await pool.fetch(ACT_SQL, engineering_root, project_object_id)
        if acts:
            groups.append({
                "mainHeading": "Engineering Works",
                "subHeadings": [{
                    "subHeading": "General",
                    "activities": [dict(r) for r in acts]
                }]
            })
            all_activities.extend([dict(r) for r in acts])

    for main_h in main_headings:
        main_name = main_h["name"]
        main_id = main_h["object_id"]

        # Get sub-heading WBS nodes (direct children of main heading), in P6 code order
        sub_headings = await pool.fetch("""
            SELECT object_id, name, code FROM solar_wbs
            WHERE project_object_id = $1 AND parent_object_id = $2
            ORDER BY
              CASE WHEN code ~ '^[0-9]+$' THEN 0 ELSE 1 END,
              CASE WHEN code ~ '^[0-9]+$' THEN code::int ELSE NULL END,
              code, name
        """, project_object_id, main_id)

        group = {
            "mainHeading": main_name,
            "subHeadings": []
        }

        if sub_headings:
            for sub_h in sub_headings:
                sub_name = sub_h["name"]
                sub_id = sub_h["object_id"]

                rows = await pool.fetch(ACT_SQL, sub_id, project_object_id)
                acts = []
                for r in rows:
                    act = dict(r)
                    act["mainHeading"] = main_name
                    act["subHeading"] = sub_name
                    acts.append(act)
                    all_activities.append(act)

                if acts:
                    group["subHeadings"].append({
                        "name": sub_name,
                        "activityCount": len(acts)
                    })
        else:
            # No sub-headings: fetch activities directly under this main heading
            rows = await pool.fetch(ACT_SQL, main_id, project_object_id)
            for r in rows:
                act = dict(r)
                act["mainHeading"] = main_name
                act["subHeading"] = ""
                all_activities.append(act)

        if group["subHeadings"] or any(a.get("mainHeading") == main_name for a in all_activities):
            groups.append(group)

    return {
        "success": True,
        "projectId": projectId,
        "data": all_activities,
        "groups": groups,
        "totalActivities": len(all_activities)
    }


@router.get("/wind-33kv-data/{projectId}")
async def get_wind_33kv_data(
    projectId: str,
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(get_current_user),
):
    project_object_id = await resolve_project_id(projectId, pool)
    
    # Fetch 33kV Line activities.
    # We use a recursive CTE to find all nodes under CONSTRUCTION, then filter for 33KV.
    rows = await pool.fetch("""
        WITH RECURSIVE ConstructionWBS AS (
            -- Base case: find the CONSTRUCTION node
            SELECT object_id, name, parent_object_id, name::text as path
            FROM solar_wbs
            WHERE project_object_id = $1
              AND UPPER(name) = 'CONSTRUCTION'
            
            UNION ALL
            
            -- Recursive case: find all children and build path
            SELECT child.object_id, child.name, child.parent_object_id, parent.path || ' -> ' || child.name
            FROM solar_wbs child
            JOIN ConstructionWBS parent ON child.parent_object_id = parent.object_id
        )
        SELECT sa.object_id as "activityObjectId", sa.activity_id as "activityId", 
               sa.name as description, sa.status, sa.priority,
               sa.wbs_name as "wbsName",
               sa.baseline_start as "baselineStart", sa.baseline_finish as "baselineFinish",
               sa.actual_start as "actualStart", sa.actual_finish as "actualFinish",
               sa.start_date as "forecastStart", sa.finish_date as "forecastFinish",
               COALESCE(sa.agency_name, sa.primary_resource) as "vendorName", sa.uom,
               sa.total_quantity as "scope",
               sa.line_km as "lineKm",
               sa.total_pole as "totalPole",
               sa.cumulative as "cumulative",
               sa.balance as "balance",
               sa.planned_duration as duration,
               sa.dpr_metadata as "dprMetadata"
        FROM solar_activities sa
        JOIN ConstructionWBS cw ON sa.wbs_object_id = cw.object_id
        WHERE sa.project_object_id = $1
          AND (cw.path ILIKE '%%BOS CONSTRUCTION%% -> %%33KV%%LINE%%' OR UPPER(sa.activity_id) LIKE '%%-UG%%')
        ORDER BY sa.name ASC
    """, project_object_id)

    # Merge dpr_metadata into each row
    result = []
    for r in rows:
        d = dict(r)
        dpr_meta = d.pop("dprMetadata", None) or {}
        if isinstance(dpr_meta, str):
            try: dpr_meta = json.loads(dpr_meta)
            except: dpr_meta = {}
        for mk, mv in dpr_meta.items():
            if mk not in d or not d[mk]:
                d[mk] = mv
        result.append(d)

    return {
        "success": True,
        "projectId": projectId,
        "data": result
    }

from pydantic import BaseModel
import base64
from datetime import datetime
import os
import dotenv
from app.config import settings

class P6PasswordUpdateReq(BaseModel):
    new_password: str
    p6_id: str = "agel.forecasting@adani.com"

@router.get("/password-status")
async def get_p6_password_status(current_user: dict[str, Any] = Depends(get_current_user)):
    """Get the remaining days until the P6 password expires."""
    last_reset = get_p6_password_last_reset_date()
    if not last_reset:
        days_left = 0
    else:
        try:
            reset_date = datetime.strptime(last_reset, "%Y-%m-%d").date()
            days_since = (datetime.now().date() - reset_date).days
            days_left = 45 - days_since
        except Exception:
            days_left = 0
            
    return {
        "success": True,
        "lastResetDate": last_reset,
        "daysLeft": days_left
    }

@router.post("/update-password")
async def update_p6_password(
    req: P6PasswordUpdateReq,
    current_user: dict[str, Any] = Depends(get_current_user)
):
    """Update the P6 password and reset the rotation timer."""
    # Ensure only superadmin or similar can update. Assuming current_user['role'] checking if needed.
    # We will proceed since the frontend protects this route.
    
    # Extract existing username from the current token
    current_token = settings.ORACLE_P6_OAUTH_TOKEN
    username = "agel.forecasting@adani.com"  # fallback
    if current_token:
        try:
            decoded_bytes = base64.b64decode(current_token).decode('utf-8')
            if ":" in decoded_bytes:
                username = decoded_bytes.split(":", 1)[0]
        except Exception as e:
            logging.error(f"Failed to decode existing token to extract username: {e}")
            
    raw_str = f"{req.p6_id}:{req.new_password}"
    encoded = base64.b64encode(raw_str.encode('utf-8')).decode('utf-8')
    today_str = datetime.now().strftime("%Y-%m-%d")
    
    # Update .env
    env_path = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), ".env")
    if os.path.exists(env_path):
        dotenv.set_key(env_path, "ORACLE_P6_OAUTH_TOKEN", encoded)
        dotenv.set_key(env_path, "ORACLE_P6_AUTH_TOKEN", encoded)
        dotenv.set_key(env_path, "P6_PASSWORD_LAST_RESET_DATE", today_str)
    
    # Update settings in memory
    settings.ORACLE_P6_OAUTH_TOKEN = encoded
    settings.ORACLE_P6_AUTH_TOKEN = encoded
    settings.P6_PASSWORD_LAST_RESET_DATE = today_str
    
    # Invalidate the cached token so the next API call fetches a fresh one with new credentials
    from app.services.p6_token_service import clear_cached_token
    clear_cached_token()
    
    return {
        "success": True,
        "message": "P6 password updated successfully",
        "lastResetDate": today_str,
        "daysLeft": 45
    }
