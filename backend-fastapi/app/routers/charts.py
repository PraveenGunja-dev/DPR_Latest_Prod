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
                FROM dpr_activities sa
                LEFT JOIN dpr_resource_assignments sra ON sa.object_id = sra.activity_object_id
                WHERE sa.project_object_id = $1 AND sa.planned_finish IS NOT NULL
                GROUP BY 1, sa.planned_finish
                ORDER BY MIN(sa.planned_finish) LIMIT 12
            """, project_object_id)
        else:
            rows = await pool.fetch("""
                SELECT TO_CHAR(sa.planned_finish, 'Mon-YY') as name,
                       COALESCE(SUM(sra.planned_units), 0) as planned,
                       COALESCE(SUM(sra.actual_units), 0) as actual
                FROM dpr_activities sa
                LEFT JOIN dpr_resource_assignments sra ON sa.object_id = sra.activity_object_id
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
                FROM dpr_activities sa
                WHERE sa.project_object_id = $1 AND sa.planned_finish IS NOT NULL
                  AND ((sa.actual_finish > sa.planned_finish) OR (sa.actual_finish IS NULL AND CURRENT_DATE > sa.planned_finish))
                ORDER BY sa.object_id, delay DESC LIMIT 10
            """, project_object_id)
        else:
            rows = await pool.fetch("""
                SELECT sa.name as name,
                       GREATEST(0, EXTRACT(DAY FROM (COALESCE(sa.actual_finish, CURRENT_DATE) - sa.planned_finish))) as delay
                FROM dpr_activities sa
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
            ptrn = '%rejected%'
            rows = await pool.fetch("""
                SELECT TO_CHAR(submitted_at, 'DD-Mon') as name,
                       SUM(CASE WHEN status = 'submitted_to_pm' THEN 1 ELSE 0 END) as submitted,
                       SUM(CASE WHEN status IN ('approved_by_pm', 'final_approved') THEN 1 ELSE 0 END) as approved,
                       SUM(CASE WHEN status LIKE $2 THEN 1 ELSE 0 END) as rejected
                FROM dpr_supervisor_entries WHERE project_id = $1
                GROUP BY 1, DATE(submitted_at) ORDER BY DATE(submitted_at) DESC LIMIT 7
            """, project_object_id, ptrn)
        else:
            ptrn = '%rejected%'
            rows = await pool.fetch("""
                SELECT TO_CHAR(submitted_at, 'DD-Mon') as name,
                       SUM(CASE WHEN status = 'submitted_to_pm' THEN 1 ELSE 0 END) as submitted,
                       SUM(CASE WHEN status IN ('approved_by_pm', 'final_approved') THEN 1 ELSE 0 END) as approved,
                       SUM(CASE WHEN status LIKE $1 THEN 1 ELSE 0 END) as rejected
                FROM dpr_supervisor_entries
                GROUP BY 1, DATE(submitted_at) ORDER BY DATE(submitted_at) DESC LIMIT 7
            """, ptrn)
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
            ptrn = '%rejected%'
            rows = await pool.fetch("""
                SELECT COALESCE(rejection_reason, 'Other') as name, COUNT(*) as value
                FROM dpr_supervisor_entries WHERE project_id = $1 AND status LIKE $2
                GROUP BY 1 ORDER BY value DESC LIMIT 5
            """, project_object_id, ptrn)
        else:
            ptrn = '%rejected%'
            rows = await pool.fetch("""
                SELECT COALESCE(rejection_reason, 'Other') as name, COUNT(*) as value
                FROM dpr_supervisor_entries WHERE status LIKE $1
                GROUP BY 1 ORDER BY value DESC LIMIT 5
            """, ptrn)
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
                FROM dpr_activities sa
                JOIN dpr_resource_assignments sra ON sa.object_id = sra.activity_object_id
                WHERE sa.project_object_id = $1 AND sa.planned_finish IS NOT NULL
                  AND (sa.actual_finish > sa.planned_finish OR (sa.actual_finish IS NULL AND CURRENT_DATE > sa.planned_finish))
                GROUP BY sra.resource_name ORDER BY delay DESC LIMIT 5
            """, project_object_id)
        else:
            rows = await pool.fetch("""
                SELECT sra.resource_name as name,
                       SUM(GREATEST(0, EXTRACT(DAY FROM (COALESCE(sa.actual_finish, CURRENT_DATE) - sa.planned_finish)))) as delay
                FROM dpr_activities sa
                JOIN dpr_resource_assignments sra ON sa.object_id = sra.activity_object_id
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
            SELECT p.name as name,
                   COALESCE(SUM(sra.planned_units), 0) as total_target,
                   COALESCE(SUM(sra.actual_units), 0) as total_actual
            FROM projects p
            JOIN dpr_activities sa ON p.object_id = sa.project_object_id
            LEFT JOIN dpr_resource_assignments sra ON sa.object_id = sra.activity_object_id
            GROUP BY p.name
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


@router.get("/s-curve")
async def s_curve(
    projectId: str,
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(get_current_user),
):
    """Calculates cumulative planned vs actual % over time."""
    project_oid = await resolve_project_id(projectId, pool)
    
    # Logic: 
    # 1. Total Weightage (PlannedUnits)
    # 2. Daily Snapshot of Planned Finish vs Actual Finish
    rows = await pool.fetch("""
        WITH Timeline AS (
            SELECT generate_series(
                date_trunc('month', MIN(planned_start)),
                date_trunc('month', MAX(planned_finish)),
                '1 month'::interval
            )::date as month_date
            FROM dpr_activities WHERE project_object_id = $1
        ),
        ProjectTotals AS (
            SELECT SUM(total_quantity) as total_qty FROM dpr_activities WHERE project_object_id = $1
        ),
        MonthlyProgress AS (
            SELECT 
                date_trunc('month', sa.planned_finish)::date as m_date,
                SUM(sa.total_quantity) as planned_step,
                SUM(sa.cumulative) as actual_step
            FROM dpr_activities sa
            WHERE sa.project_object_id = $1
            GROUP BY 1
        )
        SELECT 
            TO_CHAR(t.month_date, 'Mon-YY') as name,
            ROUND(SUM(mp.planned_step) OVER (ORDER BY t.month_date) / NULLIF((SELECT total_qty FROM ProjectTotals), 0) * 100, 2) as planned,
            ROUND(SUM(mp.actual_step) OVER (ORDER BY t.month_date) / NULLIF((SELECT total_qty FROM ProjectTotals), 0) * 100, 2) as actual
        FROM Timeline t
        LEFT JOIN MonthlyProgress mp ON t.month_date = mp.m_date
        ORDER BY t.month_date
    """, project_oid)
    return [dict(r) for r in rows]


@router.get("/daily-productivity")
async def daily_productivity(
    projectId: str,
    activity_category: Optional[str] = "MMS",
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(get_current_user),
):
    """Daily output vs Required Daily Rate."""
    project_oid = await resolve_project_id(projectId, pool)
    
    # Calculate required rate: Remaining Qty / Remaining Days
    # For demo: compare today's entries vs a fixed "Target Line"
    rows = await pool.fetch("""
        SELECT 
            TO_CHAR(progress_date, 'DD-Mon') as name,
            SUM(today_value) as actual,
            AVG(cumulative_value / GREATEST(1, EXTRACT(DAY FROM (progress_date - (SELECT MIN(progress_date) FROM dpr_daily_progress))))) as target
        FROM dpr_daily_progress ddp
        JOIN dpr_activities sa ON ddp.activity_object_id = sa.object_id
        WHERE sa.project_object_id = $1 AND sa.name ILIKE $2
        GROUP BY progress_date
        ORDER BY progress_date DESC LIMIT 15
    """, project_oid, f"%{activity_category}%")
    data = [dict(r) for r in rows]
    data.reverse()
    return data


@router.get("/activity-heatmap")
async def activity_heatmap(
    projectId: str,
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(get_current_user),
):
    """Heatmap data: Blocks vs Key Activities."""
    project_oid = await resolve_project_id(projectId, pool)
    
    rows = await pool.fetch("""
        SELECT 
            COALESCE(plot, 'Other') as block,
            CASE 
                WHEN name ILIKE '%MMS%' THEN 'MMS'
                WHEN name ILIKE '%MODULE%' THEN 'Module'
                WHEN name ILIKE '%STRING%' THEN 'Stringing'
                ELSE 'Misc'
            END as activity,
            AVG(CASE WHEN status = 'Completed' THEN 100 WHEN status = 'In Progress' THEN 50 ELSE 0 END) as health
        FROM dpr_activities
        WHERE project_object_id = $1 AND plot IS NOT NULL
        GROUP BY 1, 2
        ORDER BY 1, 2
    """, project_oid)
    return [dict(r) for r in rows]


@router.get("/manpower-efficiency")
async def manpower_efficiency(
    projectId: str,
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(get_current_user),
):
    """Scatter: Man-hours vs Quantity Output."""
    project_oid = await resolve_project_id(projectId, pool)
    
    rows = await pool.fetch("""
        SELECT 
            ddp.progress_date as date,
            SUM(ddp.today_value) as output,
            SUM(sra.actual_units) as manpower
        FROM dpr_daily_progress ddp
        JOIN dpr_resource_assignments sra ON ddp.activity_object_id = sra.activity_object_id
        WHERE sra.project_object_id = $1 AND sra.resource_type = 'Labor'
        GROUP BY 1
        ORDER BY 1 DESC LIMIT 30
    """, project_oid)
    return [{"date": str(r["date"]), "output": float(r["output"]), "manpower": float(r["manpower"])} for r in rows]


@router.get("/issue-pareto")
async def issue_pareto(
    projectId: str,
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(get_current_user),
):
    """Pareto: Root cause frequency + cumulative %."""
    project_oid = await resolve_project_id(projectId, pool)
    
    rows = await pool.fetch("""
        WITH Counts AS (
            SELECT issue_type as name, COUNT(*) as count
            FROM issue_logs 
            WHERE project_id = $1
            GROUP BY 1
        ),
        Totals AS (
            SELECT SUM(count) as total FROM Counts
        )
        SELECT 
            name, 
            count as value,
            ROUND(SUM(count) OVER (ORDER BY count DESC) / (SELECT total FROM Totals) * 100, 2) as cumulative
        FROM Counts
        ORDER BY count DESC
    """, project_oid)
    return [dict(r) for r in rows]
