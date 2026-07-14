import React, { useMemo, useCallback, memo } from 'react';
import { StyledExcelTable } from "@/components/StyledExcelTable";
import { indianDateFormat } from "@/services/dprService";
import { Plus } from "lucide-react";
import { useAuth } from '@/modules/auth/contexts/AuthContext';

export interface PSSProgressData {
  sNo?: string;
  description: string;
  priority: string;
  duration: string;
  planStart: string;
  planFinish: string;
  actualStart: string;
  actualFinish: string;
  forecastStart: string;
  forecastFinish: string;
  soVendorName: string;
  uom: string;
  scope: string;
  completed: string;
  balance: string;
  remarks: string;
  status?: string;
  mainHeading?: string;
  subHeading?: string;
  isCategoryRow?: boolean;
  [key: string]: any;
}

// Colors for main and sub headings
const MAIN_HEADING_COLOR = "#1B4F72";    // Deep navy blue - main heading background
const MAIN_HEADING_TEXT = "#FFFFFF";       // White text for main heading
const SUB_HEADING_COLOR = "#85C1E9";      // Light blue - sub heading background  
const SUB_HEADING_TEXT = "#1B2631";        // Dark text for sub heading

interface PSSProgressTableProps {
  data: PSSProgressData[];
  setData: (data: PSSProgressData[]) => void;
  onSave?: () => void;
  onSubmit?: () => void;
  yesterday?: string;
  today?: string;
  isLocked?: boolean;
  status?: string;
  onExportAll?: () => void;
  projectId?: number;
  onPush?: () => void;
  title?: string;
  sheetType?: string;

  customActivities?: any[];
  onAddCustomActivity?: (activity: any) => void;
  onEditCustomActivity?: (activity: any) => void;
  onDeleteCustomActivity?: (id: number) => void;
}

export const PSSProgressTable = memo(({
  data,
  setData,
  onSave,
  onSubmit,
  isLocked = false,
  status = 'draft',
  onExportAll,
  projectId,
  onPush,
  title = "PSS Project - Progress Sheet",
  sheetType = "pss_progress",
  customActivities = [],
  onAddCustomActivity,
  onEditCustomActivity,
  onDeleteCustomActivity,
  yesterday,
  today
}: PSSProgressTableProps) => {
  const { user } = useAuth();
  const userRole = (user?.role || user?.Role || '').toLowerCase();
  const isPmagOrAdmin = userRole.includes('pmag') || userRole.includes('admin');

  const columns = useMemo(() => [
    "S.No",
    "Description",
    "Status",
    "Priority",
    "Duration",
    "Plan Start",
    "Plan Finish",
    "Actual Start",
    "Actual Finish",
    "Forecast Start",
    "Forecast Finish",
    "SO Vendor Name",
    "UOM",
    "Scope",
    "Completed",
    "Balance",
    "Remarks",
  ], []);

  const columnWidths = useMemo(() => ({
    "S.No": 50,
    "Description": 280,
    "Status": 110,
    "Priority": 80,
    "Duration": 80,
    "Plan Start": 100,
    "Plan Finish": 100,
    "Actual Start": 100,
    "Actual Finish": 100,
    "Forecast Start": 100,
    "Forecast Finish": 100,
    "SO Vendor Name": 160,
    "UOM": 60,
    "Scope": 80,
    "Completed": 90,
    "Balance": 80,
    "Remarks": 180,
  }), []);

  const columnTypes = useMemo(() => ({
    "S.No": "text" as const,
    "Description": "text" as const,
    "Status": "select" as const,
    "Priority": "text" as const,
    "Duration": "text" as const,
    "Plan Start": "text" as const,
    "Plan Finish": "text" as const,
    "Actual Start": "date" as const,
    "Actual Finish": "date" as const,
    "Forecast Start": "date" as const,
    "Forecast Finish": "date" as const,
    "SO Vendor Name": "text" as const,
    "UOM": "text" as const,
    "Scope": "number" as const,
    "Completed": "number" as const,
    "Balance": "number" as const,
    "Remarks": "text" as const,
  }), []);

  const columnTextColors = useMemo(() => ({
    "Actual Start": "inherit",
    "Actual Finish": "inherit",
    "Forecast Start": "inherit",
    "Forecast Finish": "inherit",
  }), []);

  const columnFontWeights = useMemo(() => ({
    "Actual Start": "bold",
    "Actual Finish": "bold",
    "Forecast Start": "bold",
    "Forecast Finish": "bold",
  }), []);

  const editableColumns = useMemo(() => [
    "Description", "Status", "Priority", "Duration",
    "Plan Start", "Plan Finish", "Actual Start", "Actual Finish",
    "SO Vendor Name", "UOM", "Scope", "Completed", "Remarks"
  ], []);

  const headerStructure = useMemo(() => [
    [
      { label: "S.No", rowSpan: 2, colSpan: 1 },
      { label: "Description", rowSpan: 2, colSpan: 1 },
      { label: "Status", rowSpan: 2, colSpan: 1 },
      { label: "Priority", rowSpan: 2, colSpan: 1 },
      { label: "Duration", rowSpan: 2, colSpan: 1 },
      { label: "Plan", colSpan: 2, rowSpan: 1 },
      { label: "Actual", colSpan: 2, rowSpan: 1 },
      { label: "Forecast", colSpan: 2, rowSpan: 1 },
      { label: "SO Vendor Name", rowSpan: 2, colSpan: 1 },
      { label: "UOM", rowSpan: 2, colSpan: 1 },
      { label: "Scope", rowSpan: 2, colSpan: 1 },
      { label: "Completed", rowSpan: 2, colSpan: 1 },
      { label: "Balance", rowSpan: 2, colSpan: 1 },
      { label: "Remarks", rowSpan: 2, colSpan: 1 },
    ],
    [
      { label: "Plan Start", colSpan: 1, rowSpan: 1 },
      { label: "Plan Finish", colSpan: 1, rowSpan: 1 },
      { label: "Start", colSpan: 1, rowSpan: 1 },
      { label: "Finish", colSpan: 1, rowSpan: 1 },
      { label: "Start", colSpan: 1, rowSpan: 1 },
      { label: "Finish", colSpan: 1, rowSpan: 1 },
    ]
  ], []);

  // Build table data with heading rows inserted
  const { tableData, rowStylesMap, dataIndexMap } = useMemo(() => {
    const safeData = Array.isArray(data) ? data : [];
    const safeCustom = Array.isArray(customActivities) ? customActivities : [];

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

    const rows: string[][] = [];
    const styles: Record<number, any> = {};
    const indexMap: number[] = []; // maps row index -> data index (-1 for heading rows)

    let currentMainHeading = '';
    let currentSubHeading = '';
    let sNo = 1;

    let totalScope = 0;
    let totalCompleted = 0;

    safeData.forEach((row, dataIdx) => {
      const mainH = row.mainHeading || '';
      const subH = row.subHeading || '';

      // Insert main heading row if changed
      if (mainH && mainH !== currentMainHeading) {
        currentMainHeading = mainH;
        currentSubHeading = ''; // Reset sub heading

        let mainHCount = 0;
        safeData.forEach(r => { if (r.mainHeading === mainH) mainHCount++; });

        if (mainHCount >= 2) {
          const headingRow = ["", mainH, "", "", "", "", "", "", "", "", "", "", "", "", ""];
          (headingRow as any).isCategoryRow = true;
          rows.push(headingRow);
          styles[rows.length - 1] = {
            backgroundColor: MAIN_HEADING_COLOR,
            color: MAIN_HEADING_TEXT,
            fontWeight: "bold",
            fontSize: "13px",
            isCategoryRow: true,
          };
          indexMap.push(-1);
        }
      }

      // Insert sub heading row if changed
      if (subH && subH !== currentSubHeading) {
        currentSubHeading = subH;

        let subHCount = 0;
        safeData.forEach(r => { if (r.mainHeading === currentMainHeading && r.subHeading === subH) subHCount++; });

        if (subHCount >= 2) {
          const subRow = ["", `  ${subH}`, "", "", "", "", "", "", "", "", "", "", "", "", ""];
          (subRow as any).isCategoryRow = true;
          rows.push(subRow);
          styles[rows.length - 1] = {
            backgroundColor: SUB_HEADING_COLOR,
            color: SUB_HEADING_TEXT,
            fontWeight: "600",
            fontSize: "12px",
            isCategoryRow: true,
          };
          indexMap.push(-1);
        }
      }

      // Track totals for the activity rows
      const s = Number(row.scope) || 0;
      const c = Number(row.completed) || 0;
      totalScope += s;
      totalCompleted += c;

      // Insert activity row
      const d = getDates(row);
      const arr: any = [
        String(sNo++),
        row.description || (row as any).activities || '',
        row.status || 'Not Started',
        row.priority || '',
        row.duration || '',
        formatDt(row.planStart),
        formatDt(row.planFinish),
        d.actS,
        d.actF,
        d.fcstS,
        d.fcstF,
        row.soVendorName || '',
        row.uom || '',
        row.scope || '',
        row.completed || '',
        row.balance || '',
        row.remarks || '',
      ];

      if (row._cellStatuses) arr._cellStatuses = row._cellStatuses;
      rows.push(arr);
      indexMap.push(dataIdx);
    });

    if (safeCustom.length > 0) {
      const customCatRow: any = ["", "📝 DPR Level Activities", "", "", "", "", "", "", "", "", "", "", "", "", ""];
      customCatRow.isCategoryRow = true;
      rows.push(customCatRow);
      styles[rows.length - 1] = {
        backgroundColor: "#FADFAD",
        color: "#333333",
        fontWeight: "bold",
        isCategoryRow: true,
      };
      indexMap.push(-1);

      safeCustom.forEach((c, idx) => {
        const customArr: any = [
          String(sNo++),
          c.description || '',
          c.extraData?.status || 'Not Started',
          c.extraData?.priority || '',
          c.extraData?.duration || '',
          formatDt(c.plannedStart),
          formatDt(c.plannedFinish),
          formatDt(c.actualStart),
          formatDt(c.actualFinish),
          c.extraData?.soVendorName || '',
          c.uom || 'Nos',
          String(c.scope || 0),
          String(c.cumulative || 0),
          String(Math.max(0, (c.scope || 0) - (c.cumulative || 0))),
          c.remarks || '',
        ];
        customArr._isCustomRow = true;
        customArr._customId = c.id;

        rows.push(customArr);
        styles[rows.length - 1] = { backgroundColor: "#FFFBEB" };
        indexMap.push(-3 - idx); // Custom row index mapping

        totalScope += Number(c.scope) || 0;
        totalCompleted += Number(c.cumulative) || 0;
      });
    }

    // Grand Total Row
    if (rows.length > 0) {
      const totalBalance = Math.max(0, totalScope - totalCompleted);
      const totalRow: any = [
        "TOTAL", "", "", "", "", "", "", "", "", "", "",
        String(totalScope || ''),
        String(totalCompleted || ''),
        String(totalBalance || ''),
        ""
      ];
      totalRow.isTotalRow = true;
      rows.push(totalRow);
      styles[rows.length - 1] = {
        backgroundColor: "#f1f5f9",
        color: "#0f172a",
        fontWeight: "bold",
        isTotalRow: true,
      };
      indexMap.push(-2); // -2 for total row
    }

    // Dynamically apply green or blue based on actual vs forecast
    Object.keys(styles).forEach((rIdxStr) => {
      const rIdx = Number(rIdxStr);
      if (styles[rIdx].isCategoryRow || styles[rIdx].isTotalRow) return;
    });

    safeData.forEach((row, dataIdx) => {
      const rIdx = indexMap.indexOf(dataIdx);
      if (rIdx === -1) return;

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

      const rowColors: any = {};
      if (isValidDate(row.actualStart)) {
        rowColors["Actual Start"] = "#16a34a";
      }
      if (isValidDate(row.actualFinish)) {
        rowColors["Actual Finish"] = "#16a34a";
      }
      if (isValidDate(row.forecastStart)) {
        rowColors["Forecast Start"] = "#2563eb";
      }
      if (isValidDate(row.forecastFinish)) {
        rowColors["Forecast Finish"] = "#2563eb";
      }

      if (Object.keys(rowColors).length > 0) {
        if (!styles[rIdx]) styles[rIdx] = {};
        styles[rIdx]._cellColors = rowColors;
      }
    });

    return { tableData: rows, rowStylesMap: styles, dataIndexMap: indexMap };
  }, [data, customActivities, yesterday]);

  const handleInlineAdd = useCallback(() => {
    if (onAddCustomActivity) {
      onAddCustomActivity({
        sheetType: sheetType,
        description: 'New DPR Activity',
        uom: 'Nos',
        scope: 0,
      });
    }
  }, [onAddCustomActivity, sheetType]);

  const handleDataChange = useCallback((newData: any[][]) => {
    const safeData = Array.isArray(data) ? data : [];
    const updated = [...safeData];
    let hasChanges = false;
    const customRowChanges: any[] = [];

    newData.forEach((row, rowIdx) => {
      if (rowIdx >= dataIndexMap.length) return;
      const dataIdx = dataIndexMap[rowIdx];

      if ((row as any)._isCustomRow) {
        customRowChanges.push(row);
        return;
      }

      if (dataIdx < 0) return; // Skip heading and total rows

      const original = safeData[dataIdx];
      const scope = Number(row[11]) || 0;
      const completed = Number(row[12]) || 0;

      if (
        original.description !== row[1] ||
        original.status !== row[2] ||
        original.priority !== row[3] ||
        original.duration !== row[4] ||
        original.planStart !== row[5] ||
        original.planFinish !== row[6] ||
        original.actualStart !== row[7] ||
        original.actualFinish !== row[8] ||
        original.forecastStart !== row[9] ||
        original.forecastFinish !== row[10] ||
        original.soVendorName !== row[11] ||
        original.uom !== row[12] ||
        Number(original.scope) !== scope ||
        Number(original.completed) !== completed ||
        original.remarks !== row[16] ||
        original._cellStatuses !== (row as any)._cellStatuses
      ) {
        hasChanges = true;
        const editedStart = row[7] || '';
        const editedFinish = row[8] || '';
        const editedFcstStart = row[9] || '';
        const editedFcstFinish = row[10] || '';

        const prevEffectiveStart = indianDateFormat(original.actualStart) || '';
        const prevEffectiveFinish = indianDateFormat(original.actualFinish) || '';
        const prevFcstStart = indianDateFormat(original.forecastStart) || '';
        const prevFcstFinish = indianDateFormat(original.forecastFinish) || '';

        let newStatus = row[2] || original.status || 'Not Started';
        let actStartChanged = false;

        let newActualStart = original.actualStart || '';
        if (editedStart !== prevEffectiveStart) {
          actStartChanged = true;
          let isFuture = false;
          if (editedStart && yesterday) {
            const editedDateStr = new Date(editedStart).toISOString().split('T')[0];
            const calDateStr = new Date(yesterday).toISOString().split('T')[0];
            if (editedDateStr > calDateStr) isFuture = true;
          }
          if (isFuture) {
            if (window.confirm("You selected a future date for an Actual Start.\nP6 only accepts past/present dates for Actuals.\n\nClick OK to automatically save it as a Forecast date instead.\nClick Cancel to undo your change.")) {
              newActualStart = editedStart;
            }
          } else {
            newActualStart = editedStart;
          }
        }

        let actFinishChanged = false;
        let newActualFinish = original.actualFinish || '';
        if (editedFinish !== prevEffectiveFinish) {
          actFinishChanged = true;
          let isFuture = false;
          if (editedFinish && yesterday) {
            const editedDateStr = new Date(editedFinish).toISOString().split('T')[0];
            const calDateStr = new Date(yesterday).toISOString().split('T')[0];
            if (editedDateStr > calDateStr) isFuture = true;
          }
          if (isFuture) {
            if (window.confirm("You selected a future date for an Actual Finish.\nP6 only accepts past/present dates for Actuals.\n\nClick OK to automatically save it as a Forecast date instead.\nClick Cancel to undo your change.")) {
              newActualFinish = editedFinish;
            }
          } else {
            newActualFinish = editedFinish;
          }
        }

        let newForecastStart = original.forecastStart || '';
        if (editedFcstStart !== prevFcstStart) {
          newForecastStart = editedFcstStart;
        }

        let newForecastFinish = original.forecastFinish || '';
        if (editedFcstFinish !== prevFcstFinish) {
          newForecastFinish = editedFcstFinish;
        }

        if (actFinishChanged && newActualFinish) {
          newStatus = 'Completed';
        } else if (actStartChanged && newActualStart && newStatus === 'Not Started') {
          newStatus = 'In Progress';
        }

        updated[dataIdx] = {
          ...original,
          _cellStatuses: (row as any)._cellStatuses,
          description: row[1] || '',
          status: newStatus,
          priority: row[3] || '',
          duration: row[4] || '',
          planStart: row[5] || '',
          planFinish: row[6] || '',
          actualStart: newActualStart,
          actualFinish: newActualFinish,
          forecastStart: newForecastStart,
          forecastFinish: newForecastFinish,
          soVendorName: row[11] || '',
          uom: row[12] || '',
          scope: scopeStr,
          completed: String(completed),
          balance: String(Math.max(0, scope - completed)),
          remarks: row[16] || '',
        };
      }
    });

    if (hasChanges) {
      setData(updated);
    }

    if (onEditCustomActivity && customRowChanges.length > 0) {
      customRowChanges.forEach(row => {
        const customId = (row as any)._customId;
        if (!customId) return;
        const c = customActivities.find(x => x.id === customId);
        if (!c) return;

        const newDesc = row[1] || '';
        let newStatus = row[2] || 'Not Started';
        const newPriority = row[3] || '';
        const newDuration = row[4] || '';
        const newPlanStart = row[5] || '';
        const newPlanFinish = row[6] || '';
        const newActStart = row[7] || '';
        let finalCustomActStart = c.actualStart || '';
        let customActStartChanged = false;
        if (newActStart !== (indianDateFormat(c.actualStart) || '')) {
          customActStartChanged = true;
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

        const newActFinish = row[8] || '';
        let finalCustomActFinish = c.actualFinish || '';
        let customActFinishChanged = false;
        if (newActFinish !== (indianDateFormat(c.actualFinish) || '')) {
          customActFinishChanged = true;
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
        const newFcstStart = row[9] || '';
        const newFcstFinish = row[10] || '';
        const newVendor = row[11] || '';
        const newUom = row[12] || 'Nos';
        const newScope = row[13] || '0';
        const newComp = row[14] || '0';
        const newRemarks = row[16] || '';

        if (customActFinishChanged && finalCustomActFinish) {
          newStatus = 'Completed';
        } else if (customActStartChanged && finalCustomActStart && newStatus === 'Not Started') {
          newStatus = 'In Progress';
        }

        const hasCustomChanges =
          newDesc !== (c.description || '') ||
          newStatus !== (c.extraData?.status || 'Not Started') ||
          newPriority !== (c.extraData?.priority || '') ||
          newDuration !== (c.extraData?.duration || '') ||
          newVendor !== (c.extraData?.soVendorName || '') ||
          newUom !== (c.uom || '') ||
          newScope !== String(c.scope || 0) ||
          newComp !== String(c.cumulative || 0) ||
          newPlanStart !== (c.plannedStart || '') ||
          newPlanFinish !== (c.plannedFinish || '') ||
          finalCustomActStart !== (c.actualStart || '') ||
          finalCustomActFinish !== (c.actualFinish || '') ||
          newRemarks !== (c.remarks || '');

        if (hasCustomChanges) {
          onEditCustomActivity({
            id: customId,
            sheetType: sheetType,
            description: newDesc,
            uom: newUom,
            scope: Number(newScope) || 0,
            cumulative: Number(newComp) || 0,
            plannedStart: finalCustomActStart || newPlanStart,
            plannedFinish: finalCustomActFinish || newPlanFinish,
            remarks: newRemarks,
            extraData: {
              ...c.extraData,
              status: newStatus,
              priority: newPriority,
              duration: newDuration,
              soVendorName: newVendor,
            }
          });
        }
      });
    }
  }, [data, setData, dataIndexMap, customActivities, onEditCustomActivity, sheetType, yesterday]);

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
        title={title}
        columns={columns}
        data={tableData}
        onDataChange={handleDataChange}
        onSave={onSave || (() => { })}
        onSubmit={onSubmit}
        onPush={onPush}
        isReadOnly={isLocked}
        editableColumns={editableColumns}
        columnTypes={columnTypes}
        columnOptions={useMemo(() => ({
          "Status": ["Not Started", "In Progress", "Completed", "On Hold"]
        }), [])}
        columnWidths={columnWidths}
        headerStructure={headerStructure}
        rowStyles={rowStylesMap}
        status={status}
        onExportAll={onExportAll}
        columnTextColors={columnTextColors}
        columnFontWeights={columnFontWeights}
        cellTextColors={useMemo(() => {
          const c: any = {};
          Object.keys(rowStylesMap).forEach(idx => {
            if (rowStylesMap[idx] && rowStylesMap[idx]._cellColors) {
              c[idx] = rowStylesMap[idx]._cellColors;
            }
          });
          return c;
        }, [rowStylesMap])}
        projectId={projectId}
        sheetType={sheetType}
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
