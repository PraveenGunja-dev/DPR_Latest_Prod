import React, { useMemo, useCallback } from 'react';
import { StyledExcelTable } from "@/components/StyledExcelTable";
import { indianDateFormat } from "@/services/dprService";

// PSS Progress Sheet columns:
// S.No, Description, Priority, Duration,
// Plan { Start, Finish }, Actual/Forecast { Start, Finish },
// SO Vendor Name, UOM, Scope, Completed, Balance, Remarks

export interface PSSProgressData {
  sNo?: string;
  description: string;
  priority: string;
  duration: string;
  planStart: string;
  planFinish: string;
  actualForecastStart: string;
  actualForecastFinish: string;
  soVendorName: string;
  uom: string;
  scope: string;
  completed: string;
  balance: string;
  remarks: string;
  status?: string;
  [key: string]: any;
}

interface PSSProgressTableProps {
  data: PSSProgressData[];
  setData: (data: PSSProgressData[]) => void;
  onSave?: () => void;
  onSubmit?: () => void;
  yesterday?: string;
  today?: string;
  isLocked?: boolean;
  status?: string;
  onExportAll?: () => void;
  projectId?: number;
  onPush?: () => void;
}

export const PSSProgressTable: React.FC<PSSProgressTableProps> = ({
  data,
  setData,
  onSave,
  onSubmit,
  isLocked = false,
  onExportAll,
  projectId,
  onPush,
}) => {
  const columns = useMemo(() => [
    "S.No",
    "Description",
    "Status",
    "Priority",
    "Duration",
    "Plan Start",
    "Plan Finish",
    "A/F Start",
    "A/F Finish",
    "SO Vendor Name",
    "UOM",
    "Scope",
    "Completed",
    "Balance",
    "Remarks",
  ], []);

  const columnWidths = useMemo(() => ({
    "S.No": 50,
    "Description": 250,
    "Status": 110,
    "Priority": 80,
    "Duration": 80,
    "Plan Start": 100,
    "Plan Finish": 100,
    "A/F Start": 110,
    "A/F Finish": 110,
    "SO Vendor Name": 160,
    "UOM": 60,
    "Scope": 80,
    "Completed": 90,
    "Balance": 80,
    "Remarks": 180,
  }), []);

  const columnTypes = useMemo(() => ({
    "S.No": "text" as const,
    "Description": "text" as const,
    "Status": "select" as const,
    "Priority": "text" as const,
    "Duration": "text" as const,
    "Plan Start": "text" as const,
    "Plan Finish": "text" as const,
    "A/F Start": "text" as const,
    "A/F Finish": "text" as const,
    "SO Vendor Name": "text" as const,
    "UOM": "text" as const,
    "Scope": "number" as const,
    "Completed": "number" as const,
    "Balance": "number" as const,
    "Remarks": "text" as const,
  }), []);

  const editableColumns = useMemo(() => [
    "Description", "Status", "Priority", "Duration",
    "Plan Start", "Plan Finish", "A/F Start", "A/F Finish",
    "SO Vendor Name", "UOM", "Scope", "Completed", "Remarks"
  ], []);

  const headerStructure = useMemo(() => [
    [
      { label: "S.No", rowSpan: 2, colSpan: 1 },
      { label: "Description", rowSpan: 2, colSpan: 1 },
      { label: "Status", rowSpan: 2, colSpan: 1 },
      { label: "Priority", rowSpan: 2, colSpan: 1 },
      { label: "Duration", rowSpan: 2, colSpan: 1 },
      { label: "Plan", colSpan: 2, rowSpan: 1 },
      { label: "Actual/Forecast", colSpan: 2, rowSpan: 1 },
      { label: "SO Vendor Name", rowSpan: 2, colSpan: 1 },
      { label: "UOM", rowSpan: 2, colSpan: 1 },
      { label: "Scope", rowSpan: 2, colSpan: 1 },
      { label: "Completed", rowSpan: 2, colSpan: 1 },
      { label: "Balance", rowSpan: 2, colSpan: 1 },
      { label: "Remarks", rowSpan: 2, colSpan: 1 },
    ],
    [
      { label: "Plan Start", colSpan: 1, rowSpan: 1 },
      { label: "Plan Finish", colSpan: 1, rowSpan: 1 },
      { label: "A/F Start", colSpan: 1, rowSpan: 1 },
      { label: "A/F Finish", colSpan: 1, rowSpan: 1 },
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
      row.description || '',
      row.status || 'Not Started',
      row.priority || '',
      row.duration || '',
      formatDt(row.planStart),
      formatDt(row.planFinish),
      formatDt(row.actualForecastStart),
      formatDt(row.actualForecastFinish),
      row.soVendorName || '',
      row.uom || '',
      row.scope || '',
      row.completed || '',
      row.balance || '',
      row.remarks || '',
    ]);

    // Grand Total Row
    if (rows.length > 0) {
      const totalScope = rows.reduce((sum, r) => sum + (Number(r[11]) || 0), 0);
      const totalCompleted = rows.reduce((sum, r) => sum + (Number(r[12]) || 0), 0);
      const totalBalance = rows.reduce((sum, r) => sum + (Number(r[13]) || 0), 0);
      rows.push([
        "TOTAL", "", "", "", "", "", "", "", "", "", "",
        String(totalScope || ''),
        String(totalCompleted || ''),
        String(totalBalance || ''),
        ""
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
      const scope = Number(row[11]) || 0;
      const completed = Number(row[12]) || 0;
      return {
        ...safeData[index],
        _cellStatuses: (row as any)._cellStatuses, // Preserve metadata for delta detection
        description: row[1] || '',
        status: row[2] || '',
        priority: row[3] || '',
        duration: row[4] || '',
        planStart: row[5] || '',
        planFinish: row[6] || '',
        actualForecastStart: row[7] || '',
        actualForecastFinish: row[8] || '',
        soVendorName: row[9] || '',
        uom: row[10] || '',
        scope: String(scope),
        completed: String(completed),
        balance: String(Math.max(0, scope - completed)),
        remarks: row[14] || '',
      };
    });
    setData(updated);
  }, [data, setData]);

  return (
    <div className="space-y-4 w-full flex-1 min-h-0 flex flex-col">
      <StyledExcelTable
        title="PSS Project - Progress Sheet"
        columns={columns}
        data={tableData}
        onDataChange={handleDataChange}
        onSave={onSave || (() => {})}
        onSubmit={onSubmit}
        onPush={onPush}
        isReadOnly={isLocked}
        editableColumns={editableColumns}
        columnTypes={columnTypes}
        columnOptions={{ 
          "Status": ["Not Started", "In Progress", "Completed", "On Hold"]
        }}
        columnWidths={columnWidths}
        headerStructure={headerStructure}
        rowStyles={rowStyles}
        status={status}
        onExportAll={onExportAll}
        disableAutoHeaderColors={true}
        columnTextColors={{
          "A/F Start": "#00B050",
          "A/F Finish": "#00B050",
        }}
        columnFontWeights={{
          "A/F Start": "bold",
          "A/F Finish": "bold",
        }}
        projectId={projectId}
        sheetType="pss_progress"
      />
    </div>
  );
};
