import React, { useMemo, useCallback } from 'react';
import { StyledExcelTable } from "@/components/StyledExcelTable";
import { indianDateFormat } from "@/services/dprService";
import { Calendar, Plus } from "lucide-react";
import { useAuth } from '@/modules/auth/contexts/AuthContext';

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
  yesterday: string;
  today: string;
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
  onAddCustomActivity?: (activity: any) => void;
  onEditCustomActivity?: (activity: any) => void;
  onDeleteCustomActivity?: (id: number) => void;
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
    indianDateFormat(yesterday),
    indianDateFormat(today)
  ], [yesterday, today]);

  const columnWidths = useMemo(() => ({
    "Activity ID": 120,
    "Description": 280,
    "Block": 100,
    "Hours/Day": 90,
    "Budgeted Days": 110,
    "Actual Days": 110,
    "Remaining Days": 120,
    "% Completion": 110,
    [indianDateFormat(yesterday)]: 100,
    [indianDateFormat(today)]: 100
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
    [indianDateFormat(yesterday)]: "number" as const,
    [indianDateFormat(today)]: "number" as const
  }), [yesterday, today]);

  const editableColumns = useMemo(() => [
    "Description", "Block", "Hours/Day", "Budgeted Days",
    indianDateFormat(yesterday),
    indianDateFormat(today)
  ], [yesterday, today]);

  const filteredData = useMemo(() => {
    const safeData = Array.isArray(data) ? data : [];
    const safeCustom = Array.isArray(customActivities) ? customActivities : [];
    
    // First, map which P6 rows are valid
    const validRows = safeData.map(row => {
      if (row.isCategoryRow) return false;
      const matchLoc = selectedLocation === "ALL" || row.block === selectedLocation || (row.description && row.description.includes(selectedLocation));
      const matchSub = selectedSubstation === "ALL" || row.block === selectedSubstation || (row.description && row.description.includes(selectedSubstation));
      const matchGroup = selectedActivityGroup === "ALL" || (row.description && row.description.includes(selectedActivityGroup));
      return matchLoc && matchSub && matchGroup;
    });

    const finalResult = [];
    for (let i = 0; i < safeData.length; i++) {
      if (safeData[i].isCategoryRow) {
        let validChildCount = 0;
        let j = i + 1;
        while (j < safeData.length && !safeData[j].isCategoryRow) {
          if (validRows[j]) validChildCount++;
          j++;
        }
        if (validChildCount >= 2) {
          finalResult.push(safeData[i]);
        }
      } else if (validRows[i]) {
        finalResult.push(safeData[i]);
      }
    }

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
          yesterdayValue: c.extraData?.yesterdayValue || '0',
          todayValue: c.extraData?.todayValue || '0'
        });
      });
    }

    return finalResult;
  }, [data, customActivities, selectedLocation, selectedSubstation, selectedActivityGroup]);

  const tableData = useMemo(() => {
    return filteredData.map(row => {
      let arr: any = [
        row.activityId || '',
        row.description || '',
        row.block || '',
        row.hoursPerDay || '8.0',
        row.budgetedUnits ? Number(row.budgetedUnits).toFixed(2) : "0.00",
        row.actualUnits ? Number(row.actualUnits).toFixed(2) : "0.00",
        row.remainingUnits ? Number(row.remainingUnits).toFixed(2) : "0.00",
        row.percentComplete || "0.00%",
        row.yesterdayValue || "0",
        row.todayValue || "0"
      ];
      
      if (row.isCategoryRow) {
        arr[0] = ''; // No Activity ID for category rows
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
  }, [filteredData]);

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
      const newYesterdayStr = String(row[8] || '0').trim();
      const newTodayStr = String(row[9] || '0').trim();
      const newYesterday = Number(newYesterdayStr) || 0;
      const newToday = Number(newTodayStr) || 0;
      
      const budgeted = Number(original.budgetedUnits) || 0;
      const initialActual = Number(original.actualUnits) || 0;
      const initialToday = Number(original.todayValue) || 0;
      const initialYesterday = Number(original.yesterdayValue) || 0;
      
      const baseActual = initialActual - initialToday - initialYesterday;
      const newActual = baseActual + newYesterday + newToday;
      const newRemaining = Math.max(0, budgeted - newActual);
      const newPct = budgeted > 0 ? ((newActual / budgeted) * 100).toFixed(2) + '%' : '0.00%';

      return {
        ...original,
        _cellStatuses: (row as any)._cellStatuses,
        yesterdayValue: newYesterdayStr,
        todayValue: newTodayStr,
        actualUnits: String(newActual.toFixed(2)),
        remainingUnits: String(newRemaining.toFixed(2)),
        percentComplete: newPct
      };
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
        
        const newYesterdayStr = String(row[8] || '0').trim();
        const newTodayStr = String(row[9] || '0').trim();
        const newYesterday = Number(newYesterdayStr) || 0;
        const newToday = Number(newTodayStr) || 0;

        const initialActual = Number(originalCustom.cumulative) || 0;
        const initialToday = Number(originalCustom.extraData?.todayValue) || 0;
        const initialYesterday = Number(originalCustom.extraData?.yesterdayValue) || 0;

        const baseActual = initialActual - initialToday - initialYesterday;
        const newActual = baseActual + newYesterday + newToday;

        const hasChanges =
          newDesc !== (originalCustom.description || '') ||
          newBlock !== (originalCustom.block || '') ||
          newHours !== String(originalCustom.extraData?.hoursPerDay || 8) ||
          newScope !== String(originalCustom.scope || 0) ||
          newYesterdayStr !== String(originalCustom.extraData?.yesterdayValue || 0) ||
          newTodayStr !== String(originalCustom.extraData?.todayValue || 0);

        if (hasChanges) {
          onEditCustomActivity({
            id: customId,
            sheetType: 'wind_manpower',
            description: newDesc,
            block: newBlock,
            scope: Number(newScope) || 0,
            cumulative: Number(newActual) || 0,
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
            { label: "Manpower Days", colSpan: 2 }
          ],
          [
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
