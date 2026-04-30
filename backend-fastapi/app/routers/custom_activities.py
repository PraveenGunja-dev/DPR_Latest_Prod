# app/routers/custom_activities.py
"""
CRUD API for DPR-level custom activities.
These activities are tracked within the DPR application only — never pushed to P6.
They persist across P6 syncs and are scoped per project + sheet_type.
"""

import logging
import json
from typing import Optional, Any
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from app.auth.dependencies import get_current_user
from app.database import get_db, PoolWrapper
from app.routers.project_utils import resolve_project_id

logger = logging.getLogger("adani-flow.custom_activities")

router = APIRouter(prefix="/api/custom-activities", tags=["Custom Activities"])


class CustomActivityCreate(BaseModel):
    projectId: int
    sheetType: str
    description: str
    uom: Optional[str] = None
    scope: Optional[float] = 0
    cumulative: Optional[float] = 0
    wbsName: Optional[str] = None
    category: Optional[str] = None
    block: Optional[str] = None
    plannedStart: Optional[str] = None
    plannedFinish: Optional[str] = None
    actualStart: Optional[str] = None
    actualFinish: Optional[str] = None
    status: Optional[str] = "Not Started"
    remarks: Optional[str] = None
    extraData: Optional[dict[str, Any]] = None
    sortOrder: Optional[int] = 0


class CustomActivityUpdate(BaseModel):
    description: Optional[str] = None
    uom: Optional[str] = None
    scope: Optional[float] = None
    cumulative: Optional[float] = None
    wbsName: Optional[str] = None
    category: Optional[str] = None
    block: Optional[str] = None
    plannedStart: Optional[str] = None
    plannedFinish: Optional[str] = None
    actualStart: Optional[str] = None
    actualFinish: Optional[str] = None
    status: Optional[str] = None
    remarks: Optional[str] = None
    extraData: Optional[dict[str, Any]] = None
    sortOrder: Optional[int] = None


def _parse_date(val: Optional[str]):
    """Convert a date string to a date object, or None."""
    if not val or val in ('-', '', 'null', 'None'):
        return None
    from datetime import datetime
    try:
        return datetime.strptime(val.split('T')[0], "%Y-%m-%d").date()
    except Exception:
        return None


def _row_to_dict(r) -> dict:
    """Convert a DB row to a frontend-friendly dictionary."""
    scope = float(r["scope"] or 0)
    cumulative = float(r["cumulative"] or 0)
    balance = scope - cumulative

    # Handle extra_data depending on if it's parsed by asyncpg or returned as string
    extra = {}
    if r.get("extra_data"):
        if isinstance(r["extra_data"], str):
            try:
                extra = json.loads(r["extra_data"])
            except:
                pass
        else:
            extra = r["extra_data"]

    base_dict = {
        "id": r["id"],
        "activityId": r["activity_id"] or f"DPR-{r['project_id']}-{r['id']}",
        "description": r["description"] or "",
        "uom": r["uom"] or "",
        "scope": str(scope) if scope else "",
        "completed": str(cumulative) if cumulative else "",
        "cumulative": str(cumulative) if cumulative else "",
        "balance": str(balance) if balance else "",
        "wbsName": r["wbs_name"] or "",
        "category": r["category"] or "",
        "block": r["block"] or "",
        "plannedStart": r["planned_start"].strftime("%Y-%m-%d") if r["planned_start"] else "",
        "plannedFinish": r["planned_finish"].strftime("%Y-%m-%d") if r["planned_finish"] else "",
        "actualStart": r["actual_start"].strftime("%Y-%m-%d") if r["actual_start"] else "",
        "actualFinish": r["actual_finish"].strftime("%Y-%m-%d") if r["actual_finish"] else "",
        "status": r["status"] or "Not Started",
        "remarks": r["remarks"] or "",
        "sortOrder": r["sort_order"] or 0,
        "source": "custom",  # Always mark as DPR-level
        "isCustom": True,
        "planTillDate": str(scope) if scope else "",
        "actualTillDate": str(cumulative) if cumulative else "",
    }
    
    # Merge extraData attributes into the main dictionary (e.g., vendorName, feeder)
    for k, v in extra.items():
        if k not in base_dict:
            base_dict[k] = v
            
    return base_dict


@router.get("")
async def get_custom_activities(
    projectId: str,
    sheetType: Optional[str] = None,
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(get_current_user),
):
    """Fetch all custom activities for a project, optionally filtered by sheet_type."""
    project_object_id = await resolve_project_id(projectId, pool)

    if sheetType:
        rows = await pool.fetch("""
            SELECT * FROM dpr_custom_activities
            WHERE project_id = $1 AND sheet_type = $2 AND is_active = TRUE
            ORDER BY sort_order ASC, id ASC
        """, project_object_id, sheetType)
    else:
        rows = await pool.fetch("""
            SELECT * FROM dpr_custom_activities
            WHERE project_id = $1 AND is_active = TRUE
            ORDER BY sheet_type, sort_order ASC, id ASC
        """, project_object_id)

    return {
        "success": True,
        "projectId": projectId,
        "data": [_row_to_dict(r) for r in rows],
        "count": len(rows)
    }


@router.post("")
async def create_custom_activity(
    body: CustomActivityCreate,
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(get_current_user),
):
    """Create a new DPR-level custom activity."""
    project_object_id = await resolve_project_id(str(body.projectId), pool)
    user_id = current_user.get("user_id") or current_user.get("userId")

    scope = body.scope or 0
    cumulative = body.cumulative or 0
    balance = max(0, scope - cumulative)

    extra_data_json = json.dumps(body.extraData) if body.extraData else None

    row = await pool.fetchrow("""
        INSERT INTO dpr_custom_activities
            (project_id, sheet_type, description, uom, scope, cumulative, balance,
             wbs_name, category, block,
             planned_start, planned_finish, actual_start, actual_finish,
             status, remarks, extra_data, sort_order, created_by, updated_by)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $19)
        RETURNING *
    """,
        project_object_id, body.sheetType, body.description, body.uom,
        scope, cumulative, balance,
        body.wbsName, body.category, body.block,
        _parse_date(body.plannedStart), _parse_date(body.plannedFinish),
        _parse_date(body.actualStart), _parse_date(body.actualFinish),
        body.status, body.remarks, extra_data_json, body.sortOrder or 0, user_id
    )

    # Generate a readable activity_id
    await pool.execute(
        "UPDATE dpr_custom_activities SET activity_id = $1 WHERE id = $2",
        f"DPR-{project_object_id}-{row['id']}", row['id']
    )

    logger.info(f"Custom activity created: id={row['id']} project={project_object_id} sheet={body.sheetType} by user={user_id}")

    return {
        "success": True,
        "activity": _row_to_dict(row)
    }


@router.put("/{activity_id}")
async def update_custom_activity(
    activity_id: int,
    body: CustomActivityUpdate,
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(get_current_user),
):
    """Update an existing DPR-level custom activity."""
    user_id = current_user.get("user_id") or current_user.get("userId")

    existing = await pool.fetchrow(
        "SELECT * FROM dpr_custom_activities WHERE id = $1 AND is_active = TRUE", activity_id
    )
    if not existing:
        raise HTTPException(404, detail="Custom activity not found")

    # Build dynamic update
    updates = {}
    if body.description is not None:
        updates["description"] = body.description
    if body.uom is not None:
        updates["uom"] = body.uom
    if body.scope is not None:
        updates["scope"] = body.scope
    if body.cumulative is not None:
        updates["cumulative"] = body.cumulative
    if body.wbsName is not None:
        updates["wbs_name"] = body.wbsName
    if body.category is not None:
        updates["category"] = body.category
    if body.block is not None:
        updates["block"] = body.block
    if body.plannedStart is not None:
        updates["planned_start"] = _parse_date(body.plannedStart)
    if body.plannedFinish is not None:
        updates["planned_finish"] = _parse_date(body.plannedFinish)
    if body.actualStart is not None:
        updates["actual_start"] = _parse_date(body.actualStart)
    if body.actualFinish is not None:
        updates["actual_finish"] = _parse_date(body.actualFinish)
    if body.status is not None:
        updates["status"] = body.status
    if body.remarks is not None:
        updates["remarks"] = body.remarks
    if body.extraData is not None:
        updates["extra_data"] = json.dumps(body.extraData)
    if body.sortOrder is not None:
        updates["sort_order"] = body.sortOrder

    # Recalculate balance
    new_scope = updates.get("scope", float(existing["scope"] or 0))
    new_cumulative = updates.get("cumulative", float(existing["cumulative"] or 0))
    updates["balance"] = max(0, new_scope - new_cumulative)

    if not updates:
        raise HTTPException(400, detail="No fields to update")

    # Build SET clause
    set_parts = []
    params = []
    for i, (col, val) in enumerate(updates.items(), start=1):
        set_parts.append(f"{col} = ${i}")
        params.append(val)

    params.append(user_id)
    params.append(activity_id)
    set_clause = ", ".join(set_parts)

    row = await pool.fetchrow(f"""
        UPDATE dpr_custom_activities
        SET {set_clause}, updated_by = ${len(params) - 1}, updated_at = NOW()
        WHERE id = ${len(params)}
        RETURNING *
    """, *params)

    return {
        "success": True,
        "activity": _row_to_dict(row)
    }


@router.delete("/{activity_id}")
async def delete_custom_activity(
    activity_id: int,
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(get_current_user),
):
    """Soft-delete a DPR-level custom activity."""
    user_id = current_user.get("user_id") or current_user.get("userId")

    row = await pool.fetchrow(
        "SELECT id FROM dpr_custom_activities WHERE id = $1 AND is_active = TRUE", activity_id
    )
    if not row:
        raise HTTPException(404, detail="Custom activity not found")

    await pool.execute("""
        UPDATE dpr_custom_activities
        SET is_active = FALSE, updated_by = $1, updated_at = NOW()
        WHERE id = $2
    """, user_id, activity_id)

    logger.info(f"Custom activity soft-deleted: id={activity_id} by user={user_id}")

    return {"success": True, "message": f"Activity {activity_id} deleted"}


@router.post("/bulk")
async def bulk_create_custom_activities(
    body: dict[str, Any],
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(get_current_user),
):
    """Bulk-create multiple DPR-level custom activities."""
    project_id = body.get("projectId")
    sheet_type = body.get("sheetType")
    activities = body.get("activities", [])

    if not project_id or not sheet_type or not activities:
        raise HTTPException(400, detail="projectId, sheetType, and activities are required")

    project_object_id = await resolve_project_id(str(project_id), pool)
    user_id = current_user.get("user_id") or current_user.get("userId")

    created = []
    for i, act in enumerate(activities):
        scope = float(act.get("scope", 0) or 0)
        cumulative = float(act.get("cumulative", 0) or 0)
        balance = max(0, scope - cumulative)
        
        extra_data = act.get("extraData")
        extra_data_json = json.dumps(extra_data) if extra_data else None

        row = await pool.fetchrow("""
            INSERT INTO dpr_custom_activities
                (project_id, sheet_type, description, uom, scope, cumulative, balance,
                 wbs_name, category, block,
                 planned_start, planned_finish,
                 status, remarks, extra_data, sort_order, created_by, updated_by)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $17)
            RETURNING *
        """,
            project_object_id, sheet_type,
            act.get("description", ""),
            act.get("uom", ""),
            scope, cumulative, balance,
            act.get("wbsName", ""),
            act.get("category", ""),
            act.get("block", ""),
            _parse_date(act.get("plannedStart")),
            _parse_date(act.get("plannedFinish")),
            act.get("status", "Not Started"),
            act.get("remarks", ""),
            extra_data_json,
            act.get("sortOrder", i),
            user_id
        )
        await pool.execute(
            "UPDATE dpr_custom_activities SET activity_id = $1 WHERE id = $2",
            f"DPR-{project_object_id}-{row['id']}", row['id']
        )
        created.append(_row_to_dict(row))

    logger.info(f"Bulk created {len(created)} custom activities for project={project_object_id} sheet={sheet_type}")

    return {
        "success": True,
        "created": len(created),
        "data": created
    }
