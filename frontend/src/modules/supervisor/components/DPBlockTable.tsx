import { useState, useEffect, useMemo, useCallback } from "react";
import { StyledExcelTable } from "@/components/StyledExcelTable";
import { StatusChip } from "@/components/StatusChip";
import { indianDateFormat } from "@/services/dprService";
import { EntryStatus } from "@/types";
import { Plus, Upload } from "lucide-react";
import { useAuth } from '@/modules/auth/contexts/AuthContext';

export interface DPBlockData {
  // Identification
  activityId: string;
  activities: string;
  description?: string;

  // Block details (from P6 UDF)
  blockCapacity: string;
  phase: string;
  block: string;
  spvNumber: string;

  // Status fields
  priority: string;
  scope: string;
  hold: string;
  front: string;
  completed: string;
  balance: string;

  // Date fields
  basePlanStart: string;
  basePlanFinish: string;
  actualStartDate: string;
  actualFinishDate: string;
  forecastStartDate: string;
  forecastFinishDate: string;
  remarks?: string;
  yesterdayIsApproved?: boolean;
  _cellStatuses?: Record<string, any>;
  [key: string]: any;
}

interface DPBlockTableProps {
  data: DPBlockData[];
  setData: (data: DPBlockData[]) => void;
  onSave: () => void;
  onSubmit?: () => void;
  yesterday: string;
  today: string;
  isLocked?: boolean;
  status?: EntryStatus;

  onExportAll?: () => void;
  totalRows?: number;
  onFullscreenToggle?: (isFullscreen: boolean) => void;
  onReachEnd?: () => void;
  universalFilter?: string;
  projectId?: number;
  selectedBlock?: string;
  onPush?: () => void;

  customActivities?: any[];
  onAddCustomActivity?: (activity: any) => void;
  onEditCustomActivity?: (activity: any) => void;
  onDeleteCustomActivity?: (id: number) => void;
  onBulkUploadActivities?: () => void;
}

export function DPBlockTable({ 
  data, setData, onSave, onSubmit, yesterday, today, 
  isLocked = false, status = 'draft', onExportAll, totalRows, 
  onFullscreenToggle, onReachEnd, universalFilter, projectId, 
  selectedBlock = "ALL", onPush,
  customActivities = [], onAddCustomActivity, onEditCustomActivity, onDeleteCustomActivity,
  onBulkUploadActivities
}: DPBlockTableProps) {
  
  const { user } = useAuth();
  const userRole = (user?.role || user?.Role || '').toLowerCase();
  const isPmagOrAdmin = userRole.includes('pmag') || userRole.includes('admin');

  const columns = [
    "Activity ID",
    "Activity",
    "Block Capacity (MWac)",
    "Phase",
    "Block",
    "SPV Number",
    "Priority",
    "Total Quantity",
    "Hold",
    "Front",
    "Completed",
    "Balance",
    "Baseline Start",
    "Baseline End",
    "Actual Start",
    "Actual Finish",
    "Forecast Start",
    "Forecast Finish",
    "Remarks"
  ];

  // Define column widths for better alignment
  const columnWidths = {
    "Activity ID": 80,
    "Activity": 150,
    "Block Capacity (MWac)": 100,
    "Phase": 70,
    "Block": 70,
    "SPV Number": 80,
    "Priority": 70,
    "Total Quantity": 100,
    "Hold": 60,
    "Front": 60,
    "Completed": 80,
    "Balance": 70,
    "Baseline Start": 90,
    "Baseline End": 90,
    "Actual Start": 110,
    "Actual Finish": 110,
    "Forecast Start": 110,
    "Forecast Finish": 110,
    "Remarks": 150
  };

  // Expand editable columns for custom rows
  const editableColumns = [
    "Activity",
    "Phase",
    "Priority",
    "Total Quantity",
    "Hold",
    "Front",
    "Completed",
    "Actual Start",
    "Actual Finish",
    "Forecast Start",
    "Forecast Finish",
    "Remarks"
  ];

  // Filter data based on selected block and universal filter
  const filteredData = useMemo(() => {
    if (!Array.isArray(data)) return [];
    const safeCustom = Array.isArray(customActivities) ? customActivities : [];
    
    const filterText = (universalFilter || "").trim().toUpperCase();

    const p6Result = data.filter(d => {
      const matchBlock = selectedBlock === "ALL" || d.block === selectedBlock;
      const matchActivity = !filterText || filterText === "ALL" || 
                           (d.activityId && String(d.activityId).toUpperCase().includes(filterText)) ||
                           (d.activities && String(d.activities).toUpperCase().includes(filterText));
      return matchBlock && matchActivity;
    }).sort((a, b) => (String(a.activityId || "")).localeCompare(String(b.activityId || "")));

    const customResult = safeCustom.filter(c => {
      const matchBlock = selectedBlock === "ALL" || c.block === selectedBlock;
      const matchActivity = !filterText || filterText === "ALL" || 
                           (c.description && String(c.description).toUpperCase().includes(filterText));
      return matchBlock && matchActivity;
    });

    const finalResult: any[] = [...p6Result];

    if (customResult.length > 0) {
      finalResult.push({
        isCategoryRow: true,
        description: "📝 DPR Level Activities"
      });
      customResult.forEach(c => {
        finalResult.push({
          ...c,
          isCustom: true,
          _isCustomRow: true,
          _customId: c.id,
          activityId: '',
          activities: c.description || '',
          blockCapacity: c.extraData?.blockCapacity || '',
          phase: c.extraData?.phase || '',
          block: c.block || '',
          spvNumber: c.extraData?.spvNumber || '',
          priority: c.extraData?.priority || '',
          scope: String(c.scope || 0),
          hold: c.extraData?.hold || '',
          front: c.extraData?.front || '',
          completed: String(c.cumulative || 0),
          balance: String(Math.max(0, (c.scope || 0) - (c.cumulative || 0))),
          basePlanStart: c.plannedStart || '',
          basePlanFinish: c.plannedFinish || '',
          actualStartDate: c.actualStart || '',
          actualFinishDate: c.actualFinish || '',
          remarks: c.remarks || '',
        });
      });
    }

    return finalResult;
  }, [data, customActivities, selectedBlock, universalFilter]);

  const tableData = useMemo(() => {
    return filteredData.map(row => {
      if (row.isCategoryRow) {
        const arr: any = [
          "", row.description || "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", ""
        ];
        arr.isCategoryRow = true;
        return arr;
      }

      const arr: any = [
        row.activityId || '',
        row.description || (row as any).activities || (row as any).activity || (row as any).activity_name || (row as any).name || (row as any).Name || '',
        row.blockCapacity || '',
        row.phase || '',
        row.block || '',
        row.spvNumber || '',
        row.priority || '',
        row.scope ? Number(row.scope).toFixed(2) : "0.00",
        row.hold || '',
        row.front || '',
        row.completed ? Number(row.completed).toFixed(2) : "0.00",
        row.balance ? Number(row.balance).toFixed(2) : "0.00",
        indianDateFormat(row.basePlanStart) || '',
        indianDateFormat(row.basePlanFinish) || '',
        indianDateFormat(row.actualStartDate) || '',
        indianDateFormat(row.actualFinishDate) || '',
        indianDateFormat(row.forecastStartDate) || '',
        indianDateFormat(row.forecastFinishDate) || '',
        row.remarks || ''
      ];

      arr._cellStatuses = { ...((row as any)._cellStatuses || {}) };
      if (row._isCustomRow) {
        arr._isCustomRow = true;
        arr._customId = row._customId;
      }

      return arr;
    });
  }, [filteredData]);

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

  const handleInlineAdd = useCallback(() => {
    if (onAddCustomActivity) {
      onAddCustomActivity({
        sheetType: 'dp_block',
        description: 'New DPR Activity',
        uom: 'Nos',
        scope: 0,
        block: selectedBlock !== 'ALL' ? selectedBlock : '',
      });
    }
  }, [onAddCustomActivity, selectedBlock]);

  // Handle data changes from ExcelTable
  const handleDataChange = useCallback((newData: any[][]) => {
    const p6RowChanges: any[] = [];
    const customRowChanges: any[] = [];

    newData.forEach((row, index) => {
      const original = filteredData[index];
      if (!original || original.isCategoryRow) return;

      if ((row as any)._isCustomRow) {
        customRowChanges.push({ row, original });
      } else {
        p6RowChanges.push({ row, original });
      }
    });

    const updatedP6Data = p6RowChanges.map(({ row, original }) => {
      const updatedRow: any = {
        ...original,
        activityId: row[0] || '',
        activities: row[1] || '',
        blockCapacity: row[2] || '',
        phase: row[3] || '',
        block: row[4] || '',
        spvNumber: row[5] || '',
        priority: row[6] || '',
        scope: row[7] || '',
        hold: row[8] || '',
        front: row[9] || '',
        completed: row[10] || '',
        balance: row[11] || '',
        basePlanStart: row[12] || '',
        basePlanFinish: row[13] || '',
        actualStartDate: row[14] || '',
        actualFinishDate: row[15] || '',
        forecastStartDate: row[16] || '',
        forecastFinishDate: row[17] || '',
        remarks: row[18] || ''
      };

      const cellStatuses = (row as any)['_cellStatuses'];
      if (cellStatuses && Object.keys(cellStatuses).length > 0) {
        updatedRow._cellStatuses = cellStatuses;
      }
      return updatedRow;
    });

    if (updatedP6Data.length > 0) {
      if (selectedBlock !== "ALL") {
        const fullDataCopy = [...data];
        updatedP6Data.forEach(updatedRow => {
          const idx = fullDataCopy.findIndex(d => d.activityId === updatedRow.activityId);
          if (idx !== -1) fullDataCopy[idx] = updatedRow;
        });
        setData(fullDataCopy);
      } else {
        setData(updatedP6Data as any);
      }
    }

    if (onEditCustomActivity && customRowChanges.length > 0) {
      customRowChanges.forEach(({ row }) => {
        const customId = (row as any)._customId;
        if (!customId) return;
        const originalCustom = customActivities.find(c => c.id === customId);
        if (!originalCustom) return;

        const newDesc = row[1] || '';
        const newPhase = row[3] || '';
        const newPriority = row[6] || '';
        const newScope = row[7] || '0';
        const newHold = row[8] || '';
        const newFront = row[9] || '0';
        const newCum = row[10] || '0';
        const newActStart = row[14] || '';
        const newActFinish = row[15] || '';
        const newRemarks = row[18] || '';

        const hasChanges =
          newDesc !== (originalCustom.description || '') ||
          newPhase !== (originalCustom.extraData?.phase || '') ||
          newPriority !== (originalCustom.extraData?.priority || '') ||
          newScope !== String(originalCustom.scope || 0) ||
          newHold !== (originalCustom.extraData?.hold || '') ||
          newFront !== String(originalCustom.extraData?.front || 0) ||
          newCum !== String(originalCustom.cumulative || 0) ||
          newActStart !== (originalCustom.actualStart || '') ||
          newActFinish !== (originalCustom.actualFinish || '') ||
          newRemarks !== (originalCustom.remarks || '');

        if (hasChanges) {
          onEditCustomActivity({
            id: customId,
            sheetType: 'dp_block',
            description: newDesc,
            scope: Number(newScope) || 0,
            cumulative: Number(newCum) || 0,
            plannedStart: newActStart,
            plannedFinish: newActFinish,
            remarks: newRemarks,
            extraData: {
              ...originalCustom.extraData,
              phase: newPhase,
              priority: newPriority,
              hold: newHold,
              front: newFront,
            }
          });
        }
      });
    }

  }, [data, filteredData, selectedBlock, setData, customActivities, onEditCustomActivity]);

  const handleRowDelete = useCallback((index: number) => {
    const row = tableData[index];
    if (row && (row as any)._isCustomRow && onDeleteCustomActivity) {
      const customId = (row as any)._customId;
      if (customId) onDeleteCustomActivity(customId);
    }
  }, [tableData, onDeleteCustomActivity]);

  return (
    <div className="space-y-4 w-full flex-1 min-h-0 flex flex-col">
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

      <StyledExcelTable
        title="DP Block Table"
        columns={columns}
        data={tableData}
        totalRows={totalRows}
        onDataChange={handleDataChange}
        onSave={onSave}
        onSubmit={onSubmit}
        onPush={onPush}
        isReadOnly={isLocked}
        editableColumns={editableColumns}
        columnTypes={{
          "Activity ID": "text",
          "Activity": "text",
          "Block Capacity (MWac)": "text",
          "Phase": "text",
          "Block": "text",
          "SPV Number": "text",
          "Priority": "text",
          "Total Quantity": "number",
          "Hold": "text",
          "Front": "number",
          "Completed": "number",
          "Balance": "number",
          "Baseline Start": "text",
          "Baseline End": "text",
          "Actual Start": "date",
          "Actual Finish": "date",
          "Forecast Start": "date",
          "Forecast Finish": "date",
          "Remarks": "text"
        }}
        columnWidths={columnWidths}
        columnTextColors={{
          "Actual Start": "#00B050",
          "Actual Finish": "#00B050",
          "Forecast Start": "#2E86C1",
          "Forecast Finish": "#2E86C1"
        }}
        columnFontWeights={{
          "Actual Start": "bold",
          "Actual Finish": "bold",
          "Forecast Start": "bold",
          "Forecast Finish": "bold"
        }}
        headerStructure={[
          [
            { label: "Activity ID", rowSpan: 2 },
            { label: "Activity", rowSpan: 2 },
            { label: "Block Capacity (MWac)", rowSpan: 2 },
            { label: "Phase", rowSpan: 2 },
            { label: "Block", rowSpan: 2 },
            { label: "SPV Number", rowSpan: 2 },
            { label: "Priority", rowSpan: 2 },
            { label: "Total Quantity", rowSpan: 2 },
            { label: "Hold", rowSpan: 2 },
            { label: "Front", rowSpan: 2 },
            { label: "Completed", rowSpan: 2 },
            { label: "Balance", rowSpan: 2 },
            { label: "Baseline Start", rowSpan: 2 },
            { label: "Baseline End", rowSpan: 2 },
            { label: "Actual", colSpan: 2 },
            { label: "Forecast", colSpan: 2 },
            { label: "Remarks", rowSpan: 2 }
          ],
          [
            { label: "Actual Start", colSpan: 1, rowSpan: 1 },
            { label: "Actual Finish", colSpan: 1, rowSpan: 1 },
            { label: "Forecast Start", colSpan: 1, rowSpan: 1 },
            { label: "Forecast Finish", colSpan: 1, rowSpan: 1 }
          ]
        ]}
        status={status}
        rowStyles={rowStyles}
        onExportAll={onExportAll}
        onFullscreenToggle={onFullscreenToggle}
        onReachEnd={onReachEnd}
        externalGlobalFilter={universalFilter}
        projectId={projectId}
        sheetType="dp_block"
        onRowDelete={isPmagOrAdmin && !isLocked && onDeleteCustomActivity ? handleRowDelete : undefined}
        rowIsEditable={(idx) => {
          const row = tableData[idx] as any;
          return row && !row.isCategoryRow;
        }}
        rowIsDeletable={(idx) => !!(tableData[idx] as any)?._isCustomRow && isPmagOrAdmin}
      />
    </div>
  );
}
