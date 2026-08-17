import React, { useMemo, useCallback, memo } from 'react';
import { indianDateFormat } from "@/services/dprService";
import { Plus, Trash2, Save } from 'lucide-react';
import { useProgressiveRows } from '@/hooks/useProgressiveRows';
import { useColumnResize } from '@/hooks/useColumnResize';

interface BESSProductivityTableProps {
  data: any[];
  setData: (data: any[]) => void;
  onSave?: (isAutoSave?: boolean) => void;
  isLocked?: boolean;
  status?: string;
  projectId?: number;
  today?: string;
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

export const BESSProductivityTable = memo(({
  data,
  setData,
  onSave,
  isLocked = false,
  status = 'draft',
  projectId,
  today,
}: BESSProductivityTableProps) => {

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
      containerMake: 140, blockNo: 100, sr: 50, activity: 280,
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

  const colCount = 4 + HISTORY_COLS + (isLocked ? 0 : 1);

  return (
    <div className="space-y-2 w-full h-full flex-1 min-h-0 flex flex-col">
      <div className="flex items-center justify-between px-2">
        <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide">BESS - Productivity</h3>
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
              {historyDates.map(d => (
                <th key={d.iso} className="border border-solid border-[#999999] px-1 py-2 text-center font-bold text-slate-800 relative" style={{ width: colWidths[d.iso], minWidth: colWidths[d.iso] }}>{d.label}<ResizeHandle col={d.iso} /></th>
              ))}
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
              safeData.slice(0, visibleCount).map((row, rowIndex) => {
                if (row.isCategoryRow) {
                  return (
                    <tr key={`cat-${rowIndex}`} className="bg-[#e0f2e9]">
                      <td colSpan={colCount} className="border border-solid border-[#999999] px-3 py-2 font-bold text-[#065f46] text-sm">
                        {row.activity}
                      </td>
                    </tr>
                  );
                }

                return (
                  <tr key={`row-${rowIndex}`} className="hover:bg-blue-50/30 transition-colors">
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
                    {historyDates.map(d => (
                      <td key={d.iso} className="border border-dashed border-[#999999] px-1 py-0.5">
                        <input
                          type="number"
                          value={row.dailyValues?.[d.iso] ?? ''}
                          onChange={(e) => handleDailyChange(rowIndex, d.iso, e.target.value)}
                          disabled={isLocked}
                          className="w-full bg-transparent border-none outline-none text-xs px-1 py-1 text-center disabled:text-slate-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        />
                      </td>
                    ))}
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
              })
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

