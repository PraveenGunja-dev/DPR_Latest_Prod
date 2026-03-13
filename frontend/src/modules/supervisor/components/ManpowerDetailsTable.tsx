import React, { useState, useEffect } from "react";
import { StyledExcelTable } from "@/components/StyledExcelTable";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Save } from "lucide-react";
import { StatusChip } from "@/components/StatusChip";

interface ManpowerDetailsData {
  activityId: string;
  slNo: string;
  block: string;
  contractorName: string;
  activity: string;
  section: string;
  yesterdayValue: string;
  todayValue: string;
  yesterdayIsApproved?: boolean;
}

interface ManpowerDetailsTableProps {
  data: ManpowerDetailsData[];
  setData: (data: ManpowerDetailsData[]) => void;
  totalManpower: number;
  setTotalManpower: (value: number) => void;
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

export function ManpowerDetailsTable({
  data,
  setData,
  totalManpower,
  setTotalManpower,
  onSave,
  onSubmit,
  yesterday,
  today,
  isLocked = false,
  status = 'draft',
  onExportAll,
  totalRows,
  onFullscreenToggle
}: ManpowerDetailsTableProps) {


  // Define columns
  const columns = [
    "Activity_ID",
    "Block",
    "Contractor Name",
    "Activity",
    "Section",
    yesterday,
    today
  ];

  const columnWidths = {
    "Activity_ID": 80,
    "Block": 70,
    "Contractor Name": 120,
    "Activity": 120,
    "Section": 80,
    [yesterday]: 70,
    [today]: 70
  };

  // Convert array of objects to array of arrays
  const tableData = (Array.isArray(data) ? data : []).map(row => [
    row.activityId,
    row.block,
    row.contractorName,
    row.activity,
    row.section,
    row.yesterdayValue,
    row.todayValue
  ]);

  // Dynamically color cells based on approval status
  const cellTextColors = React.useMemo(() => {
    const colors: Record<number, Record<string, string>> = {};
    const safeData = Array.isArray(data) ? data : [];
    safeData.forEach((row, rowIndex) => {
      if (row.yesterdayIsApproved === false) {
        colors[rowIndex] = {
          [yesterday]: "#ce440d" // Darker orange
        };
      } else if (row.yesterdayIsApproved === true) {
        colors[rowIndex] = {
          [yesterday]: "#16a34a" // Green
        };
      }
    });
    return colors;
  }, [data, yesterday]);

  // Handle data changes from ExcelTable
  const handleDataChange = (newData: any[][]) => {
    // Convert array of arrays back to array of objects
    const updatedData = newData.map((row, index) => ({
      ...data[index],
      activityId: row[0] || "",
      slNo: "", // Keep for compatibility but not displayed
      block: row[1] || "",
      contractorName: row[2] || "",
      activity: row[3] || "",
      section: row[4] || "",
      yesterdayValue: row[5] || "",
      todayValue: row[6] || ""
    }));
    setData(updatedData);

    // Recalculate total manpower
    const total = updatedData.reduce((sum, row) => {
      const todayValue = parseInt(row.todayValue) || 0;
      return sum + todayValue;
    }, 0);
    setTotalManpower(total);
  };

  return (
    <div className="space-y-4 w-full">
      <StyledExcelTable
        title="Manpower Details Table"
        columns={columns}
        data={tableData}
        totalRows={totalRows}
        onDataChange={handleDataChange}
        onSave={onSave}
        onSubmit={onSubmit}
        isReadOnly={isLocked}
        editableColumns={[yesterday, today]}
        columnTypes={{
          [yesterday]: "number",
          [today]: "number"
        }}
        columnWidths={columnWidths}
        cellTextColors={cellTextColors}
        headerStructure={[
          // First header row - main column names
          [
            { label: "Activity_ID", colSpan: 1 },
            { label: "Block", colSpan: 1 },
            { label: "Contractor Name", colSpan: 1 },
            { label: "Activity", colSpan: 1 },
            { label: "Section", colSpan: 1 },
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