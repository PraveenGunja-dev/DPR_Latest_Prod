"""
P6 Production → DPR Master Sync Script
=====================================
Fetches data from P6 REST API project-by-project and stores in standardized tables used by the UI.
Supports Solar, Wind, and Hybrid projects through a unified hierarchy.
"""

import asyncio
import sys
import os
import httpx
import re
import logging
from datetime import datetime, timezone, timedelta

from app.database import create_pool
from app.services.p6_token_service import get_valid_p6_token, get_http_client
from app.config import settings

# ─── Config ────────────────────────────────────────────────────────
BASE_URL = "https://sin1.p6.oraclecloud.com/adani/p6ws/restapi"
PAGE_SIZE = 500

# Activity fields to request from P6
ACTIVITY_FIELDS = ",".join([
    "ObjectId", "Id", "Name", "Status", "Type",
    "ProjectObjectId", "WBSObjectId", "WBSName",
    "PlannedStartDate", "PlannedFinishDate",
    "StartDate", "FinishDate",
    "BaselineStartDate", "BaselineFinishDate",
    "ActualStartDate", "ActualFinishDate",
    "LastUpdateDate", "LastUpdateUser", "PercentComplete",
    "CalendarObjectId"
])

WBS_FIELDS = "ObjectId,Name,Code,ParentObjectId,ProjectObjectId,Status"

RA_FIELDS = "ObjectId,ActivityObjectId,ResourceObjectId,ResourceId,ResourceName,ResourceType,PlannedUnits,ActualUnits,RemainingUnits,BudgetAtCompletionUnits,AtCompletionUnits,UnitsPercentComplete,ProjectObjectId"

PROJECT_FIELDS = "ObjectId,Id,Name,Status,StartDate,FinishDate,PlannedStartDate,Description,DataDate,LastUpdateDate,LastUpdateUser,ParentEPSName,CurrentBaselineProjectObjectId"

# ─── Helpers ───────────────────────────────────────────────────────

def parse_date(s):
    if not s:
        return None
    try:
        if isinstance(s, datetime):
            return s
        return datetime.fromisoformat(s.replace("Z", "+00:00"))
    except Exception:
        return None

def parse_float(v):
    if v is None:
        return 0.0
    try:
        return float(v)
    except (ValueError, TypeError):
        return 0.0

logger = logging.getLogger("adani-flow.sync")

# Define IST: UTC + 5:30
IST = timezone(timedelta(hours=5, minutes=30))

def log(msg):
    """Print with IST timestamp and log to adani-flow.sync."""
    now_ist = datetime.now(IST).strftime("%Y-%m-%d %H:%M:%S")
    formatted_msg = f"[{now_ist}] {msg}"
    print(formatted_msg, flush=True)
    logger.info(msg)

async def fetch_all_retry(client, url, headers, label=""):
    """Fetch all data from a P6 endpoint."""
    try:
        r = await client.get(url, headers=headers)
    except httpx.ReadTimeout:
        log(f"  !! {label} TIMEOUT, retrying...")
        try:
            r = await client.get(url, headers=headers)
        except Exception as e:
            log(f"  !! {label} RETRY FAILED: {e}")
            return []
    except Exception as e:
        log(f"  !! {label} ERROR: {e}")
        return []
        
    if r.status_code != 200:
        log(f"  !! {label} HTTP {r.status_code}")
        return []
        
    data = r.json()
    items = data if isinstance(data, list) else []
    if label:
        log(f"  {label}: {len(items)} fetched")
    return items

# ─── Table Creation ────────────────────────────────────────────────

CREATE_TABLES_SQL = """
-- Master Project Table
CREATE TABLE IF NOT EXISTS p6_projects (
    "ObjectId"           BIGINT PRIMARY KEY,
    "Id"                 VARCHAR(100),
    "Name"               VARCHAR(500),
    "Status"             VARCHAR(50),
    "StartDate"          TIMESTAMPTZ,
    "FinishDate"         TIMESTAMPTZ,
    "PlannedStartDate"   TIMESTAMPTZ,
    "Description"        TEXT,
    "DataDate"           TIMESTAMPTZ,
    "LastSyncAt"         TIMESTAMPTZ,
    "LastUpdateDate"     TIMESTAMPTZ,
    "LastUpdateUser"     VARCHAR(255),
    "ParentEPSName"      VARCHAR(255),
    "CurrentBaselineProjectObjectId" BIGINT
);

-- Master Activity Table (Used by UI)
CREATE TABLE IF NOT EXISTS solar_activities (
    object_id           BIGINT PRIMARY KEY,
    activity_id         VARCHAR(100),
    name                VARCHAR(500),
    status              VARCHAR(50),
    activity_type       VARCHAR(50),
    project_object_id   BIGINT,
    wbs_object_id       BIGINT,
    wbs_name            VARCHAR(500),
    planned_start       TIMESTAMPTZ,
    planned_finish      TIMESTAMPTZ,
    start_date          TIMESTAMPTZ,
    finish_date         TIMESTAMPTZ,
    baseline_start      TIMESTAMPTZ,
    baseline_finish     TIMESTAMPTZ,
    actual_start        TIMESTAMPTZ,
    actual_finish       TIMESTAMPTZ,
    p6_last_update_date TIMESTAMPTZ,
    p6_last_update_user VARCHAR(255),
    percent_complete    NUMERIC,
    total_quantity      NUMERIC DEFAULT 0,
    uom                 VARCHAR(50),
    balance             NUMERIC DEFAULT 0,
    cumulative          NUMERIC DEFAULT 0,
    last_sync_at        TIMESTAMPTZ DEFAULT NOW(),
    remarks             TEXT,
    hours_per_day       NUMERIC DEFAULT 8
);

-- Master WBS Table (Used by UI)
CREATE TABLE IF NOT EXISTS solar_wbs (
    object_id           BIGINT PRIMARY KEY,
    name                VARCHAR(500),
    code                VARCHAR(100),
    parent_object_id    BIGINT,
    project_object_id   BIGINT,
    status              VARCHAR(50)
);

-- Master Resource Assignments Table (Used by UI)
CREATE TABLE IF NOT EXISTS solar_resource_assignments (
    object_id               BIGINT PRIMARY KEY,
    activity_object_id       BIGINT,
    project_object_id       BIGINT,
    resource_id             VARCHAR(100),
    resource_name           VARCHAR(500),
    resource_type           VARCHAR(50),
    planned_units           NUMERIC,
    actual_units            NUMERIC,
    remaining_units         NUMERIC,
    budget_at_completion_units NUMERIC,
    at_completion_units     NUMERIC,
    percent_complete        NUMERIC,
    hours_per_day       NUMERIC DEFAULT 8
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_solar_act_project ON solar_activities(project_object_id);
CREATE INDEX IF NOT EXISTS idx_solar_ra_activity ON solar_resource_assignments(activity_object_id);
"""

# ─── Main Sync ─────────────────────────────────────────────────────

async def sync_data(target_project_id=None, full_sync=False, pool=None):
    log(f"Starting Master Sync (target={target_project_id}, full={full_sync})")
    should_close_pool = False
    sync_now_ist = datetime.now(IST)
    
    log("Obtaining P6 token...")
    token = await get_valid_p6_token()
    headers = {"Authorization": f"Bearer {token}", "Accept": "application/json"}

    if not pool:
        pool = await create_pool()
        should_close_pool = True

    # 1. Initialize Tables
    log("Initializing Master Hierarchy tables...")
    for stmt in CREATE_TABLES_SQL.split(";"):
        stmt = stmt.strip()
        if stmt:
            try:
                await pool.execute(stmt)
            except Exception as e:
                log(f"  Note: {e}")

    async with get_http_client(timeout=120.0) as client:

        # 2. Fetch Projects
        log("\n=== Step 1: Syncing Projects ===")
        projects = await fetch_all_retry(
            client, f"{BASE_URL}/project?Fields={PROJECT_FIELDS}", headers, "Projects"
        )
        
        # 1.b Cleanup stale projects (only during global sync)
        # This ensures local DB matches P6 exactly.
        if not target_project_id and projects:
            p6_oids = [int(p["ObjectId"]) for p in projects]
            log(f"  Cleanup: Verifying {len(p6_oids)} projects against local database...")
            
            stale_rows = await pool.fetch("SELECT object_id, name FROM projects WHERE object_id NOT IN (SELECT unnest($1::int[]))", p6_oids)
            if stale_rows:
                log(f"  !! Found {len(stale_rows)} stale projects for removal.")
                for row in stale_rows:
                    sid = row["object_id"]
                    sname = row["name"]
                    log(f"  Cleaning up project: {sname} (OID={sid})")
                    await pool.execute("DELETE FROM solar_wbs WHERE project_object_id = $1", sid)
                    await pool.execute("DELETE FROM solar_resource_assignments WHERE project_object_id = $1", sid)
                    await pool.execute("DELETE FROM solar_activities WHERE project_object_id = $1", sid)
                    await pool.execute("DELETE FROM projects WHERE object_id = $1", sid)
                    await pool.execute("DELETE FROM p6_projects WHERE \"ObjectId\" = $1", sid)
                log(f"  Cleanup Complete.")
            else:
                log("  No stale projects found.")

        if target_project_id:
            projects = [p for p in projects if str(p.get("ObjectId")) == str(target_project_id) or p.get("Id") == str(target_project_id)]
        
        for p in projects:
            oid = int(p["ObjectId"])
            await pool.execute("""
                INSERT INTO p6_projects (
                    "ObjectId", "Id", "Name", "Status", "StartDate", "FinishDate", "PlannedStartDate", 
                    "Description", "DataDate", "LastSyncAt", "LastUpdateDate", "LastUpdateUser", "ParentEPSName", "CurrentBaselineProjectObjectId"
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
                ON CONFLICT ("ObjectId") DO UPDATE SET
                    "Id"=$2, "Name"=$3, "Status"=$4, "StartDate"=$5, "FinishDate"=$6, "PlannedStartDate"=$7, 
                    "Description"=$8, "DataDate"=$9, "LastSyncAt"=$10, "LastUpdateDate"=$11, "LastUpdateUser"=$12, "ParentEPSName"=$13, "CurrentBaselineProjectObjectId"=$14
            """, oid, p.get("Id"), p.get("Name"), p.get("Status"),
                parse_date(p.get("StartDate")), parse_date(p.get("FinishDate")), parse_date(p.get("PlannedStartDate")),
                p.get("Description"), parse_date(p.get("DataDate")), sync_now_ist, 
                parse_date(p.get("LastUpdateDate")), p.get("LastUpdateUser"), p.get("ParentEPSName"),
                int(p["CurrentBaselineProjectObjectId"]) if p.get("CurrentBaselineProjectObjectId") else None)

            # 2.a Update 'projects' table for UI listing
            p_name = p.get("Name", "")
            eps_name = p.get("ParentEPSName", "")
            
            # Determine project type
            p_type = 'Solar'
            if any(k in p_name.upper() or k in eps_name.upper() for k in ["WIND", "WTG"]):
                p_type = 'Wind'
            elif any(k in p_name.upper() or k in eps_name.upper() for k in ["PSS", "SUBSTATION"]):
                p_type = 'PSS'
                
            await pool.execute("""
                INSERT INTO projects (
                    object_id, name, id, project_type, parent_eps, start_date, finish_date, 
                    last_sync_at, data_date
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                ON CONFLICT (object_id) DO UPDATE SET
                    name = EXCLUDED.name,
                    id = EXCLUDED.id,
                    project_type = CASE 
                        WHEN projects.project_type IS NULL OR projects.project_type = 'Solar' THEN EXCLUDED.project_type 
                        ELSE projects.project_type 
                    END,
                    parent_eps = EXCLUDED.parent_eps,
                    start_date = EXCLUDED.start_date,
                    finish_date = EXCLUDED.finish_date,
                    last_sync_at = EXCLUDED.last_sync_at,
                    data_date = EXCLUDED.data_date
            """, oid, p_name, p.get("Id"), p_type, eps_name, 
                parse_date(p.get("StartDate")), parse_date(p.get("FinishDate")),
                sync_now_ist, parse_date(p.get("DataDate")))

        # 3. Reference Data
        log("\n=== Step 2: Fetching Reference Data ===")
        res_items = await fetch_all_retry(client, f"{BASE_URL}/resource?Fields=ObjectId,UnitOfMeasureName", headers, "Resources")
        resource_uom = {int(r["ObjectId"]): r.get("UnitOfMeasureName", "") for r in res_items}

        # Fetch all calendars for the project(s) to get HoursPerDay
        cal_items = await fetch_all_retry(client, f"{BASE_URL}/calendar?Fields=ObjectId,HoursPerDay,Name", headers, "Calendars")
        calendar_hours = {int(c["ObjectId"]): parse_float(c.get("HoursPerDay")) for c in cal_items}
        log(f"  Loaded {len(calendar_hours)} calendars")

        # 4. Sync Activities per Project
        log("\n=== Step 3: Syncing Activity Details ===")
        for i, proj in enumerate(projects):
            proj_id = int(proj["ObjectId"])
            proj_name = proj.get("Name", "Unnamed")
            
            # Check local app_status - skip sync if on HOLD
            local_status = await pool.fetchval("SELECT app_status FROM projects WHERE object_id = $1", proj_id)
            if local_status == 'hold':
                log(f"  [{i+1}/{len(projects)}] {proj_name} (ID={proj_id}) is on HOLD. Skipping detailed sync.")
                continue

            bl_project_oid = proj.get("CurrentBaselineProjectObjectId")
            log(f"  [{i+1}/{len(projects)}] {proj_name} (BL={bl_project_oid})...")

            # Cleanup existing data for this project in UI tables
            await pool.execute("DELETE FROM solar_wbs WHERE project_object_id = $1", proj_id)
            await pool.execute("DELETE FROM solar_resource_assignments WHERE project_object_id = $1", proj_id)
            await pool.execute("DELETE FROM solar_activities WHERE project_object_id = $1", proj_id)

            # 4.a Baseline Activity Mapping
            bl_map = {}
            if bl_project_oid:
                log(f"    Fetching baseline activities from Project {bl_project_oid}...")
                bl_acts = await fetch_all_retry(
                    client, 
                    f"{BASE_URL}/activity?Filter=ProjectObjectId={bl_project_oid}&Fields=Id,StartDate,FinishDate", 
                    headers, 
                    f"BL-Acts({bl_project_oid})"
                )
                for ba in bl_acts:
                    bl_map[ba["Id"]] = {
                        "start": parse_date(ba.get("StartDate")),
                        "finish": parse_date(ba.get("FinishDate"))
                    }
            
            # 4.b Assignments & Aggregation
            ras = await fetch_all_retry(client, f"{BASE_URL}/resourceAssignment?Filter=ProjectObjectId={proj_id}&Fields={RA_FIELDS}", headers, "RA")
            ra_agg = {}
            for ra in ras:
                act_oid = int(ra["ActivityObjectId"])
                res_id = ra.get("ResourceId", "").upper()
                uom = resource_uom.get(int(ra["ResourceObjectId"]), "")
                
                # Use P6's native ResourceType to reliably identify Material assignments
                # This perfectly matches the "Resource Type: Material" grouping in P6
                is_material = (ra.get("ResourceType") == "Material") and ("WEIGHTAGE" not in res_id)

                if is_material:
                    if act_oid not in ra_agg:
                        ra_agg[act_oid] = {
                            "qty": 0.0, "bal": 0.0, "cum": 0.0, 
                            "uom": uom, "res_id": res_id
                        }
                    # Sum material units to get the accurate physical scope/completed for the activity
                    ra_agg[act_oid]["qty"] += parse_float(ra.get("PlannedUnits"))
                    ra_agg[act_oid]["bal"] += parse_float(ra.get("RemainingUnits"))
                    ra_agg[act_oid]["cum"] += parse_float(ra.get("ActualUnits"))

                # Completely skip syncing Nonlabor resources to avoid inflating queries
                # Previously this relied on "NL" in res_id, now uses native ResourceType
                if ra.get("ResourceType") == "Nonlabor":
                    continue

                # Save raw assignments to solar_resource_assignments (MP and ML are saved here for the Manpower Sheet)
                await pool.execute("""
                    INSERT INTO solar_resource_assignments (
                        object_id, activity_object_id, project_object_id, resource_id, resource_name, resource_type,
                        planned_units, actual_units, remaining_units, budget_at_completion_units, at_completion_units, 
                        percent_complete, hours_per_day
                    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
                """, int(ra["ObjectId"]), act_oid, proj_id, ra.get("ResourceId"), 
                    ra.get("ResourceName"), ra.get("ResourceType"), parse_float(ra.get("PlannedUnits")), 
                    parse_float(ra.get("ActualUnits")), parse_float(ra.get("RemainingUnits")), 
                    parse_float(ra.get("BudgetAtCompletionUnits")), parse_float(ra.get("AtCompletionUnits")),
                    parse_float(ra.get("UnitsPercentComplete")), 8.0) # Default hours_per_day

            # 4.c Activities
            acts = await fetch_all_retry(client, f"{BASE_URL}/activity?Filter=ProjectObjectId={proj_id}&Fields={ACTIVITY_FIELDS}", headers, "Acts")
            
            latest_act_date = None
            latest_act_user = None

            for a in acts:
                oid = int(a["ObjectId"])
                prog = ra_agg.get(oid, {"qty":0.0, "bal":0.0, "cum":0.0, "uom":""})
                
                # Activity update tracking
                act_update_date = parse_date(a.get("LastUpdateDate"))
                if act_update_date:
                    if not latest_act_date or act_update_date > latest_act_date:
                        latest_act_date = act_update_date
                        latest_act_user = a.get("LastUpdateUser")

                # Baseline Logic
                bl_start = bl_map.get(a["Id"], {}).get("start")
                bl_finish = bl_map.get(a["Id"], {}).get("finish")
                # Fallback to local baseline fields
                if not bl_start: bl_start = parse_date(a.get("BaselineStartDate"))
                if not bl_finish: bl_finish = parse_date(a.get("BaselineFinishDate"))

                await pool.execute("""
                    INSERT INTO solar_activities (
                        object_id, activity_id, name, status, activity_type,
                        project_object_id, wbs_object_id, wbs_name,
                        planned_start, planned_finish, start_date, finish_date,
                        baseline_start, baseline_finish, actual_start, actual_finish,
                        p6_last_update_date, p6_last_update_user, percent_complete,
                        total_quantity, uom, balance, cumulative, last_sync_at, remarks, hours_per_day
                    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26)
                    ON CONFLICT (object_id) DO UPDATE SET
                        activity_id = EXCLUDED.activity_id,
                        name = EXCLUDED.name,
                        status = EXCLUDED.status,
                        activity_type = EXCLUDED.activity_type,
                        project_object_id = EXCLUDED.project_object_id,
                        wbs_object_id = EXCLUDED.wbs_object_id,
                        wbs_name = EXCLUDED.wbs_name,
                        planned_start = EXCLUDED.planned_start,
                        planned_finish = EXCLUDED.planned_finish,
                        start_date = EXCLUDED.start_date,
                        finish_date = EXCLUDED.finish_date,
                        baseline_start = EXCLUDED.baseline_start,
                        baseline_finish = EXCLUDED.baseline_finish,
                        actual_start = EXCLUDED.actual_start,
                        actual_finish = EXCLUDED.actual_finish,
                        p6_last_update_date = EXCLUDED.p6_last_update_date,
                        p6_last_update_user = EXCLUDED.p6_last_update_user,
                        percent_complete = EXCLUDED.percent_complete,
                        total_quantity = EXCLUDED.total_quantity,
                        uom = EXCLUDED.uom,
                        balance = EXCLUDED.balance,
                        cumulative = EXCLUDED.cumulative,
                        last_sync_at = EXCLUDED.last_sync_at,
                        remarks = EXCLUDED.remarks,
                        hours_per_day = EXCLUDED.hours_per_day
                """, oid, a.get("Id"), a.get("Name"), a.get("Status"), a.get("Type"),
                    proj_id, int(a["WBSObjectId"]) if a.get("WBSObjectId") else None, a.get("WBSName"),
                    parse_date(a.get("PlannedStartDate")), parse_date(a.get("PlannedFinishDate")),
                    parse_date(a.get("StartDate")), parse_date(a.get("FinishDate")),
                    bl_start, bl_finish,
                    parse_date(a.get("ActualStartDate")), parse_date(a.get("ActualFinishDate")),
                    act_update_date, a.get("LastUpdateUser"),
                    parse_float(a.get("PercentComplete")), 
                    prog["qty"], prog["uom"], prog["bal"], prog["cum"], sync_now_ist, a.get("Notes"),
                    calendar_hours.get(int(a.get("CalendarObjectId", 0)), 8.0))

            # 4.d Post-Sync: Update Resource Assignments with Activity HoursPerDay
            log(f"    Updating resource assignment hours_per_day for project {proj_id}...")
            await pool.execute("""
                UPDATE solar_resource_assignments sra
                SET hours_per_day = sa.hours_per_day
                FROM solar_activities sa
                WHERE sra.activity_object_id = sa.object_id
                  AND sra.project_object_id = $1
            """, proj_id)

            # 4.d Update Project Last Updated info from activities (User Request: Project info should follow Activity latest info)
            if latest_act_date:
                log(f"    Updating Project {proj_id} with latest activity update info: {latest_act_user} on {latest_act_date}")
                await pool.execute("""
                    UPDATE p6_projects SET \"LastUpdateDate\" = $2, \"LastUpdateUser\" = $3 WHERE \"ObjectId\" = $1
                """, proj_id, latest_act_date, latest_act_user)
                await pool.execute("""
                    UPDATE projects SET last_update_date = $2, last_update_user = $3 WHERE object_id = $1
                """, proj_id, latest_act_date, latest_act_user)

            # 4.d WBS
            wbs_items = await fetch_all_retry(client, f"{BASE_URL}/wbs?Filter=ProjectObjectId={proj_id}&Fields={WBS_FIELDS}", headers, "WBS")
            for w in wbs_items:
                await pool.execute("""
                    INSERT INTO solar_wbs (object_id, project_object_id, parent_object_id, code, name, status)
                    VALUES ($1,$2,$3,$4,$5,$6)
                """, int(w["ObjectId"]), proj_id, int(w["ParentObjectId"]) if w.get("ParentObjectId") else None,
                    w.get("Code"), w.get("Name"), w.get("Status"))

    log("\n=== SYNC COMPLETE ===")
    if should_close_pool: await pool.close()

if __name__ == "__main__":
    target = None
    full_flag = False
    args = sys.argv[1:]
    i = 0
    while i < len(args):
        if args[i] == "--project" and i + 1 < len(args):
            target = args[i + 1]
            i += 2
        elif args[i] == "--full":
            full_flag = True
            i += 1
        else:
            target = args[i]
            i += 1
    asyncio.run(sync_data(target_project_id=target, full_sync=full_flag))
