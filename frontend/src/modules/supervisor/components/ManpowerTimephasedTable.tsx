import React, { useMemo, useCallback, memo, useRef } from "react";
import { StyledExcelTable } from "@/components/StyledExcelTable";
import { Calendar } from "lucide-react";
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
  onSave?: (isAuto?: boolean) => void | Promise<void>;
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
  onDateChange?: (date: string) => void;
}

const formatUnits = (val: any) => {
  if (val === undefined || val === null || val === '') return '';
  const num = Number(val) || 0;
  if (num === 0) return '';
  return String(Math.round(num));
};

const formatEditable = (val: any) => {
  if (val === undefined || val === null || val === '' || val === 0 || val === '0') return '';
  const num = Number(val);
  return !isNaN(num) ? String(Math.round(num)) : String(val);
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
  projectId,
  selectedBlock = "ALL",
  onDateChange,
  universalFilter
}: ManpowerTimephasedTableProps) => {

  const { HISTORY_DAYS, FUTURE_DAYS } = useMemo(() => {
    return { HISTORY_DAYS: 7, FUTURE_DAYS: 0 };
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

    // Pre-calculate valid rows
    const validRows = data.map(d => {
      if (d.isCategoryRow) return false;
      const matchBlock = selectedBlock === "ALL" || d.block === selectedBlock || d.newBlockNom === selectedBlock;
      const matchActivity = !filterText || filterText === "ALL" || (d.activityId && String(d.activityId).toUpperCase().includes(filterText));
      return matchBlock && matchActivity;
    });

    for (let i = 0; i < data.length; i++) {
      if (data[i].isCategoryRow) {
        let validChildCount = 0;
        let j = i + 1;
        while (j < data.length && !data[j].isCategoryRow) {
          if (validRows[j]) validChildCount++;
          j++;
        }
        if (validChildCount >= 2) {
          result.push(data[i]);
        }
      } else if (validRows[i]) {
        result.push(data[i]);
      }
    }
    return result;
  }, [data, selectedBlock, universalFilter]);

  const { tableData, rowStyles, cellTextColors } = useMemo(() => {
    const safeFiltered = Array.isArray(filteredData) ? filteredData : [];
    const styles: Record<number, any> = {};
    const textColors: Record<number, Record<string, string>> = {};
    const yesterdayFormatted = indianDateFormat(yesterday);

    // Category rows total the children beneath them, computed here from the rows as they are
    // right now. The totals stored on the category row by aggregateManpowerByActivityName are a
    // snapshot from load time, taken before the draft overlay and never updated on an edit -
    // so the heading kept showing 9 while the child underneath had been changed to 7.
    const perRow: Array<{ req: Record<string, any>; avail: Record<string, any> }> = [];

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
      let lastKnownRequired: string | number = "";

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
        } else if (key.startsWith("required_")) {
          const dStr = key.replace("required_", "");
          if (dStr < oldestDateStr && dStr > maxRequiredDate && row[key] !== '') {
            maxRequiredDate = dStr;
            lastKnownRequired = row[key];
          }
        }
      });

      const datesArray: any[] = [];
      const rowReq: Record<string, any> = {};
      const rowAvail: Record<string, any> = {};
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
        } else if (row[`required_${dateSuffix}`] === '') {
          lastKnownRequired = '';
        }

        const reqVal = lastKnownRequired;
        const availVal = row[`actual_${dateSuffix}`];
        const hasReqOrAvail = (reqVal !== undefined && reqVal !== '' && reqVal !== null) || (availVal !== undefined && availVal !== '' && availVal !== null);

        let gapStr = '';
        if (hasReqOrAvail) {
          const reqNum = Number(reqVal) || 0;
          const availNum = Number(availVal) || 0;
          const gapNum = reqNum - availNum;
          gapStr = String(gapNum);
        }

        if (row.isCategoryRow) {
          // Placeholder; filled in from the children below once they are all known.
          datesArray.push('', '', '', '');
        } else {
          rowReq[dateSuffix] = reqVal;
          rowAvail[dateSuffix] = availVal;
          datesArray.push(lastKnownContractor, formatEditable(reqVal), formatEditable(availVal), gapStr);
        }
      }
      perRow[index] = { req: rowReq, avail: rowAvail };

      const arr = row.isCategoryRow
        ? [row.description || row.name || '', '', '', ...datesArray]
        : [row.activityId || '', row.description || row.name || '', row.block || '', ...datesArray];

      if ((row as any)._cellStatuses) (arr as any)._cellStatuses = (row as any)._cellStatuses;
      return arr;
    });

    // Second pass: fill each category heading with the sum of the children that follow it.
    const dateSuffixes: string[] = [];
    for (let i = HISTORY_DAYS - 1; i >= -FUTURE_DAYS; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      dateSuffixes.push(d.toISOString().split('T')[0]);
    }
    const hasVal = (v: any) => v !== undefined && v !== null && v !== '';
    safeFiltered.forEach((row, index) => {
      if (!row.isCategoryRow) return;
      const reqSum: Record<string, number> = {};
      const availSum: Record<string, number> = {};
      const reqSeen: Record<string, boolean> = {};
      const availSeen: Record<string, boolean> = {};
      for (let j = index + 1; j < safeFiltered.length && !safeFiltered[j].isCategoryRow; j++) {
        const child = perRow[j];
        if (!child) continue;
        dateSuffixes.forEach(ds => {
          if (hasVal(child.req[ds])) { reqSum[ds] = (reqSum[ds] || 0) + (Number(child.req[ds]) || 0); reqSeen[ds] = true; }
          if (hasVal(child.avail[ds])) { availSum[ds] = (availSum[ds] || 0) + (Number(child.avail[ds]) || 0); availSeen[ds] = true; }
        });
      }
      const arr = rows[index];
      dateSuffixes.forEach((ds, di) => {
        const base = 3 + di * 4;
        const req = reqSeen[ds] ? reqSum[ds] : undefined;
        const avail = availSeen[ds] ? availSum[ds] : undefined;
        arr[base + 1] = req !== undefined ? String(Math.round(req)) : '';
        arr[base + 2] = avail !== undefined ? String(Math.round(avail)) : '';
        arr[base + 3] = (req !== undefined || avail !== undefined) ? String((req || 0) - (avail || 0)) : '';
      });
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
        const actualVal = row[actualIdx] !== undefined && row[actualIdx] !== null ? String(row[actualIdx]) : '';

        const prevContractorVal = prevVisualRow ? (prevVisualRow[contractorIdx] || '') : '';
        const prevBudgetedVal = prevVisualRow ? (prevVisualRow[budgetedIdx] || '') : '';
        const prevActualVal = prevVisualRow ? (prevVisualRow[actualIdx] !== undefined && prevVisualRow[actualIdx] !== null ? String(prevVisualRow[actualIdx]) : '') : '';

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
          // historyValues is the mirror applyDraftOverlay unpacks from the stored history. It is
          // sent with the row, so it has to carry the edit too - a stale copy beside the new
          // actual_<date> is exactly what used to make the old figure win on the server.
          newDateValues.historyValues = { ...(newDateValues.historyValues || originalRow.historyValues || {}), [dateSuffix]: actualVal };
        }
      }

      if (hasRowChanges || (row as any)._cellStatuses !== originalRow._cellStatuses) {
        hasOverallChanges = true;
        return { ...originalRow, ...newDateValues, _cellStatuses: (row as any)._cellStatuses };
      }
      return originalRow;
    });

    if (hasOverallChanges) {
      const fullDataCopy = [...data];
      updatedRows.forEach(updatedRow => {
        if (updatedRow.isCategoryRow) return;
        const idx = fullDataCopy.findIndex(d => {
          if (d.assignmentId && updatedRow.assignmentId) {
            return String(d.assignmentId) === String(updatedRow.assignmentId);
          }
          return d.activityId === updatedRow.activityId &&
                 d.description === updatedRow.description &&
                 d.block === updatedRow.block;
        });
        if (idx !== -1) fullDataCopy[idx] = updatedRow;
      });
      setData(fullDataCopy);
    }
  }, [filteredData, today, data, setData, HISTORY_DAYS, FUTURE_DAYS]);

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
    ]
  }, [today, HISTORY_DAYS, FUTURE_DAYS]);

  return (
    <div className="space-y-4 w-full h-full flex-1 min-h-0 flex flex-col">
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

