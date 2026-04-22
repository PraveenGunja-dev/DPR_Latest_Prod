import React, { useMemo, useCallback, useState } from 'react';
import { StyledExcelTable } from "@/components/StyledExcelTable";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export interface Wind33KVData {
  sNo?: string;
  activityId?: string;
  description: string;
  feeder: string;
  agencyName: string;
  scope: string;
  todayValue: string;
  cumulative: string;
  balance: string;
  [key: string]: any;
}

interface Wind33KVTableProps {
  data: Wind33KVData[];
  setData: (data: Wind33KVData[]) => void;
  onSave?: () => void;
  onSubmit?: () => void;
  isLocked?: boolean;
  status?: string;
  onExportAll?: () => void;
  projectId?: number;
  onPush?: () => void;
}

export const Wind33KVTable: React.FC<Wind33KVTableProps> = ({
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
  const [subSheet, setSubSheet] = useState<'OH' | 'UG'>('OH');

  // Filter activities based on OH/UG sub-sheet
  const filteredData = useMemo(() => {
    const safeData = Array.isArray(data) ? data : [];
    return safeData.filter(d => {
      const desc = (d.description || '').toUpperCase();
      const id = (d.activityId || '').toUpperCase();
      const wbs = (d.wbsName || '').toUpperCase();
      
      const isElectrical = id.includes('-EL') || id.includes('-EE') || wbs.includes('ELECTRICAL');
      if (!isElectrical) return false;

      if (subSheet === 'OH') {
        return desc.includes('OVERHEAD') || desc.includes(' O/H') || desc.includes(' OH ') || id.includes('-OH');
      } else {
        return desc.includes('UNDERGROUND') || desc.includes(' U/G') || desc.includes(' UG ') || id.includes('-UG');
      }
    });
  }, [data, subSheet]);

  const columns = useMemo(() => [
    "S.No",
    "Feeder",
    "Agency Name",
    "Scope",
    "Today",
    "Cumulative",
    "Balance",
  ], []);

  const columnWidths = useMemo(() => ({
    "S.No": 60,
    "Feeder": 150,
    "Agency Name": 200,
    "Scope": 100,
    "Today": 100,
    "Cumulative": 100,
    "Balance": 100,
  }), []);

  const columnTypes = useMemo(() => ({
    "S.No": "text" as const,
    "Feeder": "text" as const,
    "Agency Name": "text" as const,
    "Scope": "number" as const,
    "Today": "number" as const,
    "Cumulative": "number" as const,
    "Balance": "number" as const,
  }), []);

  const editableColumns = useMemo(() => [
    "Agency Name", "Today"
  ], []);

  const tableData = useMemo(() => {
    const rows = filteredData.map((row, index) => {
      const scope = Number(row.scope) || 1; // Default scope 1 if empty
      const cum = Number(row.cumulative) || 0;
      const bal = Math.max(0, scope - cum);

      return [
        String(index + 1),
        row.feeder || row.description || '',
        row.wtgFdnVendor || row.agencyName || '',
        String(scope),
        row.todayValue || '0',
        String(cum),
        String(bal),
      ];
    });

    if (rows.length > 0) {
      const tScope = rows.reduce((sum, r) => sum + (Number(r[3]) || 0), 0);
      const tToday = rows.reduce((sum, r) => sum + (Number(r[4]) || 0), 0);
      const tCum = rows.reduce((sum, r) => sum + (Number(r[5]) || 0), 0);
      const tBal = rows.reduce((sum, r) => sum + (Number(r[6]) || 0), 0);
      
      const totalRow = ["TOTAL", "", "", String(tScope), String(tToday), String(tCum), String(tBal)];
      (totalRow as any).isTotalRow = true;
      rows.push(totalRow);
    }

    return rows;
  }, [filteredData]);

  const rowStyles = useMemo(() => {
    const styles: Record<number, any> = {};
    if (tableData.length > 0) {
      styles[tableData.length - 1] = {
        backgroundColor: "#f1f5f9",
        fontWeight: "bold",
        isTotalRow: true
      };
    }
    return styles;
  }, [tableData]);

  const handleDataChange = useCallback((newData: any[][]) => {
    const updatedActivities = newData.filter(r => !(r as any).isTotalRow).map((row, index) => {
      const originalRow = filteredData[index];
      if (!originalRow) return null;

      return {
        ...originalRow,
        _cellStatuses: (row as any)._cellStatuses,
        agencyName: row[2] || '',
        todayValue: row[4] || '0',
      };
    }).filter(r => r !== null);

    const fullData = [...data];
    updatedActivities.forEach(updated => {
        const idx = fullData.findIndex(d => d.activityId === updated.activityId);
        if (idx !== -1) fullData[idx] = updated;
    });
    
    setData(fullData);
  }, [data, filteredData, setData]);

  return (
    <div className="space-y-4 w-full flex-1 min-h-0 flex flex-col">
      <div className="flex items-center space-x-4 bg-white p-2 rounded-md shadow-sm border">
        <label className="text-sm font-medium text-gray-700">Type:</label>
        <Select value={subSheet} onValueChange={(val: any) => setSubSheet(val)}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Select type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="OH">Overhead (OH)</SelectItem>
            <SelectItem value="UG">Underground (UG)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <StyledExcelTable
        title={`Wind Project - 33KV ${subSheet} Sheet`}
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
        sheetType={`wind_33kv_${subSheet.toLowerCase()}`}
      />
    </div>
  );
};
