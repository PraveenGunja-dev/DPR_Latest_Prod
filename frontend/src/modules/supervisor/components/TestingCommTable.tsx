import React, { useState, useEffect, useMemo, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Save, Plus, Upload } from "lucide-react";
import { StyledExcelTable } from "@/components/StyledExcelTable";
import { StatusChip } from "@/components/StatusChip";
import { indianDateFormat, getTodayAndYesterday } from "@/services/dprService";
import { EntryStatus } from "@/types";
import { useAuth } from '@/modules/auth/contexts/AuthContext';

export interface TestingCommData {
  activityId: string;
  activities: string;
  description?: string;
  plot: string;
  newBlockNom: string;
  priority: string;
  baselinePriority: string;
  contractorName: string;
  uom?: string;
  scope: string;
  holdDueToWtg: string;
  front: string;
  actual: string;
  balance?: string;
  completionPercentage: string;
  remarks: string;
  basePlanStart?: string;
  basePlanFinish?: string;
  forecastStart?: string;
  forecastFinish?: string;
  actualStart?: string;
  actualFinish?: string;
  yesterdayValue: string;
  todayValue: string;
  category?: string;
  isCategoryRow?: boolean;
  yesterdayIsApproved?: boolean;
  block?: string;
  [key: string]: any;
}

interface TestingCommTableProps {
  data: TestingCommData[];
  setData: (data: TestingCommData[]) => void;
  onSave: () => void;
  onSubmit?: () => void;
  yesterday: string;
  today: string;
  dataDate?: string;
  isLocked?: boolean;
  status?: EntryStatus;

  projectName?: string;
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

export function TestingCommTable({
  data,
  setData,
  onSave,
  onSubmit,
  onPush,
  yesterday,
  today,
  dataDate,
  isLocked = false,
  status = 'draft',
  onExportAll,
  totalRows,
  projectName = "Unknown Project",
  onFullscreenToggle,
  onReachEnd,
  universalFilter,
  projectId,
  selectedBlock = "ALL",
  customActivities = [],
  onAddCustomActivity,
  onEditCustomActivity,
  onDeleteCustomActivity,
  onBulkUploadActivities
}: TestingCommTableProps) {

  const { user } = useAuth();
  const userRole = (user?.role || user?.Role || '').toLowerCase();
  const isPmagOrAdmin = userRole.includes('pmag') || userRole.includes('admin');

  const previousDate = indianDateFormat(yesterday);

  // Define columns
  const columns = [
    "Activity ID",
    "Description",
    "Block",
    "Priority",
    "Contractor Name",
    "UOM",
    "Scope",
    `Completed as on\n${previousDate}`,
    "Balance",
    "Baseline Start",
    "Baseline Finish",
    "Actual Start",
    "Actual Finish",
    "Forecast Start",
    "Forecast Finish",
    indianDateFormat(yesterday),
    indianDateFormat(today)
  ];

  const columnWidths = {
    "Activity ID": 80,
    "Description": 200,
    "Block": 80,
    "Priority": 60,
    "Contractor Name": 120,
    "UOM": 60,
    "Scope": 80,
    [`Completed as on\n${previousDate}`]: 100,
    "Balance": 80,
    "Baseline Start": 100,
    "Baseline Finish": 100,
    "Actual Start": 100,
    "Actual Finish": 100,
    "Forecast Start": 100,
    "Forecast Finish": 100,
    [indianDateFormat(yesterday)]: 80,
    [indianDateFormat(today)]: 80
  };

  const filteredData = useMemo(() => {
    if (!Array.isArray(data)) return [];
    const safeCustom = Array.isArray(customActivities) ? customActivities : [];

    const validRows = data.map(d => {
      if (d.isCategoryRow) return true;

      const matchBlock = selectedBlock === "ALL" || d.block === selectedBlock || d.newBlockNom === selectedBlock;

      const filterText = (universalFilter || "").trim().toUpperCase();
      const matchActivity = !filterText || filterText === "ALL" ||
        (d.activityId && String(d.activityId).toUpperCase().includes(filterText));

      return matchBlock && matchActivity;
    });

    const finalResult = [];
    for (let i = 0; i < data.length; i++) {
      if (data[i].isCategoryRow) {
        let validChildCount = 0;
        let j = i + 1;
        while (j < data.length && !data[j].isCategoryRow) {
          if (validRows[j]) validChildCount++;
          j++;
        }
        if (validChildCount >= 2) {
          finalResult.push(data[i]);
        }
      } else if (validRows[i]) {
        finalResult.push(data[i]);
      }
    }

    const filterText = (universalFilter || "").trim().toUpperCase();
    const customResult = safeCustom.filter(c => {
      const matchBlock = selectedBlock === "ALL" || c.block === selectedBlock;
      const matchActivity = !filterText || filterText === "ALL" ||
        (c.description && String(c.description).toUpperCase().includes(filterText));
      return matchBlock && matchActivity;
    });

    if (customResult.length > 0) {
      finalResult.push({
        isCategoryRow: true,
        description: "📝 DPR Level Activities"
      } as any);

      customResult.forEach(c => {
        finalResult.push({
          ...c,
          isCustom: true,
          _isCustomRow: true,
          _customId: c.id,
          activityId: '',
          description: c.description || '',
          newBlockNom: c.block || '',
          block: c.block || '',
          priority: c.extraData?.priority || '',
          contractorName: c.extraData?.contractorName || '',
          uom: c.uom || 'Nos',
          scope: String(c.scope || 0),
          actual: String(c.cumulative || 0),
          balance: String(Math.max(0, (c.scope || 0) - (c.cumulative || 0))),
          basePlanStart: c.plannedStart || '',
          basePlanFinish: c.plannedFinish || '',
          actualStart: c.actualStart || '',
          actualFinish: c.actualFinish || '',
          yesterdayValue: c.extraData?.yesterdayValue || '0',
          todayValue: c.extraData?.todayValue || '0'
        } as any);
      });
    }

    return finalResult;
  }, [data, customActivities, selectedBlock, universalFilter]);

  const tableData = useMemo(() => {
    const formatDt = (dt: any) => {
      if (!dt) return '';
      const dtStr = String(dt).split('T')[0];
      return indianDateFormat(dtStr) || dtStr;
    };

    const parsedYesterdayStr = yesterday ? String(yesterday).split('T')[0] : '';
    const referenceDateStr = dataDate ? String(dataDate).split('T')[0] : parsedYesterdayStr;

    const getDates = (r: any) => {
      const s = r.actualStart;
      const f = r.actualFinish;
      let actS = '', fcstS = '', actF = '', fcstF = '';

      // Start Date Logic
      if (s) {
        const sStr = String(s).split('T')[0];
        if (referenceDateStr && sStr <= referenceDateStr) {
          actS = indianDateFormat(sStr) || sStr;
          fcstS = ''; // No need forecast if actual is present and valid
        } else {
          fcstS = indianDateFormat(sStr) || sStr;
        }
      } else if (r.forecastStart) {
        const dStr = String(r.forecastStart).split('T')[0];
        fcstS = indianDateFormat(dStr) || dStr;
      }

      // Finish Date Logic
      if (f) {
        const fStr = String(f).split('T')[0];
        if (referenceDateStr && fStr <= referenceDateStr) {
          actF = indianDateFormat(fStr) || fStr;
          fcstF = ''; // No need forecast if actual is present and valid
        } else {
          fcstF = indianDateFormat(fStr) || fStr;
        }
      } else if (r.forecastFinish) {
        const dStr = String(r.forecastFinish).split('T')[0];
        fcstF = indianDateFormat(dStr) || dStr;
      }

      return { actS, fcstS, actF, fcstF };
    };

    return (Array.isArray(filteredData) ? filteredData : []).map(row => {
      const baselineStart = formatDt(row.basePlanStart);
      const baselineFinish = formatDt(row.basePlanFinish);

      let arr: any;
      if (row.isCategoryRow) {
        arr = [
          '',
          row.description || '',
          '',
          '',
          '',
          '',
          row.scope !== undefined && row.scope !== null ? String(row.scope) : "0",
          row.actual !== undefined && row.actual !== null ? String(row.actual) : "0",
          row.balance !== undefined && row.balance !== null ? String(row.balance) : "0",
          baselineStart,
          baselineFinish,
          formatDt(row.actualStart),
          formatDt(row.actualFinish),
          formatDt(row.forecastStart),
          formatDt(row.forecastFinish),
          "",
          row.yesterdayValue || '',
          row.todayValue || ''
        ];
        arr.isCategoryRow = true;
      } else {
        const d = getDates(row);
        arr = [
          row.activityId || '',
          row.description || (row as any).activities || (row as any).activity || (row as any).activity_name || (row as any).name || (row as any).Name || '',
          row.newBlockNom || row.block || '',
          row.priority || '',
          row.contractorName || '',
          row.uom || '',
          row.scope !== undefined && row.scope !== null ? String(row.scope) : "0",
          row.actual !== undefined && row.actual !== null ? String(row.actual) : "0",
          row.balance !== undefined && row.balance !== null ? String(row.balance) : "0",
          baselineStart,
          baselineFinish,
          d.actS,
          d.actF,
          d.fcstS,
          d.fcstF,
          row.yesterdayValue || '',
          row.todayValue || ''
        ];
      }

      if ((row as any)._cellStatuses) {
        arr._cellStatuses = (row as any)._cellStatuses;
      }
      if ((row as any)._isCustomRow) {
        arr._isCustomRow = true;
        arr._customId = (row as any)._customId;
      }

      return arr;
    });
  }, [filteredData, yesterday, today, previousDate]);

  const rowStyles = useMemo(() => {
    const styles: Record<number, any> = {};
    filteredData.forEach((row, index) => {
      if (row.isCategoryRow) {
        styles[index] = {
          backgroundColor: '#FADFAD',
          color: '#333333',
          fontWeight: 'bold',
          isCategoryRow: true
        };
      } else if ((row as any)._isCustomRow) {
        styles[index] = {
          backgroundColor: "#FFFBEB",
        };
      }
    });
    return styles;
  }, [filteredData]);

  const cellTextColors = useMemo(() => {
    const colors: Record<number, Record<string, string>> = {};
    filteredData.forEach((row, rowIndex) => {
      if (row.isCategoryRow) return;

      colors[rowIndex] = {};

      if (row.yesterdayIsApproved === false) {
        colors[rowIndex][indianDateFormat(yesterday)] = "#ce440d";
        colors[rowIndex]["Actual"] = "#ce440d";
      } else if (row.yesterdayIsApproved === true) {
        colors[rowIndex][indianDateFormat(yesterday)] = "#16a34a";
        colors[rowIndex]["Actual"] = "#16a34a";
      }

      const isValid = (d: any) => typeof d === 'string' && d.trim() !== '' && d !== '-';

      const effectiveActualStart = row.actualStart;
      const effectiveActualFinish = row.actualFinish;

      if (isValid(effectiveActualStart)) {
        colors[rowIndex]["Actual Start"] = "#16a34a";
      }

      if (isValid(effectiveActualFinish)) {
        colors[rowIndex]["Actual Finish"] = "#16a34a";
      }

      if (isValid(row.forecastStart)) {
        colors[rowIndex]["Forecast Start"] = "#2563eb";
      }

      if (isValid(row.forecastFinish)) {
        colors[rowIndex]["Forecast Finish"] = "#2563eb";
      }
    });
    return colors;
  }, [filteredData, yesterday]);

  const handleInlineAdd = useCallback(() => {
    if (onAddCustomActivity) {
      onAddCustomActivity({
        sheetType: 'testing_commissioning',
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

    const updatedRows = newData.map((row, index) => {
      const originalRow = filteredData[index];

      if (!originalRow || originalRow?.isCategoryRow) {
        return { ...originalRow };
      }

      const scope = Number(row[6]) || 0;
      const newYesterday = row[15];
      const newToday = row[16];

      const initialActual = Number(originalRow.actual) || 0;
      const initialToday = Number(originalRow.todayValue) || 0;
      const initialYesterday = Number(originalRow.yesterdayValue) || 0;
      const baseActual = initialActual - initialToday - initialYesterday;

      const calculatedActual = baseActual + (Number(newYesterday) || 0) + (Number(newToday) || 0);
      const calculatedBalance = scope - calculatedActual;

      const editedStart = row[11] || '';
      const editedFinish = row[12] || '';
      const editedFcstStart = row[13] || '';
      const editedFcstFinish = row[14] || '';

      const prevEffectiveStart = indianDateFormat(originalRow.actualStart) || '';
      const prevEffectiveFinish = indianDateFormat(originalRow.actualFinish) || '';
      const prevFcstStart = indianDateFormat(originalRow.forecastStart) || '';
      const prevFcstFinish = indianDateFormat(originalRow.forecastFinish) || '';

      let newActualStart = originalRow.actualStart || '';
      if (editedStart !== prevEffectiveStart) {
        let isFuture = false;
        if (editedStart) {
          const editedDateStr = new Date(editedStart).toISOString().split('T')[0];
          const calDateStr = dataDate ? new Date(dataDate).toISOString().split('T')[0] : (yesterday ? new Date(yesterday).toISOString().split('T')[0] : '');
          if (calDateStr && editedDateStr > calDateStr) isFuture = true;
        }

        if (isFuture) {
          if (window.confirm("You selected a future date for an Actual Start.\nP6 only accepts past/present dates for Actuals.\n\nClick OK to automatically save it as a Forecast date instead.\nClick Cancel to undo your change.")) {
            newActualStart = editedStart; // The getDates logic will auto-shift this to Forecast on next render
          } else {
            // Revert edit by doing nothing
          }
        } else {
          newActualStart = editedStart;
        }
      }

      let newActualFinish = originalRow.actualFinish || '';
      if (editedFinish !== prevEffectiveFinish) {
        let isFuture = false;
        if (editedFinish) {
          const editedDateStr = new Date(editedFinish).toISOString().split('T')[0];
          const calDateStr = dataDate ? new Date(dataDate).toISOString().split('T')[0] : (yesterday ? new Date(yesterday).toISOString().split('T')[0] : '');
          if (calDateStr && editedDateStr > calDateStr) isFuture = true;
        }

        if (isFuture) {
          if (window.confirm("You selected a future date for an Actual Finish.\nP6 only accepts past/present dates for Actuals.\n\nClick OK to automatically save it as a Forecast date instead.\nClick Cancel to undo your change.")) {
            newActualFinish = editedFinish;
          } else {
            // Revert edit
          }
        } else {
          newActualFinish = editedFinish;
        }
      }

      let newForecastStart = originalRow.forecastStart || '';
      if (editedFcstStart !== prevFcstStart) {
        newForecastStart = editedFcstStart;
      }

      let newForecastFinish = originalRow.forecastFinish || '';
      if (editedFcstFinish !== prevFcstFinish) {
        newForecastFinish = editedFcstFinish;
      }

      const updatedRow: any = {
        ...originalRow,
        activityId: row[0] || '',
        description: row[1] || '',
        priority: row[3] || '',
        contractorName: row[4] || '',
        uom: row[5] || '',
        scope: String(scope),
        actual: String(calculatedActual),
        balance: String(calculatedBalance),
        actualStart: newActualStart,
        actualFinish: newActualFinish,
        forecastStart: newForecastStart,
        forecastFinish: newForecastFinish,
        yesterdayValue: String(newYesterday),
        todayValue: String(newToday)
      };

      const cellStatuses = (row as any)['_cellStatuses'];
      if (cellStatuses && Object.keys(cellStatuses).length > 0) {
        updatedRow._cellStatuses = { ...cellStatuses };
      }

      if (originalRow.isCustom) {
        customRowChanges.push({ row, originalRow, calculatedActual });
      } else {
        p6RowChanges.push(updatedRow);
      }

      return updatedRow;
    });

    let currentCategoryIdx = -1;
    const categoryActivityMap: Record<number, number[]> = {};
    updatedRows.forEach((row, idx) => {
      if (row.isCategoryRow) {
        currentCategoryIdx = idx;
        categoryActivityMap[idx] = [];
      } else if (currentCategoryIdx >= 0) {
        categoryActivityMap[currentCategoryIdx].push(idx);
      }
    });

    Object.entries(categoryActivityMap).forEach(([catIdxStr, activityIndices]) => {
      const catIdx = Number(catIdxStr);
      const catRow = updatedRows[catIdx];
      const activities = activityIndices.map(i => updatedRows[i]);

      const totalScope = activities.reduce((sum, r) => sum + (Number(r.scope) || 0), 0);
      const totalActual = activities.reduce((sum, r) => sum + (Number(r.actual) || 0), 0);
      const totalBalance = totalScope - totalActual;
      const totalYesterday = activities.reduce((sum, r) => sum + (Number(r.yesterdayValue) || 0), 0);
      const totalToday = activities.reduce((sum, r) => sum + (Number(r.todayValue) || 0), 0);

      updatedRows[catIdx] = {
        ...catRow,
        scope: String(totalScope),
        actual: String(totalActual),
        balance: String(totalBalance),
        yesterdayValue: String(totalYesterday),
        todayValue: String(totalToday)
      };
    });

    if (p6RowChanges.length > 0) {
      if (selectedBlock !== "ALL") {
        const fullDataCopy = [...data];
        p6RowChanges.forEach(updatedRow => {
          const idx = fullDataCopy.findIndex(d => String(d.activityId) === String(updatedRow.activityId));
          if (idx !== -1) fullDataCopy[idx] = updatedRow;
        });
        setData(fullDataCopy);
      } else {
        const newP6Data = updatedRows.filter(r => !r.isCustom && !(r.isCategoryRow && r.description === "📝 DPR Level Activities"));
        setData(newP6Data);
      }
    }

    if (onEditCustomActivity && customRowChanges.length > 0) {
      customRowChanges.forEach(({ row, originalRow, calculatedActual }) => {
        const customId = originalRow._customId;
        if (!customId) return;
        const c = customActivities.find(x => x.id === customId);
        if (!c) return;

        const newDesc = row[1] || '';
        const newPriority = row[3] || '';
        const newContractor = row[4] || '';
        const newUom = row[5] || 'Nos';
        const newScope = row[6] || '0';

        const newActStart = row[11] || '';
        const newActFinish = row[12] || '';
        const newFcstStart = row[13] || '';
        const newFcstFinish = row[14] || '';

        const newYesterdayStr = String(row[15] || '0').trim();
        const newTodayStr = String(row[16] || '0').trim();

        const hasChanges =
          newDesc !== (c.description || '') ||
          newPriority !== (c.extraData?.priority || '') ||
          newContractor !== (c.extraData?.contractorName || '') ||
          newUom !== (c.uom || '') ||
          newScope !== String(c.scope || 0) ||
          newYesterdayStr !== String(c.extraData?.yesterdayValue || 0) ||
          newTodayStr !== String(c.extraData?.todayValue || 0) ||
          newActStart !== (c.actualStart || '') ||
          newActFinish !== (c.actualFinish || '');

        if (hasChanges) {
          onEditCustomActivity({
            id: customId,
            sheetType: 'testing_commissioning',
            description: newDesc,
            uom: newUom,
            scope: Number(newScope) || 0,
            cumulative: Number(calculatedActual) || 0,
            plannedStart: newActStart,
            plannedFinish: newActFinish,
            extraData: {
              ...c.extraData,
              priority: newPriority,
              contractorName: newContractor,
              yesterdayValue: newYesterdayStr,
              todayValue: newTodayStr,
            }
          });
        }
      });
    }

  }, [data, filteredData, selectedBlock, setData, customActivities, onEditCustomActivity]);

  const editableColumns = [
    "Description",
    "Priority",
    "Contractor Name",
    "UOM",
    "Scope",
    "Actual Start",
    "Actual Finish",
    indianDateFormat(yesterday),
    indianDateFormat(today)
  ];

  const columnTypes: Record<string, 'text' | 'number' | 'date'> = {
    "Activity ID": "text",
    "Description": "text",
    "Block": "text",
    "Priority": "text",
    "Contractor Name": "text",
    "UOM": "text",
    "Scope": "number",
    [`Completed as on\n${previousDate}`]: "number",
    "Balance": "number",
    "Baseline Start": "text",
    "Baseline Finish": "text",
    "Actual Start": "date",
    "Actual Finish": "date",
    "Forecast Start": "text",
    "Forecast Finish": "text",
    [indianDateFormat(yesterday)]: "number",
    [indianDateFormat(today)]: "number"
  };

  const handleRowDelete = useCallback((index: number) => {
    const row = tableData[index];
    if (row && (row as any)._isCustomRow && onDeleteCustomActivity) {
      const customId = (row as any)._customId;
      if (customId) onDeleteCustomActivity(customId);
    }
  }, [tableData, onDeleteCustomActivity]);

  return (
    <div className="space-y-2 w-full flex-1 min-h-0 flex flex-col">
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
        title="Testing & Commissioning"
        columns={columns}
        data={tableData}
        totalRows={totalRows}
        onDataChange={handleDataChange}
        onSave={onSave}
        onSubmit={onSubmit}
        onPush={onPush}
        isReadOnly={isLocked}
        editableColumns={editableColumns}
        columnTypes={columnTypes}
        columnWidths={columnWidths}
        cellTextColors={cellTextColors}
        columnTextColors={{
          "Actual Start": "inherit",
          "Actual Finish": "inherit",
          "Forecast Start": "inherit",
          "Forecast Finish": "inherit"
        }}
        columnFontWeights={{
          "Actual Start": "bold",
          "Actual Finish": "bold",
          "Forecast Start": "bold",
          "Forecast Finish": "bold"
        }}
        rowStyles={rowStyles}
        headerStructure={[
          [
            { label: "Activity ID", colSpan: 1, rowSpan: 2 },
            { label: "Description", colSpan: 1, rowSpan: 2 },
            { label: "Block", colSpan: 1, rowSpan: 2 },
            { label: "Priority", colSpan: 1, rowSpan: 2 },
            { label: "Contractor Name", colSpan: 1, rowSpan: 2 },
            { label: "UOM", colSpan: 1, rowSpan: 2 },
            { label: "Scope", colSpan: 1, rowSpan: 2 },
            { label: `Completed as on\n${previousDate}`, colSpan: 1, rowSpan: 2 },
            { label: "Balance", colSpan: 1, rowSpan: 2 },
            { label: "Baseline", colSpan: 2 },
            { label: "Actual", colSpan: 2 },
            { label: "Forecast", colSpan: 2 },
            { label: "Daily Progress", colSpan: 2 }
          ],
          [
            { label: "Start", colSpan: 1 },
            { label: "Finish", colSpan: 1 },
            { label: "Start", colSpan: 1 },
            { label: "Finish", colSpan: 1 },
            { label: "Start", colSpan: 1 },
            { label: "Finish", colSpan: 1 },
            { label: indianDateFormat(yesterday), colSpan: 1 },
            { label: indianDateFormat(today), colSpan: 1 }
          ]
        ]}
        status={status}
        onExportAll={onExportAll}
        onFullscreenToggle={onFullscreenToggle}
        onReachEnd={onReachEnd}
        externalGlobalFilter={universalFilter}
        projectId={projectId}
        sheetType="testing_commissioning"
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
