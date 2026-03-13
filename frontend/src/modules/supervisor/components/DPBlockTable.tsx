import { useState, useEffect } from "react";
import { StyledExcelTable } from "@/components/StyledExcelTable";
import { StatusChip } from "@/components/StatusChip";

interface DPBlockData {
  // Identification
  activityId: string;
  activities: string;

  // Block details (from P6 UDF)
  blockCapacity: string;
  phase: string;
  block: string;
  spvNumber: string;

  // Status fields
  priority: string;
  scope: string;
  hold: string;
  front: string;
  completed: string;
  balance: string;

  // Date fields
  baselineStartDate: string;
  baselineEndDate: string;
  actualStartDate: string;
  actualFinishDate: string;
  forecastStartDate: string;
  forecastFinishDate: string;
  yesterdayIsApproved?: boolean;
}

interface DPBlockTableProps {
  data: DPBlockData[];
  setData: (data: DPBlockData[]) => void;
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

export function DPBlockTable({ data, setData, onSave, onSubmit, yesterday, today, isLocked = false, status = 'draft', onExportAll, totalRows, onFullscreenToggle }: DPBlockTableProps) {


  // Define columns - 18 columns total (no Yesterday/Today)
  const columns = [
    "Activity ID",
    "Activity",
    "Block Capacity (MWac)",
    "Phase",
    "Block",
    "SPV Number",
    "Priority",
    "Scope",
    "Hold",
    "Front",
    "Completed",
    "Balance",
    "Baseline Start",
    "Baseline End",
    "Actual Start",
    "Actual Finish",
    "Forecast Start",
    "Forecast Finish"
  ];

  // Define column widths for better alignment
  const columnWidths = {
    "Activity ID": 80,
    "Activity": 150,
    "Block Capacity (MWac)": 100,
    "Phase": 70,
    "Block": 70,
    "SPV Number": 80,
    "Priority": 70,
    "Scope": 70,
    "Hold": 60,
    "Front": 60,
    "Completed": 80,
    "Balance": 70,
    "Baseline Start": 90,
    "Baseline End": 90,
    "Actual Start": 90,
    "Actual Finish": 90,
    "Forecast Start": 90,
    "Forecast Finish": 90
  };

  // Define which columns are editable by the user
  const editableColumns = [
    "Actual Start",
    "Actual Finish"
  ];

  // Convert array of objects to array of arrays
  const tableData = (Array.isArray(data) ? data : []).map(row => [
    row.activityId || '',
    row.activities || '',
    row.blockCapacity || '',
    row.phase || '',
    row.block || '',
    row.spvNumber || '',
    row.priority || '',
    row.scope || '',
    row.hold || '',
    row.front || '',
    row.completed || '',
    row.balance || '',
    row.baselineStartDate || '',
    row.baselineEndDate || '',
    row.actualStartDate || '',
    row.actualFinishDate || '',
    row.forecastStartDate || '',
    row.forecastFinishDate || ''
  ]);

  // Handle data changes from ExcelTable
  const handleDataChange = (newData: any[][]) => {
    const updatedData = newData.map((row, index) => ({
      ...data[index],
      activityId: row[0] || '',
      activities: row[1] || '',
      blockCapacity: row[2] || '',
      phase: row[3] || '',
      block: row[4] || '',
      spvNumber: row[5] || '',
      priority: row[6] || '',
      scope: row[7] || '',
      hold: row[8] || '',
      front: row[9] || '',
      completed: row[10] || '',
      balance: row[11] || '',
      baselineStartDate: row[12] || '',
      baselineEndDate: row[13] || '',
      actualStartDate: row[14] || '',
      actualFinishDate: row[15] || '',
      forecastStartDate: row[16] || '',
      forecastFinishDate: row[17] || ''
    }));
    setData(updatedData);
  };

  return (
    <div className="space-y-4 w-full">
      <StyledExcelTable
        title="DP Block Table"
        columns={columns}
        data={tableData}
        totalRows={totalRows}
        onDataChange={handleDataChange}
        onSave={onSave}
        onSubmit={onSubmit}
        isReadOnly={isLocked}
        editableColumns={editableColumns}
        columnTypes={{
          "Activity ID": "text",
          "Activity": "text",
          "Block Capacity (MWac)": "text",
          "Phase": "text",
          "Block": "text",
          "SPV Number": "text",
          "Priority": "text",
          "Scope": "number",
          "Hold": "text",
          "Front": "number",
          "Completed": "number",
          "Balance": "number",
          "Baseline Start": "date",
          "Baseline End": "date",
          "Actual Start": "date",
          "Actual Finish": "date",
          "Forecast Start": "date",
          "Forecast Finish": "date"
        }}
        columnWidths={columnWidths}
        columnTextColors={{
          "Actual Start": "#00B050",
          "Actual Finish": "#00B050",
          "Forecast Start": "#0070C0",
          "Forecast Finish": "#0070C0"
        }}
        columnFontWeights={{
          "Actual Start": "bold",
          "Actual Finish": "bold",
          "Forecast Start": "bold",
          "Forecast Finish": "bold"
        }}
        headerStructure={[
          [
            { label: "Activity ID", colSpan: 1 },
            { label: "Activity", colSpan: 1 },
            { label: "Block Capacity (MWac)", colSpan: 1 },
            { label: "Phase", colSpan: 1 },
            { label: "Block", colSpan: 1 },
            { label: "SPV Number", colSpan: 1 },
            { label: "Priority", colSpan: 1 },
            { label: "Scope", colSpan: 1 },
            { label: "Hold", colSpan: 1 },
            { label: "Front", colSpan: 1 },
            { label: "Completed", colSpan: 1 },
            { label: "Balance", colSpan: 1 },
            { label: "Baseline Start", colSpan: 1 },
            { label: "Baseline End", colSpan: 1 },
            { label: "Actual Start", colSpan: 1 },
            { label: "Actual Finish", colSpan: 1 },
            { label: "Forecast Start", colSpan: 1 },
            { label: "Forecast Finish", colSpan: 1 }
          ]
        ]}
        status={status}
        onExportAll={onExportAll}
        onFullscreenToggle={onFullscreenToggle}
      />
    </div>
  );
}