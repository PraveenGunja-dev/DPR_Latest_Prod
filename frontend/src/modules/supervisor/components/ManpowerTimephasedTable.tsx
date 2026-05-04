import React, { useMemo, useCallback, memo } from "react";
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
  hoursPerDay?: number;
  percentComplete?: string;
  yesterdayValue: string;
  todayValue: string;
  yesterdayIsApproved?: boolean;
  isCategoryRow?: boolean;
  category?: string;
  newBlockNom?: string;
  [key: string]: any;
}

interface ManpowerTimephasedTableProps {
  data: ManpowerDetailsData[];
  setData: (data: ManpowerDetailsData[]) => void;
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
  userRole?: string;
}

const formatUnits = (val: any) => {
  const num = Number(val) || 0;
  if (num === 0) return '0';
  return Number.isInteger(num) ? String(num) : num.toFixed(2);
};

export const ManpowerTimephasedTable = memo(({
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
  totalRows,
  onFullscreenToggle,
  onReachEnd,
  universalFilter,
  projectId,
  selectedBlock = "ALL"
}: ManpowerTimephasedTableProps) => {

  const columns = useMemo(() => {
    const baseCols = ["Activity ID", "Description", "Block"];
    const dateRange = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const formattedDate = indianDateFormat(d.toISOString().split('T')[0]);
      dateRange.push(`${formattedDate} - Contractor`, `${formattedDate} - Required`, `${formattedDate} - Available`, `${formattedDate} - Gap`, `${formattedDate} - At Completion`, `${formattedDate} - % Comp`);
    }
    return [...baseCols, ...dateRange];
  }, [today]);

  const filteredData = useMemo(() => {
    if (!Array.isArray(data)) return [];
    
    const filterText = (universalFilter || "").trim().toUpperCase();
    const result = [];
    
    for (let i = 0; i < data.length; i++) {
      const d = data[i];
      if (d.isCategoryRow) {
        result.push(d);
        continue;
      }
      
      const matchBlock = selectedBlock === "ALL" || d.block === selectedBlock || d.newBlockNom === selectedBlock;
      const matchActivity = !filterText || filterText === "ALL" || (d.activityId && String(d.activityId).toUpperCase().includes(filterText));
      
      if (matchBlock && matchActivity) {
        result.push(d);
      }
    }
    return result;
  }, [data, selectedBlock, universalFilter]);

  const { tableData, rowStyles, cellTextColors } = useMemo(() => {
    const safeFiltered = Array.isArray(filteredData) ? filteredData : [];
    const styles: Record<number, any> = {};
    const textColors: Record<number, Record<string, string>> = {};
    const yesterdayFormatted = indianDateFormat(yesterday);

    const rows = safeFiltered.map((row, index) => {
      if (row.isCategoryRow) {
        styles[index] = { backgroundColor: '#FADFAD', color: '#333333', fontWeight: 'bold', isCategoryRow: true };
      }
      
      if (row.yesterdayIsApproved === false) {
        textColors[index] = { [yesterdayFormatted]: "#ce440d" };
      } else if (row.yesterdayIsApproved === true) {
        textColors[index] = { [yesterdayFormatted]: "#16a34a" };
      }

      const datesArray: any[] = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        const dateSuffix = d.toISOString().split('T')[0];
        
        if (row.isCategoryRow) {
          datesArray.push(row[`contractor_${dateSuffix}`] || '', formatUnits(row.budgetedUnits), formatUnits(row[`actual_${dateSuffix}`]), '', '', row.percentComplete || "");
        } else {
          datesArray.push(row[`contractor_${dateSuffix}`] ?? row.contractorName ?? '', formatUnits(row.budgetedUnits), formatUnits(row[`actual_${dateSuffix}`]), '', '', '');
        }
      }

      const arr = row.isCategoryRow 
        ? ['', row.description || row.name || '', '', ...datesArray]
        : [row.activityId || '', row.description || row.name || '', row.block || '', ...datesArray];
      
      if ((row as any)._cellStatuses) (arr as any)._cellStatuses = (row as any)._cellStatuses;
      return arr;
    });

    return { tableData: rows, rowStyles: styles, cellTextColors: textColors };
  }, [filteredData, today, yesterday]);

  const handleDataChange = useCallback((newData: any[][]) => {
    const safeFiltered = Array.isArray(filteredData) ? filteredData : [];
    const actualDataRows = newData.slice(0, safeFiltered.length);
    let hasOverallChanges = false;

    const updatedRows = actualDataRows.map((row, index) => {
      const originalRow = safeFiltered[index];
      if (originalRow?.isCategoryRow) return originalRow;

      let hasRowChanges = false;
      const newDateValues: Record<string, any> = {};
      let newBudgeted = Number(originalRow.budgetedUnits) || 0;

      for (let i = 0; i < 7; i++) {
        const contractorIdx = 3 + i * 6;
        const budgetedIdx = 3 + i * 6 + 1;
        const actualIdx = 3 + i * 6 + 2;

        const d = new Date(today);
        d.setDate(d.getDate() - (6 - i));
        const dateSuffix = d.toISOString().split('T')[0];

        const contractorVal = row[contractorIdx] || '';
        const budgetedVal = Number(row[budgetedIdx]) || 0;
        const actualVal = Number(row[actualIdx]) || 0;

        if (contractorVal !== (originalRow[`contractor_${dateSuffix}`] || originalRow.contractorName || '')) hasRowChanges = true;
        if (budgetedVal !== (Number(originalRow.budgetedUnits) || 0)) {
          newBudgeted = budgetedVal;
          hasRowChanges = true;
        }
        if (actualVal !== (Number(originalRow[`actual_${dateSuffix}`]) || 0)) hasRowChanges = true;

        newDateValues[`actual_${dateSuffix}`] = actualVal;
        newDateValues[`contractor_${dateSuffix}`] = contractorVal;
      }

      if (hasRowChanges || (row as any)._cellStatuses !== originalRow._cellStatuses) {
        hasOverallChanges = true;
        return { ...originalRow, ...newDateValues, budgetedUnits: String(newBudgeted), _cellStatuses: (row as any)._cellStatuses };
      }
      return originalRow;
    });

    if (hasOverallChanges) {
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
    }
  }, [filteredData, today, data, setData, selectedBlock]);

  const editableColumns = useMemo(() => columns.filter(c => c.includes('Available') || c.includes('Required')), [columns]);

  const columnTypes = useMemo(() => {
    const types: Record<string, any> = { "Activity ID": "text", "Description": "text", "Block": "text" };
    columns.slice(3).forEach(c => types[c] = (c.includes("Contractor") || c.includes("% Comp")) ? "text" : "number");
    return types;
  }, [columns]);

  const columnWidths = useMemo(() => {
    const widths: Record<string, number> = { "Activity ID": 90, "Description": 230, "Block": 80 };
    columns.slice(3).forEach(c => {
      if (c.includes("Contractor")) widths[c] = 160;
      else if (c.includes("Required")) widths[c] = 130;
      else if (c.includes("Available")) widths[c] = 120;
      else if (c.includes("Gap")) widths[c] = 130;
      else if (c.includes("At Completion")) widths[c] = 140;
      else if (c.includes("% Comp")) widths[c] = 80;
      else widths[c] = 90;
    });
    return widths;
  }, [columns]);

  const headerStructure = useMemo(() => [
    [
      { label: "Activity ID", colSpan: 1, rowSpan: 2 },
      { label: "Description", colSpan: 1, rowSpan: 2 },
      { label: "Block", colSpan: 1, rowSpan: 2 },
      ...Array(7).fill(0).map((_, i) => {
         const d = new Date(today);
         d.setDate(d.getDate() - (6 - i));
         return { label: indianDateFormat(d.toISOString().split('T')[0]), colSpan: 6 };
      })
    ],
    [
      ...Array(7).fill(0).flatMap(() => [
         { label: "Contractor", colSpan: 1 }, { label: "Required", colSpan: 1 }, { label: "Available", colSpan: 1 },
         { label: "Gap", colSpan: 1 }, { label: "At Completion", colSpan: 1 }, { label: "% Comp", colSpan: 1 }
      ])
    ]
  ], [today]);

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
        fixedColumnsCount={3}
        editableColumns={editableColumns}
        columnTypes={columnTypes}
        columnWidths={columnWidths}
        cellTextColors={cellTextColors}
        columnTextColors={useMemo(() => ({ "% Completion": "#16a34a" }), [])}
        columnFontWeights={useMemo(() => ({ "% Completion": "bold" }), [])}
        rowStyles={rowStyles}
        headerStructure={headerStructure}
        status={status}
        onExportAll={onExportAll}
        onFullscreenToggle={onFullscreenToggle}
        onReachEnd={onReachEnd}
        externalGlobalFilter={universalFilter}
        projectId={projectId}
        sheetType="manpower_details_2"
      />
    </div>
  );
});
