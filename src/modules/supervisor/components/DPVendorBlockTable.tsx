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
}

interface DPVendorBlockTableProps {
  data: DPVendorBlockData[];
  setData: (data: DPVendorBlockData[]) => void;
  onSave: () => void;
  onSubmit?: () => void;
  yesterday: string;
  today: string;
  isLocked?: boolean;
  status?: string; // Add status prop
}

export function DPVendorBlockTable({ 
  data, 
  setData, 
  onSave, 
  onSubmit, 
  yesterday, 
  today, 
  isLocked = false,
  status = 'draft' // Add status prop with default
}: DPVendorBlockTableProps) {
  // Define columns
  const columns = [
    "Activity_ID",
    "Activities",
    "Plot",
    "New Block Nom",
    "Priority",
    "Baseline Priority",
    "Contractor Name",
    "Scope",
    "Hold Due to WTG",
    "Front",
    "Actual",
    "% Completion",
    "Remarks",
    yesterday,
    today
  ];

  // Define column widths for better alignment
  const columnWidths = {
    "Activity_ID": 120,
    "Activities": 200,
    "Plot": 80,
    "New Block Nom": 120,
    "Priority": 100,
    "Baseline Priority": 100,
    "Contractor Name": 150,
    "Scope": 100,
    "Hold Due to WTG": 120,
    "Front": 80,
    "Actual": 100,
    "% Completion": 100,
    "Remarks": 150,
    [yesterday]: 100,
    [today]: 100
  };
  
  // Convert array of objects to array of arrays
  const tableData = data.map(row => [
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
  ]);
  
  // Handle data changes from ExcelTable
  const handleDataChange = (newData: any[][]) => {
    // Convert array of arrays back to array of objects
    const updatedData = newData.map(row => ({
      activityId: row[0] || "",
      activities: row[1] || "",
      plot: row[2] || "",
      newBlockNom: row[3] || "",
      priority: row[4] || "",
      baselinePriority: row[5] || "",
      contractorName: row[6] || "",
      scope: row[7] || "",
      holdDueToWtg: row[8] || "",
      front: row[9] || "",
      actual: row[10] || "",
      completionPercentage: row[11] || "",
      remarks: row[12] || "",
      yesterdayValue: row[13] || "",
      todayValue: row[14] || ""
    }));
    setData(updatedData);
  };

  return (
    <div className="space-y-4 w-full">      
      <StyledExcelTable
        title="DP Vendor Block Table"
        columns={columns}
        data={tableData}
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
        status={status} // Pass status to StyledExcelTable
      />
    </div>
  );
}
