import React, { memo, useCallback, useState } from 'react';
import { Save } from 'lucide-react';
import { useProgressiveRows } from '@/hooks/useProgressiveRows';
import { useColumnResize } from '@/hooks/useColumnResize';
import { indianDateFormat, parseDateToIso } from '@/services/dprService';

interface BESSSCMTableProps {
  data: any[];
  setData: (data: any[]) => void;
  onSave?: (isAutoSave?: boolean) => void;
  isLocked?: boolean;
}

export const BESSSCMTable: React.FC<BESSSCMTableProps> = memo(({
  data,
  setData,
  onSave,
  isLocked = false,
}: BESSSCMTableProps) => {

  const safeData = Array.isArray(data) ? data : [];

  const { visibleCount, containerRef, handleScroll } = useProgressiveRows(safeData.length);

  // Column resize – same drag-handle pattern as other BESS tables.
  const { colWidths, handleResizeStart } = useColumnResize({
    activityId: 250,
    scmPlannedStartDate: 160,
    scmPlannedEndDate: 160,
    scmCutoffDate: 160,
  });

  const ResizeHandle = ({ col }: { col: string }) => (
    <div
      onMouseDown={(e) => handleResizeStart(e, col)}
      className="absolute right-0 top-0 bottom-0 w-[5px] cursor-col-resize z-[12] hover:bg-gray-400/50 transition-colors"
    />
  );

  // Track which cell is active so date columns can switch to native picker.
  const [activeCell, setActiveCell] = useState<{ row: number; field: string } | null>(null);

  const parseDateForPicker = (val: string | undefined): string => {
    if (!val) return '';
    return parseDateToIso(val) || '';
  };

  const getDateInputClass = (val: any) =>
    `w-full h-full p-2 outline-none bg-transparent text-xs ${!val ? 'text-transparent focus:text-black dark:focus:text-white [&::-webkit-datetime-edit]:text-transparent focus:[&::-webkit-datetime-edit]:text-black dark:text-white' : 'text-black dark:text-white [&::-webkit-datetime-edit]:text-black dark:text-white'}`;

  const handleCellChange = useCallback((rowIndex: number, field: string, value: string) => {
    const rows = Array.isArray(data) ? data : [];
    const updated = [...rows];

    const dateFields = ['scmPlannedStartDate', 'scmPlannedEndDate', 'scmCutoffDate'];
    let storedValue = value;
    if (dateFields.includes(field) && value) {
      storedValue = indianDateFormat(value) || value;
    }

    updated[rowIndex] = {
      ...updated[rowIndex],
      [field]: storedValue,
      _cellStatuses: { ...(updated[rowIndex]._cellStatuses || {}), [field]: 'edited' },
    };
    setData(updated);
  }, [data, setData]);

  const DateCell = ({
    rIdx,
    field,
    value,
    fromP6 = false,
    note,
  }: {
    rIdx: number;
    field: string;
    value: string | undefined;
    fromP6?: boolean;
    /** Which block this combined date was taken from, e.g. "Block 3". */
    note?: string;
  }) => {
    const active = !fromP6 && activeCell?.row === rIdx && activeCell?.field === field;
    return (
      <td className={`p-0 border border-dashed border-[#999999] dark:border-[#3A3A3A] ${fromP6 ? 'bg-slate-50/60 dark:bg-[#252525]' : ''}`}>
        <div className="flex items-center justify-center w-full h-full">
          <input
            type={active ? 'date' : 'text'}
            className={active ? getDateInputClass(value) : 'flex-1 min-w-0 h-full p-2 outline-none bg-transparent text-xs text-center'}
            value={active ? parseDateForPicker(value) : (value || '')}
            onFocus={() => !fromP6 && setActiveCell({ row: rIdx, field })}
            onBlur={() => setActiveCell(null)}
            onChange={(e) => handleCellChange(rIdx, field, e.target.value)}
            readOnly={fromP6}
            title={fromP6 ? (note ? `From P6 - taken from ${note}` : 'From P6') : undefined}
            disabled={isLocked}
          />
          {note && value && (
            <span className="shrink-0 pr-2 text-[10px] font-semibold text-slate-500 dark:text-slate-400 whitespace-nowrap">{note}</span>
          )}
        </div>
      </td>
    );
  };

  return (
    <div className="space-y-2 w-full h-full flex-1 min-h-0 flex flex-col">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-2">
        <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wide">SCM</h3>
        <div className="flex items-center gap-2">
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
      </div>

      {/* Table */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-auto border-2 border-solid border-[#999999] dark:border-[#3A3A3A] rounded-md relative shadow-sm h-full w-full custom-scrollbar"
      >
        <table className="w-full text-sm text-left border-separate border-spacing-0 min-w-max relative z-0">
          <thead className="sticky top-0 z-20 bg-[#c7ccd1] dark:bg-[#2B2B2B] bg-clip-padding">
            <tr className="bg-[#c7ccd1] dark:bg-[#2B2B2B] text-[11px] font-bold text-slate-800 dark:text-[#E8E8E8] border border-solid border-[#999999] dark:border-[#3A3A3A]">
              <th
                className="px-2 py-1.5 border border-solid border-[#999999] dark:border-[#3A3A3A] text-center sticky left-0 bg-[#c7ccd1] dark:bg-[#2B2B2B] z-30 shadow-[inset_-1px_0_0_0_#999999] dark:shadow-[inset_-1px_0_0_0_#3A3A3A] relative bg-clip-padding"
                style={{ width: colWidths.activityId, minWidth: colWidths.activityId }}
              >
                Activity Name
                <ResizeHandle col="activityId" />
              </th>
              <th
                className="px-2 py-1.5 border border-solid border-[#999999] dark:border-[#3A3A3A] text-center relative bg-[#c7ccd1] dark:bg-[#2B2B2B] bg-clip-padding z-20"
                style={{ width: colWidths.scmPlannedStartDate, minWidth: colWidths.scmPlannedStartDate }}
              >
                SCM Planned Start date
                <ResizeHandle col="scmPlannedStartDate" />
              </th>
              <th
                className="px-2 py-1.5 border border-solid border-[#999999] dark:border-[#3A3A3A] text-center relative bg-[#c7ccd1] dark:bg-[#2B2B2B] bg-clip-padding z-20"
                style={{ width: colWidths.scmPlannedEndDate, minWidth: colWidths.scmPlannedEndDate }}
              >
                SCM Planned end date
                <ResizeHandle col="scmPlannedEndDate" />
              </th>
              <th
                className="px-2 py-1.5 border border-solid border-[#999999] dark:border-[#3A3A3A] text-center relative bg-[#c7ccd1] dark:bg-[#2B2B2B] bg-clip-padding z-20"
                style={{ width: colWidths.scmCutoffDate, minWidth: colWidths.scmCutoffDate }}
              >
                SCM Cutoff Date
                <ResizeHandle col="scmCutoffDate" />
              </th>
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-[#1E1E1E]">
            {safeData.slice(0, visibleCount).map((row, rIdx) => row.isCategoryRow ? (
              <tr key={rIdx} className="bg-[#e0f2e9] dark:bg-[#113322]">
                <td
                  colSpan={4}
                  className="border border-solid border-[#999999] dark:border-[#3A3A3A] px-3 py-2 font-bold text-[#065f46] dark:text-[#A7F3D0] text-sm"
                >
                  {row.activityId}
                </td>
              </tr>
            ) : (
              <tr
                key={rIdx}
                className="border border-dashed border-[#999999] dark:border-[#3A3A3A] transition-colors hover:bg-slate-50 dark:hover:bg-[#2E3238]"
              >
                {/* Activity ID – sticky left */}
                <td className="p-0 border border-dashed border-[#999999] dark:border-[#3A3A3A] sticky left-0 bg-white dark:bg-[#1E1E1E] z-10 shadow-[inset_-1px_0_0_0_#999999] dark:shadow-[inset_-1px_0_0_0_#3A3A3A]">
                  <input
                    type="text"
                    className="w-full h-full p-2 outline-none bg-transparent text-xs text-center"
                    value={row.activityId || ''}
                    onChange={(e) => handleCellChange(rIdx, 'activityId', e.target.value)}
                    readOnly={!!row.isP6}
                    title={row.isP6 ? 'From P6 (Procurement - Ordering & Delivery)' : undefined}
                    disabled={isLocked}
                  />
                </td>

                {/* SCM Planned Start date */}
                <DateCell rIdx={rIdx} field="scmPlannedStartDate" value={row.scmPlannedStartDate} fromP6={!!row.isP6} note={row.section === 'construction' ? row.scmStartBlock : undefined} />

                {/* SCM Planned End date */}
                <DateCell rIdx={rIdx} field="scmPlannedEndDate" value={row.scmPlannedEndDate} fromP6={!!row.isP6} note={row.section === 'construction' ? row.scmEndBlock : undefined} />

                {/* SCM Cutoff Date */}
                <DateCell rIdx={rIdx} field="scmCutoffDate" value={row.scmCutoffDate} />
              </tr>
            ))}

            {safeData.length === 0 && (
              <tr>
                <td
                  colSpan={4}
                  className="py-8 text-center text-xs text-slate-400 dark:text-slate-500 italic"
                >
                  No procurement or construction activities found in P6 for this project.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
});

BESSSCMTable.displayName = 'BESSSCMTable';
