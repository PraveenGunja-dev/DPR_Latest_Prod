import React, { useMemo, useCallback } from 'react';
import { StyledExcelTable } from "@/components/StyledExcelTable";
import { indianDateFormat } from "@/services/dprService";
import { Calendar } from "lucide-react";

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
}) => {

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
    indianDateFormat(yesterday),
    indianDateFormat(today)
  ], [yesterday, today]);

  const filteredData = useMemo(() => {
    const safeData = Array.isArray(data) ? data : [];
    return safeData.filter(row => {
      if (row.isCategoryRow) return true;
      
      const matchLoc = selectedLocation === "ALL" || row.block === selectedLocation || (row.description && row.description.includes(selectedLocation));
      const matchSub = selectedSubstation === "ALL" || row.block === selectedSubstation || (row.description && row.description.includes(selectedSubstation));
      const matchGroup = selectedActivityGroup === "ALL" || (row.description && row.description.includes(selectedActivityGroup));

      return matchLoc && matchSub && matchGroup;
    });
  }, [data, selectedLocation, selectedSubstation, selectedActivityGroup]);

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
      
      if (row._cellStatuses) {
        arr._cellStatuses = row._cellStatuses;
      }
      return arr;
    });
  }, [filteredData]);

  const handleDataChange = useCallback((newData: any[][]) => {
    const updated = newData.map((row, index) => {
      const original = filteredData[index];
      if (!original) return null;

      if (original.isCategoryRow) {
        return { ...original };
      }

      const newYesterdayStr = String(row[8] || '0').trim();
      const newTodayStr = String(row[9] || '0').trim();
      const newYesterday = Number(newYesterdayStr) || 0;
      const newToday = Number(newTodayStr) || 0;
      
      const budgeted = Number(original.budgetedUnits) || 0;
      const initialActual = Number(original.actualUnits) || 0;
      const initialToday = Number(original.todayValue) || 0;
      const initialYesterday = Number(original.yesterdayValue) || 0;
      
      // Calculate base actual without current inputs
      const baseActual = initialActual - initialToday - initialYesterday;
      const newActual = baseActual + newYesterday + newToday;
      const newRemaining = Math.max(0, budgeted - newActual);
      const newPct = budgeted > 0 ? ((newActual / budgeted) * 100).toFixed(2) + '%' : '0.00%';

      const updatedRow: any = {
        ...original,
        _cellStatuses: (row as any)._cellStatuses,
        yesterdayValue: newYesterdayStr,
        todayValue: newTodayStr,
        actualUnits: String(newActual.toFixed(2)),
        remainingUnits: String(newRemaining.toFixed(2)),
        percentComplete: newPct
      };

      return updatedRow;
    }).filter(r => r !== null);

    // Merge updated rows back into the main data array
    const newDataArray = [...data];
    updated.forEach(updatedRow => {
      if (!updatedRow) return;
      const idx = newDataArray.findIndex(r => r.activityId === updatedRow.activityId);
      if (idx !== -1) {
        newDataArray[idx] = updatedRow;
      }
    });

    setData(newDataArray);
  }, [data, filteredData, setData]);

  return (
    <div className="space-y-4 w-full flex-1 min-h-0 flex flex-col">
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
        status={status}
        onExportAll={onExportAll}
        disableAutoHeaderColors={true}
        projectId={projectId}
        sheetType="wind_manpower"
      />
    </div>
  );
};
