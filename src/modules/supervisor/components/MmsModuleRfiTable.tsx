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
  status?: string; // Add status prop
}

export function MmsModuleRfiTable({ 
  data, 
  setData, 
  onSave, 
  onSubmit, 
  yesterday, 
  today, 
  isLocked = false,
  status = 'draft' // Add status prop with default
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
  const tableData = data.map(row => [
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
      <StyledExcelTable
        title="MMS & Module RFI Table"
        columns={columns}
        data={tableData}
        onDataChange={handleDataChange}
        onSave={onSave}
        onSubmit={onSubmit}
        isReadOnly={isLocked}
        editableColumns={[]}
        columnTypes={{
          "Submitted Date": "date",
          "Response Date": "date",
          [yesterday]: "number",
          [today]: "number"
        }}
        status={status} // Pass status to StyledExcelTable
      />
    </div>
  );
}
