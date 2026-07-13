import React, { useMemo, useCallback } from 'react';
import { StyledExcelTable } from "@/components/StyledExcelTable";
import { Plus, Upload } from 'lucide-react';
import { useAuth } from '@/modules/auth/contexts/AuthContext';

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
  onEditCustomActivity?: (activity: any) => void;
  onDeleteCustomActivity?: (id: number) => void;
  onBulkUploadActivities?: () => void;
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
  onEditCustomActivity,
  onDeleteCustomActivity,
  onBulkUploadActivities,
}) => {
  const { user } = useAuth();
  const userRoleLower = (user?.role || user?.Role || '').toLowerCase();
  const isPmagOrAdmin = userRoleLower === 'pmag' || userRoleLower === 'super admin';

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

  // Inline editing: Description, UOM, Scope, Completed all editable for custom rows
  const editableColumns = useMemo(() => [
    "Description", "UOM", "Scope", "Completed"
  ], []);

  const tableData = useMemo(() => {
    const rows: any[] = [];
    let addedDprHeader = false;
    let actIndex = 1;

    mergedData.forEach((row) => {
      if (row.isCustom && !addedDprHeader) {
        addedDprHeader = true;
        const dprRow = ["", "📝 DPR Level Activities", "", "", "", ""];
        (dprRow as any).isCategoryRow = true;
        rows.push(dprRow);
      }

      const tableRow: any = [
        String(actIndex++),
        row.description || "",
        row.uom || "",
        String(row.scope || "0"),
        String(row.completed || "0"),
        String(row.balance || "0")
      ];

      tableRow._activityId = row.activityId;
      if (row._cellStatuses) {
        tableRow._cellStatuses = row._cellStatuses;
      }
      if (row.isCustom) {
        tableRow._isCustomRow = true;
        tableRow._customId = row.id;
      }
      
      rows.push(tableRow);
    });

    return rows;
  }, [mergedData]);

  const rowStyles = useMemo(() => {
    const styles: Record<number, any> = {};
    tableData.forEach((row, index) => {
      if ((row as any).isCategoryRow) {
        styles[index] = {
          backgroundColor: "#FADFAD",
          color: "#333333",
          fontWeight: "bold",
          isCategoryRow: true,
        };
      } else if ((row as any)._isCustomRow) {
        styles[index] = {
          backgroundColor: "#FFFBEB",
        };
      }
    });
    return styles;
  }, [tableData]);

  // Inline add: create a stub custom activity via the parent callback
  const handleInlineAdd = useCallback(() => {
    if (onAddCustomActivity) {
      onAddCustomActivity({
        sheetType: 'wind_ehv',
        description: 'New DPR Activity',
        uom: 'Nos',
        scope: 0,
        wbsName: 'BOS CONSTRUCTION',
        category: 'EHV',
      });
    }
  }, [onAddCustomActivity]);

  const handleDataChange = useCallback((newData: any[][]) => {
    const p6Rows: any[] = [];
    const customRowChanges: any[] = [];

    newData.forEach((row) => {
      if ((row as any).isTotalRow || (row as any).isCategoryRow) return;
      if ((row as any)._isCustomRow) {
        customRowChanges.push(row);
      } else {
        p6Rows.push(row);
      }
    });

    // Update P6 data
    const updatedP6 = p6Rows.map((row) => {
      const actId = (row as any)._activityId;
      if (!actId) return null;
      const original = (filteredP6Data as any[]).find(d => d.activityId === actId);
      if (!original) return null;
      return {
        ...original,
        completed: row[4] || "0",
        balance: String(Number(original.scope || 0) - Number(row[4] || 0)),
        _cellStatuses: (row as any)._cellStatuses
      };
    }).filter(r => r !== null);
    setData(updatedP6 as WindEHVData[]);

    // Update custom rows inline
    if (onEditCustomActivity && customRowChanges.length > 0) {
      customRowChanges.forEach((row) => {
        const customId = (row as any)._customId;
        if (!customId) return;
        const original = customActivities.find(c => c.id === customId);
        if (!original) return;

        const newDesc = row[1] || '';
        const newUom = row[2] || '';
        const newScope = row[3] || '0';
        const newCompleted = row[4] || '0';

        const hasChanges =
          newDesc !== (original.description || '') ||
          newUom !== (original.uom || '') ||
          newScope !== String(original.scope || '0') ||
          newCompleted !== String(original.completed || '0');

        if (hasChanges) {
          onEditCustomActivity({
            id: customId,
            sheetType: 'wind_ehv',
            description: newDesc,
            uom: newUom,
            scope: Number(newScope) || 0,
            cumulative: Number(newCompleted) || 0,
          });
        }
      });
    }
  }, [filteredP6Data, setData, customActivities, onEditCustomActivity]);

  const handleRowDelete = useCallback((index: number) => {
    const row = tableData[index];
    if (row && (row as any)._isCustomRow && onDeleteCustomActivity) {
      const customId = (row as any)._customId;
      if (customId) onDeleteCustomActivity(customId);
    }
  }, [tableData, onDeleteCustomActivity]);

  return (
    <div className="space-y-4 w-full flex-1 min-h-0 flex flex-col">
      {/* Inline Add Activity Button */}
      {!isLocked && (onAddCustomActivity || onBulkUploadActivities) && (
        <div className="flex justify-end px-2 gap-2">
          {onBulkUploadActivities && (
            <button
              onClick={onBulkUploadActivities}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors shadow-sm"
            >
              <Upload className="w-4 h-4" />
              Upload Activities
            </button>
          )}
          {onAddCustomActivity && (
            <button
              onClick={handleInlineAdd}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
            >
              <Plus className="w-4 h-4" />
              Add DPR Activity
            </button>
          )}
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
          rowStyles={rowStyles}
          status={status}
          onExportAll={onExportAll}
          projectId={projectId}
          sheetType="wind_ehv"
          emptyMessage="No EHV Line Activities found for this project."
          onRowDelete={isPmagOrAdmin && !isLocked && onDeleteCustomActivity ? handleRowDelete : undefined}
          rowIsEditable={() => false}
          rowIsDeletable={(idx) => !!(tableData[idx] as any)?._isCustomRow && isPmagOrAdmin}
        />
      </div>
    </div>
  );
};
