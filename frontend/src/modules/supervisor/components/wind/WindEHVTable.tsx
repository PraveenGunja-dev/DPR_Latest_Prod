import React, { useMemo, useCallback } from 'react';
import { StyledExcelTable } from "@/components/StyledExcelTable";
import { indianDateFormat } from "@/services/dprService";

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
    "Description": 300,
    "UOM": 80,
    "Scope": 100,
    "Completed": 100,
    "Balance": 100,
  }), []);

  const columnTypes = useMemo(() => ({
    "S.No": "text" as const,
    "Description": "text" as const,
    "UOM": "text" as const,
    "Scope": "number" as const,
    "Completed": "number" as const,
    "Balance": "number" as const,
  }), []);

  const editableColumns = useMemo(() => [
    "Completed"
  ], []);

  const tableData = useMemo(() => {
    const rows = filteredData.map((row, index) => {
      const scope = Number(row.scope) || 0;
      const completed = Number(row.completed) || 0;
      const balance = Math.max(0, scope - completed);

      return [
        String(index + 1),
        row.description || '',
        row.uom || 'Nos',
        String(scope),
        String(completed),
        String(balance),
      ];
    });

    return rows;
  }, [filteredData]);

  const rowStyles = useMemo(() => {
    return {};
  }, [tableData]);

  const handleDataChange = useCallback((newData: any[][]) => {
    // Only update the 'completed' field for the rows that were shown
    const updatedActivities = newData.filter(r => !(r as any).isTotalRow).map((row, index) => {
      const originalRow = filteredData[index];
      if (!originalRow) return null;

      const completed = row[4] || '0';
      
      return {
        ...originalRow,
        _cellStatuses: (row as any)._cellStatuses,
        completed: completed,
      };
    }).filter(r => r !== null);

    // Merge back into the original data array
    const fullData = [...data];
    updatedActivities.forEach(updated => {
        const idx = fullData.findIndex(d => d.activityId === updated.activityId);
        if (idx !== -1) fullData[idx] = updated;
    });
    
    setData(fullData);
  }, [data, filteredData, setData]);

  return (
    <div className="space-y-4 w-full flex-1 min-h-0 flex flex-col">
      <StyledExcelTable
        title="Wind Project - EHV Sheet"
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
        rowStyles={rowStyles}
        status={status}
        onExportAll={onExportAll}
        disableAutoHeaderColors={true}
        projectId={projectId}
        sheetType="wind_ehv"
      />
    </div>
  );
};
