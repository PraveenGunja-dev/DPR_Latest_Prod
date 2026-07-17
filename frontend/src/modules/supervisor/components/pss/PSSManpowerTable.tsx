import React, { useMemo, useCallback, memo } from 'react';
import { StyledExcelTable } from "@/components/StyledExcelTable";
import { indianDateFormat } from "@/services/dprService";
import { Plus } from "lucide-react";
import { useAuth } from '@/modules/auth/contexts/AuthContext';

export interface PSSManpowerData {
  sNo?: string;
  description: string;
  areas: string;
  department: string;
  completedCumulative: string;
  today: string;
  [key: string]: any;
}

interface PSSManpowerTableProps {
  data: PSSManpowerData[];
  setData: (data: PSSManpowerData[]) => void;
  onSave?: () => void;
  onSubmit?: () => void;
  yesterday?: string;
  today?: string;
  todayDate?: string;
  isLocked?: boolean;
  status?: string;
  onExportAll?: () => void;
  projectId?: number;
  onPush?: () => void;

  customActivities?: any[];
  onAddCustomActivity?: (activity: any, silent?: boolean) => void;
  onEditCustomActivity?: (activity: any) => void;
  onDeleteCustomActivity?: (id: number) => void;
}

export const PSSManpowerTable = memo(({
  data,
  setData,
  onSave,
  onSubmit,
  todayDate,
  isLocked = false,
  status = 'draft',
  onExportAll,
  projectId,
  onPush,
  customActivities = [],
  onAddCustomActivity,
  onEditCustomActivity,
  onDeleteCustomActivity
}: PSSManpowerTableProps) => {
  const { user } = useAuth();
  const userRole = (user?.role || user?.Role || '').toLowerCase();
  const isPmagOrAdmin = userRole.includes('pmag') || userRole.includes('admin');

  const todayLabel = useMemo(() => todayDate ? indianDateFormat(todayDate) : 'Today', [todayDate]);

  const columns = useMemo(() => [
    "Sr.No",
    "Description",
    "Areas",
    "Department",
    "Completed (Cumulative)",
    todayLabel,
  ], [todayLabel]);

  const columnWidths = useMemo(() => ({
    "Sr.No": 55,
    "Description": 250,
    "Areas": 180,
    "Department": 160,
    "Completed (Cumulative)": 150,
    [todayLabel]: 100,
  }), [todayLabel]);

  const columnTypes = useMemo(() => ({
    "Sr.No": "text" as const,
    "Description": "text" as const,
    "Areas": "text" as const,
    "Department": "text" as const,
    "Completed (Cumulative)": "number" as const,
    [todayLabel]: "number" as const,
  }), [todayLabel]);

  const editableColumns = useMemo(() => [
    "Description", "Areas", "Department", "Completed (Cumulative)", todayLabel
  ], [todayLabel]);

  const headerStructure = useMemo(() => [
    [
      { label: "Sr.No", colSpan: 1 },
      { label: "Description", colSpan: 1 },
      { label: "Areas", colSpan: 1 },
      { label: "Department", colSpan: 1 },
      { label: "Completed (Cumulative)", colSpan: 1 },
      { label: todayLabel, colSpan: 1 },
    ]
  ], [todayLabel]);

  const { tableData, rowStyles } = useMemo(() => {
    const safeData = Array.isArray(data) ? data : [];
    const safeCustom = Array.isArray(customActivities) ? customActivities : [];
    
    let totalCumulative = 0;
    let totalToday = 0;
    let sNo = 1;

    const rows: any[][] = [];
    const styles: Record<number, any> = {};

    safeData.forEach((row, index) => {
      totalCumulative += Number(row.completedCumulative) || 0;
      totalToday += Number(row.today) || 0;

      const arr: any = [
        String(sNo++),
        row.description || '',
        row.areas || '',
        row.department || '',
        row.completedCumulative || '',
        row.today || '',
      ];
      if (row._cellStatuses) arr._cellStatuses = row._cellStatuses;
      rows.push(arr);
    });

    if (safeCustom.length > 0) {
      const customCatRow: any = ["", "📝 DPR Level Activities", "", "", "", ""];
      customCatRow.isCategoryRow = true;
      rows.push(customCatRow);
      styles[rows.length - 1] = {
        backgroundColor: "#FADFAD",
        color: "#333333",
        fontWeight: "bold",
        isCategoryRow: true,
      };

      safeCustom.forEach((c) => {
        const cumulative = Number(c.cumulative) || 0;
        const todayVal = Number(c.extraData?.todayValue) || 0;

        totalCumulative += cumulative;
        totalToday += todayVal;

        const customArr: any = [
          String(sNo++),
          c.description || '',
          c.extraData?.areas || '',
          c.extraData?.department || '',
          String(cumulative),
          String(todayVal),
        ];
        customArr._isCustomRow = true;
        customArr._customId = c.id;

        rows.push(customArr);
        styles[rows.length - 1] = { backgroundColor: "#FFFBEB" };
      });
    }

    if (rows.length > 0) {
      const totalRow: any = [
        "TOTAL", "", "", "",
        String(totalCumulative || ''),
        String(totalToday || ''),
      ];
      totalRow.isTotalRow = true;
      rows.push(totalRow);
      styles[rows.length - 1] = {
        backgroundColor: "#f1f5f9",
        color: "#0f172a",
        fontWeight: "bold",
        isTotalRow: true,
      };
    }

    return { tableData: rows, rowStyles: styles };
  }, [data, customActivities]);

  const handleInlineAdd = useCallback(() => {
    if (onAddCustomActivity) {
      onAddCustomActivity({
        sheetType: 'pss_manpower',
        description: 'New DPR Activity',
        uom: 'Nos',
        scope: 0,
      });
    }
  }, [onAddCustomActivity]);

  const handleDataChange = useCallback((newData: any[][]) => {
    const safeData = Array.isArray(data) ? data : [];
    const p6RowChanges: any[] = [];
    const customRowChanges: any[] = [];

    // Extract non-total, non-category rows and map them
    // newData contains all rows including categories, custom, and totals.
    let p6Index = 0;

    newData.forEach((row, index) => {
      if ((row as any).isTotalRow || (row as any).isCategoryRow) return;

      if ((row as any)._isCustomRow) {
        customRowChanges.push(row);
      } else {
        const original = safeData[p6Index];
        if (original) {
          if (
            original.description !== row[1] ||
            original.areas !== row[2] ||
            original.department !== row[3] ||
            original.completedCumulative !== row[4] ||
            original.today !== row[5] ||
            original._cellStatuses !== (row as any)._cellStatuses
          ) {
            p6RowChanges.push({
              index: p6Index,
              data: {
                ...original,
                _cellStatuses: (row as any)._cellStatuses,
                description: row[1] || '',
                areas: row[2] || '',
                department: row[3] || '',
                completedCumulative: row[4] || '',
                today: row[5] || '',
              }
            });
          }
        }
        p6Index++;
      }
    });

    if (p6RowChanges.length > 0) {
      const updated = [...safeData];
      p6RowChanges.forEach(change => {
        updated[change.index] = change.data;
      });
      setData(updated);
    }

    if (onEditCustomActivity && customRowChanges.length > 0) {
      customRowChanges.forEach(row => {
        const customId = (row as any)._customId;
        if (!customId) return;
        const c = customActivities.find(x => x.id === customId);
        if (!c) return;

        const newDesc = row[1] || '';
        const newAreas = row[2] || '';
        const newDept = row[3] || '';
        const newCum = row[4] || '0';
        const newToday = row[5] || '0';

        const hasCustomChanges =
          newDesc !== (c.description || '') ||
          newAreas !== (c.extraData?.areas || '') ||
          newDept !== (c.extraData?.department || '') ||
          newCum !== String(c.cumulative || 0) ||
          newToday !== String(c.extraData?.todayValue || 0);

        if (hasCustomChanges) {
          onEditCustomActivity({
            id: customId,
            sheetType: 'pss_manpower',
            description: newDesc,
            cumulative: Number(newCum) || 0,
            extraData: {
              ...c.extraData,
              areas: newAreas,
              department: newDept,
              todayValue: newToday,
            }
          });
        }
      });
    }

  }, [data, setData, customActivities, onEditCustomActivity]);

  const handleRowDelete = useCallback((index: number) => {
    const row = tableData[index];
    if (row && (row as any)._isCustomRow && onDeleteCustomActivity) {
      const customId = (row as any)._customId;
      if (customId) onDeleteCustomActivity(customId);
    }
  }, [tableData, onDeleteCustomActivity]);

  return (
    <div className="space-y-4 w-full flex-1 min-h-0 flex flex-col">
      {!isLocked && onAddCustomActivity && (
        <div className="flex justify-end px-2">
          <button
            onClick={handleInlineAdd}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" />
            Add DPR Activity
          </button>
        </div>
      )}

      <StyledExcelTable
        title="PSS Project - Manpower"
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
        headerStructure={headerStructure}
        rowStyles={rowStyles}
        status={status}
        onExportAll={onExportAll}
        disableAutoHeaderColors={true}
        projectId={projectId}
        sheetType="pss_manpower"
        onRowDelete={isPmagOrAdmin && !isLocked && onDeleteCustomActivity ? handleRowDelete : undefined}
        rowIsEditable={(idx) => {
          const row = tableData[idx] as any;
          return row && !row.isCategoryRow && !row.isTotalRow;
        }}
        rowIsDeletable={(idx) => !!(tableData[idx] as any)?._isCustomRow && isPmagOrAdmin}
      />
    </div>
  );
});
