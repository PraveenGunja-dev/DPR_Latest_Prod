import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Save } from "lucide-react";
import { StyledExcelTable } from "@/components/StyledExcelTable";
import { StatusChip } from "@/components/StatusChip";

interface DPBlockData {
  // From P6 API
  activityId: string;
  activities: string;
  plot: string;
  newBlockNom: string;
  baselinePriority: string;
  
  // Editable by User
  contractorName: string;
  scope: string;
  holdDueToWtg: string;
  
  // Auto
  front: string;
  actual: string;
  completionPercentage: string;
}

interface DPBlockTableProps {
  data: DPBlockData[];
  setData: (data: DPBlockData[]) => void;
  onSave: () => void;
  onSubmit?: () => void;
  yesterday: string;
  today: string;
  isLocked?: boolean;
  status?: string; // Add status prop
}

export function DPBlockTable({ data, setData, onSave, onSubmit, yesterday, today, isLocked = false, status = 'draft' }: DPBlockTableProps) {
  // Define columns based on user requirements
  const columns = [
    "Activity_ID (p6)",
    "Activities (p6)",
    "Plot (p6)",
    "New Block Nom (p6)",
    "Baseline Priority (p6)",
    "Contractor Name (user)",
    "Scope (user)",
    "Hold Due to WTG (user)",
    "Front (auto)",
    "Actual (auto)",
    "% Completion (auto)"
  ];
  
  // Define column widths for better alignment
  const columnWidths = {
    "Activity_ID (p6)": 120,
    "Activities (p6)": 200,
    "Plot (p6)": 80,
    "New Block Nom (p6)": 120,
    "Baseline Priority (p6)": 100,
    "Contractor Name (user)": 150,
    "Scope (user)": 100,
    "Hold Due to WTG (user)": 120,
    "Front (auto)": 80,
    "Actual (auto)": 100,
    "% Completion (auto)": 100
  };
  
  // Convert array of objects to array of arrays
  const tableData = data.map(row => [
    row.activityId || '',
    row.activities || '',
    row.plot || '',
    row.newBlockNom || '',
    row.baselinePriority || '',
    row.contractorName || '',
    row.scope || '',
    row.holdDueToWtg || '',
    row.front || '',
    row.actual || '',
    row.completionPercentage || ''
  ]);
  
  // Handle data changes from ExcelTable
  const handleDataChange = (newData: any[][]) => {
    // Convert array of arrays back to array of objects
    const updatedData = newData.map(row => ({
      activityId: row[0] || '',
      activities: row[1] || '',
      plot: row[2] || '',
      newBlockNom: row[3] || '',
      baselinePriority: row[4] || '',
      contractorName: row[5] || '',
      scope: row[6] || '',
      holdDueToWtg: row[7] || '',
      front: row[8] || '',
      actual: row[9] || '',
      completionPercentage: row[10] || ''
    }));
    setData(updatedData);
  };

  return (
    <div className="space-y-4 w-full">
      <div className="bg-muted p-4 rounded-lg border border-gray-200 dark:border-gray-700">
        <h3 className="font-bold text-lg mb-2">DP Block Table</h3>
      </div>
      
      <StyledExcelTable
        title="DP Block Table"
        columns={columns}
        data={tableData}
        onDataChange={handleDataChange}
        onSave={onSave}
        onSubmit={onSubmit}
        isReadOnly={isLocked}
        editableColumns={["Contractor Name (user)", "Scope (user)", "Hold Due to WTG (user)"]}
        columnTypes={{
          "Activity_ID (p6)": "text",
          "Activities (p6)": "text",
          "Plot (p6)": "text",
          "New Block Nom (p6)": "text",
          "Baseline Priority (p6)": "text",
          "Contractor Name (user)": "text",
          "Scope (user)": "text",
          "Hold Due to WTG (user)": "text",
          "Front (auto)": "number",
          "Actual (auto)": "number",
          "% Completion (auto)": "number"
        }}
        columnWidths={columnWidths}
        status={status} // Pass status to StyledExcelTable
      />
    </div>
  );
}
