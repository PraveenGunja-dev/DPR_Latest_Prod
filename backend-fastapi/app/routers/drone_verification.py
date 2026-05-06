import httpx
import logging
import re
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
from datetime import date, datetime

from app.database import get_pool
from app.auth.dependencies import get_current_user
from app.services.spectra_service import fetch_all_drone_data, fetch_spectra_projects

router = APIRouter(prefix="/api/drone", tags=["drone"])
logger = logging.getLogger("adani-flow.drone")

# ──────────────────────────────────────────────────────────────
# DPR Project Name → Spectra project_id mapping
# Spectra projects: { 1: "Baiya", 2: "Khavda" }
# ──────────────────────────────────────────────────────────────
def _resolve_spectra_project_id(project_name: str, p6_id: Optional[str] = None) -> Optional[int]:
    """Map our DPR project name or P6 ID to the Spectra project_id."""
    name_lower = (project_name or "").lower()
    p6_id_upper = (p6_id or "").upper()
    
    # Baiya check
    if "baiya" in name_lower:
        return 1  # Spectra project_id 1 = Baiya
        
    # Khavda check
    drone_p6_ids = ["FY25-P10", "FY25-P11", "FY25-P12", "FY25-P13"]
    if "khavda" in name_lower or "a16" in name_lower or any(pid in p6_id_upper for pid in drone_p6_ids):
        return 2  # Spectra project_id 2 = Khavda
        
    return None


# ──────────────────────────────────────────────────────────────
# Activity-to-Spectra-API mapping
# ──────────────────────────────────────────────────────────────
ACTIVITY_DRONE_MAP = [
    # --- block_progress API ---
    # field = scope/planned total, actual_field = cumulative actual from drone
    {"pattern": r"piling\s*-?\s*mms|piling.*marking.*auguring|marking.*auguring.*concreting",
     "api": "block_progress", "field": "piling_total", "actual_field": "piling_current", "label": "Piling - MMS"},
    {"pattern": r"pile\s*capp",
     "api": "block_progress", "field": "piling_cap_total", "actual_field": "piling_cap_current", "label": "Pile Capping"},
    {"pattern": r"mms\s*erection.*torque\s*tube|torque\s*tube.*raft[ae]r",
     "api": "block_progress", "field": "rafter_total", "actual_field": "rafter_current", "label": "MMS Erection - Torque Tube/Raftar"},
    {"pattern": r"mms\s*erection.*purlin|purlin",
     "api": "block_progress", "field": "purlin_total", "actual_field": "purlin_current", "label": "MMS Erection - Purlin"},
    {"pattern": r"module\s*(installation|mounting)",
     "api": "block_progress", "field": "module_total", "actual_field": "module_current", "label": "Module Installation"},

    # --- inverter_progress API ---
    {"pattern": r"piling\s*-?\s*inverter",
     "api": "inverter_progress", "field": "count_piling", "actual_field": "count_piling", "label": "Piling - Inverters"},
    {"pattern": r"inverter\s*installation",
     "api": "inverter_progress", "field": "total_inverters", "actual_field": "count_inverter_completed", "label": "Inverter Installation"},

    # --- robot_progress API ---
    {"pattern": r"piling\s*-?\s*robotic\s*docking",
     "api": "robot_progress", "field": "count_piling", "actual_field": "count_piling", "label": "Piling - Robotic Docking System"},
    {"pattern": r"robotic\s*structure\s*-?\s*docking\s*station",
     "api": "robot_progress", "field": "count_robot_installed", "actual_field": "count_robot_installed", "label": "Robotic Structure - Docking Station"},
    {"pattern": r"robotic\s*structure\s*-?\s*reverse\s*station",
     "api": "robot_progress", "field": "count_robot_installed", "actual_field": "count_robot_installed", "label": "Robotic Structure - Reverse Station"},
    {"pattern": r"robot\s*installation",
     "api": "robot_progress", "field": "count_robot_installed", "actual_field": "count_robot_installed", "label": "Robot Installation"},

    # --- ac_work_progress API ---
    # ac_work fields are binary (0/1), no separate scope field
    {"pattern": r"ht\s*&?\s*lt\s*station\s*-?\s*slab",
     "api": "ac_work_progress", "field": "ht_lt_station_slab", "actual_field": "ht_lt_station_slab", "label": "HT & LT Station - Slab"},
    {"pattern": r"ht\s*lt\s*station\s*-?\s*staircase",
     "api": "ac_work_progress", "field": "ht_lt_station_staircase", "actual_field": "ht_lt_station_staircase", "label": "HT LT Station - Staircase"},
    {"pattern": r"ht\s*&?\s*lt\s*station\s*-?\s*shed\s*installation",
     "api": "ac_work_progress", "field": "ht_lt_station_shed_installation", "actual_field": "ht_lt_station_shed_installation", "label": "HT & LT Station - Shed Installation"},
    {"pattern": r"ht\s*&?\s*lt\s*station\s*-?\s*sheeting\s*installation",
     "api": "ac_work_progress", "field": "ht_lt_station_sheeting_installation", "actual_field": "ht_lt_station_sheeting_installation", "label": "HT & LT Station - Sheeting Installation"},
    {"pattern": r"idt\s*foundation.*grade\s*slab|grade\s*slab.*dyke",
     "api": "ac_work_progress", "field": "idt_foundation_grad_slab_dyke", "actual_field": "idt_foundation_grad_slab_dyke", "label": "IDT Foundation - Grade Slab & Dyke Wall"},
    {"pattern": r"nifps\s*foundation",
     "api": "ac_work_progress", "field": "nifps_foundation", "actual_field": "nifps_foundation", "label": "NIFPS Foundation"},
    {"pattern": r"bot\s*foundation",
     "api": "ac_work_progress", "field": "bot_foundation", "actual_field": "bot_foundation", "label": "BOT Foundation"},
    {"pattern": r"aux\s*transformer\s*foundation",
     "api": "ac_work_progress", "field": "aux_transformer_foundation", "actual_field": "aux_transformer_foundation", "label": "Aux Transformer Foundation"},
    {"pattern": r"idt\s*area\s*-?\s*fencing",
     "api": "ac_work_progress", "field": "idt_area_fencing", "actual_field": "idt_area_fencing", "label": "IDT Area - Fencing"},
    {"pattern": r"idt\s*area\s*-?\s*gate\s*installation",
     "api": "ac_work_progress", "field": "idt_area_gate_installation", "actual_field": "idt_area_gate_installation", "label": "IDT Area - Gate Installation"},
    {"pattern": r"idt\s*area\s*-?\s*gravel\s*filling",
     "api": "ac_work_progress", "field": "idt_area_gravel_filling", "actual_field": "idt_area_gravel_filling", "label": "IDT Area - Gravel Filling"},
    {"pattern": r"fo\s*cable\s*laying",
     "api": "ac_work_progress", "field": "fo_cable_laying", "actual_field": "fo_cable_laying", "label": "FO Cable Laying"},
    {"pattern": r"control\s*cable\s*laying",
     "api": "ac_work_progress", "field": "control_cable_laying", "actual_field": "control_cable_laying", "label": "Control Cable Laying"},
    {"pattern": r"ht\s*panel\s*erection",
     "api": "ac_work_progress", "field": "ht_panel_erection", "actual_field": "ht_panel_erection", "label": "HT Panel Erection"},
    {"pattern": r"lt\s*panel\s*erection",
     "api": "ac_work_progress", "field": "lt_panel_erection", "actual_field": "lt_panel_erection", "label": "LT Panel Erection"},
    {"pattern": r"idt\s*erection",
     "api": "ac_work_progress", "field": "idt_erection", "actual_field": "idt_erection", "label": "IDT Erection"},
]


class CompareRequest(BaseModel):
    report_date: str = "2026-04-23"
    dpr_rows: List[Dict[str, Any]]


def _resolve_khavda_block(p6_id: str, p6_name: str) -> Optional[str]:
    """Map Khavda P6 project ID/Name to Drone block_name prefix."""
    if not p6_id and not p6_name:
        return None
    p6_id = p6_id or ""
    p6_name = p6_name or ""
    if p6_id == "FY25-P10" or "50MW" in p6_name:
        return "A16A"
    if p6_id == "FY25-P11" or "200MW" in p6_name:
        return "A16B"
    if p6_id == "FY25-P12" or "167MW" in p6_name:
        return "A16C"
    if p6_id == "FY25-P13" or "333MW" in p6_name:
        return "A16D"
    return None


def _normalize_block_name(name: str) -> str:
    """Normalizes 'A16A_B01' or 'B01' or 'BLOCK-01' into 'BLOCK-01'."""
    if not name:
        return "Unknown"
    name = str(name).upper().strip()
    
    # Try parsing patterns like A16A_B01, A16B_B02 (extract B01 -> BLOCK-01)
    match = re.search(r'_B(\d+)$', name)
    if match:
        num = int(match.group(1))
        return f"BLOCK-{num:02d}"
        
    # Try parsing patterns like 'B01', 'BLOCK 1', 'BLOCK-01'
    match = re.search(r'(?:BLOCK[-\s]*|B)(\d+)$', name)
    if match:
        num = int(match.group(1))
        return f"BLOCK-{num:02d}"
        
    return name



def _aggregate_spectra_data(api_rows: List[Dict[str, Any]], field: str, target_block_prefix: Optional[str] = None) -> float:
    """Sum a specific field value from all rows returned by a Spectra API."""
    total = 0.0
    for row in api_rows:
        if target_block_prefix:
            row_block = row.get("block_name") or row.get("block") or ""
            if not str(row_block).upper().startswith(target_block_prefix):
                continue
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
    Maps DPR project \u2192 Spectra project_id, then fetches drone data
    only for that specific project.
    """
    pool = await get_pool()
    
    try:
        # 1. Verify project and resolve Spectra project_id
        project_row = await pool.fetchrow("SELECT name, id FROM projects WHERE object_id = $1", project_id)
        if not project_row:
            # Try p6_projects if not found in projects table
            p6_row = await pool.fetchrow("SELECT \"Name\", \"Id\" FROM p6_projects WHERE \"ObjectId\" = $1", project_id)
            if not p6_row:
                logger.error(f"Project not found for object_id: {project_id}")
                raise HTTPException(status_code=404, detail="Project not found")
            project_name = p6_row["Name"]
            p6_id = p6_row["Id"]
        else:
            project_name = project_row["name"]
            p6_id = project_row["id"]

        logger.info(f"Resolved project: name='{project_name}', p6_id='{p6_id}'")
        spectra_project_id = _resolve_spectra_project_id(project_name, p6_id)

        # Resolve Khavda Block if applicable
        target_block = None
        if spectra_project_id == 2:
            target_block = _resolve_khavda_block(p6_id, project_name)
            logger.info(f"Resolved Khavda block: {target_block}")

        if spectra_project_id is None:
            return {
                "status": "unsupported",
                "message": f"Drone verification is not available for '{project_name}'. Only Baiya and Khavda projects are supported.",
                "data": []
            }

        logger.info(f"Drone compare: DPR project '{project_name}' (id={project_id}) \u2192 Spectra project_id={spectra_project_id}")

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

        grouped_results = {}

        for d_row in dpr_rows:
            # dpBlockData uses 'activities' as the name field (with block prefix)
            activity_name = (
                d_row.get("activities") or
                d_row.get("description") or
                d_row.get("activity") or ""
            ).strip()

            if not activity_name:
                continue

            # Strip block prefix: "Block-01 - Piling - MMS..." -> "Piling - MMS..."
            clean_name = re.sub(r'^Block[-\s]*\d+\s*[-–]\s*', '', activity_name, flags=re.IGNORECASE).strip()
            activity_lower = clean_name.lower()

            # Use 'completed' field (P6 actual units / cumulative) - NOT daily value
            completed_val = d_row.get("completed") or d_row.get("cumulative") or d_row.get("actual") or "0"
            completed_str = str(completed_val).replace(",", "").strip()
            try:
                dpr_completed = float(completed_str)
            except ValueError:
                dpr_completed = 0.0

            # Try to match against our mapping
            for mapping in ACTIVITY_DRONE_MAP:
                if re.search(mapping["pattern"], activity_lower, re.IGNORECASE):
                    api_name = mapping["api"]
                    # Use the actual progress field, not the scope field!
                    field_name = mapping.get("actual_field") or mapping["field"]
                    label = mapping["label"]

                    if label not in grouped_results:
                        grouped_results[label] = {
                            "activity": label,
                            "spectra_api": api_name,
                            "spectra_field": field_name,
                            "dpr_actual": 0.0,
                            "drone_actual": 0.0,
                            "block_breakdown": {}
                        }
                    
                    # Get the block from DPR row (dpBlockData has block like "BLOCK-01")
                    block_val = str(d_row.get("block") or d_row.get("newBlockNom") or d_row.get("plot") or "Unknown").strip()
                    block_val = _normalize_block_name(block_val)

                    # Add DPR to total and breakdown
                    grouped_results[label]["dpr_actual"] += dpr_completed
                    if block_val not in grouped_results[label]["block_breakdown"]:
                        grouped_results[label]["block_breakdown"][block_val] = {"dpr_actual": 0.0, "drone_actual": 0.0}
                    grouped_results[label]["block_breakdown"][block_val]["dpr_actual"] += dpr_completed
                    break

        # Now calculate drone data for each mapped activity
        comparison_results = []
        
        for label, group in grouped_results.items():
            api_name = group["spectra_api"]
            field_name = group["spectra_field"]
            api_rows = all_drone_data.get(api_name, [])
            
            # Build a drone-side block breakdown from Spectra data
            drone_block_totals = {}
            drone_total = 0.0
            for row in api_rows:
                # ac_work_progress uses subplot+block, others use block_name
                if api_name == "ac_work_progress":
                    subplot = str(row.get("subplot") or "").strip()
                    block_part = str(row.get("block") or "").strip()
                    row_block = f"{subplot}_{block_part}" if subplot and block_part else subplot or block_part
                else:
                    row_block = str(row.get("block_name") or row.get("block") or "").strip()
                
                # Filter by target_block for Khavda sub-projects
                if target_block and not row_block.upper().startswith(target_block):
                    continue
                    
                norm_block = _normalize_block_name(row_block)
                    
                val = row.get(field_name)
                if val is not None:
                    try:
                        val_float = float(val)
                        drone_total += val_float
                        # Track per-block drone totals
                        if norm_block != "Unknown":
                            drone_block_totals[norm_block] = drone_block_totals.get(norm_block, 0.0) + val_float
                    except (ValueError, TypeError):
                        pass
            
            group["drone_actual"] = drone_total
            
            # Build block_breakdown as ARRAY for frontend
            block_breakdown_list = []
            dpr_blocks = group["block_breakdown"]
            
            # Collect all unique block names from both DPR and Drone sides
            all_blocks = set(dpr_blocks.keys()) | set(drone_block_totals.keys())
            
            for block_name in sorted(all_blocks):
                b_dpr = dpr_blocks.get(block_name, {}).get("dpr_actual", 0.0)
                b_drone = drone_block_totals.get(block_name, 0.0)
                
                # Also try fuzzy match: DPR might use "A16D" while drone uses "A16D-01"
                if b_drone == 0.0 and block_name in dpr_blocks:
                    for drone_bk, drone_val in drone_block_totals.items():
                        if drone_bk.upper().startswith(block_name.upper()):
                            b_drone += drone_val
                
                b_variance = round(b_dpr - b_drone, 2)
                b_status = "Verified"
                if b_variance > 1.0:
                    b_status = "Over-Reported"
                elif b_variance < -1.0:
                    b_status = "Under-Reported"
                    
                block_breakdown_list.append({
                    "block": block_name,
                    "dpr_actual": round(b_dpr, 2),
                    "drone_actual": round(b_drone, 2),
                    "variance": b_variance,
                    "status": b_status
                })
            
            # Calculate top-level status
            variance = round(group["dpr_actual"] - group["drone_actual"], 2)
            status = "Verified"
            if variance > 1.0:
                status = "Over-Reported"
            elif variance < -1.0:
                status = "Under-Reported"
                
            comparison_results.append({
                "activity": group["activity"],
                "spectra_api": api_name,
                "spectra_field": field_name,
                "dpr_actual": round(group["dpr_actual"], 2),
                "drone_actual": round(group["drone_actual"], 2),
                "variance": variance,
                "status": status,
                "block_breakdown": block_breakdown_list if len(block_breakdown_list) > 1 else []
            })

        return {
            "status": "success",
            "project_name": project_name,
            "report_date": report_date,
            "spectra_project": {"id": spectra_project_id, "name": "Baiya" if spectra_project_id == 1 else "Khavda"},
            "total_activities_compared": len(comparison_results),
            "data": comparison_results
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Unexpected error in compare_drone_data: {e}")
        raise HTTPException(status_code=500, detail=f"Internal Server Error: {str(e)}")

