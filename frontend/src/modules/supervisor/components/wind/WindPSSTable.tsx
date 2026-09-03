import React, { useMemo, useCallback } from 'react';
import { StyledExcelTable } from "@/components/StyledExcelTable";
import { indianDateFormat, parseDateToIso } from "@/services/dprService";
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
  onSave?: (isAuto?: boolean) => void | Promise<void>;
  onSubmit?: () => void;
  isLocked?: boolean;
  status?: string;
  onExportAll?: () => void;
  projectId?: number;
  onPush?: () => void;
  customActivities?: WindPSSData[];
  onAddCustomActivity?: (activity: any, silent?: boolean) => void;
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
    "Status",
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
    "Physical Progress %",
  ], []);

  const columnWidths = useMemo(() => ({
    "S.No": 60,
    "Description": 250,
    "Status": 100,
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
    "Physical Progress %": 120,
  }), []);

  const columnTypes = useMemo(() => ({
    "S.No": "text" as const,
    "Description": "text" as const,
    "Status": "select" as const,
    "Priority": "text" as const,
    "Duration": "text" as const,
    "Baseline Start": "text" as const,
    "Baseline Finish": "text" as const,
    "Actual Start": "date" as const,
    "Actual Finish": "date" as const,
    "Forecast Start": "date" as const,
    "Forecast Finish": "date" as const,
    "Vendor Name": "alphabet" as const,
    "UOM": "text" as const,
    "Plan till date": "number" as const,
    "Actual till date": "number" as const,
    "Balance": "number" as const,
    "Physical Progress %": "number" as const,
  }), []);

  // For custom rows, all columns except S.No and Balance are editable inline
  const editableColumns = useMemo(() => [
    "Description", "Status", "Priority", "Duration",
    "Actual Start", "Actual Finish",
    "Vendor Name", "UOM", "Plan till date", "Actual till date", "Physical Progress %"
  ], []);

  const headerStructure = useMemo(() => [
    [
      { label: "S.No", rowSpan: 2, colSpan: 1 },
      { label: "Description", rowSpan: 2, colSpan: 1 },
      { label: "Status", rowSpan: 2, colSpan: 1 },
      { label: "Priority", rowSpan: 2, colSpan: 1 },
      { label: "Duration", rowSpan: 2, colSpan: 1 },
      { label: "Baseline", colSpan: 2, rowSpan: 1 },
      { label: "Actual", colSpan: 2, rowSpan: 1 },
      { label: "Forecast", colSpan: 2, rowSpan: 1 },
      { label: "Vendor Name", rowSpan: 2, colSpan: 1 },
      { label: "UOM", rowSpan: 2, colSpan: 1 },
      { label: "Material till date", colSpan: 2, rowSpan: 1 },
      { label: "Balance", rowSpan: 2, colSpan: 1 },
      { label: "Physical Progress %", rowSpan: 2, colSpan: 1 },
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
      let actS = '', fcstS = '', actF = '', fcstF = '';

      // Start Date Logic
      if (r.actualStart) {
        const sStr = String(r.actualStart).split('T')[0];
        if (parsedYesterdayStr && parseDateToIso(sStr) <= parsedYesterdayStr) {
          actS = indianDateFormat(sStr) || sStr;
        } else {
          fcstS = indianDateFormat(sStr) || sStr;
        }
      } else if (r.forecastStart) {
        const sStr = String(r.forecastStart).split('T')[0];
        fcstS = indianDateFormat(sStr) || sStr;
      }

      // Finish Date Logic
      if (r.actualFinish) {
        const fStr = String(r.actualFinish).split('T')[0];
        if (parsedYesterdayStr && parseDateToIso(fStr) <= parsedYesterdayStr) {
          actF = indianDateFormat(fStr) || fStr;
        } else {
          fcstF = indianDateFormat(fStr) || fStr;
        }
      } else if (r.forecastFinish) {
        const fStr = String(r.forecastFinish).split('T')[0];
        fcstF = indianDateFormat(fStr) || fStr;
      }

      return { actS, fcstS, actF, fcstF };
    };

    const rows: any[] = [];
    let currentWbs: string | null = null;
    let actIndex = 1;

    // Track if we need a DPR Activities header
    let addedDprHeader = false;

    allData.forEach((row, index) => {
      const planRaw = row.planTillDate ?? (row as any).scope;
      const actualRaw = row.actualTillDate ?? (row as any).completed;
      const planStr = (planRaw === undefined || planRaw === null || planRaw === 0 || planRaw === '0') ? '' : String(planRaw);
      const actualStr = (actualRaw === undefined || actualRaw === null || actualRaw === 0 || actualRaw === '0') ? '' : String(actualRaw);
      
      const planVal = Number(planStr) || 0;
      const actualVal = Number(actualStr) || 0;
      const balanceStr = (planStr !== '' || actualStr !== '') ? String(Math.max(0, planVal - actualVal)) : '';
      const d = getDates(row);

      // Inject DPR Activities header before first custom row
      if ((row as any).isCustom && !addedDprHeader) {
        addedDprHeader = true;
        const dprRow = ["", "📝 DPR Level Activities", "", "", "", "", "", "", "", "", "", "", "", "", "", "", ""];
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
          const catRow = ["", currentWbs || "Other PSS Activities", "", "", "", "", "", "", "", "", "", "", "", "", "", "", ""];
          (catRow as any).isCategoryRow = true;
          rows.push(catRow);
        }
      }

      const rowData = [
        String(actIndex++),
        row.description || '',
        row.status || 'Not Started',
        row.priority || '',
        row.duration || '',
        formatDt(row.baselineStart || (row as any).plannedStart),
        formatDt(row.baselineFinish || (row as any).plannedFinish),
        d.actS,
        d.fcstS,
        d.actF,
        d.fcstF,
        row.vendorName || row.soVendorName || '',
        row.uom || 'Nos',
        planStr,
        actualStr,
        balanceStr,
        (row as any).percentComplete || (row as any).completionPercentage || (row as any).progress || '',
      ];
      (rowData as any)._activityId = row.activityId;
      (rowData as any)._originalRef = row;
      if ((row as any).isCustom) {
        (rowData as any)._isCustomRow = true;
        (rowData as any)._customId = row.id;
      }
      if (row._cellStatuses) {
        (rowData as any)._cellStatuses = row._cellStatuses;
      }
      rows.push(rowData);
    });

    return rows;
  }, [data, customActivities, yesterday]);

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
}, true);
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
      const original = (row as any)._originalRef;
      if (!original) {
        const actId = (row as any)._activityId;
        if (!actId) return null;
        return (data as any[]).find(d => d.activityId === actId); // fallback
      }

      let newActualStart = row[7] || '';
      let newForecastStart = row[9] || original.forecastStart;
      let isFuture = false;

      if (newActualStart !== (indianDateFormat(original.actualStart) || '')) {
        if (newActualStart && (today || yesterday)) {
          const editedDateStr = new Date(newActualStart).toISOString().split('T')[0];
          const calDateStr = new Date(today || yesterday || '').toISOString().split('T')[0];
          if (editedDateStr > calDateStr) isFuture = true;
        }
        if (isFuture) {
          if (window.confirm("You selected a future date for an Actual Start.\nP6 only accepts past/present dates for Actuals.\n\nClick OK to automatically save it as a Forecast date instead.\nClick Cancel to undo your change.")) {
            newForecastStart = newActualStart;
            newActualStart = original.actualStart || '';
          } else {
            newActualStart = original.actualStart || '';
          }
        }
      } else {
        newActualStart = original.actualStart || '';
      }

      let newActualFinish = row[8] || '';
      let newForecastFinish = row[10] || original.forecastFinish;
      isFuture = false;
      if (newActualFinish !== (indianDateFormat(original.actualFinish) || '')) {
        if (newActualFinish && (today || yesterday)) {
          const editedDateStr = new Date(newActualFinish).toISOString().split('T')[0];
          const calDateStr = new Date(today || yesterday || '').toISOString().split('T')[0];
          if (editedDateStr > calDateStr) isFuture = true;
        }
        if (isFuture) {
          if (window.confirm("You selected a future date for an Actual Finish.\nP6 only accepts past/present dates for Actuals.\n\nClick OK to automatically save it as a Forecast date instead.\nClick Cancel to undo your change.")) {
            newForecastFinish = newActualFinish;
            newActualFinish = original.actualFinish || '';
          } else {
            newActualFinish = original.actualFinish || '';
          }
        }
      } else {
        newActualFinish = original.actualFinish || '';
      }

      const updatedRow = {
        ...original,
        status: row[2] || 'Not Started',
        _cellStatuses: (row as any)._cellStatuses,
        actualStart: newActualStart,
        actualFinish: newActualFinish,
        forecastStart: (row[9] !== (indianDateFormat(original.forecastStart) || ''))
          ? (newForecastStart || '') : (original.forecastStart || ''),
        forecastFinish: (row[10] !== (indianDateFormat(original.forecastFinish) || ''))
          ? (newForecastFinish || '') : (original.forecastFinish || ''),
        actualTillDate: row[14] !== undefined ? row[14] : (original.actualTillDate ?? original.completed ?? ''),
        completed: row[14] !== undefined ? row[14] : (original.completed ?? original.actualTillDate ?? ''), // Crucial for backend P6 Push Service
        vendorName: row[11] !== undefined ? row[11] : (original.vendorName || original.soVendorName || ''),
        uom: row[12] !== undefined ? row[12] : (original.uom || 'Nos'),
        planTillDate: row[13] !== undefined ? row[13] : (original.planTillDate ?? original.scope ?? ''),
        scope: row[13] !== undefined ? row[13] : (original.scope ?? original.planTillDate ?? ''), // Alias for backend
        completionPercentage: row[16] !== undefined ? row[16] : (original.completionPercentage || original.percentComplete || original.progress || ''),
        // percentComplete is the 0-1 mirror the P6 push also reads; keep the two in step so a
        // stale copy of one can never outrank the typed value in the other.
        percentComplete: (row[16] !== undefined && row[16] !== '')
          ? Number(String(row[16]).replace('%', '')) / 100
          : original.percentComplete,
        _originalRef: original
      };
      
      const cellStatuses = { ...((row as any)['_cellStatuses'] || {}) };
      
      if (updatedRow.status !== (original.status || 'Not Started')) cellStatuses['status'] = { isDirty: true };
      if (updatedRow.actualStart !== (indianDateFormat(original.actualStart) || '')) cellStatuses['actualStart'] = { isDirty: true };
      if (updatedRow.actualFinish !== (indianDateFormat(original.actualFinish) || '')) cellStatuses['actualFinish'] = { isDirty: true };
      
      const prevCompleted = String(original.actualTillDate ?? original.completed ?? '').trim();
      const newCompleted = String(updatedRow.actualTillDate).trim();
      if (newCompleted !== prevCompleted) cellStatuses['actualTillDate'] = { isDirty: true };

      const prevPct = String(original.completionPercentage || original.percentComplete || original.progress || '').trim();
      const newPct = String(updatedRow.completionPercentage).trim();
      if (newPct !== prevPct) cellStatuses['completionPercentage'] = { isDirty: true };
      
      if (Object.keys(cellStatuses).length > 0) {
        updatedRow._cellStatuses = cellStatuses;
      }
      
      return updatedRow;
    }).filter(r => r !== null);

    const fullDataCopy = [...data];
    updated.forEach(updatedRow => {
      const original = (updatedRow as any)._originalRef;
      const idx = fullDataCopy.indexOf(original);
      if (idx !== -1) {
        const cleanRow = { ...updatedRow };
        delete cleanRow._originalRef;
        fullDataCopy[idx] = cleanRow;
      } else {
        const fallbackIdx = fullDataCopy.findIndex(d => d.activityId === updatedRow.activityId);
        if (fallbackIdx !== -1) {
          const cleanRow = { ...updatedRow };
          delete cleanRow._originalRef;
          fullDataCopy[fallbackIdx] = cleanRow;
        }
      }
    });

    setData(fullDataCopy);

    // Update custom rows inline
    if (onEditCustomActivity && customRowChanges.length > 0) {
      customRowChanges.forEach((row) => {
        const customId = (row as any)._customId;
        if (!customId) return;
        const original = customActivities.find(c => c.id === customId);
        if (!original) return;

        // Check if anything actually changed
        const newDesc = row[1] || '';
        const newStatus = row[2] || 'Not Started';
        const newPriority = row[3] || '';
        const newDuration = row[4] || '';
        let newActStart = row[7] || '';
        let newFcstStart = row[9] || '';
        let finalCustomActStart = original.actualStart || '';
        let isFuture = false;

        if (newActStart !== (indianDateFormat(original.actualStart) || '')) {
          if (newActStart && (today || yesterday)) {
            const editedDateStr = new Date(newActStart).toISOString().split('T')[0];
            const calDateStr = new Date(today || yesterday || '').toISOString().split('T')[0];
            if (editedDateStr > calDateStr) isFuture = true;
          }
          if (isFuture) {
            if (window.confirm("You selected a future date for an Actual Start.\nP6 only accepts past/present dates for Actuals.\n\nClick OK to automatically save it as a Forecast date instead.\nClick Cancel to undo your change.")) {
              newFcstStart = newActStart;
              newActStart = original.actualStart || '';
            } else {
              newActStart = original.actualStart || '';
            }
          }
          finalCustomActStart = newActStart;
        }

        let newActFinish = row[8] || '';
        let newFcstFinish = row[10] || '';
        let finalCustomActFinish = original.actualFinish || '';
        isFuture = false;
        if (newActFinish !== (indianDateFormat(original.actualFinish) || '')) {
          if (newActFinish && (today || yesterday)) {
            const editedDateStr = new Date(newActFinish).toISOString().split('T')[0];
            const calDateStr = new Date(today || yesterday || '').toISOString().split('T')[0];
            if (editedDateStr > calDateStr) isFuture = true;
          }
          if (isFuture) {
            if (window.confirm("You selected a future date for an Actual Finish.\nP6 only accepts past/present dates for Actuals.\n\nClick OK to automatically save it as a Forecast date instead.\nClick Cancel to undo your change.")) {
              newFcstFinish = newActFinish;
              newActFinish = original.actualFinish || '';
            } else {
              newActFinish = original.actualFinish || '';
            }
          }
          finalCustomActFinish = newActFinish;
        }
        
        const newVendor = row[11] !== undefined ? row[11] : '';
        const newUom = row[12] !== undefined ? row[12] : '';
        const newPlan = row[13] !== undefined ? row[13] : '';
        const newActual = row[14] !== undefined ? row[14] : '';

        const hasChanges =
          newDesc !== (original.description || '') ||
          newStatus !== (original.status || 'Not Started') ||
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
            status: newStatus,
            uom: newUom,
            scope: newPlan === '' ? 0 : Number(newPlan),
            cumulative: newActual === '' ? 0 : Number(newActual),
            actualStart: finalCustomActStart,
            actualFinish: finalCustomActFinish,
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

      const colorsForRow: Record<string, string> = {};

      const isValidDate = (dStr: any) => typeof dStr === 'string' && dStr.trim() !== '' && dStr !== '-';

      if (isValidDate(row[7])) {
        colorsForRow["Actual Start"] = "#16a34a";
      }
      if (isValidDate(row[8])) {
        colorsForRow["Actual Finish"] = "#16a34a";
      }
      if (isValidDate(row[9])) {
        colorsForRow["Forecast Start"] = "#2563eb";
      }
      if (isValidDate(row[10])) {
        colorsForRow["Forecast Finish"] = "#2563eb";
      }

      if (Object.keys(colorsForRow).length > 0) {
        colors[rowIndex] = colorsForRow;
      }
    });

    return colors;
  }, [tableData]);

  return (
    <div className="space-y-4 w-full h-full flex-1 min-h-0 flex flex-col">
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
        dropdownOptions={{
          "Status": ["Not Started", "In Progress", "Completed"]
        }}
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

