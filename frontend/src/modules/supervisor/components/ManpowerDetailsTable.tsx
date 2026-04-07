import React, { useEffect, useMemo } from "react";
import { StyledExcelTable } from "@/components/StyledExcelTable";
import { indianDateFormat, getTodayAndYesterday } from "@/services/dprService";
import { EntryStatus } from "@/types";

interface ManpowerDetailsData {
  activityId: string;
  description: string;
  block: string;
  budgetedUnits: string;
  actualUnits: string;
  remainingUnits: string;
  percentComplete?: string;
  yesterdayValue: string;
  todayValue: string;
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
}

export function ManpowerDetailsTable({
  data,
  setData,
  totalManpower,
  setTotalManpower,
  onSave,
  onSubmit,
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
    "Budgeted Units",
    "Actual Units",
    "Remaining Units",
    "% Completion",
    indianDateFormat(yesterday),
    indianDateFormat(today)
  ];

  // Filter data based on selected block
  const filteredData = useMemo(() => {
    if (!Array.isArray(data)) return [];
    return selectedBlock === "ALL" ? data : data.filter(d => d.isCategoryRow || d.block === selectedBlock || d.newBlockNom === selectedBlock);
  }, [data, selectedBlock]);

  // Convert objects to arrays — Vendor IDT display structure
  const tableData = useMemo(() => {
    return (Array.isArray(filteredData) ? filteredData : []).map(row => {
      if (row.isCategoryRow) {
        // Category heading row — no Activity ID, no Block
        return [
          '',
          row.description || '',
          '',
          row.budgetedUnits || '',
          row.actualUnits || '',
          row.remainingUnits || '',
          row.percentComplete || '',
          row.yesterdayValue || '',
          row.todayValue || ''
        ];
      } else {
        return [
          row.activityId || '',
          row.description || '',
          row.block || '',
          row.budgetedUnits || '',
          row.actualUnits || '',
          row.remainingUnits || '',
          row.percentComplete || '',
          row.yesterdayValue || '',
          row.todayValue || ''
        ];
      }
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
        // 0=ActivityID, 1=Description, 2=Block, 3=BudgetedUnits,
        // 4=ActualUnits, 5=RemainingUnits, 6=%Completion, 7=Yesterday, 8=Today
        const scope = Number(row[3]) || 0;
        const newYesterday = Number(row[7]) || 0;
        const newToday = Number(row[8]) || 0;

        const initialActual = Number(originalRow.actualUnits) || 0;
        const initialToday = Number(originalRow.todayValue) || 0;
        const initialYesterday = Number(originalRow.yesterdayValue) || 0;
        const baseActual = initialActual - initialToday - initialYesterday;

        const calculatedActual = baseActual + newYesterday + newToday;
        
        const initialRemaining = Number(originalRow.remainingUnits) || 0;
        const baseRemaining = initialRemaining + initialToday + initialYesterday;
        const calculatedBalance = Math.max(0, baseRemaining - newYesterday - newToday);
        const pct = scope > 0 ? ((calculatedActual / scope) * 100).toFixed(2) + '%' : '0.00%';

        const updatedRow: any = {
          ...originalRow,
          activityId: row[0] || '',
          description: row[1] || '',
          block: row[2] || '',
          budgetedUnits: String(scope),
          actualUnits: String(calculatedActual),
          remainingUnits: String(calculatedBalance),
          percentComplete: pct,
          yesterdayValue: String(newYesterday),
          todayValue: String(newToday)
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
    "Budgeted Units",
    indianDateFormat(yesterday),
    indianDateFormat(today)
  ];

  const columnTypes: Record<string, 'text' | 'number' | 'date'> = {
    "Activity ID": "text",
    "Description": "text",
    "Block": "text",
    "Budgeted Units": "number",
    "Actual Units": "number",
    "Remaining Units": "number",
    "% Completion": "text",
    [indianDateFormat(yesterday)]: "number",
    [indianDateFormat(today)]: "number"
  };

  const columnWidths: Record<string, number> = {
    "Activity ID": 100,
    "Description": 250,
    "Block": 80,
    "Budgeted Units": 100,
    "Actual Units": 100,
    "Remaining Units": 110,
    "% Completion": 100,
    [indianDateFormat(yesterday)]: 90,
    [indianDateFormat(today)]: 90
  };

  return (
    <div className="space-y-2 w-full flex-1 min-h-0 flex flex-col">
      <StyledExcelTable
        title="Manpower Details Table"
        columns={columns}
        data={tableData}
        totalRows={totalRows}
        onDataChange={handleDataChange}
        onSave={onSave}
        onSubmit={onSubmit}
        isReadOnly={isLocked}
        editableColumns={editableColumns}
        columnTypes={columnTypes}
        columnWidths={columnWidths}
        cellTextColors={cellTextColors}
        columnTextColors={{
          "% Completion": "#74DB4B"
        }}
        columnFontWeights={{
          "% Completion": "bold"
        }}
        rowStyles={rowStyles}
        headerStructure={[
          [
            { label: "Activity ID", colSpan: 1 },
            { label: "Description", colSpan: 1 },
            { label: "Block", colSpan: 1 },
            { label: "Budgeted Units", colSpan: 1 },
            { label: "Actual Units", colSpan: 1 },
            { label: "Remaining Units", colSpan: 1 },
            { label: "% Completion", colSpan: 1 },
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
