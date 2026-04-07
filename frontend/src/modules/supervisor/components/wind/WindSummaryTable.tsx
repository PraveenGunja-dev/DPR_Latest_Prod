import React, { useMemo, useCallback } from 'react';
import { StyledExcelTable } from "@/components/StyledExcelTable";

// Wind Summary columns:
// S.No, Description, Scope, Achieved(completed), Balance,
// Weekly Plan { Plan, Achieved, Balance },
// Cumulative { Plan, Achieved, Balance }

export interface WindSummaryData {
  sNo: string;
  description: string;
  scope: string;
  achieved: string;
  balance: string;
  weeklyPlan: string;
  weeklyAchieved: string;
  weeklyBalance: string;
  cumulativePlan: string;
  cumulativeAchieved: string;
  cumulativeBalance: string;
  [key: string]: any;
}

interface WindSummaryTableProps {
  data: WindSummaryData[];
  setData: (data: WindSummaryData[]) => void;
  onSave?: () => void;
  onSubmit?: () => void;
  isLocked?: boolean;
  status?: string;
  onExportAll?: () => void;
  projectId?: number;
}

export const WindSummaryTable: React.FC<WindSummaryTableProps> = ({
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
    "Description",
    "Scope",
    "Achieved",
    "Balance",
    "W.Plan",
    "W.Achieved",
    "W.Balance",
    "C.Plan",
    "C.Achieved",
    "C.Balance",
  ], []);

  const columnWidths = useMemo(() => ({
    "S.No": 55,
    "Description": 250,
    "Scope": 80,
    "Achieved": 90,
    "Balance": 80,
    "W.Plan": 80,
    "W.Achieved": 90,
    "W.Balance": 85,
    "C.Plan": 80,
    "C.Achieved": 90,
    "C.Balance": 85,
  }), []);

  const columnTypes = useMemo(() => ({
    "S.No": "text" as const,
    "Description": "text" as const,
    "Scope": "number" as const,
    "Achieved": "number" as const,
    "Balance": "number" as const,
    "W.Plan": "number" as const,
    "W.Achieved": "number" as const,
    "W.Balance": "number" as const,
    "C.Plan": "number" as const,
    "C.Achieved": "number" as const,
    "C.Balance": "number" as const,
  }), []);

  const editableColumns = useMemo(() => [
    "Scope", "Achieved", "W.Plan", "W.Achieved", "C.Plan", "C.Achieved"
  ], []);

  const headerStructure = useMemo(() => [
    [
      { label: "S.No", rowSpan: 2, colSpan: 1 },
      { label: "Description", rowSpan: 2, colSpan: 1 },
      { label: "Scope", rowSpan: 2, colSpan: 1 },
      { label: "Achieved", rowSpan: 2, colSpan: 1 },
      { label: "Balance", rowSpan: 2, colSpan: 1 },
      { label: "Weekly Plan", colSpan: 3, rowSpan: 1 },
      { label: "Cumulative", colSpan: 3, rowSpan: 1 },
    ],
    [
      { label: "W.Plan", colSpan: 1, rowSpan: 1 },
      { label: "W.Achieved", colSpan: 1, rowSpan: 1 },
      { label: "W.Balance", colSpan: 1, rowSpan: 1 },
      { label: "C.Plan", colSpan: 1, rowSpan: 1 },
      { label: "C.Achieved", colSpan: 1, rowSpan: 1 },
      { label: "C.Balance", colSpan: 1, rowSpan: 1 },
    ]
  ], []);

  const tableData = useMemo(() => {
    const safeData = Array.isArray(data) ? data : [];
    const rows = safeData.map((row, index) => [
      String(index + 1),
      row.description || '',
      row.scope || '',
      row.achieved || '',
      row.balance || '',
      row.weeklyPlan || '',
      row.weeklyAchieved || '',
      row.weeklyBalance || '',
      row.cumulativePlan || '',
      row.cumulativeAchieved || '',
      row.cumulativeBalance || '',
    ]);

    // Grand Total Row
    if (rows.length > 0) {
      const totals = [2, 3, 4, 5, 6, 7, 8, 9, 10].map(col =>
        rows.reduce((sum, r) => sum + (Number(r[col]) || 0), 0)
      );
      rows.push([
        "TOTAL", "", ...totals.map(t => String(t || ''))
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
      const scope = Number(row[2]) || 0;
      const achieved = Number(row[3]) || 0;
      const weeklyPlan = Number(row[5]) || 0;
      const weeklyAchieved = Number(row[6]) || 0;
      const cumulativePlan = Number(row[8]) || 0;
      const cumulativeAchieved = Number(row[9]) || 0;

      return {
        ...safeData[index],
        description: row[1] || '',
        scope: String(scope),
        achieved: String(achieved),
        balance: String(Math.max(0, scope - achieved)),
        weeklyPlan: String(weeklyPlan),
        weeklyAchieved: String(weeklyAchieved),
        weeklyBalance: String(Math.max(0, weeklyPlan - weeklyAchieved)),
        cumulativePlan: String(cumulativePlan),
        cumulativeAchieved: String(cumulativeAchieved),
        cumulativeBalance: String(Math.max(0, cumulativePlan - cumulativeAchieved)),
      };
    });
    setData(updated);
  }, [data, setData]);

  return (
    <div className="space-y-4 w-full flex-1 min-h-0 flex flex-col">
      <StyledExcelTable
        title="Wind Project - Summary"
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
        sheetType="wind_summary"
      />
    </div>
  );
};
