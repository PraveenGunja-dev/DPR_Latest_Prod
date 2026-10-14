import React, { useMemo, useCallback, memo } from 'react';
import { indianDateFormat, parseDateToIso } from "@/services/dprService";
import { Plus, Trash2, Save } from 'lucide-react';
import { useProgressiveRows } from '@/hooks/useProgressiveRows';
import { useColumnResize } from '@/hooks/useColumnResize';
import { P6_ACTIVITY_MAPPING, extractBlockNumber, parseBlockAndBctNumber } from './BESSChargingScheduleTable';

interface BESSProductivityTableProps {
  data: any[];
  setData: (data: any[]) => void;
  onSave?: (isAutoSave?: boolean) => void;
  isLocked?: boolean;
  status?: string;
  projectId?: number;
  today?: string;
  p6Data?: any[];
  dpQtyData?: any[];
}

const HISTORY_COLS = 7;

// The sheet is a fixed checklist: "Add Row" appends these activities, grouped by category, and the
// supervisor fills in the daily quantities against them. Clicking it again appends another copy of
// the whole checklist (48 activities per click).
const BESS_PRODUCTIVITY_ACTIVITIES: { category: string; activities: string[] }[] = [
  {
    category: 'Civil', activities: [
      'BCF Precast Erection & Welding',
      'CT Rail Fixing',
      'PCS Slab casting',
      'SGR Slab Casting',
      'MCR Slab Casting',
      'CSS Slab Casting',
      'BOT Slab casting',
      'NIFPS Precast Erection',
      'PCS PEB',
      'SGR PEB',
      'MCR PEB',
    ]
  },
  {
    category: 'Electrical', activities: [
      'CT Erection',
      'PCS Erection',
      'ACDB Erection',
      'ECP Panel Erection (Communication Panel)',
      'HT Panel Erection',
      'EMS Panel Erection',
      'CSS Erection',
      'NIFPS Panel Erection',
      'NIFPS Fabrication',
      'Battery Container Erection',
      'HT cable laying',
      'HT cable termination',
      'HT Cable Torquing & Marking',
      'FO Cable Internal Ring',
      'DC Cable laying',
      'LT Cable laying',
      'DC Cable termination',
      'DC Cable Torquing & Marking',
      'LT Cable termination',
      'LT Cable Torquing & Marking',
      'Aux Cable laying',
      'Control Cable laying',
      'Communication Cable laying',
      'Aux Cable Termination',
      'Control Cable Termination',
      'Communication Cable Termination',
      'CT SFRA & Tan delta Test',
      'CT Routine Test',
      'CT Control scheme & Stability Test',
      'HT Panel Routine (CT & PT, Breaker & Meter) Test',
      'HT Panel relay test',
      'HT Cable VLF Test',
      'CSS routine test',
      'ACDB routine test',
      'Earthing - Earthing Strip',
      'Earthing - Earth Pit',
      'LA',
    ]
  },
];

export const getInitialBessProductivityRows = (): any[] => {
  const newRows: any[] = [];
  BESS_PRODUCTIVITY_ACTIVITIES.forEach(group => {
    newRows.push({
      isCategoryRow: true,
      containerMake: '',
      blockNo: '',
      sr: '',
      activity: group.category,
      dailyValues: {},
    });
    group.activities.forEach((actName, idx) => {
      newRows.push({
        containerMake: '',
        blockNo: '',
        sr: String(idx + 1),
        activity: actName,
        dailyValues: {},
      });
    });
  });
  return newRows;
};

export const BESSProductivityTable = memo(({
  data,
  setData,
  onSave,
  isLocked = false,
  status = 'draft',
  projectId,
  today,
  p6Data = [],
  dpQtyData = [],
}: BESSProductivityTableProps) => {

  // Build a fast lookup for P6 dates based on activity name and block number.
  // Each entry tracks BOTH first-sub-block dates (for start) and last-sub-block dates (for finish).
  const { p6Lookup, maxBlocks, minBlocks, scopeLookup } = useMemo(() => {
    const map = new Map<string, {
      // First sub-block (lowest BCT) → used for start dates
      firstActualStart?: string; firstForecastStart?: string;
      firstActualFinish?: string; firstForecastFinish?: string;
      minBctNum: number;
      // Last sub-block (highest BCT) → used for finish dates
      lastActualStart?: string; lastForecastStart?: string;
      lastActualFinish?: string; lastForecastFinish?: string;
      maxBctNum: number;
    }>();
    const scopeMap = new Map<string, number>();
    const maxBlocksMap = new Map<string, number>();
    const minBlocksMap = new Map<string, number>();
    
    (p6Data || []).forEach(act => {
      let name = String(act.subHeading || act.description || act.name || '').toLowerCase().trim();
      if (!name) return;
      
      if (name === 'routine test') {
        const main = String(act.mainHeading || '').toLowerCase();
        if (main.includes('css')) name = 'css routine test';
        else if (main.includes('acdb')) name = 'acdb routine test';
      }
      
      // Total scope per activity = sum across every block / sub-block
      const scopeVal = Number(act.totalQuantity || act.totalScopeQty || act.scope || act.plannedUnits) || 0;
      scopeMap.set(name, (scopeMap.get(name) || 0) + scopeVal);

      const rawBlock = act.block || act.extraData?.block || act.location || act.pss || act.wbsName || act.description || act.name || '';
      const { blockNumStr, bctNum } = parseBlockAndBctNumber(rawBlock);
      const key = `${name}|${blockNumStr}`;
      
      const bNum = parseInt(blockNumStr, 10);
      if (!isNaN(bNum)) {
        const currentMax = maxBlocksMap.get(name) || 0;
        if (bNum > currentMax) maxBlocksMap.set(name, bNum);
        const currentMin = minBlocksMap.get(name);
        if (currentMin === undefined || bNum < currentMin) minBlocksMap.set(name, bNum);
      }
      
      const actStart = act.actualStart || act.extraData?.actualStart || '';
      const fcstStart = act.forecastStart || act.extraData?.forecastStart || '';
      const actFinish = act.actualFinish || act.extraData?.actualFinish || '';
      const fcstFinish = act.forecastFinish || act.extraData?.forecastFinish || '';
      
      if (map.has(key)) {
        const existing = map.get(key)!;
        
        // Track FIRST sub-block (lowest BCT) for start dates
        if (bctNum > 0 && bctNum < existing.minBctNum) {
          existing.minBctNum = bctNum;
          // Replace outright: an empty actual here must not keep a higher BCT's actual (forecast is used instead)
          existing.firstActualStart = actStart || undefined;
          existing.firstForecastStart = fcstStart || undefined;
          existing.firstActualFinish = actFinish || undefined;
          existing.firstForecastFinish = fcstFinish || undefined;
        } else if (bctNum === existing.minBctNum || bctNum === 0) {
          // When in the exact same first sub-block, take the EARLIEST start date
          if (actStart) {
            existing.firstActualStart = (!existing.firstActualStart || parseDateToIso(actStart) < parseDateToIso(existing.firstActualStart)) ? actStart : existing.firstActualStart;
          }
          if (fcstStart) {
            existing.firstForecastStart = (!existing.firstForecastStart || parseDateToIso(fcstStart) < parseDateToIso(existing.firstForecastStart)) ? fcstStart : existing.firstForecastStart;
          }
          // (Finish dates here don't matter as much for the start column, but keeping them earliest as well for consistency)
          if (actFinish) {
            existing.firstActualFinish = (!existing.firstActualFinish || parseDateToIso(actFinish) < parseDateToIso(existing.firstActualFinish)) ? actFinish : existing.firstActualFinish;
          }
          if (fcstFinish) {
            existing.firstForecastFinish = (!existing.firstForecastFinish || parseDateToIso(fcstFinish) < parseDateToIso(existing.firstForecastFinish)) ? fcstFinish : existing.firstForecastFinish;
          }
        }
        
        // Track LAST sub-block (highest BCT) for finish dates
        if (bctNum > existing.maxBctNum) {
          existing.maxBctNum = bctNum;
          existing.lastActualStart = actStart || undefined;
          existing.lastForecastStart = fcstStart || undefined;
          existing.lastActualFinish = actFinish || undefined;
          existing.lastForecastFinish = fcstFinish || undefined;
        } else if (bctNum === existing.maxBctNum || bctNum === 0) {
          // When in the exact same last sub-block, take the LATEST finish date
          if (actStart) {
            existing.lastActualStart = (!existing.lastActualStart || parseDateToIso(actStart) > parseDateToIso(existing.lastActualStart)) ? actStart : existing.lastActualStart;
          }
          if (fcstStart) {
            existing.lastForecastStart = (!existing.lastForecastStart || parseDateToIso(fcstStart) > parseDateToIso(existing.lastForecastStart)) ? fcstStart : existing.lastForecastStart;
          }
          if (actFinish) {
            existing.lastActualFinish = (!existing.lastActualFinish || parseDateToIso(actFinish) > parseDateToIso(existing.lastActualFinish)) ? actFinish : existing.lastActualFinish;
          }
          if (fcstFinish) {
            existing.lastForecastFinish = (!existing.lastForecastFinish || parseDateToIso(fcstFinish) > parseDateToIso(existing.lastForecastFinish)) ? fcstFinish : existing.lastForecastFinish;
          }
        }
      } else {
        map.set(key, { 
          // First sub-block
          firstActualStart: actStart || undefined, 
          firstForecastStart: fcstStart || undefined,
          firstActualFinish: actFinish || undefined, 
          firstForecastFinish: fcstFinish || undefined,
          minBctNum: bctNum === 0 ? 999 : bctNum,
          // Last sub-block
          lastActualStart: actStart || undefined, 
          lastForecastStart: fcstStart || undefined,
          lastActualFinish: actFinish || undefined, 
          lastForecastFinish: fcstFinish || undefined,
          maxBctNum: bctNum,
        });
      }
    });
    return { p6Lookup: map, maxBlocks: maxBlocksMap, minBlocks: minBlocksMap, scopeLookup: scopeMap };
  }, [p6Data]);

  const dpQtyLookup = useMemo(() => {
    const map = new Map<string, { actualStart?: string; forecastStart?: string; actualFinish?: string; forecastFinish?: string }>();
    (dpQtyData || []).forEach(act => {
      let name = String(act.description || act.subHeading || act.name || '').toLowerCase().trim();
      if (!name) return;
      if (name === 'routine test') {
        const main = String(act.mainHeading || '').toLowerCase();
        if (main.includes('css')) name = 'css routine test';
        else if (main.includes('acdb')) name = 'acdb routine test';
      }
      
      const actStart = act.actualStart || act.extraData?.actualStart;
      const fcstStart = act.forecastStart || act.extraData?.forecastStart;
      const actFinish = act.actualFinish || act.extraData?.actualFinish;
      const fcstFinish = act.forecastFinish || act.extraData?.forecastFinish;
      
      if (map.has(name)) {
        const existing = map.get(name)!;
        if (actStart) existing.actualStart = (!existing.actualStart || parseDateToIso(actStart) > parseDateToIso(existing.actualStart)) ? actStart : existing.actualStart;
        if (fcstStart) existing.forecastStart = (!existing.forecastStart || parseDateToIso(fcstStart) > parseDateToIso(existing.forecastStart)) ? fcstStart : existing.forecastStart;
        if (actFinish) existing.actualFinish = (!existing.actualFinish || parseDateToIso(actFinish) > parseDateToIso(existing.actualFinish)) ? actFinish : existing.actualFinish;
        if (fcstFinish) existing.forecastFinish = (!existing.forecastFinish || parseDateToIso(fcstFinish) > parseDateToIso(existing.forecastFinish)) ? fcstFinish : existing.forecastFinish;
      } else {
        map.set(name, { actualStart: actStart, forecastStart: fcstStart, actualFinish: actFinish, forecastFinish: fcstFinish });
      }
    });
    return map;
  }, [dpQtyData]);

  const getP6Dates = useCallback((activityName: string) => {
    if (!activityName) return { start: '-', finish: '-' };
    const mapped = P6_ACTIVITY_MAPPING[activityName] || activityName;
    const nameKey = mapped.toLowerCase().trim();
    
    // --- Start Date: first block → first sub-block ---
    const minB = minBlocks.get(nameKey);
    const startBlockNum = minB !== undefined ? String(minB) : undefined;
    const startMatch = startBlockNum ? p6Lookup.get(`${nameKey}|${startBlockNum}`) : undefined;
    
    // DP Qty lookup is keyed by activity name only (merged across blocks, latest date wins), so it is
    // only a last resort when no P6 block matches - otherwise it leaks another block's dates.
    const dpDates = dpQtyLookup.get(nameKey);

    const actStart = startMatch ? startMatch.firstActualStart : dpDates?.actualStart;
    const fcstStart = startMatch ? startMatch.firstForecastStart : dpDates?.forecastStart;
    
    // --- Finish Date: last block → last sub-block ---
    const maxB = maxBlocks.get(nameKey);
    const finishBlockNum = maxB !== undefined ? String(maxB) : undefined;
    const finishMatch = finishBlockNum ? p6Lookup.get(`${nameKey}|${finishBlockNum}`) : undefined;
    
    const actFinish = finishMatch ? finishMatch.lastActualFinish : dpDates?.actualFinish;
    const fcstFinish = finishMatch ? finishMatch.lastForecastFinish : dpDates?.forecastFinish;

    // Prefer actual date, fall back to forecast
    const startStr = actStart ? indianDateFormat(actStart) : (fcstStart ? indianDateFormat(fcstStart) : '-');
    const finishStr = actFinish ? indianDateFormat(actFinish) : (fcstFinish ? indianDateFormat(fcstFinish) : '-');

    const startRaw = actStart || fcstStart;
    const finishRaw = actFinish || fcstFinish;
    return {
      start: startStr || '-',
      finish: finishStr || '-',
      startIso: startRaw ? parseDateToIso(startRaw) : '',
      finishIso: finishRaw ? parseDateToIso(finishRaw) : '',
    };
  }, [p6Lookup, maxBlocks, minBlocks, dpQtyLookup]);

  const getTotalScope = useCallback((activityName: string) => {
    if (!activityName) return 0;
    const mapped = P6_ACTIVITY_MAPPING[activityName] || activityName;
    return scopeLookup.get(mapped.toLowerCase().trim()) || 0;
  }, [scopeLookup]);

  // Trailing 7 days ending on the report date.
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

  const safeData = Array.isArray(data) ? data : [];

  // Rows are mounted in chunks (as the PSS sheets do via StyledExcelTable) so a long sheet never
  // freezes the tab on render. These rows are light (9 inputs each, no date pickers), so the first
  // chunk covers two full checklists - which keeps the delete-all control on the last row in reach.
  const { visibleCount, containerRef, handleScroll, loadMore } = useProgressiveRows(safeData.length, 100);

  // Column resize – same drag-handle pattern as StyledExcelTable.
  const defaultWidths: Record<string, number> = useMemo(() => {
    const w: Record<string, number> = {
      containerMake: 140, blockNo: 100, sr: 50, activity: 280, scope: 70,
      startDate: 110, endDate: 110
    };
    historyDates.forEach(d => { w[d.iso] = 85; });
    return w;
  }, [historyDates]);
  const { colWidths, handleResizeStart } = useColumnResize(defaultWidths);

  // Small resize handle rendered inside each <th>.
  const ResizeHandle = ({ col }: { col: string }) => (
    <div
      onMouseDown={(e) => handleResizeStart(e, col)}
      className="absolute right-0 top-0 bottom-0 w-[5px] cursor-col-resize z-[12] hover:bg-gray-400/50 transition-colors"
    />
  );

  // "Add Row" appends the full Civil + Electrical checklist (48 activities under their two category
  // headers). Each click appends another copy, so two clicks give 96 activity rows. Rendering stays
  // cheap because the grid mounts rows in chunks (see useProgressiveRows above).
  const handleAddRows = useCallback(() => {
    const newRows: any[] = [];
    BESS_PRODUCTIVITY_ACTIVITIES.forEach(group => {
      newRows.push({
        isCategoryRow: true,
        containerMake: '',
        blockNo: '',
        sr: '',
        activity: group.category,
        dailyValues: {},
      });
      group.activities.forEach((actName, idx) => {
        newRows.push({
          containerMake: '',
          blockNo: '',
          sr: String(idx + 1),
          activity: actName,
          dailyValues: {},
        });
      });
    });
    setData([...safeData, ...newRows]);
  }, [safeData, setData]);

  // Each "Add Row" click appends a whole copy of the checklist, so the trash icon on the last row
  // undoes one click at a time: it removes the most recently added copy, and clears the sheet once
  // only one copy is left. Where the last copy starts is the last header of the first category.
  const lastCopyStart = useMemo(() => {
    const firstCategory = BESS_PRODUCTIVITY_ACTIVITIES[0]?.category;
    for (let i = safeData.length - 1; i >= 0; i--) {
      if (safeData[i]?.isCategoryRow && safeData[i].activity === firstCategory) return i;
    }
    return -1; // no category rows (older drafts) - the whole sheet is one copy
  }, [safeData]);

  const handleDeleteCopy = useCallback(() => {
    const clearsSheet = lastCopyStart <= 0;
    const message = clearsSheet
      ? "Delete all productivity rows? Entered values will be lost."
      : "Delete the last added set of activities? Values entered in it will be lost.";
    if (!window.confirm(message)) return;
    setData(clearsSheet ? [] : safeData.slice(0, lastCopyStart));
  }, [safeData, lastCopyStart, setData]);

  const handleCellChange = useCallback((rowIndex: number, field: string, value: string) => {
    const rows = Array.isArray(data) ? data : [];
    const updated = [...rows];
    const row = { ...updated[rowIndex], [field]: value };
    row._cellStatuses = { ...(updated[rowIndex]._cellStatuses || {}), [field]: 'edited' };
    updated[rowIndex] = row;
    setData(updated);
  }, [data, setData]);

  const handleDailyChange = useCallback((rowIndex: number, iso: string, value: string) => {
    const rows = Array.isArray(data) ? data : [];
    const updated = [...rows];
    const row = { ...updated[rowIndex] };
    row.dailyValues = { ...(row.dailyValues || {}), [iso]: value };
    row._cellStatuses = { ...(row._cellStatuses || {}), [`daily_${iso}`]: 'edited' };
    updated[rowIndex] = row;
    setData(updated);
  }, [data, setData]);

  // Required daily average = Scope / |Finish - Start| (absolute, so reversed P6 dates still give a
  // value). Shown as the grey placeholder in empty cells, and counted in the totals below.
  // DPR-level activities (no P6 scope) take scope and dates from the manual inputs.
  const getRowDailyAvg = useCallback((row: any): string => {
    const p6Scope = getTotalScope(row.activity);
    const isDprLevel = p6Scope === 0;
    const totalScope = isDprLevel ? (Number(row.manualScope) || 0) : p6Scope;
    const dates = isDprLevel
      ? { startIso: row.manualStart || '', finishIso: row.manualFinish || '' }
      : getP6Dates(row.activity);
    if (!(totalScope > 0 && dates.startIso && dates.finishIso)) return '';
    const days = Math.abs(Math.round((new Date(dates.finishIso).getTime() - new Date(dates.startIso).getTime()) / 86400000));
    return days > 0 ? (totalScope / days).toFixed(2).replace(/\.?0+$/, '') : '';
  }, [getTotalScope, getP6Dates]);

  // A day with no entry counts as the required daily average, matching the grey figure on screen.
  const dayValue = (row: any, iso: string, avg: number) => {
    const v = row?.dailyValues?.[iso];
    return v === undefined || v === '' ? avg : Number(v) || 0;
  };

  // Cumulative = every daily value ever entered on the row (not just the 7 visible columns).
  const rowCumulative = (row: any) => {
    const avg = Number(getRowDailyAvg(row)) || 0;
    const visible = new Set(historyDates.map(d => d.iso));
    const entered = Object.entries(row?.dailyValues || {})
      .filter(([iso]) => !visible.has(iso))
      .reduce((sum, [, v]) => sum + (Number(v) || 0), 0);
    return entered + historyDates.reduce((sum, d) => sum + dayValue(row, d.iso, avg), 0);
  };

  // Totals row: per-date sums across every activity row, plus the grand cumulative.
  const totals = useMemo(() => {
    const perDate: Record<string, number> = {};
    historyDates.forEach(d => { perDate[d.iso] = 0; });
    let cumulative = 0;
    safeData.forEach(row => {
      if (row?.isCategoryRow) return;
      const avg = Number(getRowDailyAvg(row)) || 0;
      historyDates.forEach(d => { perDate[d.iso] += dayValue(row, d.iso, avg); });
      cumulative += rowCumulative(row);
    });
    return { perDate, cumulative };
  }, [safeData, historyDates, getRowDailyAvg]);

  const fmt = (n: number) => (n ? String(Math.round(n * 100) / 100) : '0');

  const colCount = 7 + HISTORY_COLS + 1 + (isLocked ? 0 : 1);

  return (
    <div className="space-y-2 w-full h-full flex-1 min-h-0 flex flex-col">
      <div className="flex items-center justify-between px-2">
        <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide">BESS - Productivity</h3>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 text-xs text-slate-600 mr-2">
            <span className="inline-block w-3 h-3 rounded-sm bg-[#FEF9C3] border border-[#EAB308]" />
            Yellow highlighted rows are DPR level activities
          </span>
          {!isLocked && onSave && (
            <button
              onClick={() => onSave(false)}
              className="flex items-center gap-1.5 px-4 py-2 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors shadow-sm font-semibold"
            >
              <Save className="w-4 h-4" />
              Save
            </button>
          )}
          {!isLocked && (
            <button
              onClick={handleAddRows}
              className="flex items-center gap-1.5 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm font-semibold"
            >
              <Plus className="w-4 h-4" />
              Add Row
            </button>
          )}
        </div>
      </div>

      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 min-h-0 overflow-auto border-2 border-[#999999] rounded shadow-sm"
      >
        <table className="w-full border-collapse text-xs">
          <thead className="sticky top-0 z-10">
            <tr className="bg-[#c7ccd1]">
              <th className="border border-solid border-[#999999] px-2 py-2 text-center font-bold text-slate-800 relative" style={{ width: colWidths.containerMake, minWidth: colWidths.containerMake }}>Container Make<ResizeHandle col="containerMake" /></th>
              <th className="border border-solid border-[#999999] px-2 py-2 text-center font-bold text-slate-800 relative" style={{ width: colWidths.blockNo, minWidth: colWidths.blockNo }}>Block No.<ResizeHandle col="blockNo" /></th>
              <th className="border border-solid border-[#999999] px-2 py-2 text-center font-bold text-slate-800 relative" style={{ width: colWidths.sr, minWidth: colWidths.sr }}>Sr.<ResizeHandle col="sr" /></th>
              <th className="border border-solid border-[#999999] px-2 py-2 text-center font-bold text-slate-800 relative" style={{ width: colWidths.activity, minWidth: colWidths.activity }}>Activity<ResizeHandle col="activity" /></th>
              <th className="border border-solid border-[#999999] px-2 py-2 text-center font-bold text-slate-800 relative" style={{ width: colWidths.scope, minWidth: colWidths.scope }}>Scope<ResizeHandle col="scope" /></th>
              <th className="border border-solid border-[#999999] px-2 py-2 text-center font-bold text-slate-800 relative" style={{ width: colWidths.startDate, minWidth: colWidths.startDate }}>Actual Start Date / Forecast Start Date<ResizeHandle col="startDate" /></th>
              <th className="border border-solid border-[#999999] px-2 py-2 text-center font-bold text-slate-800 relative" style={{ width: colWidths.endDate, minWidth: colWidths.endDate }}>Actual Finish Date / Forecast Finish Date<ResizeHandle col="endDate" /></th>
              {historyDates.map(d => (
                <th key={d.iso} className="border border-solid border-[#999999] px-1 py-2 text-center font-bold text-slate-800 relative" style={{ width: colWidths[d.iso], minWidth: colWidths[d.iso] }}>{d.label}<ResizeHandle col={d.iso} /></th>
              ))}
              <th className="border border-solid border-[#999999] px-1 py-2 text-center font-bold text-slate-800 w-[90px] min-w-[90px]">Cumulative</th>
              {!isLocked && (
                <th className="border border-solid border-[#999999] px-1 py-2 text-center font-bold text-slate-800 w-[45px]"></th>
              )}
            </tr>
          </thead>
          <tbody>
            {safeData.length === 0 ? (
              <tr>
                <td colSpan={colCount} className="text-center py-12 text-slate-400 text-sm">
                  No data yet. Click <strong>"Add Row"</strong> to load the productivity activities.
                </td>
              </tr>
            ) : (
              <>
              <tr className="bg-[#dbeafe] font-bold text-slate-900">
                <td colSpan={5} className="border border-solid border-[#999999] px-3 py-2 text-sm">Total</td>
                <td className="border border-solid border-[#999999]" />
                <td className="border border-solid border-[#999999]" />
                {historyDates.map(d => (
                  <td key={d.iso} className="border border-solid border-[#999999] px-1 py-2 text-center">{fmt(totals.perDate[d.iso])}</td>
                ))}
                <td className="border border-solid border-[#999999] px-1 py-2 text-center">{fmt(totals.cumulative)}</td>
                {!isLocked && <td className="border border-solid border-[#999999]" />}
              </tr>
              {safeData.slice(0, visibleCount).map((row, rowIndex) => {
                if (row.isCategoryRow) {
                  return (
                    <tr key={`cat-${rowIndex}`} className="bg-[#e0f2e9]">
                      <td colSpan={colCount} className="border border-solid border-[#999999] px-3 py-2 font-bold text-[#065f46] text-sm">
                        {row.activity}
                      </td>
                    </tr>
                  );
                }

                const p6Scope = getTotalScope(row.activity);
                // Activities with no P6 scope are DPR-level - highlighted yellow like the Charging Schedule sheet,
                // and their scope / start / finish are entered manually.
                const isDprLevel = p6Scope === 0;
                const totalScope = isDprLevel ? (Number(row.manualScope) || 0) : p6Scope;
                const p6Dates = isDprLevel ? { start: '', finish: '' } : getP6Dates(row.activity);
                const dailyAvg = getRowDailyAvg(row);
                const avgTitle = dailyAvg ? 'Daily average = Scope / Number of days between Start Date and Finish Date' : '';
                const dateBg = isDprLevel ? '' : 'bg-slate-50/50';

                return (
                  <tr key={`row-${rowIndex}`} className={`transition-colors ${isDprLevel ? 'bg-[#FEF9C3] hover:bg-[#FEF08A]' : 'hover:bg-blue-50/30'}`}>
                    <td className="border border-dashed border-[#999999] px-1 py-0.5">
                      <input
                        type="text"
                        value={row.containerMake || ''}
                        onChange={(e) => handleCellChange(rowIndex, 'containerMake', e.target.value)}
                        disabled={isLocked}
                        className="w-full bg-transparent border-none outline-none text-xs px-1 py-1 text-center disabled:text-slate-500"
                      />
                    </td>
                    <td className="border border-dashed border-[#999999] px-1 py-0.5">
                      <input
                        type="text"
                        value={row.blockNo || ''}
                        onChange={(e) => handleCellChange(rowIndex, 'blockNo', e.target.value)}
                        disabled={isLocked}
                        className="w-full bg-transparent border-none outline-none text-xs px-1 py-1 text-center disabled:text-slate-500"
                      />
                    </td>
                    <td className="border border-dashed border-[#999999] px-1 py-0.5 text-center text-slate-600">
                      {row.sr || ''}
                    </td>
                    <td className="border border-dashed border-[#999999] px-2 py-0.5 text-slate-800 font-medium">
                      <div className="w-full h-full p-1 whitespace-normal">
                        {row.activity || ''}
                      </div>
                    </td>
                    <td className="border border-dashed border-[#999999] px-1 py-0.5 text-center font-medium text-slate-700 text-[11px]">
                      {isDprLevel ? (
                        <input
                          type="number"
                          value={row.manualScope ?? ''}
                          onChange={(e) => handleCellChange(rowIndex, 'manualScope', e.target.value.replace(/^0+(?=\d)/, ''))}
                          disabled={isLocked}
                          className="w-full bg-transparent border-none outline-none text-xs px-1 py-1 text-center disabled:text-slate-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        />
                      ) : totalScope}
                    </td>
                    <td className={`border border-dashed border-[#999999] px-1 py-0.5 text-center font-medium text-slate-600 text-[11px] ${dateBg}`}>
                      {isDprLevel ? (
                        <input
                          type="date"
                          value={row.manualStart || ''}
                          onChange={(e) => handleCellChange(rowIndex, 'manualStart', e.target.value)}
                          disabled={isLocked}
                          className="w-full bg-transparent border-none outline-none text-[11px] px-1 py-1 text-center disabled:text-slate-500"
                        />
                      ) :  p6Dates.start}
                    </td>
                    <td className={`border border-dashed border-[#999999] px-1 py-0.5 text-center font-medium text-slate-600 text-[11px] ${dateBg}`}>
                      {isDprLevel ? (
                        <input
                          type="date"
                          value={row.manualFinish || ''}
                          onChange={(e) => handleCellChange(rowIndex, 'manualFinish', e.target.value)}
                          disabled={isLocked}
                          className="w-full bg-transparent border-none outline-none text-[11px] px-1 py-1 text-center disabled:text-slate-500"
                        />
                      ) :  p6Dates.finish}
                    </td>
                    {historyDates.map(d => (
                      <td key={d.iso} className="border border-dashed border-[#999999] px-1 py-0.5">
                        <input
                          type="number"
                          value={row.dailyValues?.[d.iso] ?? ''}
                          placeholder={dailyAvg}
                          title={avgTitle}
                          onChange={(e) => handleDailyChange(rowIndex, d.iso, e.target.value.replace(/^0+(?=\d)/, ''))}
                          disabled={isLocked}
                          className="w-full bg-transparent border-none outline-none text-xs px-1 py-1 text-center disabled:text-slate-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        />
                      </td>
                    ))}
                    <td className="border border-dashed border-[#999999] px-1 py-0.5 text-center font-semibold text-slate-700">
                      {fmt(rowCumulative(row))}
                    </td>
                    {!isLocked && (
                      <td className="border border-dashed border-[#999999] px-1 py-0.5 text-center">
                        {/* Single control on the last row that removes the most recently added
                            copy of the checklist - there is no per-row delete, since the activity
                            list is a fixed checklist. */}
                        {rowIndex === safeData.length - 1 && (
                          <button
                            onClick={handleDeleteCopy}
                            className="text-red-400 hover:text-red-600 transition-colors p-0.5"
                            title={lastCopyStart > 0
                              ? "Delete the last added set of activities"
                              : "Delete all rows"}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
              </>
            )}
            {visibleCount < safeData.length && (
              <tr>
                <td colSpan={colCount} className="text-center py-3">
                  <button
                    onClick={loadMore}
                    className="text-xs text-blue-600 hover:text-blue-800 font-semibold underline underline-offset-2"
                  >
                    Showing {visibleCount} of {safeData.length} rows - click or scroll to show more
                  </button>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
});

