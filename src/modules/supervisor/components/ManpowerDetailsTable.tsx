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
  status?: string; // Add status prop
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
  status = 'draft' // Add status prop with default value
}: ManpowerDetailsTableProps) {
  // Define columns
  const columns = [
    "Activity_ID",
    "Sl No",
    "Block",
    "Contractor Name",
    "Activity",
    "Section",
    yesterday,
    today
  ];

  const columnWidths = {
    "Activity_ID": 100,
    "Sl No": 50,
    "Block": 100,
    "Contractor Name": 150,
    "Activity": 150,
    "Section": 100,
    [yesterday]: 100,
    [today]: 100
  };
  
  // Convert array of objects to array of arrays
  const tableData = data.map(row => [
    row.activityId,
    row.slNo,
    row.block,
    row.contractorName,
    row.activity,
    row.section,
    row.yesterdayValue,
    row.todayValue
  ]);
  
  // Handle data changes from ExcelTable
  const handleDataChange = (newData: any[][]) => {
    // Convert array of arrays back to array of objects
    const updatedData = newData.map(row => ({
      activityId: row[0] || "",
      slNo: row[1] || "",
      block: row[2] || "",
      contractorName: row[3] || "",
      activity: row[4] || "",
      section: row[5] || "",
      yesterdayValue: row[6] || "",
      todayValue: row[7] || ""
    }));
    setData(updatedData);
  };

  return (
    <div className="space-y-4 w-full">      
      <StyledExcelTable
        title="Manpower Details Table"
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
