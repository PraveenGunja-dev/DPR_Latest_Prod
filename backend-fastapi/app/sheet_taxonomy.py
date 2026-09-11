"""
What each sheet's daily figure actually MEASURES - the one place that knows.

`dpr_daily_progress` keeps every sheet's daily figure in a single `today_value` column, tagged
only with the `sheet_type` it was typed on. That tag is a UI concept, not a unit, so nothing in
the schema records whether a given 33 means 33 modules installed, 33 man-days worked, or 33
machine-hours. Every query that reads the table therefore has to be told, and until this module
existed each one guessed differently:

  * the cumulative totals SUMmed every row for an activity/day, adding man-days to modules -
    activity A01-CC-3420 on 15-Jul-2026 holds 33 on seven sheets and was credited 231;
  * the yesterday/today lookups kept whichever row the database happened to return last, so an
    unrelated sheet's 0 could mask a real reading and make a user's edit look like it never saved;
  * both counted Summary and DP Qty, which are read-only aggregates of the other sheets
    (`dataEntry: false` in frontend/src/config/sheetConfig.ts) and hold ~23% of the table's rows -
    a value entered once on DC Side is echoed there and was then counted two or three times over.

An activity's figure for a day is ONE number, shared across the sheets that measure the same
thing and never borrowed across the ones that don't. The three real measures line up with the
resource types P6 assigns to every activity (`solar_resource_assignments.resource_type`):

    MATERIAL   installed physical quantity   <- P6 'Material'   (DC Side, AC Side, Testing, ...)
    LABOUR     man-days / headcount          <- P6 'Labor'      (Labour Days, Manpower, ...)
    MACHINERY  plant and equipment           <- P6 'Nonlabor'   (Machinery Sheet)

and a fourth category for sheets that carry no activity-progress figure at all:

    NONE       contributes no reading. Two kinds of sheet land here: read-only aggregates that
               display other sheets' numbers (Summary, DP Qty), and data-entry sheets whose
               content is not a quantity of work done against an activity's scope (Issues,
               Productivity, Charging Schedule). Both must stay out of Completed - the first
               because counting an echo double-counts the original, the second because a rate or
               a schedule is not a quantity installed.

Keep this in step with `frontend/src/config/sheetConfig.ts` - `tests/test_sheet_taxonomy.py`
fails if a sheet is added there and not classified here.
"""

from __future__ import annotations

from enum import Enum
from typing import Optional


class ProgressKind(str, Enum):
    """The quantity a sheet's daily figure is expressed in."""

    MATERIAL = "material"
    LABOUR = "labour"
    MACHINERY = "machinery"
    NONE = "none"


# Every sheet that has ever written to dpr_daily_progress, plus every sheet declared in
# sheetConfig.ts. A sheet absent from this map is deliberately NOT assumed to be material - see
# peer_sheets() - because guessing wrong is what mixed man-days into installed quantity.
SHEET_PROGRESS_KIND: dict[str, ProgressKind] = {
    # ── Solar ────────────────────────────────────────────────────────────────
    "dc_sheet": ProgressKind.MATERIAL,
    "ac_sheet": ProgressKind.MATERIAL,
    "testing_commissioning": ProgressKind.MATERIAL,
    "switchyard": ProgressKind.MATERIAL,
    "transmission_line": ProgressKind.MATERIAL,
    "infra_works": ProgressKind.MATERIAL,
    "dp_block": ProgressKind.MATERIAL,
    "dp_vendor_idt": ProgressKind.MATERIAL,
    "dp_vendor_block": ProgressKind.MATERIAL,
    "manpower_details": ProgressKind.LABOUR,        # "Labour Days"
    "manpower_details_2": ProgressKind.LABOUR,      # "Manpower (Contractor)"
    "resource": ProgressKind.MACHINERY,             # "Machinery Sheet"
    "summary": ProgressKind.NONE,                   # dataEntry: false - aggregates the above
    "dp_qty": ProgressKind.NONE,                    # dataEntry: false - aggregates the above
    "issues": ProgressKind.NONE,                    # not a progress sheet at all
    # ── Wind ─────────────────────────────────────────────────────────────────
    "wind_progress": ProgressKind.MATERIAL,
    "wind_stone_column": ProgressKind.MATERIAL,
    "wind_33kv": ProgressKind.MATERIAL,
    "wind_33kv_oh": ProgressKind.MATERIAL,
    "wind_erection": ProgressKind.MATERIAL,
    "wind_ehv": ProgressKind.MATERIAL,
    "wind_pss": ProgressKind.MATERIAL,
    "wind_manpower": ProgressKind.LABOUR,           # "Labour Days"
    "wind_machinery": ProgressKind.MACHINERY,       # "Machinery Sheet"
    "wind_summary": ProgressKind.NONE,              # dataEntry: false
    # ── PSS ──────────────────────────────────────────────────────────────────
    "pss_progress": ProgressKind.MATERIAL,
    "pss_civil_peb": ProgressKind.MATERIAL,
    "pss_electrical": ProgressKind.MATERIAL,
    "pss_tl_visual": ProgressKind.MATERIAL,
    "pss_transmission": ProgressKind.MATERIAL,
    "pss_manpower": ProgressKind.LABOUR,
    "pss_summary": ProgressKind.NONE,               # dataEntry: false
    # ── BESS ─────────────────────────────────────────────────────────────────
    # bess_dp_qty is dataEntry: TRUE, unlike solar's dp_qty - BESS enters quantities there.
    "bess_dp_qty": ProgressKind.MATERIAL,
    "bess_civil": ProgressKind.MATERIAL,
    "bess_electrical": ProgressKind.MATERIAL,
    "bess_testing": ProgressKind.MATERIAL,
    "bess_manpower": ProgressKind.LABOUR,
    "bess_summary": ProgressKind.NONE,              # dataEntry: false
    # ── Rates and plans, not quantities of work done ─────────────────────────
    # These are data-entry sheets, but what they hold is a rate (output per unit of input) or a
    # plan, not units installed against an activity's scope - adding either to Completed would be
    # adding unlike things. Consistent with the data: none of the three has ever written a
    # dpr_daily_progress row.
    "wind_productivity": ProgressKind.NONE,
    "bess_productivity": ProgressKind.NONE,
    "bess_charging_schedule": ProgressKind.NONE,
    "bess_daily_requirement": ProgressKind.NONE,    # per-block daily requirement plan, not work done
}

# An unqualified request - a dashboard asking for "progress" with no sheet in mind - means the
# physical work installed, not man-days or machine-hours. Several callers do this
# (SummaryModal, SolarDashboard, DPRDashboard), and folding labour into those totals is the
# very mixing this module exists to prevent.
DEFAULT_KIND = ProgressKind.MATERIAL


def kind_for(sheet_type: Optional[str]) -> Optional[ProgressKind]:
    """What `sheet_type` measures. None when the sheet is unknown to us (see peer_sheets)."""
    if sheet_type is None:
        return DEFAULT_KIND
    return SHEET_PROGRESS_KIND.get(sheet_type)


def records_progress(sheet_type: Optional[str]) -> bool:
    """Whether saving this sheet should write dpr_daily_progress rows at all.

    Read-only aggregates must not: their figures are copies of other sheets, and storing them
    turns one entered value into two or three rows that later read back as separate readings.
    """
    return kind_for(sheet_type) is not ProgressKind.NONE


def peer_sheets(sheet_type: Optional[str]) -> list[str]:
    """The sheets whose reading may stand in for `sheet_type`'s own, itself included.

    Pass straight into SQL as `dp.sheet_type = ANY($n)`. This is the whole isolation rule in one
    place: a material sheet sees only material sheets, labour only labour, and the read-only
    aggregates are visible to nobody.

    An unrecognised sheet is isolated to itself rather than defaulted into the material pool -
    it keeps its own figures and cannot contaminate another family's, which is the failure worth
    having if someone adds a sheet and forgets this file.
    """
    kind = kind_for(sheet_type)

    if kind is ProgressKind.NONE:
        return []

    if kind is None:
        return [sheet_type] if sheet_type else []

    return sorted(s for s, k in SHEET_PROGRESS_KIND.items() if k is kind)


# Convenience for the cleanup script and for tests.
DISPLAY_ONLY_SHEETS: list[str] = sorted(
    s for s, k in SHEET_PROGRESS_KIND.items() if k is ProgressKind.NONE
)
