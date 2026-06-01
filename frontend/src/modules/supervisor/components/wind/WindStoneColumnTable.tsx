import React, { useMemo, useCallback } from 'react';
import { StyledExcelTable } from "@/components/StyledExcelTable";
import { Plus, Upload } from 'lucide-react';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { indianDateFormat } from "@/services/dprService";

const VerticalText = ({ text }: { text: string }) => (
  <div 
    className="flex items-center justify-center text-[11px] font-bold uppercase tracking-wider"
    style={{ writingMode: "vertical-rl", transform: "rotate(180deg)", maxHeight: "90px" }}
  >
    {text}
  </div>
);

export interface WindStoneColumnData {
  sNo?: string;
  activityId?: string;
  description: string;
  locations?: string;
  vendor?: string;
  pss?: string;
  drawingStatus?: string;
  rig?: string;
  length?: string;
  columnInScope?: string;
  plan?: string;
  achieved?: string;
  balance?: string;
  startDate?: string;
  finishDate?: string;
  [key: string]: any;
}

interface WindStoneColumnTableProps {
  data: WindStoneColumnData[];
  setData: (data: WindStoneColumnData[]) => void;
  onSave?: () => void;
  onSubmit?: () => void;
  isLocked?: boolean;
  status?: string;
  projectId?: number;
  targetDate?: string;
  customActivities?: any[];
  onAddCustomActivity?: (activity: any) => void;
  onEditCustomActivity?: (activity: any) => void;
  onDeleteCustomActivity?: (id: number) => void;
  onBulkUploadActivities?: () => void;
}

export const WindStoneColumnTable: React.FC<WindStoneColumnTableProps> = ({
  data,
  setData,
  onSave,
  onSubmit,
  isLocked = false,
  status = 'draft',
  projectId,
  targetDate,
  customActivities = [],
  onAddCustomActivity,
  onEditCustomActivity,
  onDeleteCustomActivity,
  onBulkUploadActivities,
}) => {
  const { user } = useAuth();
  const userRole = (user?.role || user?.Role || '').toLowerCase();
  const isPmagOrAdmin = userRole.includes('pmag') || userRole.includes('admin');

  // Generate 7 days before and 7 days after targetDate
  const dateColumns = useMemo(() => {
    const baseDate = targetDate ? new Date(targetDate) : new Date();
    const dates = [];
    const daysBefore = 1;
    const daysAfter = 1;
    
    for (let i = -daysBefore; i <= daysAfter; i++) {
      const d = new Date(baseDate);
      d.setDate(baseDate.getDate() + i);
      const isoStr = d.toISOString().split('T')[0]; // YYYY-MM-DD
      
      const day = d.getDate();
      const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      const monthStr = monthNames[d.getMonth()];
      const yearStr = d.getFullYear().toString().slice(-2);
      const label = `${day}-${monthStr}-${yearStr}`;
      
      dates.push({
        iso: isoStr,
        label: label
      });
    }
    return dates;
  }, [targetDate]);

  const filteredData = useMemo(() => {
    // We combine the base WTG rows with custom activities overlay
    const baseRows = Array.isArray(data) ? [...data] : [];
    const customRows = Array.isArray(customActivities) ? customActivities : [];

    const matchedCustomIds = new Set<number>();

    const mergedRows = baseRows.map(baseRow => {
      const allMatches = customRows.filter(c => 
        String(c.activityId) === String(baseRow.activityId) || 
        String(c.block) === String(baseRow.locations)
      );

      allMatches.forEach(c => matchedCustomIds.add(c.id));

      if (allMatches.length > 0) {
        const customMatch = allMatches.sort((a, b) => b.id - a.id)[0];
        return {
          ...baseRow,
          _customId: customMatch.id,
          vendor: customMatch.extraData?.vendor || baseRow.vendor || '',
          pss: customMatch.extraData?.pss || baseRow.pss || '',
          drawingStatus: customMatch.extraData?.drawingStatus || baseRow.drawingStatus || '',
          rig: customMatch.extraData?.rig || baseRow.rig || '',
          length: customMatch.extraData?.length || baseRow.length || '',
          columnInScope: customMatch.extraData?.columnInScope || baseRow.columnInScope || '',
          plan: (customMatch.scope !== undefined && customMatch.scope !== null) ? String(customMatch.scope) : (baseRow.plan || ''),
          achieved: (customMatch.cumulative !== undefined && customMatch.cumulative !== null) ? String(customMatch.cumulative) : (baseRow.achieved || ''),
          balance: customMatch.extraData?.balance || baseRow.balance || '',
          startDate: customMatch.plannedStart || baseRow.startDate || '',
          finishDate: customMatch.plannedFinish || baseRow.finishDate || '',
          dailyProgress: (customMatch.extraData?.dailyProgress && Object.keys(customMatch.extraData.dailyProgress).length > 0) ? customMatch.extraData.dailyProgress : (baseRow.dailyProgress || {})
        };
      }
      return baseRow;
    });

    const rawUnmatched = customRows.filter(c => !matchedCustomIds.has(c.id));
    
    const uniqueUnmatched = Object.values(
      rawUnmatched.reduce((acc: Record<string, any>, c: any) => {
        // Group strictly by Location/WTG as requested, so multiple uploads for the same WTG collapse together
        const key = String(c.block || c.id).toLowerCase();
        if (!acc[key] || acc[key].id < c.id) {
          acc[key] = c;
        }
        return acc;
      }, {})
    );

    const unmatchedRows = uniqueUnmatched.map((c: any, i) => ({
      sNo: String(mergedRows.length + i + 1),
      activityId: c.activityId || '',
      description: c.description || c.block || '',
      locations: c.block || '',
      _customId: c.id,
      vendor: c.extraData?.vendor || '',
      pss: c.extraData?.pss || '',
      drawingStatus: c.extraData?.drawingStatus || '',
      rig: c.extraData?.rig || '',
      length: c.extraData?.length || '',
      columnInScope: c.extraData?.columnInScope || '',
      plan: c.scope ? String(c.scope) : '',
      achieved: c.cumulative ? String(c.cumulative) : '',
      balance: c.extraData?.balance || '',
      startDate: c.plannedStart || '',
      finishDate: c.plannedFinish || '',
      dailyProgress: c.extraData?.dailyProgress || {}
    }));

    return [...mergedRows, ...unmatchedRows];
  }, [data, customActivities]);

  const columns = useMemo(() => {
    const cols = [
      "SR. NO.",
      "Location no",
      "Vendor",
      "PSS",
      "Drawing Status",
      "RIG",
      "Length",
      "Number of column in scope",
      "Plan",
      "Achieved",
      "Balance",
      "Start Date",
      "Finish Date"
    ];
    dateColumns.forEach(d => {
      cols.push(`${d.iso}_P`); // Internal key for Plan
      cols.push(`${d.iso}_A`); // Internal key for Actual
    });
    return cols;
  }, [dateColumns]);

  const columnWidths = useMemo(() => {
    const widths: Record<string, number> = {
      "SR. NO.": 80,
      "Location no": 160,
      "Vendor": 160,
      "PSS": 120,
      "Drawing Status": 160,
      "RIG": 120,
      "Length": 120,
      "Number of column in scope": 180,
      "Plan": 90,
      "Achieved": 90,
      "Balance": 90,
      "Start Date": 120,
      "Finish Date": 120
    };
    dateColumns.forEach(d => {
      widths[`${d.iso}_P`] = 40;
      widths[`${d.iso}_A`] = 40;
    });
    return widths;
  }, [dateColumns]);

  const columnTypes = useMemo(() => {
    const types: Record<string, string> = {
      "SR. NO.": "text",
      "Location no": "text",
      "Vendor": "text",
      "PSS": "text",
      "Drawing Status": "text",
      "RIG": "text",
      "Length": "number",
      "Number of column in scope": "number",
      "Plan": "number",
      "Achieved": "number",
      "Balance": "number",
      "Start Date": "date",
      "Finish Date": "date"
    };
    dateColumns.forEach(d => {
      types[`${d.iso}_P`] = "number";
      types[`${d.iso}_A`] = "number";
    });
    return types;
  }, [dateColumns]);

  const editableColumns = useMemo(() => {
    const editables = [
      "Vendor",
      "PSS",
      "Drawing Status",
      "RIG",
      "Length",
      "Number of column in scope",
      "Plan",
      "Achieved",
      "Balance",
      "Start Date",
      "Finish Date"
    ];
    dateColumns.forEach(d => {
      editables.push(`${d.iso}_P`);
      editables.push(`${d.iso}_A`);
    });
    return editables;
  }, [dateColumns]);

  const headerStructure = useMemo(() => {
    const row1: any[] = [
      { label: "SR NO", rowSpan: 2, colSpan: 1 },
      { label: "LOCATION NO", rowSpan: 2, colSpan: 1 },
      { label: "VENDOR", rowSpan: 2, colSpan: 1 },
      { label: "PSS", rowSpan: 2, colSpan: 1 },
      { label: "DRAWING STATUS", rowSpan: 2, colSpan: 1 },
      { label: "RIG", rowSpan: 2, colSpan: 1 },
      { label: "LENGTH", rowSpan: 2, colSpan: 1 },
      { label: "NUMBER OF COLUMN IN SCOPE", rowSpan: 2, colSpan: 1 },
      { label: "PLAN", rowSpan: 2, colSpan: 1 },
      { label: "ACHIEVED", rowSpan: 2, colSpan: 1 },
      { label: "BALANCE", rowSpan: 2, colSpan: 1 },
      { label: "START DATE", rowSpan: 2, colSpan: 1 },
      { label: "FINISH DATE", rowSpan: 2, colSpan: 1 }
    ];

    dateColumns.forEach(d => {
      row1.push({ label: <span className="text-[10px] uppercase font-bold">{d.label}</span>, rowSpan: 1, colSpan: 2 });
    });

    const row2: any[] = [];

    dateColumns.forEach(d => {
      row2.push({ label: <span className="font-bold">P</span>, rowSpan: 1, colSpan: 1 });
      row2.push({ label: <span className="font-bold">A</span>, rowSpan: 1, colSpan: 1 });
    });

    return [row1, row2];
  }, [dateColumns]);

  const tableData = useMemo(() => {
    return filteredData.map((row, index) => {
      const arr: any = [
        row.sNo || String(index + 1),
        row.description || '', // Location no
        row.vendor || '',
        row.pss || '',
        row.drawingStatus || '',
        row.rig || '',
        row.length || '',
        row.columnInScope || '',
        row.plan || '',
        row.achieved || '',
        row.balance || '',
        row.startDate ? (indianDateFormat(row.startDate) || row.startDate) : '',
        row.finishDate ? (indianDateFormat(row.finishDate) || row.finishDate) : ''
      ];

      const dp = row.dailyProgress || {};
      dateColumns.forEach(d => {
        const dayData = dp[d.iso] || {};
        arr.push(dayData.P || '');
        arr.push(dayData.A || '');
      });

      arr._originalRow = row;
      arr._customId = row._customId;
      return arr;
    });
  }, [filteredData, dateColumns]);

  const handleDataChange = useCallback((newData: any[][]) => {
    // Find which row actually changed by comparing with current tableData
    let changedRowIndex = -1;
    for (let i = 0; i < newData.length; i++) {
      const oldRow = tableData[i];
      const newRow = newData[i];
      if (!oldRow || !newRow) continue;
      for (let j = 0; j < newRow.length; j++) {
        if (String(newRow[j] || '') !== String(oldRow[j] || '')) {
          changedRowIndex = i;
          break;
        }
      }
      if (changedRowIndex >= 0) break;
    }

    if (changedRowIndex < 0) return; // Nothing changed

    const row = newData[changedRowIndex];
    const original = (filteredData as any[])[changedRowIndex];
    if (!original || !row) return;

    const newVendor = row[2] || '';
    const newPss = row[3] || '';
    const newDrawing = row[4] || '';
    const newRig = row[5] || '';
    const newLength = row[6] || '';
    const newScope = row[7] || '';
    const newPlan = row[8] || '';
    const newAchieved = row[9] || '';
    const newBalance = row[10] || '';
    const newStart = row[11] || '';
    const newFinish = row[12] || '';

    const dailyProgress: Record<string, any> = { ...(original.dailyProgress || {}) };
    
    let colIdx = 13;
    dateColumns.forEach(d => {
      const pVal = row[colIdx++];
      const aVal = row[colIdx++];
      if (pVal || aVal) {
        dailyProgress[d.iso] = { P: pVal, A: aVal };
      } else {
        delete dailyProgress[d.iso];
      }
    });

    if (original._customId && onEditCustomActivity) {
      onEditCustomActivity({
        id: original._customId,
        sheetType: 'wind_stone_column',
        description: original.description || '',
        block: original.locations || '',
        scope: Number(newPlan) || 0,
        cumulative: Number(newAchieved) || 0,
        plannedStart: newStart !== (indianDateFormat(original.startDate) || original.startDate) ? newStart : original.startDate,
        plannedFinish: newFinish !== (indianDateFormat(original.finishDate) || original.finishDate) ? newFinish : original.finishDate,
        extraData: {
          columnInScope: newScope,
          vendor: newVendor,
          pss: newPss,
          drawingStatus: newDrawing,
          rig: newRig,
          length: newLength,
          plan: newPlan,
          balance: newBalance,
          dailyProgress
        }
      });
    } else if (!original._customId && onAddCustomActivity) {
      onAddCustomActivity({
        sheetType: 'wind_stone_column',
        description: original.description || '',
        block: original.locations || '',
        scope: Number(newPlan) || 0,
        cumulative: Number(newAchieved) || 0,
        plannedStart: newStart,
        plannedFinish: newFinish,
        extraData: {
          columnInScope: newScope,
          vendor: newVendor,
          pss: newPss,
          drawingStatus: newDrawing,
          rig: newRig,
          length: newLength,
          plan: newPlan,
          balance: newBalance,
          dailyProgress
        }
      });
    }

    // Only update the single changed row in state
    const updatedData = [...(data as any[])];
    updatedData[changedRowIndex] = {
      ...original,
      vendor: newVendor,
      pss: newPss,
      drawingStatus: newDrawing,
      rig: newRig,
      length: newLength,
      columnInScope: newScope,
      plan: newPlan,
      achieved: newAchieved,
      balance: newBalance,
      startDate: newStart,
      finishDate: newFinish,
      dailyProgress,
      _cellStatuses: row._cellStatuses
    };

    setData(updatedData);
  }, [filteredData, tableData, data, setData, onEditCustomActivity, onAddCustomActivity, dateColumns]);

  return (
    <div className="space-y-4 w-full flex-1 min-h-0 flex flex-col">
      {!isLocked && onBulkUploadActivities && (
        <div className="flex justify-end px-2 gap-2">
          <button
            onClick={onBulkUploadActivities}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors shadow-sm"
          >
            <Upload className="w-4 h-4" />
            Upload Activities
          </button>
        </div>
      )}

      <StyledExcelTable
        title="Wind Project - Stone Column Progress Sheet"
        columns={columns}
        data={tableData}
        columnWidths={columnWidths}
        columnTypes={columnTypes}
        editableColumns={isLocked ? [] : editableColumns}
        onDataChange={handleDataChange}
        hasChanges={status === 'draft'}
        onSave={isLocked ? undefined : onSave}
        onSubmit={isLocked ? undefined : onSubmit}
        isReadOnly={isLocked}
        headerStructure={headerStructure}
        disableAutoHeaderColors={true}
        sheetType="wind_stone_column"
        projectId={projectId}
      />
    </div>
  );
};
