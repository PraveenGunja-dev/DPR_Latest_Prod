import { useState, useEffect } from "react";
import { StyledExcelTable } from "../../../components/StyledExcelTable";

interface DPVendorIdtCategoryData {
  // Category row
  category?: string;
  is_category_row?: boolean;

  // Activity row
  activity_id?: string;
  activity?: string;
  plot?: string;
  block?: string;
  priority?: string;
  baseline_priority?: string;
  contractor?: string;
  scope?: string;
  front?: string;
  actual?: string;
  percent_completion?: string;
  remarks?: string;
}

interface DPVendorIdtCategoriesTableProps {
  onSave: () => void;
  onSubmit?: () => void;
  yesterday: string;
  today: string;
  isLocked?: boolean;

  onExportAll?: () => void;
}

export function DPVendorIdtCategoriesTable({
  yesterday,
  today,
  onSave,
  onSubmit,
  isLocked = false,

  onExportAll
}: DPVendorIdtCategoriesTableProps) {
  const [data, setData] = useState<DPVendorIdtCategoryData[]>([]);



  // Define columns
  const columns = [
    "Activity ID",
    "Activity",
    "Plot",
    "Block",
    "Priority",
    "Baseline Priority",
    "Contractor",
    "Total Quantity",
    "Front",
    "Actual",
    "% Completion",
    "Remarks",
    yesterday,
    today
  ];

  // Convert array of objects to array of arrays
  const tableData = data.map(row => {
    if (row.is_category_row) {
      // Category row - only show category in first column, rest empty
      return [
        row.category || '',
        '', '', '', '', '', '', '', '', '', '', '',
        '', ''
      ];
    } else {
      // Activity row - show all data
      return [
        row.activity_id || '',
        row.activity || (row as any).description || (row as any).activities || (row as any).activity_name || '',
        row.plot || '',
        row.block || '',
        row.priority || '',
        row.baseline_priority || '',
        row.contractor || '',
        row.scope || '',
        row.front || '',
        row.actual || '',
        row.percent_completion || '',
        row.remarks || '',
        '', // yesterday value (not editable)
        ''  // today value (not editable in this view)
      ];
    }
  });

  // Define which columns are editable
  const editableColumns = [
    "Priority",
    "Contractor",
    "Total Quantity",
    "Front",
    "Remarks",
    today
  ];

  // Define column types
  const columnTypes: Record<string, 'text' | 'number' | 'date'> = {
    "Activity ID": "text",
    "Activity": "text",
    "Plot": "text",
    "Block": "text",
    "Priority": "text",
    "Baseline Priority": "text",
    "Contractor": "text",
    "Total Quantity": "number",
    "Front": "number",
    "Actual": "text",
    "% Completion": "number",
    "Remarks": "text",
    [yesterday]: "number",
    [today]: "number"
  };

  // Define column widths for better alignment
  const columnWidths = {
    "Activity ID": 80,
    "Activity": 80,
    "Plot": 60,
    "Block": 80,
    "Priority": 60,
    "Baseline Priority": 80,
    "Contractor": 80,
    "Total Quantity": 100,
    "Front": 60,
    "Actual": 60,
    "% Completion": 60,
    "Remarks": 100,
    [yesterday]: 60,
    [today]: 60
  };

  return (
    <div className="space-y-2 w-full flex-1 min-h-0 flex flex-col">
      <StyledExcelTable
        title="DP Vendor IDT Categories Table"
        columns={columns}
        data={tableData}
        onDataChange={() => { }} // No data changes in this view
        onSave={onSave}
        onSubmit={onSubmit}
        isReadOnly={isLocked}
        editableColumns={editableColumns}
        columnTypes={columnTypes}
        columnWidths={columnWidths}
        status={status}
        onExportAll={onExportAll}
      />
    </div>
  );
}
