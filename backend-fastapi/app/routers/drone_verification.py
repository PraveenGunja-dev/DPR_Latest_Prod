from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
from datetime import date, datetime
import logging
import re

from app.database import get_pool
from app.auth.dependencies import get_current_user
from app.services.spectra_service import fetch_all_drone_data, fetch_spectra_projects

router = APIRouter(prefix="/api/drone", tags=["drone"])
logger = logging.getLogger("adani-flow.drone")

# ──────────────────────────────────────────────────────────────
# DPR Project Name → Spectra project_id mapping
# Spectra projects: { 1: "Baiya", 2: "Khavda" }
# ──────────────────────────────────────────────────────────────
def _resolve_spectra_project_id(project_name: str) -> Optional[int]:
    """Map our DPR project name to the Spectra project_id."""
    name_lower = project_name.lower()
    if "baiya" in name_lower:
        return 1  # Spectra project_id 1 = Baiya
    if "khavda" in name_lower:
        return 2  # Spectra project_id 2 = Khavda
    return None


# ──────────────────────────────────────────────────────────────
# Activity-to-Spectra-API mapping
# ──────────────────────────────────────────────────────────────
ACTIVITY_DRONE_MAP = [
    # --- block_progress API ---
    {"pattern": r"piling\s*-?\s*mms|piling.*marking.*auguring|marking.*auguring.*concreting",
     "api": "block_progress", "field": "piling_current", "label": "Piling - MMS"},
    {"pattern": r"pile\s*capp",
     "api": "block_progress", "field": "piling_cap_current", "label": "Pile Capping"},
    {"pattern": r"mms\s*erection.*torque\s*tube|torque\s*tube.*raft[ae]r",
     "api": "block_progress", "field": "rafter_current", "label": "MMS Erection - Torque Tube/Raftar"},
    {"pattern": r"mms\s*erection.*purlin|purlin",
     "api": "block_progress", "field": "purlin_current", "label": "MMS Erection - Purlin"},
    {"pattern": r"module\s*(installation|mounting)",
     "api": "block_progress", "field": "module_current", "label": "Module Installation"},

    # --- inverter_progress API ---
    {"pattern": r"piling\s*-?\s*inverter",
     "api": "inverter_progress", "field": "count_piling", "label": "Piling - Inverters"},
    {"pattern": r"inverter\s*installation",
     "api": "inverter_progress", "field": "count_inverter_completed", "label": "Inverter Installation"},

    # --- robot_progress API ---
    {"pattern": r"piling\s*-?\s*robotic\s*docking",
     "api": "robot_progress", "field": "count_piling", "label": "Piling - Robotic Docking System"},
    {"pattern": r"robotic\s*structure\s*-?\s*docking\s*station",
     "api": "robot_progress", "field": "count_robot_installed", "label": "Robotic Structure - Docking Station"},
    {"pattern": r"robotic\s*structure\s*-?\s*reverse\s*station",
     "api": "robot_progress", "field": "count_robot_installed", "label": "Robotic Structure - Reverse Station"},
    {"pattern": r"robot\s*installation",
     "api": "robot_progress", "field": "count_robot_installed", "label": "Robot Installation"},

    # --- ac_work_progress API ---
    {"pattern": r"ht\s*&?\s*lt\s*station\s*-?\s*slab",
     "api": "ac_work_progress", "field": "ht_lt_station_slab", "label": "HT & LT Station - Slab"},
    {"pattern": r"ht\s*lt\s*station\s*-?\s*staircase",
     "api": "ac_work_progress", "field": "ht_lt_station_staircase", "label": "HT LT Station - Staircase"},
    {"pattern": r"ht\s*&?\s*lt\s*station\s*-?\s*shed\s*installation",
     "api": "ac_work_progress", "field": "ht_lt_station_shed_installation", "label": "HT & LT Station - Shed Installation"},
    {"pattern": r"ht\s*&?\s*lt\s*station\s*-?\s*sheeting\s*installation",
     "api": "ac_work_progress", "field": "ht_lt_station_sheeting_installation", "label": "HT & LT Station - Sheeting Installation"},
    {"pattern": r"idt\s*foundation.*grade\s*slab|grade\s*slab.*dyke",
     "api": "ac_work_progress", "field": "idt_foundation_grad_slab_dyke", "label": "IDT Foundation - Grade Slab & Dyke Wall"},
    {"pattern": r"nifps\s*foundation",
     "api": "ac_work_progress", "field": "nifps_foundation", "label": "NIFPS Foundation"},
    {"pattern": r"bot\s*foundation",
     "api": "ac_work_progress", "field": "bot_foundation", "label": "BOT Foundation"},
    {"pattern": r"aux\s*transformer\s*foundation",
     "api": "ac_work_progress", "field": "aux_transformer_foundation", "label": "Aux Transformer Foundation"},
    {"pattern": r"idt\s*area\s*-?\s*fencing",
     "api": "ac_work_progress", "field": "idt_area_fencing", "label": "IDT Area - Fencing"},
    {"pattern": r"idt\s*area\s*-?\s*gate\s*installation",
     "api": "ac_work_progress", "field": "idt_area_gate_installation", "label": "IDT Area - Gate Installation"},
    {"pattern": r"idt\s*area\s*-?\s*gravel\s*filling",
     "api": "ac_work_progress", "field": "idt_area_gravel_filling", "label": "IDT Area - Gravel Filling"},
    {"pattern": r"fo\s*cable\s*laying",
     "api": "ac_work_progress", "field": "fo_cable_laying", "label": "FO Cable Laying"},
    {"pattern": r"control\s*cable\s*laying",
     "api": "ac_work_progress", "field": "control_cable_laying", "label": "Control Cable Laying"},
    {"pattern": r"ht\s*panel\s*erection",
     "api": "ac_work_progress", "field": "ht_panel_erection", "label": "HT Panel Erection"},
    {"pattern": r"lt\s*panel\s*erection",
     "api": "ac_work_progress", "field": "lt_panel_erection", "label": "LT Panel Erection"},
    {"pattern": r"idt\s*erection",
     "api": "ac_work_progress", "field": "idt_erection", "label": "IDT Erection"},
]


class CompareRequest(BaseModel):
    report_date: str = "2026-04-23"
    dpr_rows: List[Dict[str, Any]]


def _aggregate_spectra_data(api_rows: List[Dict[str, Any]], field: str) -> float:
    """Sum a specific field value from all rows returned by a Spectra API."""
    total = 0.0
    for row in api_rows:
        val = row.get(field)
        if val is not None:
            try:
                total += float(val)
            except (ValueError, TypeError):
                pass
    return total


@router.get("/spectra-projects")
async def list_spectra_projects(user: dict = Depends(get_current_user)):
    """Returns the list of projects available in Spectra Drone system."""
    projects = await fetch_spectra_projects()
    return {"projects": projects}


@router.post("/compare/{project_id}")
async def compare_drone_data(
    project_id: int,
    request: CompareRequest,
    user: dict = Depends(get_current_user)
):
    """
    Activity-based drone comparison.
    Maps DPR project → Spectra project_id, then fetches drone data
    only for that specific project.
    """
    pool = await get_pool()

    # 1. Verify project and resolve Spectra project_id
    project = await pool.fetchrow("SELECT name FROM projects WHERE object_id = $1", project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    project_name = project["name"]
    spectra_project_id = _resolve_spectra_project_id(project_name)

    if spectra_project_id is None:
        return {
            "status": "unsupported",
            "message": f"Drone verification is not available for '{project_name}'. Only Baiya and Khavda projects are supported.",
            "data": []
        }

    logger.info(f"Drone compare: DPR project '{project_name}' (id={project_id}) → Spectra project_id={spectra_project_id}")

    # 2. Fetch drone data filtered by the correct Spectra project
    report_date = request.report_date
    all_drone_data = await fetch_all_drone_data(report_date, project_id=spectra_project_id)

    apis_with_data = sum(1 for v in all_drone_data.values() if v)
    if apis_with_data == 0:
        return {
            "status": "no_data",
            "message": f"No drone data available for date {report_date}",
            "data": []
        }

    # 3. Process DPR Qty rows against the mapping
    dpr_rows = request.dpr_rows
    if not dpr_rows:
        return {
            "status": "no_dpr_data",
            "message": "No DP Qty data provided for comparison.",
            "data": []
        }

    comparison_results = []

    for d_row in dpr_rows:
        activity_name = (
            d_row.get("description") or
            d_row.get("activities") or
            d_row.get("activity") or ""
        ).strip()

        if not activity_name:
            continue

        activity_lower = activity_name.lower()

        # Find the DPR cumulative value
        completed_val = d_row.get("cumulative") or d_row.get("completed") or "0"
        completed_str = str(completed_val).replace(",", "").strip()
        try:
            dpr_completed = float(completed_str)
        except ValueError:
            dpr_completed = 0.0

        # Try to match against our mapping
        for mapping in ACTIVITY_DRONE_MAP:
            if re.search(mapping["pattern"], activity_lower, re.IGNORECASE):
                api_name = mapping["api"]
                field_name = mapping["field"]
                api_rows = all_drone_data.get(api_name, [])

                if not api_rows:
                    logger.debug(f"No data from {api_name} for '{activity_name}' (Spectra project {spectra_project_id})")
                    break

                drone_total = _aggregate_spectra_data(api_rows, field_name)
                variance = round(dpr_completed - drone_total, 2)

                if variance > 0:
                    status = "Over-Reported"
                elif variance < 0:
                    status = "Under-Reported"
                else:
                    status = "Verified"

                comparison_results.append({
                    "activity": activity_name,
                    "spectra_api": api_name,
                    "spectra_field": field_name,
                    "dpr_actual": dpr_completed,
                    "drone_actual": drone_total,
                    "variance": variance,
                    "status": status
                })
                break

    return {
        "status": "success",
        "report_date": report_date,
        "spectra_project": {"id": spectra_project_id, "name": "Baiya" if spectra_project_id == 1 else "Khavda"},
        "total_activities_compared": len(comparison_results),
        "data": comparison_results
    }
