# app/routers/excel_historic_import.py
"""
PMAG dashboard "Import History" - backfills daily progress + vendor/block/priority metadata for
a Solar project from a legacy tracking workbook. See app.services.excel_historic_import_service
for what this reads, matches and writes, and what it deliberately leaves alone.
"""

import logging
from typing import Any

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile

from app.auth.dependencies import get_current_user
from app.database import get_db, PoolWrapper
from app.routers.project_utils import resolve_project_id
from app.services import excel_historic_import_service as import_service

logger = logging.getLogger("adani-flow.excel_historic_import")

router = APIRouter(prefix="/api/historic-import", tags=["Historic Import"])

# Same roles that can already act on a project's whole DPR pipeline (approve/push/reassign).
_ALLOWED_ROLES = {"PMAG", "Super Admin", "Site PM"}

_MAX_UPLOAD_BYTES = 60 * 1024 * 1024  # this workbook runs ~15-20MB with its widest sheets


def _require_role(current_user: dict[str, Any]) -> None:
    role = current_user.get("role")
    if role not in _ALLOWED_ROLES:
        raise HTTPException(403, detail={"message": "Not authorized to run a historic data import."})


async def _resolve_single_project(project_id: str, pool: PoolWrapper) -> tuple[int, str]:
    resolved = await resolve_project_id(project_id, pool)
    if isinstance(resolved, list):
        raise HTTPException(400, detail={"message": "A single project is required, not a portfolio."})
    project_row = await pool.fetchrow("SELECT name FROM projects WHERE object_id = $1", resolved)
    if not project_row:
        raise HTTPException(404, detail={"message": "Project not found."})
    return resolved, project_row["name"]


@router.post("/preview")
async def preview_historic_import(
    projectId: str = Form(...),
    file: UploadFile = File(...),
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(get_current_user),
):
    """
    Reads the uploaded workbook, matches it against this project's activities, and returns a
    full report of what would be written - without writing anything. The write plan itself is
    cached server-side under the returned importId for POST /{import_id}/commit to apply.
    """
    _require_role(current_user)

    if not file.filename or not file.filename.lower().endswith((".xlsx", ".xlsm")):
        raise HTTPException(400, detail={"message": "Only .xlsx / .xlsm workbooks are supported."})

    contents = await file.read()
    if len(contents) > _MAX_UPLOAD_BYTES:
        raise HTTPException(400, detail={"message": "File is too large (limit 60MB)."})
    if not contents:
        raise HTTPException(400, detail={"message": "Uploaded file is empty."})

    project_object_id, project_name = await _resolve_single_project(projectId, pool)

    try:
        report = await import_service.parse_workbook(
            pool, project_object_id, projectId, project_name, contents,
            int(current_user["userId"]),
        )
    except Exception as e:
        logger.error(f"Historic import preview failed for project {projectId}: {e}")
        raise HTTPException(400, detail={"message": f"Could not read this workbook: {e}"})

    return report


@router.post("/{import_id}/commit")
async def commit_historic_import(
    import_id: str,
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(get_current_user),
):
    """Writes the plan a prior /preview call built for import_id."""
    _require_role(current_user)

    try:
        result = await import_service.commit_import(pool, import_id)
    except KeyError:
        raise HTTPException(
            404,
            detail={"message": "This preview has expired or was already applied. Upload the file again to retry."},
        )
    except Exception as e:
        logger.error(f"Historic import commit failed for {import_id}: {e}")
        raise HTTPException(500, detail={"message": f"Import failed while writing: {e}"})

    return result
