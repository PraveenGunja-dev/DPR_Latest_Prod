# app/routers/dpr_supervisor.py
"""
DPR Supervisor router – complete DPR workflow.
Direct port of Express routes/dprSupervisor.js + controllers/dprSupervisorController.js
"""

import json
import logging
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks

from app.auth.dependencies import get_current_user
from app.database import get_db, PoolWrapper
from app.services.cache_service import cache
from app.utils.system_logger import create_system_log
from app.routers.project_utils import resolve_project_id

from typing import Optional, Any, List
from app.routers.notifications import create_notification
from app.models.dpr import DPREntryCreate
from app.utils.history_migration import extract_to_history_array, flatten_history_array

logger = logging.getLogger("adani-flow.dpr_supervisor")

router = APIRouter(prefix="/api/dpr-supervisor", tags=["DPR Supervisor"])


def _format_sheet_type(sheet_type: str) -> str:
    """Convert raw sheet_type to human-readable name."""
    mapping = {
        "dp_qty": "DP Qty",
        "dp_block": "DP Block",
        "dp_vendor_block": "AC Side",
        "dp_vendor_idt": "DC Side",
        "manpower_details": "Manpower Details",
        "manpower_details_2": "Manpower Details 2",
        "testing_commissioning": "Testing & Commissioning",
        "switchyard": "Switchyard",
        "transmission_line": "Transmission Line",
        "infra_works": "Infra Works",
    }
    return mapping.get(sheet_type, sheet_type.replace("_", " ").title())


def _format_date(d) -> str:
    """Format a date object or string to DD-Mon-YY (e.g. 28-Mar-26)."""
    if d is None:
        return "N/A"
    if hasattr(d, 'strftime'):
        return d.strftime("%d-%b-%y")
    try:
        return datetime.strptime(str(d), "%Y-%m-%d").strftime("%d-%b-%y")
    except Exception:
        return str(d)


async def _get_project_name(pool, project_id: str) -> str:
    """Fetch project name from DB."""
    try:
        project_object_id = await resolve_project_id(project_id, pool)
        name = await pool.fetchval('SELECT \"Name\" FROM p6_projects WHERE \"ObjectId\" = $1', project_object_id)
        return name or f"Project #{project_id}"
    except Exception:
        return f"Project #{project_id}"


async def _save_snapshot(
    pool, entry_id: int, action: str, data_json,
    status_before: str, status_after: str,
    performed_by: int, remarks: str = None
):
    """Save a versioned snapshot of data_json for audit/comparison.
    
    Actions: 'submitted', 'approved_by_pm', 'rejected_by_pm', 
             'final_approved', 'pushed_to_p6', 'resubmitted'
    """
    try:
        # Get next version number for this entry
        last_version = await pool.fetchval(
            "SELECT COALESCE(MAX(version), 0) FROM dpr_entry_snapshots WHERE entry_id = $1",
            entry_id
        )
        next_version = last_version + 1

        data_str = json.dumps(data_json) if not isinstance(data_json, str) else data_json

        await pool.execute("""
            INSERT INTO dpr_entry_snapshots 
                (entry_id, version, action, data_json, status_before, status_after, performed_by, remarks)
            VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8)
        """, entry_id, next_version, action, data_str, status_before, status_after, performed_by, remarks)

        logger.info(f"Snapshot v{next_version} saved for entry {entry_id}: {action}")
    except Exception as e:
        logger.error(f"Failed to save snapshot for entry {entry_id}: {e}")


def _get_today_and_yesterday():
    today = datetime.now()
    yesterday = today - timedelta(days=1)
    return today.strftime("%Y-%m-%d"), yesterday.strftime("%Y-%m-%d")


def _act_key(value) -> str:
    """Loose identity for an activity id or name, matching what TRIM(...) ILIKE TRIM(...) did."""
    return " ".join(str(value or "").replace("\xa0", " ").split()).casefold()


class _ActivityResolver:
    """Resolves the activity ids a sheet row carries to the numeric object_id the progress
    tables key on, for a whole save at once instead of once per row.

    This used to be four `SELECT ... WHERE TRIM(activity_id) ILIKE TRIM($1)` queries per row.
    `solar_activities` holds every activity of every project - 346k rows here - and wrapping the
    indexed column in TRIM() and comparing with ILIKE makes `idx_solar_act_id` unusable, so each
    of those was a full sequential scan: measured at 2.3 SECONDS each against the live database.
    A save carrying 714 rows (see the delta note in save_draft_entry) therefore queued well over
    an hour of scanning, and the browser's 120s timeout fired long before the first sheet was
    written - the "sheet is not saving and not submitting" report. One project's activities load
    in ~46ms, so the whole resolution is done up front from two indexed queries and every row is
    then matched in memory.

    Lookup order preserves the previous behaviour exactly: exact activity_id, then object_id as
    text, then activity name, then a custom (non-P6) activity. Only when a row matches nothing in
    its own project do we fall back to a single project-wide query, so rows referring to another
    project's activity - which the unscoped ILIKE used to reach - still resolve.
    """

    def __init__(self):
        self.by_activity_id: dict[str, int] = {}
        self.by_object_id: dict[str, int] = {}
        self.by_name: dict[str, int] = {}
        self.custom_by_activity_id: dict[str, int] = {}
        self.custom_by_id: dict[str, int] = {}
        self.custom_id_to_activity_id: dict[str, str] = {}
        self._miss_cache: dict[str, Optional[tuple]] = {}

    @classmethod
    async def build(cls, pool, project_id) -> "_ActivityResolver":
        self = cls()
        rows = await pool.fetch(
            "SELECT object_id, activity_id, name FROM solar_activities WHERE project_object_id = $1",
            project_id,
        )
        for r in rows:
            obj_id = int(r["object_id"])
            self.by_object_id[str(obj_id)] = obj_id
            key = _act_key(r["activity_id"])
            if key:
                self.by_activity_id.setdefault(key, obj_id)
            name_key = _act_key(r["name"])
            if name_key:
                self.by_name.setdefault(name_key, obj_id)

        custom = await pool.fetch(
            "SELECT id, activity_id FROM dpr_custom_activities WHERE project_id = $1",
            project_id,
        )
        for r in custom:
            cid = int(r["id"])
            self.custom_by_id[str(cid)] = cid
            key = _act_key(r["activity_id"])
            if key:
                self.custom_by_activity_id.setdefault(key, cid)
                self.custom_id_to_activity_id[str(cid)] = key
        return self

    async def resolve(self, pool, activity_id_str: str, description: str = "") -> Optional[tuple]:
        """Returns (object_id, is_custom_activity) or None."""
        key = _act_key(activity_id_str)
        if key:
            if key in self.by_activity_id:
                return (self.by_activity_id[key], False)
            if key in self.by_object_id:
                return (self.by_object_id[key], False)

        desc_key = _act_key(description)
        if desc_key and desc_key in self.by_name:
            return (self.by_name[desc_key], False)

        if key:
            if key in self.custom_by_activity_id:
                return (self.custom_by_activity_id[key], True)
            if key in self.custom_by_id:
                return (self.custom_by_id[key], True)
            # Last resort, kept from the previous implementation: a "DPR-{project}-{n}" id was
            # assumed to carry the custom row's primary key in its last segment. It does not - n is
            # a per-project sequence minted separately from the serial id, and on this database
            # 1,272 of the 1,276 DPR-style ids have a trailing number that is NOT their primary key
            # (DPR-3075-008 is row id 12, while row id 8 is a different activity entirely). Firing
            # this blind would file a site's progress against the wrong DPR activity, so the row it
            # lands on now has to actually own the id we came in with - which makes the guess
            # self-checking. Across every entry of all four projects that use custom activities,
            # nothing resolves through this path today; it stays only so older data cannot regress.
            tail = key.rsplit("-", 1)[-1]
            if tail in self.custom_by_id and self.custom_id_to_activity_id.get(tail) == key:
                return (self.custom_by_id[tail], True)

        if not key:
            return None

        # Not in this project. Fall back once per distinct id, using the indexed equality the old
        # TRIM/ILIKE predicate could never use, and remember misses so a 700-row sheet full of
        # unresolvable ids cannot re-run this per row.
        if key in self._miss_cache:
            return self._miss_cache[key]

        found = None
        act_row = await pool.fetchrow(
            "SELECT object_id FROM solar_activities WHERE activity_id = $1 LIMIT 1",
            str(activity_id_str).strip(),
        )
        if act_row:
            found = (int(act_row["object_id"]), False)
        self._miss_cache[key] = found
        return found


async def _write_daily_progress_from_entry(pool, entry_row, logger, resolver=None):
    """
    Write daily progress records from a submitted entry's data_json.
    This ensures the yesterday-values API picks up progress immediately,
    not just after P6 push.

    Uses activityId (string like 'ACL1-CC-1000') to resolve the numeric
    activity_object_id needed for the dpr_daily_progress table.

    Runs on every save-draft (autosave included), submit, and submit-all — so it fires far more
    often than the sheet's own "history" columns actually change. Each call rebuilds
    `updates_to_write` from whatever the row currently shows, and a blank cell becomes 0.0 (see
    below). The 5-day history / yesterday columns source their initial render from THIS table via
    a separate query, and until that query resolves (or if it simply has nothing yet) those cells
    render blank client-side. An unrelated edit elsewhere on the row - or the routine 2-second
    autosave - was then writing that blank as a literal 0, permanently overwriting a real value a
    prior save had already recorded: the history a supervisor had already entered would silently
    zero out days later, exactly the "vanishes after submit/refresh" symptom. Only the entry's own
    date is allowed to go to 0 on a blank (that is the field actively being typed into); every
    other date only overwrites on a non-zero value or a cell the user explicitly edited this save
    (tracked via `_cellStatuses`, keyed by column label rather than ISO date).
    """
    try:
        data_json = entry_row["data_json"]
        if isinstance(data_json, str):
            data_json = json.loads(data_json)

        rows = data_json.get("rows", [])
        if not rows:
            return

        from app.services.p6_push_service import parse_date as _parse_flexible_date

        project_id = entry_row["project_id"]
        entry_date = entry_row["entry_date"]
        sheet_type = entry_row["sheet_type"]
        written = 0
        skipped_guarded = 0

        if resolver is None:
            resolver = await _ActivityResolver.build(pool, project_id)

        for row in rows:
            # Skip category headers
            if row.get("isCategoryHeading") or row.get("isCategoryRow"):
                continue

            activity_id_str = row.get("activityId", "")
            if not activity_id_str:
                continue

            # Parse cumulative (actual) for today
            cum_str = str(row.get("cumulative", row.get("actual", "")) or "").strip()
            try:
                cumulative_val = float(cum_str.replace(",", "")) if cum_str else 0.0
            except (ValueError, TypeError):
                cumulative_val = 0.0

            # Column labels (e.g. "27-Aug-26") the user actually touched this save, resolved to
            # ISO dates. StyledExcelTable stamps _cellStatuses[<column label>] on every user edit,
            # so a date in here is a deliberate correction and is allowed to overwrite down to 0.
            cell_statuses = row.get("_cellStatuses")
            edited_dates: set = set()
            if isinstance(cell_statuses, dict):
                for label in cell_statuses.keys():
                    parsed = _parse_flexible_date(label)
                    if parsed:
                        edited_dates.add(parsed.isoformat())

            # Collect dates and values
            updates_to_write = {}
            
            if "todayValue" in row:
                today_val_str = str(row.get("todayValue") or "").strip()
                try:
                    updates_to_write[str(entry_date)] = float(today_val_str.replace(",", "")) if today_val_str else 0.0
                except (ValueError, TypeError):
                    pass
                    
            if "yesterdayValue" in row:
                yesterday_val_str = str(row.get("yesterdayValue") or "").strip()
                try:
                    updates_to_write[str(entry_date - timedelta(days=1))] = float(yesterday_val_str.replace(",", "")) if yesterday_val_str else 0.0
                except (ValueError, TypeError):
                    pass
                    
            history_values = row.get("historyValues")
            if isinstance(history_values, dict):
                for d_str, v_str in history_values.items():
                    v_str = str(v_str or "").strip()
                    try:
                        updates_to_write[d_str] = float(v_str.replace(",", "")) if v_str else 0.0
                    except (ValueError, TypeError):
                        pass
                        
            history = row.get("history")
            if isinstance(history, list):
                for entry in history:
                    d_str = entry.get("date")
                    if not d_str: continue
                    v_str = str(entry.get("actual") or "").strip()
                    try:
                        updates_to_write[d_str] = float(v_str.replace(",", "")) if v_str else 0.0
                    except (ValueError, TypeError):
                        pass

            if not updates_to_write:
                continue
            
            # Resolve activityId string -> activity_object_id (numeric), from the batch map built
            # once for this project rather than four sequential scans of a 346k-row table per row.
            resolved = await resolver.resolve(
                pool, activity_id_str, row.get("description") or row.get("activities") or ""
            )
            if not resolved:
                continue

            act_obj_id, is_custom_activity = resolved

            # UPSERT into dpr_daily_progress for all collected dates
            for d_str, d_val in updates_to_write.items():
                try:
                    dt = datetime.strptime(d_str, "%Y-%m-%d").date()
                except ValueError:
                    continue

                # A blank cell on a day other than the entry's own date is never real signal - it
                # is either a day nobody has filled in yet, or the history/yesterday column not
                # having loaded client-side before this save fired. Only a value the user actually
                # typed (non-zero, or an explicit edit even down to 0) is allowed to touch it;
                # anything else leaves whatever is already stored untouched. See the docstring for
                # the incident this guards against.
                if d_val == 0.0 and dt != entry_date and d_str not in edited_dates:
                    skipped_guarded += 1
                    continue

                # We apply cumulative_val only to today's date for simplicity
                c_val = cumulative_val if dt == entry_date else 0.0

                # activity_source keeps the two key spaces apart: act_obj_id is a P6
                # solar_activities.object_id for a P6 row and a dpr_custom_activities.id for a
                # DPR-level one, and those numbers are allowed to coincide.
                await pool.execute("""
                    INSERT INTO dpr_daily_progress
                    (progress_date, activity_object_id, today_value, cumulative_value, sheet_type, activity_source)
                    VALUES ($1, $2, $3, $4, $5, $6)
                    ON CONFLICT (activity_object_id, activity_source, progress_date, sheet_type)
                    DO UPDATE SET
                        today_value = EXCLUDED.today_value,
                        cumulative_value = CASE WHEN EXCLUDED.progress_date = $1 THEN EXCLUDED.cumulative_value ELSE dpr_daily_progress.cumulative_value END
                """, dt, act_obj_id, d_val, c_val, sheet_type, "dpr" if is_custom_activity else "p6")
                written += 1
        
        logger.info(f"Wrote {written} daily progress records for entry {entry_row['id']} ({skipped_guarded} blank historic cells left untouched)")
    except Exception as e:
        logger.error(f"Failed to write daily progress from entry {entry_row.get('id')}: {e}")


def _contractor_key(row: dict) -> tuple:
    """Identity of a contractor line: its activity and who is on it, loosely compared.

    Names arrive pasted from documents and carry non-breaking spaces and stray casing, so
    "M/s Godara Construction " and "M/S GODARA CONSTRUCTION" must not read as two contractors.
    """
    def norm(v) -> str:
        return " ".join(str(v or "").replace(" ", " ").split()).casefold()
    return (norm(row.get("activity")),
            norm(row.get("contractor") or row.get("contractorName")))


_CONTRACTOR_DATE_FIELDS = ("agreedValues", "availableValues")

# The standing activity list this sheet is filled in against, in the order it is printed. Mirrors
# WIND_CONTRACTOR_ACTIVITIES in the frontend's WindContractorManpowerTable - the two must agree, or
# a sheet is rendered in one order and stored in another.
WIND_CONTRACTOR_ACTIVITIES = [
    "Soil Test",
    "WTG Foundation",
    "USS Electrical",
    "33KV Line",
    "Road & Crane Pad",
    "PSS",
    "220KV Line",
    "WTG Erection",
    "WTG Main Crane Package",
    "Misc Packages",
]


def _norm_activity(value) -> str:
    """Activity names as typed carry non-breaking spaces and stray casing; compare them loosely."""
    return " ".join(str(value or "").replace("\xa0", " ").split()).casefold()


_STANDING_ACTIVITY_ORDER = {
    _norm_activity(name): i for i, name in enumerate(WIND_CONTRACTOR_ACTIVITIES)
}


def _order_contractor_rows(rows: list) -> list:
    """Put the activity groups back into the standing order, whatever order they arrived in.

    Every report date holds its own copy of the row list, and a date that was only ever partly
    filled in has the activities it is missing carried across when it is opened. Those used to be
    appended at the end, so a date holding four activities came back with the other six tacked on
    behind them: the 11th printed Soil Test first, the 12th printed it last, and the same activity
    sat on a different line depending on which date you were looking at. Read side by side - or
    exported - the two dates then look like the figures were entered against the wrong activity.

    Contractors keep their order within their activity. An activity that is not on the standing
    list - renamed on the sheet, or added by hand - keeps its place after the standing ones in the
    order it first appears, so nothing a site typed in is dropped or shuffled arbitrarily. Rows
    with no activity are not part of this sheet's grouping (on a non-Mandvi project they are P6
    timephased resource lines), so a list made up only of those is returned untouched.
    """
    groups: dict = {}
    order: list = []
    activity_less: list = []

    for row in rows:
        activity = _norm_activity(row.get("activity")) if isinstance(row, dict) else ""
        if not activity:
            activity_less.append(row)
            continue
        if activity not in groups:
            groups[activity] = []
            order.append(activity)
        groups[activity].append(row)

    if not order:
        return list(rows)

    unlisted = len(_STANDING_ACTIVITY_ORDER)
    first_seen = {activity: i for i, activity in enumerate(order)}
    order.sort(key=lambda a: (_STANDING_ACTIVITY_ORDER.get(a, unlisted), first_seen[a]))

    ordered = [row for activity in order for row in groups[activity]]
    ordered.extend(activity_less)
    return ordered


def _collapse_contractor_rows(rows: list) -> list:
    """Reduce a contractor list to one row per (activity, contractor).

    Row ids are minted in the browser (Date.now + random), so every session that ever built this
    sheet produced its own set of them for the same standing activities. Anything keyed on id alone
    therefore kept one copy per session, and a ten-activity sheet came back with twenty or thirty
    rows, the activity list restarting part way down.

    Copies are merged rather than picked - date-keyed maps are unioned and scalars filled from the
    first copy that has one - so no figure entered against any copy is lost. Rows with no activity
    are passed through untouched: on a non-Mandvi project those are P6 timephased resource rows,
    which this sheet's (activity, contractor) identity does not describe.
    """
    def norm(v) -> str:
        return " ".join(str(v or "").replace("\xa0", " ").split()).casefold()

    def contractor_of(r) -> str:
        return str(r.get("contractor") or r.get("contractorName") or "").strip()

    out: list = []
    seen: dict = {}
    for r in rows:
        if not isinstance(r, dict) or not str(r.get("activity") or "").strip():
            out.append(r)
            continue

        ident = (norm(r.get("activity")), norm(contractor_of(r)))
        first = seen.get(ident)
        if first is None:
            seen[ident] = r
            out.append(r)
            continue

        # Only a contractor deleted on every copy stays deleted; letting one stale duplicate carry
        # the flag would hide a row that still holds entered figures.
        first["isDeleted"] = bool(first.get("isDeleted")) and bool(r.get("isDeleted"))

        for field, value in r.items():
            if field in ("_cellStatuses", "isDeleted"):
                continue
            if field in _CONTRACTOR_DATE_FIELDS:
                if isinstance(value, dict):
                    target = first.setdefault(field, {})
                    for day, day_value in value.items():
                        if str(day_value or "").strip():
                            target[day] = day_value
            elif not str(first.get(field) or "").strip() and str(value or "").strip():
                first[field] = value

    # A blank-contractor row only records "nothing named against this activity yet", so once the
    # activity has a real contractor the blank carries no information and is left over from an
    # earlier session. An empty row added with "+" and saved without a name is trimmed the same way.
    named = {norm(r.get("activity")) for r in out
             if isinstance(r, dict) and contractor_of(r)}
    kept = [
        r for r in out
        if not isinstance(r, dict)
        or not str(r.get("activity") or "").strip()
        or contractor_of(r)
        or norm(r.get("activity")) not in named
    ]

    # Collapsing can drop the copy of an activity that was holding its place in the list - the
    # blank one entered first, with the named copy sitting further down - so the standing order is
    # restored here rather than left to whichever copy happened to survive.
    return _order_contractor_rows(kept)


def _merge_carried_contractors(cur_rows: list, prev_rows: list, target_date: str) -> tuple[list, int]:
    """
    Bring forward contractors from the previous report date that this date does not have yet.

    Rows already on the sheet are never touched - a date that has been worked on keeps exactly what
    was entered. Anything missing is added:

      * onto the blank placeholder row for that activity, if one is free (so the standing list gets
        filled in rather than gaining a duplicate line), otherwise
      * immediately after that activity's existing rows, keeping the group contiguous - the sheet
        merges Sr No and Activity down consecutive rows, so an entry appended at the end would
        render as a second group with the same name.

    Rows already present are pre-filled for the new date from their own last recorded figure, the
    same as the carried ones - otherwise a contractor entered yesterday would come back today with
    an empty column while the ones carried across arrived with theirs filled in.

    Returns the merged rows and how many were added or pre-filled.
    """
    merged = [dict(r) for r in cur_rows if isinstance(r, dict)]
    existing_by_id = {}
    existing_by_name = {}
    matched_indices = set()
    
    def norm(v): return " ".join(str(v or "").replace("\xa0", " ").split()).casefold()
    
    for i, r in enumerate(merged):
        if str(r.get("contractor") or "").strip():
            if r.get("id"):
                existing_by_id[str(r["id"])] = i
            existing_by_name[(norm(r.get("activity")), norm(r.get("contractor")))] = i
            
    added = 0

    for prev in prev_rows:
        if not isinstance(prev, dict):
            continue

        idx = None
        if prev.get("id") and str(prev["id"]) in existing_by_id:
            idx = existing_by_id[str(prev["id"])]
        else:
            key_name = (norm(prev.get("activity")), norm(prev.get("contractor") or prev.get("contractorName")))
            if key_name in existing_by_name:
                idx = existing_by_name[key_name]

        # Fallback: if we couldn't match by ID or exact name (e.g. name was edited and cur_row is missing an ID),
        # pair up with the first unmatched row in the same activity that has no ID.
        if idx is None:
            activity_norm = _contractor_key(prev)[0]
            same_activity = [i for i, r in enumerate(merged) if _contractor_key(r)[0] == activity_norm]
            for i in same_activity:
                if i not in matched_indices and not merged[i].get("id"):
                    idx = i
                    break

        if idx is not None:
            matched_indices.add(idx)
            current = merged[idx]
            # The contractor is already on this sheet, so merge the figures date by date rather
            # than all-or-nothing. A day filled in later against an earlier date - entered on the
            # 10th's sheet against the 5th, say - has to reach the sheets for later dates too,
            # and those rows already hold figures of their own, so an "only if empty" rule never
            # picked it up. This sheet's own value always wins; only dates it does not have are
            # taken across, and nothing is invented for a date nobody entered.
            current = merged[idx]
            
            # If it matched by ID, sync the contractor name from the previous draft if it changed
            if prev.get("id") and prev.get("id") == current.get("id"):
                prev_name = str(prev.get("contractor") or prev.get("contractorName") or "").strip()
                if prev_name and prev_name != str(current.get("contractor") or "").strip():
                    current["contractor"] = prev_name
                    added += 1
            cur_statuses = current.get("_cellStatuses", {})
            if not isinstance(cur_statuses, dict):
                cur_statuses = {}

            for field in ("agreedValues", "availableValues"):
                prev_values = prev.get(field)
                if not isinstance(prev_values, dict):
                    continue
                cur_values = current.get(field)
                if not isinstance(cur_values, dict):
                    cur_values = {}
                    current[field] = cur_values
                for day, value in prev_values.items():
                    if not str(value or "").strip():
                        continue
                    
                    # We always allow the previous draft to overwrite the current draft's value
                    # for these past dates. This ensures that if a user goes back and edits
                    # the 10th's report, the 11th's report will correctly reflect that edit.
                    if str(cur_values.get(day, "")).strip() != str(value).strip():
                        cur_values[day] = value
                        added += 1
            continue

        # Figures come across exactly as recorded, against the dates they were entered against.
        # Nothing is written into the new date's column - a value shows on the day it was keyed in
        # and nowhere else.
        carried = {k: v for k, v in prev.items() if k != "_cellStatuses"}

        activity_norm = _contractor_key(prev)[0]
        same_activity = [i for i, r in enumerate(merged)
                         if _contractor_key(r)[0] == activity_norm]

        blank = next((i for i in same_activity
                      if not str(merged[i].get("contractor") or "").strip()), None)
        if blank is not None:
            merged[blank] = carried
            matched_indices.add(blank)
        elif same_activity:
            insert_at = same_activity[-1] + 1
            merged.insert(insert_at, carried)
            matched_indices = { (m + 1 if m >= insert_at else m) for m in matched_indices }
            matched_indices.add(insert_at)
        else:
            merged.append(carried)
            matched_indices.add(len(merged) - 1)

        idx = merged.index(carried)
        existing_by_name[(norm(carried.get("activity")), norm(carried.get("contractor")))] = idx
        if carried.get("id"):
            existing_by_id[str(carried["id"])] = idx
        added += 1

    # Sheets saved before the carry-over deduplicated still hold a copy of the standing activities
    # per session that ever built them, and the activities carried in above were appended behind
    # whatever this date already had rather than slotted into the standing order. Collapsing and
    # ordering here means both repair themselves the next time the sheet is opened, rather than
    # needing the rows rewritten in the database.
    deduped = _collapse_contractor_rows(merged)
    if [id(r) for r in deduped] != [id(r) for r in merged]:
        # A row removed as a duplicate and a group moved back into the standing order are both
        # changes to what is on the sheet, so both have to be written back - otherwise the order is
        # corrected for the person looking at it and the stored sheet stays scrambled for everyone
        # reading it later.
        added += max(len(merged) - len(deduped), 1)
        merged = deduped

    return merged, added

async def _get_composite_prev_rows(pool, project_id: int, user_id: int, target_date: str, exclude_id: int = None) -> list:
    """Build one contractor list out of every date this supervisor has for the project.

    A contractor typed in against one date has to reach every other date's sheet, so the list is a
    union across dates rather than a snapshot of the newest one. The catch is that the same row
    exists on every date and is usually blank: a name entered against the 3rd sits beside blank
    copies of itself on the 4th through the 11th. Taking the newest date's copy wholesale threw
    that name away. Each field is instead filled from the newest date that actually has a value
    for it - a blank never overwrites one - and the date-keyed figures are unioned across dates.
    """
    import json
    query = """
        SELECT data_json FROM dpr_supervisor_entries
        WHERE project_id = $1 AND sheet_type = 'manpower_details_2'
          AND supervisor_id = $2 AND data_json IS NOT NULL
    """
    args = [project_id, user_id]
    if exclude_id is not None:
        query += " AND id != $3"
        args.append(exclude_id)
    query += " ORDER BY entry_date ASC"

    all_past = await pool.fetch(query, *args)
    composite_dict = {}
    date_fields = ("agreedValues", "availableValues")
    def norm(v): return " ".join(str(v or "").replace("\xa0", " ").split()).casefold()

    for row in all_past:
        data = row["data_json"]
        if isinstance(data, str): data = json.loads(data)
        r_rows = data.get("rows", []) if isinstance(data, dict) else []
        for r in r_rows:
            if not isinstance(r, dict): continue

            # This sheet is organised by activity and _merge_carried_contractors keys everything on
            # (activity, contractor), so a row without an activity has no group to sit in. Because
            # the composite spans every date rather than just the previous one, an activity-less row
            # left behind on an old date - a P6 timephased resource row, say - would otherwise be
            # resurrected onto every later sheet as an extra orphan line.
            if not str(r.get("activity") or "").strip():
                continue

            c_id = r.get("id")
            if c_id:
                key = str(c_id)
            else:
                key = (norm(r.get("activity")), norm(r.get("contractor") or r.get("contractorName")))

            known = composite_dict.get(key)
            if known is None:
                known = {k: v for k, v in r.items() if k != "_cellStatuses"}
                for field in date_fields:
                    value = known.get(field)
                    known[field] = dict(value) if isinstance(value, dict) else {}
                composite_dict[key] = known
                continue

            # Rows arrive oldest date first, so a later date wins - but only where it has
            # something to say. A blank on the 10th must not erase what was entered on the 3rd.
            for field, value in r.items():
                if field == "_cellStatuses":
                    continue
                if field in date_fields:
                    if isinstance(value, dict):
                        for day, day_value in value.items():
                            if str(day_value or "").strip():
                                known[field][day] = day_value
                elif field == "isDeleted":
                    known[field] = value
                elif str(value or "").strip():
                    known[field] = value

    return _collapse_contractor_rows(
        [r for r in composite_dict.values() if not r.get("isDeleted")]
    )

# Keys that are scaffolding rather than something a person typed: they are present on a freshly
# built sheet, so a row carrying only these is still an untouched row.
_STRUCTURAL_ROW_KEYS = {
    "id", "activity", "agreedLabel", "availableLabel", "_cellStatuses",
    "sNo", "srNo", "isDeleted",
}


def _entry_has_content(row) -> bool:
    """True if an entry holds anything beyond an empty scaffold.

    A PM/PMAG gets a draft created for them the moment they open a sheet, even if they only looked.
    That empty draft must not be treated as "their work" and shown in place of the supervisor's
    filled sheet, so emptiness is judged on the row values rather than on the draft existing.
    """
    if not row:
        return False
    data = row["data_json"] if "data_json" in row.keys() else None
    if not data:
        return False
    if isinstance(data, str):
        try:
            data = json.loads(data)
        except (ValueError, TypeError):
            return False
    rows = data.get("rows", []) if isinstance(data, dict) else []
    for r in rows:
        if not isinstance(r, dict):
            continue
        for key, value in r.items():
            if key in _STRUCTURAL_ROW_KEYS:
                continue
            if isinstance(value, dict):
                if any(str(v or "").strip() for v in value.values()):
                    return True
            elif str(value or "").strip():
                return True
    return False


def _get_empty_data(sheet_type: str, today: str, yesterday: str) -> dict:
    """Return empty initial data structure based on sheet type."""
    if sheet_type == "dp_qty":
        return {
            "staticHeader": {
                "projectInfo": "PLOT - A-06 135 MW - KHAVDA HYBRID SOLAR PHASE 3 (YEAR 2025-26)",
                "reportingDate": today,
                "progressDate": yesterday,
            },
            "rows": [],
        }
    elif sheet_type == "dp_vendor_block":
        return {"rows": []}
    elif sheet_type == "manpower_details":
        return {"totalManpower": 0, "rows": []}
    elif sheet_type == "dp_block":
        return {"rows": []}
    elif sheet_type == "dp_vendor_idt":
        return {"rows": []}
    elif sheet_type == "testing_commissioning":
        return {"rows": []}
    elif sheet_type == "manpower_details_2":
        return {"rows": []}
    elif sheet_type in ("switchyard", "transmission_line", "infra_works", "ac_sheet", "dc_sheet"):
        return {"rows": []}
    return {"rows": []}
async def rebuild_dp_qty_json(pool, entry_row: dict) -> dict:
    project_object_id = entry_row["project_id"]
    target_date = entry_row["entry_date"]
    if isinstance(target_date, str):
        target_date = datetime.strptime(target_date, "%Y-%m-%d").date()
    yesterday_date = target_date - timedelta(days=1)
    
    rows = await pool.fetch("""
        SELECT sa.object_id as activity_object_id, sa.activity_id, sa.name as description,
               sa.planned_start as base_plan_start, sa.planned_finish as base_plan_finish,
               sa.start_date as forecast_start, sa.finish_date as forecast_finish,
               sa.actual_start,
               sa.percent_complete as "PercentComplete", sa.total_quantity, sa.uom,
               sa.block_capacity, sa.spv_no,
               sa.scope, sa.front, sa.hold, sa.priority, sa.plot, sa.new_block_nom,
               sa.wbs_object_id, sa.wbs_name, sa.primary_resource as resource_name,
               sa.uom as ra_uom
        FROM solar_activities sa
        WHERE sa.project_object_id = $1 ORDER BY sa.planned_start
    """, project_object_id)

    # Fetch cummulative progress from DB (strictly before target_date)
    cum_rows = await pool.fetch("""
        SELECT dp.activity_object_id, SUM(dp.today_value) as cumulative_value
        FROM dpr_daily_progress dp
        JOIN solar_activities sa ON sa.object_id = dp.activity_object_id AND dp.activity_source = 'p6'
        WHERE dp.progress_date < $1 AND sa.project_object_id = $2
        GROUP BY dp.activity_object_id
    """, target_date, project_object_id)
    cum_map = {r["activity_object_id"]: float(r["cumulative_value"] or 0) for r in cum_rows}

    # Fetch yesterday's exact progress
    yest_rows = await pool.fetch("""
        SELECT dp.activity_object_id, dp.today_value
        FROM dpr_daily_progress dp
        JOIN solar_activities sa ON dp.activity_object_id = sa.object_id AND dp.activity_source = 'p6'
        WHERE dp.progress_date = $1 AND sa.project_object_id = $2
    """, yesterday_date, project_object_id)
    yest_map = {r["activity_object_id"]: float(r["today_value"] or 0) for r in yest_rows}

    # Fetch today's exact progress
    today_rows = await pool.fetch("""
        SELECT dp.activity_object_id, dp.today_value
        FROM dpr_daily_progress dp
        JOIN solar_activities sa ON dp.activity_object_id = sa.object_id AND dp.activity_source = 'p6'
        WHERE dp.progress_date = $1 AND sa.project_object_id = $2
    """, target_date, project_object_id)
    today_map = {r["activity_object_id"]: float(r["today_value"]) for r in today_rows if r["today_value"] is not None}

    draft_data = entry_row["data_json"]
    if isinstance(draft_data, str):
        draft_data = json.loads(draft_data)
    draft_rows = draft_data.get("rows", [])
    
    draft_map = {}
    for dr in draft_rows:
        act_id = dr.get("activityId")
        if act_id:
            draft_map[str(act_id).upper().strip()] = dr

    final_rows = []
    for i, r in enumerate(rows):
        act_id = str(r["activity_id"]) if r.get("activity_id") else ""
        act_obj_id = r["activity_object_id"]
        
        row_dict = {
            "slNo": str(i + 1),
            "activityId": act_id,
            "description": r["description"] or "",
            "totalQuantity": str(r["total_quantity"]) if r["total_quantity"] else "",
            "uom": str(r.get("uom") or r.get("ra_uom") or "Days"),
            "basePlanStart": r["base_plan_start"].strftime("%Y-%m-%d") if r["base_plan_start"] else "",
            "basePlanFinish": r["base_plan_finish"].strftime("%Y-%m-%d") if r["base_plan_finish"] else "",
            "forecastStart": r["forecast_start"].strftime("%Y-%m-%d") if r["forecast_start"] else "",
            "forecastFinish": r["forecast_finish"].strftime("%Y-%m-%d") if r["forecast_finish"] else "",
            "blockCapacity": str(r.get("block_capacity")) if r.get("block_capacity") else "", 
            "phase": r["wbs_name"] or "",
            "block": "", 
            "spvNumber": str(r.get("spv_no")) if r.get("spv_no") else "",
            "actualStart": r["actual_start"].strftime("%Y-%m-%d") if r["actual_start"] else "",
            "actualFinish": "",
            "priority": str(r.get("priority")) if r.get("priority") else "",
            "plot": str(r.get("plot")) if r.get("plot") else "",
            "newBlockNom": str(r.get("new_block_nom")) if r.get("new_block_nom") else "",
            "scope": str(r.get("scope")) if r.get("scope") else "",
            "front": str(r.get("front")) if r.get("front") else "",
            "hold": str(r.get("hold")) if r.get("hold") else "",
        }
        
        def fmt_val(v):
            if v in (None, ""): return ""
            try:
                fv = float(v)
                return str(int(fv)) if fv.is_integer() else str(fv)
            except (TypeError, ValueError):
                return str(v)
                
        calculated_cum = cum_map.get(act_obj_id, 0.0)
        yest_val = yest_map.get(act_obj_id, 0.0)
        
        draft_row = draft_map.get(act_id.upper().strip() if act_id else "", {})
        # Prioritize draft value if present, otherwise DB value
        draft_today_val = draft_row.get("todayValue")
        if draft_today_val not in (None, ""):
            today_val = fmt_val(draft_today_val)
        elif act_obj_id in today_map:
            today_val = fmt_val(today_map[act_obj_id]) if today_map[act_obj_id] > 0 else "0"
        else:
            today_val = ""
            
        try:
            tod = float(today_val) if today_val else 0.0
        except ValueError:
            tod = 0.0
        total_cum = calculated_cum + tod
            
        remarks = draft_row.get("remarks", "")
        
        row_dict["cumulative"] = fmt_val(total_cum) if total_cum > 0 else ""
        row_dict["yesterdayValue"] = fmt_val(yest_val) if yest_val > 0 else fmt_val(draft_row.get("yesterdayValue", ""))
        row_dict["todayValue"] = today_val
        row_dict["remarks"] = remarks
        
        # Preserve draft-edited metadata (dates, scope, priority, etc.)
        # Without this, supervisor's edits to actualStart/forecastStart etc.
        # get overwritten by solar_activities column values on every reload.
        DRAFT_OVERRIDE_KEYS = [
            "actualStart", "actualFinish", "forecastStart", "forecastFinish",
            "scope", "front", "hold", "priority", "plot", "newBlockNom",
            "block", "spvNumber", "blockCapacity",
        ]
        for key in DRAFT_OVERRIDE_KEYS:
            draft_val = draft_row.get(key)
            if draft_val is not None and str(draft_val).strip() not in ("", "-"):
                row_dict[key] = str(draft_val).strip()
        
        try:
            tot = float(row_dict["totalQuantity"]) if row_dict["totalQuantity"] else 0.0
            bal = tot - total_cum
            if bal < 0: bal = 0
            row_dict["balance"] = fmt_val(bal) if tot > 0 else ""
        except ValueError:
            pass

        final_rows.append(row_dict)

    draft_data["rows"] = final_rows
    return draft_data


async def universal_progress_rebuild(pool, entry_row: dict) -> dict:
    project_object_id = entry_row["project_id"]
    sheet_type = entry_row["sheet_type"]
    target_date = entry_row["entry_date"]
    if isinstance(target_date, str):
        target_date = datetime.strptime(target_date, "%Y-%m-%d").date()
    yesterday_date = target_date - timedelta(days=1)

    # Fetch cumulative progress from DB — keyed by BOTH activity_id (string) and object_id (numeric)
    # so draft rows (which use string activity_id like 'ACL1-CC-1000') can match
    cum_rows = await pool.fetch("""
        SELECT 
            sa.object_id as activity_object_id, 
            sa.activity_id, 
            COALESCE(sa.cumulative, 0) + COALESCE(dp_sum.cumulative_value, 0) as cumulative_value
        FROM solar_activities sa
        JOIN projects p ON p.object_id = sa.project_object_id
        LEFT JOIN (
            -- Only days not yet absorbed into sa.cumulative. See get_yesterday_values for why this
            -- is `pushed_at IS NULL` and no longer a comparison against projects.data_date: the two
            -- queries have to agree, or the sheet's own draft and the yesterday-values it is
            -- overlaid with disagree about the same activity's Completed-as-on.
            SELECT dp.activity_object_id, SUM(dp.today_value) as cumulative_value
            FROM dpr_daily_progress dp
            JOIN solar_activities sa2 ON sa2.object_id = dp.activity_object_id AND dp.activity_source = 'p6'
            WHERE dp.progress_date < $1
              AND dp.pushed_at IS NULL
            GROUP BY dp.activity_object_id
        ) dp_sum ON dp_sum.activity_object_id = sa.object_id
        WHERE sa.project_object_id = $2
    """, target_date, project_object_id)
    # Build maps keyed by BOTH the string activity_id AND the numeric object_id
    cum_map = {}
    for r in cum_rows:
        val = float(r["cumulative_value"] or 0)
        cum_map[str(r["activity_object_id"])] = val
        if r["activity_id"]:
            cum_map[str(r["activity_id"]).upper().strip()] = val

    # Fetch yesterday's exact progress
    yest_rows = await pool.fetch("""
        SELECT dp.activity_object_id, sa.activity_id, dp.today_value
        FROM dpr_daily_progress dp
        JOIN solar_activities sa ON dp.activity_object_id = sa.object_id AND dp.activity_source = 'p6'
        WHERE dp.progress_date = $1 AND sa.project_object_id = $2
    """, yesterday_date, project_object_id)
    yest_map = {}
    for r in yest_rows:
        val = float(r["today_value"] or 0)
        yest_map[str(r["activity_object_id"])] = val
        if r["activity_id"]:
            yest_map[str(r["activity_id"]).upper().strip()] = val

    # Fetch today's exact progress
    today_rows = await pool.fetch("""
        SELECT dp.activity_object_id, sa.activity_id, dp.today_value
        FROM dpr_daily_progress dp
        JOIN solar_activities sa ON dp.activity_object_id = sa.object_id AND dp.activity_source = 'p6'
        WHERE dp.progress_date = $1 AND sa.project_object_id = $2
    """, target_date, project_object_id)
    today_map = {}
    for r in today_rows:
        if r["today_value"] is not None:
            val = float(r["today_value"])
            today_map[str(r["activity_object_id"])] = val
            if r["activity_id"]:
                today_map[str(r["activity_id"]).upper().strip()] = val

    # Fetch persisted DPR metadata and dates from solar_activities
    # This ensures metadata survives across date changes
    meta_rows = await pool.fetch("""
        SELECT sa.activity_id, sa.object_id,
               sa.actual_start, sa.actual_finish,
               sa.start_date as forecast_start, sa.finish_date as forecast_finish,
               sa.dpr_metadata
        FROM solar_activities sa
        WHERE sa.project_object_id = $1
    """, project_object_id)
    metadata_map = {}
    for r in meta_rows:
        meta = {}
        # Add persisted dates
        if r["actual_start"]:
            meta["actualStart"] = r["actual_start"].strftime("%Y-%m-%d") if hasattr(r["actual_start"], "strftime") else str(r["actual_start"])
        if r["actual_finish"]:
            meta["actualFinish"] = r["actual_finish"].strftime("%Y-%m-%d") if hasattr(r["actual_finish"], "strftime") else str(r["actual_finish"])
        if r["forecast_start"]:
            meta["forecastStart"] = r["forecast_start"].strftime("%Y-%m-%d") if hasattr(r["forecast_start"], "strftime") else str(r["forecast_start"])
        if r["forecast_finish"]:
            meta["forecastFinish"] = r["forecast_finish"].strftime("%Y-%m-%d") if hasattr(r["forecast_finish"], "strftime") else str(r["forecast_finish"])
        # Add JSONB metadata
        dpr_meta = r["dpr_metadata"] or {}
        if isinstance(dpr_meta, str):
            try: dpr_meta = json.loads(dpr_meta)
            except: dpr_meta = {}
        meta.update(dpr_meta)

        if meta:
            metadata_map[str(r["object_id"])] = meta
            if r["activity_id"]:
                metadata_map[str(r["activity_id"]).upper().strip()] = meta

    draft_data = entry_row["data_json"]
    if isinstance(draft_data, str):
        draft_data = json.loads(draft_data)
        
    def fmt_val(v):
        if v in (None, ""): return ""
        try:
            fv = float(v)
            return str(int(fv)) if fv.is_integer() else str(fv)
        except (TypeError, ValueError):
            return str(v)
    
    draft_rows = draft_data.get("rows", [])
    for row in draft_rows:
        act_id = str(row.get("activityId", ""))
        if not act_id:
            continue
        
        # IMPORTANT: Capture the draft's todayValue BEFORE any mutations below
        saved_draft_today = row.get("todayValue")
        
        act_id_lookup = act_id.upper().strip()
        
        calculated_cum = cum_map.get(act_id_lookup, cum_map.get(act_id, 0.0))
        yest_val = yest_map.get(act_id_lookup, yest_map.get(act_id, 0.0))
        
        row["cumulative"] = fmt_val(calculated_cum) if calculated_cum > 0 else ""
        
        if yest_val > 0:
            row["yesterdayValue"] = fmt_val(yest_val)
        else:
            row["yesterdayValue"] = fmt_val(row.get("yesterdayValue", ""))
        
        # Prioritize draft value if present, otherwise DB value
        if saved_draft_today not in (None, ""):
            row["todayValue"] = fmt_val(saved_draft_today)
        elif act_id_lookup in today_map or act_id in today_map:
            val = today_map.get(act_id_lookup, today_map.get(act_id, 0))
            row["todayValue"] = fmt_val(val) if val > 0 else "0"
        else:
            row["todayValue"] = ""
            
        today_val = row["todayValue"]
        try:
            tod = float(today_val) if today_val else 0.0
        except ValueError:
            tod = 0.0
        total_cum = calculated_cum + tod
            
        row["cumulative"] = fmt_val(total_cum) if total_cum > 0 else ""
        
        # Always update "actual" if present
        if "actual" in row:
            row["actual"] = fmt_val(total_cum) if total_cum > 0 else ""
        
        try:
            scope_val = row.get("scope") or row.get("totalQuantity") or 0.0
            tot = float(scope_val) if scope_val else 0.0
            bal = tot - total_cum
            if bal < 0: bal = 0
            
            if "balance" in row or "totalQuantity" in row:
                row["balance"] = fmt_val(bal) if tot > 0 else ""
        except ValueError:
            pass

        # Inject persisted metadata from solar_activities into draft rows
        # This ensures metadata (feeder, vendor, dates, etc.) survives date changes
        persisted_meta = metadata_map.get(act_id_lookup, metadata_map.get(act_id, {}))
        if persisted_meta:
            for mk, mv in persisted_meta.items():
                # Only fill if the draft row doesn't already have a value
                current_val = row.get(mk)
                if current_val is None or str(current_val).strip() == "" or current_val == "-":
                    row[mk] = mv

    draft_data["rows"] = draft_rows
    return draft_data


async def _finalize_entry(pool, entry: dict) -> dict:
    sheet_type = entry.get("sheet_type")
    # Before processing, ensure history is flattened for calculation
    if entry.get("data_json"):
        entry["data_json"] = flatten_history_array(entry["data_json"], entry.get("entry_date"))
    try:
        if sheet_type == "dp_qty":
            rebuilt_data = await rebuild_dp_qty_json(pool, entry)
            entry["data_json"] = json.dumps(rebuilt_data)
        elif sheet_type in ("dc_sheet", "ac_sheet", "testing_commissioning", "dp_vendor_block", "dp_vendor_idt", "dp_block", "switchyard", "transmission_line", "infra_works", "pss_civil_peb", "pss_electrical", "pss_tl_visual", "pss_transmission", "wind_progress", "wind_33kv", "wind_pss", "wind_ehv"):
            rebuilt_data = await universal_progress_rebuild(pool, entry)
            entry["data_json"] = json.dumps(rebuilt_data)
    except Exception as e:
        logger.error(f"Failed to rebuild json dynamically for {sheet_type}: {e}")
    return entry


@router.get("/daily-progress-history")
async def get_daily_progress_history(
    projectId: str,
    sheetType: str,
    days: int = 7,
    date: Optional[str] = None,
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(get_current_user),
):
    """
    Returns daily progress values for each activity over the last N days.
    Response: { activityObjectId: { "YYYY-MM-DD": value, ... }, ... }

    This is what re-populates the sheet's trailing date columns after a reload, so it has to cover
    every row the sheet prints. Two things it used not to:

    * `int(projectId)` raised on a P6 project id like "FY26-P04" - a 500 the frontend swallows into
      an empty map, i.e. that project's history columns silently came back blank. Every other
      endpoint here resolves the identifier properly; this one now does too.
    * only `activity_source = 'p6'` rows were returned, so a DPR-level activity's entered history
      had no source to render from once its draft was gone.
    """
    from datetime import timedelta as td
    project_object_id = await resolve_project_id(projectId, pool)
    if date:
        target = datetime.strptime(date, "%Y-%m-%d").date() if isinstance(date, str) else date
    else:
        target = datetime.now().date()
    start_date = target - td(days=days - 1)

    rows = await pool.fetch("""
        SELECT dp.activity_object_id, sa.activity_id, dp.progress_date, dp.today_value, dp.sheet_type
        FROM dpr_daily_progress dp
        JOIN solar_activities sa ON sa.object_id = dp.activity_object_id AND dp.activity_source = 'p6'
        WHERE sa.project_object_id = $1
          AND dp.progress_date >= $2::date
          AND dp.progress_date <= $3::date

        UNION ALL

        SELECT dp.activity_object_id, ca.activity_id, dp.progress_date, dp.today_value, dp.sheet_type
        FROM dpr_daily_progress dp
        JOIN dpr_custom_activities ca ON ca.id = dp.activity_object_id AND dp.activity_source = 'dpr'
        WHERE ca.project_id = $1
          AND dp.progress_date >= $2::date
          AND dp.progress_date <= $3::date

        ORDER BY progress_date, sheet_type
    """, project_object_id, start_date, target)

    # An activity's figure for a day is ONE number whichever sheet it was typed on - sheet_type
    # isolation was removed on purpose - but the table still stores a row per sheet_type, and a
    # sheet the user never filled in leaves a 0 placeholder sitting next to the real reading.
    # Collapsing the rows by "last one wins" therefore let a 0, or an unrelated sheet's figure,
    # mask the reading, and which one landed depended on the order rows came back in: activity
    # 1931533 on 01-Sep carries dc_sheet=66 beside infra_works=11, and 3789886 on 26-Aug carries
    # dc_sheet=10 and dp_qty=20 beside ac_sheet=0 and testing_commissioning=0.
    #
    # Rank them instead, strongest first: the requested sheet's own reading, then any real
    # reading, then the requested sheet's 0, then anything else. A 0 survives only when it is
    # genuinely all there is, and the result no longer depends on row order.
    def _rank(sheet_type: str, value: float) -> int:
        own = sheet_type == sheetType
        if value != 0:
            return 3 if own else 2
        return 1 if own else 0

    result: dict = {}
    ranks: dict = {}

    def _offer(key: str, date_str: str, val: float, rank: int) -> None:
        bucket = result.setdefault(key, {})
        if date_str not in bucket or rank > ranks[(key, date_str)]:
            bucket[date_str] = val
            ranks[(key, date_str)] = rank

    for r in rows:
        obj_id = str(r["activity_object_id"])
        act_id = str(r["activity_id"]) if r["activity_id"] else None
        date_str = r["progress_date"].isoformat() if hasattr(r["progress_date"], "isoformat") else str(r["progress_date"])
        val = float(r["today_value"]) if r["today_value"] is not None else 0.0
        rank = _rank(str(r["sheet_type"] or ""), val)

        _offer(obj_id, date_str, val, rank)

        # Also index by string activity_id for draft matching
        if act_id:
            _offer(act_id, date_str, val, rank)

    return {"data": result, "startDate": start_date.isoformat(), "endDate": target.isoformat(), "days": days}


@router.get("/daily-progress-full-dump")
async def get_daily_progress_full_dump(
    projectId: str,
    sheetType: str,
    fromDate: Optional[str] = None,
    toDate: Optional[str] = None,
    boundsOnly: bool = False,
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(get_current_user),
):
    """
    Every daily-progress value ever recorded for a project/sheet, with no date cutoff by default -
    the complete history a supervisor has ever entered, not just the sheet's rolling 5-7 day
    window. `fromDate`/`toDate` (both optional, either or both may be given) narrow it to a
    calendar-picked range for callers that don't want the entire project lifetime in one file.
    `boundsOnly=true` skips building the (potentially large) row/value payload and returns just
    `availableFrom`/`availableTo` - enough for a date-range picker to bound what it offers, without
    pulling the whole dataset just to open a dialog.

    The sheet itself only ever shows a short trailing window of dates (today's grid has room for
    yesterday and a handful of days before it); a plain "export this sheet" download inherits that
    same window, so anyone who wants the full record for an audit, a monthly rollup, or simply to
    keep an offline copy has never actually had a way to get one - the data has existed in
    dpr_daily_progress all along, just with no route out. This is that route: it reads straight
    from that table, covering both P6-sourced activities and DPR-only custom activities, so a
    download here can never be missing a day the sheet itself once had.

    Response: { dates: ["YYYY-MM-DD", ...] (sorted), rows: [{ activityId, description, values: {
    "YYYY-MM-DD": number } }], availableFrom, availableTo }
    """
    project_object_id = await resolve_project_id(projectId, pool)

    from_dt = datetime.strptime(fromDate, "%Y-%m-%d").date() if fromDate else None
    to_dt = datetime.strptime(toDate, "%Y-%m-%d").date() if toDate else None

    # Unfiltered bounds - lets a date-range picker on the frontend know the earliest/latest date
    # actually worth offering, regardless of whatever fromDate/toDate this particular call passed.
    bounds = await pool.fetchrow("""
        SELECT MIN(dp.progress_date) AS min_date, MAX(dp.progress_date) AS max_date
        FROM dpr_daily_progress dp
        WHERE 1=1
          AND (
            (dp.activity_source = 'p6'
             AND dp.activity_object_id IN (SELECT object_id FROM solar_activities WHERE project_object_id = $1))
            OR
            (dp.activity_source = 'dpr'
             AND dp.activity_object_id IN (SELECT id FROM dpr_custom_activities WHERE project_id = $1))
          )
    """, project_object_id)
    available_from = bounds["min_date"].isoformat() if bounds and bounds["min_date"] else None
    available_to = bounds["max_date"].isoformat() if bounds and bounds["max_date"] else None

    if boundsOnly:
        return {"dates": [], "rows": [], "availableFrom": available_from, "availableTo": available_to}

    # The two halves are separated by activity_source, not by hoping the id spaces stay disjoint.
    # The old custom half had to exclude ids that also existed in solar_activities, which would
    # have dropped a real DPR row the moment the ranges met; the source column removes the guess.
    rows = await pool.fetch("""
        WITH matched AS (
            SELECT dp.activity_object_id, dp.progress_date, dp.today_value,
                   sa.activity_id AS act_id, sa.name AS description
            FROM dpr_daily_progress dp
            JOIN solar_activities sa ON sa.object_id = dp.activity_object_id AND dp.activity_source = 'p6'
            WHERE sa.project_object_id = $1
              AND ($2::date IS NULL OR dp.progress_date >= $2)
              AND ($3::date IS NULL OR dp.progress_date <= $3)

            UNION ALL

            SELECT dp.activity_object_id, dp.progress_date, dp.today_value,
                   ca.activity_id AS act_id, ca.description AS description
            FROM dpr_daily_progress dp
            JOIN dpr_custom_activities ca ON ca.id = dp.activity_object_id
            WHERE ca.project_id = $1
              AND ($2::date IS NULL OR dp.progress_date >= $2)
              AND ($3::date IS NULL OR dp.progress_date <= $3)
        )
        SELECT * FROM matched ORDER BY act_id, progress_date
    """, project_object_id, from_dt, to_dt)

    dates_set: set = set()
    rows_by_activity: dict = {}
    order: list = []
    for r in rows:
        date_str = r["progress_date"].isoformat() if hasattr(r["progress_date"], "isoformat") else str(r["progress_date"])
        val = float(r["today_value"]) if r["today_value"] is not None else 0.0
        dates_set.add(date_str)

        key = str(r["act_id"]) if r["act_id"] else f"obj:{r['activity_object_id']}"
        if key not in rows_by_activity:
            rows_by_activity[key] = {
                "activityId": str(r["act_id"]) if r["act_id"] else "",
                "description": r["description"] or "",
                "values": {}
            }
            order.append(key)
        rows_by_activity[key]["values"][date_str] = val

    return {
        "dates": sorted(dates_set),
        "rows": [rows_by_activity[k] for k in order],
        "availableFrom": available_from,
        "availableTo": available_to,
    }


@router.get("/project-summary-draft")
async def get_project_summary_draft(
    projectId: str,
    sheetType: str = 'summary',
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(get_current_user),
):
    """Fetch the latest draft for a project, accessible by PMs."""
    user_role = current_user.get("role", "").strip().lower()
    if user_role not in ("supervisor", "site pm", "pmag", "super admin", "admin"):
        raise HTTPException(403, detail={"message": "Access denied"})
        
    project_object_id = await resolve_project_id(projectId, pool)
    
    # Get ALL drafts for this project and sheet_type (to cover all blocks)
    rows = await pool.fetch("""
        SELECT * FROM dpr_supervisor_entries
        WHERE project_id = $1 AND sheet_type = $2 AND status = 'draft'
        ORDER BY updated_at DESC
    """, project_object_id, sheetType)
    
    if rows:
        results = [await _finalize_entry(pool, dict(row)) for row in rows]
        # To maintain compatibility with frontend expecting a single object, 
        # we could merge the rows array, OR return the array directly.
        # Since frontend expects a single object with `data_json: { rows: [...] }`,
        # let's merge the rows of all drafts together into one combined draft object.
        combined_rows = []
        for r in results:
            data = r.get("data_json", {})
            if isinstance(data, str):
                import json
                try: data = json.loads(data)
                except: data = {}
            r_rows = data.get("rows", []) if isinstance(data, dict) else data
            if isinstance(r_rows, list):
                combined_rows.extend(r_rows)
        
        # Return a merged draft object
        first_draft = results[0]
        if isinstance(first_draft.get("data_json"), dict):
            first_draft["data_json"]["rows"] = combined_rows
        elif isinstance(first_draft.get("data_json"), list):
            first_draft["data_json"] = combined_rows
        elif isinstance(first_draft.get("data_json"), str):
            import json
            first_draft["data_json"] = json.dumps({"rows": combined_rows})
            
        return first_draft
        
    return None

@router.get("/draft")
async def get_draft_entry(
    projectId: str,
    sheetType: str,
    date: Optional[str] = None,
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(get_current_user),
):
    """Get or create a draft entry for a supervisor."""
    user_id = current_user["userId"]
    user_role = current_user.get("role")

    # Normalize role
    user_role_lower = user_role.strip().lower() if user_role else ""
    is_admin = user_role_lower in ("super admin", "pmag", "admin")
    is_pm = user_role_lower == "site pm"
    
    # Check if supervisor or PM/Admin
    if user_role_lower not in ("supervisor", "site pm", "pmag", "super admin", "admin"):
        raise HTTPException(403, detail={"message": f"Access denied. Role: {user_role}"})

    # Verify project assignment (Bypass for Super Admin/PMAG)
    project_object_id = await resolve_project_id(projectId, pool)
    
    # Admins/PMAGs don't need explicit assignment entries to view
    if not is_admin:
        assignment = await pool.fetchrow(
            "SELECT sheet_types FROM project_assignments WHERE user_id = $1 AND project_id = $2",
            user_id, project_object_id,
        )
        if not assignment and not is_pm: # Site PM also usually assigned, but we can be lenient
            raise HTTPException(403, detail={"message": "Access denied: You are not assigned to this project"})

        # Check sheet permissions if present
        if assignment:
            permitted = assignment["sheet_types"]
            if permitted:
                try:
                    sheets = json.loads(permitted) if isinstance(permitted, str) else permitted
                    if sheets and sheetType not in sheets:
                        raise HTTPException(403, detail={"message": f"Access denied. You do not have permission for the sheet: {sheetType}"})
                except (json.JSONDecodeError, TypeError):
                    pass

    today_str, yesterday_str = _get_today_and_yesterday()
    target_date = date or today_str

    # Date validation - allow access to any historical date
    if date:
        from datetime import date as dt_date
        req = datetime.strptime(date, "%Y-%m-%d").date()
        target_yesterday = (req - timedelta(days=1)).isoformat()
    else:
        target_yesterday = yesterday_str

    # Check for rejected entry first (for today)
    if not date or date == today_str:
        row = await pool.fetchrow("""
            SELECT * FROM dpr_supervisor_entries
            WHERE supervisor_id = $1 AND project_id = $2 AND sheet_type = $3 AND status = 'rejected_by_pm'
            ORDER BY updated_at DESC LIMIT 1
        """, user_id, project_object_id, sheetType)
        if row:
            entry: dict[str, Any] = dict(row)
            entry["isRejected"] = True
            entry["rejectionMessage"] = "This entry was rejected by PM. Please review and resubmit."
            entry["rejectionReason"] = entry.get("rejection_reason")
            return await _finalize_entry(pool, entry)

    # Check existing draft
    row = await pool.fetchrow("""
        SELECT * FROM dpr_supervisor_entries
        WHERE supervisor_id = $1 AND project_id = $2 AND sheet_type = $3 AND entry_date = $4 AND status = 'draft'
    """, user_id, project_object_id, sheetType, target_date)
    
    # If PM/Admin have nothing of their own worth showing, show them the latest entry from ANY
    # supervisor. "Nothing of their own" has to mean an EMPTY draft, not the absence of one: simply
    # opening a sheet creates a draft for them, and keying on existence meant that draft then hid
    # the supervisor's filled sheet for that date from then on - the supervisor saw their data and
    # the PM/PMAG saw a blank grid. A draft they have actually typed into still wins.
    if (is_pm or is_admin) and not _entry_has_content(row):
        other = await pool.fetchrow("""
            SELECT * FROM dpr_supervisor_entries
            WHERE project_id = $1 AND sheet_type = $2 AND entry_date = $3
              AND supervisor_id != $4 AND data_json IS NOT NULL
            ORDER BY updated_at DESC LIMIT 1
        """, project_object_id, sheetType, target_date, user_id)
        if _entry_has_content(other):
            row = other
        elif row is None:
            row = other

    if row:
        entry = dict(row)
        db_date = entry["entry_date"].strftime("%Y-%m-%d") if entry.get("entry_date") else None
        if db_date and db_date < today_str:
            entry["isPastEdit"] = True
            entry["readOnlyMessage"] = "This is an edit for a past date. A reason is required upon submission."
        
        if (is_pm or is_admin) and entry.get("supervisor_id") != user_id:
            # Removed `entry["isReadOnly"] = True` so PM/Admin can edit live sheets
            entry["message"] = "Viewing supervisor's data."

        # For manpower_details_2, if this draft has no real contractor data, carry over from
        # the latest draft that does. This ensures contractor setup persists across dates.
        # Only ever on the requester's OWN entry: the carry-over is built from the requester's
        # history and is written back to the row, so running it while a PM/PMAG looks at someone
        # else's sheet merged the viewer's contractors into the owner's data.
        if sheetType == 'manpower_details_2' and entry.get("supervisor_id") == user_id:
            try:
                cur_data = entry.get("data_json", {})
                if isinstance(cur_data, str):
                    cur_data = json.loads(cur_data)
                cur_rows = cur_data.get("rows", []) if isinstance(cur_data, dict) else []
                # Merge in contractors from the previous date that this one is missing. This used
                # to run only when the sheet had no contractors at all, which meant a date someone
                # had already started never picked up the rest of the crew.
                prev_rows = await _get_composite_prev_rows(pool, project_object_id, user_id, target_date, exclude_id=entry["id"])
                merged_rows, added = _merge_carried_contractors(cur_rows, prev_rows, target_date)
                if added:
                    if isinstance(cur_data, dict):
                        cur_data["rows"] = merged_rows
                    else:
                        cur_data = {"rows": merged_rows}
                    entry["data_json"] = json.dumps(cur_data) if isinstance(entry["data_json"], str) else cur_data
                    await pool.execute(
                        "UPDATE dpr_supervisor_entries SET data_json = $1 WHERE id = $2",
                        json.dumps(cur_data), entry["id"]
                    )
                    logger.info(f"Carried {added} contractor row(s) into draft {entry['id']}")
            except Exception as e:
                logger.error(f"Failed to carry over contractor data for existing draft: {e}")

        return await _finalize_entry(pool, entry)

    # Return existing submitted/approved entry — prevents duplicate entries in PM queue.
    # Previously disabled ("to allow multiple submissions"), which caused the bug where
    # opening the same sheet after submitting would create a new empty draft each time.
    row = await pool.fetchrow("""
        SELECT * FROM dpr_supervisor_entries
        WHERE supervisor_id = $1 AND project_id = $2 AND sheet_type = $3 AND entry_date = $4
          AND status IN ('submitted_to_pm', 'approved_by_pm', 'final_approved')
        ORDER BY updated_at DESC LIMIT 1
    """, user_id, project_object_id, sheetType, target_date)
    if row:
        entry: dict[str, Any] = dict(row)
        if entry["status"] == "submitted_to_pm":
            entry["message"] = "This entry is pending PM review. Any new edits will be tracked."
        elif entry["status"] == "approved_by_pm":
            entry["message"] = "This entry is approved by PM. New edits will restart the review process."
        elif entry["status"] == "final_approved":
            entry["message"] = "This entry is fully approved. New edits will restart the review process."

        # Same contractor carryover for submitted/approved entries
        if sheetType == 'manpower_details_2':
            try:
                cur_data = entry.get("data_json", {})
                if isinstance(cur_data, str):
                    cur_data = json.loads(cur_data)
                cur_rows = cur_data.get("rows", []) if isinstance(cur_data, dict) else []
                # Merge in whatever the previous date has that this entry is missing, leaving the
                # rows already on it untouched.
                prev_rows = await _get_composite_prev_rows(pool, project_object_id, user_id, target_date, exclude_id=entry["id"])
                merged_rows, added = _merge_carried_contractors(cur_rows, prev_rows, target_date)
                if added:
                    if isinstance(cur_data, dict):
                        cur_data["rows"] = merged_rows
                    else:
                        cur_data = {"rows": merged_rows}
                    entry["data_json"] = json.dumps(cur_data) if isinstance(entry["data_json"], str) else cur_data
                    await pool.execute(
                        "UPDATE dpr_supervisor_entries SET data_json = $1 WHERE id = $2",
                        json.dumps(cur_data), entry["id"]
                    )
                    logger.info(f"Carried {added} contractor row(s) into submitted entry {entry['id']}")
            except Exception as e:
                logger.error(f"Failed to carry over contractor data for submitted entry: {e}")

        return await _finalize_entry(pool, entry)

    # Create new draft
    # For manpower_details_2 (Contractor Manpower), carry over contractor structure from the most
    # recent draft so the user doesn't have to re-enter contractors every time the date changes.
    empty_data = _get_empty_data(sheetType, target_date, target_yesterday)
    if sheetType == 'manpower_details_2':
        try:
            # The contractor list is the same crew whichever date you open, so it comes from every
            # date on the project rather than only the ones before this sheet.
            prev_rows = await _get_composite_prev_rows(pool, project_object_id, user_id, target_date)
            if prev_rows:
                # Carry the contractor rows over with their figures intact. Each figure is keyed
                # by the ISO date it was entered against, so the trailing 7-day window on a later
                # report date still shows the earlier days - and nothing is written into the new
                # date's column: a value appears on the day it was keyed in and nowhere else.
                carried_rows = []
                for r in prev_rows:
                    new_row = {**r}
                    new_row.pop("_cellStatuses", None)
                    carried_rows.append(new_row)
                empty_data = {"rows": carried_rows}
                logger.info(f"Carried over {len(carried_rows)} contractor rows from previous draft for project {project_object_id}")
        except Exception as e:
            logger.error(f"Failed to carry over manpower_details_2 data: {e}")

    row = await pool.fetchrow("""
        INSERT INTO dpr_supervisor_entries (supervisor_id, project_id, sheet_type, entry_date, previous_date, data_json, status)
        VALUES ($1, $2, $3, $4, $5, $6, 'draft') RETURNING *
    """, user_id, project_object_id, sheetType, target_date, target_yesterday, json.dumps(empty_data))

    entry = dict(row)
    db_date = entry["entry_date"].strftime("%Y-%m-%d") if entry.get("entry_date") else None
    if db_date and db_date < today_str:
        entry["isPastEdit"] = True
        entry["readOnlyMessage"] = "This is an edit for a past date. A reason is required upon submission."

    return await _finalize_entry(pool, entry)


@router.post("/save-draft")
async def save_draft_entry(
    body: dict[str, Any],
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(get_current_user),
):
    entry_id = body.get("entryId")
    new_data = body.get("data")
    is_partial = body.get("isPartial", False)

    # DEBUG LOGGING for 404 investigation
    logger.info(f"save_draft_entry: entryId={entry_id}, userId={current_user['userId']}, isPartial={is_partial}")
    
    check = await pool.fetchrow(
        "SELECT id, supervisor_id, project_id, entry_date, data_json, status FROM dpr_supervisor_entries WHERE id = $1",
        entry_id,
    )
    
    if not check:
        logger.error(f"save_draft_entry: Entry {entry_id} NOT FOUND in DB at all")
        raise HTTPException(404, detail={"message": f"Entry {entry_id} not found"})
    user_role = current_user.get("role", "").strip().lower()
    is_pm_or_admin = user_role in ("site pm", "pmag", "super admin")

    if check["supervisor_id"] != current_user["userId"] and not is_pm_or_admin:
        logger.error(f"save_draft_entry: Access denied. Entry {entry_id} belongs to supervisor {check['supervisor_id']}, but current user is {current_user['userId']}")
        raise HTTPException(403, detail={"message": "Access denied: This entry belongs to another supervisor"})

    # Prevent race condition where a delayed save-draft reverts a freshly submitted entry
    # (Commented out: Users requested the ability to edit 'submitted_to_pm' sheets directly)
    # if current_user.get("role", "").strip().lower() == "supervisor":
    #     if check["status"] in ('submitted_to_pm', 'approved_by_pm', 'final_approved'):
    #         logger.warning(f"save_draft_entry: Ignoring save for entry {entry_id} because status is {check['status']}")
    #         return {"message": "Draft save ignored - entry already submitted", "entry": dict(check)}

    # Convert flat keys to history array for storage
    final_data = extract_to_history_array(new_data, check["entry_date"])

    # Log partial update details
    if is_partial and check["data_json"]:
        logger.info(f"Performing partial update for entry {entry_id}")
        try:
            existing_data = check["data_json"]
            if isinstance(existing_data, str):
                existing_data = json.loads(existing_data)
            
            # If existing_data is a list, convert to a dict
            if isinstance(existing_data, list):
                merged_data = {"rows": existing_data}
            else:
                merged_data = existing_data.copy()
            
            # Merge top-level meta fields (like staticHeader)
            # Use final_data (history-array-converted) instead of new_data (flat keys)
            for key, val in final_data.items():
                if key != "rows":
                    merged_data[key] = val
            
            # Merge rows if present
            if "rows" in final_data and "rows" in merged_data:
                new_rows = final_data["rows"]
                existing_rows = merged_data["rows"]
                
                def get_row_key(r):
                    key_parts = []
                    
                    # Order of precedence for unique identifiers
                    if r.get("assignmentId"): 
                        key_parts.append(f"ass:{r['assignmentId']}")
                    elif r.get("activityId"): 
                        key_parts.append(f"act:{r['activityId']}")
                    elif r.get("id"): 
                        key_parts.append(f"id:{r['id']}")
                    elif r.get("typeOfMachine"): 
                        key_parts.append(f"machine:{r['typeOfMachine']}")
                    elif r.get("type"): 
                        key_parts.append(f"type:{r['type']}")
                    else:
                        # For stringing/erection which might use description/activities
                        desc = r.get("description") or r.get("activities")
                        if desc: 
                            key_parts.append(f"desc:{desc}")
                    
                    # Append description and block to disambiguate duplicated activityIds (like Solar Manpower)
                    if r.get("description"):
                        key_parts.append(f"d:{r['description']}")
                    if r.get("block"):
                        key_parts.append(f"b:{r['block']}")
                        
                    if key_parts:
                        return "|".join(key_parts)
                    return None

                existing_dict = {}
                for i, e_row in enumerate(existing_rows):
                    k = get_row_key(e_row)
                    if k:
                        existing_dict[k] = i
                
                for n_row in new_rows:
                    k = get_row_key(n_row)
                    if k and k in existing_dict:
                        idx = existing_dict[k]
                        merged_row = {**existing_rows[idx], **n_row}

                        # If the new row has a history array (from extract_to_history_array),
                        # clean up stale flat keys from the existing row to avoid conflicts
                        if isinstance(n_row.get("history"), list):
                            merged_row.pop("todayValue", None)
                            merged_row.pop("yesterdayValue", None)
                            merged_row.pop("historyValues", None)
                            keys_to_drop = [k2 for k2 in merged_row if k2.startswith("actual_") and len(k2) == 17]
                            for k2 in keys_to_drop:
                                merged_row.pop(k2, None)

                            # Merge history arrays intelligently! A blank cell on a day other than
                            # the entry's own date is never real signal - it is either a day
                            # nobody has filled in yet, or that day's column not having loaded
                            # client-side before this autosave fired (a fresh GET repopulates
                            # every date column from a snapshot; until it lands the cell renders
                            # blank). Letting a blank there overwrite an already-recorded value is
                            # exactly how a supervisor's earlier entry for that day would silently
                            # disappear on a later, unrelated save. Only the entry's own date, or a
                            # cell the user explicitly edited this save, is allowed to write 0/blank.
                            from app.services.p6_push_service import parse_date as _parse_flexible_date
                            n_cell_statuses = n_row.get("_cellStatuses")
                            n_edited_dates: set = set()
                            if isinstance(n_cell_statuses, dict):
                                for label in n_cell_statuses.keys():
                                    parsed = _parse_flexible_date(label)
                                    if parsed:
                                        n_edited_dates.add(parsed.isoformat())
                            entry_date_iso = check["entry_date"].isoformat() if hasattr(check["entry_date"], "isoformat") else str(check["entry_date"])

                            old_history = existing_rows[idx].get("history", [])
                            if isinstance(old_history, list):
                                history_dict = {h["date"]: h["actual"] for h in old_history if "date" in h}
                                for h in n_row["history"]:
                                    d = h.get("date")
                                    if not d:
                                        continue
                                    v = h.get("actual")
                                    is_blank = v is None or str(v).strip() in ("", "0", "0.0")
                                    if is_blank and d != entry_date_iso and d not in n_edited_dates:
                                        continue
                                    history_dict[d] = v
                                merged_row["history"] = [{"date": k, "actual": v} for k, v in history_dict.items()]

                        existing_rows[idx] = merged_row
                    else:
                        # Append new row
                        new_idx = len(existing_rows)
                        existing_rows.append(n_row)
                        if k:
                            existing_dict[k] = new_idx
                
                merged_data["rows"] = existing_rows
            
            final_data = merged_data
        except Exception as e:
            logger.error(f"Merge failed for entry {entry_id}: {e}")
            # Fallback to overwrite if merge fails
            
    # Perform the update
    # If the entry was already submitted or approved, revert it based on who is editing
    user_role = current_user.get("role", "").strip().lower()
    
    if user_role == "site pm":
        status_case = "CASE WHEN status IN ('approved_by_pm', 'final_approved', 'rejected_by_pmag') THEN 'rejected_by_pm' ELSE status END"
    elif user_role == "pmag":
        status_case = "CASE WHEN status IN ('final_approved') THEN 'rejected_by_pmag' ELSE status END"
    else: # supervisor
        status_case = "CASE WHEN status IN ('approved_by_pm', 'final_approved', 'rejected_by_pm', 'rejected_by_pmag') THEN 'draft' ELSE status END"

    row = await pool.fetchrow(
        f"""
        UPDATE dpr_supervisor_entries 
        SET data_json = $1, 
            status = {status_case},
            updated_at = CURRENT_TIMESTAMP 
        WHERE id = $2 RETURNING *
        """,
        json.dumps(final_data), entry_id,
    )
    
    # After saving, flatten it again for the response so the UI receives flat keys
    final_data_flattened = flatten_history_array(final_data, check["entry_date"])

    # ── Persist ALL user-edited fields back to solar_activities ──────────
    # This ensures data survives across date changes and is visible to all
    # users on the same project (last-write-wins for concurrent edits).
    #
    # Iterates the DELTA the frontend actually sent (new_data's own rows - the same rows
    # getDeltaRows() already filtered down to before this request was made), not
    # final_data_flattened's full merged set. A DC/AC sheet can carry 50+ rows; each iteration
    # here does 2-3 awaited UPDATEs, and _write_daily_progress_from_entry below does several more
    # per row per date. Running that against every row on every 2-second autosave - regardless of
    # whether that row changed - is what was driving save-draft well past a two-minute timeout
    # under normal use (confirmed in production logs: requests logging "Performing partial update"
    # with no completion line for 30-40+ seconds while later autosaves piled up behind them).
    # Restricting this to the rows that actually changed turns O(all rows) DB round-trips into
    # O(edited rows) - typically 1-5 - without changing what gets persisted, since a partial save's
    # own merge step already folds these into the full row set afterward.
    project_id = check["project_id"]
    delta_rows_for_persist = new_data.get("rows", []) if isinstance(new_data, dict) else []
    # One batch resolution shared by this loop and the daily-progress write below. Both used to
    # match rows with predicates no index could serve; see _ActivityResolver for the measurements.
    resolver = await _ActivityResolver.build(pool, project_id)
    for r in delta_rows_for_persist:
        act_id_str = str(r.get("activityId") or r.get("activityObjectId") or "")
        if not act_id_str:
            continue

        # Resolve to the primary key once, so each UPDATE below is a single index lookup instead
        # of `WHERE (activity_id = $2 OR object_id::text = $2)` - an OR against a cast column,
        # which forced a scan of every activity in the project on every row of every autosave.
        resolved = await resolver.resolve(pool, act_id_str, r.get("description") or r.get("activities") or "")
        act_obj_id = resolved[0] if (resolved and not resolved[1]) else None

        # 1. Persist scope / totalQuantity
        scope_val_str = str(r.get("scope") or r.get("totalQuantity") or "")
        if scope_val_str and act_obj_id is not None:
            try:
                scope_val = float(scope_val_str)
                await pool.execute("""
                    UPDATE solar_activities
                    SET total_quantity = $1
                    WHERE object_id = $2
                """, scope_val, act_obj_id)
            except ValueError:
                pass

        # 1b. Persist Physical Progress %
        #
        # This used to live only inside the entry's data_json, so the figure a supervisor typed
        # survived exactly as long as applyDraftOverlay could find that draft and put it back. Any
        # sheet whose draft was not being fetched showed the untouched P6 value again on the next
        # load and the edit looked like it had never saved. Writing it to the activity as well makes
        # it real: the sheet reads the same number whichever route it loads by, every sheet showing
        # that activity agrees, and the P6 push reads the supervisor's figure rather than a stale
        # one. solar_activities.percent_complete is 0-1, which is the scale data_json uses too; a
        # value that arrives on the 0-100 scale is normalised rather than trusted, so a sheet that
        # sends 100 can never store "10000% complete".
        if act_obj_id is not None and r.get("percentComplete") is not None:
            try:
                pct = float(str(r.get("percentComplete")).strip())
                if pct > 1.0:
                    pct = pct / 100.0
                if 0.0 <= pct <= 1.0:
                    await pool.execute("""
                        UPDATE solar_activities
                        SET percent_complete = $1
                        WHERE object_id = $2
                    """, pct, act_obj_id)
            except (TypeError, ValueError):
                pass

        # 2. Persist date changes to dedicated columns (actual/forecast start/finish)
        from app.services.p6_push_service import parse_date
        date_updates = {}
        for field, col in [
            ("actualStart", "actual_start"),
            ("actualFinish", "actual_finish"),
            ("forecastStart", "start_date"),
            ("forecastFinish", "finish_date"),
        ]:
            if field in r:
                val = r.get(field)
                if val is None or str(val).strip() == "" or val == "-":
                    date_updates[col] = None
                else:
                    parsed = parse_date(val)
                    if parsed:
                        date_updates[col] = parsed

        if date_updates and act_obj_id is not None:
            set_clauses = []
            params = []
            idx = 1
            for col, val in date_updates.items():
                set_clauses.append(f"{col} = ${idx}")
                params.append(val)
                idx += 1
            params.append(act_obj_id)
            sql = f"""
                UPDATE solar_activities
                SET {', '.join(set_clauses)}
                WHERE object_id = ${idx}
            """
            try:
                await pool.execute(sql, *params)
            except Exception as e:
                logger.error(f"Failed to persist dates for {act_id_str}: {e}")

        # 3. Persist wind/PSS metadata to dpr_metadata JSONB column
        #    This covers ALL non-P6 columns shown in the UI.
        metadata = {}
        METADATA_KEYS = [
            "feeder", "wtgFdnVendor", "fdnAllotmentDate",
            "stoneColumnContractor", "soilTestStatus",
            "wtgCoordE", "wtgCoordN", "substation", "spv",
            "locations", "vendorName", "soVendorName",
            "contractorName", "priority", "noOfDays",
            "selectedResourceId", "completed",
            "remarks", "agencyName",
            "plot", "newBlockNom", "block", "holdDueToWtg", "front", "vendor", "baselinePriority"
        ]
        for key in METADATA_KEYS:
            if key in r:
                val = r.get(key)
                if val is None:
                    metadata[key] = ""
                else:
                    metadata[key] = str(val).strip()

        # Also persist extraData sub-fields if present
        extra = r.get("extraData")
        if isinstance(extra, dict):
            for key in METADATA_KEYS:
                if key in extra:
                    val = extra.get(key)
                    if val is None:
                        metadata[key] = ""
                    else:
                        metadata[key] = str(val).strip()

        if metadata and act_obj_id is not None:
            try:
                await pool.execute("""
                    UPDATE solar_activities
                    SET dpr_metadata = COALESCE(dpr_metadata, '{}'::jsonb) || $1::jsonb
                    WHERE object_id = $2
                """, json.dumps(metadata), act_obj_id)
            except Exception as e:
                logger.error(f"Failed to persist metadata for {act_id_str}: {e}")

    # Also write daily progress so yesterday-values picks it up immediately, even before submission.
    # Same delta-only scoping as the persist loop above, for the same reason: this does its own
    # per-row activity lookup plus an UPSERT per date, and running it against the full merged row
    # set on every autosave (instead of just the rows this save actually touched) is the other half
    # of what was pushing save-draft past its timeout.
    try:
        row_dict = dict(row)
        row_dict["data_json"] = {"rows": delta_rows_for_persist}
        await _write_daily_progress_from_entry(pool, row_dict, logger, resolver=resolver)
    except Exception as e:
        logger.error(f"Failed to write daily progress on save_draft_entry: {e}")

    row_dict = dict(row)
    row_dict["data_json"] = final_data_flattened
    return row_dict


@router.post("/submit")
async def submit_entry(
    body: dict[str, Any],
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(get_current_user),
):
    entry_id = body.get("entryId")
    edit_reason = body.get("editReason")
    expected_sheet_type = body.get("sheetType")  # Optional safety check from frontend
    user_id = current_user["userId"]

    # DEBUG LOGGING for 404 investigation
    logger.info(f"submit_entry: entryId={entry_id}, userId={user_id}, expectedSheetType={expected_sheet_type}")
    
    check = await pool.fetchrow(
        "SELECT id, supervisor_id, status, project_id, sheet_type, entry_date FROM dpr_supervisor_entries WHERE id = $1",
        entry_id,
    )
    
    if not check:
        logger.error(f"submit_entry: Entry {entry_id} NOT FOUND in DB at all")
        raise HTTPException(404, detail={"message": f"Entry {entry_id} not found"})
    
    # Safety check: if frontend sent sheetType, verify it matches the entry's actual sheet_type.
    # This prevents a race condition where tab-switching overwrites the draft entry and the
    # wrong entry ID gets submitted.
    if expected_sheet_type and check["sheet_type"] != expected_sheet_type:
        logger.error(
            f"submit_entry: SHEET TYPE MISMATCH! Entry {entry_id} is '{check['sheet_type']}' "
            f"but frontend expected '{expected_sheet_type}'. Rejecting to prevent wrong-sheet submission."
        )
        raise HTTPException(400, detail={
            "message": f"Sheet type mismatch: you tried to submit '{expected_sheet_type}' "
                       f"but entry {entry_id} is '{check['sheet_type']}'. Please refresh and try again."
        })

    user_role = current_user.get("role", "").strip().lower()
    is_pm_or_admin = user_role in ("site pm", "pmag", "super admin")

    if check["supervisor_id"] != user_id and not is_pm_or_admin:
        logger.error(f"submit_entry: Access denied. Entry {entry_id} belongs to supervisor {check['supervisor_id']}, but current user is {user_id}")
        raise HTTPException(403, detail={"message": "Access denied: This entry belongs to another supervisor"})

    today_str, _ = _get_today_and_yesterday()
    db_date = check["entry_date"].strftime("%Y-%m-%d") if check.get("entry_date") else None
    is_past = (check["status"] in ("approved_by_pm", "final_approved")) or (db_date and db_date < today_str)
    reason_text = f"PAST EDIT REASON: {edit_reason}" if is_past and edit_reason else (edit_reason or None)

    row = await pool.fetchrow("""
        UPDATE dpr_supervisor_entries SET status = 'submitted_to_pm', submitted_at = CURRENT_TIMESTAMP,
        submitted_by = $2, updated_at = CURRENT_TIMESTAMP, pushed_at = NULL,
        rejection_reason = COALESCE($3::text, rejection_reason)
        WHERE id = $1 RETURNING *
    """, entry_id, user_id, reason_text)

    # Save snapshot
    action = "resubmitted" if check["status"] in ("rejected_by_pm", "rejected_by_pmag") else "submitted"
    await _save_snapshot(
        pool, entry_id, action, row["data_json"],
        check["status"], "submitted_to_pm", user_id, reason_text
    )

    await create_system_log(
        "SHEET_SUBMITTED", 
        user_id, 
        f"Sheet Entry: {entry_id}", 
        f"Submitted {check['sheet_type']} sheet"
    )

    # Write daily progress to dpr_daily_progress so yesterday-values query picks it up
    await _write_daily_progress_from_entry(pool, row, logger)

    # Notify Site PM(s)
    try:
        proj_name = await _get_project_name(pool, check["project_id"])
        sheet_label = _format_sheet_type(check['sheet_type'])
        date_label = _format_date(db_date)
        pms = await pool.fetch("""
            SELECT u.user_id 
            FROM users u
            JOIN project_assignments pa ON u.user_id = pa.user_id
            WHERE u.role = 'Site PM' AND pa.project_id = $1
        """, check["project_id"])
        for pm in pms:
            await create_notification(
                pool, pm["user_id"], 
                "New DPR Submission", 
                f"{current_user.get('name', current_user['email'])} submitted {sheet_label} for {proj_name} ({date_label})",
                "info", check["project_id"], entry_id, check["sheet_type"]
            )
    except Exception as e:
        logger.error(f"Failed to send submission notification: {e}")

    # EMAIL NOTIFICATION TO SITE PMS & SUPER ADMIN (Optional but useful for oversight)
    try:
        from app.services.email_service import send_dpr_status_email, send_dpr_submission_email
        from app.config import settings
        pms = await pool.fetch("""
            SELECT u.name, u.email 
            FROM users u
            JOIN project_assignments pa ON u.user_id = pa.user_id
            WHERE u.role = 'Site PM' AND pa.project_id = $1
        """, check["project_id"])
        proj = await pool.fetchval('SELECT "Name" FROM p6_projects WHERE "ObjectId" = $1', check["project_id"])
        
        # Notify Super Admin
        if settings.SUPER_ADMIN_EMAIL:
            await send_dpr_status_email(
                settings.SUPER_ADMIN_EMAIL, "Super Admin", check["sheet_type"], "Submitted to PM",
                proj or "Project", check["entry_date"].isoformat(), f"By Supervisor: {current_user.get('name', current_user.get('email', 'Supervisor'))}"
            )
            
        # Notify Site PMs via email as well
        supervisor_name = current_user.get('name', current_user.get('email', 'Supervisor'))
        for pm in pms:
            if pm["email"]:
                await send_dpr_submission_email(
                    pm["email"], pm["name"], supervisor_name, proj or "Project", check["entry_date"].isoformat()
                )
    except Exception as ee:
        logger.error(f"Submission email notification failed: {ee}")

    await cache.flush_all()
    # Finalize the entry data so the frontend gets rebuilt progress values
    finalized_entry = await _finalize_entry(pool, dict(row))
    return {"message": "Entry submitted successfully", "entry": finalized_entry}


@router.post("/submit-all")
async def submit_all_entries(
    body: dict[str, Any],
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(get_current_user),
):
    project_id = body.get("projectId")
    entry_date = body.get("entryDate")
    edit_reason = body.get("editReason")
    user_id = current_user["userId"]
    
    if not project_id or not entry_date:
        raise HTTPException(400, detail={"message": "Missing projectId or entryDate"})
        
    project_object_id = await resolve_project_id(project_id, pool)
    
    try:
        dt_entry = datetime.strptime(entry_date, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(400, detail={"message": "Invalid entryDate format"})
        
    rows = await pool.fetch(
        "SELECT id, status, sheet_type, data_json FROM dpr_supervisor_entries WHERE project_id = $1 AND supervisor_id = $2 AND status = 'draft'",
        project_object_id, user_id
    )
    
    if not rows:
        return {"message": "No draft entries found to submit", "submittedCount": 0}
    
    # Filter: only submit drafts that have been actually modified (have real data rows)
    submittable = []
    skipped_sheets = []
    for r in rows:
        sheet_type = r["sheet_type"]
        # Skip summary/issues sheets - they don't need independent submission
        if sheet_type in ("summary", "wind_summary", "pss_summary"):
            skipped_sheets.append(sheet_type)
            continue
        
        dj = r["data_json"]
        if isinstance(dj, str):
            dj = json.loads(dj)
        
        data_rows = dj.get("rows", [])
        # Check if there are any rows with actual data
        # Note: after extract_to_history_array, todayValue/yesterdayValue are moved into
        # a 'history' array, so we must check for that format too.
        def row_has_data(row):
            if row.get("isCategoryHeading") or row.get("isCategoryRow"):
                return False
            # Flat format (fresh draft not yet saved)
            if row.get("activityId") or row.get("todayValue") or row.get("description"):
                return True
            # History array format (after save-draft converts fields)
            history = row.get("history")
            if isinstance(history, list) and any(
                float(h.get("actual", 0) or 0) > 0 for h in history
            ):
                return True
            # historyValues dict format
            hv = row.get("historyValues")
            if isinstance(hv, dict) and any(float(v or 0) > 0 for v in hv.values()):
                return True
            return False

        has_data = any(row_has_data(row) for row in data_rows)
        
        if has_data:
            submittable.append(r)
        else:
            skipped_sheets.append(sheet_type)
    
    if not submittable:
        return {"message": "No changed draft sheets found to submit", "submittedCount": 0}
        
    submitted_count = 0
    for r in submittable:
        await pool.execute("""
            UPDATE dpr_supervisor_entries 
            SET status = 'submitted_to_pm', submitted_at = CURRENT_TIMESTAMP, submitted_by = $2, updated_at = CURRENT_TIMESTAMP, entry_date = $3
            WHERE id = $1
        """, r["id"], user_id, dt_entry)
        submitted_count += 1
        
        await _save_snapshot(
            pool, r["id"], "submitted", r["data_json"],
            r["status"], "submitted_to_pm", user_id, edit_reason
        )
        
        await create_system_log(
            "SHEET_SUBMITTED", 
            user_id, 
            f"Sheet Entry: {r['id']}", 
            f"Bulk submitted {r['sheet_type']} sheet"
        )

    if skipped_sheets:
        logger.info(f"Global submit: skipped empty/unchanged sheets: {skipped_sheets}")

    # Write daily progress for all submitted entries
    for r in submittable:
        try:
            full_row = await pool.fetchrow("SELECT * FROM dpr_supervisor_entries WHERE id = $1", r["id"])
            if full_row:
                await _write_daily_progress_from_entry(pool, full_row, logger)
        except Exception as e:
            logger.error(f"Failed to write daily progress for entry {r['id']}: {e}")

    # Notify Site PM(s) assigned to this project — in-app notifications
    try:
        proj_name = await _get_project_name(pool, project_object_id)
        submitted_sheet_labels = [_format_sheet_type(r["sheet_type"]) for r in submittable]
        sheets_summary = ", ".join(submitted_sheet_labels[:3])
        if len(submitted_sheet_labels) > 3:
            sheets_summary += f" (+{len(submitted_sheet_labels) - 3} more)"
        date_label = _format_date(dt_entry)

        pms = await pool.fetch("""
            SELECT u.user_id, u.name, u.email 
            FROM users u
            JOIN project_assignments pa ON u.user_id = pa.user_id
            WHERE u.role = 'Site PM' AND pa.project_id = $1
        """, project_object_id)

        supervisor_name = current_user.get('name', current_user.get('email', 'Supervisor'))

        for pm in pms:
            await create_notification(
                pool, pm["user_id"], 
                "New DPR Submission", 
                f"{supervisor_name} submitted {submitted_count} sheet(s) [{sheets_summary}] for {proj_name} ({date_label})",
                "info", project_object_id, None, None
            )
    except Exception as e:
        logger.error(f"Failed to send global submit in-app notifications: {e}")

    # EMAIL NOTIFICATION TO SITE PMS & SUPER ADMIN
    try:
        from app.services.email_service import send_dpr_status_email, send_dpr_submission_email
        from app.config import settings

        pms = await pool.fetch("""
            SELECT u.name, u.email 
            FROM users u
            JOIN project_assignments pa ON u.user_id = pa.user_id
            WHERE u.role = 'Site PM' AND pa.project_id = $1
        """, project_object_id)
        proj = await pool.fetchval('SELECT "Name" FROM p6_projects WHERE "ObjectId" = $1', project_object_id)

        supervisor_name = current_user.get('name', current_user.get('email', 'Supervisor'))

        # Notify Super Admin
        if settings.SUPER_ADMIN_EMAIL:
            await send_dpr_status_email(
                settings.SUPER_ADMIN_EMAIL, "Super Admin", 
                f"{submitted_count} sheets", "Submitted to PM",
                proj or "Project", entry_date, 
                f"By Supervisor: {supervisor_name}"
            )

        # Notify Site PMs via email
        for pm in pms:
            if pm["email"]:
                await send_dpr_submission_email(
                    pm["email"], pm["name"], supervisor_name, 
                    proj or "Project", entry_date
                )
    except Exception as ee:
        logger.error(f"Global submission email notification failed: {ee}")

    await cache.flush_all()
    return {"message": f"Successfully submitted {submitted_count} entries", "submittedCount": submitted_count}



@router.get("/pm/debug-entries/{project_id}")
async def debug_entries(
    project_id: str,
    pool: PoolWrapper = Depends(get_db)
):
    try:
        from app.routers.project_utils import resolve_project_id
        resolved = await resolve_project_id(project_id, pool)
        
        # Raw dump from dpr_supervisor_entries
        raw_entries = await pool.fetch(
            "SELECT id, project_id, status, sheet_type, supervisor_id FROM dpr_supervisor_entries WHERE project_id = $1 ORDER BY updated_at DESC LIMIT 10",
            int(resolved) if isinstance(resolved, int) else 0
        )
        
        return {
            "requested_project_id": project_id,
            "resolved_object_id": resolved,
            "raw_db_entries": [dict(r) for r in raw_entries]
        }
    except Exception as e:
        return {"error": str(e)}

@router.get("/pm/entries")
async def get_entries_for_pm_review(
    projectId: Optional[str] = None,
    limit: int = 100,
    offset: int = 0,
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(get_current_user),
):
    user_role = current_user.get("role", "").strip().lower()
    if user_role not in ("site pm", "pmag", "super admin"):
        raise HTTPException(403, detail={"message": "Access denied"})

    cache_key = f"pm_entries_{current_user['userId']}_{projectId or 'all'}_{limit}_{offset}"
    # In-memory cache disabled to prevent multi-worker desync on VMs
    # cached = await cache.get(cache_key)
    # if cached:
    #     return cached

    valid_pid = projectId and str(projectId) not in ("null", "undefined", "")
    project_object_id = None
    if valid_pid:
        project_object_id = await resolve_project_id(projectId, pool)

    if project_object_id:
        if isinstance(project_object_id, list):
            rows = await pool.fetch("""
                SELECT dse.*, u.name as supervisor_name, u.email as supervisor_email, pm.name as pm_name
                FROM dpr_supervisor_entries dse 
                JOIN users u ON dse.supervisor_id = u.user_id
                LEFT JOIN users pm ON dse.pm_reviewed_by = pm.user_id
                WHERE dse.project_id = ANY($1::int[]) AND dse.status IN ('submitted_to_pm', 'approved_by_pm', 'rejected_by_pm', 'final_approved')
                ORDER BY dse.submitted_at DESC
                LIMIT $2 OFFSET $3
            """, project_object_id, limit, offset)
        else:
            rows = await pool.fetch("""
                SELECT dse.*, u.name as supervisor_name, u.email as supervisor_email, pm.name as pm_name
                FROM dpr_supervisor_entries dse 
                JOIN users u ON dse.supervisor_id = u.user_id
                LEFT JOIN users pm ON dse.pm_reviewed_by = pm.user_id
                WHERE dse.project_id = $1 AND dse.status IN ('submitted_to_pm', 'approved_by_pm', 'rejected_by_pm', 'final_approved')
                ORDER BY dse.submitted_at DESC
                LIMIT $2 OFFSET $3
            """, project_object_id, limit, offset)
    else:
        # When no projectId is specified, only show entries for projects assigned to this PM
        rows = await pool.fetch("""
            SELECT dse.*, u.name as supervisor_name, u.email as supervisor_email, pm.name as pm_name
            FROM dpr_supervisor_entries dse 
            JOIN users u ON dse.supervisor_id = u.user_id
            LEFT JOIN users pm ON dse.pm_reviewed_by = pm.user_id
            JOIN project_assignments pa ON pa.project_id = dse.project_id AND pa.user_id = $1
            WHERE dse.status IN ('submitted_to_pm', 'approved_by_pm', 'rejected_by_pm', 'final_approved')
            ORDER BY dse.submitted_at DESC
            LIMIT $2 OFFSET $3
        """, current_user["userId"], limit, offset)

    result = []
    for r in rows:
        entry = dict(r)
        # Flatten history array back to flat UI fields (todayValue, historyValues, etc.)
        # so ManpowerDetailsTable and graph components can read them
        if entry.get("data_json") and entry.get("entry_date"):
            try:
                dj = entry["data_json"]
                if isinstance(dj, str):
                    import json as _json
                    dj = _json.loads(dj)
                entry["data_json"] = flatten_history_array(dj, entry["entry_date"])
            except Exception as e:
                logger.warning(f"pm/entries: Failed to flatten history for entry {entry.get('id')}: {e}")
        result.append(entry)
    await cache.set(cache_key, result, 120)
    return result



@router.post("/pm/approve")
async def approve_entry_by_pm(
    body: dict[str, Any],
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(get_current_user),
):
    user_role = current_user.get("role", "").strip().lower()
    if user_role not in ("site pm", "super admin", "pmag"):
        raise HTTPException(403, detail={"message": "Only Site PM or Admins can approve entries"})

    entry_id = body.get("entryId")
    row = await pool.fetchrow("""
        UPDATE dpr_supervisor_entries SET status = 'approved_by_pm', pm_reviewed_at = CURRENT_TIMESTAMP,
        pm_reviewed_by = $2, updated_at = CURRENT_TIMESTAMP
        WHERE id = $1 AND status = 'submitted_to_pm' RETURNING *
    """, entry_id, current_user["userId"])

    if not row:
        raise HTTPException(404, detail={"message": "Entry not found or invalid status"})
        
    # Save snapshot
    await _save_snapshot(
        pool, entry_id, "approved_by_pm", row["data_json"],
        "submitted_to_pm", "approved_by_pm", current_user["userId"]
    )
    
    await create_system_log(
        "SHEET_APPROVED", 
        current_user["userId"], 
        f"Sheet Entry: {entry_id}", 
        f"Approved {row['sheet_type']} sheet"
    )
    
    await cache.flush_all()
    # Notify Supervisor and PMAG
    try:
        entry = dict(row)
        proj_name = await _get_project_name(pool, entry["project_id"])
        sheet_label = _format_sheet_type(entry['sheet_type'])
        date_label = _format_date(entry['entry_date'])
        # Notify Supervisor
        await create_notification(
            pool, entry["supervisor_id"], 
            "DPR Approved by PM", 
            f"Your {sheet_label} for {proj_name} ({date_label}) has been approved by Site PM.",
            "success", entry["project_id"], entry_id, entry["sheet_type"]
        )
        # Notify and Email PMAG
        pmags = await pool.fetch("""
            SELECT u.user_id, u.email, u.name 
            FROM users u
            JOIN pmag_project_assignments pa ON u.user_id = pa.user_id
            WHERE u.role = 'PMAG' AND pa.project_id = $1
        """, entry["project_id"])
        
        try:
            from app.services.email_service import send_dpr_status_email
            proj = await pool.fetchval('SELECT "Name" FROM p6_projects WHERE "ObjectId" = $1', entry["project_id"])
            for pmag in pmags:
                await create_notification(
                    pool, pmag["user_id"], 
                    "PM-Approved DPR", 
                    f"{sheet_label} for {proj_name} ({date_label}) approved by PM. Pending your review.",
                    "info", entry["project_id"], entry_id, entry["sheet_type"]
                )
                if pmag["email"]:
                    await send_dpr_status_email(
                        pmag["email"], pmag["name"], entry["sheet_type"], "Approved by PM (Pending PMAG Review)", 
                        proj or "Project", entry["entry_date"].isoformat(), f"Approved by PM: {current_user.get('name', '')}"
                    )
        except Exception as ee:
            logger.error(f"PMAG notification failed: {ee}")
            
        # EMAIL NOTIFICATION TO SUPERVISOR
        try:
            from app.services.email_service import send_dpr_status_email
            # Fetch supervisor info and project name
            sup = await pool.fetchrow("SELECT name, email FROM users WHERE user_id = $1", entry["supervisor_id"])
            if not proj:
                proj = await pool.fetchval('SELECT "Name" FROM p6_projects WHERE "ObjectId" = $1', entry["project_id"])
            if sup and sup["email"]:
                await send_dpr_status_email(
                    sup["email"], sup["name"], entry["sheet_type"], "Approved by PM", 
                    proj or "Project", entry["entry_date"].isoformat(), None
                )
        except Exception as ee:
            logger.error(f"Email notification failed: {ee}")
            
        # Notify Super Admin
        try:
            from app.config import settings
            if settings.SUPER_ADMIN_EMAIL:
                from app.services.email_service import send_dpr_status_email
                proj = await pool.fetchval('SELECT "Name" FROM p6_projects WHERE "ObjectId" = $1', entry["project_id"])
                await send_dpr_status_email(
                    settings.SUPER_ADMIN_EMAIL, "Super Admin", entry["sheet_type"], "Approved by PM",
                    proj or "Project", entry["entry_date"].isoformat(), f"Reviewer: {current_user['name']}"
                )
        except Exception as ee:
            logger.error(f"Super Admin email notification failed: {ee}")
    except Exception as e:
        logger.error(f"Failed to send PM approval notification: {e}")

    return {"message": "Entry approved successfully", "entry": dict(row)}


@router.put("/pm/update")
async def update_entry_by_pm(
    body: dict[str, Any],
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(get_current_user),
):
    user_role = current_user.get("role", "").strip().lower()
    if user_role not in ("site pm", "super admin", "pmag"):
        raise HTTPException(403, detail={"message": "Only Site PM can update entries"})

    entry_id = body.get("entryId")
    data = body.get("data")

    check = await pool.fetchrow(
        "SELECT * FROM dpr_supervisor_entries WHERE id = $1 AND status IN ('submitted_to_pm', 'rejected_by_pm')",
        entry_id,
    )
    if not check:
        raise HTTPException(404, detail={"message": "Entry not found or cannot be edited"})

    row = await pool.fetchrow(
        "UPDATE dpr_supervisor_entries SET data_json = $1, status = 'rejected_by_pm', updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *",
        json.dumps(data), entry_id,
    )
    
    # Notify Supervisor about the edit
    try:
        entry = dict(row)
        from app.services.email_service import send_dpr_status_email
        sup = await pool.fetchrow("SELECT name, email FROM users WHERE user_id = $1", entry["supervisor_id"])
        proj = await pool.fetchval('SELECT "Name" FROM p6_projects WHERE "ObjectId" = $1', entry["project_id"])
        if sup and sup["email"]:
            await send_dpr_status_email(
                sup["email"], sup["name"], entry["sheet_type"], "Edited by PM", 
                proj or "Project", entry["entry_date"].isoformat(), "Your DPR entry was modified by the Site PM."
            )
    except Exception as ee:
        logger.error(f"Email notification for PM edit failed: {ee}")
        
    await cache.flush_all()
    return {"message": "Entry updated successfully", "entry": dict(row)}


@router.put("/pmag/update")
async def update_entry_by_pmag(
    body: dict[str, Any],
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(get_current_user),
):
    user_role = current_user.get("role", "").strip().lower()
    if user_role not in ("site pm", "super admin", "pmag"):
        raise HTTPException(403, detail={"message": "Only Admins/PMAG can update entries"})

    entry_id = body.get("entryId")
    data = body.get("data")

    # PMAG/Admin can update even approved/final entries for correction
    check = await pool.fetchrow(
        "SELECT * FROM dpr_supervisor_entries WHERE id = $1",
        entry_id,
    )
    if not check:
        raise HTTPException(404, detail={"message": "Entry not found"})

    row = await pool.fetchrow(
        "UPDATE dpr_supervisor_entries SET data_json = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *",
        json.dumps(data), entry_id,
    )
    
    # Save snapshot for PMAG edit
    await _save_snapshot(
        pool, entry_id, "pmag_edit", data,
        check["status"], check["status"], current_user["userId"], "Corrected by PMAG"
    )
    
    # Notify Supervisor about the PMAG edit
    try:
        entry = dict(row)
        from app.services.email_service import send_dpr_status_email
        sup = await pool.fetchrow("SELECT name, email FROM users WHERE user_id = $1", entry["supervisor_id"])
        proj = await pool.fetchval('SELECT "Name" FROM p6_projects WHERE "ObjectId" = $1', entry["project_id"])
        if sup and sup["email"]:
            await send_dpr_status_email(
                sup["email"], sup["name"], entry["sheet_type"], "Edited by PMAG", 
                proj or "Project", entry["entry_date"].isoformat(), "Your DPR entry was modified by the PMAG."
            )
    except Exception as ee:
        logger.error(f"Email notification for PMAG edit failed: {ee}")
        
    await cache.flush_all()
    return {"message": "Entry updated successfully by PMAG", "entry": dict(row)}


@router.post("/pm/reject")
async def reject_entry_by_pm(
    body: dict[str, Any],
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(get_current_user),
):
    user_role = current_user.get("role", "").strip().lower()
    if user_role not in ("site pm", "super admin", "pmag"):
        raise HTTPException(403, detail={"message": "Only PM can reject entries"})

    entry_id = body.get("entryId")
    rejection_reason = body.get("rejectionReason")

    # Check for cell rejection comments
    try:
        comments_count = await pool.fetchval(
            "SELECT COUNT(*) FROM cell_comments WHERE sheet_id = $1 AND comment_type = 'REJECTION' AND is_deleted = FALSE",
            entry_id,
        )
        if comments_count == 0:
            raise HTTPException(400, detail={"message": "Please add rejection comments on specific cells before rejecting the sheet", "requiresComments": True})
    except Exception:
        pass

    row = await pool.fetchrow("""
        UPDATE dpr_supervisor_entries SET status = 'rejected_by_pm', rejection_reason = $2,
        pm_reviewed_at = CURRENT_TIMESTAMP, pm_reviewed_by = $3, updated_at = CURRENT_TIMESTAMP
        WHERE id = $1 AND status = 'submitted_to_pm' RETURNING *
    """, entry_id, rejection_reason, current_user["userId"])

    if not row:
        raise HTTPException(404, detail={"message": "Entry not found or invalid status"})

    # Save snapshot
    await _save_snapshot(
        pool, entry_id, "rejected_by_pm", row["data_json"],
        "submitted_to_pm", "rejected_by_pm", current_user["userId"], rejection_reason
    )

    await cache.flush_all()
    entry = dict(row)
    await create_system_log(
        "SHEET_REJECTED", current_user["userId"],
        f"Entry: {entry_id}, Project: {entry['project_id']}, Type: {entry['sheet_type']}",
        f"Entry {entry_id} ({entry['sheet_type']}) rejected by PM. Reason: {rejection_reason or 'No reason'}",
    )

    # Notify Supervisor
    proj_name = await _get_project_name(pool, entry["project_id"])
    sheet_label = _format_sheet_type(entry['sheet_type'])
    date_label = _format_date(entry['entry_date'])
    await create_notification(
        pool, entry["supervisor_id"], 
        "DPR Rejected by PM", 
        f"Your {sheet_label} for {proj_name} ({date_label}) was rejected. Reason: {rejection_reason or 'No reason provided'}",
        "error", entry["project_id"], entry_id, entry["sheet_type"]
    )
    
    # EMAIL NOTIFICATION
    try:
        from app.services.email_service import send_dpr_status_email
        sup = await pool.fetchrow("SELECT name, email FROM users WHERE user_id = $1", entry["supervisor_id"])
        proj = await pool.fetchval('SELECT "Name" FROM p6_projects WHERE "ObjectId" = $1', entry["project_id"])
        if sup and sup["email"]:
            await send_dpr_status_email(
                sup["email"], sup["name"], entry["sheet_type"], "Rejected by PM", 
                proj or "Project", entry["entry_date"].isoformat(), rejection_reason
            )
    except Exception as ee:
        logger.error(f"Email notification failed: {ee}")
        
    # Notify Super Admin
    try:
        from app.config import settings
        if settings.SUPER_ADMIN_EMAIL:
            from app.services.email_service import send_dpr_status_email
            proj = await pool.fetchval('SELECT "Name" FROM p6_projects WHERE "ObjectId" = $1', entry["project_id"])
            await send_dpr_status_email(
                settings.SUPER_ADMIN_EMAIL, "Super Admin", entry["sheet_type"], "Rejected by PM",
                proj or "Project", entry["entry_date"].isoformat(), f"Reason: {rejection_reason}"
            )
    except Exception as ee:
        logger.error(f"Super Admin email notification failed: {ee}")
    except Exception as e:
        logger.error(f"Failed to send rejection notification: {e}")

    return {"message": "Entry rejected and sent back to Supervisor", "entry": entry}


@router.get("/entry/{entry_id}")
async def get_entry_by_id(
    entry_id: int,
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(get_current_user),
):
    row = await pool.fetchrow("""
        SELECT dse.*, u.name as supervisor_name
        FROM dpr_supervisor_entries dse JOIN users u ON dse.supervisor_id = u.user_id
        WHERE dse.id = $1
    """, entry_id)

    if not row:
        raise HTTPException(404, detail={"message": "Entry not found"})

    if current_user["role"] == "supervisor" and row["supervisor_id"] != current_user["userId"]:
        raise HTTPException(403, detail={"message": "Access denied"})

    return await _finalize_entry(pool, dict(row))


@router.get("/pmag/entries")
async def get_entries_for_pmag_review(
    projectId: Optional[str] = None,
    limit: int = 100,
    offset: int = 0,
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(get_current_user),
):
    if current_user["role"] != "PMAG":
        raise HTTPException(403, detail={"message": "Access denied"})

    cache_key = f"pmag_entries_{current_user['role']}_{projectId or 'all'}_{limit}_{offset}"
    # In-memory cache disabled to prevent multi-worker desync on VMs
    # cached = await cache.get(cache_key)
    # if cached:
    #     return cached

    valid_pid = projectId and str(projectId) not in ("null", "undefined", "")
    project_object_id = None
    if valid_pid:
        project_object_id = await resolve_project_id(projectId, pool)

    if project_object_id:
        if isinstance(project_object_id, list):
            rows = await pool.fetch("""
                SELECT dse.*, u.name as supervisor_name, u.email as supervisor_email, pm.name as pm_name
                FROM dpr_supervisor_entries dse 
                JOIN users u ON dse.supervisor_id = u.user_id
                LEFT JOIN users pm ON dse.pm_reviewed_by = pm.user_id
                WHERE dse.project_id = ANY($1::int[]) AND dse.status IN ('approved_by_pm', 'final_approved')
                  AND dse.pushed_at IS NULL
                ORDER BY dse.updated_at DESC
                LIMIT $2 OFFSET $3
            """, project_object_id, limit, offset)
        else:
            rows = await pool.fetch("""
                SELECT dse.*, u.name as supervisor_name, u.email as supervisor_email, pm.name as pm_name
                FROM dpr_supervisor_entries dse 
                JOIN users u ON dse.supervisor_id = u.user_id
                LEFT JOIN users pm ON dse.pm_reviewed_by = pm.user_id
                WHERE dse.project_id = $1 AND dse.status IN ('approved_by_pm', 'final_approved')
                  AND dse.pushed_at IS NULL
                ORDER BY dse.updated_at DESC
                LIMIT $2 OFFSET $3
            """, project_object_id, limit, offset)
    else:
        rows = await pool.fetch("""
            SELECT dse.*, u.name as supervisor_name, u.email as supervisor_email
            FROM dpr_supervisor_entries dse JOIN users u ON dse.supervisor_id = u.user_id
            WHERE dse.status IN ('approved_by_pm', 'final_approved')
              AND dse.pushed_at IS NULL
            ORDER BY dse.updated_at DESC
            LIMIT $1 OFFSET $2
        """, limit, offset)

    result = [dict(r) for r in rows]
    await cache.set(cache_key, result, 120)
    return result


@router.get("/pmag-history")
async def get_entries_history_for_pmag(
    projectId: Optional[str] = None,
    days: Optional[int] = None,
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(get_current_user),
):
    user_role = current_user.get("role", "").strip().lower()
    if user_role not in ("site pm", "super admin", "pmag"):
        raise HTTPException(403, detail={"message": "Access denied"})

    params = []
    conditions = ["dse.status IN ('approved_by_pm', 'final_approved')"]
    idx = 1

    if projectId:
        project_object_id = await resolve_project_id(projectId, pool)
        if isinstance(project_object_id, list):
            conditions.append(f"dse.project_id = ANY(${idx}::int[])")
        else:
            conditions.append(f"dse.project_id = ${idx}")
        params.append(project_object_id)
        idx += 1
    if days:
        conditions.append(f"dse.updated_at >= NOW() - INTERVAL '{int(days)} days'")

    where = " AND ".join(conditions)
    rows = await pool.fetch(f"""
        SELECT dse.*, u.name as supervisor_name, u.email as supervisor_email
        FROM dpr_supervisor_entries dse JOIN users u ON dse.supervisor_id = u.user_id
        WHERE {where} ORDER BY dse.updated_at DESC
    """, *params)

    result = []
    for r in rows:
        entry = dict(r)
        if entry.get("data_json") and entry.get("entry_date"):
            try:
                dj = entry["data_json"]
                if isinstance(dj, str):
                    import json as _json
                    dj = _json.loads(dj)
                entry["data_json"] = flatten_history_array(dj, entry["entry_date"])
            except Exception as e:
                logger.warning(f"pmag-history: Failed to flatten history for entry {entry.get('id')}: {e}")
        result.append(entry)
    return result



@router.get("/pmag-archived")
async def get_archived_entries_for_pmag(
    projectId: Optional[str] = None,
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(get_current_user),
):
    if current_user["role"] != "PMAG":
        raise HTTPException(403, detail={"message": "Access denied"})

    if projectId:
        project_object_id = await resolve_project_id(projectId, pool)
        if isinstance(project_object_id, list):
            rows = await pool.fetch("""
                SELECT dse.*, u.name as supervisor_name, u.email as supervisor_email
                FROM dpr_supervisor_entries dse JOIN users u ON dse.supervisor_id = u.user_id
                WHERE dse.project_id = ANY($1::int[]) AND dse.status = 'final_approved'
                  AND dse.updated_at < CURRENT_TIMESTAMP - INTERVAL '7 days'
                ORDER BY dse.updated_at DESC
            """, project_object_id)
        else:
            rows = await pool.fetch("""
                SELECT dse.*, u.name as supervisor_name, u.email as supervisor_email
                FROM dpr_supervisor_entries dse JOIN users u ON dse.supervisor_id = u.user_id
                WHERE dse.project_id = $1 AND dse.status = 'final_approved'
                  AND dse.updated_at < CURRENT_TIMESTAMP - INTERVAL '7 days'
                ORDER BY dse.updated_at DESC
            """, project_object_id)
    else:
        rows = await pool.fetch("""
            SELECT dse.*, u.name as supervisor_name, u.email as supervisor_email
            FROM dpr_supervisor_entries dse JOIN users u ON dse.supervisor_id = u.user_id
            WHERE dse.status = 'final_approved' AND dse.updated_at < CURRENT_TIMESTAMP - INTERVAL '7 days'
            ORDER BY dse.updated_at DESC
        """)

    return [dict(r) for r in rows]


@router.post("/pmag/approve")
async def approve_entry_by_pmag(
    body: dict[str, Any],
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(get_current_user),
):
    if current_user["role"] != "PMAG":
        raise HTTPException(403, detail={"message": "Only PMAG can approve entries"})

    entry_id = body.get("entryId")
    row = await pool.fetchrow("""
        UPDATE dpr_supervisor_entries SET status = 'final_approved', pm_reviewed_at = CURRENT_TIMESTAMP,
        pm_reviewed_by = $2, updated_at = CURRENT_TIMESTAMP
        WHERE id = $1 AND status = 'approved_by_pm' RETURNING *
    """, entry_id, current_user["userId"])

    if not row:
        raise HTTPException(404, detail={"message": "Entry not found or invalid status"})
        
    # Save snapshot
    await _save_snapshot(
        pool, entry_id, "final_approved", row["data_json"],
        "approved_by_pm", "final_approved", current_user["userId"]
    )
    
    await cache.flush_all()
    # Notify Supervisor and PM(s)
    try:
        entry = dict(row)
        proj_name = await _get_project_name(pool, entry["project_id"])
        sheet_label = _format_sheet_type(entry['sheet_type'])
        date_label = _format_date(entry['entry_date'])
        # Notify Supervisor
        await create_notification(
            pool, entry["supervisor_id"], 
            "DPR Final Approved", 
            f"Your {sheet_label} for {proj_name} ({date_label}) has received final approval from PMAG.",
            "success", entry["project_id"], entry_id, entry["sheet_type"]
        )
        # Notify Site PM(s)
        pms = await pool.fetch("SELECT user_id, name, email FROM users WHERE role = 'Site PM'")
        for pm in pms:
            await create_notification(
                pool, pm["user_id"], 
                "DPR Final Approved", 
                f"{sheet_label} for {proj_name} ({date_label}) has been given final approval by PMAG.",
                "success", entry["project_id"], entry_id, entry["sheet_type"]
            )
            
        # EMAIL NOTIFICATION
        try:
            from app.services.email_service import send_dpr_status_email
            sup = await pool.fetchrow("SELECT name, email FROM users WHERE user_id = $1", entry["supervisor_id"])
            proj = await pool.fetchval('SELECT "Name" FROM p6_projects WHERE "ObjectId" = $1', entry["project_id"])
            if sup and sup["email"]:
                await send_dpr_status_email(
                    sup["email"], sup["name"], entry["sheet_type"], "Final Approved", 
                    proj or "Project", entry["entry_date"].isoformat(), None
                )
            for pm in pms:
                if pm["email"]:
                    await send_dpr_status_email(
                        pm["email"], pm["name"], entry["sheet_type"], "Final Approved (by PMAG)", 
                        proj or "Project", entry["entry_date"].isoformat(), None
                    )
        except Exception as ee:
            logger.error(f"Email notification failed: {ee}")
            
        # Notify Super Admin
        try:
            from app.config import settings
            if settings.SUPER_ADMIN_EMAIL:
                from app.services.email_service import send_dpr_status_email
                proj = await pool.fetchval('SELECT "Name" FROM p6_projects WHERE "ObjectId" = $1', entry["project_id"])
                await send_dpr_status_email(
                    settings.SUPER_ADMIN_EMAIL, "Super Admin", entry["sheet_type"], "Final Approved by PMAG",
                    proj or "Project", entry["entry_date"].isoformat(), f"Reviewer: {current_user['name']}"
                )
        except Exception as ee:
            logger.error(f"Super Admin email notification failed: {ee}")
    except Exception as e:
        logger.error(f"Failed to send PMAG approval notification: {e}")

    return {"message": "Entry approved by PMAG successfully", "entry": dict(row)}


@router.post("/pmag-push-to-p6")
async def push_to_p6(
    body: dict[str, Any],
    background_tasks: BackgroundTasks,
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(get_current_user),
):
    from app.config import get_p6_password_last_reset_date
    last_reset = get_p6_password_last_reset_date()
    if last_reset:
        try:
            reset_date = datetime.strptime(last_reset, "%Y-%m-%d").date()
            if (datetime.now().date() - reset_date).days >= 45:
                raise HTTPException(status_code=403, detail="P6 integration password has expired and needs to be upgraded. Sorry for the inconvenience, we will clear this issue soon.")
        except Exception as e:
            if isinstance(e, HTTPException): raise e

    user_role = current_user.get("role", "").strip().lower()
    if user_role not in ("pmag", "super admin", "supervisor", "site pm"):
        raise HTTPException(403, detail={"message": "You are not authorized to push to P6"})

    entry_id = body.get("entryId")
    dry_run = body.get("dryRun", False)

    # Verify entry exists and has correct status
    entry = await pool.fetchrow("""
        SELECT id, project_id, status, sheet_type FROM dpr_supervisor_entries WHERE id = $1
    """, entry_id)

    if not entry:
        raise HTTPException(404, detail={"message": "Entry not found"})

    if entry["status"] not in ("approved_by_pm", "final_approved"):
        raise HTTPException(400, detail={"message": f"Entry status '{entry['status']}' is not eligible for P6 push. Must be 'approved_by_pm' or 'final_approved'."})

    # Check if sheet type supports P6 push
    supported_sheets = ["dp_vendor_idt", "dp_vendor_block", "dc_sheet", "ac_sheet", "manpower_details", "dp_qty", "dp_block", "wind_progress", "pss_progress",
                        "bess_civil", "bess_electrical", "bess_bop", "bess_testing", "bess_dp_qty", "bess_manpower"]
    if entry["sheet_type"] not in supported_sheets:
        raise HTTPException(400, detail={"message": f"Sheet type '{entry['sheet_type']}' does not support pushing to P6. Supported: {', '.join(supported_sheets)}"})

    try:
        from app.services.p6_push_service import push_approved_entry_to_p6
        result = await push_approved_entry_to_p6(pool, entry_id, current_user["userId"], dry_run=dry_run)
    except Exception as e:
        logger.error(f"P6 Push Error Traceback: {e}", exc_info=True)
        raise HTTPException(500, detail={"message": f"P6 push failed due to internal error: {str(e)}"})

    # Update entry status if push was successful and not dry run
    if result["success"] and not dry_run:
        row = await pool.fetchrow("""
            UPDATE dpr_supervisor_entries
            SET status = 'final_approved', pushed_at = CURRENT_TIMESTAMP,
                pushed_by = $2, updated_at = CURRENT_TIMESTAMP
            WHERE id = $1 RETURNING *
        """, entry_id, current_user["userId"])
        
        if row:
            # Save snapshot
            await _save_snapshot(
                pool, entry_id, "pushed_to_p6", row["data_json"],
                entry["status"], "final_approved", current_user["userId"], "Pushed to P6"
            )
            
            await create_system_log(
                "PUSH_TO_P6", 
                current_user["userId"], 
                f"Sheet Entry: {entry_id}", 
                f"Pushed {entry['sheet_type']} sheet to P6"
            )
            
        await cache.flush_all()
        
        # Trigger background sync after successful push
        from sync_all_p6_data import sync_data
        background_tasks.add_task(sync_data, target_project_id=str(entry["project_id"]), full_sync=False, pool=pool)

    return {
        "message": "P6 push completed" if result["success"] else "P6 push completed with errors",
        "result": result
    }

@router.get("/pmag-push-status/{entry_id}")
async def get_push_status(entry_id: int):
    from app.services.p6_push_service import push_statuses
    status = push_statuses.get(entry_id)
    if not status:
        return {"is_pushing": False, "progress": 0, "total": 0, "message": "No active push operation found."}
    return status


# ── Snapshot Endpoints ─────────────────────────────────────────────

@router.get("/push-history/{project_id}")
async def get_push_history(
    project_id: str,
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(get_current_user),
):
    """Get all pushed entries for a project with audit summary."""
    project_oid = await resolve_project_id(project_id, pool)
    if isinstance(project_oid, list):
        where_cond = "e.project_id = ANY($1::int[])"
    else:
        where_cond = "e.project_id = $1"
        
    rows = await pool.fetch(f"""
        SELECT e.id as entry_id, e.sheet_type, e.entry_date, e.pushed_at,
               e.status, u_push.name as pushed_by_name, u_sup.name as supervisor_name,
               COALESCE(pa.success_count, 0) as activities_pushed,
               COALESCE(pa.failed_count, 0) as activities_failed,
               COALESCE(pa.skipped_count, 0) as activities_skipped
        FROM dpr_supervisor_entries e
        LEFT JOIN users u_push ON e.pushed_by = u_push.user_id
        LEFT JOIN users u_sup ON e.supervisor_id = u_sup.user_id
        LEFT JOIN LATERAL (
            SELECT 
                COUNT(*) FILTER (WHERE push_status = 'success') as success_count,
                COUNT(*) FILTER (WHERE push_status = 'failed') as failed_count,
                COUNT(*) FILTER (WHERE push_status = 'skipped') as skipped_count
            FROM push_audit WHERE entry_id = e.id
        ) pa ON true
        WHERE {where_cond} AND e.status = 'final_approved' AND e.pushed_at IS NOT NULL
        ORDER BY e.pushed_at DESC
        LIMIT 200
    """, project_oid)
    return [dict(r) for r in rows]


@router.get("/push-audit-detail/{entry_id}")
async def get_push_audit_detail(
    entry_id: int,
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(get_current_user),
):
    """Get detailed push audit log for a specific entry."""
    rows = await pool.fetch("""
        SELECT pa.id, pa.activity_object_id, sa.activity_id, sa.name as activity_name,
               pa.field_name, pa.old_value, pa.new_value, pa.push_status,
               pa.error_message, pa.pushed_at
        FROM push_audit pa
        LEFT JOIN solar_activities sa ON pa.activity_object_id = sa.object_id
        WHERE pa.entry_id = $1
        ORDER BY pa.pushed_at ASC
    """, entry_id)
    return [dict(r) for r in rows]


@router.get("/push-comparison")
async def get_push_comparison(
    project_id: str,
    date_from: str,
    date_to: str,
    sheet_type: Optional[str] = None,
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(get_current_user),
):
    """Compare progress between two dates for a project."""
    from datetime import date as dt_date
    project_oid = await resolve_project_id(project_id, pool)
    d_from = datetime.strptime(date_from, "%Y-%m-%d").date()
    d_to = datetime.strptime(date_to, "%Y-%m-%d").date()

    if isinstance(project_oid, list):
        base_filter = "sa.project_object_id = ANY($1::int[])"
    else:
        base_filter = "sa.project_object_id = $1"
    params_from = [project_oid, d_from]
    params_to = [project_oid, d_to]
    
    if sheet_type:
        base_filter += " AND dp.sheet_type = $3"
        params_from.append(sheet_type)
        params_to.append(sheet_type)

    from_rows = await pool.fetch(f"""
        SELECT sa.activity_id, sa.name as activity_name,
               SUM(dp.today_value) as today_value,
               SUM(dp.cumulative_value) as cumulative_value
        FROM dpr_daily_progress dp
        JOIN solar_activities sa ON dp.activity_object_id = sa.object_id AND dp.activity_source = 'p6'
        WHERE {base_filter} AND dp.progress_date = $2
        GROUP BY sa.activity_id, sa.name
    """, *params_from)

    to_rows = await pool.fetch(f"""
        SELECT sa.activity_id, sa.name as activity_name,
               SUM(dp.today_value) as today_value,
               SUM(dp.cumulative_value) as cumulative_value
        FROM dpr_daily_progress dp
        JOIN solar_activities sa ON dp.activity_object_id = sa.object_id AND dp.activity_source = 'p6'
        WHERE {base_filter} AND dp.progress_date = $2
        GROUP BY sa.activity_id, sa.name
    """, *params_to)

    from_map = {r["activity_id"]: dict(r) for r in from_rows}
    to_map = {r["activity_id"]: dict(r) for r in to_rows}
    
    all_ids = set(from_map.keys()) | set(to_map.keys())
    result = []
    for aid in sorted(all_ids):
        f = from_map.get(aid, {})
        t = to_map.get(aid, {})
        f_cum = float(f.get("cumulative_value") or 0)
        t_cum = float(t.get("cumulative_value") or 0)
        result.append({
            "activity_id": aid,
            "activity_name": f.get("activity_name") or t.get("activity_name") or aid,
            "from_cumulative": f_cum,
            "to_cumulative": t_cum,
            "variance": round(t_cum - f_cum, 2),
            "from_today": float(f.get("today_value") or 0),
            "to_today": float(t.get("today_value") or 0),
        })
    return result


@router.get("/push-analytics/{project_id}")
async def get_push_analytics(
    project_id: str,
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(get_current_user),
):
    """Aggregated analytics for P6 pushes."""
    project_oid = await resolve_project_id(project_id, pool)

    # Push timeline (last 30 days)
    timeline = await pool.fetch("""
        SELECT pushed_at::date as push_date, COUNT(*) as push_count
        FROM dpr_supervisor_entries
        WHERE project_id = $1 AND pushed_at IS NOT NULL
          AND pushed_at >= CURRENT_DATE - INTERVAL '30 days'
        GROUP BY 1 ORDER BY 1
    """, project_oid)

    # Sheet breakdown
    breakdown = await pool.fetch("""
        SELECT sheet_type, COUNT(*) as total_pushed, MAX(pushed_at) as last_pushed
        FROM dpr_supervisor_entries
        WHERE project_id = $1 AND status = 'final_approved' AND pushed_at IS NOT NULL
        GROUP BY sheet_type ORDER BY total_pushed DESC
    """, project_oid)

    # Cumulative progress trend (daily progress sum over last 30 days)
    progress_trend = await pool.fetch("""
        SELECT dp.progress_date, SUM(dp.cumulative_value) as total_cumulative,
               COUNT(DISTINCT dp.activity_object_id) as activity_count
        FROM dpr_daily_progress dp
        JOIN solar_activities sa ON dp.activity_object_id = sa.object_id AND dp.activity_source = 'p6'
        WHERE sa.project_object_id = $1
          AND dp.progress_date >= CURRENT_DATE - INTERVAL '30 days'
        GROUP BY dp.progress_date ORDER BY dp.progress_date
    """, project_oid)

    # Success rate from push_audit
    rate = await pool.fetchrow("""
        SELECT 
            COUNT(*) FILTER (WHERE pa.push_status = 'success') as success,
            COUNT(*) FILTER (WHERE pa.push_status = 'failed') as failed,
            COUNT(*) FILTER (WHERE pa.push_status NOT IN ('success','failed')) as skipped
        FROM push_audit pa
        JOIN dpr_supervisor_entries e ON pa.entry_id = e.id
        WHERE e.project_id = $1
    """, project_oid)

    return {
        "push_timeline": [{"date": str(r["push_date"]), "count": int(r["push_count"])} for r in timeline],
        "sheet_breakdown": [{"sheet_type": r["sheet_type"], "total_pushed": int(r["total_pushed"]), "last_pushed": r["last_pushed"].isoformat() if r["last_pushed"] else None} for r in breakdown],
        "cumulative_progress": [{"date": str(r["progress_date"]), "total_cumulative": float(r["total_cumulative"] or 0), "activity_count": int(r["activity_count"])} for r in progress_trend],
        "success_rate": {"success": int(rate["success"] or 0), "failed": int(rate["failed"] or 0), "skipped": int(rate["skipped"] or 0)} if rate else {"success": 0, "failed": 0, "skipped": 0}
    }


@router.post("/pmag-reject")
async def reject_entry_by_pmag(
    body: dict[str, Any],
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(get_current_user),
):
    user_role = current_user.get("role", "").strip().lower()
    if user_role not in ("site pm", "pmag", "super admin"):
        raise HTTPException(403, detail={"message": "Only PM or Admins can reject entries"})

    entry_id = body.get("entryId")
    rejection_reason = body.get("rejectionReason")

    row = await pool.fetchrow("""
        UPDATE dpr_supervisor_entries SET status = 'submitted_to_pm', rejection_reason = $2,
        updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND status = 'approved_by_pm' RETURNING *
    """, entry_id, rejection_reason)

    if not row:
        raise HTTPException(404, detail={"message": "Entry not found or invalid status"})

    # Save snapshot
    await _save_snapshot(
        pool, entry_id, "rejected_by_pmag", row["data_json"],
        "approved_by_pm", "submitted_to_pm", current_user["userId"], rejection_reason
    )

    await cache.flush_all()
    return {"message": "Entry rejected and sent back to PM", "entry": dict(row)}


@router.get("/entry/{entry_id}/snapshots")
async def get_entry_snapshots(
    entry_id: int,
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(get_current_user),
):
    """Get the version history of a specific DPR entry."""
    # First verify access
    entry = await pool.fetchrow("SELECT supervisor_id, project_id FROM dpr_supervisor_entries WHERE id = $1", entry_id)
    if not entry:
        raise HTTPException(404, detail={"message": "Entry not found"})
        
    if current_user["role"] == "supervisor" and entry["supervisor_id"] != current_user["userId"]:
        raise HTTPException(403, detail={"message": "Access denied"})

    rows = await pool.fetch("""
        SELECT s.id, s.version, s.action, s.status_before, s.status_after, 
               s.remarks, s.created_at, u.name as performed_by_name
        FROM dpr_entry_snapshots s
        LEFT JOIN users u ON s.performed_by = u.user_id
        WHERE s.entry_id = $1
        ORDER BY s.version DESC
    """, entry_id)

    return [dict(r) for r in rows]


@router.get("/entry/{entry_id}/snapshot/{version}")
async def get_entry_snapshot_data(
    entry_id: int,
    version: int,
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(get_current_user),
):
    """Get the full data_json for a specific version of a DPR entry."""
    entry = await pool.fetchrow("SELECT supervisor_id FROM dpr_supervisor_entries WHERE id = $1", entry_id)
    if not entry:
        raise HTTPException(404, detail={"message": "Entry not found"})
        
    if current_user["role"] == "supervisor" and entry["supervisor_id"] != current_user["userId"]:
        raise HTTPException(403, detail={"message": "Access denied"})

    row = await pool.fetchrow("""
        SELECT data_json FROM dpr_entry_snapshots
        WHERE entry_id = $1 AND version = $2
    """, entry_id, version)

    if not row:
        raise HTTPException(404, detail={"message": f"Version {version} not found for entry {entry_id}"})

    return {"data": row["data_json"]}
