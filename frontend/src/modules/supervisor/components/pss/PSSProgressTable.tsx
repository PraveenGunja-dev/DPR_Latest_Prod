import React, { useMemo, useCallback, memo } from 'react';
import { StyledExcelTable } from "@/components/StyledExcelTable";
import { indianDateFormat, parseDateToIso } from "@/services/dprService";
import { Plus } from "lucide-react";
import { useAuth } from '@/modules/auth/contexts/AuthContext';

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
//            16 Balance 17 Remarks
const BESS_COL_ORDER: (number | 'ACT')[] = ['ACT', 1, 2, 3, 4, 5, 12, 13, 14, 15, 16, 6, 7, 8, 9, 10, 11, 17];
const ROW_META_KEYS = ['_cellStatuses', '_isCustomRow', '_customId', '_activityId', 'isCategoryRow', 'isTotalRow'];

interface PSSProgressTableProps {
  data: PSSProgressData[];
  setData: (data: PSSProgressData[]) => void;
  onSave?: () => void;
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

  customActivities?: any[];
  onAddCustomActivity?: (activity: any, silent?: boolean) => void;
  onEditCustomActivity?: (activity: any) => void;
  onDeleteCustomActivity?: (id: number) => void;
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
  yesterday,
  today,
  dataDate
}: PSSProgressTableProps) => {
  const { user } = useAuth();
  const userRole = (user?.role || user?.Role || '').toLowerCase();
  const isPmagOrAdmin = userRole.includes('pmag') || userRole.includes('admin');

  const isBess = (sheetType || '').startsWith('bess');

  // Reorder a default-order row array into the BESS display order (and put the activity id in
  // column 0). No-op for non-BESS sheets. Meta props (_cellStatuses, isCategoryRow, ...) carry over.
  const orderRow = useCallback((arr: any): any => {
    if (!isBess) return arr;
    const out: any = BESS_COL_ORDER.map(c => c === 'ACT' ? (arr._activityId ?? '') : arr[c]);
    ROW_META_KEYS.forEach(k => { if (arr[k] !== undefined) out[k] = arr[k]; });
    return out;
  }, [isBess]);

  // Inverse of orderRow: map a BESS display-order row (as received from the table on edit) back to
  // the default order the change handler expects.
  const toDefaultRow = useCallback((row: any): any => {
    if (!isBess) return row;
    const out: any = new Array(18).fill('');
    BESS_COL_ORDER.forEach((c, pos) => { if (c !== 'ACT') out[c] = row[pos]; });
    ['_cellStatuses', '_isCustomRow', '_customId'].forEach(k => { if (row[k] !== undefined) out[k] = row[k]; });
    return out;
  }, [isBess]);

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
    "Balance",
    "Remarks",
    ];
    if (isBess) return BESS_COL_ORDER.map(c => c === 'ACT' ? "Activity ID" : base[c]);
    return base;
  }, [isBess]);

  const columnWidths = useMemo(() => ({
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
    "Balance": 80,
    "Remarks": 180,
  }), []);

  const columnTypes = useMemo(() => ({
    "Activity ID": "text" as const,
    "S.No": "text" as const,
    "Description": "text" as const,
    "Block": "text" as const,
    "Status": "text" as const,
    "Priority": "text" as const,
    "Duration": "text" as const,
    "Plan Start": "text" as const,
    "Plan Finish": "text" as const,
    "Actual Start": "date" as const,
    "Actual Finish": "date" as const,
    "Forecast Start": "date" as const,
    "Forecast Finish": "date" as const,
    "SO Vendor Name": "alphabet" as const,
    "UOM": "text" as const,
    "Scope": "number" as const,
    "Completed": "number" as const,
    "Balance": "number" as const,
    "Remarks": "text" as const,
  }), []);

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
    const cols = [
      "Description", "Priority", "Duration",
      "Plan Start", "Plan Finish", "Actual Start", "Actual Finish",
      "SO Vendor Name", "UOM", "Scope", "Completed", "Remarks"
    ];
    // On the BESS Civil / Electrical / Testing & Commissioning sheets, Description is the
    // P6-sourced activity name and must stay read-only.
    if ((sheetType || '').startsWith('bess')) return cols.filter(c => c !== "Description");
    return cols;
  }, [sheetType]);

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
      // Completed | Balance | [Baseline] | [Actual] | [Forecast] | Remarks
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
          { label: "Balance", rowSpan: 2, colSpan: 1 },
          { label: baselineLabel, colSpan: 2, rowSpan: 1 },
          { label: "Actual", colSpan: 2, rowSpan: 1 },
          { label: "Forecast", colSpan: 2, rowSpan: 1 },
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
        { label: "Balance", rowSpan: 2, colSpan: 1 },
        { label: "Remarks", rowSpan: 2, colSpan: 1 },
      ],
      dateSubRow,
    ];
  }, [renamePlanToBaseline, isBess]);

  // Build table data with heading rows inserted
  const { tableData, rowStylesMap, dataIndexMap } = useMemo(() => {
    const safeData = Array.isArray(data) ? data : [];
    const safeCustom = Array.isArray(customActivities) ? customActivities : [];

    const formatDt = (dt: any) => {
      if (!dt) return '';
      const dtStr = String(dt).split('T')[0];
      return indianDateFormat(dtStr) || dtStr;
    };

    const parsedYesterdayStr = yesterday ? String(yesterday).split('T')[0] : '';
    // Prefer P6's own data date over the DPR "yesterday" reference, same as DCSheetTable.
    const referenceDateStr = dataDate ? String(dataDate).split('T')[0] : parsedYesterdayStr;

    const getDates = (r: any) => {
      let actS = '', fcstS = '', actF = '', fcstF = '';

      // Start Date Logic
      if (r.actualStart) {
        const sStr = String(r.actualStart).split('T')[0];
        const sIso = parseDateToIso(sStr);
        if (referenceDateStr && sIso <= referenceDateStr) {
          actS = indianDateFormat(sStr) || sStr;
        } else {
          fcstS = indianDateFormat(sStr) || sStr;
        }
      } else if (r.forecastStart) {
        const sStr = String(r.forecastStart).split('T')[0];
        fcstS = indianDateFormat(sStr) || sStr;
      }

      // Finish Date Logic
      if (r.actualFinish) {
        const fStr = String(r.actualFinish).split('T')[0];
        const fIso = parseDateToIso(fStr);
        if (referenceDateStr && fIso <= referenceDateStr) {
          actF = indianDateFormat(fStr) || fStr;
        } else {
          fcstF = indianDateFormat(fStr) || fStr;
        }
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
        const sStr = String(r.actualStart).split('T')[0];
        const sIso = parseDateToIso(sStr);
        if (referenceDateStr && sIso <= referenceDateStr) actS = sStr;
        else fcstS = sStr;
      } else if (r.forecastStart) {
        fcstS = String(r.forecastStart).split('T')[0];
      }

      if (r.actualFinish) {
        const fStr = String(r.actualFinish).split('T')[0];
        const fIso = parseDateToIso(fStr);
        if (referenceDateStr && fIso <= referenceDateStr) actF = fStr;
        else fcstF = fStr;
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
      groupTotals[key].scope     += Number(row.scope)     || 0;
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
        const headingRow = ["", superH, "", "", "", "", sd.bs, sd.bf, sd.as, sd.af, sd.fs, sd.ff, "", "", "", ""];
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
          const headingRow = ["", mainH, "", "", "", "", md.bs, md.bf, md.as, md.af, md.fs, md.ff, "", "", "", ""];
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
          const grpKey   = `${currentMainHeading}||${subH}`;
          const grpTotal = groupTotals[grpKey] || { uom: '', scope: 0, completed: 0 };
          const grpBal   = Math.max(0, grpTotal.scope - grpTotal.completed);
          const gd       = resolveGroupDates(subDateAgg, grpKey);

          // 18-column array: [S.No, Desc, Block, Status, Priority, Duration, PlanS, PlanF,
          //                    ActS, ActF, FcstS, FcstF, Vendor, UOM, Scope, Completed, Balance, Remarks]
          const subRow: any = [
            "", `  ${subH}`,
            "", "", "",                             // cols 2-4: Block, Status, Priority
            "",                                      // col 5: Duration
            gd.bs, gd.bf,                            // cols 6-7: Baseline Start/Finish
            gd.as, gd.af,                            // cols 8-9: Actual Start/Finish
            gd.fs, gd.ff,                            // cols 10-11: Forecast Start/Finish
            "",                                      // col 12: Vendor (empty)
            grpTotal.uom,                            // col 13: UOM
            String(grpTotal.scope     || ''),        // col 14: Scope total
            String(grpTotal.completed || ''),        // col 15: Completed total
            String(grpBal             || ''),        // col 16: Balance total
            "",                                      // col 17: Remarks
          ];
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
        row.balance || '',
        row.remarks || '',
      ];

      if (row._cellStatuses) arr._cellStatuses = row._cellStatuses;
      arr._activityId = row.activityId || (row as any).activityID || '';
      rows.push(arr);
      indexMap.push(dataIdx);
    });

    if (safeCustom.length > 0) {
      const customCatRow: any = ["", "📝 DPR Level Activities", "", "", "", "", "", "", "", "", "", "", "", "", "", ""];
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
        const customArr: any = [
          String(sNo++),
          c.description || '',
          c.block || c.extraData?.block || '',
          c.extraData?.status || 'Not Started',
          c.extraData?.priority || '',
          c.extraData?.duration || '',
          formatDt(c.plannedStart),
          formatDt(c.plannedFinish),
          formatDt(c.actualStart),
          formatDt(c.actualFinish),
          c.extraData?.soVendorName || '',
          c.uom || 'Nos',
          String(c.scope || 0),
          String(c.cumulative || 0),
          String(Math.max(0, (c.scope || 0) - (c.cumulative || 0))),
          c.remarks || '',
        ];
        customArr._isCustomRow = true;
        customArr._customId = c.id;
        customArr._activityId = c.activityId || '';

        rows.push(customArr);
        styles[rows.length - 1] = { backgroundColor: "#FFFBEB" };
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
  }, [data, customActivities, yesterday, dataDate, isBess, orderRow]);

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
      const completed = Number(row[15]) || 0;

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
        original.remarks !== row[17] ||
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
          if (editedStart && (dataDate || yesterday)) {
            const editedDateStr = new Date(editedStart).toISOString().split('T')[0];
            const calDateStr = dataDate ? new Date(dataDate).toISOString().split('T')[0] : new Date(yesterday).toISOString().split('T')[0];
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
          if (editedFinish && (dataDate || yesterday)) {
            const editedDateStr = new Date(editedFinish).toISOString().split('T')[0];
            const calDateStr = dataDate ? new Date(dataDate).toISOString().split('T')[0] : new Date(yesterday).toISOString().split('T')[0];
            if (editedDateStr > calDateStr) isFuture = true;
          }
          if (isFuture) {
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
          balance: String(Math.max(0, scope - completed)),
          remarks: row[17] || '',
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
        let newStatus = row[3] || 'Not Started';
        const newPriority = row[4] || '';
        const newDuration = row[5] || '';
        const newPlanStart = row[6] || '';
        const newPlanFinish = row[7] || '';
        const newActStart = row[8] || '';
        let finalCustomActStart = c.actualStart || '';
        let customActStartChanged = false;
        if (newActStart !== (indianDateFormat(c.actualStart) || '')) {
          customActStartChanged = true;
          let isFuture = false;
          if (newActStart && (dataDate || yesterday)) {
            const editedDateStr = new Date(newActStart).toISOString().split('T')[0];
            const calDateStr = dataDate ? new Date(dataDate).toISOString().split('T')[0] : new Date(yesterday).toISOString().split('T')[0];
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

        const newActFinish = row[9] || '';
        let finalCustomActFinish = c.actualFinish || '';
        let customActFinishChanged = false;
        if (newActFinish !== (indianDateFormat(c.actualFinish) || '')) {
          customActFinishChanged = true;
          let isFuture = false;
          if (newActFinish && (dataDate || yesterday)) {
            const editedDateStr = new Date(newActFinish).toISOString().split('T')[0];
            const calDateStr = dataDate ? new Date(dataDate).toISOString().split('T')[0] : new Date(yesterday).toISOString().split('T')[0];
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
        const newFcstStart = row[10] || '';
        const newFcstFinish = row[11] || '';
        const newVendor = row[12] || '';
        const newUom = row[13] || 'Nos';
        const newScope = row[14] || '0';
        const newComp = row[15] || '0';
        const newRemarks = row[17] || '';

        if (customActFinishChanged && finalCustomActFinish) {
          newStatus = 'Completed';
        } else if (customActStartChanged && finalCustomActStart && newStatus === 'Not Started') {
          newStatus = 'In Progress';
        }

        const hasCustomChanges =
          newDesc !== (c.description || '') ||
          newStatus !== (c.extraData?.status || 'Not Started') ||
          newPriority !== (c.extraData?.priority || '') ||
          newDuration !== (c.extraData?.duration || '') ||
          newVendor !== (c.extraData?.soVendorName || '') ||
          newUom !== (c.uom || '') ||
          newScope !== String(c.scope || 0) ||
          newComp !== String(c.cumulative || 0) ||
          newPlanStart !== (c.plannedStart || '') ||
          newPlanFinish !== (c.plannedFinish || '') ||
          finalCustomActStart !== (c.actualStart || '') ||
          finalCustomActFinish !== (c.actualFinish || '') ||
          newRemarks !== (c.remarks || '');

        if (hasCustomChanges) {
          onEditCustomActivity({
            id: customId,
            sheetType: sheetType,
            description: newDesc,
            uom: newUom,
            scope: Number(newScope) || 0,
            cumulative: Number(newComp) || 0,
            plannedStart: newPlanStart,
            plannedFinish: newPlanFinish,
            actualStart: finalCustomActStart,
            actualFinish: finalCustomActFinish,
            remarks: newRemarks,
            extraData: {
              ...c.extraData,
              status: newStatus,
              priority: newPriority,
              duration: newDuration,
              soVendorName: newVendor,
            }
          });
        }
      });
    }
  }, [data, setData, dataIndexMap, customActivities, onEditCustomActivity, sheetType, yesterday, dataDate, isBess, toDefaultRow]);

  const handleRowDelete = useCallback((index: number) => {
    const row = tableData[index];
    if (row && (row as any)._isCustomRow && onDeleteCustomActivity) {
      const customId = (row as any)._customId;
      if (customId) onDeleteCustomActivity(customId);
    }
  }, [tableData, onDeleteCustomActivity]);

  return (
    <div className="space-y-4 w-full flex-1 min-h-0 flex flex-col">
      {!isLocked && onAddCustomActivity && (
        <div className="flex justify-end px-2">
          <button
            onClick={handleInlineAdd}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" />
            Add DPR Activity
          </button>
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
        onRowDelete={isPmagOrAdmin && !isLocked && onDeleteCustomActivity ? handleRowDelete : undefined}
        rowIsEditable={(idx) => {
          const row = tableData[idx] as any;
          return row && !row.isCategoryRow && !row.isTotalRow;
        }}
        rowIsDeletable={(idx) => !!(tableData[idx] as any)?._isCustomRow && isPmagOrAdmin}
      />
    </div>
  );
});
