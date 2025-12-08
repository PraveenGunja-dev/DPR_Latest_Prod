import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Save } from "lucide-react";
import { StyledExcelTable } from "@/components/StyledExcelTable";
import { getTodayAndYesterday } from "@/modules/auth/services/dprSupervisorService";
import { toast } from "sonner";
import { StatusChip } from "@/components/StatusChip";

interface DPQtyData {
  slNo: string;
  description: string;
  totalQuantity: string;
  uom: string;
  basePlanStart: string;
  basePlanFinish: string;
  forecastStart: string;
  forecastFinish: string;
  blockCapacity: string;
  phase: string;
  block: string;
  spvNumber: string;
  actualStart: string;
  actualFinish: string;
  remarks: string;
  priority: string;
  balance: string;
  cumulative: string;
}

interface DPQtyTableProps {
  data: DPQtyData[];
  setData: React.Dispatch<React.SetStateAction<DPQtyData[]>>;
  onSave: () => void;
  onSubmit?: () => void;
  yesterday: string;
  today: string;
  isLocked?: boolean;
  status?: 'draft' | 'submitted_to_pm' | 'approved_by_pm' | 'rejected_by_pm' | 'final_approved';
  projectId?: number; // Add projectId prop for P6 integration
}

export function DPQtyTable({ data, setData, onSave, onSubmit, yesterday, today, isLocked = false, status = 'draft', projectId }: DPQtyTableProps) {
  const { today: currentDate, yesterday: previousDate } = getTodayAndYesterday();
  
  // Fetch data from Oracle P6 when component mounts and projectId is provided
  useEffect(() => {
    const fetchP6Data = async () => {
      if (!projectId) return;
      
      try {
        const response = await fetch(`/api/oracle-p6/dp-qty-data?projectId=${projectId}`, {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`,
            'Content-Type': 'application/json'
          }
        });
        
        if (response.ok) {
          const result = await response.json();
          if (result.data && result.data.length > 0) {
            setData(result.data);
          }
        } else {
          console.error('Failed to fetch P6 data:', await response.text());
        }
      } catch (error) {
        console.error('Error fetching P6 data:', error);
      }
    };

    fetchP6Data();
  }, [projectId, setData]);
  
  // Convert data to the format expected by ExcelTable
  const columns = [
    "Sl.No",
    "Description",
    "Total Quantity",
    "UOM",
    "Base Plan Start",
    "Base Plan Finish",
    "Forecast Start",
    "Forecast Finish",
    "Block Capacity (Mwac)",
    "Phase",
    "Block",
    "SPV Number",
    "Actual Start",
    "Actual Finish",
    "Remarks",
    "Priority",
    "Balance",
    "Cumulative"
  ];
  
  // Define column widths for better alignment
  const columnWidths = {
    "Sl.No": 60,
    "Description": 200,
    "Total Quantity": 120,
    "UOM": 80,
    "Base Plan Start": 120,
    "Base Plan Finish": 120,
    "Forecast Start": 120,
    "Forecast Finish": 120,
    "Block Capacity (Mwac)": 150,
    "Phase": 80,
    "Block": 80,
    "SPV Number": 120,
    "Actual Start": 120,
    "Actual Finish": 120,
    "Remarks": 150,
    "Priority": 100,
    "Balance": 100,
    "Cumulative": 100
  };
  
  // Define which columns are editable by the user
  const editableColumns = [
    "Actual Start",
    "Actual Finish",
    "Remarks",
    "Priority"
  ];
  
  // Convert array of objects to array of arrays
  const tableData = data.map(row => [
    row.slNo,
    row.description,
    row.totalQuantity,
    row.uom,
    row.basePlanStart,
    row.basePlanFinish,
    row.forecastStart,
    row.forecastFinish,
    row.blockCapacity,
    row.phase,
    row.block,
    row.spvNumber,
    row.actualStart,
    row.actualFinish,
    row.remarks,
    row.priority,
    row.balance,
    row.cumulative
  ]);
  
  // Handle data changes from ExcelTable
  const handleDataChange = (newData: any[][]) => {
    // Convert array of arrays back to array of objects
    const updatedData = newData.map(row => ({
      slNo: row[0] || "",
      description: row[1] || "",
      totalQuantity: row[2] || "",
      uom: row[3] || "",
      basePlanStart: row[4] || "",
      basePlanFinish: row[5] || "",
      forecastStart: row[6] || "",
      forecastFinish: row[7] || "",
      blockCapacity: row[8] || "",
      phase: row[9] || "",
      block: row[10] || "",
      spvNumber: row[11] || "",
      actualStart: row[12] || "",
      actualFinish: row[13] || "",
      remarks: row[14] || "",
      priority: row[15] || "",
      balance: row[16] || "",
      cumulative: row[17] || ""
    }));
    setData(updatedData);
  };

  return (
    <div className="space-y-4 w-full">
      <div className="bg-muted p-4 rounded-lg border border-gray-200 dark:border-gray-700">
        <h3 className="font-bold text-lg mb-2">Project Information</h3>
        <p className="font-medium">PLOT - A-06 135 MW - KHAVDA HYBRID SOLAR PHASE 3 (YEAR 2025-26)</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-2">
          <p>Reporting Date: {today}</p>
          <p>Progress Date: {yesterday}</p>
        </div>
      </div>
      
      <StyledExcelTable
        title="DP Qty Table"
        columns={columns}
        data={tableData}
        onDataChange={handleDataChange}
        onSave={onSave}
        onSubmit={onSubmit}
        isReadOnly={isLocked}
        editableColumns={["Actual Start", "Actual Finish", "Remarks", "Priority"]}
        columnTypes={{
          "Sl.No": "text",
          "Description": "text",
          "Total Quantity": "number",
          "UOM": "text",
          "Base Plan/Start": "date",
          "Base Plan/Finish": "date",
          "Forecast Start": "date",
          "Forecast Finish": "date",
          "Block Capacity": "number",
          "Phase": "text",
          "Block": "text",
          "SPV Number": "text",
          "Actual Start": "date",
          "Actual Finish": "date",
          "Remarks": "text",
          "Priority": "text",
          "Balance": "number",
          "Cumulative": "number"
        }}
        columnWidths={columnWidths}
        status={status} // Pass status to StyledExcelTable
      />
    </div>
  );
}
