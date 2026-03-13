import React, { useState, useEffect } from "react";
import { StyledExcelTable } from "@/components/StyledExcelTable";
import { StatusChip } from "@/components/StatusChip";

interface DPVendorIdtData {
  // From P6 API
  activityId: string;
  activities: string;
  plot: string;
  newBlockNom: string;
  baselinePriority: string;
  scope: string;
  front: string;

  // User-editable fields
  priority: string;
  contractorName: string;
  remarks: string;

  // Calculated fields
  actual: string;
  completionPercentage: string;

  // Date values
  yesterdayValue?: string; // Number value, not editable
  todayValue?: string; // Number value, editable

  category?: string;
  isCategoryRow?: boolean;
  yesterdayIsApproved?: boolean;
}
interface DPVendorIdtTableProps {
  data: DPVendorIdtData[];
  setData: (data: DPVendorIdtData[]) => void;
  onSave: () => void;
  onSubmit?: () => void;
  yesterday: string;
  today: string;
  isLocked?: boolean;
  status?: 'draft' | 'submitted_to_pm' | 'approved_by_pm' | 'rejected_by_pm' | 'final_approved' | 'approved_by_pmag' | 'archived';

  onExportAll?: () => void;
  totalRows?: number;
  onFullscreenToggle?: (isFullscreen: boolean) => void;
}

export function DPVendorIdtTable({
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
  onFullscreenToggle
}: DPVendorIdtTableProps) {


  // Define columns
  const columns = [
    "Activity ID",
    "Activities",
    "Plot",
    "New Block Nom",
    "Priority",
    "Baseline Priority",
    "Contractor Name",
    "Scope",
    "Front",
    "Actual",
    "% Completion",
    "Remarks",
    yesterday,
    today
  ];

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
        row.activityId || '',
        row.activities || '',
        row.plot || '',
        row.newBlockNom || '',
        row.priority || '',
        row.baselinePriority || '',
        row.contractorName || '',
        row.scope || '',
        row.front || '',
        row.actual || '',
        row.completionPercentage || '',
        row.remarks || '',
        row.yesterdayValue || '', // Number value for yesterday
        row.todayValue || '' // Number value for today (editable)
      ];
    }
  });

  // Create row styles for category rows
  const rowStyles: Record<number, any> = {};
  const safeData = Array.isArray(data) ? data : [];
  safeData.forEach((row, index) => {
    if (row.isCategoryRow) {
      rowStyles[index] = {
        backgroundColor: '#49415B',
        color: '#ffffff',
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
          "Actual": "#ce440d"
        };
      } else if (row.yesterdayIsApproved === true) {
        colors[rowIndex] = {
          [yesterday]: "#16a34a", // Green
          "Actual": "#16a34a"
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
        const newYesterday = Number(row[12]) || 0;
        const newToday = Number(row[13]) || 0;

        // Calculate Base Actual (Total excluding current today/yesterday)
        const initialActual = Number(originalRow.actual) || 0;
        const initialToday = Number(originalRow.todayValue) || 0;
        const initialYesterday = Number(originalRow.yesterdayValue) || 0;
        const baseActual = initialActual - initialToday - initialYesterday;

        const calculatedActual = baseActual + newYesterday + newToday;
        const calculatedPercentage = scope > 0 ? ((calculatedActual / scope) * 100).toFixed(2) : "0.00";

        return {
          ...originalRow,
          activityId: row[0] || '',
          activities: row[1] || '',
          plot: row[2] || '',
          newBlockNom: row[3] || '',
          priority: row[4] || '',
          baselinePriority: row[5] || '',
          contractorName: row[6] || '',
          scope: String(scope),
          front: row[8] || '',
          actual: String(calculatedActual),
          completionPercentage: calculatedPercentage + "%",
          remarks: row[11] || '',
          yesterdayValue: String(newYesterday),
          todayValue: String(newToday)
        };
      }
    });
    setData(updatedData);
  };

  // Define which columns are editable
  const editableColumns = [
    "Priority",
    "Contractor Name",
    "Scope",
    "Front",
    "Remarks",
    yesterday, // Yesterday's value is now editable
    today
  ];

  // Define column types
  const columnTypes: Record<string, 'text' | 'number' | 'date'> = {
    "Activity ID": "text",
    "Activities": "text",
    "Plot": "text",
    "New Block Nom": "text",
    "Priority": "text",
    "Baseline Priority": "text",
    "Contractor Name": "text",
    "Scope": "number",
    "Front": "number",
    "Actual": "number",
    "% Completion": "number",
    "Remarks": "text",
    [yesterday]: "number",
    [today]: "number"
  };

  // Define column widths for better alignment
  const columnWidths = {
    "Activity ID": 40,
    "Activities": 120,
    "Plot": 60,
    "New Block Nom": 80,
    "Priority": 60,
    "Baseline Priority": 80,
    "Contractor Name": 80,
    "Scope": 60,
    "Front": 60,
    "Actual": 60,
    "% Completion": 60,
    "Remarks": 100,
    [yesterday]: 60,
    [today]: 60
  };

  return (
    <div className="space-y-2 w-full">
      <StyledExcelTable
        title="DP Vendor IDT Table"
        columns={columns}
        data={tableData}
        totalRows={totalRows}
        onDataChange={handleDataChange}
        onSave={onSave}
        onSubmit={onSubmit}
        isReadOnly={isLocked}
        editableColumns={editableColumns}
        columnTypes={columnTypes}
        columnWidths={columnWidths}
        cellTextColors={cellTextColors}
        columnTextColors={{
          "% Completion": "#74DB4B"
        }}
        columnFontWeights={{
          "% Completion": "bold"
        }}
        rowStyles={rowStyles}
        headerStructure={[
          // First header row - main column names
          [
            { label: "Activity ID", colSpan: 1 },
            { label: "Activities", colSpan: 1 },
            { label: "Plot", colSpan: 1 },
            { label: "New Block Nom", colSpan: 1 },
            { label: "Priority", colSpan: 1 },
            { label: "Baseline Priority", colSpan: 1 },
            { label: "Contractor Name", colSpan: 1 },
            { label: "Scope", colSpan: 1 },
            { label: "Front", colSpan: 1 },
            { label: "Actual", colSpan: 1 },
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