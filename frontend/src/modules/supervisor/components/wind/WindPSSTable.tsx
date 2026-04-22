import React, { useMemo, useCallback } from 'react';
import { StyledExcelTable } from "@/components/StyledExcelTable";
import { indianDateFormat } from "@/services/dprService";

export interface WindPSSData {
  sNo?: string;
  activityId?: string;
  description: string;
  priority: string;
  duration: string;
  baselineStart: string;
  baselineFinish: string;
  actualStart: string;
  actualFinish: string;
  forecastStart: string;
  forecastFinish: string;
  vendorName: string;
  uom: string;
  planTillDate: string;
  actualTillDate: string;
  balance: string;
  [key: string]: any;
}

interface WindPSSTableProps {
  data: WindPSSData[];
  setData: (data: WindPSSData[]) => void;
  onSave?: () => void;
  onSubmit?: () => void;
  isLocked?: boolean;
  status?: string;
  onExportAll?: () => void;
  projectId?: number;
  onPush?: () => void;
}

export const WindPSSTable: React.FC<WindPSSTableProps> = ({
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
    "Priority",
    "Duration",
    "Baseline Start",
    "Baseline Finish",
    "Actual Start",
    "Actual Finish",
    "Forecast Start",
    "Forecast Finish",
    "Vendor Name",
    "UOM",
    "Plan till date",
    "Actual till date",
    "Balance",
  ], []);

  const columnWidths = useMemo(() => ({
    "S.No": 60,
    "Description": 250,
    "Priority": 80,
    "Duration": 80,
    "Baseline Start": 110,
    "Baseline Finish": 110,
    "Actual Start": 110,
    "Actual Finish": 110,
    "Forecast Start": 110,
    "Forecast Finish": 110,
    "Vendor Name": 160,
    "UOM": 60,
    "Plan till date": 120,
    "Actual till date": 120,
    "Balance": 100,
  }), []);

  const columnTypes = useMemo(() => ({
    "S.No": "text" as const,
    "Description": "text" as const,
    "Priority": "text" as const,
    "Duration": "text" as const,
    "Baseline Start": "text" as const,
    "Baseline Finish": "text" as const,
    "Actual Start": "date" as const,
    "Actual Finish": "date" as const,
    "Forecast Start": "date" as const,
    "Forecast Finish": "date" as const,
    "Vendor Name": "text" as const,
    "UOM": "text" as const,
    "Plan till date": "number" as const,
    "Actual till date": "number" as const,
    "Balance": "number" as const,
  }), []);

  const editableColumns = useMemo(() => [
    "Actual Start", "Actual Finish", "Forecast Start", "Forecast Finish", "Actual till date"
  ], []);

  const headerStructure = useMemo(() => [
    [
      { label: "S.No", rowSpan: 2, colSpan: 1 },
      { label: "Description", rowSpan: 2, colSpan: 1 },
      { label: "Priority", rowSpan: 2, colSpan: 1 },
      { label: "Duration", rowSpan: 2, colSpan: 1 },
      { label: "Baseline", colSpan: 2, rowSpan: 1 },
      { label: "Actual", colSpan: 2, rowSpan: 1 },
      { label: "Forecast", colSpan: 2, rowSpan: 1 },
      { label: "Vendor Name", rowSpan: 2, colSpan: 1 },
      { label: "UOM", rowSpan: 2, colSpan: 1 },
      { label: "Material till date", colSpan: 2, rowSpan: 1 },
      { label: "Balance", rowSpan: 2, colSpan: 1 },
    ],
    [
      { label: "Start", colSpan: 1, rowSpan: 1 },
      { label: "Finish", colSpan: 1, rowSpan: 1 },
      { label: "Start", colSpan: 1, rowSpan: 1 },
      { label: "Finish", colSpan: 1, rowSpan: 1 },
      { label: "Start", colSpan: 1, rowSpan: 1 },
      { label: "Finish", colSpan: 1, rowSpan: 1 },
      { label: "Plan", colSpan: 1, rowSpan: 1 },
      { label: "Actual", colSpan: 1, rowSpan: 1 },
    ]
  ], []);

  const tableData = useMemo(() => {
    const safeData = Array.isArray(data) ? data : [];
    const formatDt = (dt: any) => {
      if (!dt) return '';
      const dtStr = String(dt).split('T')[0];
      return indianDateFormat(dtStr) || dtStr;
    };

    const rows = safeData.map((row, index) => {
      const planVal = Number(row.planTillDate) || 0;
      const actualVal = Number(row.actualTillDate) || 0;
      const balance = Math.max(0, planVal - actualVal);

      return [
        String(index + 1),
        row.description || '',
        row.priority || '',
        row.duration || '',
        formatDt(row.baselineStart),
        formatDt(row.baselineFinish),
        formatDt(row.actualStart),
        formatDt(row.actualFinish),
        formatDt(row.forecastStart),
        formatDt(row.forecastFinish),
        row.vendorName || row.soVendorName || '',
        row.uom || 'Nos',
        String(planVal),
        String(actualVal),
        String(balance),
      ];
    });

    if (rows.length > 0) {
      const tPlan = rows.reduce((sum, r) => sum + (Number(r[12]) || 0), 0);
      const tActual = rows.reduce((sum, r) => sum + (Number(r[13]) || 0), 0);
      const tBalance = rows.reduce((sum, r) => sum + (Number(r[14]) || 0), 0);
      
      const totalRow = ["TOTAL", "", "", "", "", "", "", "", "", "", "", "", String(tPlan), String(tActual), String(tBalance)];
      (totalRow as any).isTotalRow = true;
      rows.push(totalRow);
    }

    return rows;
  }, [data]);

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
    const updated = newData.filter(r => !(r as any).isTotalRow).map((row, index) => {
      const original = (data as any[])[index];
      if (!original) return null;

      return {
        ...original,
        _cellStatuses: (row as any)._cellStatuses,
        actualStart: row[6] || '',
        actualFinish: row[7] || '',
        forecastStart: row[8] || '',
        forecastFinish: row[9] || '',
        actualTillDate: row[13] || '0',
      };
    }).filter(r => r !== null);

    setData(updated);
  }, [data, setData]);

  return (
    <div className="space-y-4 w-full flex-1 min-h-0 flex flex-col">
      <StyledExcelTable
        title="Wind Project - PSS Progress Sheet"
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
        sheetType="wind_pss"
      />
    </div>
  );
};
