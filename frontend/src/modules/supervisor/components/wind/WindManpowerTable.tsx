import React, { useMemo, useCallback } from 'react';
import { StyledExcelTable } from "@/components/StyledExcelTable";
import { indianDateFormat } from "@/services/dprService";
import { Calendar, Plus, Upload } from "lucide-react";
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { getNormalizedLocation, isOthersAct, extractBase } from "@/utils/windUtils";

export interface WindManpowerData {
  activityId: string;
  description: string;
  block: string;
  budgetedUnits: string; 
  actualUnits: string;   
  remainingUnits: string; 
  hoursPerDay?: number;
  percentComplete?: string;
  yesterdayValue: string; 
  todayValue: string;     
  yesterdayIsApproved?: boolean;
  isCategoryRow?: boolean;
  category?: string;
  [key: string]: any;
}

interface WindManpowerTableProps {
  data: WindManpowerData[];
  setData: (data: WindManpowerData[]) => void;
  onSave?: () => void;
  onSubmit?: () => void;
  yesterday?: string;
  today?: string;
  isLocked?: boolean;
  status?: string;
  onExportAll?: () => void;
  projectId?: number;
  onPush?: () => void;
  selectedLocation?: string;
  selectedSubstation?: string;
  selectedActivityGroup?: string;
  onDateChange?: (date: string) => void;
  customActivities?: any[];
  onAddCustomActivity?: (activity: any, silent?: boolean) => void;
  onEditCustomActivity?: (activity: any) => void;
  onDeleteCustomActivity?: (id: number) => void;
  onBulkUploadActivities?: () => void;
}

export const WindManpowerTable: React.FC<WindManpowerTableProps> = ({
  data,
  setData,
  onSave,
  onSubmit,
  onPush,
  yesterday,
  today,
  isLocked = false,
  status = 'draft',
  onExportAll,
  projectId,
  selectedLocation = "ALL",
  selectedSubstation = "ALL",
  selectedActivityGroup = "ALL",
  customActivities = [],
  onAddCustomActivity,
  onEditCustomActivity,
  onDeleteCustomActivity,
  onBulkUploadActivities,
}) => {
  const { user } = useAuth();
  const userRole = (user?.role || user?.Role || '').toLowerCase();
  const isPmagOrAdmin = userRole.includes('pmag') || userRole.includes('admin');

  const columns = useMemo(() => [
    "Activity ID",
    "Description",
    "Block",
    "Hours/Day",
    "Budgeted Days",
    "Actual Days",
    "Remaining Days",
    "% Completion",
    "Actual Start",
    "Actual Finish",
    "Forecast Start",
    "Forecast Finish",
    indianDateFormat(yesterday),
    indianDateFormat(today)
  ], [yesterday, today]);

  const columnWidths = useMemo(() => ({
    "Activity ID": 130,
    "Description": 280,
    "Block": 100,
    "Hours/Day": 100,
    "Budgeted Days": 110,
    "Actual Days": 110,
    "Remaining Days": 130,
    "% Completion": 110,
    "Actual Start": 130,
    "Actual Finish": 130,
    "Forecast Start": 130,
    "Forecast Finish": 130,
    [indianDateFormat(yesterday)]: 110,
    [indianDateFormat(today)]: 110
  }), [yesterday, today]);

  const columnTypes = useMemo(() => ({
    "Activity ID": "text" as const,
    "Description": "text" as const,
    "Block": "text" as const,
    "Hours/Day": "number" as const,
    "Budgeted Days": "number" as const,
    "Actual Days": "number" as const,
    "Remaining Days": "number" as const,
    "% Completion": "text" as const,
    "Actual Start": "date" as const,
    "Actual Finish": "date" as const,
    "Forecast Start": "text" as const,
    "Forecast Finish": "text" as const,
    [indianDateFormat(yesterday)]: "number" as const,
    [indianDateFormat(today)]: "number" as const
  }), [yesterday, today]);

  const editableColumns = useMemo(() => [
    "Description", "Block", "Hours/Day", "Budgeted Days",
    "Actual Start", "Actual Finish",
    indianDateFormat(yesterday),
    indianDateFormat(today)
  ], [yesterday, today]);

  const filteredData = useMemo(() => {
    const safeData = Array.isArray(data) ? data : [];
    const safeCustom = Array.isArray(customActivities) ? customActivities : [];
    
    // 1. Filter out existing categories and keep valid rows
    const validP6Rows = safeData.filter(row => {
      if (row.isCategoryRow) return false;
      const matchLoc = selectedLocation === "ALL" || row.block === selectedLocation || (row.description && row.description.includes(selectedLocation));
      const matchSub = selectedSubstation === "ALL" || row.block === selectedSubstation || (row.description && row.description.includes(selectedSubstation));
      const matchGroup = selectedActivityGroup === "ALL" || (row.description && row.description.includes(selectedActivityGroup));
      return matchLoc && matchSub && matchGroup;
    });

    // 2. Sort to match WindProgressTable
    validP6Rows.sort((a, b) => {
      const locA = getNormalizedLocation(a);
      const locB = getNormalizedLocation(b);

      const isOthersA = isOthersAct(a);
      const isOthersB = isOthersAct(b);

      if (isOthersA && !isOthersB) return 1;
      if (!isOthersA && isOthersB) return -1;

      if (locA === '' && locB !== '') return 1;
      if (locA !== '' && locB === '') return -1;
      if (locA !== locB) return locA.localeCompare(locB, undefined, { numeric: true, sensitivity: 'base' });
      
      return (a.activityId || '').localeCompare(b.activityId || '');
    });

    // 3. Group by Location/WTG
    const finalResult: any[] = [];
    let currentCategory: string | null = null;
    
    validP6Rows.forEach(row => {
      let category = getNormalizedLocation(row) || 'OTHERS';

      if (isOthersAct(row)) {
        category = 'OTHERS';
      }

      if (category !== currentCategory) {
        currentCategory = category;
        finalResult.push({
          isCategoryRow: true,
          description: currentCategory,
          activityId: '',
          block: '',
          budgetedUnits: '0',
          actualUnits: '0',
          remainingUnits: '0',
          yesterdayValue: '0',
          todayValue: '0'
        });
      }
      finalResult.push(row);
    });

    // Append custom activities matching filters
    const filteredCustom = safeCustom.filter(c => {
      if (selectedLocation !== "ALL" && c.block !== selectedLocation) return false;
      if (selectedActivityGroup !== "ALL" && c.category !== selectedActivityGroup) return false;
      return true;
    });

    if (filteredCustom.length > 0) {
      finalResult.push({
        isCategoryRow: true,
        description: "📝 DPR Level Activities",
        activityId: '',
        block: '',
        budgetedUnits: '0',
        actualUnits: '0',
        remainingUnits: '0',
        yesterdayValue: '0',
        todayValue: '0'
      });
      filteredCustom.forEach(c => {
        finalResult.push({
          ...c,
          isCustom: true,
          _isCustomRow: true,
          _customId: c.id,
          activityId: '',
          description: c.description || '',
          block: c.block || '',
          category: c.category || '',
          hoursPerDay: c.extraData?.hoursPerDay || 8,
          budgetedUnits: String(c.scope || 0),
          actualUnits: String(c.cumulative || 0),
          remainingUnits: String(Math.max(0, (c.scope || 0) - (c.cumulative || 0))),
          actualStart: c.actualStart || '',
          actualFinish: c.actualFinish || '',
          yesterdayValue: c.extraData?.yesterdayValue || '0',
          todayValue: c.extraData?.todayValue || '0'
        });
      });
    }

    return finalResult;
  }, [data, customActivities, selectedLocation, selectedSubstation, selectedActivityGroup]);

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

    return filteredData.map(row => {
      const d = getDates(row);
      let arr: any = [
        row.activityId || '',
        row.description || '',
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
        (row.yesterdayValue === undefined || row.yesterdayValue === null || String(row.yesterdayValue) === "0") ? "" : String(row.yesterdayValue),
        (row.todayValue === undefined || row.todayValue === null || String(row.todayValue) === "0") ? "" : String(row.todayValue)
      ];
      
      if (row.isCategoryRow) {
        arr[0] = ''; // No Activity ID for category rows
        arr[8] = ''; arr[9] = ''; arr[10] = ''; arr[11] = '';
        (arr as any).isCategoryRow = true;
      }
      if ((row as any)._isCustomRow) {
        (arr as any)._isCustomRow = true;
        (arr as any)._customId = (row as any)._customId;
      }
      
      if (row._cellStatuses) {
        arr._cellStatuses = row._cellStatuses;
      }
      return arr;
    });
  }, [filteredData, yesterday]);

  const rowStyles = useMemo(() => {
    const styles: Record<number, any> = {};
    tableData.forEach((row, index) => {
      if ((row as any).isCategoryRow) {
        styles[index] = {
          backgroundColor: "#FADFAD",
          color: "#333333",
          fontWeight: "bold",
          isCategoryRow: true,
        };
      } else if ((row as any)._isCustomRow) {
        styles[index] = {
          backgroundColor: "#FFFBEB",
        };
      }
    });
    return styles;
  }, [tableData]);

  const handleInlineAdd = useCallback(() => {
    if (onAddCustomActivity) {
      onAddCustomActivity({
        sheetType: 'wind_manpower',
        description: 'New DPR Activity',
        uom: 'Days',
        scope: 0,
        category: selectedActivityGroup !== 'ALL' ? selectedActivityGroup : '',
        block: selectedLocation !== 'ALL' ? selectedLocation : '',
      });
    }
  }, [onAddCustomActivity, selectedActivityGroup, selectedLocation]);

  const handleDataChange = useCallback((newData: any[][]) => {
    const parsedYesterdayStr = yesterday ? String(yesterday).split('T')[0] : '';
    const referenceDateStr = parsedYesterdayStr;

    const getDatesForCompare = (r: any) => {
      const s = r.actualStart;
      const f = r.actualFinish;
      let actS = '', fcstS = '', actF = '', fcstF = '';

      if (s) {
        const sStr = String(s).split('T')[0];
        if (referenceDateStr && sStr <= referenceDateStr) {
          actS = indianDateFormat(sStr) || sStr;
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
        } else {
          fcstF = indianDateFormat(fStr) || fStr;
        }
      } else if (r.forecastFinish) {
        const dStr = String(r.forecastFinish).split('T')[0];
        fcstF = indianDateFormat(dStr) || dStr;
      }
      return { actS, fcstS, actF, fcstF };
    };

    const p6RowChanges: any[] = [];
    const customRowChanges: any[] = [];

    newData.forEach((row, index) => {
      const original = filteredData[index];
      if (!original || original.isCategoryRow) return;

      if ((row as any)._isCustomRow) {
        customRowChanges.push({ row, original });
      } else {
        p6RowChanges.push({ row, original });
      }
    });

    const updatedP6 = p6RowChanges.map(({ row, original }) => {
      const newYesterdayStr = String(row[12] || '0').trim();
      const newTodayStr = String(row[13] || '0').trim();
      const newYesterday = newYesterdayStr;
      const newToday = newTodayStr;
      
      const budgeted = Number(original.budgetedUnits) || 0;
      const initialActual = Number(original.actualUnits) || 0;
      const initialToday = Number(original.todayValue) || 0;
      const initialYesterday = Number(original.yesterdayValue) || 0;
      
      const baseActual = initialActual - initialToday - initialYesterday;
      const newActual = baseActual + (Number(newYesterday) || 0) + (Number(newToday) || 0);
      const newRemaining = Math.max(0, budgeted - newActual);
      const newPct = budgeted > 0 ? (Math.round((newActual / budgeted) * 100)) + '%' : '0%';

      const updatedRow = {
        ...original,
        yesterdayValue: newYesterdayStr,
        todayValue: newTodayStr,
        actualUnits: String(Math.round(newActual)),
        remainingUnits: String(Math.round(newRemaining)),
        percentComplete: newPct
      };

      const cellStatuses = (row as any)['_cellStatuses'] || {};
      const origDts = getDatesForCompare(original);

      if (cellStatuses["Actual Start"] || row[8] !== origDts.actS) {
        let newActualStart = row[8] || '';
        let newForecastStart = row[10] || original.forecastStart;
        let isFuture = false;
        if (newActualStart && (today || yesterday)) {
          const editedDateStr = new Date(newActualStart).toISOString().split('T')[0];
          const calDateStr = new Date(today || yesterday || '').toISOString().split('T')[0];
          if (editedDateStr > calDateStr) isFuture = true;
        }
        if (isFuture) {
          if (window.confirm("You selected a future date for an Actual Start.\nP6 only accepts past/present dates for Actuals.\n\nClick OK to automatically save it as a Forecast date instead.\nClick Cancel to undo your change.")) {
            newForecastStart = newActualStart;
            updatedRow.actualStart = original.actualStart || '';
          } else {
            updatedRow.actualStart = original.actualStart || '';
          }
        } else {
          updatedRow.actualStart = newActualStart;
        }
        updatedRow.forecastStart = newForecastStart;
      }
      
      if (cellStatuses["Actual Finish"] || row[9] !== origDts.actF) {
        let newActualFinish = row[9] || '';
        let newForecastFinish = row[11] || original.forecastFinish;
        let isFuture = false;
        if (newActualFinish && (today || yesterday)) {
          const editedDateStr = new Date(newActualFinish).toISOString().split('T')[0];
          const calDateStr = new Date(today || yesterday || '').toISOString().split('T')[0];
          if (editedDateStr > calDateStr) isFuture = true;
        }
        if (isFuture) {
          if (window.confirm("You selected a future date for an Actual Finish.\nP6 only accepts past/present dates for Actuals.\n\nClick OK to automatically save it as a Forecast date instead.\nClick Cancel to undo your change.")) {
            newForecastFinish = newActualFinish;
            updatedRow.actualFinish = original.actualFinish || '';
          } else {
            updatedRow.actualFinish = original.actualFinish || '';
          }
        } else {
          updatedRow.actualFinish = newActualFinish;
        }
        
        updatedRow.forecastStart = (row[10] !== (indianDateFormat(original.forecastStart) || ''))
          ? (row[10] || '') : (original.forecastStart || '');
        updatedRow.forecastFinish = (row[11] !== (indianDateFormat(original.forecastFinish) || ''))
          ? (newForecastFinish || '') : (original.forecastFinish || '');
      }
      
      if (cellStatuses["Forecast Start"] || row[10] !== origDts.fcstS) updatedRow.forecastStart = row[10] || '';
      if (cellStatuses["Forecast Finish"] || row[11] !== origDts.fcstF) updatedRow.forecastFinish = row[11] || '';

      if (Object.keys(cellStatuses).length > 0) {
        updatedRow._cellStatuses = { ...cellStatuses };
      }

      return updatedRow;
    });

    const newDataArray = [...data];
    updatedP6.forEach(updatedRow => {
      const idx = newDataArray.findIndex(r => r.activityId === updatedRow.activityId);
      if (idx !== -1) {
        newDataArray[idx] = updatedRow;
      }
    });
    setData(newDataArray);

    if (onEditCustomActivity && customRowChanges.length > 0) {
      customRowChanges.forEach(({ row }) => {
        const customId = (row as any)._customId;
        if (!customId) return;
        const originalCustom = customActivities.find(c => c.id === customId);
        if (!originalCustom) return;

        const newDesc = row[1] || '';
        const newBlock = row[2] || '';
        const newHours = row[3] || '8';
        const newScope = row[4] || '0';
        
        const newYesterdayStr = String(row[12] || '0').trim();
        const newTodayStr = String(row[13] || '0').trim();
        const newYesterday = newYesterdayStr;
        const newToday = newTodayStr;

        let finalCustomActStart = originalCustom.actualStart || '';
        if ((row[8] || '') !== (indianDateFormat(originalCustom.actualStart) || '')) {
           finalCustomActStart = row[8] || '';
        }
        
        let finalCustomActFinish = originalCustom.actualFinish || '';
        if ((row[9] || '') !== (indianDateFormat(originalCustom.actualFinish) || '')) {
           finalCustomActFinish = row[9] || '';
        }

        const initialActual = Number(originalCustom.cumulative) || 0;
        const initialToday = Number(originalCustom.extraData?.todayValue) || 0;
        const initialYesterday = Number(originalCustom.extraData?.yesterdayValue) || 0;

        const baseActual = initialActual - initialToday - initialYesterday;
        const newActual = baseActual + (Number(newYesterday) || 0) + (Number(newToday) || 0);

        const hasChanges =
          newDesc !== (originalCustom.description || '') ||
          newBlock !== (originalCustom.block || '') ||
          newHours !== String(originalCustom.extraData?.hoursPerDay || 8) ||
          newScope !== String(originalCustom.scope || 0) ||
          newYesterdayStr !== String(originalCustom.extraData?.yesterdayValue || 0) ||
          newTodayStr !== String(originalCustom.extraData?.todayValue || 0) ||
          finalCustomActStart !== (originalCustom.actualStart || '') ||
          finalCustomActFinish !== (originalCustom.actualFinish || '');

        if (hasChanges) {
          onEditCustomActivity({
            id: customId,
            sheetType: 'wind_manpower',
            description: newDesc,
            block: newBlock,
            scope: Number(newScope) || 0,
            cumulative: Number(newActual) || 0,
            plannedStart: finalCustomActStart,
            plannedFinish: finalCustomActFinish,
            extraData: {
              ...originalCustom.extraData,
              hoursPerDay: Number(newHours) || 8,
              yesterdayValue: newYesterdayStr,
              todayValue: newTodayStr,
            }
          });
        }
      });
    }

  }, [data, filteredData, setData, customActivities, onEditCustomActivity]);

  const handleRowDelete = useCallback((index: number) => {
    const row = tableData[index];
    if (row && (row as any)._isCustomRow && onDeleteCustomActivity) {
      const customId = (row as any)._customId;
      if (customId) onDeleteCustomActivity(customId);
    }
  }, [tableData, onDeleteCustomActivity]);

  return (
    <div className="space-y-4 w-full flex-1 min-h-0 flex flex-col">
      {/* Inline Add Activity Button */}
      {!isLocked && (onAddCustomActivity || onBulkUploadActivities) && (
        <div className="flex justify-end px-2 gap-2 mb-4">
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
        title="Wind Project - Manpower"
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
        headerStructure={[
          [
            { label: "Activity ID", colSpan: 1, rowSpan: 2 },
            { label: "Description", colSpan: 1, rowSpan: 2 },
            { label: "Block", colSpan: 1, rowSpan: 2 },
            { label: "Hours/Day", colSpan: 1, rowSpan: 2 },
            { label: "Budgeted Days", colSpan: 1, rowSpan: 2 },
            { label: "Actual Days", colSpan: 1, rowSpan: 2 },
            { label: "Remaining Days", colSpan: 1, rowSpan: 2 },
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
        rowStyles={rowStyles}
        status={status}
        onExportAll={onExportAll}
        disableAutoHeaderColors={true}
        projectId={projectId}
        sheetType="wind_manpower"
        onRowDelete={isPmagOrAdmin && !isLocked && onDeleteCustomActivity ? handleRowDelete : undefined}
        rowIsEditable={(idx) => {
          const row = tableData[idx] as any;
          return row && !row.isCategoryRow;
        }}
        rowIsDeletable={(idx) => !!(tableData[idx] as any)?._isCustomRow && isPmagOrAdmin}
      />
    </div>
  );
};
