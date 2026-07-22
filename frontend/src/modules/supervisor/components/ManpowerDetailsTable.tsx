import React, { useEffect, useMemo, useCallback } from "react";
import { StyledExcelTable } from "@/components/StyledExcelTable";
import { indianDateFormat, parseDateToIso, getTodayAndYesterday } from "@/services/dprService";
import { EntryStatus } from "@/types";
import { Plus, Upload } from "lucide-react";
import { useAuth } from '@/modules/auth/contexts/AuthContext';

export interface ManpowerDetailsData {
  activityId: string;
  description: string;
  block: string;
  budgetedUnits: string; // Now in Days
  actualUnits: string;   // Now in Days
  remainingUnits: string; // Now in Days
  hoursPerDay?: number;
  percentComplete?: string;
  yesterdayValue: string; // In Days/Headcount
  todayValue: string;     // In Days/Headcount
  yesterdayIsApproved?: boolean;
  isCategoryRow?: boolean;
  category?: string;
  newBlockNom?: string;
  [key: string]: any;
}

interface ManpowerDetailsTableProps {
  data: ManpowerDetailsData[];
  setData: (data: ManpowerDetailsData[]) => void;
  totalManpower: number;
  setTotalManpower: (value: number) => void;
  onSave?: () => void;
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
  onAddCustomActivity?: (activity: any, silent?: boolean) => void;
  onEditCustomActivity?: (activity: any) => void;
  onDeleteCustomActivity?: (id: number) => void;
  onBulkUploadActivities?: () => void;
  dailyHistory?: Record<string, Record<string, number>>;
}

export function ManpowerDetailsTable({
  data,
  setData,
  totalManpower,
  setTotalManpower,
  onSave,
  onSubmit,
  onPush,
  yesterday,
  today,
  isLocked = false,
  status = 'draft',
  onExportAll,
  totalRows,
  onFullscreenToggle,
  onReachEnd,
  universalFilter,
  projectId,
  selectedBlock = "ALL",
  customActivities = [],
  onAddCustomActivity,
  onEditCustomActivity,
  onDeleteCustomActivity,
  onBulkUploadActivities,
  dailyHistory = {}
}: ManpowerDetailsTableProps) {

  const { user } = useAuth();
  const userRole = (user?.role || user?.Role || '').toLowerCase();
  const isPmagOrAdmin = userRole.includes('pmag') || userRole.includes('admin');

  const { yesterday: previousDateISO } = getTodayAndYesterday();
  const previousDate = indianDateFormat(previousDateISO);

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

  const HISTORY_COLS = 5;

  const columns = useMemo(() => [
    "Activity ID",
    "Description",
    "Block",
    "Hours/Day",
    "Required",
    "Available",
    "Gap",
    "% Completion",
    ...historyDates.slice(0, HISTORY_COLS).map(d => d.label),
    indianDateFormat(yesterday),
    indianDateFormat(today)
  ], [yesterday, today, historyDates]);

  // Filter data based on selected block and universal filter
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
        const budgeted = c.scope || 0;
        const actual = c.cumulative || 0;
        const remaining = Math.max(0, budgeted - actual);
        const pct = budgeted > 0 ? (Math.round((actual / budgeted) * 100)) + '%' : '0%';

        finalResult.push({
          ...c,
          isCustom: true,
          _isCustomRow: true,
          _customId: c.id,
          activityId: '',
          description: c.description || '',
          newBlockNom: c.block || '',
          block: c.block || '',
          hoursPerDay: c.extraData?.hoursPerDay || 8.0,
          budgetedUnits: String(budgeted),
          actualUnits: String(actual),
          remainingUnits: String(remaining),
          percentComplete: pct,
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

  // Convert objects to arrays — Vendor IDT display structure
  const tableData = useMemo(() => {
    const parsedYesterdayStr = yesterday ? String(yesterday).split('T')[0] : '';
    const referenceDateStr = parsedYesterdayStr;

    const formatDt = (dt: any) => {
      if (!dt) return '';
      const dtStr = String(dt).split('T')[0];
      return indianDateFormat(dtStr) || dtStr;
    };

    const getDates = (r: any) => {
      const s = r.actualStart;
      const f = r.actualFinish;
      let actS = '', fcstS = '', actF = '', fcstF = '';

      if (s) {
        const sStr = String(s).split('T')[0];
        if (referenceDateStr && parseDateToIso(sStr) <= referenceDateStr) {
          actS = indianDateFormat(sStr) || sStr;
          fcstS = '';
        } else {
          fcstS = indianDateFormat(sStr) || sStr;
        }
      } else if (r.forecastStart) {
        const dStr = String(r.forecastStart).split('T')[0];
        fcstS = indianDateFormat(dStr) || dStr;
      }

      if (f) {
        const fStr = String(f).split('T')[0];
        if (referenceDateStr && parseDateToIso(fStr) <= referenceDateStr) {
          actF = indianDateFormat(fStr) || fStr;
          fcstF = '';
        } else {
          fcstF = indianDateFormat(fStr) || fStr;
        }
      } else if (r.forecastFinish) {
        const dStr = String(r.forecastFinish).split('T')[0];
        fcstF = indianDateFormat(dStr) || dStr;
      }

      return { actS, fcstS, actF, fcstF };
    };

    const rows = (Array.isArray(filteredData) ? filteredData : []).map(row => {
      const d = getDates(row);

      const getHistoryValues = (rowToRead: any, activityId: string, activityObjectId: string) => {
        const historyMap = dailyHistory[activityId] || dailyHistory[activityObjectId] || {};
        const rowHistory = rowToRead.historyValues || {};
        return historyDates.slice(0, HISTORY_COLS).map(hd => {
          let valStr = "";
          if (rowHistory[hd.iso] !== undefined) {
            valStr = String(rowHistory[hd.iso]);
          } else {
            const val = historyMap[hd.iso];
            if (val !== undefined) valStr = String(val);
          }
          return (!valStr || Number(valStr) === 0) ? "" : valStr;
        });
      };

      let arr: any;
      if (row.isCategoryRow) {

        const catHistoryMap = row.historyValues || {};
        const catHistVals = historyDates.slice(0, HISTORY_COLS).map(hd => {
          const valStr = String(catHistoryMap[hd.iso] || "");
          return (!valStr || Number(valStr) === 0) ? "" : valStr;
        });
        arr = [
          row.description || '',
          '',
          '',
          '',
          row.budgetedUnits !== undefined && row.budgetedUnits !== null ? String(row.budgetedUnits) : "0",
          row.actualUnits !== undefined && row.actualUnits !== null ? String(row.actualUnits) : "0",
          row.remainingUnits !== undefined && row.remainingUnits !== null ? String(row.remainingUnits) : "0",
          row.percentComplete || "0.00%",
          ...historyDates.slice(0, HISTORY_COLS).map(hd => {
            const val = String((row.historyValues || {})[hd.iso] || "");
            return (!val || Number(val) === 0) ? "" : val;
          }), (!row.yesterdayValue || Number(row.yesterdayValue) === 0) ? "" : String(row.yesterdayValue),
          (!row.todayValue || Number(row.todayValue) === 0) ? "" : String(row.todayValue)
        ];
        arr.isCategoryRow = true;
      } else {
        const actId = String(row.activityId || '').trim();
        const histVals = getHistoryValues(row, actId, String(row.activityObjectId || ''));
        const yesterdayIso = yesterday ? String(yesterday).split('T')[0] : '';
        const todayIso = today ? String(today).split('T')[0] : '';

        const getYesterdayVal = (r: any) => {
          if (yesterdayIso && r[`actual_${yesterdayIso}`] !== undefined) return r[`actual_${yesterdayIso}`];
          return r.yesterdayValue;
        };

        const getTodayVal = (r: any) => {
          if (todayIso && r[`actual_${todayIso}`] !== undefined) return r[`actual_${todayIso}`];
          return r.todayValue;
        };

        const yVal = getYesterdayVal(row);
        const tVal = getTodayVal(row);

        arr = [
          row.activityId || '',
          row.description || (row as any).activities || (row as any).activity || (row as any).activity_name || (row as any).name || (row as any).Name || '',
          row.block || '',
          row.hoursPerDay || '8.0',
          row.budgetedUnits !== undefined && row.budgetedUnits !== null ? String(row.budgetedUnits) : "0",
          row.actualUnits !== undefined && row.actualUnits !== null ? String(row.actualUnits) : "0",
          row.remainingUnits !== undefined && row.remainingUnits !== null ? String(row.remainingUnits) : "0",
          row.percentComplete || "0.00%",
          ...histVals,
          (!yVal || Number(yVal) === 0) ? "" : String(yVal),
          (!tVal || Number(tVal) === 0) ? "" : String(tVal)
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

    // Aggregate category totals from bottom to top
    let currentSums = {
      scope: 0,
      actual: 0,
      balance: 0,
      history: Array(HISTORY_COLS).fill(0),
      yesterday: 0,
      today: 0
    };

    for (let i = rows.length - 1; i >= 0; i--) {
      const arr = rows[i];
      if (arr.isCategoryRow) {
        arr[4] = currentSums.scope === 0 ? "0" : String(Math.round(currentSums.scope));
        arr[5] = currentSums.actual === 0 ? "0" : String(Math.round(currentSums.actual));
        arr[6] = currentSums.balance === 0 ? "0" : String(Math.round(currentSums.balance));

        const pct = currentSums.scope > 0 ? (Math.round((currentSums.actual / currentSums.scope) * 100)) + '%' : '0%';
        arr[7] = pct;

        for (let j = 0; j < HISTORY_COLS; j++) {
          const val = currentSums.history[j];
          arr[8 + j] = val === 0 ? "" : String(Math.round(val));
        }
        arr[8 + HISTORY_COLS] = currentSums.yesterday === 0 ? "" : String(Math.round(currentSums.yesterday));
        arr[8 + HISTORY_COLS + 1] = currentSums.today === 0 ? "" : String(Math.round(currentSums.today));

        currentSums = { scope: 0, actual: 0, balance: 0, history: Array(HISTORY_COLS).fill(0), yesterday: 0, today: 0 };
      } else {
        currentSums.scope += Number(arr[4]) || 0;
        currentSums.actual += Number(arr[5]) || 0;
        currentSums.balance += Number(arr[6]) || 0;
        for (let j = 0; j < HISTORY_COLS; j++) {
          currentSums.history[j] += Number(arr[8 + j]) || 0;
        }
        currentSums.yesterday += Number(arr[8 + HISTORY_COLS]) || 0;
        currentSums.today += Number(arr[8 + HISTORY_COLS + 1]) || 0;
      }
    }

    return rows;
  }, [filteredData, yesterday, today, dailyHistory, historyDates]);

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
      if (row.yesterdayIsApproved === false) {
        colors[rowIndex] = { [indianDateFormat(yesterday)]: "#ce440d" };
      } else if (row.yesterdayIsApproved === true) {
        colors[rowIndex] = { [indianDateFormat(yesterday)]: "#16a34a" };
      }
    });
    return colors;
  }, [filteredData, yesterday]);

  const handleInlineAdd = useCallback(() => {
    if (onAddCustomActivity) {
      onAddCustomActivity({
        sheetType: 'manpower_details',
        description: 'New DPR Activity',
        uom: 'Days',
        scope: 0,
        block: selectedBlock !== 'ALL' ? selectedBlock : '',
      });
    }
  }, [onAddCustomActivity, selectedBlock]);

  // Handle data changes
  const handleDataChange = useCallback((newData: any[][]) => {
    const p6RowChanges: any[] = [];
    const customRowChanges: any[] = [];

    const updatedRows = newData.map((row, index) => {
      const originalRow = filteredData[index];

      if (!originalRow || originalRow?.isCategoryRow) {
        return { ...originalRow };
      }

      const newYesterdayStr = row[8 + HISTORY_COLS] !== undefined && row[8 + HISTORY_COLS] !== null ? String(row[8 + HISTORY_COLS]).trim() : '0';
      const newTodayStr = row[9 + HISTORY_COLS] !== undefined && row[9 + HISTORY_COLS] !== null ? String(row[9 + HISTORY_COLS]).trim() : '0';
      const newYesterday = Number(newYesterdayStr) || 0;
      const newToday = Number(newTodayStr) || 0;

      const actId = originalRow.activityId;
      let historyMap = originalRow.historyValues;
      if (!historyMap || Object.keys(historyMap).length === 0) {
        historyMap = dailyHistory[actId] || dailyHistory[String(originalRow.activityObjectId || '')] || {};
      }
      const initialHistorySum = historyDates.slice(0, HISTORY_COLS).reduce((sum, d) => sum + (Number(historyMap[d.iso]) || 0), 0);
      const newHistorySum = historyDates.slice(0, HISTORY_COLS).reduce((sum, _, i) => sum + (Number(row[8 + i]) || 0), 0);

      const newHistoryValues: Record<string, string> = {};
      historyDates.slice(0, HISTORY_COLS).forEach((d, i) => {
        newHistoryValues[d.iso] = String(row[8 + i] || '0').trim();
      });

      const currentBudgeted = Number(row[4]) || 0;
      let baseActual = Number(originalRow.actualUnits) || 0;
      const initialToday = Number(originalRow.todayValue) || 0;
      const initialYesterday = Number(originalRow.yesterdayValue) || 0;

      baseActual = baseActual - initialToday - initialYesterday - initialHistorySum;
      let calculatedActual = baseActual + newYesterday + newToday + newHistorySum;

      const calculatedBalance = currentBudgeted - calculatedActual;
      const pct = currentBudgeted > 0 ? (Math.round((calculatedActual / currentBudgeted) * 100)) + '%' : '0%';

      const updatedRow: any = {
        ...originalRow,
        activityId: row[0] || '',
        description: row[1] || originalRow.description || (originalRow as any).name || (originalRow as any).Name || '',
        block: row[2] || '',
        hoursPerDay: Number(row[3]) || 8.0,
        budgetedUnits: String(currentBudgeted),
        actualUnits: String(Math.round(calculatedActual)),
        remainingUnits: String(Math.round(calculatedBalance)),
        percentComplete: pct,
        historyValues: newHistoryValues,
        yesterdayValue: newYesterdayStr,
        todayValue: newTodayStr,
      };

      const yesterdayIso = yesterday ? String(yesterday).split('T')[0] : '';
      const todayIso = today ? String(today).split('T')[0] : '';
      
      if (yesterdayIso) updatedRow[`actual_${yesterdayIso}`] = newYesterdayStr;
      if (todayIso) updatedRow[`actual_${todayIso}`] = newTodayStr;

      const cellStatuses = (row as any)['_cellStatuses'] || {};

      if (Object.keys(cellStatuses).length > 0) {
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

      const totalScope = activities.reduce((sum, r) => sum + (Number(r.budgetedUnits) || 0), 0);
      const totalActual = activities.reduce((sum, r) => sum + (Number(r.actualUnits) || 0), 0);
      const totalBalance = activities.reduce((sum, r) => sum + (Number(r.remainingUnits) || 0), 0);
      const totalYesterday = activities.reduce((sum, r) => sum + (Number(r.yesterdayValue) || 0), 0);
      const totalToday = activities.reduce((sum, r) => sum + (Number(r.todayValue) || 0), 0);
      const totalHistory: Record<string, string> = {};
      historyDates.slice(0, HISTORY_COLS).forEach(d => {
        const sum = activities.reduce((s, r) => s + (Number(r.historyValues?.[d.iso]) || 0), 0);
        totalHistory[d.iso] = String(sum);
      });
      const pct = totalScope > 0 ? (Math.round((totalActual / totalScope) * 100)) + '%' : '0%';

      updatedRows[catIdx] = {
        ...catRow,
        budgetedUnits: String(totalScope),
        actualUnits: String(totalActual),
        remainingUnits: String(totalBalance),
        percentComplete: pct,
        yesterdayValue: String(totalYesterday),
        todayValue: String(totalToday),
        historyValues: totalHistory
      };
    });

    if (p6RowChanges.length > 0 || Object.keys(categoryActivityMap).length > 0) {
      const fullDataCopy = [...data];
      if (p6RowChanges.length > 0) {
        p6RowChanges.forEach(updatedRow => {
          const idx = fullDataCopy.findIndex(d => String(d.activityId) === String(updatedRow.activityId));
          if (idx !== -1) fullDataCopy[idx] = updatedRow;
        });
      }
      Object.keys(categoryActivityMap).forEach(catIdxStr => {
        const catIdx = Number(catIdxStr);
        const catRow = updatedRows[catIdx];
        if (catRow) {
          const dataIdx = fullDataCopy.findIndex(d => d.isCategoryRow && d.description === catRow.description);
          if (dataIdx !== -1) {
            fullDataCopy[dataIdx] = catRow;
          }
        }
      });
      setData(fullDataCopy);
    }

    if (onEditCustomActivity && customRowChanges.length > 0) {
      customRowChanges.forEach(({ row, originalRow, calculatedActual }) => {
        const customId = originalRow._customId;
        if (!customId) return;
        const c = customActivities.find(x => x.id === customId);
        if (!c) return;

        const newDesc = row[1] || '';
        const newHoursPerDay = Number(row[3]) || 8.0;
        const newBudgeted = row[4] || '0';

        const newYesterdayStr = String(row[8 + HISTORY_COLS] || '0').trim();
        const newTodayStr = String(row[9 + HISTORY_COLS] || '0').trim();

        const customNewHistoryVals: Record<string, string> = {};
        let customHistoryChanged = false;
        historyDates.slice(0, HISTORY_COLS).forEach((d, i) => {
          const val = String(row[8 + i] || '0').trim();
          customNewHistoryVals[d.iso] = val;
          if (val !== String(c.extraData?.historyValues?.[d.iso] || '0').trim()) {
            customHistoryChanged = true;
          }
        });

        const hasChanges =
          newDesc !== (c.description || '') ||
          newHoursPerDay !== (c.extraData?.hoursPerDay || 8.0) ||
          newBudgeted !== String(c.scope || 0) ||
          customHistoryChanged ||
          newYesterdayStr !== String(c.extraData?.yesterdayValue || 0) ||
          newTodayStr !== String(c.extraData?.todayValue || 0);

        if (hasChanges) {
          onEditCustomActivity({
            id: customId,
            sheetType: 'manpower_details',
            description: newDesc,
            scope: Number(newBudgeted) || 0,
            cumulative: Number(calculatedActual) || 0,
            actualStart: c.actualStart || '',
            actualFinish: c.actualFinish || '',
            extraData: {
              ...c.extraData,
              hoursPerDay: newHoursPerDay,
              historyValues: customNewHistoryVals,
              yesterdayValue: newYesterdayStr,
              todayValue: newTodayStr,
            }
          });
        }
      });
    }

  }, [data, filteredData, selectedBlock, setData, customActivities, onEditCustomActivity, dailyHistory, historyDates]);

  useEffect(() => {
    if (Array.isArray(data)) {
      const total = data.reduce((sum, row) => {
        if (row.isCategoryRow) return sum;
        return sum + (parseInt(row.todayValue) || 0);
      }, 0);

      const customTotal = customActivities.reduce((sum, row) => {
        return sum + (parseInt(row.extraData?.todayValue) || 0);
      }, 0);

      setTotalManpower(total + customTotal);
    }
  }, [data, customActivities, setTotalManpower]);

  const editableColumns = useMemo(() => [
    "Description",
    "Hours/Day",
    "Required",
    "Available",
    ...historyDates.slice(0, HISTORY_COLS).map(d => d.label),
    indianDateFormat(yesterday),
    indianDateFormat(today)
  ], [yesterday, today, historyDates]);

  const columnTypes = useMemo(() => {
    const types: Record<string, 'text' | 'number' | 'date'> = {
      "Activity ID": "text",
      "Description": "text",
      "Block": "text",
      "Hours/Day": "number",
      "Required": "number",
      "Available": "number",
      "Gap": "number",
      "% Completion": "text",
      [indianDateFormat(yesterday)]: "number",
      [indianDateFormat(today)]: "number"
    };
    historyDates.slice(0, HISTORY_COLS).forEach(d => { types[d.label] = "number"; });
    return types;
  }, [yesterday, today, historyDates]);

  const columnWidths = useMemo(() => {
    const widths: Record<string, number> = {
      "Activity ID": 90,
      "Description": 230,
      "Block": 80,
      "Hours/Day": 80,
      "Required": 100,
      "Available": 100,
      "Gap": 110,
      "% Completion": 100,
      [indianDateFormat(yesterday)]: 90,
      [indianDateFormat(today)]: 90
    };
    historyDates.slice(0, HISTORY_COLS).forEach(d => { widths[d.label] = 80; });
    return widths;
  }, [yesterday, today, historyDates]);

  const handleRowDelete = useCallback((index: number) => {
    const row = tableData[index];
    if (row && (row as any)._isCustomRow && onDeleteCustomActivity) {
      const customId = (row as any)._customId;
      if (customId) onDeleteCustomActivity(customId);
    }
  }, [tableData, onDeleteCustomActivity]);

  const handleRowEdit = useCallback((index: number) => {
    const row = tableData[index];
    if (row && (row as any)._isCustomRow && onEditCustomActivity) {
      const customId = (row as any)._customId;
      const activity = customActivities.find(c => c.id === customId);
      if (activity) onEditCustomActivity(activity);
    }
  }, [tableData, onEditCustomActivity, customActivities]);

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
        title="Labour Days"
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
          "% Completion": "#16a34a"
        }}
        columnFontWeights={{
          "% Completion": "bold"
        }}
        rowStyles={rowStyles}
        headerStructure={[
          [
            { label: "Activity ID", colSpan: 1, rowSpan: 2 },
            { label: "Description", colSpan: 1, rowSpan: 2 },
            { label: "Block", colSpan: 1, rowSpan: 2 },
            { label: "Hours/Day", colSpan: 1, rowSpan: 2 },
            { label: "Required", colSpan: 1, rowSpan: 2 },
            { label: "Available", colSpan: 1, rowSpan: 2 },
            { label: "Gap", colSpan: 1, rowSpan: 2 },
            { label: "% Completion", colSpan: 1, rowSpan: 2 },
            { label: "Manpower Days", colSpan: HISTORY_COLS + 2 }
          ],
          [
            ...historyDates.slice(0, HISTORY_COLS).map(d => ({ label: d.label, colSpan: 1 })),
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
        sheetType="manpower_details"
        onRowDelete={isPmagOrAdmin && !isLocked && onDeleteCustomActivity ? handleRowDelete : undefined}
        onRowEdit={!isLocked && onEditCustomActivity ? handleRowEdit : undefined}
        rowIsEditable={(idx) => {
          const row = tableData[idx] as any;
          return row && !row.isCategoryRow;
        }}
        rowIsDeletable={(idx) => !!(tableData[idx] as any)?._isCustomRow && isPmagOrAdmin}
      />
    </div>
  );
}
