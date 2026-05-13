import React, { useMemo, useCallback, memo, useRef } from "react";
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

  const { HISTORY_DAYS, FUTURE_DAYS } = useMemo(() => {
    let minDate = today;
    let maxDate = today;
    data.forEach(row => {
      Object.keys(row).forEach(key => {
        if (key.startsWith('actual_') || key.startsWith('contractor_') || key.startsWith('required_')) {
          const dStr = key.split('_')[1];
          if (dStr && dStr.length === 10) {
            if (dStr < minDate && dStr > '2023-01-01') minDate = dStr;
            if (dStr > maxDate) maxDate = dStr;
          }
        }
      });
    });

    const start = new Date(minDate);
    const end = new Date(today);
    const pastDiffTime = Math.abs(end.getTime() - start.getTime());
    const pastDiffDays = Math.ceil(pastDiffTime / (1000 * 60 * 60 * 24)) + 1;

    const futureStart = new Date(today);
    const futureEnd = new Date(maxDate);
    let futureDiffDays = 0;
    if (futureEnd > futureStart) {
       const futureDiffTime = Math.abs(futureEnd.getTime() - futureStart.getTime());
       futureDiffDays = Math.ceil(futureDiffTime / (1000 * 60 * 60 * 24));
    }

    const finalHistoryDays = Math.min(Math.max(pastDiffDays, 7), 180);
    const finalFutureDays = Math.min(Math.max(futureDiffDays, 14), 60);

    return { HISTORY_DAYS: finalHistoryDays, FUTURE_DAYS: finalFutureDays };
  }, [data, today]);

  const previousTableDataRef = useRef<any[][]>([]);

  const columns = useMemo(() => {
    const baseCols = ["Activity ID", "Description", "Block"];
    const dateRange = [];
    for (let i = HISTORY_DAYS - 1; i >= -FUTURE_DAYS; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const formattedDate = indianDateFormat(d.toISOString().split('T')[0]);
      dateRange.push(`${formattedDate} - Contractor`, `${formattedDate} - Required`, `${formattedDate} - Available`, `${formattedDate} - Gap`);
    }
    return [...baseCols, ...dateRange];
  }, [today, HISTORY_DAYS, FUTURE_DAYS]);

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

      let lastKnownContractor = '';
      let lastKnownRequired = row.budgetedUnits;

      const oldestDateInWindow = new Date(today);
      oldestDateInWindow.setDate(oldestDateInWindow.getDate() - (HISTORY_DAYS - 1));
      const oldestDateStr = oldestDateInWindow.toISOString().split('T')[0];

      let maxContractorDate = "0000-00-00";
      let maxRequiredDate = "0000-00-00";

      Object.keys(row).forEach(key => {
        if (key.startsWith("contractor_")) {
          const dStr = key.replace("contractor_", "");
          if (dStr < oldestDateStr && dStr > maxContractorDate && row[key] !== '') {
            maxContractorDate = dStr;
            lastKnownContractor = row[key];
          }
        }
        if (key.startsWith("required_")) {
          const dStr = key.replace("required_", "");
          if (dStr < oldestDateStr && dStr > maxRequiredDate && row[key] !== '') {
            maxRequiredDate = dStr;
            lastKnownRequired = row[key];
          }
        }
      });

      const datesArray: any[] = [];
      for (let i = HISTORY_DAYS - 1; i >= -FUTURE_DAYS; i--) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        const dateSuffix = d.toISOString().split('T')[0];

        if (row[`contractor_${dateSuffix}`] !== undefined && row[`contractor_${dateSuffix}`] !== '') {
          lastKnownContractor = row[`contractor_${dateSuffix}`];
        } else if (row[`contractor_${dateSuffix}`] === '') {
          lastKnownContractor = '';
        }

        if (row[`required_${dateSuffix}`] !== undefined && row[`required_${dateSuffix}`] !== '') {
          lastKnownRequired = row[`required_${dateSuffix}`];
        }

        if (row.isCategoryRow) {
          datesArray.push(lastKnownContractor, formatUnits(lastKnownRequired), formatUnits(row[`actual_${dateSuffix}`]), '');
        } else {
          datesArray.push(lastKnownContractor, formatUnits(lastKnownRequired), formatUnits(row[`actual_${dateSuffix}`]), '');
        }
      }

      const arr = row.isCategoryRow
        ? ['', row.description || row.name || '', '', ...datesArray]
        : [row.activityId || '', row.description || row.name || '', row.block || '', ...datesArray];

      if ((row as any)._cellStatuses) (arr as any)._cellStatuses = (row as any)._cellStatuses;
      return arr;
    });

    previousTableDataRef.current = rows;
    return { tableData: rows, rowStyles: styles, cellTextColors: textColors };
  }, [filteredData, today, yesterday, HISTORY_DAYS, FUTURE_DAYS]);

  const handleDataChange = useCallback((newData: any[][]) => {
    const safeFiltered = Array.isArray(filteredData) ? filteredData : [];
    const actualDataRows = newData.slice(0, safeFiltered.length);
    const prevVisualData = previousTableDataRef.current;
    let hasOverallChanges = false;

    const updatedRows = actualDataRows.map((row, index) => {
      const originalRow = safeFiltered[index];
      const prevVisualRow = prevVisualData[index];
      if (originalRow?.isCategoryRow) return originalRow;

      let hasRowChanges = false;
      const newDateValues: Record<string, any> = {};
      const TOTAL_DAYS = HISTORY_DAYS + FUTURE_DAYS;

      for (let i = 0; i < TOTAL_DAYS; i++) {
        const contractorIdx = 3 + i * 4;
        const budgetedIdx = 3 + i * 4 + 1;
        const actualIdx = 3 + i * 4 + 2;

        const d = new Date(today);
        d.setDate(d.getDate() - (HISTORY_DAYS - 1 - i));
        const dateSuffix = d.toISOString().split('T')[0];

        const contractorVal = row[contractorIdx] || '';
        const budgetedVal = row[budgetedIdx] || '';
        const actualVal = Number(row[actualIdx]) || 0;

        const prevContractorVal = prevVisualRow ? (prevVisualRow[contractorIdx] || '') : '';
        const prevBudgetedVal = prevVisualRow ? (prevVisualRow[budgetedIdx] || '') : '';
        const prevActualVal = prevVisualRow ? (Number(prevVisualRow[actualIdx]) || 0) : 0;

        if (contractorVal !== prevContractorVal) {
          hasRowChanges = true;
          newDateValues[`contractor_${dateSuffix}`] = contractorVal;
        }

        if (String(budgetedVal) !== String(prevBudgetedVal)) {
          hasRowChanges = true;
          newDateValues[`required_${dateSuffix}`] = budgetedVal;
        }

        if (actualVal !== prevActualVal) {
          hasRowChanges = true;
          newDateValues[`actual_${dateSuffix}`] = actualVal;
        }
      }

      if (hasRowChanges || (row as any)._cellStatuses !== originalRow._cellStatuses) {
        hasOverallChanges = true;
        return { ...originalRow, ...newDateValues, _cellStatuses: (row as any)._cellStatuses };
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
  }, [filteredData, today, data, setData, selectedBlock, HISTORY_DAYS, FUTURE_DAYS]);

  const editableColumns = useMemo(() => columns.filter(c => c.includes('Available') || c.includes('Required') || c.includes('Contractor')), [columns]);

  const columnTypes = useMemo(() => {
    const types: Record<string, any> = { "Activity ID": "text", "Description": "text", "Block": "text" };
    columns.slice(3).forEach(c => types[c] = (c.includes("Contractor")) ? "text" : "number");
    return types;
  }, [columns]);

  const columnWidths = useMemo(() => {
    const widths: Record<string, number> = { "Activity ID": 90, "Description": 230, "Block": 80 };
    columns.slice(3).forEach(c => {
      if (c.includes("Contractor")) widths[c] = 160;
      else if (c.includes("Required")) widths[c] = 100;
      else if (c.includes("Available")) widths[c] = 100;
      else if (c.includes("Gap")) widths[c] = 100;
      else widths[c] = 90;
    });
    return widths;
  }, [columns]);

  const headerStructure = useMemo(() => {
    const TOTAL_DAYS = HISTORY_DAYS + FUTURE_DAYS;
    return [
    [
      { label: "Activity ID", colSpan: 1, rowSpan: 2 },
      { label: "Description", colSpan: 1, rowSpan: 2 },
      { label: "Block", colSpan: 1, rowSpan: 2 },
      ...Array(TOTAL_DAYS).fill(0).map((_, i) => {
        const d = new Date(today);
        d.setDate(d.getDate() - (HISTORY_DAYS - 1 - i));
        return { label: indianDateFormat(d.toISOString().split('T')[0]), colSpan: 4 };
      })
    ],
    [
      ...Array(TOTAL_DAYS).fill(0).flatMap(() => [
        { label: "Contractor", colSpan: 1 }, { label: "Required", colSpan: 1 }, { label: "Available", colSpan: 1 },
        { label: "Gap", colSpan: 1 }
      ])
    ]
  ]}, [today, HISTORY_DAYS, FUTURE_DAYS]);

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
