# app/percent_scale_migration.py
"""
One-off: put every stored draft's physical progress on the 0-100 scale.

Physical progress used to be written on two scales at once. The sheets stored the typed 0-100 cell
divided by 100 into `percentComplete` (P6's native fraction) while writing the same figure
unchanged into `completionPercentage`, and the read path then had to guess which scale it had been
handed - `num < 1 ? num * 100 : num` in utils/activityNaming.ts.

That guess could not be made correct, because both meanings of a bare 1 existed:

  * a draft stored 100% complete as exactly 1, and 1 is not below 1, so every finished activity
    read back as 1% - the "progress keeps flipping to 1" report;
  * anything under 1% stored below 0.01 and was multiplied on the way back, so a typed 0.99 came
    back as 99 and a typed 0.5 as 50.

The sheets now write 0-100 everywhere and the read path no longer guesses. This converts the
drafts written before that so they mean the same thing under the new rule.

Runs once, recorded in applied_data_migrations, and never raises: a failure here must not stop the
app from starting. Every entry it changes is copied to percent_scale_backup first, so any entry can
be restored with:

    UPDATE dpr_supervisor_entries e
    SET data_json = b.data_json
    FROM percent_scale_backup b
    WHERE e.id = b.entry_id AND e.id = <entry id>;

Once the sheets have been checked in the app, the backup table can be dropped.
"""

import json
import logging

logger = logging.getLogger("adani-flow.percent_scale")

PERCENT_SCALE_KEY = "percent_scale_0_100_v1"

# Fields that held the 0-1 fraction and now hold 0-100. `completionPercentage`, `progress` and
# `physicalProgress` were always 0-100 and are read-only here - they are what the ambiguous cases
# below are resolved against.
FRACTION_FIELDS = ("percentComplete", "physicalPercentComplete")
AUTHORITATIVE_FIELDS = ("completionPercentage", "progress", "physicalProgress")

# An entry with more rows than this is left alone and logged rather than parsed in the app process.
# One production draft reached 1,296,000 rows; materialising that here would cost about a gigabyte.
ROW_CAP = 200_000

# How close completed/scope must be to 1 before a stored bare 1 is read as "complete" rather than
# "one percent". Only used when nothing authoritative is on the row.
COMPLETE_RATIO = 0.995


def _as_float(value):
    """Parse a cell to float, tolerating "45", "45%", " 45 " and None."""
    if value is None or isinstance(value, bool):
        return None
    try:
        text = str(value).strip().replace("%", "").replace(",", "")
        if text == "" or text.lower() in ("none", "null"):
            return None
        return float(text)
    except (TypeError, ValueError):
        return None


def _authoritative_percent(row: dict):
    """The row's 0-100 figure from a field that was never on the fraction scale, if any."""
    for key in AUTHORITATIVE_FIELDS:
        value = _as_float(row.get(key))
        if value is not None and 0.0 <= value <= 100.0:
            return value
    return None


def _looks_complete(row: dict) -> bool:
    """True when completed/scope says this activity is finished.

    This is what resolves a stored bare 1, which is genuinely ambiguous on its own: the sheets
    wrote 100% as the fraction 1, but the Wind sheet already wrote 0-100, where 1 means 1%.
    """
    scope = _as_float(row.get("scope"))
    completed = _as_float(row.get("completed"))
    if completed is None:
        completed = _as_float(row.get("cumulative"))
    if completed is None:
        completed = _as_float(row.get("actual"))
    if scope is None or completed is None or scope <= 0:
        return False
    return (completed / scope) >= COMPLETE_RATIO


def convert_row(row: dict) -> bool:
    """
    Rescale one row's fraction fields in place. Returns True when something changed.

    Order matters. A row that carries an authoritative 0-100 figure is simply brought into line
    with it - no inference needed, and it keeps the two fields from disagreeing afterwards.
    """
    if not isinstance(row, dict):
        return False

    changed = False
    authoritative = _authoritative_percent(row)

    for key in FRACTION_FIELDS:
        if key not in row:
            continue
        current = _as_float(row.get(key))
        if current is None:
            continue

        if authoritative is not None:
            new_value = authoritative
        elif current > 1.0:
            # Already 0-100 (the Wind sheet, or a row rebuilt from the API). Leave it.
            continue
        elif current < 1.0:
            new_value = current * 100.0
        else:
            # Exactly 1: 100% under the old sheet write, 1% under the Wind write.
            new_value = 100.0 if _looks_complete(row) else 1.0

        new_value = round(max(0.0, min(100.0, new_value)), 2)
        if new_value != current:
            row[key] = new_value
            changed = True

    return changed


async def migrate_percent_scale(pool):
    """Convert every stored draft's progress fields to 0-100. Runs once; never raises."""
    try:
        await pool.execute("""
            CREATE TABLE IF NOT EXISTS applied_data_migrations (
                name VARCHAR(200) PRIMARY KEY,
                applied_at TIMESTAMPTZ DEFAULT NOW(),
                notes TEXT
            )
        """)

        already_applied = await pool.fetchval(
            "SELECT 1 FROM applied_data_migrations WHERE name = $1", PERCENT_SCALE_KEY
        )
        if already_applied:
            return

        await pool.execute("""
            CREATE TABLE IF NOT EXISTS percent_scale_backup (
                entry_id BIGINT PRIMARY KEY,
                sheet_type VARCHAR(50),
                rows_changed INTEGER,
                data_json JSONB,
                backed_up_at TIMESTAMPTZ DEFAULT NOW()
            )
        """)

        # Only entries that actually carry one of the fraction fields. Anything larger than ROW_CAP
        # is reported separately rather than parsed here.
        candidates = await pool.fetch(
            """
            SELECT id, sheet_type, jsonb_array_length(data_json->'rows') AS n
            FROM dpr_supervisor_entries
            WHERE jsonb_typeof(data_json->'rows') = 'array'
              AND EXISTS (
                  SELECT 1
                  FROM jsonb_array_elements(data_json->'rows') AS r
                  WHERE r ? 'percentComplete' OR r ? 'physicalPercentComplete'
              )
            ORDER BY n ASC
            """
        )

        if not candidates:
            await pool.execute(
                "INSERT INTO applied_data_migrations (name, notes) VALUES ($1, $2)"
                " ON CONFLICT (name) DO NOTHING",
                PERCENT_SCALE_KEY, "no candidate entries",
            )
            logger.info("OK Percent scale migration: nothing to convert")
            return

        converted = rows_changed = skipped = failed = 0

        for candidate in candidates:
            entry_id = candidate["id"]
            if (candidate["n"] or 0) > ROW_CAP:
                skipped += 1
                logger.warning(
                    f"Percent scale: entry {entry_id} has {candidate['n']} rows (over {ROW_CAP}), skipped"
                )
                continue

            try:
                record = await pool.fetchrow(
                    "SELECT data_json FROM dpr_supervisor_entries WHERE id = $1", entry_id
                )
                data = record["data_json"] if record else None
                if isinstance(data, str):
                    data = json.loads(data)
                if not isinstance(data, dict) or not isinstance(data.get("rows"), list):
                    continue

                touched = sum(1 for row in data["rows"] if convert_row(row))
                if touched == 0:
                    continue

                await pool.execute(
                    """
                    INSERT INTO percent_scale_backup (entry_id, sheet_type, rows_changed, data_json)
                    SELECT id, sheet_type, $2, data_json
                    FROM dpr_supervisor_entries
                    WHERE id = $1
                    ON CONFLICT (entry_id) DO NOTHING
                    """,
                    entry_id, touched,
                )
                await pool.execute(
                    "UPDATE dpr_supervisor_entries SET data_json = $1::jsonb WHERE id = $2",
                    json.dumps(data, default=str), entry_id,
                )

                converted += 1
                rows_changed += touched
                logger.info(
                    f"Percent scale: entry {entry_id} ({candidate['sheet_type']}) "
                    f"{touched} row(s) rescaled to 0-100"
                )
            except Exception as entry_error:
                failed += 1
                logger.warning(f"Percent scale: entry {entry_id} failed: {entry_error}")

        notes = (f"scanned={len(candidates)} entries_converted={converted} rows={rows_changed} "
                 f"skipped_oversize={skipped} failed={failed}")
        logger.info(f"OK Percent scale migration complete: {notes}")

        # Only mark it done when every entry was handled, so a partial run is retried on the next
        # start. Re-running is safe: a converted row carries 0-100 values, which are left alone.
        if failed == 0:
            await pool.execute(
                "INSERT INTO applied_data_migrations (name, notes) VALUES ($1, $2)"
                " ON CONFLICT (name) DO NOTHING",
                PERCENT_SCALE_KEY, notes,
            )

    except Exception as e:
        logger.error(f"Percent scale migration error (non-fatal): {e}")
