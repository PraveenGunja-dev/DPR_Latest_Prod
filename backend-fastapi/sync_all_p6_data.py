"""
P6 Production → Solar DB Sync Script
=====================================
Fetches data from P6 REST API project-by-project and stores in type-specific tables.
Currently: Solar. Extensible for Wind/PSS later.

Tables populated:
  - p6_projects          (shared across all types)
  - solar_activities     (Solar-specific)
  - solar_wbs            (Solar-specific)
  - solar_resource_assignments (Solar-specific)

UDF Mapping:
  (All fields currently manual entry)

Activity Code Mapping:
  316  → phase           (Global "Phase")
  904  → discipline      (Global "Discipline")
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

# UDF Type IDs → DB column names
# No UDFs currently synced from P6; fields are manual entry in local DB
UDF_MAP = {}

# Activity Code Type IDs → DB column names
CODE_MAP = {
    904: "discipline",  # "Discipline" (Global)
    316: "phase",       # "Phase" (Global) - though many projects have their own
}

# Activity fields to request from P6
ACTIVITY_FIELDS = ",".join([
    "ObjectId", "Id", "Name", "Status", "Type",
    "ProjectObjectId", "WBSObjectId", "WBSName",
    "PlannedStartDate", "PlannedFinishDate",
    "StartDate", "FinishDate",
    "BaselineStartDate", "BaselineFinishDate",
    "Baseline1StartDate", "Baseline1FinishDate",
    "Baseline2StartDate", "Baseline2FinishDate",
    "Baseline3StartDate", "Baseline3FinishDate",
    "ActualStartDate", "ActualFinishDate",
    "PercentComplete", "PhysicalPercentComplete",
    "PlannedDuration", "RemainingDuration", "ActualDuration",
    "PlannedTotalUnits", "ActualTotalUnits", "RemainingTotalUnits",
    "PrimaryResourceName",
])

WBS_FIELDS = "ObjectId,Name,Code,ParentObjectId,ProjectObjectId,Status"
RA_FIELDS = "ObjectId,ActivityObjectId,ResourceObjectId,ResourceId,ResourceName,ResourceType,PlannedUnits,ActualUnits,RemainingUnits,BudgetAtCompletionUnits,ProjectObjectId"
EXPENSE_FIELDS = "ActivityObjectId,PlannedUnits,ActualUnits,RemainingUnits,UnitOfMeasure"
PROJECT_FIELDS = "ObjectId,Id,Name,Status,StartDate,FinishDate,PlannedStartDate,Description,DataDate,LastUpdateDate,LastUpdateUser"

# ─── Helpers ───────────────────────────────────────────────────────

def parse_date(s):
    if not s:
        return None
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00"))
    except Exception:
        return None

def parse_float(v):
    if v is None:
        return None
    try:
        return float(v)
    except (ValueError, TypeError):
        return None

def parse_percent(v):
    if v is None:
        return None
    try:
        return float(v) * 100.0
    except (ValueError, TypeError):
        return None

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
    """Fetch all data from a P6 endpoint (P6 EPPM ignores pagination params in many cases)."""
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
-- Solar Activities
CREATE TABLE IF NOT EXISTS solar_activities (
    object_id           BIGINT PRIMARY KEY,
    activity_id         VARCHAR(50),
    name                VARCHAR(500),
    status              VARCHAR(50),
    activity_type       VARCHAR(50),
    project_object_id   BIGINT,
    wbs_object_id       BIGINT,
    wbs_name            VARCHAR(255),
    planned_start       TIMESTAMPTZ,
    planned_finish      TIMESTAMPTZ,
    start_date          TIMESTAMPTZ,
    finish_date         TIMESTAMPTZ,
    baseline_start      TIMESTAMPTZ,
    baseline_finish     TIMESTAMPTZ,
    baseline1_start     TIMESTAMPTZ,
    baseline1_finish    TIMESTAMPTZ,
    baseline2_start     TIMESTAMPTZ,
    baseline2_finish    TIMESTAMPTZ,
    baseline3_start     TIMESTAMPTZ,
    baseline3_finish    TIMESTAMPTZ,
    actual_start        TIMESTAMPTZ,
    actual_finish       TIMESTAMPTZ,
    percent_complete    DECIMAL(5,2),
    physical_percent_complete DECIMAL(5,2),
    planned_duration    DECIMAL(10,1),
    remaining_duration  DECIMAL(10,1),
    actual_duration     DECIMAL(10,1),
    primary_resource    VARCHAR(255),
    -- UDF fields
    total_quantity      DECIMAL(15,4),
    uom                 VARCHAR(50),
    balance             DECIMAL(15,4),
    cumulative          DECIMAL(15,4),
    priority            VARCHAR(100),
    scope               TEXT,
    weightage           DECIMAL(10,2),
    -- Activity Code fields
    phase               VARCHAR(100),
    discipline          VARCHAR(100),
    -- Fixed/derived fields
    block_capacity      DECIMAL(10,2) DEFAULT 12.5,
    spv_no              VARCHAR(100),
    -- Manual-entry fields (not from P6)
    hold                VARCHAR(100),
    front               VARCHAR(255),
    plot                VARCHAR(255),
    new_block_nom       VARCHAR(255),
    remarks             TEXT,
    -- Meta
    last_sync_at        TIMESTAMPTZ DEFAULT NOW()
);

-- Solar WBS
CREATE TABLE IF NOT EXISTS solar_wbs (
    object_id           BIGINT PRIMARY KEY,
    name                VARCHAR(255),
    code                VARCHAR(50),
    parent_object_id    BIGINT,
    project_object_id   BIGINT,
    status              VARCHAR(50)
);

-- Solar Resource Assignments
CREATE TABLE IF NOT EXISTS solar_resource_assignments (
    object_id           BIGINT PRIMARY KEY,
    activity_object_id  BIGINT,
    resource_object_id  BIGINT,
    resource_id         VARCHAR(50),
    resource_name       VARCHAR(255),
    resource_type       VARCHAR(50),
    planned_units       DECIMAL(15,2),
    actual_units        DECIMAL(15,2),
    remaining_units     DECIMAL(15,2),
    budget_at_completion_units DECIMAL(15,2),
    project_object_id   BIGINT
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_solar_act_project ON solar_activities(project_object_id);
CREATE INDEX IF NOT EXISTS idx_solar_act_wbs ON solar_activities(wbs_object_id);
CREATE INDEX IF NOT EXISTS idx_solar_wbs_project ON solar_wbs(project_object_id);
CREATE INDEX IF NOT EXISTS idx_solar_ra_activity ON solar_resource_assignments(activity_object_id);
CREATE INDEX IF NOT EXISTS idx_solar_ra_project ON solar_resource_assignments(project_object_id);
"""


# ─── Main Sync ─────────────────────────────────────────────────────

async def sync_data(target_project_id=None, full_sync=False, pool=None):
    log(f"Starting sync process (target_project_id={target_project_id}, full_sync={full_sync})")
    should_close_pool = False
    sync_now_ist = datetime.now(IST)
    
    log("Obtaining P6 token...")
    token = await get_valid_p6_token()
    headers = {"Authorization": f"Bearer {token}", "Accept": "application/json"}

    if not pool:
        log("No database pool provided, creating one...")
        pool = await create_pool()
        should_close_pool = True

    # 1. Create new tables
    log("Creating Solar tables...")
    for stmt in CREATE_TABLES_SQL.split(";"):
        stmt = stmt.strip()
        if stmt:
            try:
                await pool.execute(stmt)
            except Exception as e:
                log(f"  Table creation note: {e}")

    # 1.5 Ensure columns exist (Handling table evolution)
    log("Checking for missing columns...")
    evolution_queries = [
        "ALTER TABLE solar_activities ADD COLUMN IF NOT EXISTS block_capacity DECIMAL(10,2) DEFAULT 12.5",
        "ALTER TABLE solar_activities ADD COLUMN IF NOT EXISTS spv_no VARCHAR(100)",
        "ALTER TABLE solar_activities ADD COLUMN IF NOT EXISTS plot VARCHAR(255)",
        "ALTER TABLE solar_activities ADD COLUMN IF NOT EXISTS new_block_nom VARCHAR(255)",
        "ALTER TABLE solar_activities ADD COLUMN IF NOT EXISTS remarks TEXT",
        "ALTER TABLE solar_activities ADD COLUMN IF NOT EXISTS last_sync_at TIMESTAMPTZ DEFAULT NOW()",
        "ALTER TABLE solar_activities ADD COLUMN IF NOT EXISTS baseline1_start TIMESTAMPTZ",
        "ALTER TABLE solar_activities ADD COLUMN IF NOT EXISTS baseline1_finish TIMESTAMPTZ",
        "ALTER TABLE solar_activities ADD COLUMN IF NOT EXISTS baseline2_start TIMESTAMPTZ",
        "ALTER TABLE solar_activities ADD COLUMN IF NOT EXISTS baseline2_finish TIMESTAMPTZ",
        "ALTER TABLE solar_activities ADD COLUMN IF NOT EXISTS baseline3_start TIMESTAMPTZ",
        "ALTER TABLE solar_activities ADD COLUMN IF NOT EXISTS baseline3_finish TIMESTAMPTZ"
    ]
    for eq in evolution_queries:
        try:
            await pool.execute(eq)
        except Exception as e:
            log(f"  Migration note: {e}")

    # 2. Clear old data?
    if full_sync:
        log("FULL SYNC MODE: Clearing existing data from tables...")
        await pool.execute("TRUNCATE TABLE p6_projects, solar_activities, solar_wbs, solar_resource_assignments CASCADE")
    else:
        log("INCREMENTAL SYNC MODE: Upserting changed records only...")

    async with get_http_client(timeout=120.0) as client:

        # 3. Fetch ALL projects
        log("\n=== Step 1: Fetching Projects ===")
        projects = await fetch_all_retry(
            client, f"{BASE_URL}/project?Fields={PROJECT_FIELDS}", headers, "Projects"
        )
        
        if target_project_id:
            projects = [p for p in projects if str(p.get("ObjectId")) == str(target_project_id) or p.get("Id") == str(target_project_id)]
            log(f"  Targeted sync: Filtering to {len(projects)} project(s)")
        else:
            log(f"  Syncing all {len(projects)} projects")

        # Upsert projects
        for p in projects:
            p6_id = p.get("Id")
            object_id = p.get("ObjectId")
            last_user = p.get("LastUpdateUser")
            
            # If LastUpdateUser is missing (common in batch fetches), fetch individually
            if not last_user and object_id:
                try:
                    p_url = f"{BASE_URL}/project/{object_id}?Fields=LastUpdateUser"
                    p_resp = await client.get(p_url, headers=headers)
                    if p_resp.status_code == 200:
                        last_user = p_resp.json().get("LastUpdateUser")
                except Exception:
                    pass

            await pool.execute("""
                INSERT INTO p6_projects ("ObjectId", "Id", "Name", "Status", "StartDate", "FinishDate",
                                         "PlannedStartDate", "Description", "DataDate", "LastSyncAt", "LastUpdateDate", "LastUpdateUser")
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
                ON CONFLICT ("ObjectId") DO UPDATE SET
                    "Id"=$2, "Name"=$3, "Status"=$4, "StartDate"=$5, "FinishDate"=$6,
                    "PlannedStartDate"=$7, "Description"=$8, "DataDate"=$9, "LastSyncAt"=$10,
                    "LastUpdateDate"=$11, "LastUpdateUser"=$12
            """,
                int(object_id), p6_id, p.get("Name", ""),
                p.get("Status", ""), parse_date(p.get("StartDate")),
                parse_date(p.get("FinishDate")), parse_date(p.get("PlannedStartDate")),
                p.get("Description"), parse_date(p.get("DataDate")),
                sync_now_ist, parse_date(p.get("LastUpdateDate")), last_user
            )
        log(f"  OK {len(projects)} projects saved")

        # 4. Pre-fetch Activity Code DEFINITIONS only (small, global)
        log("\n=== Step 2: Fetching Activity Code Definitions ===")
        code_values = {}  # {code_object_id: code_value_string}
        for code_type_id, col_name in CODE_MAP.items():
            url = f"{BASE_URL}/activityCode?Filter=CodeTypeObjectId={code_type_id}&Fields=ObjectId,CodeValue"
            items = await fetch_all_retry(client, url, headers, f"CodeDef {code_type_id}")
            for item in items:
                code_values[int(item["ObjectId"])] = item.get("CodeValue", "")
            log(f"  Code definitions for {col_name}: {len(items)} values")

        # 4. Resource UOM Mapping
        log("\n=== Step 2b: Fetching Unit of Measure Definitions ===")
        try:
            uoms = await fetch_all_retry(client, f"{BASE_URL}/unitOfMeasure?Fields=ObjectId,Name", headers, "UOMs")
            uom_map = {int(u["ObjectId"]): u["Name"] for u in uoms}
        except Exception as e:
            log(f"  Warning: Could not fetch UOM definitions: {e}")
            uom_map = {}
        
        log("Fetching Resources with UOM association...")
        res_items = await fetch_all_retry(
            client, f"{BASE_URL}/resource?Fields=ObjectId,UnitOfMeasureObjectId,UnitOfMeasureName", headers, "Resources"
        )
        resource_uom = {} # {resource_object_id: unit_of_measure_name}
        for res in res_items:
            uom = res.get("UnitOfMeasureName")
            if not uom and res.get("UnitOfMeasureObjectId"):
                uom = uom_map.get(int(res["UnitOfMeasureObjectId"]), "")
            resource_uom[int(res["ObjectId"])] = uom or ""
        log(f"  Mapped {len(resource_uom)} resources to UOM names")

        # 5. Sync per project: Activities + UDFs + Codes + WBS + Resources
        log(f"\n=== Step 3: Syncing {len(projects)} Projects ===")
        total_acts = 0
        total_wbs = 0
        total_ras = 0

        for i, proj in enumerate(projects):
            proj_id = int(proj["ObjectId"])
            proj_name = proj.get("Name", "?")
            proj_id_str = proj.get("Id", "")
            
            # Parse SPV and Plot from Project Name (e.g., "AGE26AL_A16_FT_50MW_PPA" or "ASE24L P20")
            # Usually SPV is first, Plot is second
            parts = re.split(r'[ _]', proj_name)
            spv_no = parts[0] if len(parts) > 0 else proj_id_str
            plot = parts[1] if len(parts) > 1 else ""

            log(f"  [{i+1}/{len(projects)}] Starting {proj_name} (SPV: {spv_no}, Plot: {plot})...")

            try:
                # 5a. Resource Assignments & Aggregation
                log(f"    Fetching Resource Assignments...")
                ras = await fetch_all_retry(
                    client,
                    f"{BASE_URL}/resourceAssignment?Filter=ProjectObjectId={proj_id}&Fields={RA_FIELDS}",
                    headers
                )
                total_ras += len(ras)

                ra_agg = {} # {activity_id: {total_qty, uom, balance, cumulative}}
                for ra in ras:
                    act_obj_id = int(ra["ActivityObjectId"]) if ra.get("ActivityObjectId") else None
                    if not act_obj_id:
                        continue
                        
                    res_id = ra.get("ResourceId", "").upper()
                    res_type = ra.get("ResourceType", "")
                    
                    # USER REQUIREMENT: Take material (MT) resource only.
                    # Material resources usually have Type="Material" or ID contains "MT"
                    # We explicitly exclude Non-Labor (NL) and Labor (MP) is naturally excluded.
                    is_material = (res_type == "Material" or "MT" in res_id) and ("NL" not in res_id) and ("MP" not in res_id)
                    
                    if not is_material:
                        continue

                    res_obj_id = int(ra["ResourceObjectId"]) if ra.get("ResourceObjectId") else None
                    uom_val = resource_uom.get(res_obj_id, "") if res_obj_id else ""
                    
                    if act_obj_id not in ra_agg:
                        ra_agg[act_obj_id] = {
                            "total_qty": 0.0,
                            "balance": 0.0,
                            "cumulative": 0.0,
                            "uom": uom_val
                        }
                    
                    # PlannedUnits is considered Total Quantity / Scope
                    ra_agg[act_obj_id]["total_qty"] += parse_float(ra.get("PlannedUnits")) or 0.0
                    ra_agg[act_obj_id]["balance"] += parse_float(ra.get("RemainingUnits")) or 0.0
                    ra_agg[act_obj_id]["cumulative"] += parse_float(ra.get("ActualUnits")) or 0.0
                    if not ra_agg[act_obj_id]["uom"] and uom_val:
                        ra_agg[act_obj_id]["uom"] = uom_val
                
                # Insert Ras into DB
                for ra in ras:
                    await pool.execute("""
                        INSERT INTO solar_resource_assignments (
                            object_id, activity_object_id, resource_object_id,
                            resource_id, resource_name, resource_type,
                            planned_units, actual_units, remaining_units, budget_at_completion_units, project_object_id
                        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
                        ON CONFLICT (object_id) DO UPDATE SET
                            activity_object_id=$2, resource_object_id=$3,
                            resource_id=$4, resource_name=$5, resource_type=$6,
                            planned_units=$7, actual_units=$8, remaining_units=$9, budget_at_completion_units=$10, project_object_id=$11
                    """,
                        int(ra["ObjectId"]),
                        int(ra["ActivityObjectId"]) if ra.get("ActivityObjectId") else None,
                        int(ra["ResourceObjectId"]) if ra.get("ResourceObjectId") else None,
                        ra.get("ResourceId", ""),
                        (ra.get("ResourceName", "") or "")[:255],
                        ra.get("ResourceType", ""),
                        parse_float(ra.get("PlannedUnits")),
                        parse_float(ra.get("ActualUnits")),
                        parse_float(ra.get("RemainingUnits")),
                        parse_float(ra.get("BudgetAtCompletionUnits")),
                        proj_id,
                    )

                # 5b. Activity Expenses (for UOM and Units)
                log(f"    Fetching Activity Expenses...")
                exps = await fetch_all_retry(
                    client,
                    f"{BASE_URL}/activityExpense?Filter=ProjectObjectId={proj_id}&Fields={EXPENSE_FIELDS}",
                    headers
                )
                exp_agg = {} # {act_obj_id: {total_qty, balance, cumulative, uom}}
                for e in exps:
                    act_obj_id = int(e["ActivityObjectId"]) if e.get("ActivityObjectId") else None
                    if not act_obj_id:
                        continue
                    
                    if act_obj_id not in exp_agg:
                        exp_agg[act_obj_id] = {
                            "total_qty": 0.0,
                            "balance": 0.0,
                            "cumulative": 0.0,
                            "uom": e.get("UnitOfMeasure", "")
                        }
                    
                    exp_agg[act_obj_id]["total_qty"] += parse_float(e.get("PlannedUnits")) or 0.0
                    exp_agg[act_obj_id]["balance"] += parse_float(e.get("RemainingUnits")) or 0.0
                    exp_agg[act_obj_id]["cumulative"] += parse_float(e.get("ActualUnits")) or 0.0
                    if not exp_agg[act_obj_id]["uom"] and e.get("UnitOfMeasure"):
                        exp_agg[act_obj_id]["uom"] = e.get("UnitOfMeasure")

                # 5c. Activities
                log(f"    Fetching activities...")
                acts = await fetch_all_retry(
                    client,
                    f"{BASE_URL}/activity?Filter=ProjectObjectId={proj_id}&Fields={ACTIVITY_FIELDS}",
                    headers
                )
                log(f"    {len(acts)} activities fetched")

                # 5c. Fetch UDFs for THIS project's activities
                act_ids = {int(a["ObjectId"]) for a in acts}
                udf_data = {}  # {activity_id: {col: val, ...}}
                if act_ids and UDF_MAP:
                    log(f"    Fetching UDFs for {len(act_ids)} activities...")
                    for udf_id, (col_name, data_type) in UDF_MAP.items():
                        field_name = "Double" if data_type == "Double" else "Text"
                        url = f"{BASE_URL}/udfValue?Filter=ProjectObjectId={proj_id} AND UDFTypeObjectId={udf_id}&Fields=ForeignObjectId,{field_name}"
                        items = await fetch_all_retry(client, url, headers)
                        for item in items:
                            fk = int(item.get("ForeignObjectId", 0))
                            val = item.get(field_name)
                            if fk in act_ids and val is not None:
                                if fk not in udf_data:
                                    udf_data[fk] = {}
                                udf_data[fk][col_name] = val
                    log(f"    UDFs: {len(udf_data)} activities enriched")

                # 5d. Fetch Activity Code Assignments for this project
                code_data = {}  # {activity_id: {col: val, ...}}
                if CODE_MAP:
                    log(f"    Fetching Activity Codes...")
                    for code_type_id, col_name in CODE_MAP.items():
                        url = f"{BASE_URL}/activityCodeAssignment?Filter=ProjectObjectId={proj_id} AND ActivityCodeTypeObjectId={code_type_id}&Fields=ActivityObjectId,ActivityCodeObjectId"
                        items = await fetch_all_retry(client, url, headers)
                        for item in items:
                            act_id = int(item.get("ActivityObjectId", 0))
                            code_obj_id = int(item.get("ActivityCodeObjectId", 0))
                            if act_id in act_ids and code_obj_id in code_values:
                                if act_id not in code_data:
                                    code_data[act_id] = {}
                                code_data[act_id][col_name] = code_values[code_obj_id]
                    log(f"    Codes: {len(code_data)} activities enriched")

                for a in acts:
                    oid = int(a["ObjectId"])
                    act_name = a.get("Name", "")
                    
                    # Merge UDF data
                    u = udf_data.get(oid, {})
                    # Merge Code data
                    cd = code_data.get(oid, {})
                    # Merge RA data (Only Material resources are in ra_agg now)
                    ra_data = ra_agg.get(oid, {"total_qty": 0.0, "balance": 0.0, "cumulative": 0.0, "uom": ""})
                    # Merge Expense data
                    e_data = exp_agg.get(oid, {"total_qty": 0.0, "balance": 0.0, "cumulative": 0.0, "uom": ""})
                    
                    # Logic: If Material units exist, use them. Else, use Expense units.
                    if ra_data["total_qty"] > 0 or ra_data["cumulative"] > 0:
                        final_total_qty = ra_data["total_qty"]
                        final_balance = ra_data["balance"]
                        final_cumulative = ra_data["cumulative"]
                        final_uom = ra_data["uom"] or e_data["uom"]
                    else:
                        final_total_qty = e_data["total_qty"]
                        final_balance = e_data["balance"]
                        final_cumulative = e_data["cumulative"]
                        final_uom = e_data["uom"] or ra_data["uom"]

                    # USER REQUIREMENT: Material Resource only, no fallback to Activity PlannedTotalUnits.
                    # We have correctly merged Material Resources and Activity Expenses here.

                    # Extract "Block-XX" from Activity Name
                    block_match = re.search(r'(Block-\w+)', act_name, re.IGNORECASE)
                    new_block_nom = block_match.group(1) if block_match else None

                    await pool.execute("""
                        INSERT INTO solar_activities (
                            object_id, activity_id, name, status, activity_type,
                            project_object_id, wbs_object_id, wbs_name,
                            planned_start, planned_finish, start_date, finish_date,
                            baseline_start, baseline_finish, 
                            baseline1_start, baseline1_finish,
                            baseline2_start, baseline2_finish,
                            baseline3_start, baseline3_finish,
                            actual_start, actual_finish,
                            percent_complete, physical_percent_complete,
                            planned_duration, remaining_duration, actual_duration,
                            primary_resource,
                            total_quantity, balance, cumulative, uom, priority, scope, weightage,
                            phase, discipline,
                            block_capacity, spv_no, plot, new_block_nom, remarks, last_sync_at
                        ) VALUES (
                            $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,
                            $17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,
                            $34, $35, $36, $37, 12.5, $38, $39, $40, $41, $42
                        )
                        ON CONFLICT (object_id) DO UPDATE SET
                            activity_id=$2, name=$3, status=$4, activity_type=$5,
                            project_object_id=$6, wbs_object_id=$7, wbs_name=$8,
                            planned_start=$9, planned_finish=$10, start_date=$11, finish_date=$12,
                            baseline_start=$13, baseline_finish=$14, 
                            baseline1_start=$15, baseline1_finish=$16,
                            baseline2_start=$17, baseline2_finish=$18,
                            baseline3_start=$19, baseline3_finish=$20,
                            actual_start=$21, actual_finish=$22,
                            percent_complete=$23, physical_percent_complete=$24,
                            planned_duration=$25, remaining_duration=$26, actual_duration=$27,
                            primary_resource=$28,
                            total_quantity=$29, balance=$30, cumulative=$31, uom=$32, 
                            priority=COALESCE(solar_activities.priority, $33), 
                            scope=$34, 
                            weightage=COALESCE(solar_activities.weightage, $35),
                            phase=COALESCE(solar_activities.phase, $36), 
                            discipline=$37,
                            spv_no=$38, plot=$39, 
                            new_block_nom=COALESCE(solar_activities.new_block_nom, $40), 
                            remarks=COALESCE(solar_activities.remarks, $41),
                            last_sync_at=$42
                    """,
                        oid,
                        a.get("Id", ""),
                        act_name,
                        a.get("Status", ""),
                        a.get("Type", ""),
                        proj_id,
                        int(a["WBSObjectId"]) if a.get("WBSObjectId") else None,
                        a.get("WBSName"),
                        parse_date(a.get("PlannedStartDate")),
                        parse_date(a.get("PlannedFinishDate")),
                        parse_date(a.get("StartDate")),
                        parse_date(a.get("FinishDate")),
                        parse_date(a.get("BaselineStartDate")),
                        parse_date(a.get("BaselineFinishDate")),
                        parse_date(a.get("Baseline1StartDate")),
                        parse_date(a.get("Baseline1FinishDate")),
                        parse_date(a.get("Baseline2StartDate")),
                        parse_date(a.get("Baseline2FinishDate")),
                        parse_date(a.get("Baseline3StartDate")),
                        parse_date(a.get("Baseline3FinishDate")),
                        parse_date(a.get("ActualStartDate")),
                        parse_date(a.get("ActualFinishDate")),
                        parse_percent(a.get("PercentComplete")),
                        parse_percent(a.get("PhysicalPercentComplete")),
                        parse_float(a.get("PlannedDuration")),
                        parse_float(a.get("RemainingDuration")),
                        parse_float(a.get("ActualDuration")),
                        a.get("PrimaryResourceName"),
                        final_total_qty,
                        final_balance,
                        final_cumulative,
                        final_uom,
                        str(u.get("priority")) if u.get("priority") else None, # priority from UDF
                        final_total_qty, # Scope same as Total Qty
                        parse_float(u.get("weightage")),
                        cd.get("phase"), # phase from Activity Code
                        cd.get("discipline"),
                        spv_no,
                        plot,
                        new_block_nom,
                        None, # remarks is manual entry, preserve via COALESCE
                        sync_now_ist
                    )
                total_acts += len(acts)

                # 6b. WBS
                wbs_items = await fetch_all_retry(
                    client,
                    f"{BASE_URL}/wbs?Filter=ProjectObjectId={proj_id}&Fields={WBS_FIELDS}",
                    headers
                )
                for w in wbs_items:
                    await pool.execute("""
                        INSERT INTO solar_wbs (object_id, name, code, parent_object_id, project_object_id, status)
                        VALUES ($1, $2, $3, $4, $5, $6)
                        ON CONFLICT (object_id) DO UPDATE SET
                            name=$2, code=$3, parent_object_id=$4, project_object_id=$5, status=$6
                    """,
                        int(w["ObjectId"]),
                        w.get("Name", ""),
                        w.get("Code", ""),
                        int(w["ParentObjectId"]) if w.get("ParentObjectId") else None,
                        proj_id,
                        w.get("Status", ""),
                    )
                total_wbs += len(wbs_items)

                """
                Removed Resource Assignments from here since they are now fetched before Activities
                """

                # Progress
                log(f"  [{i+1}/{len(projects)}] DONE {proj_name}: {len(acts)} acts, {len(wbs_items)} wbs, {len(ras)} res")

            except Exception as e:
                log(f"  [{i+1}/{len(projects)}] ERROR on {proj_name}: {e}")

    # Summary
    log(f"\n{'='*60}")
    log(f"OK SYNC COMPLETE")
    log(f"  Projects:             {len(projects)}")
    log(f"  Solar Activities:     {total_acts}")
    log(f"  Solar WBS:            {total_wbs}")
    log(f"  Solar Res Assignments:{total_ras}")
    log(f"{'='*60}")

    log(f"OK SYNC COMPLETE: {target_project_id if target_project_id else 'All'}")

    if should_close_pool and pool:
        await pool.close()
        log("Database pool closed.")


if __name__ == "__main__":
    import sys
    target_id = None
    is_full = False
    
    for arg in sys.argv[1:]:
        if arg == "--full" or arg == "/full":
            is_full = True
        else:
            target_id = arg
            
    asyncio.run(sync_data(target_id, is_full))
