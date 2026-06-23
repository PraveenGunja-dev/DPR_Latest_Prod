import React, { useEffect, useMemo, useCallback } from "react";
import { StyledExcelTable } from "@/components/StyledExcelTable";
import { indianDateFormat, getTodayAndYesterday } from "@/services/dprService";
import { EntryStatus } from "@/types";
import { Plus, Upload } from "lucide-react";
import { useAuth } from '@/modules/auth/contexts/AuthContext';

export interface ManpowerDetailsData {
  activityId: string;
  description: string;
  block: string;
  budgetedUnits: string; // Now in Days
  actualUnits: string;   // Now in Days
  remainingUnits: string; // Now in Days
  hoursPerDay?: number;
  percentComplete?: string;
  yesterdayValue: string; // In Days/Headcount
  todayValue: string;     // In Days/Headcount
  yesterdayIsApproved?: boolean;
  isCategoryRow?: boolean;
  category?: string;
  newBlockNom?: string;
  [key: string]: any;
}

interface ManpowerDetailsTableProps {
  data: ManpowerDetailsData[];
  setData: (data: ManpowerDetailsData[]) => void;
  totalManpower: number;
  setTotalManpower: (value: number) => void;
  onSave?: () => void;
  onSubmit?: () => void;
  yesterday: string;
  today: string;
  isLocked?: boolean;
  status?: EntryStatus;
  onExportAll?: () => void;
  totalRows?: number;
  onFullscreenToggle?: (isFullscreen: boolean) => void;
  onReachEnd?: () => void;
  universalFilter?: string;
  projectId?: number;
  selectedBlock?: string;
  onPush?: () => void;

  customActivities?: any[];
  onAddCustomActivity?: (activity: any) => void;
  onEditCustomActivity?: (activity: any) => void;
  onDeleteCustomActivity?: (id: number) => void;
  onBulkUploadActivities?: () => void;
}

export function ManpowerDetailsTable({
  data,
  setData,
  totalManpower,
  setTotalManpower,
  onSave,
  onSubmit,
  onPush,
  yesterday,
  today,
  isLocked = false,
  status = 'draft',
  onExportAll,
  totalRows,
  onFullscreenToggle,
  onReachEnd,
  universalFilter,
  projectId,
  selectedBlock = "ALL",
  customActivities = [],
  onAddCustomActivity,
  onEditCustomActivity,
  onDeleteCustomActivity,
  onBulkUploadActivities
}: ManpowerDetailsTableProps) {
  
  const { user } = useAuth();
  const userRole = (user?.role || user?.Role || '').toLowerCase();
  const isPmagOrAdmin = userRole.includes('pmag') || userRole.includes('admin');

  const { yesterday: previousDateISO } = getTodayAndYesterday();
  const previousDate = indianDateFormat(previousDateISO);

  // 13-column structure
  const columns = [
    "Activity ID",
    "Description",
    "Block",
    "Hours/Day",
    "Required",
    "Available",
    "Gap",
    "% Completion",
    "Actual Start",
    "Actual Finish",
    "Forecast Start",
    "Forecast Finish",
    indianDateFormat(yesterday),
    indianDateFormat(today)
  ];

  // Filter data based on selected block and universal filter
  const filteredData = useMemo(() => {
    if (!Array.isArray(data)) return [];
    const safeCustom = Array.isArray(customActivities) ? customActivities : [];

    const validRows = data.map(d => {
      if (d.isCategoryRow) return true;

      const matchBlock = selectedBlock === "ALL" || d.block === selectedBlock || d.newBlockNom === selectedBlock;

      const filterText = (universalFilter || "").trim().toUpperCase();
      const matchActivity = !filterText || filterText === "ALL" ||
        (d.activityId && String(d.activityId).toUpperCase().includes(filterText));

      return matchBlock && matchActivity;
    });

    const finalResult = [];
    for (let i = 0; i < data.length; i++) {
      if (data[i].isCategoryRow) {
        let validChildCount = 0;
        let j = i + 1;
        while (j < data.length && !data[j].isCategoryRow) {
          if (validRows[j]) validChildCount++;
          j++;
        }
        if (validChildCount >= 2) {
          finalResult.push(data[i]);
        }
      } else if (validRows[i]) {
        finalResult.push(data[i]);
      }
    }

    const filterText = (universalFilter || "").trim().toUpperCase();
    const customResult = safeCustom.filter(c => {
      const matchBlock = selectedBlock === "ALL" || c.block === selectedBlock;
      const matchActivity = !filterText || filterText === "ALL" || 
                           (c.description && String(c.description).toUpperCase().includes(filterText));
      return matchBlock && matchActivity;
    });

    if (customResult.length > 0) {
      finalResult.push({
        isCategoryRow: true,
        description: "📝 DPR Level Activities"
      } as any);

      customResult.forEach(c => {
        const budgeted = c.scope || 0;
        const actual = c.cumulative || 0;
        const remaining = Math.max(0, budgeted - actual);
        const pct = budgeted > 0 ? ((actual / budgeted) * 100).toFixed(2) + '%' : '0.00%';

        finalResult.push({
          ...c,
          isCustom: true,
          _isCustomRow: true,
          _customId: c.id,
          activityId: '',
          description: c.description || '',
          newBlockNom: c.block || '',
          block: c.block || '',
          hoursPerDay: c.extraData?.hoursPerDay || 8.0,
          budgetedUnits: String(budgeted),
          actualUnits: String(actual),
          remainingUnits: String(remaining),
          percentComplete: pct,
          actualStart: c.actualStart || '',
          actualFinish: c.actualFinish || '',
          yesterdayValue: c.extraData?.yesterdayValue || '0',
          todayValue: c.extraData?.todayValue || '0'
        } as any);
      });
    }

    return finalResult;
  }, [data, customActivities, selectedBlock, universalFilter]);

  // Convert objects to arrays — Vendor IDT display structure
  const tableData = useMemo(() => {
    const parsedYesterdayStr = yesterday ? String(yesterday).split('T')[0] : '';
    const referenceDateStr = parsedYesterdayStr;

    const formatDt = (dt: any) => {
      if (!dt) return '';
      const dtStr = String(dt).split('T')[0];
      return indianDateFormat(dtStr) || dtStr;
    };

    const getDates = (r: any) => {
      const s = r.actualStart;
      const f = r.actualFinish;
      let actS = '', fcstS = '', actF = '', fcstF = '';

      if (s) {
        const sStr = String(s).split('T')[0];
        if (referenceDateStr && sStr <= referenceDateStr) {
          actS = indianDateFormat(sStr) || sStr;
          fcstS = ''; 
        } else {
          fcstS = indianDateFormat(sStr) || sStr;
        }
      } else if (r.forecastStart) {
        const dStr = String(r.forecastStart).split('T')[0];
        fcstS = indianDateFormat(dStr) || dStr;
      }

      if (f) {
        const fStr = String(f).split('T')[0];
        if (referenceDateStr && fStr <= referenceDateStr) {
          actF = indianDateFormat(fStr) || fStr;
          fcstF = '';
        } else {
          fcstF = indianDateFormat(fStr) || fStr;
        }
      } else if (r.forecastFinish) {
        const dStr = String(r.forecastFinish).split('T')[0];
        fcstF = indianDateFormat(dStr) || dStr;
      }

      return { actS, fcstS, actF, fcstF };
    };

    return (Array.isArray(filteredData) ? filteredData : []).map(row => {
      const d = getDates(row);
      let arr: any;
      if (row.isCategoryRow) {
        arr = [
          '',
          row.description || '',
          '',
          '', 
          row.budgetedUnits !== undefined && row.budgetedUnits !== null ? String(row.budgetedUnits) : "0",
          row.actualUnits !== undefined && row.actualUnits !== null ? String(row.actualUnits) : "0",
          row.remainingUnits !== undefined && row.remainingUnits !== null ? String(row.remainingUnits) : "0",
          row.percentComplete || "0.00%",
          "",
          "",
          "",
          "",
          row.yesterdayValue || "0",
          row.todayValue || "0"
        ];
        arr.isCategoryRow = true;
      } else {
        arr = [
          row.activityId || '',
          row.description || (row as any).activities || (row as any).activity || (row as any).activity_name || (row as any).name || (row as any).Name || '',
          row.block || '',
          row.hoursPerDay || '8.0',
          row.budgetedUnits !== undefined && row.budgetedUnits !== null ? String(row.budgetedUnits) : "0",
          row.actualUnits !== undefined && row.actualUnits !== null ? String(row.actualUnits) : "0",
          row.remainingUnits !== undefined && row.remainingUnits !== null ? String(row.remainingUnits) : "0",
          row.percentComplete || "0.00%",
          d.actS,
          d.actF,
          d.fcstS,
          d.fcstF,
          row.yesterdayValue || "0",
          row.todayValue || "0"
        ];
      }
      if ((row as any)._cellStatuses) {
        arr._cellStatuses = (row as any)._cellStatuses;
      }
      if ((row as any)._isCustomRow) {
        arr._isCustomRow = true;
        arr._customId = (row as any)._customId;
      }
      return arr;
    });
  }, [filteredData, yesterday]);

  const rowStyles = useMemo(() => {
    const styles: Record<number, any> = {};
    filteredData.forEach((row, index) => {
      if (row.isCategoryRow) {
        styles[index] = {
          backgroundColor: '#FADFAD',
          color: '#333333',
          fontWeight: 'bold',
          isCategoryRow: true
        };
      } else if ((row as any)._isCustomRow) {
        styles[index] = {
          backgroundColor: "#FFFBEB",
        };
      }
    });
    return styles;
  }, [filteredData]);

  const cellTextColors = useMemo(() => {
    const colors: Record<number, Record<string, string>> = {};
    filteredData.forEach((row, rowIndex) => {
      if (row.yesterdayIsApproved === false) {
        colors[rowIndex] = { [indianDateFormat(yesterday)]: "#ce440d" };
      } else if (row.yesterdayIsApproved === true) {
        colors[rowIndex] = { [indianDateFormat(yesterday)]: "#16a34a" };
      }
    });
    return colors;
  }, [filteredData, yesterday]);

  const handleInlineAdd = useCallback(() => {
    if (onAddCustomActivity) {
      onAddCustomActivity({
        sheetType: 'manpower_details',
        description: 'New DPR Activity',
        uom: 'Days',
        scope: 0,
        block: selectedBlock !== 'ALL' ? selectedBlock : '',
      });
    }
  }, [onAddCustomActivity, selectedBlock]);

  // Handle data changes
  const handleDataChange = useCallback((newData: any[][]) => {
    const p6RowChanges: any[] = [];
    const customRowChanges: any[] = [];

    const updatedRows = newData.map((row, index) => {
      const originalRow = filteredData[index];

      if (!originalRow || originalRow?.isCategoryRow) {
        return { ...originalRow };
      }

      const newYesterdayStr = String(row[12] || '0').trim();
      const newTodayStr = String(row[13] || '0').trim();
      const newYesterday = Number(newYesterdayStr) || 0;
      const newToday = Number(newTodayStr) || 0;

      const oldYesterdayStr = String(originalRow.yesterdayValue || '0').trim();
      const oldTodayStr = String(originalRow.todayValue || '0').trim();
      const oldYesterday = Number(oldYesterdayStr) || 0;
      const oldToday = Number(oldTodayStr) || 0;

      const currentBudgeted = Number(row[4]) || 0;
      let calculatedActual = Number(row[5]) || 0;

      if (newTodayStr !== oldTodayStr || newYesterdayStr !== oldYesterdayStr) {
        calculatedActual += (newToday - oldToday) + (newYesterday - oldYesterday);
      }

      const calculatedBalance = currentBudgeted - calculatedActual;
      const pct = currentBudgeted > 0 ? ((calculatedActual / currentBudgeted) * 100).toFixed(2) + '%' : '0.00%';

      const updatedRow: any = {
        ...originalRow,
        activityId: row[0] || '',
        description: row[1] || originalRow.description || (originalRow as any).name || (originalRow as any).Name || '',
        block: row[2] || '',
        hoursPerDay: Number(row[3]) || 8.0,
        budgetedUnits: String(currentBudgeted),
        actualUnits: String(calculatedActual.toFixed(2)),
        remainingUnits: String(calculatedBalance.toFixed(2)),
        percentComplete: pct,
        yesterdayValue: newYesterdayStr,
        todayValue: newTodayStr
      };

      const cellStatuses = (row as any)['_cellStatuses'] || {};
      
      if (cellStatuses[8]) {
        let newActualStart = row[8] || '';
        let isFuture = false;
        if (newActualStart && yesterday) {
          const editedDateStr = new Date(newActualStart).toISOString().split('T')[0];
          const calDateStr = new Date(yesterday).toISOString().split('T')[0];
          if (editedDateStr > calDateStr) isFuture = true;
        }
        if (isFuture) {
          if (window.confirm("You selected a future date for an Actual Start.\nP6 only accepts past/present dates for Actuals.\n\nClick OK to automatically save it as a Forecast date instead.\nClick Cancel to undo your change.")) {
            updatedRow.actualStart = newActualStart;
          } else {
            updatedRow.actualStart = originalRow.actualStart || '';
          }
        } else {
          updatedRow.actualStart = newActualStart;
        }
      }
      
      if (cellStatuses[9]) {
        let newActualFinish = row[9] || '';
        let isFuture = false;
        if (newActualFinish && yesterday) {
          const editedDateStr = new Date(newActualFinish).toISOString().split('T')[0];
          const calDateStr = new Date(yesterday).toISOString().split('T')[0];
          if (editedDateStr > calDateStr) isFuture = true;
        }
        if (isFuture) {
          if (window.confirm("You selected a future date for an Actual Finish.\nP6 only accepts past/present dates for Actuals.\n\nClick OK to automatically save it as a Forecast date instead.\nClick Cancel to undo your change.")) {
            updatedRow.actualFinish = newActualFinish;
          } else {
            updatedRow.actualFinish = originalRow.actualFinish || '';
          }
        } else {
          updatedRow.actualFinish = newActualFinish;
        }
      }
      
      if (cellStatuses[10]) updatedRow.forecastStart = row[10] || '';
      if (cellStatuses[11]) updatedRow.forecastFinish = row[11] || '';

      if (Object.keys(cellStatuses).length > 0) {
        updatedRow._cellStatuses = { ...cellStatuses };
      }

      if (originalRow.isCustom) {
        customRowChanges.push({ row, originalRow, calculatedActual });
      } else {
        p6RowChanges.push(updatedRow);
      }

      return updatedRow;
    });

    let currentCategoryIdx = -1;
    const categoryActivityMap: Record<number, number[]> = {};
    updatedRows.forEach((row, idx) => {
      if (row.isCategoryRow) {
        currentCategoryIdx = idx;
        categoryActivityMap[idx] = [];
      } else if (currentCategoryIdx >= 0) {
        categoryActivityMap[currentCategoryIdx].push(idx);
      }
    });

    Object.entries(categoryActivityMap).forEach(([catIdxStr, activityIndices]) => {
      const catIdx = Number(catIdxStr);
      const catRow = updatedRows[catIdx];
      const activities = activityIndices.map(i => updatedRows[i]);

      const totalScope = activities.reduce((sum, r) => sum + (Number(r.budgetedUnits) || 0), 0);
      const totalActual = activities.reduce((sum, r) => sum + (Number(r.actualUnits) || 0), 0);
      const totalBalance = activities.reduce((sum, r) => sum + (Number(r.remainingUnits) || 0), 0);
      const totalYesterday = activities.reduce((sum, r) => sum + (Number(r.yesterdayValue) || 0), 0);
      const totalToday = activities.reduce((sum, r) => sum + (Number(r.todayValue) || 0), 0);
      const pct = totalScope > 0 ? ((totalActual / totalScope) * 100).toFixed(2) + '%' : '0.00%';

      updatedRows[catIdx] = {
        ...catRow,
        budgetedUnits: String(totalScope),
        actualUnits: String(totalActual),
        remainingUnits: String(totalBalance),
        percentComplete: pct,
        yesterdayValue: String(totalYesterday),
        todayValue: String(totalToday)
      };
    });

    if (p6RowChanges.length > 0) {
      if (selectedBlock !== "ALL") {
        const fullDataCopy = [...data];
        p6RowChanges.forEach(updatedRow => {
          const idx = fullDataCopy.findIndex(d => String(d.activityId) === String(updatedRow.activityId));
          if (idx !== -1) fullDataCopy[idx] = updatedRow;
        });
        setData(fullDataCopy);
      } else {
        const newP6Data = updatedRows.filter(r => !r.isCustom && !(r.isCategoryRow && r.description === "📝 DPR Level Activities"));
        setData(newP6Data);
      }
    }

    if (onEditCustomActivity && customRowChanges.length > 0) {
      customRowChanges.forEach(({ row, originalRow, calculatedActual }) => {
        const customId = originalRow._customId;
        if (!customId) return;
        const c = customActivities.find(x => x.id === customId);
        if (!c) return;

        const newDesc = row[1] || '';
        const newHoursPerDay = Number(row[3]) || 8.0;
        const newBudgeted = row[4] || '0';
        
        const newYesterdayStr = String(row[12] || '0').trim(); 
        const newTodayStr = String(row[13] || '0').trim();
        
        let finalCustomActStart = c.actualStart || '';
        if ((row[8] || '') !== (indianDateFormat(c.actualStart) || '')) {
           finalCustomActStart = row[8] || '';
        }
        
        let finalCustomActFinish = c.actualFinish || '';
        if ((row[9] || '') !== (indianDateFormat(c.actualFinish) || '')) {
           finalCustomActFinish = row[9] || '';
        }

        const hasChanges =
          newDesc !== (c.description || '') ||
          newHoursPerDay !== (c.extraData?.hoursPerDay || 8.0) ||
          newBudgeted !== String(c.scope || 0) ||
          newYesterdayStr !== String(c.extraData?.yesterdayValue || 0) ||
          newTodayStr !== String(c.extraData?.todayValue || 0) ||
          finalCustomActStart !== (c.actualStart || '') ||
          finalCustomActFinish !== (c.actualFinish || '');

        if (hasChanges) {
          onEditCustomActivity({
            id: customId,
            sheetType: 'manpower_details',
            description: newDesc,
            scope: Number(newBudgeted) || 0,
            cumulative: Number(calculatedActual) || 0,
            plannedStart: finalCustomActStart,
            plannedFinish: finalCustomActFinish,
            extraData: {
              ...c.extraData,
              hoursPerDay: newHoursPerDay,
              yesterdayValue: newYesterdayStr,
              todayValue: newTodayStr,
            }
          });
        }
      });
    }

  }, [data, filteredData, selectedBlock, setData, customActivities, onEditCustomActivity]);

  useEffect(() => {
    if (Array.isArray(data)) {
      const total = data.reduce((sum, row) => {
        if (row.isCategoryRow) return sum;
        return sum + (parseInt(row.todayValue) || 0);
      }, 0);
      
      const customTotal = customActivities.reduce((sum, row) => {
        return sum + (parseInt(row.extraData?.todayValue) || 0);
      }, 0);

      setTotalManpower(total + customTotal);
    }
  }, [data, customActivities, setTotalManpower]);

  const editableColumns = [
    "Description",
    "Hours/Day",
    "Required",
    "Available",
    "Actual Start",
    "Actual Finish",
    indianDateFormat(yesterday),
    indianDateFormat(today)
  ];

  const columnTypes: Record<string, 'text' | 'number' | 'date'> = {
    "Activity ID": "text",
    "Description": "text",
    "Block": "text",
    "Hours/Day": "number",
    "Required": "number",
    "Available": "number",
    "Gap": "number",
    "% Completion": "text",
    "Actual Start": "date",
    "Actual Finish": "date",
    "Forecast Start": "text",
    "Forecast Finish": "text",
    [indianDateFormat(yesterday)]: "number",
    [indianDateFormat(today)]: "number"
  };

  const columnWidths: Record<string, number> = {
    "Activity ID": 90,
    "Description": 230,
    "Block": 80,
    "Hours/Day": 80,
    "Required": 100,
    "Available": 100,
    "Gap": 110,
    "% Completion": 100,
    "Actual Start": 100,
    "Actual Finish": 100,
    "Forecast Start": 100,
    "Forecast Finish": 100,
    [indianDateFormat(yesterday)]: 90,
    [indianDateFormat(today)]: 90
  };

  const handleRowDelete = useCallback((index: number) => {
    const row = tableData[index];
    if (row && (row as any)._isCustomRow && onDeleteCustomActivity) {
      const customId = (row as any)._customId;
      if (customId) onDeleteCustomActivity(customId);
    }
  }, [tableData, onDeleteCustomActivity]);

  return (
    <div className="space-y-2 w-full flex-1 min-h-0 flex flex-col">
      {!isLocked && (onAddCustomActivity || onBulkUploadActivities) && (
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
        title="Manpower Details"
        columns={columns}
        data={tableData}
        totalRows={totalRows}
        onDataChange={handleDataChange}
        onSave={onSave}
        onSubmit={onSubmit}
        onPush={onPush}
        isReadOnly={isLocked}
        editableColumns={editableColumns}
        columnTypes={columnTypes}
        columnWidths={columnWidths}
        cellTextColors={cellTextColors}
        columnTextColors={{
          "% Completion": "#16a34a",
          "Actual Start": "#00B050",
          "Actual Finish": "#00B050",
          "Forecast Start": "#2E86C1",
          "Forecast Finish": "#2E86C1"
        }}
        columnFontWeights={{
          "% Completion": "bold",
          "Actual Start": "bold",
          "Actual Finish": "bold",
          "Forecast Start": "bold",
          "Forecast Finish": "bold"
        }}
        rowStyles={rowStyles}
        headerStructure={[
          [
            { label: "Activity ID", colSpan: 1, rowSpan: 2 },
            { label: "Description", colSpan: 1, rowSpan: 2 },
            { label: "Block", colSpan: 1, rowSpan: 2 },
            { label: "Hours/Day", colSpan: 1, rowSpan: 2 },
            { label: "Required", colSpan: 1, rowSpan: 2 },
            { label: "Available", colSpan: 1, rowSpan: 2 },
            { label: "Gap", colSpan: 1, rowSpan: 2 },
            { label: "% Completion", colSpan: 1, rowSpan: 2 },
            { label: "Actual", colSpan: 2, rowSpan: 1 },
            { label: "Forecast", colSpan: 2, rowSpan: 1 },
            { label: "Manpower Days", colSpan: 2 }
          ],
          [
            { label: "Start", colSpan: 1, rowSpan: 1 },
            { label: "Finish", colSpan: 1, rowSpan: 1 },
            { label: "Start", colSpan: 1, rowSpan: 1 },
            { label: "Finish", colSpan: 1, rowSpan: 1 },
            { label: indianDateFormat(yesterday), colSpan: 1 },
            { label: indianDateFormat(today), colSpan: 1 }
          ]
        ]}
        status={status}
        onExportAll={onExportAll}
        onFullscreenToggle={onFullscreenToggle}
        onReachEnd={onReachEnd}
        externalGlobalFilter={universalFilter}
        projectId={projectId}
        sheetType="manpower_details"
        onRowDelete={isPmagOrAdmin && !isLocked && onDeleteCustomActivity ? handleRowDelete : undefined}
        rowIsEditable={(idx) => {
          const row = tableData[idx] as any;
          return row && !row.isCategoryRow;
        }}
        rowIsDeletable={(idx) => !!(tableData[idx] as any)?._isCustomRow && isPmagOrAdmin}
      />
    </div>
  );
}
