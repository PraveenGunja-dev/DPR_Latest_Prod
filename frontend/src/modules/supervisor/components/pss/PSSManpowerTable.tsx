import React, { useMemo, useCallback } from 'react';
import { StyledExcelTable } from "@/components/StyledExcelTable";
import { indianDateFormat } from "@/services/dprService";

// PSS Manpower columns:
// Sr.No, Description, Areas, Department, Completed (Cumulative), Today

export interface PSSManpowerData {
  sNo?: string;
  description: string;
  areas: string;
  department: string;
  completedCumulative: string;
  today: string;
  [key: string]: any;
}

interface PSSManpowerTableProps {
  data: PSSManpowerData[];
  setData: (data: PSSManpowerData[]) => void;
  onSave?: () => void;
  onSubmit?: () => void;
  yesterday?: string;
  todayDate?: string;
  isLocked?: boolean;
  status?: string;
  onExportAll?: () => void;
  projectId?: number;
}

export const PSSManpowerTable: React.FC<PSSManpowerTableProps> = ({
  data,
  setData,
  onSave,
  onSubmit,
  todayDate,
  isLocked = false,
  status = 'draft',
  onExportAll,
  projectId,
}) => {
  const todayLabel = todayDate ? indianDateFormat(todayDate) : 'Today';

  const columns = useMemo(() => [
    "Sr.No",
    "Description",
    "Areas",
    "Department",
    "Completed (Cumulative)",
    todayLabel,
  ], [todayLabel]);

  const columnWidths = useMemo(() => ({
    "Sr.No": 55,
    "Description": 250,
    "Areas": 180,
    "Department": 160,
    "Completed (Cumulative)": 150,
    [todayLabel]: 100,
  }), [todayLabel]);

  const columnTypes = useMemo(() => ({
    "Sr.No": "text" as const,
    "Description": "text" as const,
    "Areas": "text" as const,
    "Department": "text" as const,
    "Completed (Cumulative)": "number" as const,
    [todayLabel]: "number" as const,
  }), [todayLabel]);

  const editableColumns = useMemo(() => [
    "Description", "Areas", "Department", "Completed (Cumulative)", todayLabel
  ], [todayLabel]);

  const headerStructure = useMemo(() => [
    [
      { label: "Sr.No", colSpan: 1 },
      { label: "Description", colSpan: 1 },
      { label: "Areas", colSpan: 1 },
      { label: "Department", colSpan: 1 },
      { label: "Completed (Cumulative)", colSpan: 1 },
      { label: todayLabel, colSpan: 1 },
    ]
  ], [todayLabel]);

  const tableData = useMemo(() => {
    const safeData = Array.isArray(data) ? data : [];
    const rows = safeData.map((row, index) => [
      String(index + 1),
      row.description || '',
      row.areas || '',
      row.department || '',
      row.completedCumulative || '',
      row.today || '',
    ]);

    // Grand Total Row
    if (rows.length > 0) {
      const totalCumulative = rows.reduce((sum, r) => sum + (Number(r[4]) || 0), 0);
      const totalToday = rows.reduce((sum, r) => sum + (Number(r[5]) || 0), 0);
      rows.push([
        "TOTAL", "", "", "",
        String(totalCumulative || ''),
        String(totalToday || ''),
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
    const updated = actualRows.map((row, index) => ({
      ...safeData[index],
      description: row[1] || '',
      areas: row[2] || '',
      department: row[3] || '',
      completedCumulative: row[4] || '',
      today: row[5] || '',
    }));
    setData(updated);
  }, [data, setData]);

  return (
    <div className="space-y-4 w-full flex-1 min-h-0 flex flex-col">
      <StyledExcelTable
        title="PSS Project - Manpower"
        columns={columns}
        data={tableData}
        onDataChange={handleDataChange}
        onSave={onSave || (() => {})}
        onSubmit={onSubmit}
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
        sheetType="pss_manpower"
      />
    </div>
  );
};
