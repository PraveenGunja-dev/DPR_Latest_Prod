import { StyledExcelTable } from "@/components/StyledExcelTable";
import { StatusChip } from "@/components/StatusChip";

interface DPVendorIdtData {
  // P6 fields (read-only)
  activityId: string;
  activities: string;
  plot: string;
  newBlockNom: string;
  baselinePriority: string;
  scope: string;
  front: string;
  
  // User-editable fields
  actualStartDate: string;
  actualFinishDate: string;
  forecastStartDate: string;
  forecastFinishDate: string;
  contractorName: string;
  priority: string;
  remarks: string;
  
  // Calculated fields
  actual: string;
  completionPercentage: string;
}

interface DPVendorIdtTableProps {
  data: DPVendorIdtData[];
  setData: (data: DPVendorIdtData[]) => void;
  onSave: () => void;
  onSubmit?: () => void;
  yesterday: string;
  today: string;
  isLocked?: boolean;
  status?: string; // Add status prop
}

export function DPVendorIdtTable({ 
  data, 
  setData, 
  onSave, 
  onSubmit, 
  yesterday, 
  today, 
  isLocked = false,
  status = 'draft' // Add status prop with default
}: DPVendorIdtTableProps) {
  // Define columns
  const columns = [
    "Activity_ID (p6)",
    "Activities (p6)",
    "Plot (p6)",
    "New Block Nom (p6)",
    "Baseline Priority (p6)",
    "Scope (p6)",
    "Front (p6)",
    "Actual Start Date (user)",
    "Actual Finish Date (user)",
    "Forecast Start Date (user)",
    "Forecast Finish Date (user)",
    "Contractor Name (user)",
    "Priority (user)",
    "Remarks (user)",
    "Actual (calc)",
    "% Completion (calc)"
  ];
  
  // Convert array of objects to array of arrays
  const tableData = data.map(row => [
    row.activityId || '',
    row.activities || '',
    row.plot || '',
    row.newBlockNom || '',
    row.baselinePriority || '',
    row.scope || '',
    row.front || '',
    row.actualStartDate || '',
    row.actualFinishDate || '',
    row.forecastStartDate || '',
    row.forecastFinishDate || '',
    row.contractorName || '',
    row.priority || '',
    row.remarks || '',
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
      scope: row[5] || '',
      front: row[6] || '',
      actualStartDate: row[7] || '',
      actualFinishDate: row[8] || '',
      forecastStartDate: row[9] || '',
      forecastFinishDate: row[10] || '',
      contractorName: row[11] || '',
      priority: row[12] || '',
      remarks: row[13] || '',
      actual: row[14] || '',
      completionPercentage: row[15] || ''
    }));
    setData(updatedData);
  };

  // Define which columns are editable
  const editableColumns = [
    "Actual Start Date (user)",
    "Actual Finish Date (user)",
    "Forecast Start Date (user)",
    "Forecast Finish Date (user)",
    "Contractor Name (user)",
    "Priority (user)",
    "Remarks (user)"
  ];

  // Define column types
  const columnTypes: Record<string, 'text' | 'number' | 'date'> = {
    "Activity_ID (p6)": "text",
    "Activities (p6)": "text",
    "Plot (p6)": "text",
    "New Block Nom (p6)": "text",
    "Baseline Priority (p6)": "text",
    "Scope (p6)": "text",
    "Front (p6)": "number",
    "Actual Start Date (user)": "date",
    "Actual Finish Date (user)": "date",
    "Forecast Start Date (user)": "date",
    "Forecast Finish Date (user)": "date",
    "Contractor Name (user)": "text",
    "Priority (user)": "text",
    "Remarks (user)": "text",
    "Actual (calc)": "number",
    "% Completion (calc)": "number"
  };

  // Define column widths for better alignment
  const columnWidths = {
    "Activity_ID (p6)": 120,
    "Activities (p6)": 200,
    "Plot (p6)": 80,
    "New Block Nom (p6)": 120,
    "Baseline Priority (p6)": 100,
    "Scope (p6)": 100,
    "Front (p6)": 80,
    "Actual Start Date (user)": 120,
    "Actual Finish Date (user)": 120,
    "Forecast Start Date (user)": 120,
    "Forecast Finish Date (user)": 120,
    "Contractor Name (user)": 150,
    "Priority (user)": 100,
    "Remarks (user)": 150,
    "Actual (calc)": 100,
    "% Completion (calc)": 100
  };

  return (
    <div className="space-y-2 w-full">
      
      <StyledExcelTable
        title="DP Vendor IDT Table"
        columns={columns}
        data={tableData}
        onDataChange={handleDataChange}
        onSave={onSave}
        onSubmit={onSubmit}
        isReadOnly={isLocked}
        editableColumns={editableColumns}
        columnTypes={columnTypes}
        columnWidths={columnWidths}
        status={status} // Pass status to StyledExcelTable
      />
    </div>
  );
}
