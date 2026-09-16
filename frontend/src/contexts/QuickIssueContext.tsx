import { createContext, useContext } from "react";

/** What the red flag on a sheet row hands to the Issues form, pre-filled. */
export interface QuickIssuePrefill {
  activity: string;
  activityId?: string;
  wbs?: string;
  location?: string;
  description: string;
  sheetType?: string;
}

/**
 * "Report an issue against this activity" - the red flag on every sheet row.
 *
 * The supervisor dashboard provides the handler once; StyledExcelTable reads it and, whenever a
 * sheet has not wired its own onQuickIssue, derives the activity / block from the row's own
 * columns. That is what makes the flag uniform: it no longer depends on each of the twenty-odd
 * sheet components remembering to plumb a prop through (BESS had it, everything else did not,
 * and the one PSS table that carried it lost it in a later edit). Outside the dashboard - the
 * PM / PMAG review modals - there is no provider, so no flag is drawn.
 */
export const QuickIssueContext = createContext<((prefill: QuickIssuePrefill) => void) | null>(null);

export const useQuickIssue = () => useContext(QuickIssueContext);

const norm = (s: any) => String(s || "").trim().toLowerCase();

const ID_COLUMNS = ["activity id", "activityid", "act id", "wtg id", "id"];
// Whatever a sheet calls the thing its row is about. Ordered by preference; matched exactly
// (case-insensitively) so "Activity ID" cannot be taken for "Activity".
const NAME_COLUMNS = [
  "description", "activity description", "activity name", "activity", "activities", "activity / description",
  "machinery", "type of machine", "machine", "equipment name", "resource", "item", "name", "package", "work",
  "feeder name", "wtg location", "contractor name", "contractor",
];
const PLACE_COLUMNS = ["block", "location", "locations", "wtg location", "wbs", "substation", "area", "feeder", "feeder name", "wtg", "wtg no", "wtg no.", "loc", "pss"];

const findCol = (columns: string[], names: string[]) => {
  for (const n of names) {
    const idx = columns.findIndex(c => norm(c) === n);
    if (idx !== -1) return idx;
  }
  return -1;
};

/**
 * Builds the pre-fill for a row from its rendered cells, using whichever of the usual identifying
 * columns the sheet happens to have. Returns null when the row carries nothing to name it by.
 */
export const quickIssuePrefillFromRow = (
  columns: string[],
  row: any[] | undefined,
  sheetType?: string,
): QuickIssuePrefill | null => {
  if (!row) return null;
  const cell = (idx: number) => (idx === -1 ? "" : String(row[idx] ?? "").trim());

  const idIdx = findCol(columns, ID_COLUMNS);
  const nameIdx = findCol(columns, NAME_COLUMNS.filter(n => columns[idIdx] === undefined || norm(columns[idIdx]) !== n));
  const placeIdx = findCol(columns, PLACE_COLUMNS);

  const activityId = cell(idIdx);
  const name = cell(nameIdx);
  const activity = name || activityId;
  if (!activity) return null;

  let place = cell(placeIdx);
  if (place && /^\d+$/.test(place)) place = `Block ${place}`;

  return {
    activity,
    activityId: activityId || undefined,
    wbs: place || undefined,
    location: place || undefined,
    description: activityId && name ? `Issue regarding ${name} (${activityId})` : `Issue regarding ${activity}`,
    sheetType,
  };
};

/** The column the flag sits in when the sheet has not chosen one: the activity's name, else its id. */
export const defaultQuickIssueColumn = (columns: string[]): string | undefined => {
  const nameIdx = findCol(columns, NAME_COLUMNS);
  if (nameIdx !== -1) return columns[nameIdx];
  const idIdx = findCol(columns, ID_COLUMNS);
  if (idIdx !== -1) return columns[idIdx];
  return columns[0];
};
