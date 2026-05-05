import React, { useMemo, useCallback, memo } from 'react';
import { StyledExcelTable } from "@/components/StyledExcelTable";

export interface PSSTransmissionVisualData {
  activityObjectId?: number;
  activityId?: string;
  description: string;
  uom: string;
  totalQuantity: string;
  completed: string;
  wip: string;
  balance: string;
  status?: string;
  [key: string]: any;
}

interface PSSTransmissionVisualTableProps {
  data: PSSTransmissionVisualData[];
  setData: (data: PSSTransmissionVisualData[]) => void;
  onSave?: () => void;
  onSubmit?: () => void;
  isLocked?: boolean;
  status?: string;
  onExportAll?: () => void;
  projectId?: number;
  onPush?: () => void;
}

export const PSSTransmissionVisualTable = memo(({
  data,
  setData,
  onSave,
  onSubmit,
  isLocked = false,
  status = 'draft',
  onExportAll,
  projectId,
  onPush,
}: PSSTransmissionVisualTableProps) => {
  const columns = useMemo(() => [
    "S.No",
    "Description",
    "UOM",
    "Total Quantity",
    "Completed",
    "WIP",
    "Balance",
  ], []);

  const columnWidths = useMemo(() => ({
    "S.No": 60,
    "Description": 350,
    "UOM": 80,
    "Total Quantity": 120,
    "Completed": 120,
    "WIP": 80,
    "Balance": 120,
  }), []);

  const columnTypes = useMemo(() => ({
    "S.No": "text" as const,
    "Description": "text" as const,
    "UOM": "text" as const,
    "Total Quantity": "number" as const,
    "Completed": "number" as const,
    "WIP": "text" as const,
    "Balance": "number" as const,
  }), []);

  const editableColumns = useMemo(() => [
    "Description", "UOM", "Total Quantity", "Completed", "WIP", "Balance"
  ], []);

  const headerStructure = useMemo(() => [
    [
      { label: "S.No", colSpan: 1 },
      { label: "Description", colSpan: 1 },
      { label: "UOM", colSpan: 1 },
      { label: "Total Quantity", colSpan: 1 },
      { label: "Completed", colSpan: 1 },
      { label: "WIP", colSpan: 1 },
      { label: "Balance", colSpan: 1 },
    ]
  ], []);

  const { tableData, rowStyles } = useMemo(() => {
    const safeData = Array.isArray(data) ? data : [];
    let totalQty = 0;
    let totalCompleted = 0;
    let totalBalance = 0;

    const rows = safeData.map((row, index) => {
      const qty = Number(row.totalQuantity) || 0;
      const comp = Number(row.completed) || 0;
      const bal = Number(row.balance) || 0;
      totalQty += qty;
      totalCompleted += comp;
      totalBalance += bal;

      return [
        String(index + 1),
        row.description || '',
        row.uom || '',
        qty ? String(qty) : '',
        comp ? String(comp) : '',
        row.wip === '1' || row.wip === 1 ? 'Yes' : '',
        bal ? String(bal) : '',
      ];
    });

    const styles: Record<number, any> = {};
    if (rows.length > 0) {
      rows.push([
        "TOTAL", "", "",
        String(totalQty || ''),
        String(totalCompleted || ''),
        "",
        String(totalBalance || ''),
      ]);
      styles[rows.length - 1] = {
        backgroundColor: "#f1f5f9",
        color: "#0f172a",
        fontWeight: "bold",
        isTotalRow: true,
      };
    }

    return { tableData: rows, rowStyles: styles };
  }, [data]);

  const handleDataChange = useCallback((newData: any[][]) => {
    const safeData = Array.isArray(data) ? data : [];
    const actualRows = newData.slice(0, safeData.length);
    let hasChanges = false;

    const updated = actualRows.map((row, index) => {
      const original = safeData[index];
      const qty = Number(row[3]) || 0;
      const comp = Number(row[4]) || 0;

      if (
        original.description !== row[1] ||
        original.uom !== row[2] ||
        Number(original.totalQuantity) !== qty ||
        Number(original.completed) !== comp ||
        original.wip !== row[5] ||
        original._cellStatuses !== (row as any)._cellStatuses
      ) {
        hasChanges = true;
        return {
          ...original,
          _cellStatuses: (row as any)._cellStatuses,
          description: row[1] || '',
          uom: row[2] || '',
          totalQuantity: String(qty),
          completed: String(comp),
          wip: row[5] || '',
          balance: String(Math.max(0, qty - comp)),
        };
      }
      return original;
    });

    if (hasChanges) {
      setData(updated);
    }
  }, [data, setData]);

  return (
    <div className="space-y-4 w-full flex-1 min-h-0 flex flex-col">
      <StyledExcelTable
        title="400KV Transmission Visual Chart"
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
        disableAutoHeaderColors={true}
        projectId={projectId}
        sheetType="pss_tl_visual"
      />
    </div>
  );
});
