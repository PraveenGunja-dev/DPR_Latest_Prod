import React, { memo, useCallback, useMemo, useState } from 'react';
import { Plus, Trash2, Save } from 'lucide-react';
import { useProgressiveRows } from '@/hooks/useProgressiveRows';
import { useColumnResize } from '@/hooks/useColumnResize';
import { indianDateFormat, parseDateToIso } from '@/services/dprService';

interface BESSChargingScheduleTableProps {
  data: any[];
  setData: (data: any[]) => void;
  onSave?: (isAutoSave?: boolean) => void;
  isLocked?: boolean;
  p6Data?: any[];
  dpQtyData?: any[];
}

export const BESS_CHARGING_SCHEDULE_ACTIVITIES: { category: string; activities: string[] }[] = [
  {
    category: 'Civil', activities: [
      'BCF Precast Erection & Welding', 'CT Rail Fixing', 'PCS Slab casting', 'SGR Slab Casting',
      'MCR Slab Casting', 'CSS Slab Casting', 'BOT Slab casting', 'NIFPS Precast Erection',
      'PCS PEB', 'SGR PEB', 'MCR PEB',
    ]
  },
  {
    category: 'Electrical', activities: [
      'CT Erection', 'PCS Erection', 'ACDB Erection', 'ECP Panel Erection (Communication Panel)',
      'HT Panel Erection', 'EMS Panel Erection', 'CSS Erection', 'NIFPS Panel Erection',
      'NIFPS Fabrication', 'Battery Container Erection', 'HT cable laying', 'HT cable termination',
      'DC Cable laying', 'LT Cable laying',
      'DC Cable termination', 'LT Cable termination',
      'Aux Cable laying', 'Control Cable laying',
      'Communication Cable laying', 'Aux Cable Termination', 'Control Cable Termination',
      'Communication Cable Termination', 'CT SFRA & Tan delta Test', 'CT Routine Test',
      'CT Control scheme & Stability Test', 'HT Panel Routine (CT & PT, Breaker & Meter) Test',
      'HT Panel relay test', 'HT Cable VLF Test', 'CSS routine test', 'ACDB routine test',
      'Grid Earthing', 'Lighting Arestor',
    ]
  },
];

const P6_ACTIVITY_MAPPING: Record<string, string> = {
  'Grid Earthing': 'Earthing strip laying & Backfilling',
  'Aux Cable laying': 'AUX Cable Laying',
  'Control Cable laying': 'Control & Communication cable laying',
  'Communication Cable laying': 'Control & Communication cable laying',
  'CT SFRA & Tan delta Test': 'SFRA & Tan Delta Testing',
  'CT Routine Test': 'Transformer Routine test',
  'CT Control scheme & Stability Test': 'Control Scheme Testing',
  'HT Panel Routine (CT & PT, Breaker & Meter) Test': 'HT Panel Routine Test',
  'HT Cable VLF Test': 'HT VLF Testing',
  'CSS routine test': 'css routine test',
  'ACDB routine test': 'acdb routine test',
  'BCF Precast Erection & Welding': 'BCF - Precast Erection',
  'CT Rail Fixing': 'CT - Rail Fixing of CT',
  'PCS Slab casting': 'PCS - Slab casting',
  'SGR Slab Casting': 'SGR - Slab Casting',
  'MCR Slab Casting': 'MCR - Slab Casting',
  'CSS Slab Casting': 'CSS - Slab Casting',
  'BOT Slab casting': 'Erection of Precast Structure BOT',
  'NIFPS Precast Erection': 'Precast Installation of NIFPS',
  'PCS PEB': 'PCS - PEB (Shed Work)',
  'SGR PEB': 'SGR - PEB (Shed Work)',
  'MCR PEB': 'MCR - PEB (Shed Work)',
  'CT Erection': 'Container Erection',
  'ACDB Erection': 'Panel & ACDB Erection',
  'EMS Panel Erection': 'EMS/ECP Panel Erection',
  'CSS Erection': 'CSS Erection(1,2,3,...)',
  'NIFPS Panel Erection': 'NIFPS - Erection & Installation',
  'Battery Container Erection': 'Container Erection',
  'HT cable termination': 'SGR 1 MV Switchgear Termination',
  'LT Cable laying': 'AC Cable laying',
  // Add other manual overrides here if names differ between P6 and the Charging Schedule checklist
};

export const BESSChargingScheduleTable: React.FC<BESSChargingScheduleTableProps> = memo(({
  data,
  setData,
  onSave,
  isLocked = false,
  p6Data = [],
  dpQtyData = [],
}: BESSChargingScheduleTableProps) => {

  const safeData = Array.isArray(data) ? data : [];

  // Rows are mounted in chunks (as the PSS sheets do via StyledExcelTable) so a long sheet - this
  // one carries ~20 controlled inputs per row - never freezes the tab on render.
  const { visibleCount, containerRef, handleScroll, loadMore } = useProgressiveRows(safeData.length);

  // Build a fast lookup for P6 scope/completed data based on activity name
  // We use dpQtyData if available because it already handles the complex group-level logic
  // (like waiting for ALL blocks to finish before declaring an Actual Finish).
  const p6Lookup = useMemo(() => {
    const map = new Map<string, { scope: number; completed: number; actualFinish?: string; forecastFinish?: string }>();
    
    // Fallback to p6Data if dpQtyData is not passed
    const dataSource = dpQtyData && dpQtyData.length > 0 ? dpQtyData : p6Data;
    
    (dataSource || []).forEach(act => {
      // DP Qty has 'description', p6Data has 'subHeading' or 'description' or 'name'
      let name = String(act.description || act.subHeading || act.name || '').toLowerCase().trim();
      if (!name) return;
      
      if (name === 'routine test') {
        const main = String(act.mainHeading || '').toLowerCase();
        if (main.includes('css')) name = 'css routine test';
        else if (main.includes('acdb')) name = 'acdb routine test';
      }
      
      const scope = Number(act.totalQuantity || act.totalScopeQty || act.scope) || 0;
      const comp = Number(act.cumulative || act.completed) || 0;
      const actFinish = act.actualFinish || act.extraData?.actualFinish;
      const fcstFinish = act.forecastFinish || act.extraData?.forecastFinish;
      
      if (map.has(name)) {
        const existing = map.get(name)!;
        existing.scope += scope;
        existing.completed += comp;
        if (actFinish) {
          existing.actualFinish = (existing.actualFinish && existing.actualFinish > actFinish) ? existing.actualFinish : actFinish;
        }
        if (fcstFinish) {
          existing.forecastFinish = (existing.forecastFinish && existing.forecastFinish > fcstFinish) ? existing.forecastFinish : fcstFinish;
        }
      } else {
        map.set(name, { scope, completed: comp, actualFinish: actFinish, forecastFinish: fcstFinish });
      }
    });
    return map;
  }, [p6Data, dpQtyData]);

  const getP6Progress = useCallback((activityName: string) => {
    if (!activityName) return null;
    const mapped = P6_ACTIVITY_MAPPING[activityName] || activityName;
    return p6Lookup.get(mapped.toLowerCase().trim()) || null;
  }, [p6Lookup]);

  // Column resize – same drag-handle pattern as StyledExcelTable.
  const { colWidths, handleResizeStart } = useColumnResize({
    containerMake: 80, blockNo: 80, containersAtSite: 80, mwh: 80,
    idtChargingStart: 100, trailRunEndDate: 140, cod: 140,
    sr: 40, activity: 150, progressScope: 40, progressCompleted: 40, progressBalance: 40,
    edc: 80, newEdc: 80, vendor: 100,
    productivity: 80, manpower: 80, totalMandays: 80, remarks: 150,
  });

  // Small resize handle rendered inside each <th>.
  const ResizeHandle = ({ col }: { col: string }) => (
    <div
      onMouseDown={(e) => handleResizeStart(e, col)}
      className="absolute right-0 top-0 bottom-0 w-[5px] cursor-col-resize z-[12] hover:bg-gray-400/50 transition-colors"
    />
  );

  // Track which cell is active so date columns can switch between text display and native picker.
  const [activeCell, setActiveCell] = useState<{ row: number; field: string } | null>(null);

  // Convert a DD-MMM-YY (or ISO) string to YYYY-MM-DD for the native date picker.
  const parseDateForPicker = (val: string | undefined): string => {
    if (!val) return '';
    const iso = parseDateToIso(val);
    return iso || '';
  };

  // Helper: add N calendar days to a date string (DD-MMM-YY or ISO), returns DD-MMM-YY.
  const addDays = (dateStr: string, days: number): string => {
    const iso = parseDateToIso(dateStr) || dateStr;
    const d = new Date(iso);
    d.setDate(d.getDate() + days);
    return indianDateFormat(d) || '';
  };

  // Compute the difference in days between two DD-MMM-YY (or ISO) date strings.
  const daysDiff = (fromDate: string, toDate: string): number | null => {
    if (!fromDate || !toDate) return null;
    const fromIso = parseDateToIso(fromDate);
    const toIso = parseDateToIso(toDate);
    if (!fromIso || !toIso) return null;
    const msPerDay = 86400000;
    return Math.round((new Date(toIso).getTime() - new Date(fromIso).getTime()) / msPerDay);
  };

  const handleCellChange = useCallback((rowIndex: number, field: string, value: string) => {
    const rows = Array.isArray(data) ? data : [];
    const updated = [...rows];

    // For date fields coming from the native picker (YYYY-MM-DD), convert to DD-MMM-YY.
    const dateFields = ['containersAtSite', 'idtChargingStart', 'trailRunEndDate', 'cod'];
    let storedValue = value;
    if (dateFields.includes(field) && value) {
      storedValue = indianDateFormat(value) || value;
    }

    const row = { ...updated[rowIndex], [field]: storedValue };
    row._cellStatuses = { ...(updated[rowIndex]._cellStatuses || {}), [field]: 'edited' };

    // When IDT date is entered, auto-compute Trail-Run (+3 days) and COD (+2 days above Trail-Run).
    if (field === 'idtChargingStart') {
      if (storedValue) {
        const trailRun = addDays(storedValue, 3);
        const cod = addDays(trailRun, 2);
        row.trailRunEndDate = trailRun;
        row.cod = cod;
        row._cellStatuses = {
          ...row._cellStatuses,
          trailRunEndDate: 'edited',
          cod: 'edited',
        };
      } else {
        // IDT cleared → clear the derived dates too
        row.trailRunEndDate = '';
        row.cod = '';
      }
    }

    // When Trail-Run is manually changed, auto-compute COD (+2 days above Trail-Run).
    if (field === 'trailRunEndDate') {
      if (storedValue) {
        const cod = addDays(storedValue, 2);
        row.cod = cod;
        row._cellStatuses = {
          ...row._cellStatuses,
          cod: 'edited',
        };
      } else {
        row.cod = '';
      }
    }

    updated[rowIndex] = row;
    setData(updated);
  }, [data, setData]);

  // A blank row of the sheet's shape - one of these is what "Add Row" appends.
  const emptyRow = () => ({
    containerMake: '',
    blockNo: '',
    containersAtSite: '',
    mwh: '',
    idtChargingStart: '',
    trailRunEndDate: '',
    cod: '',
    sr: '',
    activity: '',
    progressScope: '',
    progressCompleted: '',
    progressBalance: '',
    edc: '',
    newEdc: '',
    vendor: '',
    productivity: '',
    manpower: '',
    totalMandays: '',
    remarks: '',
    dailyValues: {},
  });

  // "Add Row" appends the full Civil + Electrical checklist (48 activities under their two category
  // headers). Each click appends another copy, so two clicks give 96 activity rows. Rendering stays
  // cheap because the grid mounts rows in chunks (see useProgressiveRows above).
  const handleAddRow = useCallback(() => {
    const newRows: any[] = [];
    BESS_CHARGING_SCHEDULE_ACTIVITIES.forEach(group => {
      newRows.push({
        isCategoryRow: true,
        activity: group.category,
      });
      group.activities.forEach((actName, idx) => {
        newRows.push({ ...emptyRow(), sr: String(idx + 1), activity: actName });
      });
    });
    setData([...safeData, ...newRows]);
  }, [safeData, setData]);

  // Each "Add Row" click appends a whole copy of the checklist, so the trash icon on the last row
  // undoes one click at a time: it removes the most recently added copy, and clears the sheet once
  // only one copy is left. Where the last copy starts is the last header of the first category.
  const lastCopyStart = useMemo(() => {
    const firstCategory = BESS_CHARGING_SCHEDULE_ACTIVITIES[0]?.category;
    for (let i = safeData.length - 1; i >= 0; i--) {
      if (safeData[i]?.isCategoryRow && safeData[i].activity === firstCategory) return i;
    }
    return -1; // no category rows (older drafts) - the whole sheet is one copy
  }, [safeData]);

  const handleDeleteCopy = useCallback(() => {
    const clearsSheet = lastCopyStart <= 0;
    const message = clearsSheet
      ? "Delete all charging schedule rows? Entered values will be lost."
      : "Delete the last added set of activities? Values entered in it will be lost.";
    if (!window.confirm(message)) return;
    setData(clearsSheet ? [] : safeData.slice(0, lastCopyStart));
  }, [safeData, lastCopyStart, setData]);

  const getDateInputClass = (val: any) => 
    `w-full h-full p-2 outline-none bg-transparent text-xs ${!val ? 'text-transparent focus:text-black [&::-webkit-datetime-edit]:text-transparent focus:[&::-webkit-datetime-edit]:text-black' : 'text-black [&::-webkit-datetime-edit]:text-black'}`;

  return (
    <div className="space-y-2 w-full h-full flex-1 min-h-0 flex flex-col">
      <div className="flex items-center justify-between px-2">
        <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide">Charging Schedule</h3>
        <div className="flex gap-2">
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
              onClick={handleAddRow}
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
        className="flex-1 overflow-auto border-2 border-solid border-[#999999] rounded-md relative shadow-sm h-full w-full custom-scrollbar"
      >
        <table className="w-full text-sm text-left border-collapse min-w-max relative z-0">
          <thead>
            <tr className="bg-[#c7ccd1] text-[11px] font-bold text-slate-800 border border-solid border-[#999999]">
              <th rowSpan={3} className="px-2 py-1.5 border border-solid border-[#999999] text-center sticky left-0 bg-[#c7ccd1] z-10 shadow-[inset_-1px_0_0_0_#999999] relative" style={{ width: colWidths.containerMake, minWidth: colWidths.containerMake }}>Container Make<ResizeHandle col="containerMake" /></th>
              <th rowSpan={3} className="px-2 py-1.5 border border-solid border-[#999999] text-center relative" style={{ width: colWidths.blockNo, minWidth: colWidths.blockNo }}>Block No<ResizeHandle col="blockNo" /></th>
              <th rowSpan={3} className="px-2 py-1.5 border border-solid border-[#999999] text-center relative" style={{ width: colWidths.containersAtSite, minWidth: colWidths.containersAtSite }}>Containers at Site<ResizeHandle col="containersAtSite" /></th>
              <th rowSpan={3} className="px-2 py-1.5 border border-solid border-[#999999] text-center relative" style={{ width: colWidths.mwh, minWidth: colWidths.mwh }}>MWh<ResizeHandle col="mwh" /></th>
              <th rowSpan={3} className="px-2 py-1.5 border border-solid border-[#999999] text-center relative" style={{ width: colWidths.idtChargingStart, minWidth: colWidths.idtChargingStart }}>IDT Charging /<br/>Commissioning Start<ResizeHandle col="idtChargingStart" /></th>
              <th rowSpan={3} className="px-2 py-1.5 border border-solid border-[#999999] text-center relative" style={{ width: colWidths.trailRunEndDate, minWidth: colWidths.trailRunEndDate }}>Trail-Run<br/>End Date<ResizeHandle col="trailRunEndDate" /></th>
              <th rowSpan={3} className="px-2 py-1.5 border border-solid border-[#999999] text-center relative" style={{ width: colWidths.cod, minWidth: colWidths.cod }}>COD<ResizeHandle col="cod" /></th>
              <th colSpan={8} className="px-2 py-1.5 border border-solid border-[#999999] text-center border-b">Status</th>
              <th rowSpan={3} className="px-2 py-1.5 border border-solid border-[#999999] text-center relative" style={{ width: colWidths.productivity, minWidth: colWidths.productivity }}>Productivity<ResizeHandle col="productivity" /></th>
              <th rowSpan={3} className="px-2 py-1.5 border border-solid border-[#999999] text-center relative" style={{ width: colWidths.manpower, minWidth: colWidths.manpower }}>Manpower<ResizeHandle col="manpower" /></th>
              <th rowSpan={3} className="px-2 py-1.5 border border-solid border-[#999999] text-center relative" style={{ width: colWidths.totalMandays, minWidth: colWidths.totalMandays }}>Total Mandays<ResizeHandle col="totalMandays" /></th>
              <th rowSpan={3} className="px-2 py-1.5 border border-solid border-[#999999] text-center relative" style={{ minWidth: colWidths.remarks }}>Remarks<ResizeHandle col="remarks" /></th>
              {!isLocked && <th rowSpan={3} className="px-2 py-1.5 text-center w-[40px] bg-slate-100 border border-solid border-[#999999]"></th>}
            </tr>
            <tr className="bg-[#c7ccd1] text-[11px] font-bold text-slate-800 border border-solid border-[#999999]">
              <th rowSpan={2} className="px-1 py-1 border border-solid border-[#999999] text-center relative" style={{ width: colWidths.sr, minWidth: colWidths.sr }}>Sr<ResizeHandle col="sr" /></th>
              <th rowSpan={2} className="px-2 py-1 border border-solid border-[#999999] text-center relative" style={{ width: colWidths.activity, minWidth: colWidths.activity }}>Activity<ResizeHandle col="activity" /></th>
              <th colSpan={3} className="px-1 py-1 border border-solid border-[#999999] text-center border-b">Progress</th>
              <th rowSpan={2} className="px-2 py-1 border border-solid border-[#999999] text-center relative" style={{ width: colWidths.edc, minWidth: colWidths.edc }}>EDC<ResizeHandle col="edc" /></th>
              <th rowSpan={2} className="px-2 py-1 border border-solid border-[#999999] text-center relative" style={{ width: colWidths.newEdc, minWidth: colWidths.newEdc }}>Actual Finish Date /<br/>Forecast Finish Date<ResizeHandle col="newEdc" /></th>
              <th rowSpan={2} className="px-2 py-1 border border-solid border-[#999999] text-center relative" style={{ width: colWidths.vendor, minWidth: colWidths.vendor }}>vendor<ResizeHandle col="vendor" /></th>
            </tr>
            <tr className="bg-[#c7ccd1] text-[11px] font-bold text-slate-800 border border-solid border-[#999999]">
              <th className="px-1 py-1 border border-solid border-[#999999] text-center relative" style={{ width: colWidths.progressScope, minWidth: colWidths.progressScope }}>S<ResizeHandle col="progressScope" /></th>
              <th className="px-1 py-1 border border-solid border-[#999999] text-center relative" style={{ width: colWidths.progressCompleted, minWidth: colWidths.progressCompleted }}>C<ResizeHandle col="progressCompleted" /></th>
              <th className="px-1 py-1 border border-solid border-[#999999] text-center relative" style={{ width: colWidths.progressBalance, minWidth: colWidths.progressBalance }}>B<ResizeHandle col="progressBalance" /></th>
            </tr>
          </thead>
          <tbody className="bg-white">
            {safeData.slice(0, visibleCount).map((row, rIdx) => {
              if (row.isCategoryRow) {
                return (
                  <tr key={`cat-${rIdx}`} className="bg-[#e0f2e9]">
                    <td colSpan={19 + (isLocked ? 0 : 1)} className="border border-solid border-[#999999] px-3 py-2 font-bold text-[#065f46] text-sm">
                      {row.activity}
                    </td>
                  </tr>
                );
              }
              const p6 = getP6Progress(row.activity || '');
              const sVal = p6?.scope || row.progressScope || '';
              const isElectrical = BESS_CHARGING_SCHEDULE_ACTIVITIES.find(g => g.category === 'Electrical')?.activities.includes(row.activity);
              const isDprLevel = isElectrical && row.activity !== 'CSS Erection' && (!sVal || Number(sVal) === 0);

              return (
                <tr key={rIdx} className={`border border-dashed border-[#999999] transition-colors ${isDprLevel ? 'bg-[#FEF9C3] hover:bg-[#FEF08A]' : 'hover:bg-slate-50'}`}>
                  <td className="p-0 border border-dashed border-[#999999] sticky left-0 bg-white z-10 shadow-[inset_-1px_0_0_0_#999999]">
                    <input
                      type="text"
                      className="w-full h-full p-2 outline-none bg-transparent text-xs"
                      value={row.containerMake || ''}
                      onChange={(e) => handleCellChange(rIdx, 'containerMake', e.target.value)}
                      disabled={isLocked}
                    />
                  </td>
                  <td className="p-0 border border-dashed border-[#999999]">
                    <input
                      type="text"
                      className="w-full h-full p-2 outline-none bg-transparent text-xs"
                      value={row.blockNo || ''}
                      onChange={(e) => handleCellChange(rIdx, 'blockNo', e.target.value)}
                      disabled={isLocked}
                    />
                  </td>
                  <td className="p-0 border border-dashed border-[#999999]">
                    <input
                      type={activeCell?.row === rIdx && activeCell?.field === 'containersAtSite' ? 'date' : 'text'}
                      className={activeCell?.row === rIdx && activeCell?.field === 'containersAtSite' ? getDateInputClass(row.containersAtSite) : 'w-full h-full p-2 outline-none bg-transparent text-xs'}
                      value={activeCell?.row === rIdx && activeCell?.field === 'containersAtSite' ? parseDateForPicker(row.containersAtSite) : (row.containersAtSite || '')}
                      onFocus={() => setActiveCell({ row: rIdx, field: 'containersAtSite' })}
                      onBlur={() => setActiveCell(null)}
                      onChange={(e) => handleCellChange(rIdx, 'containersAtSite', e.target.value)}
                      disabled={isLocked}
                    />
                  </td>
                  <td className="p-0 border border-dashed border-[#999999]">
                    <input
                      type="number"
                      className="w-full h-full p-2 outline-none bg-transparent text-xs text-right"
                      value={row.mwh || ''}
                      onChange={(e) => handleCellChange(rIdx, 'mwh', e.target.value)}
                      disabled={isLocked}
                    />
                  </td>
                  <td className="p-0 border border-dashed border-[#999999]">
                    <input
                      type={activeCell?.row === rIdx && activeCell?.field === 'idtChargingStart' ? 'date' : 'text'}
                      className={activeCell?.row === rIdx && activeCell?.field === 'idtChargingStart' ? getDateInputClass(row.idtChargingStart) : 'w-full h-full p-2 outline-none bg-transparent text-xs'}
                      value={activeCell?.row === rIdx && activeCell?.field === 'idtChargingStart' ? parseDateForPicker(row.idtChargingStart) : (row.idtChargingStart || '')}
                      onFocus={() => setActiveCell({ row: rIdx, field: 'idtChargingStart' })}
                      onBlur={() => setActiveCell(null)}
                      onChange={(e) => handleCellChange(rIdx, 'idtChargingStart', e.target.value)}
                      disabled={isLocked}
                    />
                  </td>
                  <td className={`p-0 border border-dashed border-[#999999] ${isDprLevel ? 'bg-transparent' : 'bg-slate-50'}`}>
                    <div className="flex items-center">
                      <input
                        type={activeCell?.row === rIdx && activeCell?.field === 'trailRunEndDate' ? 'date' : 'text'}
                        className={activeCell?.row === rIdx && activeCell?.field === 'trailRunEndDate' ? getDateInputClass(row.trailRunEndDate) : 'w-full h-full p-2 outline-none bg-transparent text-xs'}
                        value={activeCell?.row === rIdx && activeCell?.field === 'trailRunEndDate' ? parseDateForPicker(row.trailRunEndDate) : (row.trailRunEndDate || '')}
                        onFocus={() => setActiveCell({ row: rIdx, field: 'trailRunEndDate' })}
                        onBlur={() => setActiveCell(null)}
                        onChange={(e) => handleCellChange(rIdx, 'trailRunEndDate', e.target.value)}
                        disabled={isLocked}
                        title="Auto-calculated: IDT + 3 days (editable)"
                      />
                      {(() => {
                        const diff = daysDiff(row.idtChargingStart, row.trailRunEndDate);
                        if (diff === null) return null;
                        const isDefault = diff === 3;
                        return (
                          <span
                            className={`shrink-0 mr-1 px-1 py-0.5 rounded text-[9px] font-bold leading-none ${
                              isDefault ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                            }`}
                            title={`${diff} day${diff !== 1 ? 's' : ''} from IDT`}
                          >
                            +{diff}d
                          </span>
                        );
                      })()}
                    </div>
                  </td>
                  <td className={`p-0 border border-dashed border-[#999999] ${isDprLevel ? 'bg-transparent' : 'bg-slate-50'}`}>
                    <div className="flex items-center">
                      <input
                        type={activeCell?.row === rIdx && activeCell?.field === 'cod' ? 'date' : 'text'}
                        className={activeCell?.row === rIdx && activeCell?.field === 'cod' ? getDateInputClass(row.cod) : 'w-full h-full p-2 outline-none bg-transparent text-xs'}
                        value={activeCell?.row === rIdx && activeCell?.field === 'cod' ? parseDateForPicker(row.cod) : (row.cod || '')}
                        onFocus={() => setActiveCell({ row: rIdx, field: 'cod' })}
                        onBlur={() => setActiveCell(null)}
                        onChange={(e) => handleCellChange(rIdx, 'cod', e.target.value)}
                        disabled={isLocked}
                        title="Auto-calculated: Trail-Run + 2 days (editable)"
                      />
                      {(() => {
                        const diff = daysDiff(row.trailRunEndDate, row.cod);
                        if (diff === null) return null;
                        const isDefault = diff === 2;
                        return (
                          <span
                            className={`shrink-0 mr-1 px-1 py-0.5 rounded text-[9px] font-bold leading-none ${
                              isDefault ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                            }`}
                            title={`${diff} day${diff !== 1 ? 's' : ''} from Trail-Run`}
                          >
                            +{diff}d
                          </span>
                        );
                      })()}
                    </div>
                  </td>
                  <td className={`p-0 border border-dashed border-[#999999] ${isDprLevel ? 'bg-transparent' : 'bg-slate-50/50'}`}>
                    <input
                      type="text"
                      className="w-full h-full p-2 outline-none bg-transparent text-xs text-center"
                      value={row.sr || ''}
                      onChange={(e) => handleCellChange(rIdx, 'sr', e.target.value)}
                      disabled={isLocked}
                    />
                  </td>
                  <td className={`p-0 border border-dashed border-[#999999] ${isDprLevel ? 'bg-transparent' : 'bg-slate-50/50'}`}>
                    <div className="w-full h-full p-2 text-xs text-slate-800 font-medium overflow-hidden text-ellipsis whitespace-nowrap" title={row.activity || ''}>
                      {row.activity || ''}
                    </div>
                  </td>
                  {(() => {
                    const cVal = p6?.completed || row.progressCompleted || '';
                    const isP6 = !!p6;
                    return (
                      <>
                        <td className={`p-0 border border-dashed border-[#999999] ${isDprLevel ? 'bg-transparent' : 'bg-slate-50/50'}`}>
                          <input
                            type="number"
                            className={`w-full h-full p-2 outline-none bg-transparent text-xs text-right ${isP6 ? 'text-blue-700 font-bold' : ''}`}
                            value={sVal}
                            onChange={(e) => handleCellChange(rIdx, 'progressScope', e.target.value)}
                            disabled={isLocked || isP6}
                            title={isP6 ? "Auto-populated from P6 data" : ""}
                          />
                        </td>
                        <td className={`p-0 border border-dashed border-[#999999] ${isDprLevel ? 'bg-transparent' : 'bg-slate-50/50'}`}>
                          <input
                            type="number"
                            className={`w-full h-full p-2 outline-none bg-transparent text-xs text-right ${isP6 ? 'text-blue-700 font-bold' : ''}`}
                            value={cVal}
                            onChange={(e) => handleCellChange(rIdx, 'progressCompleted', e.target.value)}
                            disabled={isLocked || isP6}
                            title={isP6 ? "Auto-populated from P6 data" : ""}
                          />
                        </td>
                        <td className="p-0 border border-dashed border-[#999999] bg-slate-50/50">
                          <div className={`w-full h-full p-2 text-xs text-right font-medium ${isP6 ? 'text-blue-700' : 'text-slate-600'} bg-slate-50`}>
                            {Number(sVal || 0) - Number(cVal || 0)}
                          </div>
                        </td>
                      </>
                    );
                  })()}
                  <td className="p-0 border border-dashed border-[#999999] bg-slate-50/50">
                    <input
                      type={activeCell?.row === rIdx && activeCell?.field === 'edc' ? 'date' : 'text'}
                      className={activeCell?.row === rIdx && activeCell?.field === 'edc' ? getDateInputClass(row.edc) : 'w-full h-full p-2 outline-none bg-transparent text-xs'}
                      value={activeCell?.row === rIdx && activeCell?.field === 'edc' ? parseDateForPicker(row.edc) : (row.edc || '')}
                      onFocus={() => setActiveCell({ row: rIdx, field: 'edc' })}
                      onBlur={() => setActiveCell(null)}
                      onChange={(e) => handleCellChange(rIdx, 'edc', e.target.value)}
                      disabled={isLocked}
                    />
                  </td>
                  {(() => {
                    const p6 = getP6Progress(row.activity);
                    const isActual = !!p6?.actualFinish;
                    const derivedDate = p6?.actualFinish || p6?.forecastFinish || '';
                    const colorClass = isActual ? 'text-green-600 font-medium' : (derivedDate ? 'text-blue-600 font-medium' : 'text-slate-700');
                    return (
                      <td className="p-0 border border-dashed border-[#999999] bg-slate-50/50">
                        <div className={`w-full h-full p-2 text-xs text-center flex flex-col items-center justify-center ${colorClass}`}>
                          {derivedDate ? (indianDateFormat(derivedDate) || derivedDate) : '-'}
                        </div>
                      </td>
                    );
                  })()}
                  <td className="p-0 border border-dashed border-[#999999] bg-slate-50/50">
                    <input
                      type="text"
                      className="w-full h-full p-2 outline-none bg-transparent text-xs"
                      value={row.vendor || ''}
                      onChange={(e) => handleCellChange(rIdx, 'vendor', e.target.value)}
                      disabled={isLocked}
                    />
                  </td>
                  <td className="p-0 border border-dashed border-[#999999]">
                    <input
                      type="number"
                      className="w-full h-full p-2 outline-none bg-transparent text-xs text-right"
                      value={row.productivity || ''}
                      onChange={(e) => handleCellChange(rIdx, 'productivity', e.target.value)}
                      disabled={isLocked}
                    />
                  </td>
                  <td className="p-0 border border-dashed border-[#999999]">
                    <input
                      type="number"
                      className="w-full h-full p-2 outline-none bg-transparent text-xs text-right"
                      value={row.manpower || ''}
                      onChange={(e) => handleCellChange(rIdx, 'manpower', e.target.value)}
                      disabled={isLocked}
                    />
                  </td>
                  <td className="p-0 border border-dashed border-[#999999]">
                    <input
                      type="number"
                      className="w-full h-full p-2 outline-none bg-transparent text-xs text-right"
                      value={row.totalMandays || ''}
                      onChange={(e) => handleCellChange(rIdx, 'totalMandays', e.target.value)}
                      disabled={isLocked}
                    />
                  </td>
                  <td className="p-0 border border-dashed border-[#999999]">
                    <input
                      type="text"
                      className="w-full h-full p-2 outline-none bg-transparent text-xs"
                      value={row.remarks || ''}
                      onChange={(e) => handleCellChange(rIdx, 'remarks', e.target.value)}
                      disabled={isLocked}
                    />
                  </td>
                  {!isLocked && (
                    <td className="p-2 border border-dashed border-[#999999] text-center align-middle bg-slate-50">
                      {/* Single control on the last row that removes the most recently added copy
                          of the checklist - there is no per-row delete, since the activity list is
                          a fixed checklist. */}
                      {rIdx === safeData.length - 1 && (
                        <button
                          onClick={handleDeleteCopy}
                          className="text-red-400 hover:text-red-600 transition-colors"
                          title={lastCopyStart > 0
                            ? "Delete the last added set of activities"
                            : "Delete all rows"}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
            
            {visibleCount < safeData.length && (
              <tr>
                <td colSpan={19 + (isLocked ? 0 : 1)} className="p-3 text-center bg-slate-50/50">
                  <button
                    onClick={loadMore}
                    className="text-xs text-blue-600 hover:text-blue-800 font-semibold underline underline-offset-2"
                  >
                    Showing {visibleCount} of {safeData.length} rows - click or scroll to show more
                  </button>
                </td>
              </tr>
            )}

            {safeData.length === 0 && (
              <tr>
                <td colSpan={19 + (isLocked ? 0 : 1)} className="p-8 text-center text-slate-500 bg-slate-50/50">
                  <div className="flex flex-col items-center justify-center space-y-2">
                    <p>No rows added yet. Click <strong>"Add Row"</strong> to load the activities.</p>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
});
