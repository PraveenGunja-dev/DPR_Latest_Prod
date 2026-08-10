import React, { useMemo, useCallback, memo } from 'react';
import { indianDateFormat } from "@/services/dprService";
import { Plus, Trash2, Save } from 'lucide-react';

/**
 * One contractor engaged on an activity. It renders as TWO lines - Agreed Manpower and Available
 * Manpower - which is why the day figures are held as two maps rather than one.
 */
export interface WindContractorManpowerRow {
  activity: string;
  contractor: string;
  soScope: string;
  uom: string;
  /** Row labels in the Manpower column - editable, defaulted to Agreed / Available Manpower. */
  agreedLabel?: string;
  availableLabel?: string;
  /** Agreed manpower per day, keyed by ISO date. */
  agreedValues?: Record<string, string>;
  /** Available manpower per day, keyed by ISO date. */
  availableValues?: Record<string, string>;
  _cellStatuses?: Record<string, string>;
  [key: string]: any;
}

interface WindContractorManpowerTableProps {
  data: WindContractorManpowerRow[];
  setData: (data: WindContractorManpowerRow[]) => void;
  onSave?: (isAutoSave?: boolean) => void;
  isLocked?: boolean;
  status?: string;
  projectId?: number;
  today?: string;
}

const HISTORY_COLS = 7;

/** The standing activity list this sheet is filled in against. */
export const WIND_CONTRACTOR_ACTIVITIES = [
  'Soil Test',
  'WTG Foundation',
  'USS Electrical',
  '33KV Line',
  'Road & Crane Pad',
  'PSS',
  '220KV Line',
  'WTG Erection',
  'WTG Main Crane Package',
  'Misc Packages',
];

const DEFAULT_AGREED_LABEL = 'Agreed Manpower';
const DEFAULT_AVAILABLE_LABEL = 'Available Manpower';

const emptyContractor = (activity: string): WindContractorManpowerRow => ({
  activity,
  contractor: '',
  soScope: '',
  uom: '',
  agreedLabel: DEFAULT_AGREED_LABEL,
  availableLabel: DEFAULT_AVAILABLE_LABEL,
  agreedValues: {},
  availableValues: {},
});

/** Rows the sheet starts with - one blank contractor under each standing activity. */
export const buildWindContractorManpowerRows = (): WindContractorManpowerRow[] =>
  WIND_CONTRACTOR_ACTIVITIES.map(emptyContractor);

// Text columns take letters only. Digits are stripped rather than the whole entry rejected, which
// is the same rule the shared grid applies to its "alphabet" columns - punctuation and spaces stay,
// so a name like "M/S CEG Test House" still types through.
const stripDigits = (value: string) => value.replace(/[0-9]/g, '');

// Number columns take figures only (optionally negative / decimal); anything else is ignored.
const numericOnly = (value: string) =>
  (value === '' || value === '-' || /^-?\d*\.?\d*$/.test(value)) ? value : null;

// Borders, fills and metrics lifted from StyledExcelTable so this sheet sits alongside the others
// without looking hand-made: slate group-header fill, dashed inner grid, solid outer edge.
const GRID_BORDER = "#D4D4D4";
const TOOLBAR_BG = "#F3F3F3";
const HEADER_BG = "#DDE4EC";
const HEADER_TEXT = "#1e293b";
const CELL_BORDER = "1px dashed #999999";
const EDGE_BORDER = "2px solid #999999";
const ROW_BG_ALT = "#F8FBFF";
const GROUP_BG = "#F8FAFC";

const headerCellStyle: React.CSSProperties = {
  backgroundColor: HEADER_BG,
  color: HEADER_TEXT,
  fontSize: "11px",
  fontWeight: 700,
  padding: "4px 6px",
  textAlign: "center",
  textTransform: "uppercase",
  letterSpacing: "0.5px",
  whiteSpace: "pre-wrap",
  borderBottom: "2px solid #94a3b8",
  borderRight: "1px solid #cbd5e1",
  verticalAlign: "middle",
};

const bodyCellStyle: React.CSSProperties = {
  height: "32px",
  padding: 0,
  fontSize: "12px",
  color: "#000",
  borderBottom: CELL_BORDER,
  borderRight: CELL_BORDER,
  verticalAlign: "middle",
};

const inputClass =
  "w-full h-full px-1.5 outline-none bg-transparent text-[12px] disabled:text-slate-500";
const numberInputClass =
  `${inputClass} text-center [appearance:textfield] ` +
  "[&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none";

/**
 * Wind - Manpower (Contractor).
 *
 * An activity owns any number of contractors, and each contractor is two lines: Agreed Manpower
 * and Available Manpower. The Sr No and Activity cells are merged down the whole activity group,
 * and Contractor / SO Scope / UOM are merged across each contractor's two lines - so adding a
 * contractor extends the group rather than repeating the activity.
 *
 * Hand-rolled rather than StyledExcelTable, which cannot express those nested body rowSpans; the
 * styling deliberately mirrors it. The shared table is still used by Solar, PSS, BESS and the PMAG
 * detail modal for their own version of this sheet.
 */
export const WindContractorManpowerTable = memo(({
  data,
  setData,
  onSave,
  isLocked = false,
  status = 'draft',
  today,
}: WindContractorManpowerTableProps) => {
  const safeData = useMemo(() => (Array.isArray(data) ? data : []), [data]);

  // Trailing 7 days ending on the report date - same convention as the other daily sheets.
  const historyDates = useMemo(() => {
    const dates: { iso: string; label: string }[] = [];
    const baseDate = today ? new Date(today) : new Date();
    for (let i = HISTORY_COLS - 1; i >= 0; i--) {
      const d = new Date(baseDate);
      d.setDate(d.getDate() - i);
      const iso = d.toISOString().split('T')[0];
      dates.push({ iso, label: indianDateFormat(iso) || iso });
    }
    return dates;
  }, [today]);

  // Consecutive rows sharing an activity form one merged group. Grouping by position (rather than
  // collecting every row with that name) keeps a contractor added mid-sheet next to its own group.
  const groups = useMemo(() => {
    const out: { activity: string; rows: { row: WindContractorManpowerRow; index: number }[] }[] = [];
    safeData.forEach((row, index) => {
      const activity = row.activity || '';
      const last = out[out.length - 1];
      if (last && last.activity === activity) last.rows.push({ row, index });
      else out.push({ activity, rows: [{ row, index }] });
    });
    return out;
  }, [safeData]);

  const updateRow = useCallback((index: number, patch: Partial<WindContractorManpowerRow>) => {
    const updated = [...safeData];
    updated[index] = { ...updated[index], ...patch };
    setData(updated);
  }, [safeData, setData]);

  const handleFieldChange = useCallback((index: number, field: string, value: string) => {
    const row: WindContractorManpowerRow = safeData[index] || emptyContractor('');
    updateRow(index, {
      [field]: value,
      _cellStatuses: { ...(row._cellStatuses || {}), [field]: 'edited' },
    });
  }, [safeData, updateRow]);

  const handleDayChange = useCallback((
    index: number, kind: 'agreedValues' | 'availableValues', iso: string, value: string,
  ) => {
    const row: WindContractorManpowerRow = safeData[index] || emptyContractor('');
    updateRow(index, {
      [kind]: { ...(row[kind] || {}), [iso]: value },
      _cellStatuses: { ...(row._cellStatuses || {}), [`${kind}_${iso}`]: 'edited' },
    });
  }, [safeData, updateRow]);

  /**
   * Add a contractor to an activity: a blank row inserted directly after that group's last row, so
   * the activity cell simply spans further instead of the activity being repeated.
   */
  const handleAddContractor = useCallback((groupIdx: number) => {
    const group = groups[groupIdx];
    if (!group) return;
    const insertAt = group.rows[group.rows.length - 1].index + 1;
    const updated = [...safeData];
    updated.splice(insertAt, 0, emptyContractor(group.activity));
    setData(updated);
  }, [groups, safeData, setData]);

  const handleRemoveContractor = useCallback((index: number) => {
    // Confirm first - deleting takes the contractor's Agreed and Available figures with it, and
    // there is no undo on the sheet.
    const name = (safeData[index]?.contractor || '').trim();
    const message = name
      ? `Are you sure you want to delete "${name}"? Its manpower entries will be lost.`
      : 'Are you sure you want to delete this contractor row? Its manpower entries will be lost.';
    if (!window.confirm(message)) return;

    const updated = [...safeData];
    updated.splice(index, 1);
    setData(updated);
  }, [safeData, setData]);

  const colCount = 6 + historyDates.length;

  return (
    <div
      className="rounded-lg border flex flex-col flex-1 h-full w-full min-h-0"
      style={{ borderColor: GRID_BORDER, backgroundColor: "#FFFFFF" }}
    >
      {/* ======================= HEADER ======================= */}
      <div
        className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-2 sm:p-3 border-b rounded-t-lg gap-2 flex-shrink-0"
        style={{ backgroundColor: TOOLBAR_BG, borderColor: GRID_BORDER }}
      >
        <div className="flex items-center space-x-2 flex-wrap">
          <h3 className="font-bold text-sm sm:text-lg text-primary" style={{ color: HEADER_TEXT }}>
            Manpower (Contractor)
          </h3>
          <span
            style={{ color: HEADER_TEXT, fontSize: "9px" }}
            className="hidden sm:inline font-medium opacity-70"
          >
            ({safeData.length} contractor{safeData.length === 1 ? '' : 's'} across{' '}
            {groups.length} activit{groups.length === 1 ? 'y' : 'ies'})
          </span>
          {status !== 'draft' && (
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-slate-200 text-slate-700 uppercase">
              {status.replace(/_/g, ' ')}
            </span>
          )}
        </div>

        {!isLocked && onSave && (
          <button
            onClick={() => onSave(false)}
            className="flex items-center gap-1.5 px-4 py-2 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors shadow-sm font-semibold"
          >
            <Save className="w-4 h-4" />
            Save
          </button>
        )}
      </div>

      {/* ======================= GRID ======================= */}
      <div className="flex-1 min-h-0 overflow-auto custom-scrollbar">
        {/* w-full so the grid reaches the card's right edge instead of stopping at its content
            width; min-w-max keeps the columns from being squeezed on narrow screens. Activity and
            Contractor carry a minWidth rather than a fixed width, so they take up the slack. */}
        <table
          className="border-collapse w-full min-w-max"
          style={{ borderLeft: EDGE_BORDER, borderTop: EDGE_BORDER }}
        >
          <thead className="sticky top-0 z-10">
            <tr>
              <th style={{ ...headerCellStyle, width: 55 }}>Sr No</th>
              <th style={{ ...headerCellStyle, minWidth: 180 }}>Activity</th>
              <th style={{ ...headerCellStyle, minWidth: 200 }}>Contractor</th>
              <th style={{ ...headerCellStyle, width: 95 }}>SO Scope</th>
              <th style={{ ...headerCellStyle, width: 80 }}>UOM</th>
              <th style={{ ...headerCellStyle, width: 140 }}>Manpower</th>
              {historyDates.map(d => (
                <th key={d.iso} style={{ ...headerCellStyle, width: 85 }}>{d.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups.length === 0 && (
              <tr>
                <td
                  colSpan={colCount}
                  className="text-center py-12 text-slate-400 text-sm"
                  style={{ borderBottom: EDGE_BORDER, borderRight: EDGE_BORDER }}
                >
                  No activities yet.
                </td>
              </tr>
            )}

            {groups.map((group, groupIdx) => {
              // Two lines per contractor - Agreed and Available.
              const groupSpan = group.rows.length * 2;
              const isLastGroup = groupIdx === groups.length - 1;

              return group.rows.map(({ row, index }, rowIdx) => {
                const isFirstOfGroup = rowIdx === 0;
                const isLastContractor = rowIdx === group.rows.length - 1;
                // Shade alternate contractor blocks so a merged group still reads as banded rows.
                const blockBg = index % 2 === 0 ? "#FFFFFF" : ROW_BG_ALT;
                // Close the grid off with the solid outer edge on the very last line.
                const bottomEdge = isLastGroup && isLastContractor ? EDGE_BORDER : CELL_BORDER;

                const dayCells = (kind: 'agreedValues' | 'availableValues', bottom: string) =>
                  historyDates.map((d, i) => (
                    <td
                      key={`${kind}-${d.iso}`}
                      style={{
                        ...bodyCellStyle,
                        backgroundColor: blockBg,
                        borderBottom: bottom,
                        borderRight: i === historyDates.length - 1 ? EDGE_BORDER : CELL_BORDER,
                      }}
                    >
                      <input
                        type="number"
                        className={numberInputClass}
                        value={row[kind]?.[d.iso] ?? ''}
                        onChange={(e) => {
                          const next = numericOnly(e.target.value);
                          if (next !== null) handleDayChange(index, kind, d.iso, next);
                        }}
                        disabled={isLocked}
                      />
                    </td>
                  ));

                return (
                  <React.Fragment key={`${groupIdx}-${index}`}>
                    <tr>
                      {isFirstOfGroup && (
                        <>
                          <td
                            rowSpan={groupSpan}
                            style={{
                              ...bodyCellStyle,
                              backgroundColor: GROUP_BG,
                              borderBottom: isLastGroup ? EDGE_BORDER : CELL_BORDER,
                              textAlign: "center",
                              fontWeight: 600,
                              color: "#334155",
                            }}
                          >
                            {groupIdx + 1}
                          </td>
                          <td
                            rowSpan={groupSpan}
                            style={{
                              ...bodyCellStyle,
                              backgroundColor: GROUP_BG,
                              borderBottom: isLastGroup ? EDGE_BORDER : CELL_BORDER,
                              padding: "2px 0",
                            }}
                          >
                            {/* The + sits right after the activity name, so it is obvious which
                                group a new contractor lands in. */}
                            <div className="flex items-center gap-2 px-1.5">
                              <input
                                type="text"
                                className="flex-1 min-w-0 outline-none bg-transparent text-[12px] font-semibold disabled:text-slate-500"
                                value={group.activity}
                                onChange={(e) => {
                                  // Renaming the activity moves the whole group with it.
                                  const value = stripDigits(e.target.value);
                                  const updated = [...safeData];
                                  group.rows.forEach(r => {
                                    updated[r.index] = { ...updated[r.index], activity: value };
                                  });
                                  setData(updated);
                                }}
                                disabled={isLocked}
                              />
                              {!isLocked && (
                                <button
                                  onClick={() => handleAddContractor(groupIdx)}
                                  className="shrink-0 w-5 h-5 flex items-center justify-center rounded border border-blue-300 text-blue-600 hover:bg-blue-50 hover:text-blue-800 transition-colors"
                                  title="Add a contractor under this activity"
                                >
                                  <Plus className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </td>
                        </>
                      )}

                      <td rowSpan={2} style={{ ...bodyCellStyle, backgroundColor: blockBg, borderBottom: bottomEdge }}>
                        <div className="flex items-center">
                          <input
                            type="text"
                            className={inputClass}
                            value={row.contractor ?? ''}
                            onChange={(e) => handleFieldChange(index, 'contractor', stripDigits(e.target.value))}
                            disabled={isLocked}
                          />
                          {!isLocked && group.rows.length > 1 && (
                            <button
                              onClick={() => handleRemoveContractor(index)}
                              className="px-1 text-slate-400 hover:text-red-500 transition-colors"
                              title="Remove this contractor"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                      <td rowSpan={2} style={{ ...bodyCellStyle, backgroundColor: blockBg, borderBottom: bottomEdge }}>
                        <input
                          type="number"
                          className={numberInputClass}
                          value={row.soScope ?? ''}
                          onChange={(e) => {
                            const next = numericOnly(e.target.value);
                            if (next !== null) handleFieldChange(index, 'soScope', next);
                          }}
                          disabled={isLocked}
                        />
                      </td>
                      {/* UOM holds unit labels - Loc., Nos, Km - so it takes letters, not figures.
                          As a number input it silently swallowed everything typed, which read as
                          the cell being locked rather than rejecting the input. */}
                      <td rowSpan={2} style={{ ...bodyCellStyle, backgroundColor: blockBg, borderBottom: bottomEdge }}>
                        <input
                          type="text"
                          className={`${inputClass} text-center`}
                          value={row.uom ?? ''}
                          onChange={(e) => handleFieldChange(index, 'uom', stripDigits(e.target.value))}
                          disabled={isLocked}
                        />
                      </td>

                      <td style={{ ...bodyCellStyle, backgroundColor: blockBg }}>
                        <input
                          type="text"
                          className={inputClass}
                          value={row.agreedLabel ?? DEFAULT_AGREED_LABEL}
                          onChange={(e) => handleFieldChange(index, 'agreedLabel', stripDigits(e.target.value))}
                          disabled={isLocked}
                        />
                      </td>
                      {dayCells('agreedValues', CELL_BORDER)}
                    </tr>

                    <tr>
                      <td style={{ ...bodyCellStyle, backgroundColor: blockBg, borderBottom: bottomEdge }}>
                        <input
                          type="text"
                          className={inputClass}
                          value={row.availableLabel ?? DEFAULT_AVAILABLE_LABEL}
                          onChange={(e) => handleFieldChange(index, 'availableLabel', stripDigits(e.target.value))}
                          disabled={isLocked}
                        />
                      </td>
                      {dayCells('availableValues', bottomEdge)}
                    </tr>
                  </React.Fragment>
                );
              });
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
});
