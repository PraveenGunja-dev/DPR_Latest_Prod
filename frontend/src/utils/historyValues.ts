/**
 * Reading a sheet's trailing "history" date columns.
 *
 * Two sources describe the same past day, and which one wins is not obvious:
 *
 *  - `row.historyValues` - what the sheet last SENT. The grid serialises every history column on
 *    every save, so a cell the user never typed in is sent as the number 0, and the saved entry
 *    keeps that 0 forever. It is a placeholder, not a reading.
 *  - `dailyHistory` - the `dpr_daily_progress` ledger, keyed by activity and date. This is the
 *    record: the backend already refuses to let a blank cell overwrite a real value there for any
 *    day other than the entry's own (see `_write_daily_progress_from_entry`).
 *
 * The read side used to prefer `row.historyValues` whenever the key merely EXISTED, so those
 * placeholder zeros masked the ledger: enter 2 on 27-Aug, touch anything else on that row, and
 * the 27-Aug cell renders blank from then on even though the ledger still holds the 2 (entry 2960
 * in production carries `2026-08-26..31 = 0` on an activity the ledger records as 1,2,2,1,1,12).
 * The value looks erased, and only comes back on a reload that happens to not have that row in the
 * draft. This applies the same rule the write side already uses, in the same direction:
 *
 *   a real (non-zero) figure on the row wins - it is what the user is typing or has just saved;
 *   a cell the user actually touched this session wins even at 0 - that is a deliberate correction;
 *   otherwise the ledger wins, and the row's 0 is treated as the placeholder it is.
 */

/** Cell-edit markers a sheet row carries, keyed by COLUMN LABEL (e.g. "27-Aug-26"). */
export const historyEditedLabels = (row: any): Record<string, unknown> => ({
    ...((row && row._savedCellStatuses) || {}),
    ...((row && row._cellStatuses) || {}),
});

const isRealValue = (v: any) => {
    if (v === undefined || v === null) return false;
    const s = String(v).trim();
    return s !== "" && Number(s) !== 0;
};

/**
 * The value to show in one history date column.
 *
 * @param rowHistory  the row's own `historyValues` map (ISO date -> value)
 * @param ledger      `dailyHistory` for this activity (ISO date -> value)
 * @param iso         the column's date, "YYYY-MM-DD"
 * @param edited      true if the user touched THIS column on THIS row and it is not saved yet
 */
export const resolveHistoryCell = (
    rowHistory: Record<string, any> | undefined,
    ledger: Record<string, any> | undefined,
    iso: string,
    edited: boolean,
): string => {
    const own = rowHistory ? rowHistory[iso] : undefined;
    if (isRealValue(own)) return String(own);
    if (edited) return own === undefined || own === null ? "" : String(own);

    const fromLedger = ledger ? ledger[iso] : undefined;
    if (fromLedger !== undefined && fromLedger !== null) return String(fromLedger);
    return own === undefined || own === null ? "" : String(own);
};

/** Same resolution, rendered the way the grid shows it: a zero reads as an empty cell. */
export const resolveHistoryCellDisplay = (
    rowHistory: Record<string, any> | undefined,
    ledger: Record<string, any> | undefined,
    iso: string,
    edited: boolean,
): string => {
    const v = resolveHistoryCell(rowHistory, ledger, iso, edited);
    return !v || Number(v) === 0 ? "" : v;
};

/**
 * What the row's history columns were worth BEFORE the edit being processed - the figure the
 * recomputed "Completed as on" subtracts before adding the new one back. It has to resolve the
 * same way the cells are displayed, or the cumulative drifts by exactly the values the placeholder
 * zeros were hiding.
 */
export const resolveHistorySum = (
    rowHistory: Record<string, any> | undefined,
    ledger: Record<string, any> | undefined,
    isoDates: string[],
    editedLabels?: Record<string, unknown>,
    labelForIso?: (iso: string) => string,
): number => isoDates.reduce((sum, iso) => {
    const edited = !!(editedLabels && labelForIso && editedLabels[labelForIso(iso)]);
    return sum + (Number(resolveHistoryCell(rowHistory, ledger, iso, edited)) || 0);
}, 0);
