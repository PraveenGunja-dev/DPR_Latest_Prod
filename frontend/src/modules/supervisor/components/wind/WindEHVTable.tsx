import React, { useMemo, useCallback, useState } from 'react';
import { StyledExcelTable } from "@/components/StyledExcelTable";
import { Plus } from 'lucide-react';
import { AddCustomActivityModal } from '../AddCustomActivityModal';

export interface WindEHVData {
  sNo?: string;
  activityId?: string;
  description: string;
  uom: string;
  scope: string;
  completed: string;
  balance: string;
  [key: string]: any;
}

interface WindEHVTableProps {
  data: WindEHVData[];
  setData: (data: WindEHVData[]) => void;
  onSave?: () => void;
  onSubmit?: () => void;
  isLocked?: boolean;
  status?: string;
  onExportAll?: () => void;
  projectId?: number;
  onPush?: () => void;
  customActivities?: WindEHVData[];
  onAddCustomActivity?: (activity: any) => void;
  onDeleteCustomActivity?: (id: number) => void;
}

export const WindEHVTable: React.FC<WindEHVTableProps> = ({
  data,
  setData,
  onSave,
  onSubmit,
  isLocked = false,
  status = 'draft',
  onExportAll,
  projectId,
  onPush,
  customActivities = [],
  onAddCustomActivity,
  onDeleteCustomActivity,
}) => {
  const [showAddModal, setShowAddModal] = useState(false);

  // Filter P6 data for EHV-relevant WBS names
  const filteredP6Data = useMemo(() => {
    const safeData = Array.isArray(data) ? data : [];
    return safeData.filter(d => {
      if (d.isCustom) return false; // Exclude custom rows from P6 filter
      const wbs = (d.wbsName || '').toUpperCase();
      return wbs.includes("220KV") || wbs.includes("220 KV") || 
             wbs.includes("400KV") || wbs.includes("400 KV") || 
             wbs.includes("BOS CONSTRUCTION") || wbs.includes("BOS CONSTARTCUTION") ||
             wbs.includes("EHV");
    });
  }, [data]);

  // Merge P6 + Custom activities
  const mergedData = useMemo(() => {
    const safeCustom = Array.isArray(customActivities) ? customActivities : [];
    return [...filteredP6Data, ...safeCustom];
  }, [filteredP6Data, customActivities]);

  const columns = useMemo(() => [
    "S.No",
    "Description",
    "UOM",
    "Scope",
    "Completed",
    "Balance",
  ], []);

  const columnWidths = useMemo(() => ({
    "S.No": 60,
    "Description": 400,
    "UOM": 100,
    "Scope": 100,
    "Completed": 100,
    "Balance": 100,
  }), []);

  const columnTypes = useMemo(() => ({
    "S.No": "text",
    "Description": "text",
    "UOM": "text",
    "Scope": "number",
    "Completed": "number",
    "Balance": "number",
  }), []);

  const editableColumns = useMemo(() => [
    "Completed"
  ], []);

  const tableData = useMemo(() => {
    return mergedData.map((row, index) => [
      String(index + 1),
      (row.isCustom ? '📝 ' : '') + (row.description || ""),
      row.uom || "",
      String(row.scope || "0"),
      String(row.completed || "0"),
      String(row.balance || "0")
    ]);
  }, [mergedData]);

  const handleDataChange = useCallback((newData: any[][]) => {
    const updatedP6 = [...filteredP6Data];
    const p6Count = filteredP6Data.length;
    
    newData.forEach((row, idx) => {
      if (idx < p6Count && updatedP6[idx]) {
        updatedP6[idx] = {
          ...updatedP6[idx],
          completed: row[4] || "0",
          balance: String(Number(updatedP6[idx].scope || 0) - Number(row[4] || 0))
        };
      }
      // Custom row updates would be handled via onAddCustomActivity/update API
    });
    setData(updatedP6);
  }, [filteredP6Data, setData]);

  const handleAddActivity = (activity: any) => {
    if (onAddCustomActivity) {
      onAddCustomActivity({
        ...activity,
        sheetType: 'wind_ehv',
      });
    }
  };

  return (
    <div className="space-y-4 w-full flex-1 min-h-0 flex flex-col">
      {/* Add Activity Button */}
      {!isLocked && onAddCustomActivity && (
        <div className="flex justify-end px-2">
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" />
            Add DPR Activity
          </button>
        </div>
      )}

      <div className="flex-1 min-h-0 bg-white rounded-lg shadow-sm border overflow-hidden">
        <StyledExcelTable
          title="Wind Project - EHV Activities"
          columns={columns}
          data={tableData}
          onDataChange={handleDataChange}
          onSave={onSave || (() => {})}
          onSubmit={onSubmit}
          onPush={onPush}
          isReadOnly={isLocked}
          editableColumns={editableColumns}
          columnTypes={columnTypes}
          columnWidths={columnWidths}
          status={status}
          onExportAll={onExportAll}
          projectId={projectId}
          sheetType="wind_ehv"
          emptyMessage="No EHV Line Activities found for this project."
        />
      </div>

      {/* Add Custom Activity Modal */}
      <AddCustomActivityModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onAdd={handleAddActivity}
        sheetType="wind_ehv"
        defaultWbsName="BOS CONSTRUCTION"
        defaultCategory="EHV"
      />
    </div>
  );
};
