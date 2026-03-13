import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Save, Plus, Edit, Trash2 } from "lucide-react";
import { StyledExcelTable } from "@/components/StyledExcelTable";
import {
  getDraftEntry,
  saveDraftEntry,
  submitEntry
} from "@/modules/auth/services/dprSupervisorService";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface DynamicColumn {
  id: number;
  project_id: number;
  column_name: string;
  display_name: string;
  data_type: string;
  is_required: boolean;
  default_value: string | null;
  position: number;
  created_by: number;
  created_at: string;
  updated_at: string;
  is_active: boolean;
}

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
  [key: string]: string; // For dynamic columns
}

interface MmsModuleRfiTableWithDynamicColumnsProps {
  projectId: number;
  userId: number;
  yesterday: string;
  today: string;
  isLocked?: boolean;
  status?: string;
  onExportAll?: () => void;
}

export function MmsModuleRfiTableWithDynamicColumns({
  projectId,
  userId,
  yesterday,
  today,
  isLocked = false,
  status = 'draft',
  onExportAll
}: MmsModuleRfiTableWithDynamicColumnsProps) {
  const [dynamicColumns, setDynamicColumns] = useState<DynamicColumn[]>([]);
  const [entry, setEntry] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isManageColumnsOpen, setIsManageColumnsOpen] = useState(false);
  const [newColumn, setNewColumn] = useState({
    columnName: '',
    displayName: '',
    dataType: 'text',
    isRequired: false,
    defaultValue: ''
  });

  // Load entry data using the standard dprSupervisorService API
  useEffect(() => {
    const loadData = async () => {
      try {
        setIsLoading(true);

        // Load entry data using standard API with sheet_type='mms_module_rfi'
        const draftEntry = await getDraftEntry(projectId, 'mms_module_rfi');

        // Parse data_json if it's a string
        if (draftEntry && typeof draftEntry.data_json === 'string') {
          try {
            draftEntry.data_json = JSON.parse(draftEntry.data_json);
          } catch (parseError) {
            console.error('Error parsing data_json:', parseError);
            draftEntry.data_json = { rows: [] };
          }
        }

        // Ensure data_json has the expected structure
        if (draftEntry && (!draftEntry.data_json || !draftEntry.data_json.rows)) {
          draftEntry.data_json = { rows: [] };
        }

        setEntry(draftEntry);

        setError(null);
      } catch (err) {
        console.error('Error loading data:', err);
        setError('Failed to load data');
      } finally {
        setIsLoading(false);
      }
    };

    if (projectId) {
      loadData();
    }
  }, [projectId]);

  const handleAddColumn = async () => {
    try {
      if (!newColumn.columnName || !newColumn.displayName) {
        setError('Column name and display name are required');
        return;
      }

      // Dynamic columns not yet implemented in standard API
      console.warn('Dynamic columns feature coming soon');
      setError('Dynamic columns feature coming soon');

      // Reset form
      setNewColumn({
        columnName: '',
        displayName: '',
        dataType: 'text',
        isRequired: false,
        defaultValue: ''
      });

      setIsManageColumnsOpen(false);
    } catch (err) {
      console.error('Error adding column:', err);
      setError('Failed to add column');
    }
  };

  const handleRemoveColumn = async (columnId: number) => {
    try {
      // Dynamic columns not yet implemented in standard API
      console.warn('Dynamic columns feature coming soon');
      setError(null);
    } catch (err) {
      console.error('Error removing column:', err);
      setError('Failed to remove column');
    }
  };

  const handleSaveEntry = async () => {
    if (!entry) return;

    try {
      await saveDraftEntry(entry.id, entry.data_json);
      // Reload entry to get updated data
      const updatedEntry = await getDraftEntry(projectId, 'mms_module_rfi');
      setEntry(updatedEntry);
      setError(null);
    } catch (err) {
      console.error('Error saving entry:', err);
      setError('Failed to save entry');
    }
  };

  const handleSubmitEntry = async () => {
    if (!entry) return;

    try {
      await submitEntry(entry.id);
      // Reload the entry to get updated status
      const updatedEntry = await getDraftEntry(projectId, 'mms_module_rfi');
      setEntry(updatedEntry);
      setError(null);
    } catch (err) {
      console.error('Error submitting entry:', err);
      setError('Failed to submit entry');
    }
  };

  const handleDataChange = (newData: any[][]) => {
    if (!entry) return;

    // Convert array of arrays back to rows with column names
    const updatedRows = newData.map(row => {
      const rowObj: any = {};

      // Add fixed columns
      rowObj.rfiNo = row[0] || '';
      rowObj.subject = row[1] || '';
      rowObj.module = row[2] || '';
      rowObj.submittedDate = row[3] || '';
      rowObj.responseDate = row[4] || '';
      rowObj.status = row[5] || '';
      rowObj.remarks = row[6] || '';
      rowObj.yesterdayValue = row[7] || '';
      rowObj.todayValue = row[8] || '';

      // Add dynamic columns
      dynamicColumns.forEach((col, index) => {
        rowObj[col.column_name] = row[9 + index] || '';
      });

      return rowObj;
    });

    setEntry({
      ...entry,
      data_json: {
        ...entry.data_json,
        rows: updatedRows
      }
    });
  };

  // Convert rows to array of arrays for the table
  const convertToTableData = () => {
    if (!entry) return [];
    if (!entry.data_json) return [];
    const rows = Array.isArray(entry.data_json?.rows) ? entry.data_json.rows : [];
    if (rows.length === 0) return [];

    return rows.map((row: any) => {
      const rowData = [
        row.rfiNo || '',
        row.subject || '',
        row.module || '',
        row.submittedDate || '',
        row.responseDate || '',
        row.status || '',
        row.remarks || '',
        row.yesterdayValue || '',
        row.todayValue || ''
      ];

      // Add dynamic columns
      dynamicColumns.forEach(col => {
        rowData.push(row[col.column_name] || '');
      });

      return rowData;
    });
  };

  // Define all columns (fixed + dynamic)
  const allColumns = [
    "RFI No",
    "Subject",
    "Module",
    "Submitted Date",
    "Response Date",
    "Status",
    "Remarks",
    yesterday,
    today,
    ...dynamicColumns.map(col => col.display_name)
  ];

  // Define column types
  const columnTypes: Record<string, 'text' | 'number' | 'date'> = {
    "Submitted Date": "date",
    "Response Date": "date",
    [yesterday]: "number",
    [today]: "number"
  };

  // Add dynamic column types
  dynamicColumns.forEach(col => {
    columnTypes[col.display_name] = col.data_type as 'text' | 'number' | 'date';
  });

  // Define column widths
  const columnWidths: Record<string, number> = {
    "RFI No": 60,
    "Subject": 100,
    "Module": 60,
    "Submitted Date": 80,
    "Response Date": 80,
    "Status": 60,
    "Remarks": 100,
    [yesterday]: 60,
    [today]: 60
  };

  // Add dynamic column widths (default to 80)
  dynamicColumns.forEach(col => {
    columnWidths[col.display_name] = 80;
  });

  if (isLoading) {
    return <div>Loading MMS & RFI data...</div>;
  }

  if (error) {
    return <div className="text-red-500">Error: {error}</div>;
  }

  return (
    <div className="space-y-4 w-full">
      <div className="bg-muted p-3 rounded-lg border border-gray-200 dark:border-gray-700">
        <div>
          <h3 className="font-bold text-base mb-1">MMS & Module RFI</h3>
          <p className="text-xs">Reporting Date: {today}</p>
        </div>
      </div>



      <StyledExcelTable
        title="MMS & Module RFI Table"
        columns={allColumns}
        data={convertToTableData()}
        onDataChange={handleDataChange}
        onSave={handleSaveEntry}
        onSubmit={handleSubmitEntry}
        isReadOnly={isLocked}
        columnTypes={columnTypes}
        columnWidths={columnWidths}
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
            { label: today, colSpan: 1 },
            ...dynamicColumns.map(col => ({ label: col.display_name, colSpan: 1 }))
          ]
        ]}
        status={entry?.status}
        onExportAll={onExportAll} totalRows={undefined}      />
    </div>
  );
}