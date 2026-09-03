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
            SELECT p.name as name,
                   COALESCE(SUM(sra.planned_units), 0) as total_target,
                   COALESCE(SUM(sra.actual_units), 0) as total_actual
            FROM projects p
            JOIN solar_activities sa ON p.object_id = sa.project_object_id
            LEFT JOIN solar_resource_assignments sra ON sa.object_id = sra.activity_object_id
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
    """
    Cumulative planned vs actual % complete, by month.

    The previous version was wrong in three ways, all visible on BESS PSS12:

      * Actual was plotted on the PLANNED timeline - SUM(cumulative) was bucketed by
        date_trunc('month', planned_finish), so progress was credited to the month an activity was
        *scheduled* to finish rather than when the work happened.
      * Because of that, the actual line ran past the data date to the end of the schedule. Actual
        cannot exist for months that have not been reported yet, so it now stops at the data date
        (NULL afterwards, which leaves the line ending there rather than running flat).
      * Planned stepped at the finish date instead of rising through the work, which turned the
        curve into a staircase. Each activity's weight is now spread across the days it is
        scheduled to run, which is what makes it an S.

    Weighting is one unit per activity. Summing total_quantity is not meaningful here: on PSS12,
    3067 of 3068 activities carry no UOM at all, and the figures mix metres of cable (44,640 on a
    single laying activity) with counts of piles - which let cable laying alone dominate half the
    project. Equal weighting reads as "% of scheduled activities complete", and percent_complete
    (a clean 0-1, populated on 1,898 of those activities) supplies partial credit for work in
    progress. Baseline dates are preferred over planned, matching what the sheets treat as the plan.
    """
    project_oid = await resolve_project_id(projectId, pool)

    rows = await pool.fetch("""
        WITH RECURSIVE up AS (
            SELECT w.object_id, w.parent_object_id, w.name AS root
            FROM solar_wbs w
            WHERE w.project_object_id = $1
            UNION ALL
            SELECT u.object_id, pw.parent_object_id, pw.name
            FROM up u
            JOIN solar_wbs pw ON u.parent_object_id = pw.object_id
                             AND pw.project_object_id = $1
        ),
        roots AS (
            SELECT DISTINCT ON (object_id) object_id, root
            FROM up
            ORDER BY object_id, parent_object_id NULLS FIRST
        ),
        -- Construction only, matching the progress figure beside the project name. Procurement and
        -- Engineering run to their own schedule and are largely complete, so including them lifted
        -- the curve above the headline number (PSS12 read 61.2 against a 58.8 badge).
        -- NB: no literal per-cent signs in this string - psycopg scans comments for placeholders
        -- too, and an unpaired one fails the whole query.
        construction_wbs AS (
            SELECT object_id FROM roots
            WHERE root ILIKE '%%construction%%' AND root NOT ILIKE '%%pre%%construction%%'
        ),
        -- A handful of projects have no such branch; those fall back to every activity rather than
        -- drawing an empty chart.
        scope AS (SELECT EXISTS (SELECT 1 FROM construction_wbs) AS by_construction),
        acts AS (
            SELECT
                COALESCE(sa.baseline_start,  sa.planned_start)::date  AS p_start,
                COALESCE(sa.baseline_finish, sa.planned_finish)::date AS p_finish,
                sa.actual_finish::date AS a_finish,
                sa.finish_date::date AS f_finish,
                CASE
                    WHEN sa.actual_finish IS NOT NULL OR sa.status = 'Completed' THEN 1.0
                    ELSE LEAST(GREATEST(COALESCE(sa.percent_complete, 0), 0), 1)
                END AS done
            FROM solar_activities sa
            WHERE sa.project_object_id = $1
              AND COALESCE(sa.baseline_start,  sa.planned_start)  IS NOT NULL
              AND COALESCE(sa.baseline_finish, sa.planned_finish) IS NOT NULL
              AND (
                    NOT (SELECT by_construction FROM scope)
                    OR sa.wbs_object_id IN (SELECT object_id FROM construction_wbs)
              )
        ),
        dd AS (
            SELECT date_trunc('month', COALESCE(
                (SELECT data_date FROM projects WHERE object_id = $1), NOW()))::date AS m
        ),
        bounds AS (
            SELECT date_trunc('month', MIN(p_start))::date AS m_from,
                   date_trunc('month', GREATEST(MAX(p_finish),
                                                COALESCE(MAX(a_finish), MAX(p_finish))))::date AS m_to
            FROM acts
        ),
        timeline AS (
            SELECT generate_series((SELECT m_from FROM bounds),
                                   (SELECT m_to FROM bounds), '1 month')::date AS m
        ),
        totals AS (SELECT COUNT(*)::numeric AS tw FROM acts),
        -- Planned: an activity's unit of weight spread evenly across the days it is scheduled for,
        -- so each month picks up the share of work due in it.
        planned_month AS (
            SELECT t.m,
                   SUM(GREATEST(0, (LEAST(a.p_finish, (t.m + INTERVAL '1 month - 1 day')::date)
                                    - GREATEST(a.p_start, t.m) + 1))::numeric
                       / GREATEST(1, (a.p_finish - a.p_start + 1))) AS step
            FROM timeline t
            JOIN acts a ON a.p_start <= (t.m + INTERVAL '1 month - 1 day')::date
                       AND a.p_finish >= t.m
            GROUP BY t.m
        ),
        -- Actual: credited in the month the work actually finished. Work still running is credited
        -- in the data-date month, that being when its progress is known.
        actual_month AS (
            -- Credit is clamped into the reported window [first month .. data date]. Both ends
            -- matter: MANDVI finished work before its baseline even starts (a budget-approval
            -- milestone actioned in Apr-24 against an Apr-25 baseline) which would otherwise fall
            -- off the left of the timeline, and PSS12 has activities finished days after its data
            -- date which would otherwise sit beyond where the line stops. Clamping keeps the
            -- actual line's end equal to everything achieved, which is where the forecast picks up.
            SELECT LEAST(
                       GREATEST(
                           date_trunc('month', COALESCE(a.a_finish, (SELECT m FROM dd)))::date,
                           (SELECT m_from FROM bounds)
                       ),
                       (SELECT m FROM dd)
                   ) AS m,
                   SUM(a.done) AS step
            FROM acts a
            WHERE a.done > 0
            GROUP BY 1
        ),
        -- Everything achieved so far. The forecast line starts from exactly this value at the data
        -- date, so it continues the actual line rather than restarting from zero.
        achieved AS (SELECT COALESCE(SUM(done), 0) AS done_sum FROM acts),
        -- Forecast: the work still outstanding, laid out on its P6 forecast finish dates. Work
        -- already overdue at the data date is pulled into the first forecast month, since it
        -- cannot be delivered in a month that has passed.
        forecast_month AS (
            SELECT GREATEST(
                       date_trunc('month', COALESCE(a.f_finish, a.p_finish))::date,
                       ((SELECT m FROM dd) + INTERVAL '1 month')::date
                   ) AS m,
                   SUM(1 - a.done) AS step
            FROM acts a
            WHERE a.done < 1
            GROUP BY 1
        )
        SELECT
            TO_CHAR(t.m, 'Mon-YY') AS name,
            ROUND(COALESCE(SUM(pm.step) OVER (ORDER BY t.m), 0)
                  / NULLIF((SELECT tw FROM totals), 0) * 100, 2) AS planned,
            CASE WHEN t.m <= (SELECT m FROM dd)
                 THEN ROUND(COALESCE(SUM(am.step) OVER (ORDER BY t.m), 0)
                            / NULLIF((SELECT tw FROM totals), 0) * 100, 2)
            END AS actual,
            -- Only from the data date onward; NULL before, so the dashed line picks up exactly
            -- where the solid actual line stops.
            CASE WHEN t.m >= (SELECT m FROM dd)
                 THEN ROUND(((SELECT done_sum FROM achieved)
                             + COALESCE(SUM(fm.step) OVER (ORDER BY t.m), 0))
                            / NULLIF((SELECT tw FROM totals), 0) * 100, 2)
            END AS forecast
        FROM timeline t
        LEFT JOIN planned_month  pm ON pm.m = t.m
        LEFT JOIN actual_month   am ON am.m = t.m
        LEFT JOIN forecast_month fm ON fm.m = t.m
        ORDER BY t.m
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
            AVG(cumulative_value / GREATEST(1, progress_date - (SELECT MIN(progress_date) FROM dpr_daily_progress))) as target
        FROM dpr_daily_progress ddp
        JOIN solar_activities sa ON ddp.activity_object_id = sa.object_id AND ddp.activity_source = 'p6'
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
                WHEN name ILIKE '%%MMS%%' THEN 'MMS'
                WHEN name ILIKE '%%MODULE%%' THEN 'Module'
                WHEN name ILIKE '%%STRING%%' THEN 'Stringing'
                ELSE 'Misc'
            END as activity,
            AVG(CASE WHEN status = 'Completed' THEN 100 WHEN status = 'In Progress' THEN 50 ELSE 0 END) as health
        FROM solar_activities
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
        JOIN solar_resource_assignments sra ON ddp.activity_object_id = sra.activity_object_id AND ddp.activity_source = 'p6'
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
