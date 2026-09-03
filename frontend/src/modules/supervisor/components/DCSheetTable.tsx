import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { historyEditedLabels, resolveHistoryCellDisplay, resolveHistorySum } from "@/utils/historyValues";
import { StyledExcelTable } from "@/components/StyledExcelTable";
import { StatusChip } from "@/components/StatusChip";
import { indianDateFormat, parseDateToIso, getTodayAndYesterday } from "@/services/dprService";
import { EntryStatus } from "@/types";
import { Plus, Upload } from "lucide-react";
import { useAuth } from '@/modules/auth/contexts/AuthContext';

export interface DCSheetData {
  // From P6 API
  activityId: string;
  description: string;
  plot: string;
  block?: string;
  newBlockNom: string;
  baselinePriority: string;
  scope: string;
  front: string;
  uom?: string;
  balance?: string;
  basePlanStart?: string;
  basePlanFinish?: string;
  actualStart?: string;
  actualFinish?: string;
  forecastStart?: string;
  forecastFinish?: string;

  // User-editable fields
  priority: string;
  contractorName: string;
  remarks: string;

  // Calculated fields
  actual: string;
  completionPercentage: string;

  // Date values
  yesterdayValue?: string; // Number value, not editable
  todayValue?: string; // Number value, editable

  category?: string;
  isCategoryRow?: boolean;
  yesterdayIsApproved?: boolean;
  selectedResourceId?: string;
  [key: string]: any;
}

interface DCSheetTableProps {
  data: DCSheetData[];
  setData: (data: DCSheetData[]) => void;
  onSave?: (isAuto?: boolean) => void | Promise<void>;
  onSubmit?: () => void;
  yesterday: string;
  today: string;
  dataDate?: string;
  isLocked?: boolean;
  status?: EntryStatus;

  onExportAll?: () => void;
  totalRows?: number;
  onFullscreenToggle?: (isFullscreen: boolean) => void;
  onReachEnd?: () => void;
  projectId?: number;
  selectedBlock?: string;
  universalFilter?: string;
  onPush?: () => void;
  resourcesByActivity?: Record<string, any[]>;
  dailyHistory?: Record<string, Record<string, number>>;

  customActivities?: any[];
  onAddCustomActivity?: (activity: any, silent?: boolean) => void;
  onEditCustomActivity?: (activity: any) => void;
  onDeleteCustomActivity?: (id: number) => void;
  onBulkUploadActivities?: () => void;
}

export function DCSheetTable({
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
  onFullscreenToggle,
  onReachEnd,
  universalFilter,
  projectId,
  selectedBlock = "ALL",
  resourcesByActivity = {},
  dailyHistory = {},
  customActivities = [],
  onAddCustomActivity,
  onEditCustomActivity,
  onDeleteCustomActivity,
  onBulkUploadActivities
}: DCSheetTableProps) {

  const { user } = useAuth();
  const userRole = (user?.role || user?.Role || '').toLowerCase();
  const isPmagOrAdmin = userRole.includes('pmag') || userRole.includes('admin');

  const previousDate = indianDateFormat(yesterday);

  // Generate last 7 days date labels (ISO strings and formatted labels)
  const historyDates = useMemo(() => {
    const dates: { iso: string; label: string }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const iso = d.toISOString().split('T')[0];
      dates.push({ iso, label: indianDateFormat(iso) });
    }
    return dates;
  }, [today]);

  // The last 2 entries in historyDates are yesterday and today
  // Columns before yesterday are read-only history columns
  const HISTORY_COLS = 5; // days before yesterday

  // Define columns
  const columns = useMemo(() => [
    "Activity ID",
    "Description",
    "Block",
    "Status",
    "Priority",
    "Contractor Name",
    "UOM",
    "Scope",
    `Completed as on\n${previousDate}`,
    "Balance",
    "Physical Progress %",
    "Baseline Start",
    "Baseline Finish",
    "Actual Start",
    "Actual Finish",
    "Forecast Start",
    "Forecast Finish",
    "Resource",
    // 5 history date columns (read-only)
    ...historyDates.slice(0, HISTORY_COLS).map(d => d.label),
    // yesterday + today (editable)
    indianDateFormat(yesterday),
    indianDateFormat(today)
  ], [previousDate, historyDates, yesterday, today]);

  // Multi-row header structure (ASME pattern)
  const headerStructure = useMemo(() => [
    [
      { label: "Activity ID", rowSpan: 2 },
      { label: "Description", rowSpan: 2 },
      { label: "Block", rowSpan: 2 },
      { label: "Status", rowSpan: 2 },
      { label: "Priority", rowSpan: 2 },
      { label: "Contractor Name", rowSpan: 2 },
      { label: "UOM", rowSpan: 2 },
      { label: "Scope", rowSpan: 2 },
      { label: `Completed as on\n${previousDate}`, rowSpan: 2 },
      { label: "Balance", rowSpan: 2 },
      { label: "Physical Progress %", rowSpan: 2 },
      { label: "Baseline", colSpan: 2 },
      { label: "Actual", colSpan: 2 },
      { label: "Forecast", colSpan: 2 },
      { label: "Resource", rowSpan: 2 },
      ...historyDates.slice(0, HISTORY_COLS).map(d => ({ label: d.label, rowSpan: 2 })),
      { label: indianDateFormat(yesterday), rowSpan: 2 },
      { label: indianDateFormat(today), rowSpan: 2 }
    ],
    [
      { label: "Start", colSpan: 1, rowSpan: 1 },
      { label: "Finish", colSpan: 1, rowSpan: 1 },
      { label: "Start", colSpan: 1, rowSpan: 1 },
      { label: "Finish", colSpan: 1, rowSpan: 1 },
      { label: "Start", colSpan: 1, rowSpan: 1 },
      { label: "Finish", colSpan: 1, rowSpan: 1 }
    ]
  ], [previousDate, historyDates, yesterday, today]);

  // Define column widths for better alignment
  const columnWidths = useMemo(() => {
    const widths: Record<string, number> = {
      "Activity ID": 80,
      "Description": 200,
      "Block": 80,
      "Status": 110,
      "Priority": 100,
      "Contractor Name": 150,
      "UOM": 60,
      "Scope": 80,
      [`Completed as on\n${previousDate}`]: 100,
      "Balance": 80,
      "Physical Progress %": 100,
      "Baseline Start": 100,
      "Baseline Finish": 100,
      "Actual Start": 100,
      "Actual Finish": 100,
      "Forecast Start": 100,
      "Forecast Finish": 100,
      "Resource": 140,
      [indianDateFormat(yesterday)]: 80,
      [indianDateFormat(today)]: 80
    };
    historyDates.slice(0, HISTORY_COLS).forEach(d => { widths[d.label] = 80; });
    return widths;
  }, [previousDate, historyDates, yesterday, today]);

  const filteredData = useMemo(() => {
    if (!Array.isArray(data)) return [];
    const safeCustom = Array.isArray(customActivities) ? customActivities : [];

    // First pass: identify valid non-category rows
    const validRows = data.map(d => {
      if (d.isCategoryRow) return true; // Keep initially

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
          if (validRows[j]) {
            validChildCount++;
          }
          j++;
        }
        if (validChildCount >= 2) {
          finalResult.push(data[i]);
        }
      } else if (validRows[i]) {
        finalResult.push(data[i]);
      }
    }

    // DPR-level activities are deliberately NOT subject to the ACTIVITY FILTER.
    //
    // That filter selects a P6 activity-code family ("CC", "MMS", ...), and a DPR-level activity is
    // by definition one that is not in P6: its id is "DPR-{project}-{n}" and its description is
    // whatever the site typed, so it can never carry the selected code. Matching it against that
    // code therefore hid every DPR activity whenever any filter but ALL was set - "Add DPR
    // Activity" reported success, the row really was created in dpr_custom_activities, and nothing
    // ever appeared on the sheet. They print under their own "DPR Level Activities" heading, so
    // showing them is not ambiguous. The BLOCK filter still applies, since a DPR activity does
    // belong to a block.
    const customResult = safeCustom.filter(c =>
      selectedBlock === "ALL" || c.block === selectedBlock
    );

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
          historyValues: c.extraData?.historyValues || {},
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

    const getDates = (r: any, effActStart: any, effActFinish: any) => {
      const s = effActStart !== undefined ? effActStart : r.actualStart;
      const f = effActFinish !== undefined ? effActFinish : r.actualFinish;
      let actS = '', fcstS = '', actF = '', fcstF = '';
      let rawFcstS = '', rawFcstF = '';

      // Start Date Logic
      if (s) {
        const sStr = String(s).split('T')[0];
        actS = indianDateFormat(sStr) || sStr;
        fcstS = ''; // No need forecast if actual is present and valid
        rawFcstS = '';
      } else if (r.forecastStart) {
        const dStr = String(r.forecastStart).split('T')[0];
        fcstS = indianDateFormat(dStr) || dStr;
        rawFcstS = dStr;
      }

      // Finish Date Logic
      if (f) {
        const fStr = String(f).split('T')[0];
        actF = indianDateFormat(fStr) || fStr;
        fcstF = ''; // No need forecast if actual is present and valid
        rawFcstF = '';
      } else if (r.forecastFinish) {
        const dStr = String(r.forecastFinish).split('T')[0];
        fcstF = indianDateFormat(dStr) || dStr;
        rawFcstF = dStr;
      }

      return { actS, fcstS, actF, fcstF, rawFcstS, rawFcstF };
    };

    const rows = (Array.isArray(filteredData) ? filteredData : []).map(row => {
      const baselineStart = formatDt(row.basePlanStart);
      const baselineFinish = formatDt(row.basePlanFinish);

      const getHistoryValues = (rowToRead: any, activityId: string, activityObjectId: string) => {
        const historyMap = dailyHistory[activityId] || dailyHistory[activityObjectId] || {};
        const rowHistory = rowToRead.historyValues || {};
        // A 0 in rowHistory is usually a placeholder the grid sent for a column nobody typed in,
        // not a reading - so it must not mask the daily-progress ledger. See resolveHistoryCell.
        const edited = historyEditedLabels(rowToRead);
        return historyDates.slice(0, HISTORY_COLS).map(d =>
          resolveHistoryCellDisplay(rowHistory, historyMap, d.iso, !!edited[d.label])
        );
      };

      let arr: any;
      if (row.isCategoryRow) {

        const catHistoryMap = row.historyValues || {};
        const catHistVals = historyDates.slice(0, HISTORY_COLS).map(hd => {
          const valStr = String(catHistoryMap[hd.iso] || "");
          return (!valStr || Number(valStr) === 0) ? "" : valStr;
        });
        arr = [
          row.activityId || '',
          // Row's Scope/Completed/Balance are a sum of the activities below it - label it as one
          // so a total changing when a supervisor corrects an activity's history reads as
          // "N activities add up to this" instead of an unexplained jump.
          (row.description || '') + (row.childCount ? ` (Σ of ${row.childCount})` : ''),
          row.block || '',
          row.status || '',
          row.priority || '',
          row.contractorName || '',
          row.uom || '',
          row.scope !== undefined && row.scope !== null ? String(row.scope) : "0",
          row.actual !== undefined && row.actual !== null ? String(row.actual) : "0",
          row.balance !== undefined && row.balance !== null ? String(row.balance) : "0",
          "", // No physical progress for category row
          baselineStart,
          baselineFinish,
          formatDt(row.actualStart),
          formatDt(row.actualFinish),
          formatDt(row.forecastStart),
          formatDt(row.forecastFinish),
          '', // Resource is empty for category row
          ...catHistVals,
          (!row.yesterdayValue || Number(row.yesterdayValue) === 0) ? "" : String(row.yesterdayValue),
          (!row.todayValue || Number(row.todayValue) === 0) ? "" : String(row.todayValue)
        ];
        arr.isCategoryRow = true;
      } else {
        let finalResourceId = String(row.selectedResourceId || '').trim();
        const actId = String(row.activityId || '').trim();

        if (!row.isCustom && !finalResourceId && actId && resourcesByActivity) {
          const resources = resourcesByActivity[actId];
          if (resources && resources.length === 1) {
            finalResourceId = String(resources[0].resourceId).trim();
          }
        }

        const resources = actId ? resourcesByActivity[actId] : undefined;
        const selectedRes = resources?.find((r: any) => String(r.resourceId) === String(finalResourceId));

        const resActualStart = selectedRes?.actualStart;
        const resActualFinish = selectedRes?.actualFinish;

        const effectiveActualStart = row.actualStart !== undefined ? row.actualStart : resActualStart;
        const effectiveActualFinish = row.actualFinish !== undefined ? row.actualFinish : resActualFinish;

        const d = getDates(row, effectiveActualStart, effectiveActualFinish);

        const histVals = getHistoryValues(row, actId, String(row.activityObjectId || ''));

        arr = [
          row.activityId || '',
          row.description || (row as any).activities || (row as any).activity || (row as any).activity_name || (row as any).name || (row as any).Name || '',
          row.newBlockNom || row.block || '',
          row.status || 'Not Started',
          row.priority || '',
          row.contractorName || '',
          row.uom || '',
          row.scope !== undefined && row.scope !== null ? String(row.scope) : "0",
          row.actual !== undefined && row.actual !== null ? String(row.actual) : "0",
          row.balance !== undefined && row.balance !== null ? String(row.balance) : "0",
          row.percentComplete !== undefined && row.percentComplete !== null ? String(Math.round(Number(row.percentComplete) * 100)) : (row.completionPercentage || row.percentComplete || row.progress || ''),
          baselineStart,
          baselineFinish,
          d.actS,
          d.actF,
          d.fcstS,
          d.fcstF,
          finalResourceId,
          ...histVals,
          (!row.yesterdayValue || Number(row.yesterdayValue) === 0) ? "" : String(row.yesterdayValue),
          (!row.todayValue || Number(row.todayValue) === 0) ? "" : String(row.todayValue)
        ];

        arr._cellStatuses = { ...((row as any)._cellStatuses || {}) };
        (arr as any)._savedCellStatuses = { ...((row as any)._savedCellStatuses || {}) };
      }

      if ((row as any)._isCustomRow) {
        arr._isCustomRow = true;
        arr._customId = (row as any)._customId;
      }

      arr._rawDates = row.isCategoryRow ? {} : {
        rawFcstS: (arr[15] !== '') ? (row.forecastStart ? String(row.forecastStart).split('T')[0] : '') : '',
        rawFcstF: (arr[16] !== '') ? (row.forecastFinish ? String(row.forecastFinish).split('T')[0] : '') : ''
      };

      return arr;
    });

    // Aggregate category totals from bottom to top
    let currentSums = {
      scope: 0,
      actual: 0,
      balance: 0,
      history: Array(HISTORY_COLS).fill(0),
      yesterday: 0,
      today: 0,
      fcstS_list: [] as string[],
      fcstF_list: [] as string[]
    };

    for (let i = rows.length - 1; i >= 0; i--) {
      const arr = rows[i];
      if (arr.isCategoryRow) {
        arr[7] = currentSums.scope === 0 ? "0" : String(Math.round(currentSums.scope));
        arr[8] = currentSums.actual === 0 ? "0" : String(Math.round(currentSums.actual));
        arr[9] = currentSums.balance === 0 ? "0" : String(Math.round(currentSums.balance));

        const validFcstS = currentSums.fcstS_list.filter(d => !!d).sort();
        arr[15] = validFcstS.length ? (indianDateFormat(validFcstS[0]) || validFcstS[0]) : '';
        const validFcstF = currentSums.fcstF_list.filter(d => !!d).sort();
        arr[16] = validFcstF.length ? (indianDateFormat(validFcstF[validFcstF.length - 1]) || validFcstF[validFcstF.length - 1]) : '';

        for (let j = 0; j < HISTORY_COLS; j++) {
          const val = currentSums.history[j];
          arr[18 + j] = val === 0 ? "" : String(Math.round(val));
        }
        arr[18 + HISTORY_COLS] = currentSums.yesterday === 0 ? "" : String(Math.round(currentSums.yesterday));
        arr[18 + HISTORY_COLS + 1] = currentSums.today === 0 ? "" : String(Math.round(currentSums.today));

        currentSums = { scope: 0, actual: 0, balance: 0, history: Array(HISTORY_COLS).fill(0), yesterday: 0, today: 0, fcstS_list: [], fcstF_list: [] };
      } else {
        currentSums.scope += Number(arr[7]) || 0;
        currentSums.actual += Number(arr[8]) || 0;
        currentSums.balance += Number(arr[9]) || 0;
        if (arr._rawDates.rawFcstS) currentSums.fcstS_list.push(arr._rawDates.rawFcstS);
        if (arr._rawDates.rawFcstF) currentSums.fcstF_list.push(arr._rawDates.rawFcstF);
        for (let j = 0; j < HISTORY_COLS; j++) {
          currentSums.history[j] += Number(arr[18 + j]) || 0;
        }
        currentSums.yesterday += Number(arr[18 + HISTORY_COLS]) || 0;
        currentSums.today += Number(arr[18 + HISTORY_COLS + 1]) || 0;
      }
    }

    return rows;
  }, [filteredData, yesterday, today, previousDate, resourcesByActivity, dailyHistory, historyDates]);

  const rowStyles = useMemo(() => {
    const styles: Record<number, any> = {};
    filteredData.forEach((row, index) => {
      if (row.isCategoryRow) {
        styles[index] = {
          backgroundColor: '#FADFAD',
          color: '#333333',
          fontWeight: 'bold',
          isCategoryRow: true,
          readonlyCells: columns
        };
      } else if ((row as any)._isCustomRow) {
        styles[index] = {
          backgroundColor: "#FFFBEB",
        };
      } else {
        const actId = String(row.activityId || '').trim();
        const resources = actId ? resourcesByActivity[actId] : undefined;
        if (!resources || resources.length === 0) {
          styles[index] = {
            readonlyCells: []
          };
        }
      }
    });
    return styles;
  }, [filteredData, resourcesByActivity]);

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

      const actId = String(row.activityId || '').trim();
      const resources = actId ? resourcesByActivity[actId] : undefined;
      let finalResourceId = String(row.selectedResourceId || '').trim();
      if (!row.isCustom && !finalResourceId && actId && resources?.length === 1) {
        finalResourceId = String(resources[0].resourceId).trim();
      }
      const selectedRes = resources?.find(r => String(r.resourceId) === String(finalResourceId));

      const effectiveActualStart = selectedRes?.actualStart || row.actualStart;
      const effectiveActualFinish = selectedRes?.actualFinish || row.actualFinish;

      const isValid = (d: any) => typeof d === 'string' && d.trim() !== '' && d !== '-';

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
  }, [filteredData, yesterday, resourcesByActivity]);

  const handleInlineAdd = useCallback(() => {
    if (onAddCustomActivity) {
      onAddCustomActivity({
        sheetType: 'dc_sheet',
        description: 'New DPR Activity',
        uom: 'Nos',
        scope: 0,
        block: selectedBlock !== 'ALL' ? selectedBlock : '',
      });
    }
  }, [onAddCustomActivity, selectedBlock]);

  const handleDataChange = useCallback((newData: any[][]) => {
    let hasChanges = false;
    const finalDataCopy = [...data];

    newData.forEach((row, index) => {
      const originalRow = filteredData[index];
      if (!originalRow || originalRow.isCategoryRow) return;


      const existingStatuses = (originalRow as any)._cellStatuses || {};
      const incomingStatuses = (row as any)._cellStatuses || {};
      let cellStatuses = { ...existingStatuses, ...incomingStatuses } as any;

      const actId = originalRow.activityId || '';
      const customId = originalRow._customId;
      const isCustomRow = !!customId;
      const original = (isCustomRow ? customActivities?.find(c => String(c.id) === String(customId)) : filteredData.find(d => String(d.activityId) === String(actId))) || {};

      const oldStatus = original.status || 'Not Started';
      const newStatus = row[3] || 'Not Started';
      if (oldStatus !== newStatus) cellStatuses['status'] = { isDirty: true };

      const prevPriority = String(original.priority || '').trim();
      const newPriority = String(row[4] || '').trim();
      if (prevPriority !== newPriority) cellStatuses['priority'] = { isDirty: true };

      const prevContractor = String(original.contractorName || '').trim();
      const newContractor = String(row[5] || '').trim();
      if (prevContractor !== newContractor) cellStatuses['contractorName'] = { isDirty: true };

      const storedRes = String(original.selectedResourceId || '').trim();
      const resourcesForRow = original.activityId ? resourcesByActivity[String(original.activityId)] : undefined;
      let oldRes = storedRes;
      if (!original.isCustom && !oldRes && resourcesForRow?.length === 1) {
        oldRes = String(resourcesForRow[0].resourceId).trim();
      }
      const newRes = String(row[17] || '').trim();
      const resourceChanged = oldRes !== newRes;
      if (resourceChanged) cellStatuses['selectedResourceId'] = { isDirty: true };

      const prevScope = String(original.scope ?? '').trim();
      const newScopeStr = row[7] !== undefined ? String(row[7]).trim() : prevScope;
      if (prevScope !== newScopeStr) cellStatuses['scope'] = { isDirty: true };

      if (!isCustomRow) {
        let newActStart = row[13] ? parseDateToIso(String(row[13])) : null;
        let newActFinish = row[14] ? parseDateToIso(String(row[14])) : null;

        const histStartIdx = 18;
        const customNewHistoryVals = historyDates.slice(0, HISTORY_COLS).reduce((acc: any, hd, idx) => {
          acc[hd.iso] = Number(row[histStartIdx + idx]) || 0;
          return acc;
        }, {});

        const newYesterdayStr = String(row[histStartIdx + HISTORY_COLS] || '');
        const newTodayStr = String(row[histStartIdx + HISTORY_COLS + 1] || '');

        let finalActId = String(row[0]).trim();
        if (!finalActId && originalRow.description && (originalRow as any).activities) {
          finalActId = String((originalRow as any).activityObjectId || '').trim();
        }
        
        const newHistorySum = historyDates.slice(0, HISTORY_COLS).reduce((sum, _, i) => sum + (Number(row[histStartIdx + i]) || 0), 0);
        const initialToday = Number(originalRow.todayValue) || 0;
        const initialYesterday = Number(originalRow.yesterdayValue) || 0;
        const initialActual = Number(originalRow.actual ?? originalRow.cumulative) || 0;

        const actId = originalRow.activityId;
        const resources = actId ? resourcesByActivity[actId] : undefined;
        const selectedRes = resources?.find(r => String(r.resourceId) === String(newRes));

        // What the history columns were SHOWING before this edit - resolved exactly the way the
        // cells are rendered, so the cumulative subtracts the same figure it is about to add back.
        // Summing originalRow.historyValues directly counted the grid's placeholder zeros instead
        // of the ledger values actually on screen, and "Completed as on" drifted by the difference.
        const ledgerHistory = dailyHistory[actId] || dailyHistory[String((originalRow as any).activityObjectId || '')] || {};
        const initialHistorySum = resolveHistorySum(
          originalRow.historyValues,
          ledgerHistory,
          historyDates.slice(0, HISTORY_COLS).map(d => d.iso),
          historyEditedLabels(originalRow),
          iso => (historyDates.find(d => d.iso === iso)?.label || iso),
        );

        let baseActual = 0;
        if (selectedRes && resourceChanged) {
          baseActual = (selectedRes.actualUnits || 0) - initialToday - initialYesterday - initialHistorySum;
        } else {
          baseActual = initialActual - initialToday - initialYesterday - initialHistorySum;
        }

        const calculatedActual = baseActual + (Number(newYesterdayStr) || 0) + (Number(newTodayStr) || 0) + newHistorySum;
        const newCum = calculatedActual;



        const idx = finalDataCopy.findIndex(d => {
           const dActId = String(d.activityId || '').trim();
           const dObjId = String(d.activityObjectId || '').trim();
           return (dActId && dActId === finalActId) || (dObjId && dObjId === finalActId) || d === originalRow;
        });

        if (idx !== -1) {
          hasChanges = true;
          finalDataCopy[idx] = {
            ...finalDataCopy[idx],
            _cellStatuses: cellStatuses,
            status: newStatus,
            priority: newPriority,
            contractorName: newContractor,
            percentComplete: row[10] !== '' ? Number(row[10]) / 100 : undefined,
            completionPercentage: row[10] !== '' ? String(row[10]) : '',
            cumulative: newCum,
            actual: String(newCum),
            scope: newScopeStr,
            targetQty: newScopeStr,
            totalQuantity: newScopeStr,
            actualStart: newActStart,
            actualFinish: newActFinish,
            historyValues: customNewHistoryVals,
            yesterdayValue: newYesterdayStr,
            todayValue: newTodayStr,
            selectedResourceId: resourceChanged ? newRes : storedRes
          };
        }
      } else if (onEditCustomActivity) {
        let newActStart = row[13] ? parseDateToIso(String(row[13])) : null;
        let newActFinish = row[14] ? parseDateToIso(String(row[14])) : null;

        const histStartIdx = 18;
        const customNewHistoryVals = historyDates.slice(0, HISTORY_COLS).reduce((acc: any, hd, idx) => {
          acc[hd.iso] = Number(row[histStartIdx + idx]) || 0;
          return acc;
        }, {});

        const newYesterdayStr = String(row[histStartIdx + HISTORY_COLS] || '');
        const newTodayStr = String(row[histStartIdx + HISTORY_COLS + 1] || '');

        const c = customActivities?.find(x => String(x.id) === String(customId));
        let customCalculatedActual = 0;
        if (c) {
          let historyMap = c.extraData?.historyValues || {};
          const initialHistorySum = historyDates.slice(0, HISTORY_COLS).reduce((sum, d) => sum + (Number(historyMap[d.iso]) || 0), 0);
          const newHistorySum = historyDates.slice(0, HISTORY_COLS).reduce((sum, _, i) => sum + (Number(row[histStartIdx + i]) || 0), 0);
          const initialActual = Number(c.cumulative) || 0;
          const initialToday = Number(c.extraData?.todayValue) || 0;
          const initialYesterday = Number(c.extraData?.yesterdayValue) || 0;
          
          const baseActual = initialActual - initialToday - initialYesterday - initialHistorySum;
          customCalculatedActual = baseActual + (Number(newYesterdayStr) || 0) + (Number(newTodayStr) || 0) + newHistorySum;
        }

        const baseScope = Number(row[7]) || 0;
        const newCum = c ? customCalculatedActual : (Number(row[8]) || 0);
        if (c) {
          hasChanges = true;

          const updatedCustomRow = {
            ...finalDataCopy[index],
            _cellStatuses: cellStatuses,
            status: newStatus,
            description: String(row[1] || '').trim(),
            scope: baseScope,
            cumulative: Number(newCum) || 0,
            percentComplete: row[10] !== '' ? Number(row[10]) / 100 : undefined,
            actualStart: newActStart,
            actualFinish: newActFinish,
            extraData: {
              ...c.extraData,
              priority: newPriority,
              contractorName: newContractor,
              historyValues: customNewHistoryVals,
              yesterdayValue: newYesterdayStr,
              todayValue: newTodayStr,
            }
          };
          
          finalDataCopy[index] = updatedCustomRow;

          onEditCustomActivity({
            id: c.id,
            sheetType: 'dc_sheet',
            _cellStatuses: cellStatuses,
            status: newStatus,
            description: String(row[1] || '').trim(),
            scope: baseScope,
            cumulative: Number(newCum) || 0,
            percentComplete: row[10] !== '' ? Number(row[10]) / 100 : undefined,
            actualStart: newActStart,
            actualFinish: newActFinish,
            extraData: {
              ...c.extraData,
              priority: newPriority,
              contractorName: newContractor,
              historyValues: customNewHistoryVals,
              yesterdayValue: newYesterdayStr,
              todayValue: newTodayStr,
            }
          });
        }
      }
    });

    if (hasChanges) {
      setData(finalDataCopy);
    }
  }, [data, filteredData, historyDates, customActivities, onEditCustomActivity, setData]);

  const editableColumns = useMemo(() => [
    "Description",
    "Status",
    "Priority",
    "Contractor Name",
    "UOM",
    "Scope",
    "Physical Progress %",
    "Actual Start",
    "Actual Finish",
    "Resource",
    ...historyDates.slice(0, HISTORY_COLS).map(d => d.label),
    indianDateFormat(yesterday),
    indianDateFormat(today)
  ], [yesterday, today, historyDates]);

  const columnTypes: Record<string, 'text' | 'number' | 'date' | 'select' | 'alphabet'> = useMemo(() => {
    const types: Record<string, 'text' | 'number' | 'date' | 'select' | 'alphabet'> = {
      "Activity ID": "text",
      "Description": "text",
      "Block": "text",
      "Status": "select",
      "Priority": "text",
      "Contractor Name": "alphabet",
      "UOM": "text",
      "Scope": "number",
      [`Completed as on\n${previousDate}`]: "number",
      "Balance": "number",
      "Physical Progress %": "number",
      "Baseline Start": "text",
      "Baseline Finish": "text",
      "Actual Start": "date",
      "Actual Finish": "date",
      "Forecast Start": "text",
      "Forecast Finish": "text",
      "Resource": "select",
      [indianDateFormat(yesterday)]: "number",
      [indianDateFormat(today)]: "number"
    };
    // Historical date columns are read-only numbers
    historyDates.slice(0, HISTORY_COLS).forEach(d => { types[d.label] = "number"; });
    return types;
  }, [previousDate, yesterday, today, historyDates]);

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
        title="DC Side"
        columns={columns}
        data={tableData}
        totalRows={totalRows}
        onDataChange={handleDataChange}
        onSave={onSave}
        onSubmit={onSubmit}
        onPush={onPush}
        isReadOnly={isLocked}
        editableColumns={editableColumns}
        columnOptions={{
          "Status": ["Not Started", "In Progress", "Completed"]
        }}
        columnTypes={columnTypes}
        columnWidths={columnWidths}
        cellTextColors={cellTextColors}
        columnTextColors={{
          "Actual Start": "inherit",
          "Actual Finish": "inherit",
          "Forecast Start": "inherit",
          "Forecast Finish": "inherit",
          "Resource": "#4f46e5"
        }}
        columnFontWeights={{
          "Actual Start": "bold",
          "Actual Finish": "bold",
          "Forecast Start": "bold",
          "Forecast Finish": "bold",
          "Resource": "bold"
        }}
        rowStyles={rowStyles}
        headerStructure={headerStructure}
        status={status}
        onExportAll={onExportAll}
        onFullscreenToggle={onFullscreenToggle}
        onReachEnd={onReachEnd}
        externalGlobalFilter={universalFilter}
        projectId={projectId}
        sheetType="dc_sheet"
        rowColumnOptions={useMemo(() => {
          const opts: Record<number, Record<string, any[]>> = {};
          filteredData.forEach((row, index) => {
            if (row.isCategoryRow || (row as any)._isCustomRow) return;
            const actId = String(row.activityId || '').trim();
            if (!actId) return;
            const resources = resourcesByActivity[actId];
            if (resources && resources.length > 0) {
              opts[index] = {
                "Resource": resources.map(r => ({
                  label: r.resourceName,
                  value: String(r.resourceId).trim()
                }))
              };
            }
          });
          return opts;
        }, [filteredData, resourcesByActivity])}
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

