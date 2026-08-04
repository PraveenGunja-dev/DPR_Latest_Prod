import React, { useMemo, useCallback, memo } from 'react';
import { StyledExcelTable } from "@/components/StyledExcelTable";

export interface BESSSummaryData {
  activity: string;
  uom: string;
  totalScopeQty: string;
  yesterdayProgress: string;
  todayBasePlan: string;
  todayCatchUpPlan: string;
  todayActual: string;
  cumBasePlan: string;
  cumCatchUpPlan: string;
  cumActual: string;
  remarks: string;
  isCategoryRow?: boolean;
  [key: string]: any;
}

interface BESSSummaryTableProps {
  data: BESSSummaryData[];
  setData: (data: BESSSummaryData[]) => void;
  onSave?: () => void;
  onSubmit?: () => void;
  onPush?: () => void;
  isLocked?: boolean;
  status?: string;
  onExportAll?: () => void;
  projectId?: number;
  sheetType?: string;
  title?: string;
}

const COL = {
  activity: "Activity",
  uom: "UOM",
  scope: "Total Scope Qty",
  yesterday: "Yesterday Progress",
  todayBase: "Today Base Plan",
  todayCatch: "Today Catch Up Plan",
  todayActual: "Today Actual",
  cumBase: "Cumulative Base Plan",
  cumCatch: "Cumulative Catch Up Plan",
  cumActual: "Cumulative Actual",
  deviation: "Deviation Plan vs Actual",
  balance: "Total Scope Balance Qty",
  pct: "% Status as on date",
  remarks: "Remarks",
} as const;

// Column -> row field. Columns absent here are computed and stay read-only.
const FIELD_BY_COL: Record<string, keyof BESSSummaryData> = {
  [COL.activity]: 'activity',
  [COL.uom]: 'uom',
  [COL.scope]: 'totalScopeQty',
  [COL.yesterday]: 'yesterdayProgress',
  [COL.todayBase]: 'todayBasePlan',
  [COL.todayCatch]: 'todayCatchUpPlan',
  [COL.todayActual]: 'todayActual',
  [COL.cumBase]: 'cumBasePlan',
  [COL.cumCatch]: 'cumCatchUpPlan',
  [COL.cumActual]: 'cumActual',
  [COL.remarks]: 'remarks',
};

const num = (v: any) => Number(String(v ?? '').replace(/[, ]/g, '')) || 0;
const show = (n: number) => (n === 0 ? '' : String(Math.round(n * 100) / 100));

export const BESSSummaryTable = memo(({
  data,
  setData,
  onSave,
  onSubmit,
  onPush,
  isLocked = false,
  status = 'draft',
  onExportAll,
  projectId,
  sheetType = 'bess_summary',
  title = "BESS Project - Summary",
}: BESSSummaryTableProps) => {

  const columns = useMemo(() => Object.values(COL) as string[], []);

  const columnWidths = useMemo(() => ({
    [COL.activity]: 300,
    [COL.uom]: 60,
    [COL.scope]: 100,
    [COL.yesterday]: 110,
    [COL.todayBase]: 90,
    [COL.todayCatch]: 95,
    [COL.todayActual]: 85,
    [COL.cumBase]: 90,
    [COL.cumCatch]: 95,
    [COL.cumActual]: 85,
    [COL.deviation]: 110,
    [COL.balance]: 120,
    [COL.pct]: 110,
    [COL.remarks]: 160,
  }), []);

  const columnTypes = useMemo(() => ({
    [COL.activity]: "text" as const,
    [COL.uom]: "text" as const,
    [COL.scope]: "number" as const,
    [COL.yesterday]: "number" as const,
    [COL.todayBase]: "number" as const,
    [COL.todayCatch]: "number" as const,
    [COL.todayActual]: "number" as const,
    [COL.cumBase]: "number" as const,
    [COL.cumCatch]: "number" as const,
    [COL.cumActual]: "number" as const,
    [COL.deviation]: "number" as const,
    [COL.balance]: "number" as const,
    [COL.pct]: "text" as const,
    [COL.remarks]: "text" as const,
  }), []);

  // All Summary data is derived from other sheets (DP Qty / Civil / Electrical / Testing).
  // No cells are editable on this sheet.
  const editableColumns = useMemo(() => [] as string[], []);

  const columnTextColors = useMemo(() => ({
    [COL.todayCatch]: "#2053ab",
    [COL.cumCatch]: "#2053ab",
    [COL.todayActual]: "#00B050",
    [COL.cumActual]: "#00B050",
    [COL.deviation]: "#FF0000",
    [COL.pct]: "#008000",
  }), []);

  // "Today's Qty." and "Cumulative Qty." each span Base Plan / Catch Up Plan / Actual.
  const headerStructure = useMemo(() => [
    [
      { label: "Activity", column: COL.activity, rowSpan: 2, colSpan: 1 },
      { label: "UOM", column: COL.uom, rowSpan: 2, colSpan: 1 },
      { label: "Total Scope Qty", column: COL.scope, rowSpan: 2, colSpan: 1 },
      { label: "Yesterday Progress", column: COL.yesterday, rowSpan: 2, colSpan: 1 },
      { label: "Today's Qty.", colSpan: 3, rowSpan: 1 },
      { label: "Cumulative Qty.", colSpan: 3, rowSpan: 1 },
      { label: "Deviation Plan vs Actual", column: COL.deviation, rowSpan: 2, colSpan: 1 },
      { label: "Total Scope Balance Qty", column: COL.balance, rowSpan: 2, colSpan: 1 },
      { label: "% Status as on date", column: COL.pct, rowSpan: 2, colSpan: 1 },
      { label: "Remarks", column: COL.remarks, rowSpan: 2, colSpan: 1 },
    ],
    [
      { label: "Base Plan", column: COL.todayBase, colSpan: 1, rowSpan: 1 },
      { label: "Catch Up Plan", column: COL.todayCatch, colSpan: 1, rowSpan: 1, textColor: "#3b82f6" },
      { label: "Actual", column: COL.todayActual, colSpan: 1, rowSpan: 1, textColor: "#22c55e" },
      { label: "Base Plan", column: COL.cumBase, colSpan: 1, rowSpan: 1 },
      { label: "Catch Up Plan", column: COL.cumCatch, colSpan: 1, rowSpan: 1, textColor: "#3b82f6" },
      { label: "Actual", column: COL.cumActual, colSpan: 1, rowSpan: 1, textColor: "#22c55e" },
    ],
  ], []);

  const { tableData, rowStyles } = useMemo(() => {
    const safeData = Array.isArray(data) ? data : [];
    const styles: Record<number, any> = {};

    const rows = safeData.map((row, index) => {
      if (row.isCategoryRow) {
        styles[index] = {
          backgroundColor: "#1B4F72",
          color: "#FFFFFF",
          fontWeight: "bold",
          isCategoryRow: true,
        };
        return [row.activity || '', '', '', '', '', '', '', '', '', '', '', '', '', ''];
      }

      const scope = num(row.totalScopeQty);
      const cumActual = num(row.cumActual);
      const cumPlan = num(row.cumBasePlan);

      // Matches the DPR workbook's Summary sheet: L = I-K, M = D-K, N = K/D.
      // Balance is deliberately not clamped at 0 - the workbook lets it go negative.
      const deviation = cumPlan - cumActual;
      const balance = scope - cumActual;
      const pct = scope > 0 ? `${Math.round((cumActual / scope) * 1000) / 10}%` : '';

      return [
        row.activity || '',
        row.uom || '',
        row.totalScopeQty || '',
        row.yesterdayProgress || '',
        row.todayBasePlan || '',
        row.todayCatchUpPlan || '',
        row.todayActual || '',
        row.cumBasePlan || '',
        row.cumCatchUpPlan || '',
        row.cumActual || '',
        show(deviation),
        show(balance),
        pct,
        row.remarks || '',
      ];
    });

    return { tableData: rows, rowStyles: styles };
  }, [data]);

  const handleDataChange = useCallback((newData: any[][]) => {
    const safeData = Array.isArray(data) ? data : [];
    const actualRows = newData.slice(0, safeData.length);
    let hasChanges = false;

    const updated = actualRows.map((row, index) => {
      const original = safeData[index];
      if (original.isCategoryRow) return original;

      const edits: Record<string, any> = {};
      columns.forEach((col, i) => {
        const field = FIELD_BY_COL[col];
        if (field) edits[field] = row[i] || '';
      });

      const changed = Object.keys(edits).some(f => (original[f] || '') !== edits[f])
        || original._cellStatuses !== (row as any)._cellStatuses;
      if (!changed) return original;

      hasChanges = true;
      return { ...original, ...edits, _cellStatuses: (row as any)._cellStatuses };
    });

    if (hasChanges) setData(updated);
  }, [data, setData, columns]);

  return (
    <div className="space-y-4 w-full h-full flex-1 min-h-0 flex flex-col">
      <StyledExcelTable
        title={title}
        columns={columns}
        data={tableData}
        onDataChange={handleDataChange}
        onSave={onSave || (() => {})}
        onSubmit={onSubmit}
        onPush={onPush}
        isReadOnly={isLocked}
        editableColumns={editableColumns}
        columnTypes={columnTypes}
        columnWidths={columnWidths}
        headerStructure={headerStructure}
        rowStyles={rowStyles}
        status={status}
        onExportAll={onExportAll}
        columnTextColors={columnTextColors}
        projectId={projectId}
        sheetType={sheetType}
      />
    </div>
  );
});

