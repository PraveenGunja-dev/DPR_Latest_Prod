import React, { memo, useCallback } from 'react';
import { Plus, Trash2, Save } from 'lucide-react';

interface BESSChargingScheduleTableProps {
  data: any[];
  setData: (data: any[]) => void;
  onSave?: (isAutoSave?: boolean) => void;
  isLocked?: boolean;
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
      'HT Cable Torquing & Marking', 'FO Cable Internal Ring', 'DC Cable laying', 'LT Cable laying',
      'DC Cable termination', 'DC Cable Torquing & Marking', 'LT Cable termination',
      'LT Cable Torquing & Marking', 'Aux Cable laying', 'Control Cable laying',
      'Communication Cable laying', 'Aux Cable Termination', 'Control Cable Termination',
      'Communication Cable Termination', 'CT SFRA & Tan delta Test', 'CT Routine Test',
      'CT Control scheme & Stability Test', 'HT Panel Routine (CT & PT, Breaker & Meter) Test',
      'HT Panel relay test', 'HT Cable VLF Test', 'CSS routine test', 'ACDB routine test',
      'Earthing - Earthing Strip', 'Earthing - Earth Pit', 'LA',
    ]
  },
];

export const BESSChargingScheduleTable = memo(({
  data,
  setData,
  onSave,
  isLocked = false,
}: BESSChargingScheduleTableProps) => {

  const safeData = Array.isArray(data) ? data : [];

  const handleCellChange = useCallback((rowIndex: number, field: string, value: string) => {
    const rows = Array.isArray(data) ? data : [];
    const updated = [...rows];
    const row = { ...updated[rowIndex], [field]: value };
    row._cellStatuses = { ...(updated[rowIndex]._cellStatuses || {}), [field]: 'edited' };
    updated[rowIndex] = row;
    setData(updated);
  }, [data, setData]);

  const handleAddRow = useCallback(() => {
    const newRows: any[] = [];
    BESS_CHARGING_SCHEDULE_ACTIVITIES.forEach(group => {
      newRows.push({
        isCategoryRow: true,
        activity: group.category,
      });
      group.activities.forEach((actName, idx) => {
        newRows.push({
          containerMake: '',
          blockNo: '',
          containersAtSite: '',
          mwh: '',
          idtChargingStart: '',
          trailRunEndDate: '',
          cod: '',
          sr: String(idx + 1),
          activity: actName,
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
      });
    });
    setData(newRows);
  }, [setData]);

  const handleRemoveRow = useCallback((idx: number) => {
    const updated = [...safeData];
    updated.splice(idx, 1);
    setData(updated);
  }, [safeData, setData]);

  const getDateInputClass = (val: any) => 
    `w-full h-full p-2 outline-none bg-transparent text-xs ${!val ? '[&::-webkit-datetime-edit]:text-transparent focus:[&::-webkit-datetime-edit]:text-inherit' : ''}`;

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

      <div className="flex-1 overflow-auto border-2 border-solid border-[#999999] rounded-md relative shadow-sm h-full w-full custom-scrollbar">
        <table className="w-full text-sm text-left border-collapse min-w-max relative z-0">
          <thead>
            <tr className="bg-[#c7ccd1] text-[11px] font-bold text-slate-800 border border-solid border-[#999999]">
              <th rowSpan={3} className="px-2 py-1.5 border border-solid border-[#999999] text-center sticky left-0 bg-[#c7ccd1] z-10 w-[80px] shadow-[inset_-1px_0_0_0_#999999]">Container Make</th>
              <th rowSpan={3} className="px-2 py-1.5 border border-solid border-[#999999] text-center w-[80px]">Block No</th>
              <th rowSpan={3} className="px-2 py-1.5 border border-solid border-[#999999] text-center w-[80px]">Containers at Site</th>
              <th rowSpan={3} className="px-2 py-1.5 border border-solid border-[#999999] text-center w-[80px]">MWh</th>
              <th rowSpan={3} className="px-2 py-1.5 border border-solid border-[#999999] text-center w-[100px]">IDT Charging /<br/>Commissioning Start</th>
              <th rowSpan={3} className="px-2 py-1.5 border border-solid border-[#999999] text-center w-[100px]">Trail-Run<br/>End Date</th>
              <th rowSpan={3} className="px-2 py-1.5 border border-solid border-[#999999] text-center w-[80px]">COD</th>
              <th colSpan={8} className="px-2 py-1.5 border border-solid border-[#999999] text-center border-b">Status</th>
              <th rowSpan={3} className="px-2 py-1.5 border border-solid border-[#999999] text-center w-[80px]">Productivity</th>
              <th rowSpan={3} className="px-2 py-1.5 border border-solid border-[#999999] text-center w-[80px]">Manpower</th>
              <th rowSpan={3} className="px-2 py-1.5 border border-solid border-[#999999] text-center w-[80px]">Total Mandays</th>
              <th rowSpan={3} className="px-2 py-1.5 border border-solid border-[#999999] text-center min-w-[150px]">Remarks</th>
              {!isLocked && <th rowSpan={3} className="px-2 py-1.5 text-center w-[40px] bg-slate-100 border border-solid border-[#999999]"></th>}
            </tr>
            <tr className="bg-[#c7ccd1] text-[11px] font-bold text-slate-800 border border-solid border-[#999999]">
              <th rowSpan={2} className="px-1 py-1 border border-solid border-[#999999] text-center w-[40px]">Sr</th>
              <th rowSpan={2} className="px-2 py-1 border border-solid border-[#999999] text-center w-[150px]">Activity</th>
              <th colSpan={3} className="px-1 py-1 border border-solid border-[#999999] text-center border-b">Progress</th>
              <th rowSpan={2} className="px-2 py-1 border border-solid border-[#999999] text-center w-[80px]">EDC</th>
              <th rowSpan={2} className="px-2 py-1 border border-solid border-[#999999] text-center w-[80px]">New EDC</th>
              <th rowSpan={2} className="px-2 py-1 border border-solid border-[#999999] text-center w-[100px]">vendor</th>
            </tr>
            <tr className="bg-[#c7ccd1] text-[11px] font-bold text-slate-800 border border-solid border-[#999999]">
              <th className="px-1 py-1 border border-solid border-[#999999] text-center w-[40px]">S</th>
              <th className="px-1 py-1 border border-solid border-[#999999] text-center w-[40px]">C</th>
              <th className="px-1 py-1 border border-solid border-[#999999] text-center w-[40px]">B</th>
            </tr>
          </thead>
          <tbody className="bg-white">
            {safeData.map((row, rIdx) => {
              if (row.isCategoryRow) {
                return (
                  <tr key={`cat-${rIdx}`} className="bg-[#e0f2e9]">
                    <td colSpan={19 + (isLocked ? 0 : 1)} className="border border-solid border-[#999999] px-3 py-2 font-bold text-[#065f46] text-sm">
                      {row.activity}
                    </td>
                  </tr>
                );
              }
              return (
                <tr key={rIdx} className="border border-dashed border-[#999999] hover:bg-slate-50 transition-colors">
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
                      type="date"
                      className={getDateInputClass(row.containersAtSite)}
                      value={row.containersAtSite || ''}
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
                      type="date"
                      className={getDateInputClass(row.idtChargingStart)}
                      value={row.idtChargingStart || ''}
                      onChange={(e) => handleCellChange(rIdx, 'idtChargingStart', e.target.value)}
                      disabled={isLocked}
                    />
                  </td>
                  <td className="p-0 border border-dashed border-[#999999]">
                    <input
                      type="date"
                      className={getDateInputClass(row.trailRunEndDate)}
                      value={row.trailRunEndDate || ''}
                      onChange={(e) => handleCellChange(rIdx, 'trailRunEndDate', e.target.value)}
                      disabled={isLocked}
                    />
                  </td>
                  <td className="p-0 border border-dashed border-[#999999]">
                    <input
                      type="date"
                      className={getDateInputClass(row.cod)}
                      value={row.cod || ''}
                      onChange={(e) => handleCellChange(rIdx, 'cod', e.target.value)}
                      disabled={isLocked}
                    />
                  </td>
                  <td className="p-0 border border-dashed border-[#999999] bg-slate-50/50">
                    <input
                      type="text"
                      className="w-full h-full p-2 outline-none bg-transparent text-xs text-center"
                      value={row.sr || ''}
                      onChange={(e) => handleCellChange(rIdx, 'sr', e.target.value)}
                      disabled={isLocked}
                    />
                  </td>
                  <td className="p-0 border border-dashed border-[#999999] bg-slate-50/50">
                    <div className="w-full h-full p-2 text-xs text-slate-800 font-medium overflow-hidden text-ellipsis whitespace-nowrap" title={row.activity || ''}>
                      {row.activity || ''}
                    </div>
                  </td>
                  <td className="p-0 border border-dashed border-[#999999] bg-slate-50/50">
                    <input
                      type="number"
                      className="w-full h-full p-2 outline-none bg-transparent text-xs text-right"
                      value={row.progressScope || ''}
                      onChange={(e) => handleCellChange(rIdx, 'progressScope', e.target.value)}
                      disabled={isLocked}
                    />
                  </td>
                  <td className="p-0 border border-dashed border-[#999999] bg-slate-50/50">
                    <input
                      type="number"
                      className="w-full h-full p-2 outline-none bg-transparent text-xs text-right"
                      value={row.progressCompleted || ''}
                      onChange={(e) => handleCellChange(rIdx, 'progressCompleted', e.target.value)}
                      disabled={isLocked}
                    />
                  </td>
                  <td className="p-0 border border-dashed border-[#999999] bg-slate-50/50">
                    <div className="w-full h-full p-2 text-xs text-right font-medium text-slate-600 bg-slate-50">
                      {Number(row.progressScope || 0) - Number(row.progressCompleted || 0)}
                    </div>
                  </td>
                  <td className="p-0 border border-dashed border-[#999999] bg-slate-50/50">
                    <input
                      type="text"
                      className="w-full h-full p-2 outline-none bg-transparent text-xs"
                      value={row.edc || ''}
                      onChange={(e) => handleCellChange(rIdx, 'edc', e.target.value)}
                      disabled={isLocked}
                    />
                  </td>
                  <td className="p-0 border border-dashed border-[#999999] bg-slate-50/50">
                    <input
                      type="text"
                      className="w-full h-full p-2 outline-none bg-transparent text-xs"
                      value={row.newEdc || ''}
                      onChange={(e) => handleCellChange(rIdx, 'newEdc', e.target.value)}
                      disabled={isLocked}
                    />
                  </td>
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
                      <button
                        onClick={() => handleRemoveRow(rIdx)}
                        className="text-slate-400 hover:text-red-500 transition-colors"
                        title="Remove row"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
            
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
