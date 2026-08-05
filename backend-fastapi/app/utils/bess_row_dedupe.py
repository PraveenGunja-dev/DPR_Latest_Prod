"""
Collapse duplicated rows in BESS standalone-grid drafts.

WHY THIS EXISTS
---------------
/dpr-supervisor/save-draft merges posted rows into the stored draft keyed on
activityId / id / description / activities (get_row_key in
app/routers/dpr_supervisor.py). The BESS Productivity, Charging Schedule and
Summary sheets carry none of those - their activity name lives in `activity` -
so every row keyed to nothing and took the "append new row" branch. Each
autosave re-appended the whole grid, which compounds:

    click Add Row  ->    50 rows in memory
    autosave       ->  stored    0 +  50 =  50
    autosave       ->  stored   50 +  50 = 100
    autosave       ->  stored  100 + 100 = 200 ...

One production draft reached 1,296,000 rows this way.

The frontend now saves these sheets whole (isPartial=false) so no new
duplication occurs. This module cleans up what was already written.

THE RULES
---------
Two passes, both of which keep anything a supervisor typed:

  1. Section pass - a category row plus the rows beneath it form a section.
     A section that repeats is dropped when it is an exact copy of one already
     kept, or when it is empty and another copy holds data.

  2. Row pass - for drafts saved before category rows were stored (the old
     delta save stripped them), the same rule is applied row by row. Category
     rows are never dropped here, so section structure survives; a header left
     with no rows under it is removed at the end.

Two copies that hold DIFFERENT typed values are BOTH kept. Clicking Add Row
twice to get 96 activities is a supported workflow, so the cleanup never merges
copies a user filled in differently and never discards a value. Worst case it
leaves a duplicate behind for a human to look at - `variants` in the returned
stats counts those.
"""

import json

# Keys describing a row's place in the checklist rather than anything the
# supervisor typed. Copies of the same checklist always agree on these.
STRUCTURAL_KEYS = {"activity", "sr", "isCategoryRow", "_cellStatuses", "_isCustom", "_key"}

# The sheets that store a standalone manual grid (no P6 rows to overlay onto).
BESS_STANDALONE_SHEETS = ("bess_productivity", "bess_charging_schedule", "bess_summary")


# ── Value helpers ──────────────────────────────────────────────────────────

def _is_blank(value) -> bool:
    if value is None:
        return True
    if isinstance(value, str):
        return value.strip() == ""
    if isinstance(value, (dict, list)):
        return len(value) == 0
    return False


def _typed_values(row) -> dict:
    """The values a supervisor could have entered, with blanks stripped out."""
    if not isinstance(row, dict):
        return {}
    out = {}
    for key, value in row.items():
        if key in STRUCTURAL_KEYS:
            continue
        if isinstance(value, dict):
            inner = {k: v for k, v in value.items() if not _is_blank(v)}
            if inner:
                out[key] = inner
        elif not _is_blank(value):
            out[key] = value
    return out


def _dump(value) -> str:
    return json.dumps(value, sort_keys=True, default=str)


# ── Generic collapse ───────────────────────────────────────────────────────

def _collapse(items, identity_of, content_of, is_empty_of):
    """
    Keep the first of each identity, drop redundant copies, and upgrade a kept
    empty copy when a later copy of the same identity holds data.
    Returns (kept, dropped, upgraded, variants).
    """
    kept = []
    groups: dict = {}          # identity -> list of [content, index in kept, empty]
    dropped = upgraded = variants = 0

    for item in items:
        identity = identity_of(item)
        content = content_of(item)
        empty = is_empty_of(item)
        group = groups.setdefault(identity, [])

        # An exact copy of something already kept carries no information.
        if any(entry[0] == content for entry in group):
            dropped += 1
            continue

        # An empty copy alongside any other copy of the same thing.
        if empty and group:
            dropped += 1
            continue

        # Data arriving where only an empty copy was kept: upgrade in place.
        if not empty and len(group) == 1 and group[0][2]:
            index = group[0][1]
            kept[index] = item
            group[0] = [content, index, False]
            upgraded += 1
            continue

        # A genuinely different copy - may be intentional, so keep and flag it.
        if group:
            variants += 1
        kept.append(item)
        group.append([content, len(kept) - 1, empty])

    return kept, dropped, upgraded, variants


# ── Section (chunk) pass ───────────────────────────────────────────────────

def _split_sections(rows):
    """
    Split rows into (preamble, sections). A section is a category row plus every
    row under it. Rows before the first category row are kept as the preamble.
    """
    preamble: list = []
    sections: list = []
    current = None

    for row in rows:
        if isinstance(row, dict) and row.get("isCategoryRow"):
            if current:
                sections.append(current)
            current = [row]
        elif current is None:
            preamble.append(row)
        else:
            current.append(row)

    if current:
        sections.append(current)
    return preamble, sections


def _section_identity(section) -> str:
    header = section[0].get("activity") if isinstance(section[0], dict) else ""
    members = [
        (r.get("sr"), r.get("activity")) if isinstance(r, dict) else (None, None)
        for r in section[1:]
    ]
    return _dump([header, members])


def _section_content(section) -> str:
    return _dump([_typed_values(r) for r in section])


def _section_is_empty(section) -> bool:
    return all(not _typed_values(r) for r in section)


# ── Row pass ───────────────────────────────────────────────────────────────

def _row_identity(row) -> str:
    if not isinstance(row, dict):
        return _dump(row)
    if row.get("_key"):
        return _dump(["k", row["_key"]])
    return _dump(["a", row.get("activity"), row.get("sr")])


def _row_content(row) -> str:
    return _dump(_typed_values(row))


def _row_is_empty(row) -> bool:
    return not _typed_values(row)


def _collapse_rows(rows):
    """
    Row-level pass that leaves category rows alone, so section structure holds.
    """
    category_indexes = [
        i for i, r in enumerate(rows) if isinstance(r, dict) and r.get("isCategoryRow")
    ]
    if len(category_indexes) == len(rows):
        return list(rows), 0, 0, 0

    # Collapse only the non-category rows, then splice the headers back in at
    # their original relative positions.
    result: list = []
    buffer: list = []
    dropped = upgraded = variants = 0

    def flush():
        nonlocal dropped, upgraded, variants
        if not buffer:
            return
        kept, d, u, v = _collapse(buffer, _row_identity, _row_content, _row_is_empty)
        result.extend(kept)
        dropped += d
        upgraded += u
        variants += v
        buffer.clear()

    for row in rows:
        if isinstance(row, dict) and row.get("isCategoryRow"):
            flush()
            result.append(row)
        else:
            buffer.append(row)
    flush()

    return result, dropped, upgraded, variants


def _drop_headerless_sections(rows):
    """Remove category rows that ended up with no rows under them."""
    out = []
    for i, row in enumerate(rows):
        if isinstance(row, dict) and row.get("isCategoryRow"):
            nxt = rows[i + 1] if i + 1 < len(rows) else None
            if nxt is None or (isinstance(nxt, dict) and nxt.get("isCategoryRow")):
                continue
        out.append(row)
    return out


# ── Entry point ────────────────────────────────────────────────────────────

def dedupe_rows(rows):
    """
    Collapse duplicated rows.

    Returns (new_rows, stats). new_rows is None when nothing would change.
    """
    stats = {
        "rows_before": len(rows),
        "rows_after": len(rows),
        "sections_before": 0,
        "sections_after": 0,
        "dropped_sections": 0,
        "dropped_rows": 0,
        "upgraded": 0,
        "variants": 0,
    }
    if not isinstance(rows, list) or len(rows) < 2:
        return None, stats

    preamble, sections = _split_sections(rows)
    stats["sections_before"] = len(sections)
    stats["sections_after"] = len(sections)

    working = list(rows)
    if len(sections) >= 2:
        kept, dropped, upgraded, variants = _collapse(
            sections, _section_identity, _section_content, _section_is_empty
        )
        stats["sections_after"] = len(kept)
        stats["dropped_sections"] = dropped
        stats["upgraded"] += upgraded
        stats["variants"] += variants
        working = list(preamble)
        for section in kept:
            working.extend(section)

    working, dropped, upgraded, variants = _collapse_rows(working)
    stats["dropped_rows"] = dropped
    stats["upgraded"] += upgraded
    stats["variants"] += variants

    working = _drop_headerless_sections(working)
    stats["rows_after"] = len(working)

    if len(working) == len(rows):
        return None, stats
    return working, stats
