# app/routers/oracle_p6.py
"""
Oracle P6 integration router.
Direct port of Express routes/oracleP6.js
"""

import json
import logging
from datetime import datetime
from typing import Optional, Any
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sync_all_p6_data import sync_data
from app.auth.dependencies import get_current_user
from app.database import get_db, PoolWrapper
from app.services.cache_service import cache
from app.routers.project_utils import resolve_project_id


import re

logger = logging.getLogger("adani-flow.oracle_p6")

def extract_block_from_name(name: str) -> str:
    if not name:
        return ""
    # Matches "Block-01", "Block 01", "Block01" anywhere in the name
    match = re.search(r'(Block[-\s]*\d+)', name, re.IGNORECASE)
    return match.group(1).strip().upper() if match else ""

router = APIRouter(prefix="/api/oracle-p6", tags=["Oracle P6"])






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
               sa.planned_finish as "PlannedFinishDate", sa.percent_complete as "PercentComplete"
        FROM solar_activities sa
        WHERE sa.project_object_id = $1 ORDER BY sa.planned_start
    """, project_object_id)

    data = [{"activityId": str(r["activity_id"] or ""), "activities": r["activities"] or "", "description": r["activities"] or "", "plot": "", "block": r["block"] or "", "priority": "", "contractorName": "", "scope": "", "yesterdayValue": "", "todayValue": ""} for r in rows]
    return {"message": "DP Block data fetched from P6", "projectId": projectId, "rowCount": len(data), "data": data, "source": "p6"}


@router.get("/dp-vendor-idt-data")
async def get_dp_vendor_idt_data(
    projectId: str,
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(get_current_user),
):
    project_object_id = await resolve_project_id(projectId, pool)
    rows = await pool.fetch("""
        SELECT sa.object_id as activity_id, sa.name as activities,
               sa.planned_start as idt_date, sa.actual_start as actual_date, sa.status as "Status"
        FROM solar_activities sa WHERE sa.project_object_id = $1 ORDER BY sa.planned_start
    """, project_object_id)

    data = [{"activityId": str(r["activity_id"] or ""), "activities": r["activities"] or "", "description": r["activities"] or "", "plot": "", "vendor": "", "idtDate": r["idt_date"].strftime("%Y-%m-%d") if r["idt_date"] else "", "actualDate": r["actual_date"].strftime("%Y-%m-%d") if r["actual_date"] else "", "status": r["Status"] or "", "yesterdayValue": "", "todayValue": ""} for r in rows]
    return {"message": "DP Vendor IDT data fetched from P6", "projectId": projectId, "rowCount": len(data), "data": data, "source": "p6"}


@router.get("/dp-vendor-block-data")
async def get_dp_vendor_block_data(
    projectId: str,
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(get_current_user),
):
    project_object_id = await resolve_project_id(projectId, pool)
    rows = await pool.fetch("""
        SELECT sa.object_id as activity_id, sa.name as activities, sa.wbs_name as plot,
               sa.percent_complete as "PercentComplete"
        FROM solar_activities sa
        WHERE sa.project_object_id = $1 ORDER BY sa.planned_start
    """, project_object_id)

    data = [{"activityId": str(r["activity_id"] or ""), "activities": r["activities"] or "", "description": r["activities"] or "", "plot": r["plot"] or "", "newBlockNom": "", "priority": "", "baselinePriority": "", "contractorName": "", "scope": "", "holdDueToWtg": "", "front": "", "actual": "", "completionPercentage": f"{r['PercentComplete']}%" if r["PercentComplete"] else "", "remarks": "", "yesterdayValue": "", "todayValue": ""} for r in rows]
    return {"message": "DP Vendor Block data fetched from P6", "projectId": projectId, "rowCount": len(data), "data": data, "source": "p6"}


@router.get("/manpower-details-data")
async def get_manpower_details_data(
    projectId: str,
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(get_current_user),
):
    project_object_id = await resolve_project_id(projectId, pool)
    
    rows = await pool.fetch("""
        SELECT sa.activity_id,
               sa.name as activity_name,
               COALESCE(sa.new_block_nom, sa.plot, sa.wbs_name, '') as block,
               COALESCE(SUM(sra.planned_units), 0) as budgeted_units,
               COALESCE(SUM(sra.actual_units), 0) as actual_units,
               COALESCE(SUM(sra.remaining_units), 0) as remaining_units,
               sa.percent_complete,
               COALESCE(MAX(sra.hours_per_day), sa.hours_per_day, 8) as hours_per_day
        FROM solar_resource_assignments sra
        LEFT JOIN solar_activities sa ON sra.activity_object_id = sa.object_id
        WHERE sra.resource_type = 'Labor'
          AND sra.project_object_id = $1
        GROUP BY sa.activity_id, sa.name, sa.new_block_nom, sa.plot, sa.wbs_name, sa.percent_complete, sa.hours_per_day
        ORDER BY sa.name ASC, sa.activity_id ASC
    """, project_object_id)

    data = []
    for r in rows:
        budgeted = float(r["budgeted_units"] or 0)
        actual = float(r["actual_units"] or 0)
        p6_remaining = float(r["remaining_units"] or 0)
        
        # Calculate derived remaining if P6 says 0 but we have a budget/actual gap
        # Or if the user expects the difference
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

        hours_per_day = float(r["hours_per_day"] or 8)
        
        # Convert Man-hours to Man-days based on the activity calendar
        budgeted_days = budgeted / hours_per_day if hours_per_day > 0 else 0
        actual_days = actual / hours_per_day if hours_per_day > 0 else 0
        remaining_days = final_remaining / hours_per_day if hours_per_day > 0 else 0

        data.append({
            "activityId": str(r["activity_id"] or ""),
            "description": activity_name,
            "block": final_block,
            "budgetedUnits": str(round(budgeted_days, 2)),
            "actualUnits": str(round(actual_days, 2)),
            "remainingUnits": str(round(remaining_days, 2)),
            "percentComplete": f"{pct:.2f}%",
            "hoursPerDay": hours_per_day,
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
            project_object_id = await resolve_project_id(project_id, pool)
            if project_object_id:
                await pool.execute("""
                    UPDATE projects 
                    SET is_syncing = FALSE, sync_message = 'Sync failed. Please try again.' 
                    WHERE object_id = $1
                """, project_object_id)
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
        FROM p6_projects ORDER BY "Name"
    """)
    return {"message": "Projects fetched successfully", "projects": [dict(r) for r in rows], "source": "local-db"}


@router.get("/activity-fields")
async def get_activity_fields(current_user: dict[str, Any] = Depends(get_current_user)):
    return {
        "message": "Activity fields - Oracle P6 API equivalent",
        "fields": [
            "ObjectId", "Name", "ProjectId", "WBSObjectId",
            "PlannedStartDate", "PlannedFinishDate", "ActualStartDate", "ActualFinishDate",
            "BaselineStartDate", "BaselineFinishDate", "ForecastStartDate", "ForecastFinishDate",
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
    """Sync resources from P6. Placeholder for actual REST client logic."""
    return {"success": True, "message": "Resource sync placeholder", "total": 0, "synced": 0, "errors": 0}


@router.post("/sync-all-projects")
async def sync_all_projects(
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(get_current_user),
):
    """Sync all projects from P6. Placeholder for actual REST client logic."""
    return {"message": "Project sync placeholder", "synced": 0}


@router.get("/yesterday-values")
async def get_yesterday_values(
    projectObjectId: Optional[str] = None,
    targetDate: Optional[str] = None,
    sheet_type: Optional[str] = None,
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(get_current_user),
):
    """Fetch progress values from the previous day."""
    if not targetDate:
        from datetime import datetime, timedelta
        targetDate = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")

    query = """
        SELECT 
            sa.object_id as "activityObjectId", 
            sa.name, 
            sa.object_id as "activityId",
            sa.activity_id as "stringActivityId",
            COALESCE(SUM(CASE WHEN dp.progress_date = $1 THEN dp.today_value ELSE 0 END), 0) as "yesterdayValue",
            COALESCE(SUM(CASE WHEN dp.progress_date < $1 THEN dp.today_value ELSE 0 END), 0) as "cumulativeValue",
            MAX(dp.sheet_type) as "sheetType",
            TRUE as is_approved
        FROM solar_activities sa
        LEFT JOIN dpr_daily_progress dp ON sa.object_id = dp.activity_object_id AND dp.progress_date <= $1
    """
    params = [targetDate]

    filter_clauses = " WHERE 1=1 "
    # Add sheet_type filter if provided
    if sheet_type:
        filter_clauses += f" AND dp.sheet_type = ${len(params) + 1}"
        params.append(sheet_type)

    # Look up the ObjectId from the P6 Id if provided
    if projectObjectId:
        actual_project_object_id = await resolve_project_id(projectObjectId, pool)
        if actual_project_object_id:
            filter_clauses += f" AND sa.project_object_id = ${len(params) + 1}"
            params.append(actual_project_object_id)
            
    query += filter_clauses
    query += """
        GROUP BY sa.object_id, sa.name, sa.activity_id
        HAVING COALESCE(SUM(CASE WHEN dp.progress_date = $1 THEN dp.today_value ELSE 0 END), 0) > 0 
            OR COALESCE(SUM(CASE WHEN dp.progress_date < $1 THEN dp.today_value ELSE 0 END), 0) > 0
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
        SELECT DISTINCT sra.resource_object_id as object_id, sra.resource_name as name,
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
                           sa.balance, sa.planned_duration as duration, sa.percent_complete
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
                       sa.balance, sa.planned_duration as duration, sa.percent_complete
                FROM solar_activities sa
                JOIN SubTree st ON sa.wbs_object_id = st.object_id
                WHERE sa.project_object_id = $2
                ORDER BY sa.name ASC
            """, heading_wbs_id, project_object_id)

            for r in direct_acts:
                act = dict(r)
                act["mainHeading"] = heading_name
                act["subHeading"] = ""
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
               sa.balance, sa.planned_duration as duration, sa.percent_complete, sa.priority
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
               sa.primary_resource as "vendorName", sa.uom,
               COALESCE(SUM(sra.planned_units), 0) as "planTillDate",
               COALESCE(SUM(sra.actual_units), 0) as "actualTillDate",
               COALESCE(SUM(sra.remaining_units), 0) as "balance",
               sa.planned_duration as duration
        FROM solar_activities sa
        JOIN ConstructionWBS cw ON sa.wbs_object_id = cw.object_id
        LEFT JOIN solar_resource_assignments sra ON sa.object_id = sra.activity_object_id 
             AND sra.resource_type = 'Material'
        WHERE sa.project_object_id = $1
          AND (cw.path ILIKE '%%BOS CONSTRUCTION%% -> PSS%%')
        GROUP BY sa.object_id, sa.activity_id, sa.name, sa.status, sa.priority, sa.wbs_name,
                 sa.baseline_start, sa.baseline_finish, sa.actual_start, sa.actual_finish,
                 sa.start_date, sa.finish_date, sa.primary_resource, sa.uom, sa.planned_duration,
                 cw.path
        ORDER BY cw.path ASC, sa.name ASC
    """, project_object_id)

    return {
        "success": True,
        "projectId": projectId,
        "data": [dict(r) for r in rows]
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
               sa.primary_resource as "vendorName", sa.uom,
               COALESCE(SUM(sra.planned_units), 0) as "planTillDate",
               COALESCE(SUM(sra.actual_units), 0) as "actualTillDate",
               COALESCE(SUM(sra.remaining_units), 0) as "balance",
               sa.planned_duration as duration
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
                 cw.path
        ORDER BY sa.name ASC
    """, project_object_id)

    return {
        "success": True,
        "projectId": projectId,
        "data": [dict(r) for r in rows]
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

    # Step 3: Get sub-WBS nodes under Ordering & Delivery (e.g. Piling Stub - MMS, Piling Stub - Inverter)
    sub_wbs_nodes = await pool.fetch("""
        SELECT object_id, name FROM solar_wbs
        WHERE project_object_id = $1 AND parent_object_id = ANY($2::int[])
        ORDER BY object_id
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

    # Step 2: Get main heading WBS nodes (direct children of ENGINEERING)
    main_headings = await pool.fetch("""
        SELECT object_id, name FROM solar_wbs
        WHERE project_object_id = $1 AND parent_object_id = $2
        ORDER BY name
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

        # Get sub-heading WBS nodes (direct children of main heading)
        sub_headings = await pool.fetch("""
            SELECT object_id, name FROM solar_wbs
            WHERE project_object_id = $1 AND parent_object_id = $2
            ORDER BY name
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
               sa.primary_resource as "vendorName", sa.uom,
               sa.total_quantity as "scope",
               sa.cumulative as "cumulative",
               sa.balance as "balance",
               sa.planned_duration as duration
        FROM solar_activities sa
        JOIN ConstructionWBS cw ON sa.wbs_object_id = cw.object_id
        WHERE sa.project_object_id = $1
          AND (cw.path ILIKE '%%BOS CONSTRUCTION%% -> %%33KV%%LINE%%' OR UPPER(sa.activity_id) LIKE '%%-UG%%')
        ORDER BY sa.name ASC
    """, project_object_id)

    return {
        "success": True,
        "projectId": projectId,
        "data": [dict(r) for r in rows]
    }
