import React, { useMemo, useCallback, memo } from 'react';
import { StyledExcelTable } from "@/components/StyledExcelTable";
import { indianDateFormat, parseDateToIso } from "@/services/dprService";
import { Plus, Upload } from "lucide-react";
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { toPercentComplete, completedToPercent, percentToCompleted, confirmFinishWithBalance } from '@/utils/activityNaming';

export interface PSSProgressData {
  sNo?: string;
  description: string;
  block?: string;
  priority: string;
  duration: string;
  planStart: string;
  planFinish: string;
  actualStart: string;
  actualFinish: string;
  forecastStart: string;
  forecastFinish: string;
  soVendorName: string;
  uom: string;
  scope: string;
  completed: string;
  balance: string;
  remarks: string;
  status?: string;
  mainHeading?: string;
  subHeading?: string;
  isCategoryRow?: boolean;
  [key: string]: any;
}

// Colors for main and sub headings
const MAIN_HEADING_COLOR = "#1B4F72";    // Deep navy blue - main heading background
const MAIN_HEADING_TEXT = "#FFFFFF";       // White text for main heading
const SUB_HEADING_COLOR = "#85C1E9";      // Light blue - sub heading background
const SUB_HEADING_TEXT = "#1B2631";        // Dark text for sub heading

// The BESS Civil / Electrical / Testing sheets use a different column order: Activity ID replaces
// S.No, and SO Vendor Name / UOM / Scope / Completed / Balance move ahead of the Baseline /
// Actual / Forecast date groups. Rows are always BUILT in the default order below; for BESS the
// display is a pure permutation of that order, un-permuted again on edit. Each entry is the source
// index in the default build order ('ACT' = the activity id shown in column 0).
//   default: 0 S.No 1 Desc 2 Block 3 Status 4 Priority 5 Duration 6 BLStart 7 BLFinish 8 ActStart
//            9 ActFinish 10 FcstStart 11 FcstFinish 12 Vendor 13 UOM 14 Scope 15 Completed
//            16 PhysicalProgress 17 Balance 18 Remarks
const BESS_COL_ORDER: (number | 'ACT')[] = ['ACT', 1, 2, 3, 4, 5, 12, 13, 14, 15, 16, 17, 6, 7, 8, 9, 10, 11, 18];
const ROW_META_KEYS = ['_cellStatuses', '_isCustomRow', '_customId', '_activityId', '_lastEditedCol', 'isCategoryRow', 'isTotalRow'];

// BESS Civil / Electrical / Testing sheets carry 7 day-columns (5 history days + yesterday +
// today), matching the Manpower / DP Qty sheets. They are appended to the default build order at
// indices 19..25, and inserted into the BESS display order immediately AFTER Forecast Finish
// (index 11) and BEFORE Remarks (index 18). Values entered here mirror into the DP Qty date columns.
const HISTORY_COLS = 5;
const DAY_START_IDX = 19;
const BESS_COL_ORDER_DAYS: (number | 'ACT')[] =
  ['ACT', 1, 2, 3, 4, 5, 12, 13, 14, 15, 16, 17, 6, 7, 8, 9, 10, 11, 19, 20, 21, 22, 23, 24, 25, 18];

// Physical progress seeds from P6 but is editable: a supervisor can override the figure and it is
// pushed back as the activity's PhysicalPercentComplete. Every field below is on the 0-100 scale -
// the API converts P6's native 0-1 fraction on the way out - so no scaling happens here. The
// spellings differ by producer: a supervisor override is `physicalProgress`, P6-seeded rows carry
// `percentComplete`, and a mapped payload can already have a "%" suffix, which is why three
// spellings are tried in order.
//
// The snake_case `percent_complete` is deliberately NOT read. It is the column name, and the BESS
// and PSS sheet endpoints used to pass it straight through unconverted - so a finished activity
// arrived as P6's fraction 1.0 and this cell rendered "1" against Scope 64 / Completed 64. Those
// endpoints now emit a normalised "percentComplete" (see routers/oracle_p6.py); reading the raw
// column name here would let any future unconverted producer reintroduce the same 1%-vs-100% bug.
const formatPhysicalProgress = (row: any): string => {
  return toPercentComplete(
    row?.physicalProgress,
    row?.percentComplete,
    row?.physicalPercentComplete
  );
};

interface PSSProgressTableProps {
  data: PSSProgressData[];
  setData: (data: PSSProgressData[]) => void;
  onSave?: (isAuto?: boolean) => void | Promise<void>;
  onSubmit?: () => void;
  yesterday?: string;
  today?: string;
  // P6's own "data date" (as-of date the schedule was last calculated) - preferred over
  // `yesterday` for deciding whether a date is Actual or Forecast, same as DCSheetTable does.
  dataDate?: string;
  isLocked?: boolean;
  status?: string;
  onExportAll?: () => void;
  projectId?: number;
  onPush?: () => void;
  title?: string;
  sheetType?: string;
  // When true, labels the "Plan" column group as "Baseline" instead - used only
  // by the BESS Civil sheet. Data/behavior of that column is unchanged.
  renamePlanToBaseline?: boolean;
  // BESS Civil / Electrical / Testing: past-days values for the 7 day-columns, keyed by
  // activityId -> { 'YYYY-MM-DD': value }. Same shape the Manpower / DP Qty sheets consume.
  dailyHistory?: Record<string, Record<string, number>>;

  customActivities?: any[];
  onAddCustomActivity?: (activity: any, silent?: boolean) => void;
  onEditCustomActivity?: (activity: any) => void;
  onDeleteCustomActivity?: (id: number) => void;
  /** Opens the bulk upload modal. Omit to hide the button, same as the Wind sheets. */
  onBulkUploadActivities?: () => void;
  /**
   * Keep the Add / Upload activity buttons visible when the sheet's day entries are locked. The
   * activity list is project-scoped (dpr_custom_activities, keyed by project + sheet type), so it
   * is not what the lock protects. Off by default so the PSS and PM/PMAG views are unaffected.
   */
  activityActionsWhenLocked?: boolean;
}

export const PSSProgressTable = memo(({
  data,
  setData,
  onSave,
  onSubmit,
  isLocked = false,
  status = 'draft',
  onExportAll,
  projectId,
  onPush,
  title = "PSS Project - Progress Sheet",
  sheetType = "pss_progress",
  renamePlanToBaseline = false,
  customActivities = [],
  onAddCustomActivity,
  onEditCustomActivity,
  onDeleteCustomActivity,
  onBulkUploadActivities,
  activityActionsWhenLocked = false,
  yesterday,
  today,
  dataDate,
  dailyHistory = {}
}: PSSProgressTableProps) => {
  const { user } = useAuth();
  const userRole = (user?.role || user?.Role || '').toLowerCase();
  const isPmagOrAdmin = userRole.includes('pmag') || userRole.includes('admin');

  const isBess = (sheetType || '').startsWith('bess');

  // The 7 day-columns are shown only on the BESS Civil / Electrical / Testing sheets (which pass a
  // `yesterday` reference). When shown, the display order and default build order both gain the
  // 7 trailing day cells (indices 19..25).
  const showDays = isBess && !!yesterday;
  const bessOrder = showDays ? BESS_COL_ORDER_DAYS : BESS_COL_ORDER;

  // The 7 consecutive day-columns: 5 history days, then yesterday, then today. `iso` is the key
  // used in each row's `historyValues` map / the `dailyHistory` lookup; `label` is the column head.
  const dayDates = useMemo(() => {
    if (!showDays || !yesterday) return [] as { iso: string; label: string }[];
    const out: { iso: string; label: string }[] = [];
    const yDate = new Date(yesterday);
    for (let i = HISTORY_COLS; i >= 1; i--) {
      const d = new Date(yDate);
      d.setDate(d.getDate() - i);
      const iso = d.toISOString().split('T')[0];
      out.push({ iso, label: indianDateFormat(iso) || iso });
    }
    const yIso = yDate.toISOString().split('T')[0];
    out.push({ iso: yIso, label: indianDateFormat(yIso) || yIso });
    const tIso = today ? new Date(today).toISOString().split('T')[0] : '';
    out.push({ iso: tIso, label: (today ? indianDateFormat(tIso) : 'Today') || tIso });
    return out;
  }, [showDays, yesterday, today]);

  // Reorder a default-order row array into the BESS display order (and put the activity id in
  // column 0). No-op for non-BESS sheets. Meta props (_cellStatuses, isCategoryRow, ...) carry over.
  const orderRow = useCallback((arr: any): any => {
    if (!isBess) return arr;
    const out: any = bessOrder.map(c => c === 'ACT' ? (arr._activityId ?? '') : arr[c]);
    ROW_META_KEYS.forEach(k => { if (arr[k] !== undefined) out[k] = arr[k]; });
    return out;
  }, [isBess, bessOrder]);

  // Inverse of orderRow: map a BESS display-order row (as received from the table on edit) back to
  // the default order the change handler expects.
  const toDefaultRow = useCallback((row: any): any => {
    if (!isBess) return row;
    const out: any = new Array(showDays ? 26 : 19).fill('');
    bessOrder.forEach((c, pos) => { if (c !== 'ACT') out[c] = row[pos]; });
    ROW_META_KEYS.forEach(k => { if (row[k] !== undefined) out[k] = row[k]; });
    return out;
  }, [isBess, bessOrder, showDays]);

  const columns = useMemo(() => {
    const base = [
      "S.No",
      "Description",
      "Block",
      "Status",
      "Priority",
      "Duration",
      "Plan Start",
      "Plan Finish",
      "Actual Start",
      "Actual Finish",
      "Forecast Start",
      "Forecast Finish",
      "SO Vendor Name",
      "UOM",
      "Scope",
      "Completed",
      "Physical Progress %",
      "Balance",
      "Remarks",
    ];
    if (showDays) dayDates.forEach((d, i) => { base[DAY_START_IDX + i] = d.label; });
    if (isBess) return bessOrder.map(c => c === 'ACT' ? "Activity ID" : base[c]);
    return base;
  }, [isBess, showDays, dayDates, bessOrder]);

  const columnWidths = useMemo(() => {
    const w: Record<string, number> = {
      "Activity ID": 90,
      "S.No": 50,
      "Description": 280,
      "Block": 90,
      "Status": 110,
      "Priority": 80,
      "Duration": 80,
      "Plan Start": 100,
      "Plan Finish": 100,
      "Actual Start": 100,
      "Actual Finish": 100,
      "Forecast Start": 100,
      "Forecast Finish": 100,
      "SO Vendor Name": 160,
      "UOM": 60,
      "Scope": 80,
      "Completed": 90,
      "Physical Progress %": 110,
      "Balance": 80,
      "Remarks": 180,
    };
    if (showDays) dayDates.forEach(d => { w[d.label] = 85; });
    return w;
  }, [showDays, dayDates]);

  const columnTypes = useMemo(() => {
    const t: Record<string, "text" | "number" | "date" | "alphabet"> = {
      "Activity ID": "text",
      "S.No": "text",
      "Description": "text",
      "Block": "text",
      "Status": "text",
      "Priority": "text",
      "Duration": "text",
      "Plan Start": "text",
      "Plan Finish": "text",
      "Actual Start": "date",
      "Actual Finish": "date",
      "Forecast Start": "date",
      "Forecast Finish": "date",
      "SO Vendor Name": "alphabet",
      "UOM": "text",
      "Scope": "number",
      "Completed": "number",
      "Physical Progress %": "number",
      "Balance": "number",
      "Remarks": "text",
    };
    // The 7 day-columns accept numeric values only.
    if (showDays) dayDates.forEach(d => { t[d.label] = "number"; });
    return t;
  }, [showDays, dayDates]);

  // DPR-level (custom) rows carry nothing from P6 - every value on one was typed by a user - so the
  // whole row is editable rather than just the columns the P6 rows allow. The three exceptions are
  // recomputed on every render or generated server-side, so making them editable would only accept
  // input and then discard it: S.No is the row counter, Balance is Scope - Completed, and
  // Activity ID is the DPR-nnn the backend assigns.
  const customRowEditableCells = useMemo(
    () => columns.filter(c => c !== "S.No" && c !== "Balance" && c !== "Activity ID"),
    [columns]
  );

  const columnTextColors = useMemo(() => ({
    "Actual Start": "inherit",
    "Actual Finish": "inherit",
    "Forecast Start": "inherit",
    "Forecast Finish": "inherit",
  }), []);

  const columnFontWeights = useMemo(() => ({
    "Actual Start": "bold",
    "Actual Finish": "bold",
    "Forecast Start": "bold",
    "Forecast Finish": "bold",
  }), []);

  const editableColumns = useMemo(() => {
    let cols = [
      "Description", "Priority", "Duration",
      "Plan Start", "Plan Finish", "Actual Start", "Actual Finish",
      "SO Vendor Name", "UOM", "Scope", "Completed", "Physical Progress %", "Remarks"
    ];
    // On the BESS Civil / Electrical / Testing & Commissioning sheets, Description is the
    // P6-sourced activity name and must stay read-only.
    if ((sheetType || '').startsWith('bess')) cols = cols.filter(c => c !== "Description");
    // Daily history columns are also editable numeric inputs when showDays is true.
    if (showDays) cols = [...cols, ...dayDates.map(d => d.label)];
    return cols;
  }, [sheetType, showDays, dayDates]);

  const headerStructure = useMemo(() => {
    const baselineLabel = renamePlanToBaseline ? "Baseline" : "Plan";
    const startLabel = renamePlanToBaseline ? "Start" : "Plan Start";
    const finishLabel = renamePlanToBaseline ? "Finish" : "Plan Finish";
    const dateSubRow = [
      { label: startLabel, colSpan: 1, rowSpan: 1 },
      { label: finishLabel, colSpan: 1, rowSpan: 1 },
      { label: "Start", colSpan: 1, rowSpan: 1 },
      { label: "Finish", colSpan: 1, rowSpan: 1 },
      { label: "Start", colSpan: 1, rowSpan: 1 },
      { label: "Finish", colSpan: 1, rowSpan: 1 },
    ];
    if (isBess) {
      // Activity ID | Desc | Block | Status | Priority | Duration | Vendor | UOM | Scope |
      // Completed | Physical Progress % | Balance | [Baseline] | [Actual] | [Forecast] | Remarks
      return [
        [
          { label: "Activity ID", rowSpan: 2, colSpan: 1 },
          { label: "Description", rowSpan: 2, colSpan: 1 },
          { label: "Block", rowSpan: 2, colSpan: 1 },
          { label: "Status", rowSpan: 2, colSpan: 1 },
          { label: "Priority", rowSpan: 2, colSpan: 1 },
          { label: "Duration", rowSpan: 2, colSpan: 1 },
          { label: "SO Vendor Name", rowSpan: 2, colSpan: 1 },
          { label: "UOM", rowSpan: 2, colSpan: 1 },
          { label: "Scope", rowSpan: 2, colSpan: 1 },
          { label: "Completed", rowSpan: 2, colSpan: 1 },
          { label: "Physical Progress %", rowSpan: 2, colSpan: 1 },
          { label: "Balance", rowSpan: 2, colSpan: 1 },
          { label: baselineLabel, colSpan: 2, rowSpan: 1 },
          { label: "Actual", colSpan: 2, rowSpan: 1 },
          { label: "Forecast", colSpan: 2, rowSpan: 1 },
          ...(showDays ? dayDates.map(d => ({ label: d.label, rowSpan: 2, colSpan: 1 })) : []),
          { label: "Remarks", rowSpan: 2, colSpan: 1 },
        ],
        dateSubRow,
      ];
    }
    return [
      [
        { label: "S.No", rowSpan: 2, colSpan: 1 },
        { label: "Description", rowSpan: 2, colSpan: 1 },
        { label: "Block", rowSpan: 2, colSpan: 1 },
        { label: "Status", rowSpan: 2, colSpan: 1 },
        { label: "Priority", rowSpan: 2, colSpan: 1 },
        { label: "Duration", rowSpan: 2, colSpan: 1 },
        { label: baselineLabel, colSpan: 2, rowSpan: 1 },
        { label: "Actual", colSpan: 2, rowSpan: 1 },
        { label: "Forecast", colSpan: 2, rowSpan: 1 },
        { label: "SO Vendor Name", rowSpan: 2, colSpan: 1 },
        { label: "UOM", rowSpan: 2, colSpan: 1 },
        { label: "Scope", rowSpan: 2, colSpan: 1 },
        { label: "Completed", rowSpan: 2, colSpan: 1 },
        { label: "Physical Progress %", rowSpan: 2, colSpan: 1 },
        { label: "Balance", rowSpan: 2, colSpan: 1 },
        { label: "Remarks", rowSpan: 2, colSpan: 1 },
      ],
      dateSubRow,
    ];
  }, [renamePlanToBaseline, isBess, showDays, dayDates]);

  // Build table data with heading rows inserted
  const { tableData, rowStylesMap, dataIndexMap } = useMemo(() => {
    const safeData = Array.isArray(data) ? data : [];
    const safeCustom = Array.isArray(customActivities) ? customActivities : [];

    const formatDt = (dt: any) => {
      if (!dt) return '';
      const dtStr = String(dt).split('T')[0];
      return indianDateFormat(dtStr) || dtStr;
    };

    const getDates = (r: any) => {
      let actS = '', fcstS = '', actF = '', fcstF = '';

      // An actual date on the row is shown as an actual date. This used to re-bucket any actual
      // later than the reference day into the Forecast column, which is where "today's" Actual
      // Start vanished to as soon as it was typed - and because handleDataChange then read the
      // empty Actual cell back, the next edit on the row erased it. Whether an actual may sit in
      // the future is decided once, at edit time, against the report date (the isFuture prompt),
      // exactly as DCSheetTable already does.
      // Here the reference was P6's data date, which trails the site by days - so every actual
      // entered since the last P6 sync was shown as a forecast.
      if (r.actualStart) {
        const sStr = String(r.actualStart).split('T')[0];
        actS = indianDateFormat(sStr) || sStr;
      } else if (r.forecastStart) {
        const sStr = String(r.forecastStart).split('T')[0];
        fcstS = indianDateFormat(sStr) || sStr;
      }

      // Finish Date Logic
      if (r.actualFinish) {
        const fStr = String(r.actualFinish).split('T')[0];
        actF = indianDateFormat(fStr) || fStr;
      } else if (r.forecastFinish) {
        const fStr = String(r.forecastFinish).split('T')[0];
        fcstF = indianDateFormat(fStr) || fStr;
      }

      return { actS, fcstS, actF, fcstF };
    };

    // Same actual-vs-forecast bucketing as getDates, but returns raw ISO ("YYYY-MM-DD") strings
    // instead of Indian-formatted ("DD-MMM-YY") ones, so they can be sorted for min/max.
    const getRawDates = (r: any) => {
      let actS = '', fcstS = '', actF = '', fcstF = '';

      if (r.actualStart) {
        actS = String(r.actualStart).split('T')[0];
      } else if (r.forecastStart) {
        fcstS = String(r.forecastStart).split('T')[0];
      }

      if (r.actualFinish) {
        actF = String(r.actualFinish).split('T')[0];
      } else if (r.forecastFinish) {
        fcstF = String(r.forecastFinish).split('T')[0];
      }

      return { actS, fcstS, actF, fcstF };
    };

    // Earliest/latest of a list of raw ISO date strings (lexicographic sort works for YYYY-MM-DD).
    const minRawDate = (dates: string[]): string => {
      const valid = dates.filter(d => d);
      return valid.length ? valid.sort()[0] : '';
    };
    const maxRawDate = (dates: string[]): string => {
      const valid = dates.filter(d => d);
      return valid.length ? valid.sort()[valid.length - 1] : '';
    };

    const rows: string[][] = [];
    const styles: Record<number, any> = {};
    const indexMap: number[] = []; // maps row index -> data index (-1 for heading rows)

    let currentSuperHeading = '';
    let currentMainHeading = '';
    let currentSubHeading = '';
    let sNo = 1;

    let totalScope = 0;
    let totalCompleted = 0;

    // Pre-calculate per-group totals so we can show them inline on the sub-heading row
    const groupTotals: Record<string, { uom: string; scope: number; completed: number }> = {};
    safeData.forEach(row => {
      const key = `${row.mainHeading || ''}||${row.subHeading || ''}`;
      if (!groupTotals[key]) groupTotals[key] = { uom: row.uom || '', scope: 0, completed: 0 };
      groupTotals[key].scope += Number(row.scope) || 0;
      groupTotals[key].completed += Number(row.completed) || 0;
    });

    // Pre-calculate per-group date ranges (super/main/sub heading) so heading rows can show
    // Baseline/Actual/Forecast Start = earliest date, Finish = latest date across their
    // activities - same MIN start / MAX finish rollup used for Wind and Solar.
    type DateAgg = { bs: string[]; bf: string[]; as: string[]; af: string[]; fs: string[]; ff: string[] };
    const newDateAgg = (): DateAgg => ({ bs: [], bf: [], as: [], af: [], fs: [], ff: [] });
    const pushDateAgg = (agg: DateAgg, row: any) => {
      const raw = getRawDates(row);
      if (row.planStart) agg.bs.push(String(row.planStart).split('T')[0]);
      if (row.planFinish) agg.bf.push(String(row.planFinish).split('T')[0]);
      if (raw.actS) agg.as.push(raw.actS);
      if (raw.actF) agg.af.push(raw.actF);
      if (raw.fcstS) agg.fs.push(raw.fcstS);
      if (raw.fcstF) agg.ff.push(raw.fcstF);
    };

    const superDateAgg: Record<string, DateAgg> = {};
    const mainDateAgg: Record<string, DateAgg> = {};
    const subDateAgg: Record<string, DateAgg> = {};
    safeData.forEach(row => {
      const superH = row.superHeading || '';
      const mainH = row.mainHeading || '';
      const subH = row.subHeading || '';
      if (superH) pushDateAgg(superDateAgg[superH] || (superDateAgg[superH] = newDateAgg()), row);
      if (mainH) pushDateAgg(mainDateAgg[mainH] || (mainDateAgg[mainH] = newDateAgg()), row);
      const subKey = `${mainH}||${subH}`;
      if (subH) pushDateAgg(subDateAgg[subKey] || (subDateAgg[subKey] = newDateAgg()), row);
    });

    const resolveGroupDates = (map: Record<string, DateAgg>, key: string) => {
      const agg = map[key];
      if (!agg) return { bs: '', bf: '', as: '', af: '', fs: '', ff: '' };
      return {
        bs: formatDt(minRawDate(agg.bs)),
        bf: formatDt(maxRawDate(agg.bf)),
        as: formatDt(minRawDate(agg.as)),
        af: formatDt(maxRawDate(agg.af)),
        fs: formatDt(minRawDate(agg.fs)),
        ff: formatDt(maxRawDate(agg.ff)),
      };
    };

    // Pre-calculate per-group sums of the 7 day-columns (super/main/sub heading), so the heading
    // bands show a column total for each day - same as the Solar sheets. Each activity's effective
    // day value is its own historyValues, else the back-filled dailyHistory.
    const superDaySum: Record<string, Record<string, number>> = {};
    const mainDaySum: Record<string, Record<string, number>> = {};
    const subDaySum: Record<string, Record<string, number>> = {};
    if (showDays) {
      const addDaySum = (map: Record<string, Record<string, number>>, key: string, row: any) => {
        const acc = map[key] || (map[key] = {});
        const rk = String(row.activityId || (row as any).activityID || row.description || '');
        const rowHist = row.historyValues || {};
        const hmap = dailyHistory[rk] || {};
        dayDates.forEach(dd => {
          const v = Number(rowHist[dd.iso] !== undefined ? rowHist[dd.iso] : hmap[dd.iso]) || 0;
          acc[dd.iso] = (acc[dd.iso] || 0) + v;
        });
      };
      safeData.forEach(row => {
        const superH = row.superHeading || '';
        const mainH = row.mainHeading || '';
        const subH = row.subHeading || '';
        if (superH) addDaySum(superDaySum, superH, row);
        if (mainH) addDaySum(mainDaySum, mainH, row);
        if (subH) addDaySum(subDaySum, `${mainH}||${subH}`, row);
      });
    }
    // The 7 day-cells (indices 19..25) for a heading row, from its summed map. Blank when zero.
    const daySumCells = (map: Record<string, Record<string, number>>, key: string): string[] => {
      if (!showDays) return [];
      const acc = map[key] || {};
      return dayDates.map(dd => {
        const v = acc[dd.iso] || 0;
        return v === 0 ? '' : String(Math.round(v * 1000) / 1000);
      });
    };

    safeData.forEach((row, dataIdx) => {
      const superH = row.superHeading || '';
      const mainH = row.mainHeading || '';
      const subH = row.subHeading || '';

      // Insert super heading row if changed
      if (superH && superH !== currentSuperHeading) {
        currentSuperHeading = superH;
        currentMainHeading = ''; // Reset main heading
        currentSubHeading = ''; // Reset sub heading

        const sd = resolveGroupDates(superDateAgg, superH);
        const headingRow: any[] = ["", superH, "", "", "", "", sd.bs, sd.bf, sd.as, sd.af, sd.fs, sd.ff, "", "", "", "", "", "", ""];
        if (showDays) headingRow.push(...daySumCells(superDaySum, superH));
        (headingRow as any).isCategoryRow = true;
        rows.push(headingRow);
        styles[rows.length - 1] = {
          backgroundColor: '#117864', // Distinct teal color for super heading
          color: '#ffffff',
          fontWeight: "bold",
          fontSize: "14px",
          isCategoryRow: true,
        };
        indexMap.push(-1);
      }

      // Insert main heading row if changed
      if (mainH && mainH !== currentMainHeading) {
        currentMainHeading = mainH;
        currentSubHeading = ''; // Reset sub heading

        let mainHCount = 0;
        safeData.forEach(r => { if (r.mainHeading === mainH) mainHCount++; });

        // When a row sits under a superHeading the hierarchy is explicit (e.g. Harmonic Filter's
        // Erection / Cable Laying, or a Pre-Commissioning Part's sections), so always draw the
        // mainHeading band - even for single-activity sections - otherwise a lone row silently
        // renders under whichever mainHeading band came before it, misattributing it.
        if (mainHCount >= 2 || !!superH) {
          const md = resolveGroupDates(mainDateAgg, mainH);
          const headingRow: any[] = ["", mainH, "", "", "", "", md.bs, md.bf, md.as, md.af, md.fs, md.ff, "", "", "", "", "", "", ""];
          if (showDays) headingRow.push(...daySumCells(mainDaySum, mainH));
          (headingRow as any).isCategoryRow = true;
          rows.push(headingRow);
          styles[rows.length - 1] = {
            backgroundColor: MAIN_HEADING_COLOR,
            color: MAIN_HEADING_TEXT,
            fontWeight: "bold",
            fontSize: "13px",
            isCategoryRow: true,
          };
          indexMap.push(-1);
        }
      }

      // Insert sub heading row if changed — shows inline group totals at UOM/Scope/Completed/Balance
      if (subH && subH !== currentSubHeading) {
        currentSubHeading = subH;

        let subHCount = 0;
        safeData.forEach(r => { if (r.mainHeading === currentMainHeading && r.subHeading === subH) subHCount++; });

        if (subHCount >= 2) {
          const grpKey = `${currentMainHeading}||${subH}`;
          const grpTotal = groupTotals[grpKey] || { uom: '', scope: 0, completed: 0 };
          const grpBal = Math.max(0, grpTotal.scope - grpTotal.completed);
          const gd = resolveGroupDates(subDateAgg, grpKey);

          // 19-column array: [S.No, Desc, Block, Status, Priority, Duration, PlanS, PlanF, ActS,
          //   ActF, FcstS, FcstF, Vendor, UOM, Scope, Completed, PhysicalProgress, Balance, Remarks]
          const subRow: any = [
            "", `  ${subH}`,
            "", "", "",                             // cols 2-4: Block, Status, Priority
            "",                                      // col 5: Duration
            gd.bs, gd.bf,                            // cols 6-7: Baseline Start/Finish
            gd.as, gd.af,                            // cols 8-9: Actual Start/Finish
            gd.fs, gd.ff,                            // cols 10-11: Forecast Start/Finish
            "",                                      // col 12: Vendor (empty)
            grpTotal.uom,                            // col 13: UOM
            String(grpTotal.scope || ''),        // col 14: Scope total
            String(grpTotal.completed || ''),        // col 15: Completed total
            "",                                      // col 16: Physical Progress % (per-activity only)
            String(grpBal || ''),        // col 17: Balance total
            "",                                      // col 18: Remarks
          ];
          if (showDays) subRow.push(...daySumCells(subDaySum, `${currentMainHeading}||${subH}`));
          subRow.isCategoryRow = true;
          rows.push(subRow);
          styles[rows.length - 1] = {
            backgroundColor: SUB_HEADING_COLOR,
            color: SUB_HEADING_TEXT,
            fontWeight: "700",
            fontSize: "12px",
            isCategoryRow: true,
          };
          indexMap.push(-1);
        }
      }

      // Track grand totals
      const s = Number(row.scope) || 0;
      const c = Number(row.completed) || 0;
      totalScope += s;
      totalCompleted += c;

      // Insert activity row
      const d = getDates(row);
      const arr: any = [
        String(sNo++),
        row.description || (row as any).activities || '',
        row.block || (row as any).newBlockNom || '',
        row.status || 'Not Started',
        row.priority || '',
        row.duration || '',
        formatDt(row.planStart),
        formatDt(row.planFinish),
        d.actS,
        d.actF,
        d.fcstS,
        d.fcstF,
        row.soVendorName || '',
        row.uom || '',
        row.scope || '',
        row.completed || '',
        formatPhysicalProgress(row),
        row.balance || '',
        row.remarks || '',
      ];

      // Append the 7 day-cells (indices 19..25). Prefer the row's own entered values, then fall
      // back to the shared dailyHistory map (keyed by activityId, else description).
      if (showDays) {
        const key = String(row.activityId || (row as any).activityID || row.description || '');
        const rowHist = row.historyValues || {};
        const hmap = dailyHistory[key] || {};
        dayDates.forEach(dd => {
          const raw = rowHist[dd.iso] !== undefined ? rowHist[dd.iso] : hmap[dd.iso];
          arr.push((raw === undefined || raw === null || raw === '' || Number(raw) === 0) ? '' : String(raw));
        });
      }

      if (row._cellStatuses) arr._cellStatuses = row._cellStatuses;
      arr._activityId = row.activityId || (row as any).activityID || '';
      rows.push(arr);
      indexMap.push(dataIdx);
    });

    if (safeCustom.length > 0) {
      const customCatRow: any = ["", "📝 DPR Level Activities",
        ...new Array((showDays ? 26 : 19) - 2).fill("")];
      customCatRow.isCategoryRow = true;
      rows.push(customCatRow);
      styles[rows.length - 1] = {
        backgroundColor: "#FADFAD",
        color: "#333333",
        fontWeight: "bold",
        isCategoryRow: true,
      };
      indexMap.push(-1);

      safeCustom.forEach((c, idx) => {
        // Must follow the same 19-slot default order as the P6 rows above: the display permutation
        // (orderRow) and the edit handler both index into it by position, so a shorter legacy array
        // put vendor, scope and remarks under the wrong headings.
        const customArr: any = [
          String(sNo++),
          c.description || '',
          c.block || c.extraData?.block || '',
          c.extraData?.status || c.status || 'Not Started',
          c.extraData?.priority || '',
          c.extraData?.duration || '',
          formatDt(c.plannedStart),
          formatDt(c.plannedFinish),
          formatDt(c.actualStart),
          formatDt(c.actualFinish),
          formatDt(c.forecastStart || c.extraData?.forecastStart),
          formatDt(c.forecastFinish || c.extraData?.forecastFinish),
          c.extraData?.soVendorName || '',
          c.uom || 'Nos',
          String(c.scope || 0),
          String(c.cumulative || 0),
          // No P6 source on a custom row, so physical progress is whatever the user typed or calculated from cumulative / scope.
          c.extraData?.physicalProgress !== undefined && c.extraData?.physicalProgress !== null && c.extraData?.physicalProgress !== ''
            ? String(c.extraData.physicalProgress)
            : ((c.scope || 0) > 0 ? String(Math.round(((c.cumulative || 0) / c.scope) * 100)) : ''),
          String(Math.max(0, (c.scope || 0) - (c.cumulative || 0))),
          c.remarks || '',
        ];
        // Day entries for a custom row live in extraData.historyValues - the same map the DP Qty
        // rollup in BessDashboard already reads them from.
        if (showDays) {
          const hv = c.extraData?.historyValues || {};
          dayDates.forEach(dd => {
            const raw = hv[dd.iso];
            customArr.push((raw === undefined || raw === null || raw === '' || Number(raw) === 0) ? '' : String(raw));
          });
        }
        customArr._isCustomRow = true;
        customArr._customId = c.id;
        customArr._activityId = c.activityId || '';

        rows.push(customArr);
        styles[rows.length - 1] = { backgroundColor: "#FFFBEB", editableCells: customRowEditableCells };
        indexMap.push(-3 - idx); // Custom row index mapping

        totalScope += Number(c.scope) || 0;
        totalCompleted += Number(c.cumulative) || 0;
      });
    }

    // Grand Total Row — hidden when sub-heading totals already summarise the data
    // (kept for non-BESS PSS sheets that do not use sub-heading totals)


    // Dynamically apply green or blue based on actual vs forecast
    Object.keys(styles).forEach((rIdxStr) => {
      const rIdx = Number(rIdxStr);
      if (styles[rIdx].isCategoryRow || styles[rIdx].isTotalRow) return;
    });

    safeData.forEach((row, dataIdx) => {
      const rIdx = indexMap.indexOf(dataIdx);
      if (rIdx === -1) return;

      const parseDate = (dStr: string) => {
        if (!dStr || dStr === '-') return null;
        if (dStr.includes('T')) dStr = dStr.split('T')[0];
        const parts = dStr.split('-');
        if (parts.length === 3) {
          if (parts[0].length === 4) return new Date(dStr);
          const day = parseInt(parts[0]);
          const mStr = parts[1];
          const yrShort = parseInt(parts[2]);
          const mNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
          const mIdx = mNames.indexOf(mStr);
          if (mIdx === -1) return new Date(dStr);
          const yr = yrShort + (yrShort < 70 ? 2000 : 1900);
          return new Date(yr, mIdx, day);
        }
        return null;
      };

      const isValidDate = (dStr: string | null | undefined) => dStr && typeof dStr === 'string' && dStr.trim() !== '' && dStr !== '-';

      const rowColors: any = {};
      if (isValidDate(row.actualStart)) {
        rowColors["Actual Start"] = "#16a34a";
      }
      if (isValidDate(row.actualFinish)) {
        rowColors["Actual Finish"] = "#16a34a";
      }
      if (isValidDate(row.forecastStart)) {
        rowColors["Forecast Start"] = "#2563eb";
      }
      if (isValidDate(row.forecastFinish)) {
        rowColors["Forecast Finish"] = "#2563eb";
      }

      if (Object.keys(rowColors).length > 0) {
        if (!styles[rIdx]) styles[rIdx] = {};
        styles[rIdx]._cellColors = rowColors;
      }
    });

    // Rows were built in the default column order; permute to the BESS display order if needed.
    const finalRows = isBess ? rows.map(orderRow) : rows;
    return { tableData: finalRows, rowStylesMap: styles, dataIndexMap: indexMap };
  }, [data, customActivities, yesterday, dataDate, isBess, orderRow, showDays, dayDates, dailyHistory, customRowEditableCells]);

  const handleInlineAdd = useCallback(() => {
    if (onAddCustomActivity) {
      onAddCustomActivity({
        sheetType: sheetType,
        description: 'New DPR Activity',
        uom: 'Nos',
        scope: 0,
      }, true);
    }
  }, [onAddCustomActivity, sheetType]);

  // Read the 7 edited day-cells (default-order indices 19..25) back into a { iso: value } map so
  // the user's daily entries persist and can mirror into the DP Qty date columns.
  const readDayValues = useCallback((row: any[]): Record<string, string> | undefined => {
    if (!showDays) return undefined;
    const hv: Record<string, string> = {};
    dayDates.forEach((dd, i) => {
      const v = row[DAY_START_IDX + i];
      hv[dd.iso] = (v === undefined || v === null) ? '' : String(v);
    });
    return hv;
  }, [showDays, dayDates]);

  const handleDataChange = useCallback((incomingData: any[][]) => {
    // The table renders BESS sheets in a permuted column order; map each edited row back to the
    // default order the logic below expects.
    const newData = isBess ? incomingData.map(toDefaultRow) : incomingData;
    const safeData = Array.isArray(data) ? data : [];
    const updated = [...safeData];
    let hasChanges = false;
    const customRowChanges: any[] = [];

    newData.forEach((row, rowIdx) => {
      if (rowIdx >= dataIndexMap.length) return;
      const dataIdx = dataIndexMap[rowIdx];

      if ((row as any)._isCustomRow) {
        customRowChanges.push(row);
        return;
      }

      if (dataIdx < 0) return; // Skip heading and total rows

      const original = safeData[dataIdx];
      const scope = Number(row[14]) || 0;
      const prevScope = Number(original.scope) || 0;
      const prevCompleted = Number(original.completed) || 0;
      const prevProgressStr = formatPhysicalProgress(original);

      const enteredCompleted = row[15] !== undefined && row[15] !== null && row[15] !== '' ? Number(row[15]) : prevCompleted;
      const enteredProgressStr = row[16] !== undefined && row[16] !== null ? String(row[16]).trim().replace('%', '') : '';

      const actId = String(original.activityId || (original as any).activityID || original.description || '').trim();
      let prevHist: Record<string, any> = original.historyValues || {};
      if (!prevHist || Object.keys(prevHist).length === 0) {
        prevHist = dailyHistory[actId] || dailyHistory[String((original as any).activityObjectId || '')] || {};
      }

      const newHistoryValues = readDayValues(row);
      const historyChanged = showDays && dayDates.some((dd, i) => {
        const rawPrev = prevHist[dd.iso];
        const prevStr = (rawPrev === undefined || rawPrev === null || rawPrev === '' || Number(rawPrev) === 0) ? '' : String(rawPrev).trim();
        const newStr = (row[DAY_START_IDX + i] === undefined || row[DAY_START_IDX + i] === null) ? '' : String(row[DAY_START_IDX + i]).trim();
        return prevStr !== newStr;
      });

      const lastEdited = String((row as any)._lastEditedCol || '').toLowerCase().trim();
      const isProgressEdit = lastEdited.includes('physical progress');
      const isCompletedEdit = lastEdited === 'completed' || lastEdited.startsWith('completed as on');
      const isScopeEdit = lastEdited === 'scope';

      const progressChanged = enteredProgressStr !== '' && enteredProgressStr !== prevProgressStr;
      const completedChanged = enteredCompleted !== prevCompleted;
      const scopeChanged = scope !== prevScope;

      let completed: number = prevCompleted;
      let percentCompleteVal: number | undefined = original.percentComplete;
      let displayProgressStr: string = enteredProgressStr;

      if (isProgressEdit || (progressChanged && !isCompletedEdit && !isScopeEdit && !historyChanged)) {
        // Physical Progress was directly entered/changed: calculate completed based on percentage & scope
        const p = parseFloat(enteredProgressStr);
        if (!isNaN(p)) {
          const clampedP = Math.min(100, Math.max(0, p));
          completed = percentToCompleted(clampedP, scope);
          displayProgressStr = String(clampedP);
          percentCompleteVal = clampedP;
        } else {
          completed = prevCompleted;
          displayProgressStr = '';
          percentCompleteVal = undefined;
        }
      } else if (isCompletedEdit || (completedChanged && !isProgressEdit && !isScopeEdit && !historyChanged)) {
        // Completed was directly entered/changed: recalculate progress based on completed / scope
        completed = Math.max(0, enteredCompleted);
        displayProgressStr = completedToPercent(completed, scope);
        percentCompleteVal = Number(displayProgressStr);
      } else if (isScopeEdit || (scopeChanged && !isProgressEdit && !isCompletedEdit && !historyChanged)) {
        // Scope was changed: recalculate progress based on existing completed
        completed = prevCompleted;
        displayProgressStr = completedToPercent(completed, scope);
        percentCompleteVal = Number(displayProgressStr);
      } else if (historyChanged) {
        // Day cells were edited: roll up into completed, then recalculate progress
        const initialDaySum = dayDates.reduce((s, dd) => s + (Number(prevHist[dd.iso]) || 0), 0);
        const newDaySum = dayDates.reduce((s, _dd, i) => s + (Number(row[DAY_START_IDX + i]) || 0), 0);
        completed = Math.max(0, prevCompleted - initialDaySum + newDaySum);
        displayProgressStr = completedToPercent(completed, scope);
        percentCompleteVal = Number(displayProgressStr);
      } else {
        completed = showDays ? prevCompleted : (Number(row[15]) || 0);
        if (enteredProgressStr !== '') {
          const p = parseFloat(enteredProgressStr);
          percentCompleteVal = !isNaN(p) ? p : original.percentComplete;
          displayProgressStr = enteredProgressStr;
        } else {
          percentCompleteVal = original.percentComplete;
          displayProgressStr = prevProgressStr;
        }
      }

      // ── An Actual Finish on a row that is not fully complete ──────────────────────────
      //
      // P6 will not mark an activity actually finished while its resource assignment still has
      // remaining units. Pushing "finished on 30-Jul" together with "0 of 1 complete, balance 1"
      // makes P6 accept the start and the percentage, silently drop the finish date, and still
      // answer 200 - so the push was reported as successful while the Actual Finish never landed
      // and P6 showed a computed finish instead (activity A57250, entry #3952).
      //
      // Rather than send a contradiction, settle it with the person entering it: confirming
      // completes the row, cancelling leaves the finish date off.
      const finishDecision = confirmFinishWithBalance(
        row[9] || '', indianDateFormat(original.actualFinish) || '', completed, scope,
      );
      const cancelFinish = finishDecision === 'cancel';
      if (finishDecision === 'complete') {
        completed = scope;
        displayProgressStr = '100';
        percentCompleteVal = 100;
      }

      const balance = Math.max(0, Number((scope - completed).toFixed(2)));

      if (
        original.description !== row[1] ||
        original.status !== row[3] ||
        original.priority !== row[4] ||
        original.duration !== row[5] ||
        original.planStart !== row[6] ||
        original.planFinish !== row[7] ||
        original.actualStart !== row[8] ||
        original.actualFinish !== row[9] ||
        original.forecastStart !== row[10] ||
        original.forecastFinish !== row[11] ||
        original.soVendorName !== row[12] ||
        original.uom !== row[13] ||
        Number(original.scope) !== scope ||
        Number(original.completed) !== completed ||
        original.remarks !== row[18] ||
        prevProgressStr !== displayProgressStr ||
        historyChanged ||
        original._cellStatuses !== (row as any)._cellStatuses
      ) {
        hasChanges = true;
        const editedStart = row[8] || '';
        const editedFinish = row[9] || '';
        const editedFcstStart = row[10] || '';
        const editedFcstFinish = row[11] || '';

        const prevEffectiveStart = indianDateFormat(original.actualStart) || '';
        const prevEffectiveFinish = indianDateFormat(original.actualFinish) || '';
        const prevFcstStart = indianDateFormat(original.forecastStart) || '';
        const prevFcstFinish = indianDateFormat(original.forecastFinish) || '';

        let newStatus = row[3] || original.status || 'Not Started';
        let actStartChanged = false;

        let newActualStart = original.actualStart || '';
        if (editedStart !== prevEffectiveStart) {
          actStartChanged = true;
          let isFuture = false;
          if (editedStart && (today || yesterday)) {
            const editedDateStr = parseDateToIso(String(editedStart));
            const calDateStr = parseDateToIso(String(today || yesterday || ''));
            if (editedDateStr > calDateStr) isFuture = true;
          }
          if (isFuture) {
            if (window.confirm("You selected a future date for an Actual Start.\nP6 only accepts past/present dates for Actuals.\n\nClick OK to automatically save it as a Forecast date instead.\nClick Cancel to undo your change.")) {
              newActualStart = editedStart;
            }
          } else {
            newActualStart = editedStart;
          }
        }

        let actFinishChanged = false;
        let newActualFinish = original.actualFinish || '';
        if (editedFinish !== prevEffectiveFinish) {
          actFinishChanged = true;
          let isFuture = false;
          if (editedFinish && (today || yesterday)) {
            const editedDateStr = parseDateToIso(String(editedFinish));
            const calDateStr = parseDateToIso(String(today || yesterday || ''));
            if (editedDateStr > calDateStr) isFuture = true;
          }
          if (cancelFinish) {
            // The balance prompt above was declined: keep the row's own dates untouched.
            newActualFinish = original.actualFinish || '';
          } else if (isFuture) {
            if (window.confirm("You selected a future date for an Actual Finish.\nP6 only accepts past/present dates for Actuals.\n\nClick OK to automatically save it as a Forecast date instead.\nClick Cancel to undo your change.")) {
              newActualFinish = editedFinish;
            }
          } else {
            newActualFinish = editedFinish;
          }
        }

        let newForecastStart = original.forecastStart || '';
        if (editedFcstStart !== prevFcstStart) {
          newForecastStart = editedFcstStart;
        }

        let newForecastFinish = original.forecastFinish || '';
        if (editedFcstFinish !== prevFcstFinish) {
          newForecastFinish = editedFcstFinish;
        }

        if (actFinishChanged && newActualFinish) {
          newStatus = 'Completed';
        } else if (actStartChanged && newActualStart && newStatus === 'Not Started') {
          newStatus = 'In Progress';
        }

        updated[dataIdx] = {
          ...original,
          _cellStatuses: (row as any)._cellStatuses,
          description: row[1] || '',
          status: newStatus,
          priority: row[4] || '',
          duration: row[5] || '',
          planStart: row[6] || '',
          planFinish: row[7] || '',
          actualStart: newActualStart,
          actualFinish: newActualFinish,
          forecastStart: newForecastStart,
          forecastFinish: newForecastFinish,
          soVendorName: row[12] || '',
          uom: row[13] || '',
          scope: String(scope),
          completed: String(completed),
          balance: String(balance),
          percentComplete: percentCompleteVal,
          physicalProgress: displayProgressStr,
          physicalPercentComplete: percentCompleteVal,
          remarks: row[18] || '',
          ...(showDays ? { historyValues: newHistoryValues } : {}),
        };
      }
    });

    if (hasChanges) {
      setData(updated);
    }

    if (onEditCustomActivity && customRowChanges.length > 0) {
      customRowChanges.forEach(row => {
        const customId = (row as any)._customId;
        if (!customId) return;
        const c = customActivities.find(x => x.id === customId);
        if (!c) return;

        const newDesc = row[1] || '';
        const newBlock = row[2] || '';
        let newStatus = row[3] || 'Not Started';
        const newPriority = row[4] || '';
        const newDuration = row[5] || '';
        // The grid shows dates as dd-MMM-yy, so every date cell read back off a row is in that
        // format. The API stores only YYYY-MM-DD and discards anything else, so convert here -
        // sending the displayed text through was silently wiping the dates on save.
        const newPlanStart = parseDateToIso(row[6] || '');
        const newPlanFinish = parseDateToIso(row[7] || '');
        const newActStartShown = row[8] || '';
        const newActStart = parseDateToIso(newActStartShown);
        let finalCustomActStart = c.actualStart || '';
        let customActStartChanged = false;
        if (newActStartShown !== (indianDateFormat(c.actualStart) || '')) {
          customActStartChanged = true;
          let isFuture = false;
          if (newActStart && (today || yesterday)) {
            const editedDateStr = parseDateToIso(String(newActStart));
            const calDateStr = parseDateToIso(String(today || yesterday || ''));
            if (editedDateStr > calDateStr) isFuture = true;
          }
          if (isFuture) {
            if (window.confirm("You selected a future date for an Actual Start.\nP6 only accepts past/present dates for Actuals.\n\nClick OK to automatically save it as a Forecast date instead.\nClick Cancel to undo your change.")) {
              finalCustomActStart = newActStart;
            }
          } else {
            finalCustomActStart = newActStart;
          }
        }

        const newActFinishShown = row[9] || '';
        const newActFinish = parseDateToIso(newActFinishShown);
        let finalCustomActFinish = c.actualFinish || '';
        let customActFinishChanged = false;
        if (newActFinishShown !== (indianDateFormat(c.actualFinish) || '')) {
          customActFinishChanged = true;
          let isFuture = false;
          if (newActFinish && (today || yesterday)) {
            const editedDateStr = parseDateToIso(String(newActFinish));
            const calDateStr = parseDateToIso(String(today || yesterday || ''));
            if (editedDateStr > calDateStr) isFuture = true;
          }
          if (isFuture) {
            if (window.confirm("You selected a future date for an Actual Finish.\nP6 only accepts past/present dates for Actuals.\n\nClick OK to automatically save it as a Forecast date instead.\nClick Cancel to undo your change.")) {
              finalCustomActFinish = newActFinish;
            }
          } else {
            finalCustomActFinish = newActFinish;
          }
        }
        const newFcstStart = parseDateToIso(row[10] || '');
        const newFcstFinish = parseDateToIso(row[11] || '');
        const newVendor = row[12] || '';
        const newUom = row[13] || 'Nos';
        const prevScope = Number(c.scope) || 0;
        const prevComp = Number(c.cumulative) || 0;
        const prevPhysicalStr = c.extraData?.physicalProgress !== undefined && c.extraData?.physicalProgress !== null
          ? String(c.extraData.physicalProgress).trim().replace('%', '')
          : (prevScope > 0 ? String(Math.round((prevComp / prevScope) * 100)) : '');

        const newScopeNum = Number(row[14]) || 0;
        const enteredCompNum = row[15] !== undefined && row[15] !== null && row[15] !== '' ? Number(row[15]) : prevComp;
        const enteredPhysicalStr = row[16] !== undefined && row[16] !== null ? String(row[16]).trim().replace('%', '') : '';

        const newRemarks = row[18] || '';
        const newCustomHistory = readDayValues(row);

        if (customActFinishChanged && finalCustomActFinish) {
          newStatus = 'Completed';
        } else if (customActStartChanged && finalCustomActStart && newStatus === 'Not Started') {
          newStatus = 'In Progress';
        }

        const prevHistory = c.extraData?.historyValues || {};
        const historyChanged = showDays && !!newCustomHistory && dayDates.some(
          dd => String(newCustomHistory[dd.iso] ?? '') !== String(prevHistory[dd.iso] ?? '')
        );

        const customLastEdited = String((row as any)._lastEditedCol || '').toLowerCase().trim();
        const isCustomProgressEdit = customLastEdited.includes('physical progress');
        const isCustomCompletedEdit = customLastEdited === 'completed' || customLastEdited.startsWith('completed as on');
        const isCustomScopeEdit = customLastEdited === 'scope';

        const physicalChanged = enteredPhysicalStr !== '' && enteredPhysicalStr !== prevPhysicalStr;
        const completedChanged = enteredCompNum !== prevComp;
        const scopeChanged = newScopeNum !== prevScope;

        let finalCompNum = prevComp;
        let finalPhysicalStr = enteredPhysicalStr;

        if (isCustomProgressEdit || (physicalChanged && !isCustomCompletedEdit && !isCustomScopeEdit && !historyChanged)) {
          const p = parseFloat(enteredPhysicalStr);
          if (!isNaN(p)) {
            const clampedP = Math.min(100, Math.max(0, p));
            finalCompNum = percentToCompleted(clampedP, newScopeNum);
            finalPhysicalStr = String(clampedP);
          } else {
            finalCompNum = prevComp;
            finalPhysicalStr = '';
          }
        } else if (isCustomCompletedEdit || (completedChanged && !isCustomProgressEdit && !isCustomScopeEdit && !historyChanged)) {
          finalCompNum = Math.max(0, enteredCompNum);
          finalPhysicalStr = completedToPercent(finalCompNum, newScopeNum);
        } else if (isCustomScopeEdit || (scopeChanged && !isCustomProgressEdit && !isCustomCompletedEdit && !historyChanged)) {
          finalCompNum = prevComp;
          finalPhysicalStr = completedToPercent(finalCompNum, newScopeNum);
        } else if (historyChanged) {
          const initialDaySum = dayDates.reduce((s, dd) => s + (Number(prevHistory[dd.iso]) || 0), 0);
          const newDaySum = dayDates.reduce((s, dd) => s + (Number(newCustomHistory?.[dd.iso]) || 0), 0);
          finalCompNum = Math.max(0, prevComp - initialDaySum + newDaySum);
          finalPhysicalStr = completedToPercent(finalCompNum, newScopeNum);
        } else {
          finalCompNum = enteredCompNum;
          finalPhysicalStr = enteredPhysicalStr !== '' ? enteredPhysicalStr : prevPhysicalStr;
        }

        const hasCustomChanges =
          newDesc !== (c.description || '') ||
          newBlock !== (c.block || c.extraData?.block || '') ||
          newStatus !== (c.extraData?.status || 'Not Started') ||
          newPriority !== (c.extraData?.priority || '') ||
          newDuration !== (c.extraData?.duration || '') ||
          newVendor !== (c.extraData?.soVendorName || '') ||
          newUom !== (c.uom || '') ||
          newScopeNum !== prevScope ||
          finalCompNum !== prevComp ||
          finalPhysicalStr !== prevPhysicalStr ||
          newPlanStart !== (c.plannedStart || '') ||
          newPlanFinish !== (c.plannedFinish || '') ||
          finalCustomActStart !== (c.actualStart || '') ||
          finalCustomActFinish !== (c.actualFinish || '') ||
          newFcstStart !== (c.extraData?.forecastStart || '') ||
          newFcstFinish !== (c.extraData?.forecastFinish || '') ||
          newRemarks !== (c.remarks || '') ||
          historyChanged;

        if (hasCustomChanges) {
          onEditCustomActivity({
            id: customId,
            sheetType: sheetType,
            description: newDesc,
            block: newBlock,
            status: newStatus,
            uom: newUom,
            scope: newScopeNum,
            cumulative: finalCompNum,
            plannedStart: newPlanStart,
            plannedFinish: newPlanFinish,
            actualStart: finalCustomActStart,
            actualFinish: finalCustomActFinish,
            remarks: newRemarks,
            extraData: {
              ...c.extraData,
              status: newStatus,
              block: newBlock,
              priority: newPriority,
              duration: newDuration,
              soVendorName: newVendor,
              // No columns of their own on dpr_custom_activities, so these ride in extraData.
              forecastStart: newFcstStart,
              forecastFinish: newFcstFinish,
              physicalProgress: finalPhysicalStr,
              ...(newCustomHistory ? { historyValues: newCustomHistory } : {}),
            }
          });
        }
      });
    }
  }, [data, setData, dataIndexMap, customActivities, onEditCustomActivity, sheetType, yesterday, dataDate, isBess, toDefaultRow, showDays, readDayValues, dailyHistory, dayDates]);

  // Deleting a DPR-level activity follows the same rule as uploading one: the site that put the
  // activity on the sheet is the site that has to be able to take it back off. Gating delete on
  // PMAG/admin alone left a supervisor who had just uploaded a batch with no way to correct it.
  // A locked sheet - someone else's for this date - still allows managing the activity list, the
  // same exception the Upload Activities button already makes; only the figures stay locked.
  const canManageActivityRows = isPmagOrAdmin || activityActionsWhenLocked;
  const canDeleteActivityRows =
    !!onDeleteCustomActivity && canManageActivityRows && (!isLocked || activityActionsWhenLocked);

  const handleRowDelete = useCallback((index: number) => {
    const row = tableData[index];
    if (!row || !(row as any)._isCustomRow || !onDeleteCustomActivity) return;
    const customId = (row as any)._customId;
    if (!customId) return;

    // Confirm first - the activity goes with every figure entered against it, and there is no undo
    // on the sheet.
    const name = String(row[isBess ? bessOrder.indexOf(1) : 1] || '').trim();
    const message = name
      ? `Delete the DPR activity "${name}"? Any progress entered against it will be lost.`
      : 'Delete this DPR activity? Any progress entered against it will be lost.';
    if (!window.confirm(message)) return;

    onDeleteCustomActivity(customId);
  }, [tableData, onDeleteCustomActivity, isBess, bessOrder]);

  return (
    <div className="space-y-4 w-full h-full flex-1 min-h-0 flex flex-col">
      {(!isLocked || activityActionsWhenLocked) && (onAddCustomActivity || onBulkUploadActivities) && (
        <div className="flex justify-end px-2 gap-2">
          {onBulkUploadActivities && (
            <button
              onClick={onBulkUploadActivities}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors shadow-sm"
            >
              <Upload className="w-4 h-4" />
              Upload Activities
            </button>
          )}
          {onAddCustomActivity && (
            <button
              onClick={handleInlineAdd}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
            >
              <Plus className="w-4 h-4" />
              Add DPR Activity
            </button>
          )}
        </div>
      )}

      <StyledExcelTable
        title={title}
        columns={columns}
        data={tableData}
        onDataChange={handleDataChange}
        onSave={onSave || (() => { })}
        onSubmit={onSubmit}
        onPush={onPush}
        isReadOnly={isLocked}
        editableColumns={editableColumns}
        columnTypes={columnTypes}
        columnWidths={columnWidths}
        headerStructure={headerStructure}
        rowStyles={rowStylesMap}
        status={status}
        onExportAll={onExportAll}
        columnTextColors={columnTextColors}
        columnFontWeights={columnFontWeights}
        cellTextColors={useMemo(() => {
          const c: any = {};
          Object.keys(rowStylesMap).forEach(idx => {
            if (rowStylesMap[idx] && rowStylesMap[idx]._cellColors) {
              c[idx] = rowStylesMap[idx]._cellColors;
            }
          });
          return c;
        }, [rowStylesMap])}
        projectId={projectId}
        sheetType={sheetType}
        onRowDelete={canDeleteActivityRows ? handleRowDelete : undefined}
        rowIsEditable={(idx) => {
          const row = tableData[idx] as any;
          return row && !row.isCategoryRow && !row.isTotalRow;
        }}
        rowIsDeletable={(idx) => !!(tableData[idx] as any)?._isCustomRow && canManageActivityRows}
        // The bin sits in the Remarks cell of the row it deletes. As a trailing Actions column it
        // was past the seven day-columns on the BESS sheets, off the right-hand edge of the scroll,
        // so in practice nobody ever saw it.
        rowActionsColumn="Remarks"
      />
    </div>
  );
});


