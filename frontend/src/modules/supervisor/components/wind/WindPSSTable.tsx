import React, { useMemo, useCallback, useState } from 'react';
import { StyledExcelTable } from "@/components/StyledExcelTable";
import { indianDateFormat } from "@/services/dprService";
import { Plus } from 'lucide-react';
import { AddCustomActivityModal } from '../AddCustomActivityModal';
import { useAuth } from '@/modules/auth/contexts/AuthContext';

export interface WindPSSData {
  sNo?: string;
  activityId?: string;
  description: string;
  priority: string;
  duration: string;
  baselineStart: string;
  baselineFinish: string;
  actualStart: string;
  actualFinish: string;
  forecastStart: string;
  forecastFinish: string;
  vendorName: string;
  uom: string;
  planTillDate: string;
  actualTillDate: string;
  balance: string;
  [key: string]: any;
}

interface WindPSSTableProps {
  data: WindPSSData[];
  setData: (data: WindPSSData[]) => void;
  onSave?: () => void;
  onSubmit?: () => void;
  isLocked?: boolean;
  status?: string;
  onExportAll?: () => void;
  projectId?: number;
  onPush?: () => void;
  customActivities?: WindPSSData[];
  onAddCustomActivity?: (activity: any) => void;
  onEditCustomActivity?: (activity: any) => void;
  onDeleteCustomActivity?: (id: number) => void;
}

export const WindPSSTable: React.FC<WindPSSTableProps> = ({
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
}) => {
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingActivity, setEditingActivity] = useState<any>(null);

  const { user } = useAuth();
  const userRoleLower = (user?.role || user?.Role || '').toLowerCase();
  const isPmagOrAdmin = userRoleLower === 'pmag' || userRoleLower === 'super admin';
  const columns = useMemo(() => [
    "S.No",
    "Description",
    "Priority",
    "Duration",
    "Baseline Start",
    "Baseline Finish",
    "Actual/Forecast Start",
    "Actual/Forecast Finish",
    "Vendor Name",
    "UOM",
    "Plan till date",
    "Actual till date",
    "Balance",
  ], []);

  const columnWidths = useMemo(() => ({
    "S.No": 60,
    "Description": 250,
    "Priority": 80,
    "Duration": 80,
    "Baseline Start": 110,
    "Baseline Finish": 110,
    "Actual/Forecast Start": 110,
    "Actual/Forecast Finish": 110,
    "Vendor Name": 160,
    "UOM": 60,
    "Plan till date": 120,
    "Actual till date": 120,
    "Balance": 100,
  }), []);

  const columnTypes = useMemo(() => ({
    "S.No": "text" as const,
    "Description": "text" as const,
    "Priority": "text" as const,
    "Duration": "text" as const,
    "Baseline Start": "text" as const,
    "Baseline Finish": "text" as const,
    "Actual/Forecast Start": "date" as const,
    "Actual/Forecast Finish": "date" as const,
    "Vendor Name": "text" as const,
    "UOM": "text" as const,
    "Plan till date": "number" as const,
    "Actual till date": "number" as const,
    "Balance": "number" as const,
  }), []);

  const editableColumns = useMemo(() => [
    "Actual/Forecast Start", "Actual/Forecast Finish", "Actual till date"
  ], []);

  const headerStructure = useMemo(() => [
    [
      { label: "S.No", rowSpan: 2, colSpan: 1 },
      { label: "Description", rowSpan: 2, colSpan: 1 },
      { label: "Priority", rowSpan: 2, colSpan: 1 },
      { label: "Duration", rowSpan: 2, colSpan: 1 },
      { label: "Baseline", colSpan: 2, rowSpan: 1 },
      { label: "Actual/Forecast", colSpan: 2, rowSpan: 1 },
      { label: "Vendor Name", rowSpan: 2, colSpan: 1 },
      { label: "UOM", rowSpan: 2, colSpan: 1 },
      { label: "Material till date", colSpan: 2, rowSpan: 1 },
      { label: "Balance", rowSpan: 2, colSpan: 1 },
    ],
    [
      { label: "Start", colSpan: 1, rowSpan: 1 },
      { label: "Finish", colSpan: 1, rowSpan: 1 },
      { label: "Start", colSpan: 1, rowSpan: 1 },
      { label: "Finish", colSpan: 1, rowSpan: 1 },
      { label: "Plan", colSpan: 1, rowSpan: 1 },
      { label: "Actual", colSpan: 1, rowSpan: 1 },
    ]
  ], []);

  const tableData = useMemo(() => {
    const safeData = Array.isArray(data) ? data : [];
    const safeCustom = Array.isArray(customActivities) ? customActivities : [];
    const allData = [...safeData, ...safeCustom];
    const formatDt = (dt: any) => {
      if (!dt) return '';
      const dtStr = String(dt).split('T')[0];
      return indianDateFormat(dtStr) || dtStr;
    };

    const rows: any[] = [];
    let currentWbs: string | null = null;
    let actIndex = 1;

    // Track if we need a DPR Activities header
    let addedDprHeader = false;

    allData.forEach((row, index) => {
      const planVal = Number(row.planTillDate) || 0;
      const actualVal = Number(row.actualTillDate) || 0;
      const balance = Math.max(0, planVal - actualVal);

      // Inject DPR Activities header before first custom row
      if ((row as any).isCustom && !addedDprHeader) {
        addedDprHeader = true;
        const dprRow = ["", "📝 DPR Activities", "", "", "", "", "", "", "", "", "", "", ""];
        (dprRow as any).isCategoryRow = true;
        rows.push(dprRow);
      }

      // Inject Category Header for P6 rows
      if (!(row as any).isCustom && row.wbsName !== currentWbs) {
        currentWbs = row.wbsName;
        const catRow = ["", currentWbs || "Other PSS Activities", "", "", "", "", "", "", "", "", "", "", ""];
        (catRow as any).isCategoryRow = true;
        rows.push(catRow);
      }

      const rowData = [
        String(actIndex++),
        ((row as any).isCustom ? '📝 ' : '') + (row.description || ''),
        row.priority || '',
        row.duration || '',
        formatDt(row.baselineStart || (row as any).plannedStart),
        formatDt(row.baselineFinish || (row as any).plannedFinish),
        formatDt(row.actualStart) || formatDt(row.forecastStart),
        formatDt(row.actualFinish) || formatDt(row.forecastFinish),
        row.vendorName || row.soVendorName || '',
        row.uom || 'Nos',
        String(planVal || (row as any).scope || 0),
        String(actualVal || (row as any).completed || 0),
        String(balance),
      ];
      if ((row as any).isCustom) {
        (rowData as any)._isCustomRow = true;
        (rowData as any)._customId = row.id;
      }
      rows.push(rowData);
    });

    return rows;
  }, [data, customActivities]);

  const rowStyles = useMemo(() => {
    const styles: Record<number, any> = {};
    tableData.forEach((row, index) => {
      if ((row as any).isCategoryRow) {
        styles[index] = {
          backgroundColor: "#d1d5db",
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

  const handleAddActivity = (activity: any) => {
    if (editingActivity && onEditCustomActivity) {
      onEditCustomActivity({
        ...activity,
        id: editingActivity.id,
        sheetType: 'wind_pss',
      });
    } else if (onAddCustomActivity) {
      onAddCustomActivity({
        ...activity,
        sheetType: 'wind_pss',
      });
    }
    setEditingActivity(null);
  };

  const handleRowEdit = (index: number) => {
    const dataLen = Array.isArray(data) ? data.length : 0;
    // index here is the row index in the data array.
    // However, tableData has headers and categories. But StyledExcelTable passes originalIndex
    // Wait, originalIndex maps to tableData or allData?
    // In WindPSSTable, data and customActivities are merged into `allData`. 
    // And `originalIndex` in `tableData` isn't mapping nicely to `data` directly because `rows` has categories injected.
    // Wait! In StyledExcelTable, `originalIndex` is the index of `tableData`. 
    // Let's get the original row from tableData.
    const tableRow = tableData[index];
    if (tableRow && (tableRow as any)._isCustomRow) {
      // Find the custom activity. We need to match by description or find its index.
      // A better way: in tableData mapping, we can store the customActivity id in the row object.
      const customId = (tableRow as any)._customId;
      const customActivity = customActivities.find(c => c.id === customId);
      if (customActivity) {
        setEditingActivity(customActivity);
        setShowAddModal(true);
      }
    }
  };

  const handleRowDelete = (index: number) => {
    const tableRow = tableData[index];
    if (tableRow && (tableRow as any)._isCustomRow && onDeleteCustomActivity) {
      const customId = (tableRow as any)._customId;
      if (customId) onDeleteCustomActivity(customId);
    }
  };

  const handleDataChange = useCallback((newData: any[][]) => {
    const updated = newData.filter(r => !(r as any).isTotalRow && !(r as any).isCategoryRow).map((row, index) => {
      const original = (data as any[])[index];
      if (!original) return null;

      return {
        ...original,
        _cellStatuses: (row as any)._cellStatuses,
        actualStart: (row[6] !== (indianDateFormat(original.actualStart) || indianDateFormat(original.forecastStart) || ''))
          ? (row[6] || '') : (original.actualStart || ''),
        actualFinish: (row[7] !== (indianDateFormat(original.actualFinish) || indianDateFormat(original.forecastFinish) || ''))
          ? (row[7] || '') : (original.actualFinish || ''),
        forecastStart: original.forecastStart || '',
        forecastFinish: original.forecastFinish || '',
        actualTillDate: row[11] || '0',
        completed: row[11] || '0', // Crucial for backend P6 Push Service
      };
    }).filter(r => r !== null);

    setData(updated);
  }, [data, setData]);

  // Dynamic coloring for dates: Actual Start/Finish vs Forecast Start
  const cellTextColors = useMemo(() => {
    const colors: Record<number, Record<string, string>> = {};

    tableData.forEach((row, rowIndex) => {
      if ((row as any).isCategoryRow) return;
      const original = (data as any[])[rowIndex];
      if (!original) return;

      const colorsForRow: Record<string, string> = {};

      const parseDate = (dStr: string) => {
        if (!dStr || dStr === '-') return null;
        if (dStr.includes('T')) dStr = dStr.split('T')[0];
        const parts = dStr.split('-');
        if (parts.length === 3) {
          if (parts[0].length === 4) return new Date(dStr);
          const day = parseInt(parts[0]);
          const mStr = parts[1];
          const yrShort = parseInt(parts[2]);
          const mNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
          const mIdx = mNames.indexOf(mStr);
          if (mIdx === -1) return new Date(dStr);
          const yr = yrShort + (yrShort < 70 ? 2000 : 1900);
          return new Date(yr, mIdx, day);
        }
        return null;
      };

      const isValidDate = (dStr: string | null | undefined) => dStr && typeof dStr === 'string' && dStr.trim() !== '' && dStr !== '-';

      const effectiveStart = parseDate(original.actualStart) || parseDate(original.forecastStart);
      if (effectiveStart) {
        colorsForRow["Actual/Forecast Start"] = isValidDate(original.actualStart) ? "#16a34a" : "#2563eb";
      }

      const effectiveFinish = parseDate(original.actualFinish) || parseDate(original.forecastFinish);
      if (effectiveFinish) {
        colorsForRow["Actual/Forecast Finish"] = isValidDate(original.actualFinish) ? "#16a34a" : "#2563eb";
      }

      if (Object.keys(colorsForRow).length > 0) {
        colors[rowIndex] = colorsForRow;
      }
    });

    return colors;
  }, [tableData, data]);

  return (
    <div className="space-y-4 w-full flex-1 min-h-0 flex flex-col">
      {/* Add Activity Button */}
      {!isLocked && onAddCustomActivity && (
        <div className="flex justify-end px-2">
          <button
            onClick={() => { setEditingActivity(null); setShowAddModal(true); }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" />
            Add DPR Activity
          </button>
        </div>
      )}

      <StyledExcelTable
        title="Wind Project - PSS Progress Sheet"
        columns={columns}
        data={tableData}
        onDataChange={handleDataChange}
        onSave={onSave || (() => { })}
        onSubmit={onSubmit}
        onPush={onPush}
        isReadOnly={isLocked}
        editableColumns={editableColumns}
        columnTypes={columnTypes}
        columnWidths={columnWidths}
        headerStructure={headerStructure}
        rowStyles={rowStyles}
        cellTextColors={cellTextColors}
        status={status}
        onExportAll={onExportAll}
        disableAutoHeaderColors={true}
        projectId={projectId}
        sheetType="wind_pss"
        onRowEdit={!isLocked && onEditCustomActivity ? handleRowEdit : undefined}
        onRowDelete={!isLocked && onDeleteCustomActivity ? handleRowDelete : undefined}
        rowIsEditable={(idx) => !!(tableData[idx] as any)?._isCustomRow}
        rowIsDeletable={(idx) => !!(tableData[idx] as any)?._isCustomRow && isPmagOrAdmin}
      />

      {/* Add Custom Activity Modal */}
      <AddCustomActivityModal
        isOpen={showAddModal}
        onClose={() => { setShowAddModal(false); setEditingActivity(null); }}
        onAdd={handleAddActivity}
        sheetType="wind_pss"
        defaultWbsName="BOS CONSTRUCTION"
        defaultCategory="PSS"
        initialData={editingActivity}
      />
    </div>
  );
};
