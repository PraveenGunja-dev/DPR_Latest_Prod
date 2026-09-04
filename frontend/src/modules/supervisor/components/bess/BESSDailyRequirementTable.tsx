import React, { memo, useCallback, useMemo, useState } from 'react';
import { Info, X } from 'lucide-react';
import { useProgressiveRows } from '@/hooks/useProgressiveRows';
import { useColumnResize } from '@/hooks/useColumnResize';
import { indianDateFormat, parseDateToIso } from '@/services/dprService';

interface BESSDailyRequirementTableProps {
  data: any[];
  setData: (data: any[]) => void;
  onSave?: (isAutoSave?: boolean) => void;
  isLocked?: boolean;
  p6Data?: any[];
  chargingScheduleData?: any[];
}

const ACTIVITIES = ['Erection', 'Cable Laying', 'Termination', 'Testing', 'CFT'];

function extractBlockNumber(blockStr: string): string {
  const s = String(blockStr || '').toLowerCase().trim();
  const match = s.match(/(?:block|blk)\s*0*(\d+)/);
  if (match) return match[1];
  const numMatch = s.match(/^0*(\d+)$/);
  if (numMatch) return numMatch[1];
  return s;
}

function calculateAutoEndDate(startDate: string, activityName: string): string {
  if (!startDate) return '';
  const iso = parseDateToIso(startDate);
  if (!iso) return '';
  
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  
  let daysToAdd = 0;
  if (activityName === 'Cable Laying') daysToAdd = 20;
  else if (activityName === 'Erection') daysToAdd = 10;
  else if (activityName === 'Termination') daysToAdd = 20;
  else if (activityName === 'Testing') daysToAdd = 14;
  else return '';
  
  d.setDate(d.getDate() + daysToAdd);
  
  // Format to standard ISO string to pass to indianDateFormat
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const isoResult = `${yyyy}-${mm}-${dd}`;
  
  return indianDateFormat(isoResult) || isoResult;
}

export const BESSDailyRequirementTable: React.FC<BESSDailyRequirementTableProps> = memo(({
  data,
  setData,
  onSave,
  isLocked = false,
  p6Data = [],
  chargingScheduleData = [],
}: BESSDailyRequirementTableProps) => {

  const safeData = Array.isArray(data) ? data : [];

  const { visibleCount, containerRef, handleScroll, loadMore } = useProgressiveRows(safeData.length);
  const [shouldAutoSave, setShouldAutoSave] = useState(false);
  const [validationModal, setValidationModal] = useState<{ title: string; activities: any[] } | null>(null);

  const globalMaxBlock = useMemo(() => {
    let max = 0;
    p6Data.forEach(act => {
      const rawBlock = act.block || act.extraData?.block || act.location || act.pss || act.wbsName || act.description || act.name || '';
      const blockNumStr = extractBlockNumber(rawBlock);
      const bNum = parseInt(blockNumStr, 10);
      if (!isNaN(bNum) && bNum > max) {
        max = bNum;
      }
    });
    return max > 0 ? max : 8; // Fallback to 8 blocks if no data is found
  }, [p6Data]);

  const { colWidths, handleResizeStart } = useColumnResize({
    blockNo: 80, idtChargingStart: 120, trailRunEndDate: 120, cod: 120,
    activity: 120, mandays: 80, startDate: 100, endDate: 100, days: 80,
    avgManpowerPlusBuffer: 100, avgManpower: 100, peakManpower: 100,
  });

  const ResizeHandle = ({ col }: { col: string }) => (
    <div
      onMouseDown={(e) => handleResizeStart(e, col)}
      className="absolute right-0 top-0 bottom-0 w-[5px] cursor-col-resize z-[12] hover:bg-gray-400/50 transition-colors"
    />
  );

  const [activeCell, setActiveCell] = useState<{ row: number; field: string } | null>(null);

  const parseDateForPicker = (val: string | undefined): string => {
    if (!val) return '';
    const iso = parseDateToIso(val);
    return iso || '';
  };

  const handleCellChange = useCallback((rowIndex: number, field: string, value: string) => {
    const rows = Array.isArray(data) ? data : [];
    const updated = [...rows];

    const dateFields = ['idtChargingStart', 'trailRunEndDate', 'cod', 'startDate', 'endDate'];
    let storedValue = value;
    if (dateFields.includes(field) && value) {
      storedValue = indianDateFormat(value) || value;
    }

    const row = { ...updated[rowIndex], [field]: storedValue };
    row._cellStatuses = { ...(updated[rowIndex]._cellStatuses || {}), [field]: 'edited' };
    
    // Auto-calculate End Date and Days if startDate changes
    if (field === 'startDate') {
      const newEndDate = calculateAutoEndDate(storedValue, row.activity || '');
      if (newEndDate) {
        row.endDate = newEndDate;
        row._cellStatuses.endDate = 'edited';
      }
    }

    // Auto-calculate Days if startDate or endDate changes
    if (field === 'startDate' || field === 'endDate') {
      const start = field === 'startDate' ? storedValue : row.startDate;
      const end = field === 'endDate' ? storedValue : row.endDate;
      if (start && end) {
        const d1 = new Date(parseDateToIso(start));
        const d2 = new Date(parseDateToIso(end));
        if (!isNaN(d1.getTime()) && !isNaN(d2.getTime())) {
          const diffTime = Math.abs(d2.getTime() - d1.getTime());
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
          row.days = String(diffDays);
        }
      }
    }

    // Auto-calculate Avg Manpower + 20% Buffer if Avg Manpower changes
    if (field === 'avgManpower') {
      const val = parseFloat(storedValue);
      if (!isNaN(val)) {
        row.avgManpowerPlusBuffer = String(Math.ceil(val * 1.2));
      } else {
        row.avgManpowerPlusBuffer = '';
      }
    }
    
    // For block-level fields, we want to update all rows in the block
    const isBlockLevel = ['blockNo', 'idtChargingStart', 'trailRunEndDate', 'cod', 'avgManpowerPlusBuffer', 'avgManpower', 'peakManpower'].includes(field);
    const targetBlock = updated[rowIndex].blockNo;

    if (isBlockLevel && targetBlock) {
      for (let i = 0; i < updated.length; i++) {
        if (updated[i].blockNo === targetBlock) {
          const r = { ...updated[i], [field]: storedValue };
          r._cellStatuses = { ...(updated[i]._cellStatuses || {}), [field]: 'edited' };
          
          if (field === 'avgManpower') {
            const val = parseFloat(storedValue);
            if (!isNaN(val)) {
              r.avgManpowerPlusBuffer = String(Math.ceil(val * 1.2));
            } else {
              r.avgManpowerPlusBuffer = '';
            }
          }
          
          updated[i] = r;
        }
      }
    } else {
      updated[rowIndex] = row;
    }

    setData(updated);
  }, [data, setData]);

  const emptyRow = () => ({
    blockNo: '',
    idtChargingStart: '',
    trailRunEndDate: '',
    cod: '',
    activity: '',
    mandays: '',
    startDate: '',
    endDate: '',
    days: '',
    avgManpowerPlusBuffer: '',
    avgManpower: '',
    peakManpower: '',
  });

  const autoPopulatedRef = React.useRef(false);

  React.useEffect(() => {
    if (safeData.length === 0 && !isLocked && !autoPopulatedRef.current) {
      autoPopulatedRef.current = true;
      const newRows: any[] = [];
      for (let block = 1; block <= globalMaxBlock; block++) {
        ACTIVITIES.forEach((actName, idx) => {
          newRows.push({ 
            ...emptyRow(), 
            activity: actName, 
            blockNo: `Block ${block}` 
          });
        });
      }
      setData(newRows);
    }
  }, [safeData.length, isLocked, setData, globalMaxBlock]);

  const p6DerivedDates = useMemo(() => {
    type ActivityDetail = { maxBct: number, date: string, origName: string, rawBlock: string, isActual: boolean };
    const erectionBlockActivityDates = new Map<string, Map<string, ActivityDetail>>();
    const cableBlockActivityDates = new Map<string, Map<string, ActivityDetail>>();
    const terminationBlockActivityDates = new Map<string, Map<string, ActivityDetail>>();
    const testingBlockActivityDates = new Map<string, Map<string, ActivityDetail>>();
    
    const erectionActivitiesList = [
      'bcf - precast erection',
      'erection of precast structure bot',
      'container erection',
      'pcs erection',
      'panel & acdb erection',
      'ht panel erection',
      'ems/ecp panel erection',
      'nifps - erection & installation'
    ];

    (p6Data || []).forEach(act => {
      let name = String(act.subHeading || act.description || act.name || '').toLowerCase().trim();
      if (!name) return;
      
      const isErection = erectionActivitiesList.includes(name) || name.includes('css erection');
      const isCable = name.includes('cable laying');
      const isTermination = name.includes('termination');
      const isTesting = name.includes('test');
      
      if (isErection || isCable || isTermination || isTesting) {
        const rawBlock = act.block || act.location || act.pss || act.wbsName || act.description || act.name || act.extraData?.block || '';
        const blockNum = extractBlockNumber(rawBlock);
        
        let bctNum = 0;
        const bctMatch = rawBlock.match(/bct\s*0*(\d+)/i);
        if (bctMatch) bctNum = parseInt(bctMatch[1], 10);
        
        const actFinish = act.actualFinish || act.extraData?.actualFinish;
        const fcstFinish = act.forecastFinish || act.extraData?.forecastFinish;
        const dateToUse = actFinish || fcstFinish;
        
        if (blockNum && dateToUse) {
          const genericName = name.includes('css erection') ? 'css erection' : name;
          let mapToUse;
          if (isErection) mapToUse = erectionBlockActivityDates;
          else if (isCable) mapToUse = cableBlockActivityDates;
          else if (isTermination) mapToUse = terminationBlockActivityDates;
          else mapToUse = testingBlockActivityDates;
          
          if (!mapToUse.has(blockNum)) {
            mapToUse.set(blockNum, new Map());
          }
          const activityMap = mapToUse.get(blockNum)!;
          
          const origName = act.description || act.name || act.subHeading || genericName;
          const detail: ActivityDetail = { maxBct: bctNum, date: dateToUse, origName, rawBlock, isActual: !!actFinish };
          
          const existing = activityMap.get(genericName);
          if (!existing || bctNum > existing.maxBct) {
            activityMap.set(genericName, detail);
          } else if (bctNum === existing.maxBct) {
            if (new Date(dateToUse) < new Date(existing.date)) {
              activityMap.set(genericName, detail);
            }
          }
        }
      }
    });

    const extractMinDates = (blockActivityMap: Map<string, Map<string, ActivityDetail>>) => {
      const startDates = new Map<string, { minDate: string, details: any[] }>();
      blockActivityMap.forEach((activityMap, blockNum) => {
        let minDate = '';
        const details: any[] = [];
        activityMap.forEach((detail, key) => {
          if (!minDate || new Date(detail.date) < new Date(minDate)) {
            minDate = detail.date;
          }
          details.push({ key, ...detail });
        });
        if (minDate) {
          startDates.set(blockNum, { minDate, details });
        }
      });
      return startDates;
    };

    return {
      erectionStartDates: extractMinDates(erectionBlockActivityDates),
      cableStartDates: extractMinDates(cableBlockActivityDates),
      terminationStartDates: extractMinDates(terminationBlockActivityDates),
      testingStartDates: extractMinDates(testingBlockActivityDates),
    };
  }, [p6Data]);

  // Sync dates from chargingScheduleData and p6Data
  React.useEffect(() => {
    if (isLocked || safeData.length === 0) return;
    
    let hasChanges = false;
    const updated = [...safeData];

    // Build a map of blockNo -> dates from chargingScheduleData
    // Also build a map for totalMandays by block and activity group
    const scheduleDatesMap = new Map<string, any>();
    const scheduleMandaysMap = new Map<string, number>();
    
    (chargingScheduleData || []).forEach(row => {
      const blockNum = extractBlockNumber(row.blockNo || '');
      if (blockNum) {
        if (!scheduleDatesMap.has(blockNum) || (row.idtChargingStart || row.trailRunEndDate || row.cod)) {
           scheduleDatesMap.set(blockNum, {
             idtChargingStart: row.idtChargingStart,
             trailRunEndDate: row.trailRunEndDate,
             cod: row.cod
           });
        }
        
        // Accumulate totalMandays for each group
        const actName = String(row.activity || '').toLowerCase();
        const mandays = parseInt(row.totalMandays || '0', 10);
        if (!isNaN(mandays) && mandays > 0) {
          let group = '';
          if (actName.includes('erection')) group = 'Erection';
          else if (actName.includes('cable laying')) group = 'Cable Laying';
          else if (actName.includes('termination')) group = 'Termination';
          else if (actName.includes('test')) group = 'Testing';
          
          if (group) {
            const key = `${blockNum}|${group}`;
            scheduleMandaysMap.set(key, (scheduleMandaysMap.get(key) || 0) + mandays);
          }
        }
      }
    });

    const { erectionStartDates, cableStartDates, terminationStartDates, testingStartDates } = p6DerivedDates;

    const calcDays = (start: string, end: string) => {
      if (!start || !end) return '';
      const d1 = new Date(parseDateToIso(start));
      const d2 = new Date(parseDateToIso(end));
      if (!isNaN(d1.getTime()) && !isNaN(d2.getTime())) {
        const diffTime = Math.abs(d2.getTime() - d1.getTime());
        return String(Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
      }
      return '';
    };

    for (let i = 0; i < updated.length; i++) {
      const row = updated[i];
      const blockNum = extractBlockNumber(row.blockNo || '');
      if (!blockNum) continue;

      let rowChanged = false;
      const newRow = { ...row };
      
      // 1. Sync from Charging Schedule
      if (scheduleDatesMap.has(blockNum)) {
        const dates = scheduleDatesMap.get(blockNum);
        
        if (dates.idtChargingStart && newRow.idtChargingStart !== dates.idtChargingStart) {
          newRow.idtChargingStart = dates.idtChargingStart;
          rowChanged = true;
        }
        if (dates.trailRunEndDate && newRow.trailRunEndDate !== dates.trailRunEndDate) {
          newRow.trailRunEndDate = dates.trailRunEndDate;
          rowChanged = true;
        }
        if (dates.cod && newRow.cod !== dates.cod) {
          newRow.cod = dates.cod;
          rowChanged = true;
        }
      }

      // Sync Mandays from Charging Schedule
      if (['Erection', 'Cable Laying', 'Termination', 'Testing'].includes(newRow.activity)) {
        const key = `${blockNum}|${newRow.activity}`;
        const sumMandays = scheduleMandaysMap.get(key);
        // If there are summed mandays, apply them. (If none, leave as is, or clear? Let's apply if available)
        if (sumMandays !== undefined && String(sumMandays) !== newRow.mandays) {
          newRow.mandays = String(sumMandays);
          rowChanged = true;
        }
      }

      // 2. Sync Erection Start Date from P6 Data
      if (newRow.activity === 'Erection' && erectionStartDates.has(blockNum)) {
        const info = erectionStartDates.get(blockNum);
        let minStartDate = info?.minDate || '';
        if (minStartDate) {
          minStartDate = indianDateFormat(minStartDate) || minStartDate;
        }
        
        if (minStartDate && newRow.startDate !== minStartDate) {
          newRow.startDate = minStartDate;
          rowChanged = true;
        }
      }

      // 3. Sync Cable Laying Start Date from P6 Data
      if (newRow.activity === 'Cable Laying' && cableStartDates.has(blockNum)) {
        const info = cableStartDates.get(blockNum);
        let minStartDate = info?.minDate || '';
        if (minStartDate) {
          minStartDate = indianDateFormat(minStartDate) || minStartDate;
        }
        
        if (minStartDate && newRow.startDate !== minStartDate) {
          newRow.startDate = minStartDate;
          rowChanged = true;
        }
      }

      // 4. Sync Termination Start Date from P6 Data
      if (newRow.activity === 'Termination' && terminationStartDates.has(blockNum)) {
        const info = terminationStartDates.get(blockNum);
        let minStartDate = info?.minDate || '';
        if (minStartDate) {
          minStartDate = indianDateFormat(minStartDate) || minStartDate;
        }
        
        if (minStartDate && newRow.startDate !== minStartDate) {
          newRow.startDate = minStartDate;
          rowChanged = true;
        }
      }

      // 5. Sync Testing Start Date from P6 Data
      if (newRow.activity === 'Testing' && testingStartDates.has(blockNum)) {
        const info = testingStartDates.get(blockNum);
        let minStartDate = info?.minDate || '';
        if (minStartDate) {
          minStartDate = indianDateFormat(minStartDate) || minStartDate;
        }
        
        if (minStartDate && newRow.startDate !== minStartDate) {
          newRow.startDate = minStartDate;
          rowChanged = true;
        }
      }

      // Auto-calculate End Date and Days based on rules
      if (['Erection', 'Cable Laying', 'Termination', 'Testing'].includes(newRow.activity)) {
        if (newRow.startDate) {
          const autoEnd = calculateAutoEndDate(newRow.startDate, newRow.activity);
          if (autoEnd && newRow.endDate !== autoEnd) {
            newRow.endDate = autoEnd;
            rowChanged = true;
          }
        }
        if (newRow.startDate && newRow.endDate) {
          const newDays = calcDays(newRow.startDate, newRow.endDate);
          if (newRow.days !== newDays) {
            newRow.days = newDays;
            rowChanged = true;
          }
        }
      }
      
      if (rowChanged) {
        newRow._cellStatuses = { ...newRow._cellStatuses, idtChargingStart: 'edited', trailRunEndDate: 'edited', cod: 'edited', startDate: 'edited', days: 'edited' };
        updated[i] = newRow;
        hasChanges = true;
      }
    }

    if (hasChanges) {
      setData(updated);
      if (!isLocked) {
        setShouldAutoSave(true);
      }
    }
  }, [chargingScheduleData, p6Data, safeData, isLocked, setData]);

  React.useEffect(() => {
    if (shouldAutoSave && onSave && !isLocked) {
      setShouldAutoSave(false);
      onSave(true);
    }
  }, [shouldAutoSave, onSave, isLocked]);

  const getDateInputClass = (val: any) => 
    `w-full h-full p-2 outline-none bg-transparent text-xs ${!val ? 'text-transparent focus:text-black [&::-webkit-datetime-edit]:text-transparent focus:[&::-webkit-datetime-edit]:text-black' : 'text-black [&::-webkit-datetime-edit]:text-black'}`;

  // Helper to check if a row is the first of its block (assuming contiguous blocks of 5)
  const isFirstRowOfBlock = (rIdx: number) => rIdx % ACTIVITIES.length === 0;

  return (
    <div className="space-y-2 w-full h-full flex-1 min-h-0 flex flex-col">
      <div className="flex items-center justify-between px-2">
        <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide">Daily requirement</h3>
        <div className="flex gap-2">
          {!isLocked && onSave && (
            <button
              onClick={() => onSave(false)}
              className="flex items-center gap-1.5 px-4 py-2 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors shadow-sm font-semibold"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-save"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
              Save
            </button>
          )}
        </div>
      </div>

      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-auto border-2 border-solid border-[#999999] rounded-md relative shadow-sm h-full w-full custom-scrollbar"
      >
        <table className="w-full text-sm text-left border-separate border-spacing-0 min-w-max relative z-0">
          <thead className="sticky top-0 z-20 bg-[#c7ccd1] bg-clip-padding">
            <tr className="bg-[#c7ccd1] text-[11px] font-bold text-slate-800 border border-solid border-[#999999]">
              <th className="px-2 py-1.5 border border-solid border-[#999999] text-center sticky left-0 bg-[#c7ccd1] z-30 shadow-[inset_-1px_0_0_0_#999999] relative bg-clip-padding" style={{ width: colWidths.blockNo, minWidth: colWidths.blockNo }}>Block No<ResizeHandle col="blockNo" /></th>
              <th className="px-2 py-1.5 border border-solid border-[#999999] text-center relative bg-[#c7ccd1] bg-clip-padding z-20" style={{ width: colWidths.idtChargingStart, minWidth: colWidths.idtChargingStart }}>IDT Charging /<br/>Commissioning<br/>Start<ResizeHandle col="idtChargingStart" /></th>
              <th className="px-2 py-1.5 border border-solid border-[#999999] text-center relative bg-[#c7ccd1] bg-clip-padding z-20" style={{ width: colWidths.trailRunEndDate, minWidth: colWidths.trailRunEndDate }}>Trial-Run End Da<ResizeHandle col="trailRunEndDate" /></th>
              <th className="px-2 py-1.5 border border-solid border-[#999999] text-center relative bg-[#c7ccd1] bg-clip-padding z-20" style={{ width: colWidths.cod, minWidth: colWidths.cod }}>COD<ResizeHandle col="cod" /></th>
              <th className="px-2 py-1.5 border border-solid border-[#999999] text-center relative bg-[#c7ccd1] bg-clip-padding z-20" style={{ width: colWidths.activity, minWidth: colWidths.activity }}>Activity<ResizeHandle col="activity" /></th>
              <th className="px-2 py-1.5 border border-solid border-[#999999] text-center relative bg-[#c7ccd1] bg-clip-padding z-20" style={{ width: colWidths.mandays, minWidth: colWidths.mandays }}>Mandays<ResizeHandle col="mandays" /></th>
              <th className="px-2 py-1.5 border border-solid border-[#999999] text-center relative bg-[#c7ccd1] bg-clip-padding z-20" style={{ width: colWidths.startDate, minWidth: colWidths.startDate }}>Start date<ResizeHandle col="startDate" /></th>
              <th className="px-2 py-1.5 border border-solid border-[#999999] text-center relative bg-[#c7ccd1] bg-clip-padding z-20" style={{ width: colWidths.endDate, minWidth: colWidths.endDate }}>End Date<ResizeHandle col="endDate" /></th>
              <th className="px-2 py-1.5 border border-solid border-[#999999] text-center relative bg-[#c7ccd1] bg-clip-padding z-20" style={{ width: colWidths.days, minWidth: colWidths.days }}>Days<ResizeHandle col="days" /></th>
              <th className="px-2 py-1.5 border border-solid border-[#999999] text-center relative bg-[#c7ccd1] bg-clip-padding z-20" style={{ width: colWidths.avgManpowerPlusBuffer, minWidth: colWidths.avgManpowerPlusBuffer }}>Avg<br/>Manpower +<br/>20% Buffer<ResizeHandle col="avgManpowerPlusBuffer" /></th>
              <th className="px-2 py-1.5 border border-solid border-[#999999] text-center relative bg-[#c7ccd1] bg-clip-padding z-20" style={{ width: colWidths.avgManpower, minWidth: colWidths.avgManpower }}>Avg<br/>Manpower<ResizeHandle col="avgManpower" /></th>
              <th className="px-2 py-1.5 border border-solid border-[#999999] text-center relative bg-[#c7ccd1] bg-clip-padding z-20" style={{ width: colWidths.peakManpower, minWidth: colWidths.peakManpower }}>Peak<br/>Manpower<ResizeHandle col="peakManpower" /></th>
            </tr>
          </thead>
          <tbody className="bg-white">
            {safeData.slice(0, visibleCount).map((row, rIdx) => {
              const rowSpanCount = ACTIVITIES.length;
              const isFirst = isFirstRowOfBlock(rIdx);

              return (
                <tr key={rIdx} className="border border-dashed border-[#999999] transition-colors hover:bg-slate-50">
                  {isFirst && (
                    <>
                      <td rowSpan={rowSpanCount} className="p-0 border border-dashed border-[#999999] font-bold sticky left-0 bg-white z-10 shadow-[inset_-1px_0_0_0_#999999] align-middle">
                        <input
                          type="text"
                          className="w-full h-full font-bold p-2 outline-none bg-transparent text-xs text-center"
                          value={row.blockNo || ''}
                          onChange={(e) => handleCellChange(rIdx, 'blockNo', e.target.value)}
                          disabled={isLocked}
                        />
                      </td>
                      <td rowSpan={rowSpanCount} className="p-0 border border-dashed border-[#999999] align-middle text-center">
                        <input
                          type="text"
                          className="w-full h-full p-2 outline-none bg-transparent text-xs text-center"
                          value={row.idtChargingStart || ''}
                          onChange={(e) => handleCellChange(rIdx, 'idtChargingStart', e.target.value)}
                          disabled={isLocked}
                        />
                      </td>
                      <td rowSpan={rowSpanCount} className="p-0 border border-dashed border-[#999999] align-middle text-center">
                        <input
                          type="text"
                          className="w-full h-full p-2 outline-none bg-transparent text-xs text-center"
                          value={row.trailRunEndDate || ''}
                          onChange={(e) => handleCellChange(rIdx, 'trailRunEndDate', e.target.value)}
                          disabled={isLocked}
                        />
                      </td>
                      <td rowSpan={rowSpanCount} className="p-0 border border-dashed border-[#999999] align-middle text-center">
                        <input
                          type="text"
                          className="w-full h-full p-2 outline-none bg-transparent text-xs text-center"
                          value={row.cod || ''}
                          onChange={(e) => handleCellChange(rIdx, 'cod', e.target.value)}
                          disabled={isLocked}
                        />
                      </td>
                    </>
                  )}
                  <td className="p-0 border border-dashed border-[#999999] relative group">
                    <div className="flex items-center justify-between w-full h-full p-2 text-xs text-slate-800 font-medium overflow-hidden text-ellipsis whitespace-nowrap" title={row.activity || ''}>
                      <span>{row.activity || ''}</span>
                      {(() => {
                        const blockNum = extractBlockNumber(row.blockNo || '');
                        let details: any[] | null = null;
                        if (row.activity === 'Erection') details = p6DerivedDates.erectionStartDates.get(blockNum)?.details || null;
                        else if (row.activity === 'Cable Laying') details = p6DerivedDates.cableStartDates.get(blockNum)?.details || null;
                        else if (row.activity === 'Termination') details = p6DerivedDates.terminationStartDates.get(blockNum)?.details || null;
                        else if (row.activity === 'Testing') details = p6DerivedDates.testingStartDates.get(blockNum)?.details || null;
                        
                        if (details && details.length > 0 && blockNum === '1') {
                          return (
                            <button
                              onClick={() => setValidationModal({ title: `${row.blockNo} - ${row.activity}`, activities: details! })}
                              className="text-blue-500 hover:text-blue-700 bg-white rounded-full transition-colors ml-1 shrink-0"
                              title="View P6 Activities"
                            >
                              <Info size={14} />
                            </button>
                          );
                        }
                        return null;
                      })()}
                    </div>
                  </td>
                  <td className="p-0 border border-dashed border-[#999999]">
                    <input
                      type="text"
                      className="w-full h-full p-2 outline-none bg-transparent text-xs text-center"
                      value={row.mandays || ''}
                      onChange={(e) => handleCellChange(rIdx, 'mandays', e.target.value)}
                      disabled={isLocked}
                    />
                  </td>
                  <td className="p-0 border border-dashed border-[#999999]">
                    <input
                      type="text"
                      className="w-full h-full p-2 outline-none bg-transparent text-xs text-center"
                      value={row.startDate || ''}
                      onChange={(e) => handleCellChange(rIdx, 'startDate', e.target.value)}
                      disabled={isLocked}
                    />
                  </td>
                  <td className="p-0 border border-dashed border-[#999999]">
                    <input
                      type="text"
                      className="w-full h-full p-2 outline-none bg-transparent text-xs text-center"
                      value={row.endDate || ''}
                      onChange={(e) => handleCellChange(rIdx, 'endDate', e.target.value)}
                      disabled={isLocked}
                    />
                  </td>
                  <td className="p-0 border border-dashed border-[#999999]">
                    <input
                      type="text"
                      className="w-full h-full p-2 outline-none bg-transparent text-xs text-center"
                      value={row.days || ''}
                      onChange={(e) => handleCellChange(rIdx, 'days', e.target.value)}
                      disabled={isLocked}
                    />
                  </td>
                  {isFirst && (
                    <>
                      <td rowSpan={rowSpanCount} className="p-0 border border-dashed border-[#999999] align-middle text-center">
                        <input
                          type="text"
                          className="w-full h-full p-2 outline-none bg-transparent text-xs text-center"
                          value={row.avgManpowerPlusBuffer || ''}
                          onChange={(e) => handleCellChange(rIdx, 'avgManpowerPlusBuffer', e.target.value)}
                          disabled={isLocked}
                        />
                      </td>
                      <td rowSpan={rowSpanCount} className="p-0 border border-dashed border-[#999999] align-middle text-center">
                        <input
                          type="text"
                          className="w-full h-full p-2 outline-none bg-transparent text-xs text-center"
                          value={row.avgManpower || ''}
                          onChange={(e) => handleCellChange(rIdx, 'avgManpower', e.target.value)}
                          disabled={isLocked}
                        />
                      </td>
                      <td rowSpan={rowSpanCount} className="p-0 border border-dashed border-[#999999] align-middle text-center">
                        <input
                          type="text"
                          className="w-full h-full p-2 outline-none bg-transparent text-xs text-center"
                          value={row.peakManpower || ''}
                          onChange={(e) => handleCellChange(rIdx, 'peakManpower', e.target.value)}
                          disabled={isLocked}
                        />
                      </td>
                    </>
                  )}
                </tr>
              );
            })}
            
            {safeData.length > 0 && (
              <tr className="bg-yellow-300 font-bold border border-dashed border-[#999999]">
                <td colSpan={5} className="p-2 border border-dashed border-[#999999] text-center sticky left-0 bg-yellow-300 z-10 shadow-[inset_-1px_0_0_0_#999999]">
                  Total
                </td>
                <td className="p-2 border border-dashed border-[#999999] text-center">
                  {/* Calculation logic later */}
                </td>
                <td className="p-2 border border-dashed border-[#999999] text-center"></td>
                <td className="p-2 border border-dashed border-[#999999] text-center"></td>
                <td className="p-2 border border-dashed border-[#999999] text-center"></td>
                <td className="p-2 border border-dashed border-[#999999] text-center"></td>
                <td className="p-2 border border-dashed border-[#999999] text-center"></td>
                <td className="p-2 border border-dashed border-[#999999] text-center"></td>
              </tr>
            )}

            {visibleCount < safeData.length && (
              <tr>
                <td colSpan={12} className="p-3 text-center bg-slate-50/50">
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
      
      {validationModal && (
        <div className="fixed inset-0 bg-black/60 z-[9999] flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl flex flex-col overflow-hidden max-h-[90vh]">
            <div className="flex items-center justify-between p-4 border-b border-slate-200 bg-slate-50">
              <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <Info className="text-blue-600" size={20} />
                P6 Activity Mapping: {validationModal.title}
              </h2>
              <button
                onClick={() => setValidationModal(null)}
                className="text-slate-400 hover:text-slate-600 hover:bg-slate-200 p-1.5 rounded-full transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="p-4 overflow-auto custom-scrollbar flex-1 bg-white">
              <div className="mb-4 p-3 bg-blue-50 border border-blue-100 rounded-lg text-sm text-blue-800">
                This table shows the P6 activities that were evaluated for this row. 
              </div>
              
              <table className="w-full text-sm text-left border-collapse">
                <thead className="bg-slate-100 text-slate-700 text-xs uppercase font-semibold">
                  <tr>
                    <th className="px-4 py-3 border border-slate-200">P6 Activity Name</th>
                  </tr>
                </thead>
                <tbody>
                  {validationModal.activities.map((act, i) => (
                    <tr key={i} className="border border-slate-200 hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 border border-slate-200 text-slate-600 font-medium">
                        {act.origName}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            
            <div className="p-4 border-t border-slate-200 bg-slate-50 flex justify-end">
              <button
                onClick={() => setValidationModal(null)}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-sm font-semibold transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});
