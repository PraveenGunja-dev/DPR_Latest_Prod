import React, { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Save } from "lucide-react";
import { StyledExcelTable } from "@/components/StyledExcelTable";
import { StatusChip } from "@/components/StatusChip";

interface DPVendorBlockData {
  activityId: string;
  activities: string;
  plot: string;
  newBlockNom: string;
  priority: string;
  baselinePriority: string;
  contractorName: string;
  scope: string;
  holdDueToWtg: string;
  front: string;
  actual: string;
  completionPercentage: string;
  remarks: string;
  yesterdayValue: string;
  todayValue: string;
  category?: string;
  isCategoryRow?: boolean;
  yesterdayIsApproved?: boolean;
}

interface DPVendorBlockTableProps {
  data: DPVendorBlockData[];
  setData: (data: DPVendorBlockData[]) => void;
  onSave: () => void;
  onSubmit?: () => void;
  yesterday: string;
  today: string;
  isLocked?: boolean;
  status?: 'draft' | 'submitted_to_pm' | 'approved_by_pm' | 'rejected_by_pm' | 'final_approved' | 'approved_by_pmag' | 'archived';

  projectName?: string;
  onExportAll?: () => void;
  totalRows?: number;
  onFullscreenToggle?: (isFullscreen: boolean) => void;
}

export function DPVendorBlockTable({
  data,
  setData,
  onSave,
  onSubmit,
  yesterday,
  today,
  isLocked = false,
  status = 'draft',
  onExportAll,
  totalRows,
  projectName = "Unknown Project",
  onFullscreenToggle
}: DPVendorBlockTableProps) {


  // Define columns
  const columns = [
    "Activity_ID(p6)",
    "Activities(p6)",
    "Plot(p6)",
    "New Block Nom(p6)",
    "Priority(user)",
    "Baseline Priority(p6)",
    "Contractor Name(user)",
    "Scope(user)",
    "Hold Due to WTG(user)",
    "Front(auto)",
    "Actual(auto)",
    "% Completion",
    "Remarks",
    yesterday,
    today
  ];

  // Define column widths for better alignment
  const columnWidths = {
    "Activity_ID(p6)": 40,
    "Activities(p6)": 120,
    "Plot(p6)": 60,
    "New Block Nom(p6)": 80,
    "Priority(user)": 60,
    "Baseline Priority(p6)": 80,
    "Contractor Name(user)": 80,
    "Scope(user)": 60,
    "Hold Due to WTG(user)": 80,
    "Front(auto)": 60,
    "Actual(auto)": 60,
    "% Completion": 60,
    "Remarks": 100,
    [yesterday]: 60,
    [today]: 60
  };

  // Convert array of objects to array of arrays
  const tableData = (Array.isArray(data) ? data : []).map(row => {
    if (row.isCategoryRow) {
      // Category row - only show category in first column, rest empty
      return [
        row.category || '',
        '', '', '', '', '', '', '', '', '', '', '',
        '', ''
      ];
    } else {
      // Activity row - show all data
      return [
        row.activityId,
        row.activities,
        row.plot,
        row.newBlockNom,
        row.priority,
        row.baselinePriority,
        row.contractorName,
        row.scope,
        row.holdDueToWtg,
        row.front,
        row.actual,
        row.completionPercentage,
        row.remarks,
        row.yesterdayValue,
        row.todayValue
      ];
    }
  });

  // Create row styles for category rows
  const rowStyles: Record<number, any> = {};
  const safeData = Array.isArray(data) ? data : [];
  safeData.forEach((row, index) => {
    if (row.isCategoryRow) {
      rowStyles[index] = {
        backgroundColor: '#DFC57B',
        color: '#000000',
        fontWeight: 'bold'
      };
    }
  });

  // Dynamically color cells based on approval status
  const cellTextColors = React.useMemo(() => {
    const colors: Record<number, Record<string, string>> = {};
    const safeData = Array.isArray(data) ? data : [];
    safeData.forEach((row, rowIndex) => {
      if (row.yesterdayIsApproved === false) {
        colors[rowIndex] = {
          [yesterday]: "#ce440d", // Darker orange
          "Actual(auto)": "#ce440d"
        };
      } else if (row.yesterdayIsApproved === true) {
        colors[rowIndex] = {
          [yesterday]: "#16a34a", // Green
          "Actual(auto)": "#16a34a"
        };
      }
    });
    return colors;
  }, [data, yesterday]);

  // Handle data changes from ExcelTable
  const handleDataChange = (newData: any[][]) => {
    // Convert array of arrays back to array of objects
    const updatedData = newData.map((row, index) => {
      const originalRow = data[index];

      if (originalRow?.isCategoryRow) {
        // Category row - preserve category data
        return {
          ...originalRow,
          category: row[0] || ''
        };
      } else {
        // Activity row - update all fields
        const scope = Number(row[7]) || 0;
        const newYesterday = Number(row[13]) || 0;
        const newToday = Number(row[14]) || 0;

        // Calculate Base Actual (Total excluding current today/yesterday)
        const initialActual = Number(originalRow.actual) || 0;
        const initialToday = Number(originalRow.todayValue) || 0;
        const initialYesterday = Number(originalRow.yesterdayValue) || 0;
        const baseActual = initialActual - initialToday - initialYesterday;

        const calculatedActual = baseActual + newYesterday + newToday;
        const calculatedPercentage = scope > 0 ? ((calculatedActual / scope) * 100).toFixed(2) : "0.00";

        return {
          ...originalRow,
          activityId: row[0] || "",
          activities: row[1] || "",
          plot: row[2] || "",
          newBlockNom: row[3] || "",
          priority: row[4] || "",
          baselinePriority: row[5] || "",
          contractorName: row[6] || "",
          scope: String(scope),
          holdDueToWtg: row[8] || "",
          front: row[9] || "",
          actual: String(calculatedActual),
          completionPercentage: calculatedPercentage + "%",
          remarks: row[12] || "",
          yesterdayValue: String(newYesterday),
          todayValue: String(newToday)
        };
      }
    });
    setData(updatedData);
  };

  return (
    <div className="space-y-4 w-full">
      <StyledExcelTable
        title="DP Vendor Block Table"
        columns={columns}
        data={tableData}
        totalRows={totalRows}
        onDataChange={handleDataChange}
        onSave={onSave}
        onSubmit={onSubmit}
        isReadOnly={isLocked}
        editableColumns={["Priority(user)", "Contractor Name(user)", "Scope(user)", "Hold Due to WTG(user)", "Remarks", yesterday, today]}
        columnTypes={{
          "Priority(user)": "text",
          "Contractor Name(user)": "text",
          "Scope(user)": "number",
          "Hold Due to WTG(user)": "text",
          "Front(auto)": "number",
          "Actual(auto)": "number",
          "% Completion": "number",
          [yesterday]: "number",
          [today]: "number"
        }}
        columnWidths={columnWidths}
        cellTextColors={cellTextColors}
        columnTextColors={{
          "% Completion": "#00B050"
        }}
        columnFontWeights={{
          "% Completion": "bold"
        }}
        rowStyles={rowStyles}
        headerStructure={[
          // First header row - main column names
          [
            { label: "Activity_ID(p6)", colSpan: 1 },
            { label: "Activities(p6)", colSpan: 1 },
            { label: "Plot(p6)", colSpan: 1 },
            { label: "New Block Nom(p6)", colSpan: 1 },
            { label: "Priority(user)", colSpan: 1 },
            { label: "Baseline Priority(p6)", colSpan: 1 },
            { label: "Contractor Name(user)", colSpan: 1 },
            { label: "Scope(user)", colSpan: 1 },
            { label: "Hold Due to WTG(user)", colSpan: 1 },
            { label: "Front(auto)", colSpan: 1 },
            { label: "Actual(auto)", colSpan: 1 },
            { label: "% Completion", colSpan: 1 },
            { label: "Remarks", colSpan: 1 },
            { label: yesterday, colSpan: 1 },
            { label: today, colSpan: 1 }
          ]
        ]}
        status={status} // Pass status to StyledExcelTable
        onExportAll={onExportAll}
        onFullscreenToggle={onFullscreenToggle}
      />
    </div>
  );
}
