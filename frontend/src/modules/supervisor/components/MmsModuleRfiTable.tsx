import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Save } from "lucide-react";
import { StyledExcelTable } from "@/components/StyledExcelTable";
import { StatusChip } from "@/components/StatusChip";

interface MmsModuleRfiData {
  rfiNo: string;
  subject: string;
  module: string;
  submittedDate: string;
  responseDate: string;
  status: string;
  remarks: string;
  yesterdayValue: string;
  todayValue: string;
}

interface MmsModuleRfiTableProps {
  data: MmsModuleRfiData[];
  setData: (data: MmsModuleRfiData[]) => void;
  onSave: () => void;
  onSubmit?: () => void;
  yesterday: string;
  today: string;
  isLocked?: boolean;
  status?: 'draft' | 'submitted_to_pm' | 'approved_by_pm' | 'rejected_by_pm' | 'final_approved' | 'approved_by_pmag' | 'archived';

  onExportAll?: () => void;
  onFullscreenToggle?: (isFullscreen: boolean) => void;
}

export function MmsModuleRfiTable({
  data,
  setData,
  onSave,
  onSubmit,
  yesterday,
  today,
  isLocked = false,
  status = 'draft',
  onExportAll,
  onFullscreenToggle
}: MmsModuleRfiTableProps) {


  // Define columns
  const columns = [
    "RFI No",
    "Subject",
    "Module",
    "Submitted Date",
    "Response Date",
    "Status",
    "Remarks",
    yesterday,
    today
  ];

  // Convert array of objects to array of arrays
  const tableData = (Array.isArray(data) ? data : []).map(row => [
    row.rfiNo || '',
    row.subject || '',
    row.module || '',
    row.submittedDate || '',
    row.responseDate || '',
    row.status || '',
    row.remarks || '',
    row.yesterdayValue || '',
    row.todayValue || ''
  ]);

  // Handle data changes from ExcelTable
  const handleDataChange = (newData: any[][]) => {
    // Convert array of arrays back to array of objects
    const updatedData = newData.map(row => ({
      rfiNo: row[0] || '',
      subject: row[1] || '',
      module: row[2] || '',
      submittedDate: row[3] || '',
      responseDate: row[4] || '',
      status: row[5] || '',
      remarks: row[6] || '',
      yesterdayValue: row[7] || '',
      todayValue: row[8] || ''
    }));
    setData(updatedData);
  };

  return (
    <div className="space-y-4 w-full">
      <div className="bg-muted p-3 rounded-lg border border-gray-200 dark:border-gray-700">
        <h3 className="font-bold text-base mb-1">MMS & Module RFI</h3>
        <p className="text-xs">Reporting Date: {today}</p>
      </div>
      <StyledExcelTable
        title="MMS & Module RFI Table"
        columns={columns}
        data={tableData}
        onDataChange={handleDataChange}
        onSave={onSave}
        onSubmit={onSubmit}
        isReadOnly={isLocked}
        editableColumns={["Remarks", yesterday, today]}
        columnTypes={{
          "Submitted Date": "date",
          "Response Date": "date",
          [yesterday]: "number",
          [today]: "number"
        }}
        columnWidths={{
          "RFI No": 60,
          "Subject": 100,
          "Module": 60,
          "Submitted Date": 80,
          "Response Date": 80,
          "Status": 60,
          "Remarks": 100,
          [yesterday]: 60,
          [today]: 60
        }}
        headerStructure={[
          // First header row - main column names
          [
            { label: "RFI No", colSpan: 1 },
            { label: "Subject", colSpan: 1 },
            { label: "Module", colSpan: 1 },
            { label: "Submitted Date", colSpan: 1 },
            { label: "Response Date", colSpan: 1 },
            { label: "Status", colSpan: 1 },
            { label: "Remarks", colSpan: 1 },
            { label: yesterday, colSpan: 1 },
            { label: today, colSpan: 1 }
          ]
        ]}
        status={status}
        onExportAll={onExportAll}
        totalRows={undefined}
        onFullscreenToggle={onFullscreenToggle}
      />
    </div>
  );
}