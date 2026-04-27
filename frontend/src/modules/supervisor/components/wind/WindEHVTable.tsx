import React, { useMemo, useCallback } from 'react';
import { StyledExcelTable } from "@/components/StyledExcelTable";

export interface WindEHVData {
  sNo?: string;
  activityId?: string;
  description: string;
  uom: string;
  scope: string;
  completed: string;
  balance: string;
  [key: string]: any;
}

interface WindEHVTableProps {
  data: WindEHVData[];
  setData: (data: WindEHVData[]) => void;
  onSave?: () => void;
  onSubmit?: () => void;
  isLocked?: boolean;
  status?: string;
  onExportAll?: () => void;
  projectId?: number;
  onPush?: () => void;
}

export const WindEHVTable: React.FC<WindEHVTableProps> = ({
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
  const filteredData = useMemo(() => {
    const safeData = Array.isArray(data) ? data : [];
    return safeData.filter(d => (d.wbsName || '').toUpperCase() === '220KV EHV LINE');
  }, [data]);

  const columns = useMemo(() => [
    "S.No",
    "Description",
    "UOM",
    "Scope",
    "Completed",
    "Balance",
  ], []);

  const columnWidths = useMemo(() => ({
    "S.No": 60,
    "Description": 400,
    "UOM": 100,
    "Scope": 100,
    "Completed": 100,
    "Balance": 100,
  }), []);

  const columnTypes = useMemo(() => ({
    "S.No": "text",
    "Description": "text",
    "UOM": "text",
    "Scope": "number",
    "Completed": "number",
    "Balance": "number",
  }), []);

  const editableColumns = useMemo(() => [
    "Completed"
  ], []);

  const tableData = useMemo(() => {
    return filteredData.map((row, index) => [
      String(index + 1),
      row.description || "",
      row.uom || "",
      String(row.scope || "0"),
      String(row.completed || "0"),
      String(row.balance || "0")
    ]);
  }, [filteredData]);

  const handleDataChange = useCallback((newData: any[][]) => {
    const updated = [...filteredData];
    newData.forEach((row, idx) => {
      if (updated[idx]) {
        updated[idx] = {
          ...updated[idx],
          completed: row[4] || "0",
          balance: String(Number(updated[idx].scope || 0) - Number(row[4] || 0))
        };
      }
    });
    setData(updated);
  }, [filteredData, setData]);

  return (
    <div className="space-y-4 w-full flex-1 min-h-0 flex flex-col">
      <div className="flex-1 min-h-0 bg-white rounded-lg shadow-sm border overflow-hidden">
        <StyledExcelTable
          title="Wind Project - EHV Activities"
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
          status={status}
          onExportAll={onExportAll}
          projectId={projectId}
          sheetType="wind_ehv"
          emptyMessage="No EHV Line Activities found for this project."
        />
      </div>
    </div>
  );
};
