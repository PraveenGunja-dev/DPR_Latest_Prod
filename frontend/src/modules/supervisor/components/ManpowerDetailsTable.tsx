import React, { useEffect, useMemo } from "react";
import { StyledExcelTable } from "@/components/StyledExcelTable";
import { indianDateFormat, getTodayAndYesterday } from "@/services/dprService";
import { EntryStatus } from "@/types";

interface ManpowerDetailsData {
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
  selectedBlock = "ALL"
}: ManpowerDetailsTableProps) {

  const { yesterday: previousDateISO } = getTodayAndYesterday();
  const previousDate = indianDateFormat(previousDateISO);

  // 9-column structure as requested
  const columns = [
    "Activity ID",
    "Description",
    "Block",
    "Hours/Day",
    "Required",
    "Available",
    "Gap",
    "% Completion",
    indianDateFormat(yesterday),
    indianDateFormat(today)
  ];

  // Filter data based on selected block and universal filter
  const filteredData = useMemo(() => {
    if (!Array.isArray(data)) return [];
    
    // First pass: identify valid non-category rows
    const validRows = data.map(d => {
      if (d.isCategoryRow) return true; // Keep initially
      
      const matchBlock = selectedBlock === "ALL" || d.block === selectedBlock || d.newBlockNom === selectedBlock;
      
      const filterText = (universalFilter || "").trim().toUpperCase();
      const matchActivity = !filterText || filterText === "ALL" || 
                           (d.activityId && String(d.activityId).toUpperCase().includes(filterText));
                           
      return matchBlock && matchActivity;
    });

    // Second pass: compile final list, omitting categories with no valid children
    const finalResult = [];
    for (let i = 0; i < data.length; i++) {
        if (data[i].isCategoryRow) {
            // Check if there's at least one valid child before the next category
            let hasValidChild = false;
            let j = i + 1;
            while (j < data.length && !data[j].isCategoryRow) {
                if (validRows[j]) {
                    hasValidChild = true;
                    break;
                }
                j++;
            }
            if (hasValidChild) {
                finalResult.push(data[i]);
            }
        } else if (validRows[i]) {
            finalResult.push(data[i]);
        }
    }
    return finalResult;
  }, [data, selectedBlock, universalFilter]);

  // Convert objects to arrays — Vendor IDT display structure
  const tableData = useMemo(() => {
    return (Array.isArray(filteredData) ? filteredData : []).map(row => {
      let arr: any;
      if (row.isCategoryRow) {
        // Category heading row — no Activity ID, no Block
        arr = [
          '',
          row.description || '',
          '',
          '', // Hours/Day
          row.budgetedUnits ? Number(row.budgetedUnits).toFixed(2) : "0.00",
          row.actualUnits ? Number(row.actualUnits).toFixed(2) : "0.00",
          row.remainingUnits ? Number(row.remainingUnits).toFixed(2) : "0.00",
          row.percentComplete || "0.00%",
          row.yesterdayValue || "0",
          row.todayValue || "0"
        ];
      } else {
        arr = [
          row.activityId || '',
          row.description || (row as any).activities || (row as any).activity || (row as any).activity_name || (row as any).name || (row as any).Name || '',
          row.block || '',
          row.hoursPerDay || '8.0',
          row.budgetedUnits ? Number(row.budgetedUnits).toFixed(2) : "0.00",
          row.actualUnits ? Number(row.actualUnits).toFixed(2) : "0.00",
          row.remainingUnits ? Number(row.remainingUnits).toFixed(2) : "0.00",
          row.percentComplete || "0.00%",
          row.yesterdayValue || "0",
          row.todayValue || "0"
        ];
      }
      if ((row as any)._cellStatuses) {
        arr._cellStatuses = (row as any)._cellStatuses;
      }
      return arr;
    });
  }, [filteredData]);

  // #FADFAD heading rows — same as Vendor IDT
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

  // Handle data changes
  const handleDataChange = (newData: any[][]) => {
    const actualDataRows = newData.slice(0, filteredData.length);
    const updatedRows = actualDataRows.map((row, index) => {
      const originalRow = filteredData[index];

      if (originalRow?.isCategoryRow) {
        return { ...originalRow };
      } else {
        // 0=ActivityID, 1=Description, 2=Block, 3=Hours/Day, 4=Required,
        // 5=Available, 6=Gap, 7=%Completion, 8=Yesterday, 9=Today
        const newYesterdayStr = String(row[8] || '0').trim();
        const newTodayStr = String(row[9] || '0').trim();
        const newYesterday = Number(newYesterdayStr) || 0;
        const newToday = Number(newTodayStr) || 0;
        
        const oldYesterdayStr = String(originalRow.yesterdayValue || '0').trim();
        const oldTodayStr = String(originalRow.todayValue || '0').trim();
        const oldYesterday = Number(oldYesterdayStr) || 0;
        const oldToday = Number(oldTodayStr) || 0;

        const currentBudgeted = Number(row[4]) || 0;
        
        // Base value from the input cell
        let calculatedActual = Number(row[5]) || 0;
        
        // If user specifically edited Today or Yesterday, adjust the Available value
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

        // Preserve _cellStatuses metadata from the array row (set by StyledExcelTable)
        const cellStatuses = (row as any)['_cellStatuses'];
        if (cellStatuses && Object.keys(cellStatuses).length > 0) {
          updatedRow._cellStatuses = { ...cellStatuses };
        }

        return updatedRow;
      }
    });

    // Recalculate category row totals
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

    if (selectedBlock !== "ALL") {
      const fullDataCopy = [...data];
      updatedRows.forEach(updatedRow => {
        if (updatedRow.isCategoryRow) return;
        const idx = fullDataCopy.findIndex(d => d.activityId === updatedRow.activityId);
        if (idx !== -1) fullDataCopy[idx] = updatedRow;
      });
      setData(fullDataCopy);
    } else {
      setData(updatedRows);
    }
  };

  useEffect(() => {
    if (Array.isArray(data)) {
      const total = data.reduce((sum, row) => {
        if (row.isCategoryRow) return sum;
        return sum + (parseInt(row.todayValue) || 0);
      }, 0);
      setTotalManpower(total);
    }
  }, [data, setTotalManpower]);

  const editableColumns = [
    "Required",
    "Available",
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
    [indianDateFormat(yesterday)]: 90,
    [indianDateFormat(today)]: 90
  };

  return (
    <div className="space-y-2 w-full flex-1 min-h-0 flex flex-col">
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
          "% Completion": "#16a34a"
        }}
        columnFontWeights={{
          "% Completion": "bold"
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
            { label: "Manpower Days", colSpan: 2 }
          ],
          [
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
      />
    </div>
  );
}
