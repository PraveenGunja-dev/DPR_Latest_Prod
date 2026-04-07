# app/routers/charts.py
"""
Charts router – 8 chart data endpoints.
Direct port of Express routes/charts.js
"""

import logging
from typing import Optional

from fastapi import APIRouter, Depends, Query

from app.auth.dependencies import get_current_user
from app.database import get_db, PoolWrapper
from app.routers.project_utils import resolve_project_id

from typing import Optional, Any

logger = logging.getLogger("adani-flow.charts")

router = APIRouter(prefix="/api/charts", tags=["Charts"])


@router.get("/planned-vs-actual")
async def planned_vs_actual(
    projectId: Optional[str] = None,
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(get_current_user),
):
    try:
        if projectId and str(projectId) not in ("null", "undefined", "all", ""):
            project_object_id = await resolve_project_id(projectId, pool)
            rows = await pool.fetch("""
                SELECT TO_CHAR(sa.planned_finish, 'Mon-YY') as name,
                       COALESCE(SUM(sra.planned_units), 0) as planned,
                       COALESCE(SUM(sra.actual_units), 0) as actual
                FROM solar_activities sa
                LEFT JOIN solar_resource_assignments sra ON sa.object_id = sra.activity_object_id
                WHERE sa.project_object_id = $1 AND sa.planned_finish IS NOT NULL
                GROUP BY 1, sa.planned_finish
                ORDER BY MIN(sa.planned_finish) LIMIT 12
            """, project_object_id)
        else:
            rows = await pool.fetch("""
                SELECT TO_CHAR(sa.planned_finish, 'Mon-YY') as name,
                       COALESCE(SUM(sra.planned_units), 0) as planned,
                       COALESCE(SUM(sra.actual_units), 0) as actual
                FROM solar_activities sa
                LEFT JOIN solar_resource_assignments sra ON sa.object_id = sra.activity_object_id
                WHERE sa.planned_finish IS NOT NULL
                  AND sa.planned_finish >= NOW() - INTERVAL '6 months'
                GROUP BY 1
                ORDER BY MIN(sa.planned_finish) LIMIT 12
            """)
        return [{"name": r["name"], "planned": float(r["planned"] or 0), "actual": float(r["actual"] or 0)} for r in rows]
    except Exception as e:
        logger.error(f"Error: {e}")
        return []


@router.get("/completion-delay")
async def completion_delay(
    projectId: Optional[str] = None,
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(get_current_user),
):
    try:
        if projectId and str(projectId) not in ("null", "undefined", "all", ""):
            project_object_id = await resolve_project_id(projectId, pool)
            rows = await pool.fetch("""
                SELECT DISTINCT ON (sa.object_id)
                    sa.name as name,
                    GREATEST(0, EXTRACT(DAY FROM (COALESCE(sa.actual_finish, CURRENT_DATE) - sa.planned_finish))) as delay
                FROM solar_activities sa
                WHERE sa.project_object_id = $1 AND sa.planned_finish IS NOT NULL
                  AND ((sa.actual_finish > sa.planned_finish) OR (sa.actual_finish IS NULL AND CURRENT_DATE > sa.planned_finish))
                ORDER BY sa.object_id, delay DESC LIMIT 10
            """, project_object_id)
        else:
            rows = await pool.fetch("""
                SELECT sa.name as name,
                       GREATEST(0, EXTRACT(DAY FROM (COALESCE(sa.actual_finish, CURRENT_DATE) - sa.planned_finish))) as delay
                FROM solar_activities sa
                WHERE sa.planned_finish IS NOT NULL
                  AND ((sa.actual_finish > sa.planned_finish) OR (sa.actual_finish IS NULL AND CURRENT_DATE > sa.planned_finish))
                ORDER BY delay DESC LIMIT 10
            """)
        return [{"name": (r["name"] or "Unknown")[:30], "completion": 0, "delay": max(0, int(r["delay"] or 0))} for r in rows]
    except Exception as e:
        logger.error(f"Error: {e}")
        return []


@router.get("/approval-flow")
async def approval_flow(
    projectId: Optional[str] = None,
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(get_current_user),
):
    try:
        if projectId and str(projectId) not in ("null", "undefined", "all", ""):
            project_object_id = await resolve_project_id(projectId, pool)
            rows = await pool.fetch("""
                SELECT TO_CHAR(submitted_at, 'DD-Mon') as name,
                       SUM(CASE WHEN status = 'submitted_to_pm' THEN 1 ELSE 0 END) as submitted,
                       SUM(CASE WHEN status IN ('approved_by_pm', 'final_approved') THEN 1 ELSE 0 END) as approved,
                       SUM(CASE WHEN status LIKE '%%rejected%%' THEN 1 ELSE 0 END) as rejected
                FROM dpr_supervisor_entries WHERE project_id = $1
                GROUP BY 1, DATE(submitted_at) ORDER BY DATE(submitted_at) DESC LIMIT 7
            """, project_object_id)
        else:
            rows = await pool.fetch("""
                SELECT TO_CHAR(submitted_at, 'DD-Mon') as name,
                       SUM(CASE WHEN status = 'submitted_to_pm' THEN 1 ELSE 0 END) as submitted,
                       SUM(CASE WHEN status IN ('approved_by_pm', 'final_approved') THEN 1 ELSE 0 END) as approved,
                       SUM(CASE WHEN status LIKE '%%rejected%%' THEN 1 ELSE 0 END) as rejected
                FROM dpr_supervisor_entries
                GROUP BY 1, DATE(submitted_at) ORDER BY DATE(submitted_at) DESC LIMIT 7
            """)
        data = [{"name": r["name"], "submitted": int(r["submitted"] or 0), "approved": int(r["approved"] or 0), "rejected": int(r["rejected"] or 0)} for r in rows]
        data.reverse()
        return data
    except Exception as e:
        logger.error(f"Error: {e}")
        return []


@router.get("/submission-trends")
async def submission_trends(
    projectId: Optional[str] = None,
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(get_current_user),
):
    try:
        if projectId and str(projectId) not in ("null", "undefined", "all", ""):
            project_object_id = await resolve_project_id(projectId, pool)
            rows = await pool.fetch("""
                SELECT TO_CHAR(submitted_at, 'DD-Mon') as name, submitted_at::date as date, COUNT(*) as submissions
                FROM dpr_supervisor_entries WHERE project_id = $1 AND status != 'draft'
                GROUP BY 1, 2 ORDER BY 2 DESC LIMIT 14
            """, project_object_id)
        else:
            rows = await pool.fetch("""
                SELECT TO_CHAR(submitted_at, 'DD-Mon') as name, submitted_at::date as date, COUNT(*) as submissions
                FROM dpr_supervisor_entries WHERE status != 'draft'
                GROUP BY 1, 2 ORDER BY 2 DESC LIMIT 14
            """)
        data = [{"name": r["name"], "date": str(r["date"]), "submissions": int(r["submissions"])} for r in rows]
        data.reverse()
        return data
    except Exception as e:
        logger.error(f"Error: {e}")
        return []


@router.get("/rejection-distribution")
async def rejection_distribution(
    projectId: Optional[str] = None,
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(get_current_user),
):
    try:
        if projectId and str(projectId) not in ("null", "undefined", "all", ""):
            project_object_id = await resolve_project_id(projectId, pool)
            rows = await pool.fetch("""
                SELECT COALESCE(rejection_reason, 'Other') as name, COUNT(*) as value
                FROM dpr_supervisor_entries WHERE project_id = $1 AND status LIKE '%%rejected%%'
                GROUP BY 1 ORDER BY value DESC LIMIT 5
            """, project_object_id)
        else:
            rows = await pool.fetch("""
                SELECT COALESCE(rejection_reason, 'Other') as name, COUNT(*) as value
                FROM dpr_supervisor_entries WHERE status LIKE '%%rejected%%'
                GROUP BY 1 ORDER BY value DESC LIMIT 5
            """)
        return [{"name": r["name"] or "Unspecified", "value": int(r["value"])} for r in rows]
    except Exception as e:
        logger.error(f"Error: {e}")
        return []


@router.get("/bottlenecks")
async def bottlenecks(
    projectId: Optional[str] = None,
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(get_current_user),
):
    try:
        if projectId and str(projectId) not in ("null", "undefined", "all", ""):
            project_object_id = await resolve_project_id(projectId, pool)
            rows = await pool.fetch("""
                SELECT sra.resource_name as name,
                       SUM(GREATEST(0, EXTRACT(DAY FROM (COALESCE(sa.actual_finish, CURRENT_DATE) - sa.planned_finish)))) as delay
                FROM solar_activities sa
                JOIN solar_resource_assignments sra ON sa.object_id = sra.activity_object_id
                WHERE sa.project_object_id = $1 AND sa.planned_finish IS NOT NULL
                  AND (sa.actual_finish > sa.planned_finish OR (sa.actual_finish IS NULL AND CURRENT_DATE > sa.planned_finish))
                GROUP BY sra.resource_name ORDER BY delay DESC LIMIT 5
            """, project_object_id)
        else:
            rows = await pool.fetch("""
                SELECT sra.resource_name as name,
                       SUM(GREATEST(0, EXTRACT(DAY FROM (COALESCE(sa.actual_finish, CURRENT_DATE) - sa.planned_finish)))) as delay
                FROM solar_activities sa
                JOIN solar_resource_assignments sra ON sa.object_id = sra.activity_object_id
                WHERE sa.planned_finish IS NOT NULL
                  AND (sa.actual_finish > sa.planned_finish OR (sa.actual_finish IS NULL AND CURRENT_DATE > sa.planned_finish))
                GROUP BY sra.resource_name ORDER BY delay DESC LIMIT 5
            """)
        return [{"name": (r["name"] or "Unknown")[:20], "delay": int(r["delay"] or 0)} for r in rows]
    except Exception as e:
        logger.error(f"Error: {e}")
        return []


@router.get("/health-comparison")
async def health_comparison(
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(get_current_user),
):
    try:
        rows = await pool.fetch("""
            SELECT p."Name" as name,
                   COALESCE(SUM(sra.planned_units), 0) as total_target,
                   COALESCE(SUM(sra.actual_units), 0) as total_actual
            FROM p6_projects p
            JOIN solar_activities sa ON p."ObjectId" = sa.project_object_id
            LEFT JOIN solar_resource_assignments sra ON sa.object_id = sra.activity_object_id
            GROUP BY p."Name"
            HAVING SUM(sra.planned_units) > 0
            ORDER BY (COALESCE(SUM(sra.actual_units), 0) / NULLIF(SUM(sra.planned_units), 0)) DESC
            LIMIT 10
        """)
        return [{"name": (r["name"] or "Unknown")[:15], "health": min(100, round(float(r["total_actual"]) / float(r["total_target"]) * 100))} for r in rows]
    except Exception as e:
        logger.error(f"Error: {e}")
        return []


@router.get("/workflow-scatter")
async def workflow_scatter(
    projectId: Optional[str] = None,
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(get_current_user),
):
    try:
        if projectId and str(projectId) not in ("null", "undefined", "all", ""):
            project_object_id = await resolve_project_id(projectId, pool)
            rows = await pool.fetch("""
                SELECT TO_CHAR(submitted_at, 'YYYY-MM-DD') as date, status, COUNT(*) as count
                FROM dpr_supervisor_entries WHERE project_id = $1 AND status != 'draft'
                GROUP BY 1, 2 ORDER BY 1
            """, project_object_id)
        else:
            rows = await pool.fetch("""
                SELECT TO_CHAR(submitted_at, 'YYYY-MM-DD') as date, status, COUNT(*) as count
                FROM dpr_supervisor_entries WHERE status != 'draft'
                GROUP BY 1, 2 ORDER BY 1 LIMIT 50
            """)
        return [{"date": r["date"], "status": r["status"], "count": int(r["count"]), "role": "Supervisor", "size": int(r["count"]) * 2} for r in rows]
    except Exception as e:
        logger.error(f"Error: {e}")
        return []
