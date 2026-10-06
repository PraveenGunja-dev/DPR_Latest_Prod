import React, { useMemo, useCallback, memo, useRef } from "react";
import { StyledExcelTable } from "@/components/StyledExcelTable";
import { Calendar, Plus } from "lucide-react";
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
  /** Creates a new (8th, 9th, ...) category beyond the fixed 7, which the user then renames. */
  onAddCategory?: () => void;
  /** Fired when the user clicks the edit icon on a custom (non-fixed) category's row. */
  onRenameCategory?: (categoryKey: string, currentName: string) => void;
  /** Fired when the user clicks the delete icon on a custom (non-fixed) category's row. */
  onDeleteCategory?: (categoryKey: string, currentName: string) => void;
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
  universalFilter,
  onAddCategory,
  onRenameCategory,
  onDeleteCategory,
}: ManpowerTimephasedTableProps) => {

  const { HISTORY_DAYS, FUTURE_DAYS } = useMemo(() => {
    return { HISTORY_DAYS: 7, FUTURE_DAYS: 0 };
  }, [data, today]);

  const previousTableDataRef = useRef<any[][]>([]);

  // Fixed columns: Area (shows activity name for categories, block name for detail rows), Contractor (single column)
  // Then per date: Required, Available, Gap (3 sub-columns per date)
  const FIXED_COL_COUNT = 2; // Area, Contractor
  const COLS_PER_DATE = 3;   // Required, Available, Gap

  const dateSuffixes = useMemo(() => {
    const suffixes: string[] = [];
    for (let i = HISTORY_DAYS - 1; i >= -FUTURE_DAYS; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      suffixes.push(d.toISOString().split('T')[0]);
    }
    return suffixes;
  }, [today, HISTORY_DAYS, FUTURE_DAYS]);

  const columns = useMemo(() => {
    const baseCols = ["Area", "Contractor"];
    const dateRange: string[] = [];
    dateSuffixes.forEach(ds => {
      const formattedDate = indianDateFormat(ds);
      dateRange.push(`${formattedDate} - Required`, `${formattedDate} - Available`, `${formattedDate} - Gap`);
    });
    return [...baseCols, ...dateRange];
  }, [dateSuffixes]);

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
        // A category with exactly one matching row is still a real, meaningful group - e.g. an
        // activity like "Pile Capping" that only touches a single block. Requiring >= 2 silently
        // dropped its heading while still rendering the lone child row underneath, so the row
        // appeared with no indication of which activity it belonged to (and, worse, looked
        // identical to any other block's row from an unrelated activity with the same block name).
        if (validChildCount >= 1) {
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
        styles[index] = { backgroundColor: '#FADFAD', color: '#333333', fontWeight: 'bold', isCategoryRow: true, isCustomCategory: !!row.isCustomCategory };
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

      // Resolve the single contractor value (latest known)
      dateSuffixes.forEach(ds => {
        if (row[`contractor_${ds}`] !== undefined) {
          lastKnownContractor = row[`contractor_${ds}`];
        }
      });

      const datesArray: any[] = [];
      const rowReq: Record<string, any> = {};
      const rowAvail: Record<string, any> = {};

      // Reset required carry-forward for per-date iteration (removed carry-forward as requested)
      dateSuffixes.forEach(ds => {
        let reqVal: string | number = '';
        if (row[`required_${ds}`] !== undefined && row[`required_${ds}`] !== '') {
          reqVal = row[`required_${ds}`];
        }

        const availVal = row[`actual_${ds}`];
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
          datesArray.push('', '', '');
        } else {
          rowReq[ds] = reqVal;
          rowAvail[ds] = availVal;
          datesArray.push(formatEditable(reqVal), formatEditable(availVal), gapStr);
        }
      });
      perRow[index] = { req: rowReq, avail: rowAvail };

      // Area column: category rows show activity name, detail rows show block name
      const areaValue = row.isCategoryRow
        ? (row.description || row.name || '')
        : (row.block || '');

      const arr: any = [areaValue, row.isCategoryRow ? '' : lastKnownContractor, ...datesArray];

      if (row.isCategoryRow) arr.isCategoryRow = true;
      if ((row as any)._cellStatuses) (arr as any)._cellStatuses = (row as any)._cellStatuses;
      return arr;
    });

    // Second pass: fill each category heading with the sum of the children that follow it.
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
        const base = FIXED_COL_COUNT + di * COLS_PER_DATE;
        const req = reqSeen[ds] ? reqSum[ds] : undefined;
        const avail = availSeen[ds] ? availSum[ds] : undefined;
        arr[base] = req !== undefined ? String(Math.round(req)) : '';
        arr[base + 1] = avail !== undefined ? String(Math.round(avail)) : '';
        arr[base + 2] = (req !== undefined || avail !== undefined) ? String((req || 0) - (avail || 0)) : '';
      });
    });

    // Third pass: Grand Total
    const grandTotalRow: any = ["Grand Total", ""];
    grandTotalRow.isCategoryRow = true;
    grandTotalRow.isTotalRow = true;
    
    dateSuffixes.forEach((ds, di) => {
      let sumReq = 0, sumAvail = 0;
      let hasReq = false, hasAvail = false;
      rows.forEach(r => {
        if (r.isCategoryRow) {
          const base = FIXED_COL_COUNT + di * COLS_PER_DATE;
          if (r[base] !== '') { sumReq += Number(r[base]); hasReq = true; }
          if (r[base + 1] !== '') { sumAvail += Number(r[base + 1]); hasAvail = true; }
        }
      });
      const base = FIXED_COL_COUNT + di * COLS_PER_DATE;
      grandTotalRow[base] = hasReq ? String(Math.round(sumReq)) : '';
      grandTotalRow[base + 1] = hasAvail ? String(Math.round(sumAvail)) : '';
      grandTotalRow[base + 2] = (hasReq || hasAvail) ? String((sumReq || 0) - (sumAvail || 0)) : '';
    });

    const finalRows = [grandTotalRow, ...rows];
    
    const finalStyles: Record<number, any> = {
      0: { backgroundColor: '#D1E7DD', color: '#0A3622', fontWeight: 'bold', isCategoryRow: true }
    };
    Object.keys(styles).forEach(k => {
      finalStyles[Number(k) + 1] = styles[Number(k)];
    });
    
    const finalTextColors: Record<number, any> = {};
    Object.keys(textColors).forEach(k => {
      finalTextColors[Number(k) + 1] = textColors[Number(k)];
    });

    previousTableDataRef.current = rows;
    return { tableData: finalRows, rowStyles: finalStyles, cellTextColors: finalTextColors };
  }, [filteredData, today, yesterday, HISTORY_DAYS, FUTURE_DAYS, dateSuffixes]);

  const handleDataChange = useCallback((newData: any[][]) => {
    const safeFiltered = Array.isArray(filteredData) ? filteredData : [];
    // Skip the first row (Grand Total)
    const actualDataRows = newData.slice(1, safeFiltered.length + 1);
    const prevVisualData = previousTableDataRef.current;
    let hasOverallChanges = false;

    // Pass 1 (Contractor auto-fill by category) has been removed per request.

    const updatedRows = actualDataRows.map((row, index) => {
      const originalRow = safeFiltered[index];
      const prevVisualRow = prevVisualData[index];
      if (originalRow?.isCategoryRow) {
        return { updated: originalRow, original: originalRow };
      }

      const gridDirty = !!((row as any)._cellStatuses && Object.keys((row as any)._cellStatuses).length > 0);

      let hasRowChanges = false;
      const newDateValues: Record<string, any> = {};

      // Check if contractor changed (single column at index 1)
      let contractorVal = row[1] || '';
      const prevContractorVal = prevVisualRow ? (prevVisualRow[1] || '') : '';
      const latestDate = dateSuffixes[dateSuffixes.length - 1];
      const origContractorVal = originalRow[`contractor_${latestDate}`] || '';


      if (contractorVal !== prevContractorVal || contractorVal !== origContractorVal || gridDirty) {
        // Enforce alphabets only (and spaces/punctuation typically found in names, but restricting to just letters/spaces)
        contractorVal = String(contractorVal).replace(/[^a-zA-Z\s]/g, '');
        row[1] = contractorVal; // immediately update UI value

        if (contractorVal !== origContractorVal) {
          hasRowChanges = true;
          // Store contractor on the latest date
          newDateValues[`contractor_${latestDate}`] = contractorVal;
        }
      }

      let latestEditedRequiredVal: string | null = null;
      let hasRequiredEdit = false;

      // Check if any 'Required' column was edited
      dateSuffixes.forEach((ds, i) => {
        const reqIdx = FIXED_COL_COUNT + i * COLS_PER_DATE;
        const budgetedVal = String(row[reqIdx] || '');
        const origBudgetedVal = String(originalRow[`required_${ds}`] ?? '');
        if (budgetedVal !== origBudgetedVal) {
          latestEditedRequiredVal = budgetedVal;
          hasRequiredEdit = true;
        }
      });

      dateSuffixes.forEach((ds, i) => {
        const reqIdx = FIXED_COL_COUNT + i * COLS_PER_DATE;
        const availIdx = FIXED_COL_COUNT + i * COLS_PER_DATE + 1;

        let budgetedVal = String(row[reqIdx] || '');
        if (hasRequiredEdit && latestEditedRequiredVal !== null) {
          budgetedVal = latestEditedRequiredVal;
          row[reqIdx] = budgetedVal; // instantly reflect across UI
        }

        const actualVal = row[availIdx] !== undefined && row[availIdx] !== null ? String(row[availIdx]) : '';

        const origBudgetedVal = String(originalRow[`required_${ds}`] ?? '');
        const origActualVal = String(originalRow[`actual_${ds}`] ?? '');

        if (String(budgetedVal) !== origBudgetedVal) {
          hasRowChanges = true;
          newDateValues[`required_${ds}`] = budgetedVal;
        }

        if (actualVal !== origActualVal) {
          hasRowChanges = true;
          newDateValues[`actual_${ds}`] = actualVal;
          // historyValues is the mirror applyDraftOverlay unpacks from the stored history. It is
          // sent with the row, so it has to carry the edit too - a stale copy beside the new
          // actual_<date> is exactly what used to make the old figure win on the server.
          newDateValues.historyValues = { ...(newDateValues.historyValues || originalRow.historyValues || {}), [ds]: actualVal };
        }
      });


      if (hasRowChanges || gridDirty) {
        hasOverallChanges = true;
        const newStatuses = { ...(originalRow._cellStatuses || {}), ...((row as any)._cellStatuses || {}) };
        newStatuses.manpower_updated = "Pending";
        return { updated: { ...originalRow, ...newDateValues, _cellStatuses: newStatuses }, original: originalRow };
      }
      return { updated: originalRow, original: originalRow };
    });

    if (hasOverallChanges) {
      const fullDataCopy = [...data];
      updatedRows.forEach(({ updated, original }) => {
        if (updated.isCategoryRow) return;
        const idx = fullDataCopy.indexOf(original);
        if (idx !== -1) {
          fullDataCopy[idx] = updated;
        }
      });
      setData(fullDataCopy);
    }
  }, [filteredData, today, data, setData, HISTORY_DAYS, FUTURE_DAYS]);

  // tableData[0] is the synthetic Grand Total row, so tableData[i] <-> filteredData[i - 1].
  const handleCategoryRowEdit = useCallback((originalIndex: number) => {
    const row = filteredData[originalIndex - 1];
    if (row?.isCustomCategory && onRenameCategory) {
      onRenameCategory(row.categoryKey, row.category || row.description || '');
    }
  }, [filteredData, onRenameCategory]);

  const categoryRowIsEditable = useCallback((originalIndex: number) => {
    return !!filteredData[originalIndex - 1]?.isCustomCategory;
  }, [filteredData]);

  const handleCategoryRowDelete = useCallback((originalIndex: number) => {
    const row = filteredData[originalIndex - 1];
    if (row?.isCustomCategory && onDeleteCategory) {
      onDeleteCategory(row.categoryKey, row.category || row.description || '');
    }
  }, [filteredData, onDeleteCategory]);

  const addActivityButton = useMemo(() => {
    if (!onAddCategory) return null;
    return (
      <button
        onClick={onAddCategory}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs sm:text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm h-8"
      >
        <Plus className="w-3 h-3 sm:w-4 sm:h-4" />
        <span className="hidden sm:inline">Add Activity</span>
      </button>
    );
  }, [onAddCategory]);

  const editableColumns = useMemo(() => ["Contractor", ...columns.filter(c => c.includes('Available') || c.includes('Required'))], [columns]);

  const columnTypes = useMemo(() => {
    const types: Record<string, any> = { "Area": "text", "Contractor": "text" };
    columns.slice(FIXED_COL_COUNT).forEach(c => types[c] = "number");
    return types;
  }, [columns]);

  const columnWidths = useMemo(() => {
    const widths: Record<string, number> = { "Area": 200, "Contractor": 140 };
    columns.slice(FIXED_COL_COUNT).forEach(c => {
      if (c.includes("Required")) widths[c] = 110;
      else if (c.includes("Available")) widths[c] = 110;
      else if (c.includes("Gap")) widths[c] = 80;
      else widths[c] = 80;
    });
    return widths;
  }, [columns]);

  const headerStructure = useMemo(() => {
    return [
      [
        { label: "Area", colSpan: 1, rowSpan: 2 },
        { label: "Contractor", colSpan: 1, rowSpan: 2 },
        ...dateSuffixes.map(ds => ({
          label: indianDateFormat(ds), colSpan: COLS_PER_DATE
        }))
      ],
      [
        ...dateSuffixes.flatMap(ds => [
          { label: "Required", colSpan: 1, column: `${indianDateFormat(ds)} - Required` },
          { label: "Available", colSpan: 1, column: `${indianDateFormat(ds)} - Available` },
          { label: "Gap", colSpan: 1, column: `${indianDateFormat(ds)} - Gap` }
        ])
      ]
    ]
  }, [dateSuffixes]);

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
        collapsibleCategories={true}
        fixedColumnsCount={2}
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
        projectId={projectId}
        sheetType="manpower_details_2"
        extraToolbarButton={addActivityButton}
        onRowEdit={onRenameCategory ? handleCategoryRowEdit : undefined}
        onRowDelete={onDeleteCategory ? handleCategoryRowDelete : undefined}
        rowIsEditable={categoryRowIsEditable}
        rowIsDeletable={categoryRowIsEditable}
      />
    </div>
  );
});

