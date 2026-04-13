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
  onPush?: () => void;
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
  onPush,
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
    "M.Plan",
    "M.Achieved",
    "M.Balance",
  ], []);

  const columnWidths = useMemo(() => ({
    "S.No": 55,
    "Description": 250,
    "Scope": 80,
    "Achieved": 90,
    "Balance": 80,
    "W.Plan": 90,
    "W.Achieved": 110,
    "W.Balance": 110,
    "M.Plan": 90,
    "M.Achieved": 110,
    "M.Balance": 110,
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
    "M.Plan": "number" as const,
    "M.Achieved": "number" as const,
    "M.Balance": "number" as const,
  }), []);

  const editableColumns = useMemo(() => [
    "Scope", "Achieved", "W.Plan", "W.Achieved", "M.Plan", "M.Achieved"
  ], []);

  const headerStructure = useMemo(() => [
    [
      { label: "S.No", rowSpan: 2, colSpan: 1 },
      { label: "Description", rowSpan: 2, colSpan: 1 },
      { label: "Scope", rowSpan: 2, colSpan: 1 },
      { label: "Achieved", rowSpan: 2, colSpan: 1 },
      { label: "Balance", rowSpan: 2, colSpan: 1 },
      { label: "Weekly Plan", colSpan: 3, rowSpan: 1 },
      { label: "Monthly Plan", colSpan: 3, rowSpan: 1 },
    ],
    [
      { label: "W.Plan", colSpan: 1, rowSpan: 1 },
      { label: "W.Achieved", colSpan: 1, rowSpan: 1 },
      { label: "W.Balance", colSpan: 1, rowSpan: 1 },
      { label: "M.Plan", colSpan: 1, rowSpan: 1 },
      { label: "M.Achieved", colSpan: 1, rowSpan: 1 },
      { label: "M.Balance", colSpan: 1, rowSpan: 1 },
    ]
  ], []);

  const tableData = useMemo(() => {
    const safeData = Array.isArray(data) ? data : [];
    
    const rows = safeData.map((row) => {
      if (row.isCategoryRow) {
        const arr: any = [
          '', // S.No
          row.description || '',
          '', '', '', '', '', '', '', '', ''
        ];
        (arr as any).isCategoryRow = true;
        return arr;
      }

      return [
        '', // Will fill S.No below
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
      ];
    });

    // Re-calculate S.No for non-category rows
    let sNo = 1;
    rows.forEach(r => {
      if (!(r as any).isCategoryRow) {
        r[0] = String(sNo++);
      }
    });

    // Grand Total Row
    if (rows.length > 0) {
      const totals = [2, 3, 4, 5, 6, 7, 8, 9, 10].map(col =>
        rows.reduce((sum, r) => {
          if ((r as any).isCategoryRow) return sum;
          return sum + (Number(r[col]) || 0);
        }, 0)
      );
      const totalRow: any = [
        "TOTAL", "", ...totals.map(t => String(t || ''))
      ];
      (totalRow as any).isTotalRow = true;
      rows.push(totalRow);
    }

    return rows;
  }, [data]);

  const rowStyles = useMemo(() => {
    const styles: Record<number, any> = {};
    const safeData = Array.isArray(data) ? data : [];
    
    safeData.forEach((row, idx) => {
      if (row.isCategoryRow) {
        styles[idx] = {
          backgroundColor: row.backgroundColor || "#FADFAD",
          fontWeight: "bold",
          isCategoryRow: true,
          color: "#000000"
        };
      }
    });

    // Grand total style
    if (tableData.length > 0) {
      const totalIdx = tableData.length - 1;
      styles[totalIdx] = {
        backgroundColor: "#f1f5f9",
        color: "#0f172a",
        fontWeight: "bold",
        isTotalRow: true,
      };
    }
    return styles;
  }, [data, tableData.length]);

  const handleDataChange = useCallback((newData: any[][]) => {
    const safeData = Array.isArray(data) ? data : [];
    // Filter out both category rows and the Total row from the incoming grid data
    const actualRows = newData.filter(r => !r.isCategoryRow && r[0] !== "TOTAL");
    
    const updated = actualRows.map((row) => {
      // Find the corresponding activity in original data by description
      // Since summary is aggregated, description is our primary key here
      const original = safeData.find(d => d.description === row[1] && !d.isCategoryRow);
      
      const scope = Number(row[2]) || 0;
      const achieved = Number(row[3]) || 0;
      const weeklyPlan = Number(row[5]) || 0;
      const weeklyAchieved = Number(row[6]) || 0;
      const cumulativePlan = Number(row[8]) || 0;
      const cumulativeAchieved = Number(row[9]) || 0;

      return {
        ...(original || {}),
        _cellStatuses: (row as any)._cellStatuses, // Preserve metadata for delta detection
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
    
    // Merge back into full data (preserving category rows)
    const result = [...safeData];
    updated.forEach(u => {
      const idx = result.findIndex(r => r.description === u.description && !r.isCategoryRow);
      if (idx !== -1) result[idx] = { ...result[idx], ...u };
    });

    setData(result);
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
        sheetType="wind_summary"
      />
    </div>
  );
};
