# app/routers/bess_expand.py
"""
BESS DPR Activity Auto-Expansion endpoint.

Takes a simple template upload (e.g. 30 base DPR items for Block 1) and automatically
expands them across ALL blocks/BCTs present in the selected P6 project, using the
parent-child mapping derived from the PSS11.xlsx master file.

The expanded activities are inserted into `dpr_custom_activities` so the UI can
instantly display them grouped under their blue Activity Category headers.
"""

import logging
import re
from typing import Any
from fastapi import APIRouter, Depends, HTTPException, Query

from app.auth.dependencies import get_current_user
from app.database import get_db, PoolWrapper
from app.routers.project_utils import resolve_project_id

logger = logging.getLogger("adani-flow.bess_expand")

router = APIRouter(prefix="/api/bess-expand", tags=["BESS Expansion"])


# ---------------------------------------------------------------------------
# Standard BESS mapping rules.
# Key   = substring to match in the P6 parent activity name
# Value = list of DPR child items that need to be created for every matching block
# These are constant across all BESS projects.
# ---------------------------------------------------------------------------
CIVIL_MAPPING: dict[str, list[str]] = {
    "Driven Cast in-situ":   ["PCS - PIT & Chipping of Pile", "PCS - PEB Handrail",
                              "MCR - Screed Concrete/Tiles work", "SGR - Screed Concrete"],
    "Footing":               ["PCS - PCC", "CSS - UV Painting above FGL",
                              "MCR - UV Painting above FGL", "SGR - UV Painting above FGL"],
    "PEB (Shed":             ["PCS - Epoxy Painting below FGL", "SGR - PEB Secondary Structure"],
    "Slab casting":          ["PCS - Screed Concrete"],
    "Slab Reinforcement":    ["PCS - UV Painting above FGL"],
    "Stairecase Installation": ["PCS - PEB Primary Structure", "PCS - PEB Secondary Structure",
                                "MCR - UV Painting above FGL"],
    "Column Casting":        ["PCS - PEB Sheet", "MCR - Epoxy Painting below FGL",
                              "SGR - Epoxy Painting below FGL"],
    "Grade slab of CT":      ["CT - Epoxy Painting below FGL"],
    "PCC of CT":             ["CT - UV Painting above FGL"],
    "Backfilling":           ["CSS - Epoxy Painting below FGL"],
    "PCC":                   ["MCR - PEB Container Erection", "SGR - PEB Primary Structure"],
    "Pit & chipping":        ["SGR - PEB Sheet"],
    "Slab Casting":          ["SGR - PEB Handrail"],
    "Back Filling of BOT":   ["BOT - Raft"],
    "Erection of Precast":   ["BOT - 1st lift"],
    "Excavation of BOT":     ["BOT - Final lift"],
    "PCC of BOT":            ["BOT - Epoxy Painting below FGL"],
    "Rubble Soiling":        ["BOT - Slab", "BOT - UV Painting below FGL"],
}

ELECTRICAL_MAPPING: dict[str, list[str]] = {
    "HT Panel erec":         ["HT Panel - CT & PT Test"],
    "HT Panel for":          ["HT Panel - Breaker Test"],
    "HT Panel Rout":         ["HT Panel - Meter Check (CT Primary Injection)",
                              "HT Panel - Panel Scheme checking & relay - BIBO"],
    "Routine Test BC":       ["HT Panel - Protection Relay Check"],
    "Panel & ACDB Ere":      ["HT Cable VLF Test"],
    "Accessories Fixing":    ["CT - Oil Filtration & BDV Test"],
    "Control Scheme Test":   ["CT - Current Transformer Test"],
    "Oil Filling & Filte":   ["CT - Stability Test"],
    "DC IR testing":         ["DC Cable Termination"],
    "Ready for Co":          ["CSS - Dry Type Transformer Test"],
}


def _extract_block_from_wbs(wbs_name: str) -> str:
    """Extract a human-readable block string from a WBS name.
    e.g. 'Burn Oil Tank Block-4 BCT-1&2' -> 'Block 04 - BCT 1 & 2'
    """
    match = re.search(r"Block[-\s]*(\d+)(.*)", wbs_name, re.IGNORECASE)
    if not match:
        return ""
    block_num = int(match.group(1))
    rest = match.group(2).strip()
    result = f"Block {block_num:02d}"
    if rest:
        rest = rest.replace("-", " ").replace("&", " & ")
        rest = re.sub(r"\s+", " ", rest)
        result += f" - {rest}"
    return result


def _extract_block_from_activity_name(act_name: str) -> str:
    """Fallback: extract block from the activity name prefix 'BLK X:...'."""
    match = re.search(r"BLK\s*(\d+)", act_name, re.IGNORECASE)
    if not match:
        return ""
    block_num = int(match.group(1))
    bct_match = re.search(r"BCT[-\s]*(\d+)", act_name, re.IGNORECASE)
    if bct_match:
        return f"Block {block_num:02d} - BCT {bct_match.group(1)}"
    return f"Block {block_num:02d}"


def _build_description(act_name: str, dpr_item: str) -> str:
    """Build the DPR activity description using the parent's BLK prefix.
    e.g. 'BLK 1:CIV:CT - ' + 'CT - Epoxy Painting below FGL'
    """
    match = re.match(r"(BLK \d+:[A-Z]+:[A-Z]+ - )", act_name, re.IGNORECASE)
    if match:
        return match.group(1) + dpr_item
    # Try broader pattern: 'BLK X:DISCIPLINE:'
    match2 = re.match(r"(BLK \d+:\w+:)", act_name, re.IGNORECASE)
    if match2:
        return match2.group(1) + dpr_item
    return dpr_item


def _item_matches_parent(dpr_item: str, parent_name: str) -> bool:
    """Check if a DPR item's structure prefix matches the parent activity's structure.
    e.g. 'PCS - PIT & Chipping' should only match parents with 'PCS' in them.
    """
    prefixes = ["PCS", "MCR", "SGR", "BOT", "CSS", "CT"]
    for pfx in prefixes:
        if dpr_item.startswith(f"{pfx} -"):
            # This item is structure-specific — only match if parent contains it
            if pfx not in parent_name and (pfx != "PCS" or "BCF" not in parent_name):
                return False
    return True


@router.post("/expand/{project_id}")
async def expand_bess_activities(
    project_id: str,
    sheet_type: str = Query(...),
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(get_current_user),
):
    """
    Expand BESS DPR activities across all blocks for the given project.

    Uses the standard BESS mapping rules to find parent P6 activities in the
    project's `solar_activities`, then creates the corresponding DPR child
    activities for every matching block/BCT and inserts them into
    `dpr_custom_activities`.
    """
    project_object_id = await resolve_project_id(project_id, pool)
    if not project_object_id or isinstance(project_object_id, list):
        raise HTTPException(400, detail="A single BESS project ID is required")

    user_id = current_user.get("user_id") or current_user.get("userId")

    # Decide which mapping rules to use based on sheet_type
    if sheet_type == "bess_civil":
        mapping = CIVIL_MAPPING
    elif sheet_type in ("bess_electrical", "bess_testing"):
        mapping = ELECTRICAL_MAPPING
    else:
        raise HTTPException(400, detail=f"Unsupported sheet_type: {sheet_type}")

    # Fetch all P6 activities for this project
    p6_acts = await pool.fetch(
        "SELECT name, wbs_name, activity_id FROM solar_activities WHERE project_object_id = $1",
        project_object_id
    )

    if not p6_acts:
        raise HTTPException(404, detail="No P6 activities found for this project")

    # Build the expanded activity list
    expanded: list[dict[str, Any]] = []
    seen: set[str] = set()  # Deduplicate by (description, block)

    for act in p6_acts:
        act_name = str(act["name"] or "")
        wbs_name = str(act["wbs_name"] or "")

        if not act_name:
            continue

        # Extract block from WBS first, fallback to activity name
        block = _extract_block_from_wbs(wbs_name)
        if not block:
            block = _extract_block_from_activity_name(act_name)

        # Try to match this P6 activity against our mapping rules
        for key, dpr_items in mapping.items():
            if key.lower() in act_name.lower():
                for item in dpr_items:
                    # Verify structure match
                    if not _item_matches_parent(item, act_name):
                        continue

                    desc = _build_description(act_name, item)
                    dedup_key = f"{desc}|{block}"
                    if dedup_key in seen:
                        continue
                    seen.add(dedup_key)

                    expanded.append({
                        "description": desc,
                        "block": block,
                        "category": item,  # The base activity name becomes the category/header
                        "wbs_name": wbs_name,
                    })

    if not expanded:
        raise HTTPException(
            404,
            detail="No matching BESS activities found in this project's P6 data"
        )

    # Sort by category (for grouping) then block
    expanded.sort(key=lambda x: (x["category"], x["block"]))

    # Check for existing activities to avoid duplicates
    existing_descs = await pool.fetch(
        "SELECT description FROM dpr_custom_activities WHERE project_id = $1 AND sheet_type = $2 AND is_active = TRUE",
        project_object_id, sheet_type
    )
    existing_set = {r["description"] for r in existing_descs}

    # Filter out already-existing activities
    to_insert = [a for a in expanded if a["description"] not in existing_set]

    if not to_insert:
        return {
            "success": True,
            "message": f"All {len(expanded)} activities already exist. No new activities created.",
            "created": 0,
            "total_matched": len(expanded),
            "skipped": len(expanded),
        }

    # Bulk insert into dpr_custom_activities
    created_count = 0
    for i, act in enumerate(to_insert):
        await pool.execute("""
            INSERT INTO dpr_custom_activities
                (project_id, sheet_type, description, uom, scope, cumulative, balance,
                 wbs_name, category, block,
                 status, sort_order, created_by, updated_by)
            VALUES ($1, $2, $3, 'Nos', 0, 0, 0, $4, $5, $6, 'Not Started', $7, $8, $8)
        """,
            project_object_id, sheet_type, act["description"],
            act["wbs_name"], act["category"], act["block"],
            i, user_id
        )
        created_count += 1

    # Generate activity IDs for all newly created activities
    new_rows = await pool.fetch("""
        SELECT id FROM dpr_custom_activities
        WHERE project_id = $1 AND sheet_type = $2 AND activity_id IS NULL AND is_active = TRUE
        ORDER BY id
    """, project_object_id, sheet_type)

    max_idx = await pool.fetchval("""
        SELECT COALESCE(MAX(CAST(SPLIT_PART(activity_id, '-', 3) AS INTEGER)), 0)
        FROM dpr_custom_activities
        WHERE project_id = $1 AND activity_id LIKE 'DPR-%%'
    """, project_object_id) or 0

    for row in new_rows:
        max_idx += 1
        formatted_id = f"DPR-{project_object_id}-{str(max_idx).zfill(3)}"
        await pool.execute(
            "UPDATE dpr_custom_activities SET activity_id = $1 WHERE id = $2",
            formatted_id, row["id"]
        )

    logger.info(
        f"BESS expansion: created {created_count} activities for project={project_object_id} "
        f"sheet={sheet_type} by user={user_id}"
    )

    return {
        "success": True,
        "message": f"Successfully created {created_count} DPR activities across all blocks!",
        "created": created_count,
        "total_matched": len(expanded),
        "skipped": len(expanded) - len(to_insert),
    }
