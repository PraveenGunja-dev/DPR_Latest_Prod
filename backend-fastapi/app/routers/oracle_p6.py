# app/routers/oracle_p6.py
"""
Oracle P6 integration router.
Direct port of Express routes/oracleP6.js
"""

import json
import logging
from typing import Optional, Any
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sync_all_p6_data import sync_data
from app.auth.dependencies import get_current_user
from app.database import get_db, PoolWrapper
from app.services.cache_service import cache
from app.routers.project_utils import resolve_project_id


logger = logging.getLogger("adani-flow.oracle_p6")

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

    data = [{"activityId": str(r["activity_id"] or ""), "activities": r["activities"] or "", "plot": "", "block": r["block"] or "", "priority": "", "contractorName": "", "scope": "", "yesterdayValue": "", "todayValue": ""} for r in rows]
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

    data = [{"activityId": str(r["activity_id"] or ""), "activities": r["activities"] or "", "plot": "", "vendor": "", "idtDate": r["idt_date"].strftime("%Y-%m-%d") if r["idt_date"] else "", "actualDate": r["actual_date"].strftime("%Y-%m-%d") if r["actual_date"] else "", "status": r["Status"] or "", "yesterdayValue": "", "todayValue": ""} for r in rows]
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

    data = [{"activityId": str(r["activity_id"] or ""), "activities": r["activities"] or "", "plot": r["plot"] or "", "newBlockNom": "", "priority": "", "baselinePriority": "", "contractorName": "", "scope": "", "holdDueToWtg": "", "front": "", "actual": "", "completionPercentage": f"{r['PercentComplete']}%" if r["PercentComplete"] else "", "remarks": "", "yesterdayValue": "", "todayValue": ""} for r in rows]
    return {"message": "DP Vendor Block data fetched from P6", "projectId": projectId, "rowCount": len(data), "data": data, "source": "p6"}


@router.get("/manpower-details-data")
async def get_manpower_details_data(
    projectId: str,
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(get_current_user),
):
    project_object_id = await resolve_project_id(projectId, pool)
    
    # Aggregate only MP (Manpower) resource assignments per activity
    # Returns same column set as Vendor IDT for consistent display
    # NOTE: Pass LIKE pattern as parameter $2 to avoid psycopg interpreting % as placeholder
    mp_pattern = "%MP%"
    rows = await pool.fetch("""
        SELECT sa.activity_id,
               sa.name as activity_name,
               COALESCE(sa.new_block_nom, sa.plot, sa.wbs_name, '') as block,
               COALESCE(SUM(sra.planned_units), 0) as budgeted_units,
               COALESCE(SUM(sra.actual_units), 0) as actual_units,
               COALESCE(SUM(sra.remaining_units), 0) as remaining_units,
               sa.percent_complete
        FROM solar_resource_assignments sra
        LEFT JOIN solar_activities sa ON sra.activity_object_id = sa.object_id
        WHERE UPPER(sra.resource_id) LIKE $2
          AND sra.project_object_id = $1
        GROUP BY sa.activity_id, sa.name, sa.new_block_nom, sa.plot, sa.wbs_name, sa.percent_complete
        ORDER BY sa.name ASC, sa.activity_id ASC
    """, project_object_id, mp_pattern)

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
            
        data.append({
            "activityId": str(r["activity_id"] or ""),
            "description": r["activity_name"] or "",
            "block": (r["block"] or "").upper(),
            "budgetedUnits": str(round(budgeted, 2)),
            "actualUnits": str(round(actual, 2)),
            "remainingUnits": str(round(final_remaining, 2)),
            "percentComplete": f"{pct:.2f}%",
            "yesterdayValue": "",
            "todayValue": "",
        })
    return {"message": "Manpower Details fetched from P6", "projectId": projectId, "rowCount": len(data), "totalManpower": len(data), "data": data, "source": "p6"}


async def run_sync_and_flush_cache(project_id, pool):
    """Run sync and flush cache once done."""
    try:
        await sync_data(target_project_id=project_id, full_sync=False, pool=pool)
        await cache.flush_all()
        logger.info(f"Sync complete and cache flushed for project {project_id}")
    except Exception as e:
        logger.error(f"Error in background sync for project {project_id}: {e}")

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
    return {"projectId": project_id, "projectObjectId": project_object_id, "lastSync": row["LastSyncAt"] if row else None}


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
        WITH LatestProgress AS (
            SELECT dp.activity_object_id, dp.sheet_type, MAX(dp.progress_date) as max_date
            FROM dpr_daily_progress dp
            JOIN solar_activities sa ON dp.activity_object_id = sa.object_id
            WHERE dp.progress_date <= $1
    """
    params = [targetDate]

    filter_clauses = ""
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
            GROUP BY dp.activity_object_id, dp.sheet_type
        )
        SELECT lp.activity_object_id as "activityObjectId", sa.name, sa.object_id as "activityId",
               sa.activity_id as "stringActivityId",
               dp.today_value as "yesterdayValue",
               dp.cumulative_value as "cumulativeValue",
               dp.sheet_type as "sheetType",
               TRUE as is_approved
        FROM LatestProgress lp
        JOIN dpr_daily_progress dp ON lp.activity_object_id = dp.activity_object_id 
                                   AND lp.sheet_type = dp.sheet_type 
                                   AND lp.max_date = dp.progress_date
        JOIN solar_activities sa ON lp.activity_object_id = sa.object_id
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

    # Filter for MT (Material/Machine) resources only for the Resources/Machine tab
    rows = await pool.fetch("""
        SELECT DISTINCT sra.resource_object_id as object_id, sra.resource_name as name,
               sra.resource_type, sa.uom as "UnitOfMeasure"
        FROM solar_resource_assignments sra
        JOIN solar_activities sa ON sra.activity_object_id = sa.object_id
        WHERE sra.project_object_id = $1
          AND (UPPER(sra.resource_id) LIKE '%%MT%%' OR sra.resource_type = 'Material')
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
