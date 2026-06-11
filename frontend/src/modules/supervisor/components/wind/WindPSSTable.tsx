import React, { useMemo, useCallback } from 'react';
import { StyledExcelTable } from "@/components/StyledExcelTable";
import { indianDateFormat } from "@/services/dprService";
import { Plus, Upload } from 'lucide-react';
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
  onBulkUploadActivities?: () => void;
  yesterday?: string;
  today?: string;
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
  onBulkUploadActivities,
  yesterday,
  today,
}) => {
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
    "Actual Start",
    "Actual Finish",
    "Forecast Start",
    "Forecast Finish",
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
    "Actual Start": 100,
    "Actual Finish": 100,
    "Forecast Start": 100,
    "Forecast Finish": 100,
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
    "Actual Start": "date" as const,
    "Actual Finish": "date" as const,
    "Forecast Start": "date" as const,
    "Forecast Finish": "date" as const,
    "Vendor Name": "text" as const,
    "UOM": "text" as const,
    "Plan till date": "number" as const,
    "Actual till date": "number" as const,
    "Balance": "number" as const,
  }), []);

  // For custom rows, all columns except S.No and Balance are editable inline
  const editableColumns = useMemo(() => [
    "Description", "Priority", "Duration",
    "Actual Start", "Actual Finish",
    "Vendor Name", "UOM", "Plan till date", "Actual till date"
  ], []);

  const headerStructure = useMemo(() => [
    [
      { label: "S.No", rowSpan: 2, colSpan: 1 },
      { label: "Description", rowSpan: 2, colSpan: 1 },
      { label: "Priority", rowSpan: 2, colSpan: 1 },
      { label: "Duration", rowSpan: 2, colSpan: 1 },
      { label: "Baseline", colSpan: 2, rowSpan: 1 },
      { label: "Actual", colSpan: 2, rowSpan: 1 },
      { label: "Forecast", colSpan: 2, rowSpan: 1 },
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

    const parsedYesterdayStr = yesterday ? String(yesterday).split('T')[0] : '';

    const getDates = (r: any) => {
      const s = r.actualStart || r.forecastStart || r.plannedStart;
      const f = r.actualFinish || r.forecastFinish || r.plannedFinish;
      let actS = '', fcstS = '', actF = '', fcstF = '';
      
      if (s) {
        const sStr = String(s).split('T')[0];
        if (parsedYesterdayStr && sStr <= parsedYesterdayStr) {
          actS = indianDateFormat(sStr) || sStr;
        } else {
          fcstS = indianDateFormat(sStr) || sStr;
        }
      }
      if (f) {
        const fStr = String(f).split('T')[0];
        if (parsedYesterdayStr && fStr <= parsedYesterdayStr) {
          actF = indianDateFormat(fStr) || fStr;
        } else {
          fcstF = indianDateFormat(fStr) || fStr;
        }
      }
      return { actS, fcstS, actF, fcstF };
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
      const d = getDates(row);

      // Inject DPR Activities header before first custom row
      if ((row as any).isCustom && !addedDprHeader) {
        addedDprHeader = true;
        const dprRow = ["", "📝 DPR Level Activities", "", "", "", "", "", "", "", "", "", "", "", "", ""];
        (dprRow as any).isCategoryRow = true;
        rows.push(dprRow);
      }

      // Inject Category Header for P6 rows
      if (!(row as any).isCustom && row.wbsName !== currentWbs) {
        currentWbs = row.wbsName;
        let wbsCount = 0;
        allData.forEach(r => {
          if (!(r as any).isCustom && r.wbsName === currentWbs) wbsCount++;
        });

        if (wbsCount >= 2) {
          const catRow = ["", currentWbs || "Other PSS Activities", "", "", "", "", "", "", "", "", "", "", "", "", ""];
          (catRow as any).isCategoryRow = true;
          rows.push(catRow);
        }
      }

      const rowData = [
        String(actIndex++),
        row.description || '',
        row.priority || '',
        row.duration || '',
        formatDt(row.baselineStart || (row as any).plannedStart),
        formatDt(row.baselineFinish || (row as any).plannedFinish),
        d.actS,
        d.actF,
        d.fcstS,
        d.fcstF,
        row.vendorName || row.soVendorName || '',
        row.uom || 'Nos',
        String(planVal || (row as any).scope || 0),
        String(actualVal || (row as any).completed || 0),
        String(balance),
      ];
      (rowData as any)._activityId = row.activityId;
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
        sheetType: 'wind_pss',
        description: 'New DPR Activity',
        uom: 'Nos',
        scope: 0,
        wbsName: 'BOS CONSTRUCTION',
        category: 'PSS',
      });
    }
  }, [onAddCustomActivity]);

  const handleRowDelete = useCallback((index: number) => {
    const tableRow = tableData[index];
    if (tableRow && (tableRow as any)._isCustomRow && onDeleteCustomActivity) {
      const customId = (tableRow as any)._customId;
      if (customId) onDeleteCustomActivity(customId);
    }
  }, [tableData, onDeleteCustomActivity]);

  const handleDataChange = useCallback((newData: any[][]) => {
    // Separate P6 rows and custom rows
    const p6Rows: any[] = [];
    const customRowChanges: any[] = [];

    newData.forEach((row) => {
      if ((row as any).isTotalRow || (row as any).isCategoryRow) return;

      if ((row as any)._isCustomRow) {
        // Custom row — collect changes for inline editing
        customRowChanges.push(row);
      } else {
        p6Rows.push(row);
      }
    });

    // Update P6 data
    const updated = p6Rows.map((row) => {
      const actId = (row as any)._activityId;
      if (!actId) return null;
      const original = (data as any[]).find(d => d.activityId === actId);
      if (!original) return null;

      let newActualStart = row[6] || '';
      if (newActualStart !== (indianDateFormat(original.actualStart) || '')) {
        let isFuture = false;
        if (newActualStart && yesterday) {
          const editedDateStr = new Date(newActualStart).toISOString().split('T')[0];
          const calDateStr = new Date(yesterday).toISOString().split('T')[0];
          if (editedDateStr > calDateStr) isFuture = true;
        }
        if (isFuture) {
          if (window.confirm("You selected a future date for an Actual Start.\nP6 only accepts past/present dates for Actuals.\n\nClick OK to automatically save it as a Forecast date instead.\nClick Cancel to undo your change.")) {
            // Keep the new date
          } else {
            newActualStart = original.actualStart || '';
          }
        }
      } else {
        newActualStart = original.actualStart || '';
      }

      let newActualFinish = row[7] || '';
      if (newActualFinish !== (indianDateFormat(original.actualFinish) || '')) {
        let isFuture = false;
        if (newActualFinish && yesterday) {
          const editedDateStr = new Date(newActualFinish).toISOString().split('T')[0];
          const calDateStr = new Date(yesterday).toISOString().split('T')[0];
          if (editedDateStr > calDateStr) isFuture = true;
        }
        if (isFuture) {
          if (window.confirm("You selected a future date for an Actual Finish.\nP6 only accepts past/present dates for Actuals.\n\nClick OK to automatically save it as a Forecast date instead.\nClick Cancel to undo your change.")) {
            // Keep the new date
          } else {
            newActualFinish = original.actualFinish || '';
          }
        }
      } else {
        newActualFinish = original.actualFinish || '';
      }

      return {
        ...original,
        _cellStatuses: (row as any)._cellStatuses,
        actualStart: newActualStart,
        actualFinish: newActualFinish,
        forecastStart: (row[8] !== (indianDateFormat(original.forecastStart) || ''))
          ? (row[8] || '') : (original.forecastStart || ''),
        forecastFinish: (row[9] !== (indianDateFormat(original.forecastFinish) || ''))
          ? (row[9] || '') : (original.forecastFinish || ''),
        actualTillDate: row[13] || '0',
        completed: row[13] || '0', // Crucial for backend P6 Push Service
      };
    }).filter(r => r !== null);

    setData(updated);

    // Update custom rows inline
    if (onEditCustomActivity && customRowChanges.length > 0) {
      customRowChanges.forEach((row) => {
        const customId = (row as any)._customId;
        if (!customId) return;
        const original = customActivities.find(c => c.id === customId);
        if (!original) return;

        // Check if anything actually changed
        const newDesc = row[1] || '';
        const newPriority = row[2] || '';
        const newDuration = row[3] || '';
        const newActStart = row[6] || '';
        let finalCustomActStart = original.actualStart || '';
        if (newActStart !== (indianDateFormat(original.actualStart) || '')) {
          let isFuture = false;
          if (newActStart && yesterday) {
            const editedDateStr = new Date(newActStart).toISOString().split('T')[0];
            const calDateStr = new Date(yesterday).toISOString().split('T')[0];
            if (editedDateStr > calDateStr) isFuture = true;
          }
          if (isFuture) {
            if (window.confirm("You selected a future date for an Actual Start.\nP6 only accepts past/present dates for Actuals.\n\nClick OK to automatically save it as a Forecast date instead.\nClick Cancel to undo your change.")) {
              finalCustomActStart = newActStart;
            }
          } else {
            finalCustomActStart = newActStart;
          }
        }

        const newActFinish = row[7] || '';
        let finalCustomActFinish = original.actualFinish || '';
        if (newActFinish !== (indianDateFormat(original.actualFinish) || '')) {
          let isFuture = false;
          if (newActFinish && yesterday) {
            const editedDateStr = new Date(newActFinish).toISOString().split('T')[0];
            const calDateStr = new Date(yesterday).toISOString().split('T')[0];
            if (editedDateStr > calDateStr) isFuture = true;
          }
          if (isFuture) {
            if (window.confirm("You selected a future date for an Actual Finish.\nP6 only accepts past/present dates for Actuals.\n\nClick OK to automatically save it as a Forecast date instead.\nClick Cancel to undo your change.")) {
              finalCustomActFinish = newActFinish;
            }
          } else {
            finalCustomActFinish = newActFinish;
          }
        }
        const newFcstStart = row[8] || '';
        const newFcstFinish = row[9] || '';
        const newVendor = row[10] || '';
        const newUom = row[11] || '';
        const newPlan = row[12] || '0';
        const newActual = row[13] || '0';

        const hasChanges =
          newDesc !== (original.description || '') ||
          newPriority !== (original.priority || '') ||
          newDuration !== (original.duration || '') ||
          newFcstStart !== (original.forecastStart || '') ||
          newFcstFinish !== (original.forecastFinish || '') ||
          finalCustomActStart !== (original.actualStart || '') ||
          finalCustomActFinish !== (original.actualFinish || '') ||
          newVendor !== (original.vendorName || original.soVendorName || '') ||
          newUom !== (original.uom || 'Nos') ||
          newPlan !== String(Number(original.planTillDate) || Number((original as any).scope) || 0) ||
          newActual !== String(Number(original.actualTillDate) || Number((original as any).completed) || 0);

        if (hasChanges) {
          onEditCustomActivity({
            id: customId,
            sheetType: 'wind_pss',
            description: newDesc,
            uom: newUom,
            scope: Number(newPlan) || 0,
            cumulative: Number(newActual) || 0,
            plannedStart: finalCustomActStart,
            plannedFinish: finalCustomActFinish,
            remarks: '',
            extraData: {
              priority: newPriority,
              duration: newDuration,
              vendorName: newVendor,
            },
          });
        }
      });
    }
  }, [data, setData, customActivities, onEditCustomActivity]);

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

      if (isValidDate(original.actualStart)) {
        colorsForRow["Actual Start"] = "#16a34a";
      }
      if (isValidDate(original.actualFinish)) {
        colorsForRow["Actual Finish"] = "#16a34a";
      }
      if (isValidDate(original.forecastStart)) {
        colorsForRow["Forecast Start"] = "#2563eb";
      }
      if (isValidDate(original.forecastFinish)) {
        colorsForRow["Forecast Finish"] = "#2563eb";
      }

      if (Object.keys(colorsForRow).length > 0) {
        colors[rowIndex] = colorsForRow;
      }
    });

    return colors;
  }, [tableData, data]);

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
        projectId={projectId}
        sheetType="wind_pss"
        onRowDelete={isPmagOrAdmin && !isLocked && onDeleteCustomActivity ? handleRowDelete : undefined}
        rowIsEditable={() => false}
        rowIsDeletable={(idx) => !!(tableData[idx] as any)?._isCustomRow && isPmagOrAdmin}
      />
    </div>
  );
};
