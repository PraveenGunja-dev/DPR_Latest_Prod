import { memo, useCallback, useMemo } from "react";
import { StyledExcelTable } from "@/components/StyledExcelTable";
import { getTodayAndYesterday, indianDateFormat } from "@/services/dprService";
import { EntryStatus } from "@/types";
import { Plus, Upload } from "lucide-react";
import { useAuth } from '@/modules/auth/contexts/AuthContext';

interface DPQtyData {
  yesterdayIsApproved?: boolean;
  activityId?: string;
  block?: string;
  slNo?: string;
  description: string;
  totalQuantity: string;
  uom: string;
  basePlanStart: string;
  basePlanFinish: string;
  forecastStart: string;
  forecastFinish: string;
  actualStart: string;
  actualFinish: string;
  remarks: string;
  balance: string;
  cumulative: string;
  weightage: string;
  yesterdayValue?: string;
  todayValue?: string;
  status?: string;
  selectedResourceId?: string;
  [key: string]: any;
}

interface DPQtyTableProps {
  data: DPQtyData[];
  setData: React.Dispatch<React.SetStateAction<DPQtyData[]>>;
  onSave: () => void;
  onSubmit?: () => void;
  yesterday: string;
  today: string;
  dataDate?: string;
  isLocked?: boolean;
  status?: EntryStatus;
  projectId?: number;
  onExportAll?: () => void;
  totalRows?: number;
  onFullscreenToggle?: (isFullscreen: boolean) => void;
  onReachEnd?: () => void;
  universalFilter?: string;
  selectedBlock?: string;
  onPush?: () => void;
  resourcesByActivity?: Record<string, any[]>;
  customActivities?: any[];
  onAddCustomActivity?: (activity: any) => void;
  onEditCustomActivity?: (activity: any) => void;
  onDeleteCustomActivity?: (id: number) => void;
  onBulkUploadActivities?: () => void;
}

export const DPQtyTable = memo(({ 
  data, setData, onSave, onSubmit, yesterday, today, dataDate,
  isLocked = false, status = 'draft', projectId, onExportAll, totalRows, 
  onFullscreenToggle, onReachEnd, universalFilter, selectedBlock = "ALL", 
  onPush, resourcesByActivity = {},
  customActivities = [], onAddCustomActivity, onEditCustomActivity, onDeleteCustomActivity,
  onBulkUploadActivities 
}: DPQtyTableProps) => {
  const { yesterday: previousDate } = getTodayAndYesterday();
  const { user } = useAuth();
  const userRole = (user?.role || user?.Role || '').toLowerCase();
  const isPmagOrAdmin = userRole.includes('pmag') || userRole.includes('admin');

  // Filter data based on selected block and universal filter
  const filteredData = useMemo(() => {
    if (!Array.isArray(data)) return [];
    const safeCustom = Array.isArray(customActivities) ? customActivities : [];
    
    let p6Result = selectedBlock === "ALL" ? data : data.filter(d => d.block === selectedBlock);
    let customResult = selectedBlock === "ALL" ? safeCustom : safeCustom.filter(c => c.block === selectedBlock);

    if (universalFilter && universalFilter.trim()) {
      const filters = universalFilter.trim().split(/\s+/);
      p6Result = p6Result.filter(d => {
        const id = d.activityId || "";
        const desc = d.description || "";
        return filters.some(f => {
          const regex = new RegExp(`\\b${f}\\b`, 'i');
          return regex.test(id) || regex.test(desc);
        });
      });
      customResult = customResult.filter(c => {
        const desc = c.description || "";
        return filters.some(f => {
          const regex = new RegExp(`\\b${f}\\b`, 'i');
          return regex.test(desc);
        });
      });
    }

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
          description: c.description || '',
          uom: c.uom || 'Nos',
          totalQuantity: String(c.scope || 0),
          cumulative: String(c.cumulative || 0),
          balance: String(Math.max(0, (c.scope || 0) - (c.cumulative || 0))),
          status: c.status || 'Not Started',
          basePlanStart: c.plannedStart || '',
          basePlanFinish: c.plannedFinish || '',
          actualStart: c.actualStart || '',
          actualFinish: c.actualFinish || '',
          yesterdayValue: c.extraData?.yesterdayValue || '0',
          todayValue: c.extraData?.todayValue || '0',
          selectedResourceId: c.extraData?.selectedResourceId || '',
        });
      });
    }

    return finalResult;
  }, [data, customActivities, selectedBlock, universalFilter]);

  const columns = useMemo(() => [
    "S.No",
    "Description",
    "Status",
    "UOM",
    "Scope",
    `Completed as on\n${indianDateFormat(yesterday)}`,
    "Balance",
    "Baseline Start",
    "Baseline Finish",
    "Actual Start",
    "Actual Finish",
    "Forecast Start",
    "Forecast Finish",
    indianDateFormat(yesterday),
    indianDateFormat(today)
  ], [yesterday, today]);

  const columnWidths = useMemo(() => ({
    "S.No": 50,
    "Description": 250,
    "Status": 110,
    "UOM": 60,
    "Scope": 80,
    [`Completed as on\n${indianDateFormat(yesterday)}`]: 120,
    "Balance": 80,
    "Baseline Start": 100,
    "Baseline Finish": 100,
    "Actual Start": 100,
    "Actual Finish": 100,
    "Forecast Start": 100,
    "Forecast Finish": 100,
    [indianDateFormat(yesterday)]: 80,
    [indianDateFormat(today)]: 80
  }), [yesterday, today]);

  // Make description, UOM, scope editable for custom rows by expanding editableColumns list
  const editableColumns = useMemo(() => [
    "Description",
    "UOM",
    "Scope",
    "Actual Start",
    "Actual Finish",
    indianDateFormat(yesterday),
    indianDateFormat(today)
  ], [yesterday, today]);

  const tableData = useMemo(() => {
    const formatDt = (dt: any) => {
      if (!dt) return "";
      const dtStr = String(dt).split('T')[0];
      return indianDateFormat(dtStr) || dtStr;
    };

    const parsedYesterdayStr = yesterday ? String(yesterday).split('T')[0] : '';
    const referenceDateStr = dataDate ? String(dataDate).split('T')[0] : parsedYesterdayStr;

    const getDates = (r: any) => {
      const s = r.actualStart;
      const f = r.actualFinish;
      let actS = '', fcstS = '', actF = '', fcstF = '';
      
      if (s) {
        const sStr = String(s).split('T')[0];
        if (referenceDateStr && sStr <= referenceDateStr) {
          actS = indianDateFormat(sStr) || sStr;
        } else {
          fcstS = indianDateFormat(sStr) || sStr;
        }
      }
      if (f) {
        const fStr = String(f).split('T')[0];
        if (referenceDateStr && fStr <= referenceDateStr) {
          actF = indianDateFormat(fStr) || fStr;
        } else {
          fcstF = indianDateFormat(fStr) || fStr;
        }
      }
      return { actS, fcstS, actF, fcstF };
    };

    let actIndex = 1;
    const rows = filteredData.map((row) => {
      if (row.isCategoryRow) {
        const arr: any = [
          "", row.description || "", "", "", "", "", "", "", "", "", "", "", "", "", ""
        ];
        arr.isCategoryRow = true;
        return arr;
      }

      const baselineStart = formatDt(row.basePlanStart);
      const baselineFinish = formatDt(row.basePlanFinish);
      const d = getDates(row);

      const arr: any = [
        String(actIndex++),
        row.description || (row as any).activities || (row as any).activity || (row as any).activity_name || (row as any).name || (row as any).Name || "",
        row.status || "Not Started",
        row.uom || "",
        row.totalQuantity ? Number(row.totalQuantity).toFixed(2) : "0.00",
        row.cumulative ? Number(row.cumulative).toFixed(2) : "0.00",
        row.balance ? Number(row.balance).toFixed(2) : "0.00",
        baselineStart,
        baselineFinish,
        d.actS,
        d.actF,
        d.fcstS,
        d.fcstF,
        row.yesterdayValue ? Number(row.yesterdayValue).toFixed(2) : "0.00",
        row.todayValue ? Number(row.todayValue).toFixed(2) : "0.00"
      ];
      if (row._cellStatuses) {
        arr._cellStatuses = row._cellStatuses;
      }
      if (row._isCustomRow) {
        arr._isCustomRow = true;
        arr._customId = row._customId;
      }
      return arr;
    });

    if (rows.length > 0) {
      const totalScope = rows.reduce((sum, r) => r.isCategoryRow ? sum : sum + (Number(r[4]) || 0), 0);
      const totalCompleted = rows.reduce((sum, r) => r.isCategoryRow ? sum : sum + (Number(r[5]) || 0), 0);
      const totalBalance = rows.reduce((sum, r) => r.isCategoryRow ? sum : sum + (Number(r[6]) || 0), 0);
      const totalYesterday = rows.reduce((sum, r) => r.isCategoryRow ? sum : sum + (Number(r[13]) || 0), 0);
      const totalToday = rows.reduce((sum, r) => r.isCategoryRow ? sum : sum + (Number(r[14]) || 0), 0);

      rows.push([
        "GRAND TOTAL",
        "",
        "", 
        "", 
        String(totalScope.toFixed(2)),
        String(totalCompleted.toFixed(2)),
        String(totalBalance.toFixed(2)),
        "", 
        "", 
        "", 
        "", 
        "", 
        "", 
        String(totalYesterday.toFixed(2)),
        String(totalToday.toFixed(2))
      ]);
    }

    return rows;
  }, [filteredData, yesterday, today]);

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
      } else if (row[0] === "GRAND TOTAL") {
        styles[index] = {
          backgroundColor: "#FADFAD",
          color: "#000000",
          fontWeight: "bold",
          isTotalRow: true
        };
      }
    });
    return styles;
  }, [tableData]);

  const cellTextColors = useMemo(() => {
    const colors: Record<number, Record<string, string>> = {};
    const formattedYesterday = indianDateFormat(yesterday);
    const completedLabel = `Completed as on\n${indianDateFormat(yesterday)}`;
    filteredData.forEach((row, rowIndex) => {
      if (row.isCategoryRow) return;
      if (row.yesterdayIsApproved === false) {
        colors[rowIndex] = {
          [formattedYesterday]: "#ce440d",
          [completedLabel]: "#ce440d"
        };
      } else if (row.yesterdayIsApproved === true) {
        colors[rowIndex] = {
          [formattedYesterday]: "#16a34a",
          [completedLabel]: "#16a34a"
        };
      }
    });
    return colors;
  }, [filteredData, yesterday, previousDate]);

  const handleInlineAdd = useCallback(() => {
    if (onAddCustomActivity) {
      onAddCustomActivity({
        sheetType: 'dp_qty',
        description: 'New DPR Activity',
        uom: 'Nos',
        scope: 0,
        block: selectedBlock !== 'ALL' ? selectedBlock : '',
      });
    }
  }, [onAddCustomActivity, selectedBlock]);

  const handleDataChange = useCallback((newData: any[][]) => {
    const p6RowChanges: any[] = [];
    const customRowChanges: any[] = [];

    // Map newData rows back to filteredData array (ignoring total row)
    newData.filter(r => !(r as any).isTotalRow).forEach((row, index) => {
      const original = filteredData[index];
      if (!original || original.isCategoryRow) return;

      if ((row as any)._isCustomRow) {
        customRowChanges.push({ row, original });
      } else {
        p6RowChanges.push({ row, original });
      }
    });

    const updatedP6Data = p6RowChanges.map(({ row, original }) => {
      const updatedRow: any = { ...original };
      const cellStatuses = (row as any)['_cellStatuses'] || {};

      if (cellStatuses[2]) updatedRow.status = row[2] || '';
      if (cellStatuses[3]) updatedRow.uom = row[3] || '';
      if (cellStatuses[9]) {
        let newActualStart = row[9] || '';
        let isFuture = false;
        if (newActualStart && yesterday) {
          const editedDateStr = new Date(newActualStart).toISOString().split('T')[0];
          const calDateStr = new Date(yesterday).toISOString().split('T')[0];
          if (editedDateStr > calDateStr) isFuture = true;
        }
        if (isFuture) {
          if (window.confirm("You selected a future date for an Actual Start.\nP6 only accepts past/present dates for Actuals.\n\nClick OK to automatically save it as a Forecast date instead.\nClick Cancel to undo your change.")) {
            updatedRow.actualStart = newActualStart;
          } else {
            updatedRow.actualStart = original.actualStart || '';
          }
        } else {
          updatedRow.actualStart = newActualStart;
        }
      }
      if (cellStatuses[10]) {
        let newActualFinish = row[10] || '';
        let isFuture = false;
        if (newActualFinish && yesterday) {
          const editedDateStr = new Date(newActualFinish).toISOString().split('T')[0];
          const calDateStr = new Date(yesterday).toISOString().split('T')[0];
          if (editedDateStr > calDateStr) isFuture = true;
        }
        if (isFuture) {
          if (window.confirm("You selected a future date for an Actual Finish.\nP6 only accepts past/present dates for Actuals.\n\nClick OK to automatically save it as a Forecast date instead.\nClick Cancel to undo your change.")) {
            updatedRow.actualFinish = newActualFinish;
          } else {
            updatedRow.actualFinish = original.actualFinish || '';
          }
        } else {
          updatedRow.actualFinish = newActualFinish;
        }
      }
      if (cellStatuses[11]) updatedRow.forecastStart = row[11] || '';
      if (cellStatuses[12]) updatedRow.forecastFinish = row[12] || '';
      if (cellStatuses[14]) updatedRow.todayValue = row[14] || '';
      // We aren't allowing yesterday value to be changed from this table per standard behavior

      const scope = Number(row[4] || 0);
      const completed = Number(row[5] || 0);
      const todayVal = Number(row[14] || 0);
      updatedRow.balance = (scope - completed - todayVal).toFixed(2);
      updatedRow._cellStatuses = cellStatuses;
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
        // If no filter, the length matches data exactly
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
        const newUom = row[3] || 'Nos';
        const newScope = row[4] || '0';
        
        let newActStart = row[9] || '';
        let finalCustomActStart = originalCustom.actualStart || '';
        if (newActStart !== (indianDateFormat(originalCustom.actualStart) || '')) {
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

        let newActFinish = row[10] || '';
        let finalCustomActFinish = originalCustom.actualFinish || '';
        if (newActFinish !== (indianDateFormat(originalCustom.actualFinish) || '')) {
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
        
        const newYesterdayStr = String(row[13] || '0').trim(); // Note yesterday is editable in custom
        const newTodayStr = String(row[14] || '0').trim();

        // Calculate actual units dynamically
        const initialActual = Number(originalCustom.cumulative) || 0;
        const initialToday = Number(originalCustom.extraData?.todayValue) || 0;
        const initialYesterday = Number(originalCustom.extraData?.yesterdayValue) || 0;
        const baseActual = initialActual - initialToday - initialYesterday;
        
        const newYesterday = Number(newYesterdayStr) || 0;
        const newToday = Number(newTodayStr) || 0;
        const newActual = baseActual + newYesterday + newToday;

        const hasChanges =
          newDesc !== (originalCustom.description || '') ||
          newUom !== (originalCustom.uom || '') ||
          newScope !== String(originalCustom.scope || 0) ||
          newYesterdayStr !== String(originalCustom.extraData?.yesterdayValue || 0) ||
          newTodayStr !== String(originalCustom.extraData?.todayValue || 0) ||
          finalCustomActStart !== (originalCustom.actualStart || '') ||
          finalCustomActFinish !== (originalCustom.actualFinish || '');

        if (hasChanges) {
          onEditCustomActivity({
            id: customId,
            sheetType: 'dp_qty',
            description: newDesc,
            uom: newUom,
            scope: Number(newScope) || 0,
            cumulative: Number(newActual) || 0,
            plannedStart: finalCustomActStart,
            plannedFinish: finalCustomActFinish,
            extraData: {
              ...originalCustom.extraData,
              yesterdayValue: newYesterdayStr,
              todayValue: newTodayStr,
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
        title="DP Qty Table"
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
          "S.No": "text",
          "Description": "text",
          "Status": "text",
          "UOM": "text",
          "Scope": "number",
          [`Completed as on\n${indianDateFormat(yesterday)}`]: "number",
          "Balance": "number",
          "Baseline Start": "text",
          "Baseline Finish": "text",
          "Actual Start": "date",
          "Actual Finish": "date",
          "Forecast Start": "text",
          "Forecast Finish": "text",
          [indianDateFormat(yesterday)]: "number",
          [indianDateFormat(today)]: "number"
        }}
        rowColumnOptions={useMemo(() => {
          const opts: Record<number, Record<string, any[]>> = {};
          filteredData.forEach((row, index) => {
            if (row.isCategoryRow || row.isCustom) return;
            const actId = row.activityId;
            if (!actId) return;
            const resources = resourcesByActivity[actId];
            if (resources && resources.length > 0) {
              if (resources.length === 1 && !row.selectedResourceId) {
                row.selectedResourceId = resources[0].resourceId;
              }
            }
          });
          return opts;
        }, [filteredData, resourcesByActivity])}
        columnOptions={{}}
        columnWidths={columnWidths}
        cellTextColors={cellTextColors}
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
            { label: "S.No", rowSpan: 2, colSpan: 1 },
            { label: "Description", rowSpan: 2, colSpan: 1 },
            { label: "Status", rowSpan: 2, colSpan: 1 },
            { label: "UOM", rowSpan: 2, colSpan: 1 },
            { label: "Scope", rowSpan: 2, colSpan: 1 },
            { label: `Completed as on\n${indianDateFormat(yesterday)}`, rowSpan: 2, colSpan: 1 },
            { label: "Balance", rowSpan: 2, colSpan: 1 },
            { label: "Baseline Start", rowSpan: 2, colSpan: 1 },
            { label: "Baseline Finish", rowSpan: 2, colSpan: 1 },
            { label: "Actual", colSpan: 2, rowSpan: 1 },
            { label: "Forecast", colSpan: 2, rowSpan: 1 },
            { label: indianDateFormat(yesterday), rowSpan: 2, colSpan: 1 },
            { label: indianDateFormat(today), rowSpan: 2, colSpan: 1 }
          ],
          [
            { label: "Actual Start", colSpan: 1, rowSpan: 1 },
            { label: "Actual Finish", colSpan: 1, rowSpan: 1 },
            { label: "Forecast Start", colSpan: 1, rowSpan: 1 },
            { label: "Forecast Finish", colSpan: 1, rowSpan: 1 }
          ]
        ]}
        status={status}
        onExportAll={onExportAll}
        onFullscreenToggle={onFullscreenToggle}
        onReachEnd={onReachEnd}
        rowStyles={rowStyles}
        projectId={projectId}
        sheetType="dp_qty"
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
