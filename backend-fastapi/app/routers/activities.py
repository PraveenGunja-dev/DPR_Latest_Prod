# app/routers/activities.py
"""
Activities router.
Reads from solar_activities (new type-specific table).
Falls back to p6_activities for backward compatibility.
"""

import json
import logging
from typing import Optional, Any

from fastapi import APIRouter, Depends, HTTPException, Query

from app.auth.dependencies import get_current_user
from app.database import get_db, PoolWrapper
from app.routers.project_utils import resolve_project_id

logger = logging.getLogger("adani-flow.activities")

router = APIRouter(prefix="/api/dpr-activities", tags=["DPR Activities"])


@router.get("/activities/{project_id}")
async def get_project_activities_paginated(
    project_id: str,
    page: int = Query(1),
    limit: int = Query(2000),
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(get_current_user),
):
    """Get paginated activities for a project."""
    logger.info(f"Fetching activities for project {project_id}, page {page}, limit {limit}")
    
    project_object_id = await resolve_project_id(project_id, pool)
    offset = (page - 1) * limit
    rows = await pool.fetch("""
        SELECT object_id as "activityObjectId", activity_id as "activityId", name, status,
               planned_start as "plannedStartDate", planned_finish as "plannedFinishDate",
               start_date as "startDate", finish_date as "finishDate",
               start_date as "forecastStartDate", finish_date as "forecastFinishDate",
               baseline_start as "baselineStartDate", baseline_finish as "baselineFinishDate",
               baseline1_start as "baseline1StartDate", baseline1_finish as "baseline1FinishDate",
               baseline2_start as "baseline2StartDate", baseline2_finish as "baseline2FinishDate",
               baseline3_start as "baseline3StartDate", baseline3_finish as "baseline3FinishDate",
               actual_start as "actualStartDate", actual_finish as "actualFinishDate",
               percent_complete as "percentComplete",
               physical_percent_complete as "physicalPercentComplete",
               wbs_object_id as "wbsObjectId", wbs_name as "wbsName",
               uom as "unitOfMeasure", total_quantity as "targetQty", 
               scope, front, hold as "holdDueToWTG", block_capacity as "blockCapacity",
               phase, spv_no as "spvNumber", priority, plot, new_block_nom as "newBlockNom",
               discipline, weightage, activity_type as "activityType",
               primary_resource as "primaryResource",
               planned_duration as "plannedDuration",
               remaining_duration as "remainingDuration",
               actual_duration as "actualDuration",
               balance, cumulative
        FROM solar_activities 
        WHERE project_object_id = $1
        ORDER BY name ASC, activity_id ASC
        LIMIT $2 OFFSET $3
    """, project_object_id, limit, offset)
    
    total = await pool.fetchval('SELECT COUNT(*) FROM solar_activities WHERE project_object_id = $1', project_object_id)
    
    print(f"DEBUG: Successfully fetched {len(rows)} activities from DB (total_in_db={total})")
    
    return {
        "success": True,
        "projectObjectId": project_object_id,
        "totalCount": total,
        "page": page,
        "limit": limit,
        "totalPages": (total + limit - 1) // limit if total else 0,
        "activities": [dict(r) for r in rows]
    }


@router.get("/dp-qty/{project_id}")
async def get_dp_qty_activities(
    project_id: str,
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(get_current_user),
):
    """Get activities for DP Qty sheet."""
    project_object_id = await resolve_project_id(project_id, pool)

    rows = await pool.fetch("""
        SELECT sa.object_id as "activityObjectId", sa.activity_id as "activityId",
               sa.name, sa.status,
               sa.planned_start as "plannedStartDate", sa.planned_finish as "plannedFinishDate",
               sa.start_date as "forecastStartDate", sa.finish_date as "forecastFinishDate",
               sa.baseline_start as "baselineStartDate", sa.baseline_finish as "baselineFinishDate",
               sa.baseline1_start as "baseline1StartDate", sa.baseline1_finish as "baseline1FinishDate",
               sa.baseline2_start as "baseline2StartDate", sa.baseline2_finish as "baseline2FinishDate",
               sa.baseline3_start as "baseline3StartDate", sa.baseline3_finish as "baseline3FinishDate",
               sa.actual_start as "actualStartDate", sa.actual_finish as "actualFinishDate",
               sa.total_quantity as "targetQty",
               sa.balance, sa.cumulative,
               sa.percent_complete as "percentComplete",
               sa.physical_percent_complete as "physicalPercentComplete",
               sa.primary_resource as "contractorName",
               sa.uom as "unitOfMeasure"
        FROM solar_activities sa
        WHERE sa.project_object_id = $1
        ORDER BY sa.name ASC, sa.activity_id ASC
    """, project_object_id)
    
    return {
        "success": True,
        "projectObjectId": project_id,
        "count": len(rows),
        "data": [dict(r) for r in rows]
    }


@router.get("/sync-status")
async def get_activities_sync_status(
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(get_current_user),
):
    """Get overall activities sync status."""
    row = await pool.fetchrow('SELECT MAX("LastSyncAt") as last_sync FROM p6_projects')
    return {"lastSync": row["last_sync"] if row else None}


@router.get("")
async def get_activities(
    projectId: Optional[str] = None,
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(get_current_user),
):
    """Get activities, optionally filtered by project."""
    if projectId:
        rows = await pool.fetch("""
            SELECT object_id as "ObjectId", activity_id as "Id", name as "Name",
                   project_object_id as "ProjectObjectId", wbs_object_id as "WBSObjectId",
                   planned_start as "PlannedStartDate", planned_finish as "PlannedFinishDate",
                   start_date as "StartDate", finish_date as "FinishDate",
                   actual_start as "ActualStartDate", actual_finish as "ActualFinishDate",
                   percent_complete as "PercentComplete", status as "Status"
            FROM solar_activities WHERE project_object_id = $1
            ORDER BY name ASC, activity_id ASC
        """, projectId)
    else:
        rows = await pool.fetch("""
            SELECT object_id as "ObjectId", activity_id as "Id", name as "Name",
                   project_object_id as "ProjectObjectId", wbs_object_id as "WBSObjectId",
                   planned_start as "PlannedStartDate", planned_finish as "PlannedFinishDate",
                   start_date as "StartDate", finish_date as "FinishDate",
                   actual_start as "ActualStartDate", actual_finish as "ActualFinishDate",
                   percent_complete as "PercentComplete", status as "Status"
            FROM solar_activities ORDER BY name ASC, activity_id ASC LIMIT 100
        """)
    return [dict(r) for r in rows]


@router.get("/fields")
async def get_activity_fields(current_user: dict[str, Any] = Depends(get_current_user)):
    """Get available activity fields."""
    return {
        "fields": [
            "ObjectId", "Name", "ProjectId", "WBSObjectId",
            "PlannedStartDate", "PlannedFinishDate", "ActualStartDate", "ActualFinishDate",
            "BaselineStartDate", "BaselineFinishDate", "ForecastStartDate", "ForecastFinishDate",
            "PercentComplete", "PhysicalPercentComplete", "Duration", "RemainingDuration",
            "ActualDuration", "Status", "ActivityType", "Critical", "ResourceNames",
        ]
    }


@router.get("/{activity_id}")
async def get_activity(
    activity_id: int,
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(get_current_user),
):
    row = await pool.fetchrow(
        'SELECT * FROM solar_activities WHERE object_id = $1', activity_id
    )
    if not row:
        raise HTTPException(404, detail={"message": "Activity not found"})
    return dict(row)


@router.post("/", status_code=201)
async def create_activity(
    body: dict[str, Any],
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(get_current_user),
):
    if current_user["role"] not in ("PMAG", "Super Admin"):
        raise HTTPException(403, detail={"message": "Access denied"})

    row = await pool.fetchrow("""
        INSERT INTO solar_activities (name, project_object_id, wbs_object_id, planned_start, planned_finish, status)
        VALUES ($1, $2, $3, $4, $5, $6) RETURNING *
    """,
        body.get("Name"), body.get("ProjectObjectId"), body.get("WBSObjectId"),
        body.get("PlannedStartDate"), body.get("PlannedFinishDate"), body.get("Status", "Not Started"),
    )
    return dict(row)


@router.put("/{activity_id}")
async def update_activity(
    activity_id: int,
    body: dict[str, Any],
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(get_current_user),
):
    if current_user["role"] not in ("PMAG", "Super Admin"):
        raise HTTPException(403, detail={"message": "Access denied"})

    fields = body.copy()
    if "ObjectId" in fields:
        del fields["ObjectId"]

    if not fields:
        raise HTTPException(400, detail={"message": "No fields to update"})

    sets = []
    vals = []
    idx = 1
    for k, v in fields.items():
        sets.append(f'{k} = ${idx}')
        vals.append(v)
        idx += 1
    vals.append(activity_id)

    row = await pool.fetchrow(
        f'UPDATE solar_activities SET {", ".join(sets)} WHERE object_id = ${idx} RETURNING *',
        *vals,
    )
    if not row:
        raise HTTPException(404, detail={"message": "Activity not found"})
    return dict(row)


@router.delete("/{activity_id}")
async def delete_activity(
    activity_id: int,
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(get_current_user),
):
    if current_user["role"] not in ("PMAG", "Super Admin"):
        raise HTTPException(403, detail={"message": "Access denied"})

    row = await pool.fetchrow(
        'DELETE FROM solar_activities WHERE object_id = $1 RETURNING object_id', activity_id
    )
    if not row:
        raise HTTPException(404, detail={"message": "Activity not found"})
    return {"message": "Activity deleted successfully"}
