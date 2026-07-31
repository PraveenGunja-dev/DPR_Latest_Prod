import React, { useMemo, useCallback, memo } from 'react';
import { StyledExcelTable } from "@/components/StyledExcelTable";
import { indianDateFormat } from "@/services/dprService";

export interface PSSSummaryData {
  description: string;
  duration: string;
  startDate: string;
  endDate: string;
  uom: string;
  scope: string;
  completed: string;
  balance: string;
  actualForecastStart: string;
  actualForecastFinish: string;
  remarks: string;
  [key: string]: any;
}

interface PSSSummaryTableProps {
  data: PSSSummaryData[];
  setData: (data: PSSSummaryData[]) => void;
  onSave?: () => void;
  onSubmit?: () => void;
  isLocked?: boolean;
  status?: string;
  onExportAll?: () => void;
  projectId?: number;
  onPush?: () => void;
}

export const PSSSummaryTable = memo(({
  data,
  setData,
  onSave,
  onSubmit,
  isLocked = false,
  status = 'draft',
  onExportAll,
  projectId,
  onPush,
}: PSSSummaryTableProps) => {
  const columns = useMemo(() => [
    "S.No",
    "Description",
    "Duration",
    "Start Date",
    "End Date",
    "UOM",
    "Scope",
    "Completed",
    "Balance",
    "Actual Start",
    "Actual Finish",
    "Forecast Start",
    "Forecast Finish",
    "Remarks",
  ], []);

  const columnWidths = useMemo(() => ({
    "S.No": 50,
    "Description": 250,
    "Duration": 80,
    "Start Date": 100,
    "End Date": 100,
    "UOM": 60,
    "Scope": 80,
    "Completed": 90,
    "Balance": 80,
    "Actual Start": 100,
    "Actual Finish": 100,
    "Forecast Start": 100,
    "Forecast Finish": 100,
    "Remarks": 180,
  }), []);

  const columnTypes = useMemo(() => ({
    "S.No": "text" as const,
    "Description": "text" as const,
    "Duration": "text" as const,
    "Start Date": "text" as const,
    "End Date": "text" as const,
    "UOM": "text" as const,
    "Scope": "number" as const,
    "Completed": "number" as const,
    "Balance": "number" as const,
    "Actual Start": "text" as const,
    "Actual Finish": "text" as const,
    "Forecast Start": "text" as const,
    "Forecast Finish": "text" as const,
    "Remarks": "text" as const,
  }), []);

  const columnTextColors = useMemo(() => ({
    "Actual Start": "#00B050",
    "Actual Finish": "#00B050",
    "Forecast Start": "#2563eb",
    "Forecast Finish": "#2563eb",
  }), []);

  const columnFontWeights = useMemo(() => ({
    "Actual Start": "bold",
    "Actual Finish": "bold",
    "Forecast Start": "bold",
    "Forecast Finish": "bold",
  }), []);

  const editableColumns = useMemo(() => [
    "Description", "Duration", "Start Date", "End Date", "UOM",
    "Scope", "Completed", "Actual Start", "Actual Finish", "Remarks"
  ], []);

  const headerStructure = useMemo(() => [
    [
      { label: "S.No", column: "S.No", rowSpan: 2, colSpan: 1 },
      { label: "Description", column: "Description", rowSpan: 2, colSpan: 1 },
      { label: "Duration", column: "Duration", rowSpan: 2, colSpan: 1 },
      { label: "Start Date", column: "Start Date", rowSpan: 2, colSpan: 1 },
      { label: "End Date", column: "End Date", rowSpan: 2, colSpan: 1 },
      { label: "UOM", column: "UOM", rowSpan: 2, colSpan: 1 },
      { label: "Scope", column: "Scope", rowSpan: 2, colSpan: 1 },
      { label: "Completed", column: "Completed", rowSpan: 2, colSpan: 1 },
      { label: "Balance", column: "Balance", rowSpan: 2, colSpan: 1 },
      { label: "Actual", colSpan: 2, rowSpan: 1 },
      { label: "Forecast", colSpan: 2, rowSpan: 1 },
      { label: "Remarks", column: "Remarks", rowSpan: 2, colSpan: 1 },
    ],
    [
      { label: "Start", column: "Actual Start", colSpan: 1, rowSpan: 1 },
      { label: "Finish", column: "Actual Finish", colSpan: 1, rowSpan: 1 },
      { label: "Start", column: "Forecast Start", colSpan: 1, rowSpan: 1 },
      { label: "Finish", column: "Forecast Finish", colSpan: 1, rowSpan: 1 },
    ]
  ], []);

  const { tableData, rowStyles } = useMemo(() => {
    const safeData = Array.isArray(data) ? data : [];
    const formatDt = (dt: any) => {
      if (!dt) return '';
      const dtStr = String(dt).split('T')[0];
      return indianDateFormat(dtStr) || dtStr;
    };

    let totalScope = 0;
    let totalCompleted = 0;

    const rows = safeData.map((row, index) => {
      const s = Number(row.scope) || 0;
      const c = Number(row.completed) || 0;
      totalScope += s;
      totalCompleted += c;

      return [
        String(index + 1),
        row.description || (row as any).activities || (row as any).activity || (row as any).activity_name || (row as any).name || (row as any).Name || '',
        row.duration || '',
        formatDt(row.startDate),
        formatDt(row.endDate),
        row.uom || '',
        row.scope || '',
        row.completed || '',
        row.balance || '',
        formatDt(row.actualForecastStart),
        formatDt(row.actualForecastFinish),
        '', // Forecast Start - empty by default for summary
        '', // Forecast Finish - empty by default for summary
        row.remarks || '',
      ];
    });

    const styles: Record<number, any> = {};
    if (rows.length > 0) {
      const totalBalance = Math.max(0, totalScope - totalCompleted);
      rows.push([
        "TOTAL", "", "", "", "", "",
        String(totalScope || ''),
        String(totalCompleted || ''),
        String(totalBalance || ''),
        "", "", "", "", ""
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
      const scope = Number(row[6]) || 0;
      const completed = Number(row[7]) || 0;

      if (
        original.description !== row[1] ||
        original.duration !== row[2] ||
        original.startDate !== row[3] ||
        original.endDate !== row[4] ||
        original.uom !== row[5] ||
        Number(original.scope) !== scope ||
        Number(original.completed) !== completed ||
        original.actualForecastStart !== row[9] ||
        original.actualForecastFinish !== row[10] ||
        original.remarks !== row[13] ||
        original._cellStatuses !== (row as any)._cellStatuses
      ) {
        hasChanges = true;
        return {
          ...original,
          _cellStatuses: (row as any)._cellStatuses,
          description: row[1] || '',
          duration: row[2] || '',
          startDate: row[3] || '',
          endDate: row[4] || '',
          uom: row[5] || '',
          scope: String(scope),
          completed: String(completed),
          balance: String(Math.max(0, scope - completed)),
          actualForecastStart: row[9] || '',
          actualForecastFinish: row[10] || '',
          remarks: row[13] || '',
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
        title="PSS Project - Summary"
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
        columnFontWeights={columnFontWeights}
        projectId={projectId}
        sheetType="pss_summary"
      />
    </div>
  );
});
