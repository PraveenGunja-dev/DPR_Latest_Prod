import React, { useMemo, useCallback } from 'react';
import { StyledExcelTable } from "@/components/StyledExcelTable";
import { indianDateFormat } from "@/services/dprService";

// Wind Manpower columns:
// S.No, Contractor Name, Type of Contract, Area, Manpower Details

export interface WindManpowerData {
  sNo?: string;
  contractorName: string;
  typeOfContract: string;
  area: string;
  manpowerDetails: string;
  [key: string]: any;
}

interface WindManpowerTableProps {
  data: WindManpowerData[];
  setData: (data: WindManpowerData[]) => void;
  onSave?: () => void;
  onSubmit?: () => void;
  yesterday?: string;
  today?: string;
  isLocked?: boolean;
  status?: string;
  onExportAll?: () => void;
  projectId?: number;
}

export const WindManpowerTable: React.FC<WindManpowerTableProps> = ({
  data,
  setData,
  onSave,
  onSubmit,
  isLocked = false,
  status = 'draft',
  onExportAll,
  projectId,
}) => {
  const columns = useMemo(() => [
    "S.No",
    "Contractor Name",
    "Type of Contract",
    "Area",
    "Manpower Details",
  ], []);

  const columnWidths = useMemo(() => ({
    "S.No": 55,
    "Contractor Name": 220,
    "Type of Contract": 180,
    "Area": 180,
    "Manpower Details": 200,
  }), []);

  const columnTypes = useMemo(() => ({
    "S.No": "text" as const,
    "Contractor Name": "text" as const,
    "Type of Contract": "text" as const,
    "Area": "text" as const,
    "Manpower Details": "text" as const,
  }), []);

  const editableColumns = useMemo(() => [
    "Contractor Name", "Type of Contract", "Area", "Manpower Details"
  ], []);

  const headerStructure = useMemo(() => [
    [
      { label: "S.No", colSpan: 1 },
      { label: "Contractor Name", colSpan: 1 },
      { label: "Type of Contract", colSpan: 1 },
      { label: "Area", colSpan: 1 },
      { label: "Manpower Details", colSpan: 1 },
    ]
  ], []);

  const tableData = useMemo(() => {
    const safeData = Array.isArray(data) ? data : [];
    const rows = safeData.map((row, index) => [
      String(index + 1),
      row.contractorName || '',
      row.typeOfContract || '',
      row.area || '',
      row.manpowerDetails || '',
    ]);

    // Grand Total Row
    if (rows.length > 0) {
      const totalManpower = rows.reduce((sum, r) => sum + (Number(r[4]) || 0), 0);
      rows.push([
        "TOTAL", "", "", "", String(totalManpower || '')
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
      contractorName: row[1] || '',
      typeOfContract: row[2] || '',
      area: row[3] || '',
      manpowerDetails: row[4] || '',
    }));
    setData(updated);
  }, [data, setData]);

  return (
    <div className="space-y-4 w-full flex-1 min-h-0 flex flex-col">
      <StyledExcelTable
        title="Wind Project - Manpower"
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
        sheetType="wind_manpower"
      />
    </div>
  );
};
