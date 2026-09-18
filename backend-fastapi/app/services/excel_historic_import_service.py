"""
Historic daily-progress import from a legacy tracking workbook (PMAG dashboard "Import History").

What this does and does not do
--------------------------------
Some Solar projects were tracked for months or years in a spreadsheet before this app existed.
Three sheets in that workbook - "DP Vendor PV Area", "DP Vendor IDT" and "Manpower Details" -
carry, per P6 activity, a real day-by-day progress ledger going back to when work started (labour
headcount for Manpower Details, installed quantity for the other two). A fourth, "Issue log
Register", carries the project's hindrance log. This service reads all four, matches the first
three against an existing P6 activity already in this project (it creates nothing new; a row with
no Activity_ID - true of every Manpower Details row in the workbooks seen so far - simply matches
nothing and is skipped), and backfills:

  1. dpr_daily_progress - the daily figures the app has almost none of for a project tracked
     outside it. Only PAST dates are ever written: a date on or after the earliest date the app
     already has a real record for that same activity+sheet is skipped, so nothing already
     entered through the app can be overwritten.
  2. solar_activities.dpr_metadata - Block / Priority / Baseline Priority / Contractor / Hold Due
     to WTG / Front / Remarks / Scope. Written for whichever of those the sheet has a non-blank
     value for. Scope is written even where P6 already has one - the two read endpoints that
     serve it (get_project_activities_paginated / get_dp_qty_activities in
     app/routers/activities.py) only fall back to it when P6's own total_quantity is 0/blank, so a
     live P6 figure always wins; this only ever fills the gap for the ~1,600 activities in this
     project P6 currently reports 0 scope for (886 of them already Completed).
  3. issue_logs - one row per hindrance in the Excel, project-level (it has no Activity_ID to
     match against). Tagged sheet_type='legacy_issue_log' and titled "[Legacy #<SL.NO>] ..." so a
     re-run of the same file recognises rows it already created - see _plan_issue_log_import.

It NEVER touches P6-owned fields (name, dates, status, percent_complete, total_quantity) - the
live P6 sync is more current than any export like this and stays the source of truth there.

Preview / commit
-----------------
parse_workbook() only reads and computes; it writes nothing. It returns a report plus the fully
computed write plan, cached in-memory under a generated import id. commit_import() looks that plan
up and performs the writes. This two-step shape exists so the person running the import sees
exactly what will change - counts, duplicates dropped, blanks, the date range - before anything
touches the database, and has to explicitly confirm it.

app.database.PoolWrapper (this project runs on psycopg3, not asyncpg, despite the $1-style API)
exposes fetch/fetchrow/fetchval/execute only - no acquire()/transaction(), the same constraint
every other router here already works within. The daily-progress rows are written as one bulk
INSERT per chunk via unnest(), which is atomic per chunk and is what keeps ~29,000 rows from
becoming ~29,000 pooled-connection round trips; the metadata updates are a small per-activity
loop, the same pattern used for every other dpr_metadata write in this codebase. All three writes
are safe to re-run on the same file: the daily insert is ON CONFLICT DO NOTHING, a metadata update
just writes the same values again, and issues are matched by their deterministic title against
what a prior run already created and skipped rather than duplicated.

The in-memory cache does not survive a server restart and is not shared across worker processes.
That is an accepted trade-off for what is a short, interactively-run admin action (preview then
immediately confirm) rather than a queued background job - see _PENDING_IMPORTS below.
"""

from __future__ import annotations

import io
import logging
import time
import uuid
from datetime import date, datetime
from typing import Any, Optional

import openpyxl

from app.utils.timezone import now_ist

logger = logging.getLogger("adani-flow.excel_historic_import")

# ── Sheet recognition ───────────────────────────────────────────────────────
# Keyed by the normalised (lower-cased, stripped) sheet name we look for. sheet_type is the
# real, existing tag in app.sheet_taxonomy - not invented for this import - so the backfilled
# rows show up on the same "DP Vendor Block" / "DP Vendor IDT" sheets in the app.
_TARGET_SHEETS = {
    "dp vendor pv area": {"label": "DP Vendor PV Area", "sheet_type": "dp_vendor_block"},
    "dp vendor idt": {"label": "DP Vendor IDT", "sheet_type": "dp_vendor_idt"},
    # As found in the Khavda A12 workbook, this sheet has no Activity_ID on any row - every row
    # is header/summary text only, so nothing here matches and nothing is imported from it. It is
    # still wired up (same Activity_ID + date-column shape as the two sheets above) so that a
    # workbook - this project's next export, or another project's - that does have the column
    # filled in gets picked up automatically, without another code change.
    "manpower details": {"label": "Manpower Details", "sheet_type": "manpower_details"},
}

_ISSUE_LOG_SHEET_NORM_NAME = "issue log register"
_ISSUE_LOG_SHEET_TYPE = "legacy_issue_log"  # tags rows this import creates; also the re-run key

# Header aliases for the Issue log Register sheet, separate from _HEADER_ALIASES above - it is a
# flat table (no Activity_ID, no date columns), not shaped like the two DP Vendor sheets.
_ISSUE_LOG_HEADER_ALIASES = {
    "sl.no": "sl_no",
    "description of hindrence": "description",
    "description of hindrance": "description",
    "start date": "start_date",
    "issue status": "status",
    "finished date": "finished_date",
    "total deleyed days": "delayed_days",
    "total delayed days": "delayed_days",
    "action taken": "action_taken",
    "remarks": "remarks",
}

# Column header aliases -> canonical field name. Lower-cased, stripped comparison; the source
# workbook spells "Priority" two different ways across its two sheets ("Priority" / "Priorioty").
_HEADER_ALIASES = {
    "activity_id": "activity_id",
    "activity id": "activity_id",
    "block": "block",
    "priority": "priority",
    "priorioty": "priority",
    "priority no": "priority",  # Manpower Details' spelling
    "baseline priority": "baseline_priority",
    "agency name": "agency",
    "contractor name": "agency",  # Manpower Details' spelling - same canonical field as Agency Name
    "hold due to wtg": "hold",
    "front": "front",
    "remarks": "remarks",
    "actual": "actual",
    "plot": "plot",
    "scope": "scope",
}

_MAX_HEADER_SCAN_ROWS = 20

# import_id -> {"created_at": float, "plan": {...}}
_PENDING_IMPORTS: dict[str, dict[str, Any]] = {}
_IMPORT_TTL_SECONDS = 30 * 60


def _prune_expired_imports() -> None:
    cutoff = time.time() - _IMPORT_TTL_SECONDS
    expired = [k for k, v in _PENDING_IMPORTS.items() if v["created_at"] < cutoff]
    for k in expired:
        _PENDING_IMPORTS.pop(k, None)


def _normalise_block(raw: str) -> str:
    """'Block 06' -> 'BLOCK-06'. Leaves an already-normalised value alone."""
    s = str(raw).strip()
    if not s:
        return ""
    return s.upper().replace(" ", "-")


def _is_numeric(v: Any) -> bool:
    if isinstance(v, (int, float)):
        return True
    if isinstance(v, str):
        try:
            float(v.strip())
            return True
        except ValueError:
            return False
    return False


def _find_header_row(ws) -> Optional[int]:
    """Scan the first rows for the one containing an 'Activity_ID' cell."""
    for r in range(1, _MAX_HEADER_SCAN_ROWS + 1):
        row = next(ws.iter_rows(min_row=r, max_row=r, values_only=True), None)
        if not row:
            continue
        for cell in row:
            if isinstance(cell, str) and cell.strip().lower() in ("activity_id", "activity id"):
                return r
    return None


def _build_column_map(header_row: tuple) -> tuple[dict[str, int], list[tuple[int, date]]]:
    """Returns ({field_name: 0-based col index}, [(0-based col index, date), ...])."""
    fields: dict[str, int] = {}
    date_cols: list[tuple[int, date]] = []
    for i, cell in enumerate(header_row):
        if isinstance(cell, datetime):
            date_cols.append((i, cell.date()))
        elif isinstance(cell, str):
            key = _HEADER_ALIASES.get(cell.strip().lower())
            if key and key not in fields:
                fields[key] = i
    date_cols.sort(key=lambda t: t[1])
    return fields, date_cols


def _parse_target_sheet(ws) -> dict[str, Any]:
    """
    Parses one DP Vendor sheet into per-activity winning rows plus a duplicate/blank tally.

    Duplicate Activity_IDs happen in this workbook where a second, differently-shaped row (a
    "... DC" sub-metric, columns shifted so a number lands in the vendor-name cell) shares the
    first row's Activity_ID. The row whose Agency Name is real text wins; between two equally
    valid or equally invalid rows the first occurrence wins. The losing row's daily figures are
    dropped with it rather than merged in - they are a different metric, not a continuation of
    the same ledger.
    """
    header_row_idx = _find_header_row(ws)
    if header_row_idx is None:
        return {"found_header": False}

    header_row = next(ws.iter_rows(min_row=header_row_idx, max_row=header_row_idx, values_only=True))
    fields, date_cols = _build_column_map(header_row)

    if "activity_id" not in fields:
        return {"found_header": False}

    act_col = fields["activity_id"]
    max_col = max([act_col] + list(fields.values()) + [c for c, _ in date_cols]) + 1

    winners: dict[str, dict[str, Any]] = {}
    duplicate_count = 0
    duplicate_samples: list[dict[str, str]] = []
    total_rows = 0

    for row in ws.iter_rows(min_row=header_row_idx + 1, max_row=ws.max_row, max_col=max_col, values_only=True):
        raw_id = row[act_col] if act_col < len(row) else None
        if not raw_id:
            continue
        act_id = str(raw_id).strip()
        if not act_id:
            continue
        total_rows += 1

        agency_val = row[fields["agency"]] if "agency" in fields and fields["agency"] < len(row) else None
        agency_is_valid_text = isinstance(agency_val, str) and agency_val.strip() != "" and not _is_numeric(agency_val)

        candidate = {"row": row, "agency_is_valid_text": agency_is_valid_text}

        existing = winners.get(act_id)
        if existing is None:
            winners[act_id] = candidate
            continue

        duplicate_count += 1
        if len(duplicate_samples) < 10:
            duplicate_samples.append({
                "activityId": act_id,
                "reason": "second row's vendor cell is not a name" if not candidate["agency_is_valid_text"] else "duplicate row",
            })
        # Replace only if the new row has a valid vendor and the kept one does not.
        if candidate["agency_is_valid_text"] and not existing["agency_is_valid_text"]:
            winners[act_id] = candidate

    # Extract fields + daily series from each winning row.
    activities: dict[str, dict[str, Any]] = {}
    blank_vendor_count = 0
    rows_with_daily = 0
    daily_cells_found = 0
    date_min: Optional[date] = None
    date_max: Optional[date] = None

    for act_id, w in winners.items():
        row = w["row"]

        def get(field: str):
            idx = fields.get(field)
            return row[idx] if idx is not None and idx < len(row) else None

        meta: dict[str, str] = {}
        block_raw = get("block")
        if block_raw:
            meta["block"] = _normalise_block(block_raw)
        for field, meta_key in (
            ("priority", "priority"),
            ("baseline_priority", "baselinePriority"),
            ("hold", "holdDueToWtg"),
            ("front", "front"),
            ("remarks", "remarks"),
        ):
            v = get(field)
            # "-" is this workbook's blank placeholder (Manpower Details' Priority No column is
            # "-" on almost every row) - treat it the same as an empty cell rather than storing
            # a literal dash as the value.
            if v is not None and str(v).strip() not in ("", "-"):
                meta[meta_key] = str(v).strip()

        agency_val = get("agency")
        if isinstance(agency_val, str) and agency_val.strip() and not _is_numeric(agency_val):
            meta["contractorName"] = agency_val.strip()
        else:
            blank_vendor_count += 1

        # Scope (Total Quantity). Written even when P6 already has a value - the read side only
        # falls back to this when P6's own total_quantity is 0/blank (see get_project_activities_
        # paginated / get_dp_qty_activities in app/routers/activities.py), so a live P6 figure
        # always wins and this only ever fills a gap P6 currently has none for.
        scope_val = get("scope")
        if scope_val is not None and _is_numeric(scope_val) and float(scope_val) > 0:
            meta["scope"] = str(scope_val)

        daily: list[tuple[date, float]] = []
        for col_idx, d in date_cols:
            v = row[col_idx] if col_idx < len(row) else None
            if v is None or v == "":
                continue
            try:
                fv = float(v)
            except (TypeError, ValueError):
                continue
            daily.append((d, fv))
            daily_cells_found += 1
            date_min = d if date_min is None or d < date_min else date_min
            date_max = d if date_max is None or d > date_max else date_max

        if daily:
            rows_with_daily += 1

        activities[act_id] = {"meta": meta, "daily": daily}

    return {
        "found_header": True,
        "totalRows": total_rows,
        "uniqueActivityIds": len(winners),
        "duplicatesSkipped": duplicate_count,
        "duplicateSamples": duplicate_samples,
        "blankVendorCount": blank_vendor_count,
        "rowsWithDailyData": rows_with_daily,
        "dailyCellsFound": daily_cells_found,
        "dailyDateRange": {
            "from": date_min.isoformat() if date_min else None,
            "to": date_max.isoformat() if date_max else None,
        },
        "activities": activities,
    }


def _issue_title(sl_no: Any, description: str) -> str:
    """Deterministic given the same file: identifies a row across preview/commit and across a
    re-run of the same workbook (see _plan_issue_log_import)."""
    return f"[Legacy #{sl_no}] {description[:80]}"


def _plan_issue_log_import(
    issues: list[dict[str, Any]], already_imported_titles: set[str],
) -> tuple[list[dict[str, Any]], int]:
    """Splits parsed issue rows into ones to create vs. ones a prior run of this same file
    already created (matched by the deterministic title - see _issue_title). Returns
    (rows_to_create, already_imported_count)."""
    to_create: list[dict[str, Any]] = []
    already = 0
    for issue in issues:
        title = _issue_title(issue["sl_no"], issue["description"])
        if title in already_imported_titles:
            already += 1
            continue
        to_create.append({**issue, "title": title})
    return to_create, already


def _find_issue_log_header_row(ws) -> Optional[int]:
    """Scan the first rows for the one containing the 'SL.NO' / hindrance-description header -
    row 3 in the source workbook (row 1-2 are a title and a status summary cell), but found by
    content rather than a hardcoded row number in case a future export shifts it."""
    for r in range(1, _MAX_HEADER_SCAN_ROWS + 1):
        row = next(ws.iter_rows(min_row=r, max_row=r, values_only=True), None)
        if not row:
            continue
        for cell in row:
            if isinstance(cell, str) and cell.strip().lower() in _ISSUE_LOG_HEADER_ALIASES:
                return r
    return None


def _parse_issue_log_sheet(ws) -> dict[str, Any]:
    """Parses the flat Issue log Register table into one dict per hindrance row."""
    header_row_idx = _find_issue_log_header_row(ws)
    if header_row_idx is None:
        return {"found_header": False}

    header_row = next(ws.iter_rows(min_row=header_row_idx, max_row=header_row_idx, values_only=True))
    fields: dict[str, int] = {}
    for i, cell in enumerate(header_row):
        if isinstance(cell, str):
            key = _ISSUE_LOG_HEADER_ALIASES.get(cell.strip().lower())
            if key and key not in fields:
                fields[key] = i

    if "description" not in fields:
        return {"found_header": False}

    def get(row: tuple, field: str):
        idx = fields.get(field)
        return row[idx] if idx is not None and idx < len(row) else None

    def to_iso(v) -> str:
        if isinstance(v, datetime):
            return v.date().isoformat()
        return str(v).strip() if v else ""

    issues: list[dict[str, Any]] = []
    max_col = max(fields.values()) + 1
    for row in ws.iter_rows(min_row=header_row_idx + 1, max_row=ws.max_row, max_col=max_col, values_only=True):
        description = get(row, "description")
        if not description or not str(description).strip():
            continue
        sl_no = get(row, "sl_no")
        status_raw = str(get(row, "status") or "").strip()
        issues.append({
            "sl_no": sl_no if sl_no is not None else len(issues) + 1,
            "description": str(description).strip(),
            "start_date": to_iso(get(row, "start_date")),
            "finished_date": to_iso(get(row, "finished_date")),
            "delayed_days": get(row, "delayed_days") or 0,
            "status_closed": status_raw.lower() in ("close", "closed", "resolved"),
            "action_taken": str(get(row, "action_taken") or "").strip(),
            "remarks": str(get(row, "remarks") or "").strip(),
        })

    return {"found_header": True, "issues": issues}


async def parse_workbook(
    pool,
    project_object_id: int,
    project_id_label: str,
    project_name: str,
    file_bytes: bytes,
    current_user_id: int,
) -> dict[str, Any]:
    """Reads the workbook, matches it against this project's activities, and builds the full
    write plan. Writes nothing. Returns the preview report; the plan itself is cached under
    report['importId'] for commit_import() to pick up."""
    _prune_expired_imports()

    wb = openpyxl.load_workbook(io.BytesIO(file_bytes), data_only=True, read_only=True)
    sheet_by_norm_name = {s.strip().lower(): s for s in wb.sheetnames}

    db_rows = await pool.fetch(
        "SELECT activity_id, object_id FROM solar_activities WHERE project_object_id = $1",
        project_object_id,
    )
    db_activity_ids = {r["activity_id"].strip(): r["object_id"] for r in db_rows if r["activity_id"]}

    sheet_reports: list[dict[str, Any]] = []
    daily_rows_plan: list[tuple[int, date, float, float, str]] = []  # obj_id, date, today, cumulative, sheet_type
    metadata_plan: dict[int, dict[str, str]] = {}
    excluded_overlap_total = 0
    matched_object_ids: set[int] = set()
    sheet_types_seen: set[str] = set()

    for norm_name, meta in _TARGET_SHEETS.items():
        actual_name = sheet_by_norm_name.get(norm_name)
        if not actual_name:
            sheet_reports.append({
                "sheetName": meta["label"], "found": False,
                "note": "Sheet not present in this workbook.",
            })
            continue

        parsed = _parse_target_sheet(wb[actual_name])
        if not parsed.get("found_header"):
            sheet_reports.append({
                "sheetName": meta["label"], "found": True,
                "note": "Sheet is present but no 'Activity_ID' header row was found in the first "
                        f"{_MAX_HEADER_SCAN_ROWS} rows - nothing could be parsed from it.",
            })
            continue

        activities = parsed.pop("activities")
        sheet_type = meta["sheet_type"]
        sheet_types_seen.add(sheet_type)

        matched = 0
        unmatched: list[str] = []
        rows_to_import = 0
        rows_excluded_overlap = 0

        # Earliest date already recorded per activity for this sheet_type - never write on/after it.
        obj_ids_in_sheet = [db_activity_ids[a] for a in activities if a in db_activity_ids]
        earliest_live: dict[int, date] = {}
        if obj_ids_in_sheet:
            live_rows = await pool.fetch(
                """
                SELECT activity_object_id, MIN(progress_date) AS min_date
                FROM dpr_daily_progress
                WHERE activity_object_id = ANY($1) AND sheet_type = $2 AND activity_source = 'p6'
                GROUP BY activity_object_id
                """,
                obj_ids_in_sheet, sheet_type,
            )
            earliest_live = {r["activity_object_id"]: r["min_date"] for r in live_rows}

        for act_id, data in activities.items():
            obj_id = db_activity_ids.get(act_id)
            if obj_id is None:
                unmatched.append(act_id)
                continue
            matched += 1
            matched_object_ids.add(obj_id)

            if data["meta"]:
                metadata_plan.setdefault(obj_id, {}).update(data["meta"])

            cutoff = earliest_live.get(obj_id)
            cumulative = 0.0
            for d, v in sorted(data["daily"], key=lambda t: t[0]):
                cumulative += v
                if cutoff is not None and d >= cutoff:
                    rows_excluded_overlap += 1
                    continue
                daily_rows_plan.append((obj_id, d, v, cumulative, sheet_type))
                rows_to_import += 1

        excluded_overlap_total += rows_excluded_overlap

        sheet_reports.append({
            "sheetName": meta["label"],
            "found": True,
            "sheetType": sheet_type,
            "totalRows": parsed["totalRows"],
            "uniqueActivityIds": parsed["uniqueActivityIds"],
            "matchedInDb": matched,
            "unmatchedCount": len(unmatched),
            "unmatchedSample": unmatched[:10],
            "duplicatesSkipped": parsed["duplicatesSkipped"],
            "duplicateSamples": parsed["duplicateSamples"],
            "blankVendorCount": parsed["blankVendorCount"],
            "rowsWithDailyData": parsed["rowsWithDailyData"],
            "dailyDateRange": parsed["dailyDateRange"],
            "dailyCellsFound": parsed["dailyCellsFound"],
            "dailyRowsToImport": rows_to_import,
            "dailyRowsExcludedLiveOverlap": rows_excluded_overlap,
        })

    # ── Issue log Register: a flat, project-level hindrance log, no Activity_ID involved. ──────
    issue_log_report: dict[str, Any] = {"sheetName": "Issue log Register", "found": False}
    issues_plan: list[dict[str, Any]] = []
    issue_log_sheet_name = sheet_by_norm_name.get(_ISSUE_LOG_SHEET_NORM_NAME)
    if issue_log_sheet_name:
        parsed_issues = _parse_issue_log_sheet(wb[issue_log_sheet_name])
        if not parsed_issues.get("found_header"):
            issue_log_report = {
                "sheetName": "Issue log Register", "found": True,
                "note": "Sheet is present but its header row (SL.NO / Description of Hindrence) "
                        f"was not found in the first {_MAX_HEADER_SCAN_ROWS} rows.",
            }
        else:
            already_imported_titles = {
                r["title"] for r in await pool.fetch(
                    "SELECT title FROM issue_logs WHERE project_id = $1 AND sheet_type = $2",
                    project_object_id, _ISSUE_LOG_SHEET_TYPE,
                )
            }
            issues_plan, already_count = _plan_issue_log_import(parsed_issues["issues"], already_imported_titles)
            issue_log_report = {
                "sheetName": "Issue log Register",
                "found": True,
                "issuesFound": len(parsed_issues["issues"]),
                "issuesAlreadyImported": already_count,
                "issuesToImport": len(issues_plan),
            }

    # Whether this workbook even belongs to the open project. A sheet can be found and fully
    # parsed - real Activity_IDs, real daily figures - and still match nothing here because it is
    # another project's export entirely. That is a wrong-file problem, not a data-quality one, so
    # it gets its own hard signal rather than reading as "0% coverage" buried in a normal warning.
    parsed_sheets = [s for s in sheet_reports if s.get("found") and "uniqueActivityIds" in s]
    total_ids_in_file = sum(s["uniqueActivityIds"] for s in parsed_sheets)
    total_matched = sum(s["matchedInDb"] for s in parsed_sheets)
    project_mismatch = bool(parsed_sheets) and total_ids_in_file > 0 and total_matched == 0
    low_match = (
        bool(parsed_sheets) and total_ids_in_file > 0 and total_matched > 0
        and (total_matched / total_ids_in_file) < 0.2
    )

    warnings: list[str] = []
    if not any(s.get("found") for s in sheet_reports):
        warnings.append(
            "None of 'DP Vendor PV Area', 'DP Vendor IDT' or 'Manpower Details' was found in "
            "this workbook - there is nothing this import can backfill from it."
        )
    mismatch_message: Optional[str] = None
    if project_mismatch:
        sample_ids = next((s["unmatchedSample"] for s in parsed_sheets if s.get("unmatchedSample")), [])
        mismatch_message = (
            f"None of the {total_ids_in_file} activity IDs in this workbook (e.g. "
            f"{', '.join(sample_ids[:3]) or 'n/a'}) exist in \"{project_name}\". This file is very "
            "likely for a different project - check you selected the right project before "
            "importing anything."
        )
        warnings.append(mismatch_message)
    elif low_match:
        pct = round(100 * total_matched / total_ids_in_file, 1)
        warnings.append(
            f"Only {total_matched} of {total_ids_in_file} activity IDs in this workbook "
            f"({pct}%) exist in \"{project_name}\". Double-check this is the right file for this "
            "project before importing."
        )
    total_db_activities = len(db_activity_ids)
    if total_db_activities and not project_mismatch:
        covered_pct = round(100 * len(matched_object_ids) / total_db_activities, 1)
        warnings.append(
            f"This covers {len(matched_object_ids)} of {total_db_activities} activities in the "
            f"project ({covered_pct}%). The rest (module erection, cabling, T&C, ...) are not in "
            "these two sheets and get no daily history from this file."
        )
    if excluded_overlap_total:
        warnings.append(
            f"{excluded_overlap_total} daily row(s) were dropped because the app already has a "
            "real recorded value on or after that date for that activity - those are never "
            "overwritten."
        )
    if not issue_log_report.get("found"):
        warnings.append("'Issue log Register' was not found in this workbook - no issues to import from it.")
    elif issue_log_report.get("issuesAlreadyImported"):
        warnings.append(
            f"{issue_log_report['issuesAlreadyImported']} issue(s) from this file were already "
            "imported in a previous run and will be skipped."
        )
    warnings.append(
        "Schedule fields (dates, status, % complete) are never touched - those stay owned by "
        "the live P6 sync, which is more current than this file."
    )

    import_id = str(uuid.uuid4())
    _PENDING_IMPORTS[import_id] = {
        "created_at": time.time(),
        "plan": {
            "project_object_id": project_object_id,
            "daily_rows": daily_rows_plan,
            "metadata": metadata_plan,
            "issues": issues_plan,
            "created_by": current_user_id,
        },
    }

    metadata_field_counts: dict[str, int] = {}
    for fields_dict in metadata_plan.values():
        for k in fields_dict:
            metadata_field_counts[k] = metadata_field_counts.get(k, 0) + 1

    return {
        "importId": import_id,
        "projectId": project_id_label,
        "projectName": project_name,
        "sheets": sheet_reports,
        "issueLog": issue_log_report,
        "metadata": {
            "activitiesToUpdate": len(metadata_plan),
            "fieldsFilled": metadata_field_counts,
        },
        "totals": {
            "dailyProgressRowsToWrite": len(daily_rows_plan),
            "metadataUpdatesToWrite": len(metadata_plan),
            "issuesToCreate": len(issues_plan),
        },
        "warnings": warnings,
        "projectMismatch": project_mismatch,
        "mismatchMessage": mismatch_message,
        "expiresInMinutes": _IMPORT_TTL_SECONDS // 60,
    }


_INSERT_CHUNK_SIZE = 5000


async def commit_import(pool, import_id: str) -> dict[str, Any]:
    """Writes the plan cached by parse_workbook() for import_id. Raises KeyError if the id is
    unknown or has expired - the caller (router) turns that into a 404."""
    _prune_expired_imports()
    cached = _PENDING_IMPORTS.pop(import_id, None)
    if cached is None:
        raise KeyError(import_id)

    plan = cached["plan"]
    project_object_id: int = plan["project_object_id"]
    daily_rows: list[tuple[int, date, float, float, str]] = plan["daily_rows"]
    metadata: dict[int, dict[str, str]] = plan["metadata"]
    issues: list[dict[str, Any]] = plan.get("issues", [])
    created_by: int = plan.get("created_by")

    written_daily = 0
    for start in range(0, len(daily_rows), _INSERT_CHUNK_SIZE):
        chunk = daily_rows[start:start + _INSERT_CHUNK_SIZE]
        obj_ids = [r[0] for r in chunk]
        dates = [r[1] for r in chunk]
        todays = [r[2] for r in chunk]
        cumulatives = [r[3] for r in chunk]
        sheet_types = [r[4] for r in chunk]
        sources = ["p6"] * len(chunk)
        await pool.execute(
            """
            INSERT INTO dpr_daily_progress
                (activity_object_id, progress_date, today_value, cumulative_value, sheet_type, activity_source)
            SELECT * FROM unnest($1::bigint[], $2::date[], $3::numeric[], $4::numeric[], $5::text[], $6::text[])
            ON CONFLICT (activity_object_id, activity_source, progress_date, sheet_type)
            DO NOTHING
            """,
            obj_ids, dates, todays, cumulatives, sheet_types, sources,
        )
        written_daily += len(chunk)

    import json as _json
    for obj_id, fields_dict in metadata.items():
        await pool.execute(
            """
            UPDATE solar_activities
            SET dpr_metadata = COALESCE(dpr_metadata, '{}'::jsonb) || $1::jsonb
            WHERE object_id = $2
            """,
            _json.dumps(fields_dict), obj_id,
        )

    written_issues = 0
    for issue in issues:
        # Same shape IssuesViewModal.parseIssueDetails() already expects in issue_logs.description
        # (it JSON.parses the field to show structured columns) - written this way so a legacy
        # import displays identically to one typed through the app.
        description_json = _json.dumps({
            "description": issue["description"],
            "activity": "",
            "startDate": issue["start_date"],
            "finishedDate": issue["finished_date"],
            "delayedDays": issue["delayed_days"],
            "status": "Close" if issue["status_closed"] else "Open",
            "actionRequired": issue["action_taken"],
            "remarks": issue["remarks"],
        })
        await pool.execute(
            """
            INSERT INTO issue_logs
                (project_id, sheet_type, issue_type, title, description, priority, status, created_by)
            VALUES ($1, $2, 'general', $3, $4, 'medium', $5, $6)
            """,
            project_object_id, _ISSUE_LOG_SHEET_TYPE, issue["title"], description_json,
            "closed" if issue["status_closed"] else "open", created_by,
        )
        written_issues += 1

    logger.info(
        f"Historic import {import_id}: wrote {written_daily} daily progress rows, "
        f"{len(metadata)} metadata updates, {written_issues} issues."
    )

    return {
        "importId": import_id,
        "written": {
            "dailyProgressRows": written_daily,
            "metadataUpdates": len(metadata),
            "issuesCreated": written_issues,
        },
        "committedAt": now_ist().isoformat(),
    }
