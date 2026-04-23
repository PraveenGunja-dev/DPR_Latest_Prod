import React, { useMemo, useCallback } from 'react';
import { StyledExcelTable } from "@/components/StyledExcelTable";
import { indianDateFormat } from "@/services/dprService";

// PSS Summary columns:
// Description, Duration, Start Date, End Date, UOM, Scope, Completed, Balance,
// Actual/Forecast Start, Actual/Forecast Finish, Remarks

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

export const PSSSummaryTable: React.FC<PSSSummaryTableProps> = ({
  data,
  setData,
  onSave,
  onSubmit,
  isLocked = false,
  status = 'draft',
  onExportAll,
  projectId,
  onPush,
}) => {
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
    "Actual/Forecast Start",
    "Actual/Forecast Finish",
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
    "Actual/Forecast Start": 130,
    "Actual/Forecast Finish": 130,
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
    "Actual/Forecast Start": "text" as const,
    "Actual/Forecast Finish": "text" as const,
    "Remarks": "text" as const,
  }), []);

  const editableColumns = useMemo(() => [
    "Description", "Duration", "Start Date", "End Date", "UOM",
    "Scope", "Completed", "Actual/Forecast Start", "Actual/Forecast Finish", "Remarks"
  ], []);

  const headerStructure = useMemo(() => [
    [
      { label: "S.No", colSpan: 1 },
      { label: "Description", colSpan: 1 },
      { label: "Duration", colSpan: 1 },
      { label: "Start Date", colSpan: 1 },
      { label: "End Date", colSpan: 1 },
      { label: "UOM", colSpan: 1 },
      { label: "Scope", colSpan: 1 },
      { label: "Completed", colSpan: 1 },
      { label: "Balance", colSpan: 1 },
      { label: "Actual/Forecast Start", colSpan: 1 },
      { label: "Actual/Forecast Finish", colSpan: 1 },
      { label: "Remarks", colSpan: 1 },
    ]
  ], []);

  const tableData = useMemo(() => {
    const safeData = Array.isArray(data) ? data : [];
    const formatDt = (dt: any) => {
      if (!dt) return '';
      const dtStr = String(dt).split('T')[0];
      return indianDateFormat(dtStr) || dtStr;
    };

    const rows = safeData.map((row, index) => [
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
      row.remarks || '',
    ]);

    // Grand Total Row
    if (rows.length > 0) {
      const totalScope = rows.reduce((sum, r) => sum + (Number(r[6]) || 0), 0);
      const totalCompleted = rows.reduce((sum, r) => sum + (Number(r[7]) || 0), 0);
      const totalBalance = rows.reduce((sum, r) => sum + (Number(r[8]) || 0), 0);
      rows.push([
        "TOTAL", "", "", "", "", "",
        String(totalScope || ''),
        String(totalCompleted || ''),
        String(totalBalance || ''),
        "", "", ""
      ]);
    }

    return rows;
  }, [data]);

  const rowStyles = useMemo(() => {
    const styles: Record<number, any> = {};
    const safeData = Array.isArray(data) ? data : [];
    if (safeData.length > 0) {
      styles[safeData.length] = {
        backgroundColor: "#f1f5f9",
        color: "#0f172a",
        fontWeight: "bold",
        isTotalRow: true,
      };
    }
    return styles;
  }, [data]);

  const handleDataChange = useCallback((newData: any[][]) => {
    const safeData = Array.isArray(data) ? data : [];
    const actualRows = newData.slice(0, safeData.length);
    const updated = actualRows.map((row, index) => {
      const scope = Number(row[6]) || 0;
      const completed = Number(row[7]) || 0;
      return {
        ...safeData[index],
        _cellStatuses: (row as any)._cellStatuses, // Preserve metadata for delta detection
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
        remarks: row[11] || '',
      };
    });
    setData(updated);
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
        disableAutoHeaderColors={true}
        columnTextColors={{
          "Actual/Forecast Start": "#00B050",
          "Actual/Forecast Finish": "#00B050",
        }}
        columnFontWeights={{
          "Actual/Forecast Start": "bold",
          "Actual/Forecast Finish": "bold",
        }}
        projectId={projectId}
        sheetType="pss_summary"
      />
    </div>
  );
};
