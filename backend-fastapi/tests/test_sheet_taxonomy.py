"""
Keeps app/sheet_taxonomy.py honest.

The taxonomy decides which sheets may share a day's figure. Getting it wrong is silent and
expensive - a manpower sheet classified as material puts man-days into installed quantity, and a
read-only aggregate left unclassified gets counted as a reading of its own. The sheets themselves
are declared in the frontend, so the two can drift; these tests fail when they do.
"""

import json
import re
from pathlib import Path

import pytest

from app.sheet_taxonomy import (
    DISPLAY_ONLY_SHEETS,
    SHEET_PROGRESS_KIND,
    ProgressKind,
    kind_for,
    peer_sheets,
    records_progress,
)

SHEET_CONFIG = (
    Path(__file__).resolve().parents[2] / "frontend" / "src" / "config" / "sheetConfig.ts"
)


def _declared_sheets() -> dict[str, bool]:
    """{sheet id: dataEntry} for every sheet declared in the frontend config."""
    if not SHEET_CONFIG.exists():
        pytest.skip(f"sheetConfig.ts not found at {SHEET_CONFIG}")
    text = SHEET_CONFIG.read_text(encoding="utf-8")
    found: dict[str, bool] = {}
    for m in re.finditer(r"id:\s*'([a-z0-9_]+)'[^}]*?dataEntry:\s*(true|false)", text):
        found[m.group(1)] = m.group(2) == "true"
    assert found, "parsed no sheets out of sheetConfig.ts - has its shape changed?"
    return found


# ── the drift guard ──────────────────────────────────────────────────────────

def test_every_frontend_sheet_is_classified():
    missing = sorted(s for s in _declared_sheets() if s not in SHEET_PROGRESS_KIND)
    assert not missing, (
        "sheets declared in sheetConfig.ts but not classified in app/sheet_taxonomy.py: "
        f"{missing}. Classify each as MATERIAL / LABOUR / MACHINERY / NONE - an unclassified "
        "sheet is isolated from every other, so its figures stop being shared."
    )


def test_read_only_sheets_never_record_progress():
    """`dataEntry: false` in the UI must mean "not a source of progress" in the backend."""
    for sheet, data_entry in _declared_sheets().items():
        if data_entry or sheet not in SHEET_PROGRESS_KIND:
            continue
        assert kind_for(sheet) is ProgressKind.NONE, (
            f"'{sheet}' is dataEntry: false in sheetConfig.ts but classified "
            f"{kind_for(sheet)} - a read-only sheet displays other sheets' figures, so counting "
            "it as a reading double-counts the value that was actually entered."
        )
        assert not records_progress(sheet)


# ── the isolation rule ───────────────────────────────────────────────────────

def test_families_never_share_readings():
    """No sheet may borrow a figure from a sheet measuring something else."""
    for sheet, kind in SHEET_PROGRESS_KIND.items():
        for peer in peer_sheets(sheet):
            assert SHEET_PROGRESS_KIND[peer] is kind, (
                f"'{sheet}' ({kind}) would accept a reading from '{peer}' "
                f"({SHEET_PROGRESS_KIND[peer]})"
            )


def test_material_sheet_cannot_see_labour_or_machinery():
    peers = peer_sheets("dc_sheet")
    assert "manpower_details" not in peers, "man-days must not stand in as installed quantity"
    assert "resource" not in peers, "machinery must not stand in as installed quantity"
    assert "dc_sheet" in peers and "ac_sheet" in peers


def test_labour_sheet_sees_only_labour():
    peers = peer_sheets("manpower_details")
    assert set(peers) == {s for s, k in SHEET_PROGRESS_KIND.items() if k is ProgressKind.LABOUR}
    assert "dc_sheet" not in peers


def test_display_only_sheets_supply_nobody():
    for sheet in DISPLAY_ONLY_SHEETS:
        assert peer_sheets(sheet) == [], f"'{sheet}' is an aggregate and must supply no readings"
    # ...and nobody may read from them either.
    for sheet in SHEET_PROGRESS_KIND:
        assert not (set(peer_sheets(sheet)) & set(DISPLAY_ONLY_SHEETS)), (
            f"'{sheet}' would read from a read-only aggregate"
        )


def test_summary_and_dp_qty_are_the_known_aggregates():
    """Regression: these two held ~23% of dpr_daily_progress as echoes of other sheets."""
    assert not records_progress("summary")
    assert not records_progress("dp_qty")
    # BESS enters quantities on its own DP Qty sheet - it is NOT the solar aggregate.
    assert records_progress("bess_dp_qty")


# ── fail-safe behaviour ──────────────────────────────────────────────────────

def test_unknown_sheet_is_isolated_not_assumed_material():
    """Forgetting to classify a sheet must not silently fold it into material totals."""
    assert kind_for("some_new_sheet_nobody_classified") is None
    assert peer_sheets("some_new_sheet_nobody_classified") == ["some_new_sheet_nobody_classified"]


def test_no_sheet_defaults_to_material_by_accident():
    assert "some_new_sheet_nobody_classified" not in peer_sheets("dc_sheet")


def test_missing_sheet_type_means_material():
    """Dashboards ask for progress with no sheet in mind; that means physical work, not man-days."""
    assert kind_for(None) is ProgressKind.MATERIAL
    peers = peer_sheets(None)
    assert "dc_sheet" in peers
    assert "manpower_details" not in peers
