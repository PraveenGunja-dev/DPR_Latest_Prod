"""
Clear rows from dpr_daily_progress - either the read-only aggregate noise, or a project type's
whole recorded history so tracking restarts from a clean baseline.

Why this exists
---------------
The table accumulated history under a write path that stored one entered figure on every sheet it
appeared on: material sheets, manpower sheets, machinery, and the read-only aggregates (Summary,
DP Qty) alike. Reading it back is now correct - one figure per activity per day, only from sheets
measuring the same thing, see app/sheet_taxonomy.py - and the write path no longer records the
aggregates at all. What remains is the mixture already stored. This clears it.

Two modes
---------
  --mode aggregates   (default, safe)
      Removes only rows belonging to read-only aggregate sheets - figures that were always an
      echo of another sheet. Refuses to remove any row that is the sole record of real work, so
      nothing is lost and no number on screen changes.

  --mode all
      Removes the whole recorded history for the selected project type, so tracking restarts.
      Read the impact report before using this: see below.

What --mode all does to the numbers
-----------------------------------
The sheets show   Completed = sa.cumulative (P6's synced actual units)
                            + daily progress entered since, not yet pushed to P6.

  * Rows already stamped `pushed_at` are inside sa.cumulative already. Removing them changes
    NOTHING on screen; the row is only a record of how the figure got there.
  * Removing UNPUSHED rows lowers Completed by exactly their value, landing it on sa.cumulative -
    exactly what P6 says. Work entered on site and never pushed is discarded with them.

That second point is the whole decision. Run without --apply and read the report first.

Safety
------
  * Dry run by default. --apply is required before anything is written.
  * Deleted rows are copied to dpr_daily_progress_purge_backup in the same transaction, so the
    delete is reversible from inside the database.
  * Project type is matched case-insensitively - the column holds both 'solar' and 'Solar'.

Usage
-----
    python scripts/purge_daily_progress.py                                # dry run, aggregates, solar
    python scripts/purge_daily_progress.py --project-type all             # every project type
    python scripts/purge_daily_progress.py --mode all --before 2026-09-01 # reset history before a date
    python scripts/purge_daily_progress.py --mode all --apply             # reset solar history
"""

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import psycopg  # noqa: E402

from app.database import _build_conninfo  # noqa: E402
from app.sheet_taxonomy import DISPLAY_ONLY_SHEETS  # noqa: E402

PROJECT_TYPES = ("solar", "wind", "pss", "bess")

BACKUP_DDL = """
CREATE TABLE IF NOT EXISTS dpr_daily_progress_purge_backup (
    LIKE dpr_daily_progress INCLUDING DEFAULTS,
    purged_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    purge_note TEXT
)
"""

# Activities belonging to the selected projects, on either side of the activity_source split.
PROJECT_SCOPE = """
    (
      (dp.activity_source = 'p6' AND dp.activity_object_id IN (
          SELECT sa.object_id FROM solar_activities sa
          JOIN projects p ON p.object_id = sa.project_object_id
          WHERE ({type_pred}) {project_pred}
      ))
      OR
      (dp.activity_source = 'dpr' AND dp.activity_object_id IN (
          SELECT ca.id FROM dpr_custom_activities ca
          JOIN projects p ON p.object_id = ca.project_id
          WHERE ({type_pred}) {project_pred}
      ))
    )
"""

# An aggregate row is safe to drop when it is zero, or when a real data-entry sheet recorded the
# same activity and day - the figure then survives where it belongs.
AGGREGATE_SAFE = """
    AND dp.sheet_type = ANY(%(agg)s)
    AND (
        COALESCE(dp.today_value, 0) = 0
     OR EXISTS (
            SELECT 1 FROM dpr_daily_progress src
            WHERE src.activity_object_id = dp.activity_object_id
              AND src.activity_source    = dp.activity_source
              AND src.progress_date      = dp.progress_date
              AND NOT (src.sheet_type = ANY(%(agg)s))
        )
    )
"""

AGGREGATE_UNSAFE = """
    AND dp.sheet_type = ANY(%(agg)s)
    AND COALESCE(dp.today_value, 0) <> 0
    AND NOT EXISTS (
        SELECT 1 FROM dpr_daily_progress src
        WHERE src.activity_object_id = dp.activity_object_id
          AND src.activity_source    = dp.activity_source
          AND src.progress_date      = dp.progress_date
          AND NOT (src.sheet_type = ANY(%(agg)s))
    )
"""


def build_where(args, unsafe: bool = False):
    """The WHERE body selecting rows in scope, plus its parameters."""
    params: dict = {"agg": list(DISPLAY_ONLY_SHEETS)}

    if args.project_type == "all":
        type_pred = "TRUE"
    else:
        type_pred = "LOWER(p.project_type) = %(ptype)s"
        params["ptype"] = args.project_type

    project_pred = ""
    if args.project_id:
        project_pred = "AND p.object_id = %(pid)s"
        params["pid"] = args.project_id

    where = PROJECT_SCOPE.format(type_pred=type_pred, project_pred=project_pred)

    if args.before:
        where += " AND dp.progress_date < %(before)s"
        params["before"] = args.before

    if args.mode == "aggregates":
        where += AGGREGATE_UNSAFE if unsafe else AGGREGATE_SAFE
    elif args.keep_pushed:
        where += " AND dp.pushed_at IS NULL"

    return where, params


def main() -> int:
    ap = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    ap.add_argument("--mode", choices=("aggregates", "all"), default="aggregates",
                    help="'aggregates' removes read-only echo rows only (safe, default); "
                         "'all' clears the recorded history so tracking restarts")
    ap.add_argument("--project-type", default="solar",
                    choices=(*PROJECT_TYPES, "all"),
                    help="which project type to clear (default: solar)")
    ap.add_argument("--project-id", type=int, help="restrict to a single project object_id")
    ap.add_argument("--before", help="only clear rows dated before YYYY-MM-DD")
    ap.add_argument("--keep-pushed", action="store_true",
                    help="--mode all: leave rows already absorbed into sa.cumulative "
                         "(they do not affect Completed either way)")
    ap.add_argument("--apply", action="store_true", help="actually delete (default is a dry run)")
    ap.add_argument("--note", default="", help="text stored against the backup rows")
    args = ap.parse_args()

    where, params = build_where(args)

    # Say out loud which database is about to be changed. On a VM the connection comes from the
    # host's environment (Azure App Settings), not a .env in the repo, so the same command means
    # "my laptop" in one place and "production" in another - and the only difference visible to
    # the person running it is this line.
    from app.config import settings
    target = f"{settings.effective_db_host}:{settings.effective_db_port}/{settings.effective_db_name}"
    print(f"database : {target}")
    if args.apply and args.mode == "all":
        expected = args.project_type
        typed = input(f"About to DELETE recorded history on {target}.\n"
                      f"Type the project type to confirm ({expected}): ").strip().lower()
        if typed != expected:
            print("Confirmation did not match - nothing was changed.")
            return 1

    try:
        conn_ctx = psycopg.connect(_build_conninfo(), connect_timeout=20)
    except psycopg.OperationalError as e:
        # Overwhelmingly this is a managed-Postgres firewall that has not been told about the
        # machine running the script, or DB_HOST pointing somewhere that does not exist.
        print(f"\nCould not connect to {target}\n  {str(e).strip().splitlines()[0]}")
        print("\n  * check DB_HOST / DB_NAME / DB_USER / DB_PASSWORD point where you intend")
        print("  * for Azure Database for PostgreSQL, add this machine's IP to the firewall rules")
        return 2

    with conn_ctx as conn:
        cur = conn.cursor()

        cur.execute(f"""
            SELECT COUNT(*)                                         AS rows_selected,
                   COUNT(*) FILTER (WHERE dp.pushed_at IS NULL)     AS unpushed,
                   COUNT(*) FILTER (WHERE dp.pushed_at IS NOT NULL) AS already_absorbed,
                   COUNT(DISTINCT dp.activity_object_id)            AS activities,
                   MIN(dp.progress_date)                            AS earliest,
                   MAX(dp.progress_date)                            AS latest
            FROM dpr_daily_progress dp WHERE {where}
        """, params)
        summary = dict(zip([d.name for d in cur.description], cur.fetchone()))

        cur.execute(f"""
            SELECT COUNT(DISTINCT dp.activity_object_id) AS activities_whose_completed_drops,
                   COALESCE(SUM(dp.today_value), 0)      AS units_removed_from_completed
            FROM dpr_daily_progress dp
            WHERE dp.pushed_at IS NULL AND COALESCE(dp.today_value,0) <> 0 AND {where}
        """, params)
        impact = dict(zip([d.name for d in cur.description], cur.fetchone()))

        scope_desc = (f"mode={args.mode}, project_type={args.project_type}"
                      f"{f', project={args.project_id}' if args.project_id else ''}"
                      f"{f', before {args.before}' if args.before else ' (all dates)'}"
                      f"{', keeping absorbed rows' if args.keep_pushed else ''}")
        print(f"scope : {scope_desc}\n")
        for k, v in summary.items():
            print(f"   {k:34} {v}")

        if args.mode == "aggregates":
            unsafe_where, unsafe_params = build_where(args, unsafe=True)
            cur.execute(f"SELECT COUNT(*) FROM dpr_daily_progress dp WHERE {unsafe_where}",
                        unsafe_params)
            kept = cur.fetchone()[0]
            print(f"   {'kept (would lose real work)':34} {kept}")
            print("\n   nothing on screen changes: these rows only ever echoed another sheet.")
        else:
            print("\n   effect on the numbers shown on screen:")
            for k, v in impact.items():
                print(f"   {k:34} {v}")
            print("   (absorbed rows do not change Completed; after this Completed == P6's")
            print("    figure until new progress is entered)")

        if not args.apply:
            print("\nDRY RUN - nothing written. Re-run with --apply to perform it.")
            return 0

        if summary["rows_selected"] == 0:
            print("\nNothing in scope.")
            return 0

        cur.execute(BACKUP_DDL)
        cur.execute(
            f"INSERT INTO dpr_daily_progress_purge_backup "
            f"SELECT dp.*, NOW(), %(note)s FROM dpr_daily_progress dp WHERE {where}",
            {**params, "note": args.note or scope_desc},
        )
        backed_up = cur.rowcount
        cur.execute(f"DELETE FROM dpr_daily_progress dp WHERE {where}", params)
        deleted = cur.rowcount
        conn.commit()

        print(f"\nbacked up {backed_up} rows to dpr_daily_progress_purge_backup")
        print(f"deleted   {deleted} rows from dpr_daily_progress")
        if args.mode == "all":
            print("Tracking restarts from the next entry saved.")
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
