import React, { useState, useEffect, useMemo, useCallback } from "react";
import { StyledExcelTable } from "@/components/StyledExcelTable";
import { StatusChip } from "@/components/StatusChip";
import { indianDateFormat, getTodayAndYesterday } from "@/services/dprService";

import { EntryStatus } from "@/types";

export interface DPVendorIdtData {
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
}
interface DPVendorIdtTableProps {
  data: DPVendorIdtData[];
  setData: (data: DPVendorIdtData[]) => void;
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
  projectId?: number;
  selectedBlock?: string;
  universalFilter?: string;
  onPush?: () => void;
  resourcesByActivity?: Record<string, any[]>;
}

export function DPVendorIdtTable({
  data,
  setData,
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
  resourcesByActivity = {}
}: DPVendorIdtTableProps) {

  const previousDate = indianDateFormat(yesterday);


  // Define columns
  const columns = [
    "Activity ID",
    "Description",
    "Block",
    "UOM",
    "Scope",
    `Completed as on\n${previousDate}`,
    "Balance",
    "Baseline Start",
    "Baseline Finish",
    "Actual/Forecast Start",
    "Actual/Forecast Finish",
    "Resource",
    indianDateFormat(yesterday),
    indianDateFormat(today)
  ];

  // Multi-row header structure
  const headerStructure = [
    // Row 0
    [
      { label: "Activity ID", rowSpan: 2 },
      { label: "Description", rowSpan: 2 },
      { label: "Block", rowSpan: 2 },
      { label: "UOM", rowSpan: 2 },
      { label: "Scope", rowSpan: 2 },
      { label: `Completed as on\n${previousDate}`, rowSpan: 2 },
      { label: "Balance", rowSpan: 2 },
      { label: "Baseline Start", rowSpan: 2 },
      { label: "Baseline Finish", rowSpan: 2 },
      { label: "Actual/Forecast", colSpan: 2 },
      { label: "Resource", rowSpan: 2 },
      { label: indianDateFormat(yesterday), rowSpan: 2 },
      { label: indianDateFormat(today), rowSpan: 2 }
    ],
    // Row 1
    [
      { label: "Actual/Forecast Start", colSpan: 1, rowSpan: 1 },
      { label: "Actual/Forecast Finish", colSpan: 1, rowSpan: 1 }
    ]
  ];

  // Define column widths for better alignment
  const columnWidths = {
    "Activity ID": 80,
    "Description": 200,
    "Block": 80,
    "UOM": 60,
    "Scope": 80,
    [`Completed as on\n${previousDate}`]: 100,
    "Balance": 80,
    "Baseline Start": 100,
    "Baseline Finish": 100,
    "Actual/Forecast Start": 130,
    "Actual/Forecast Finish": 130,
    "Resource": 140,
    [indianDateFormat(yesterday)]: 80,
    [indianDateFormat(today)]: 80
  };

  // Filter data based on selected block and universal filter
  const filteredData = useMemo(() => {
    if (!Array.isArray(data)) return [];

    // First pass: identify valid non-category rows
    const validRows = data.map(d => {
      if (d.isCategoryRow) return true; // Keep initially

      const matchBlock = selectedBlock === "ALL" || d.block === selectedBlock || d.newBlockNom === selectedBlock;

      const filterText = (universalFilter || "").trim().toUpperCase();
      const matchActivity = !filterText || filterText === "ALL" ||
        (d.activityId && String(d.activityId).toUpperCase().includes(filterText));

      return matchBlock && matchActivity;
    });

    // Second pass: compile final list, omitting categories with no valid children
    const finalResult = [];
    for (let i = 0; i < data.length; i++) {
      if (data[i].isCategoryRow) {
        // Check if there's at least one valid child before the next category
        let hasValidChild = false;
        let j = i + 1;
        while (j < data.length && !data[j].isCategoryRow) {
          if (validRows[j]) {
            hasValidChild = true;
            break;
          }
          j++;
        }
        if (hasValidChild) {
          finalResult.push(data[i]);
        }
      } else if (validRows[i]) {
        finalResult.push(data[i]);
      }
    }
    return finalResult;
  }, [data, selectedBlock, universalFilter]);

  // Convert array of objects to array of arrays
  const tableData = useMemo(() => {
    const formatDt = (dt: any) => {
      if (!dt) return '';
      const dtStr = String(dt).split('T')[0];
      return indianDateFormat(dtStr) || dtStr;
    };

    return (Array.isArray(filteredData) ? filteredData : []).map(row => {
      const baselineStart = formatDt(row.basePlanStart);
      const baselineFinish = formatDt(row.basePlanFinish);

      let arr: any;
      if (row.isCategoryRow) {
        // Category row - Heading row with sums
        arr = [
          '',
          row.description || '',
          '',
          row.uom || '',
          row.scope ? Number(row.scope).toFixed(2) : "0.00",
          row.actual ? Number(row.actual).toFixed(2) : "0.00",
          row.balance ? Number(row.balance).toFixed(2) : "0.00",
          baselineStart,
          baselineFinish,
          "", // Actual/Forecast Start
          "", // Actual/Forecast Finish
          "", // Resource
          row.yesterdayValue || '',
          row.todayValue || ''
        ];
      } else {
        // Auto-select single resource if not already selected
        let finalResourceId = String(row.selectedResourceId || '').trim();
        const actId = String(row.activityId || '').trim();

        if (!finalResourceId && actId && resourcesByActivity) {
          const resources = resourcesByActivity[actId];
          if (resources && resources.length === 1) {
            finalResourceId = String(resources[0].resourceId).trim();
          }
        }

        // Logic for Resource-level dates
        const resources = actId ? resourcesByActivity[actId] : undefined;
        const selectedRes = resources?.find((r: any) => String(r.resourceId) === String(finalResourceId));

        // Use Resource dates if available, otherwise Activity dates
        const resActualStart = selectedRes?.actualStart;
        const resActualFinish = selectedRes?.actualFinish;

        const effectiveActualStart = resActualStart || row.actualStart;
        const effectiveActualFinish = resActualFinish || row.actualFinish;

        // Activity row - show all data
        arr = [
          row.activityId || '',
          row.description || (row as any).activities || (row as any).activity || (row as any).activity_name || (row as any).name || (row as any).Name || '',
          row.newBlockNom || row.block || '',
          row.uom || '',
          row.scope ? Number(row.scope).toFixed(2) : "0.00",
          row.actual ? Number(row.actual).toFixed(2) : "0.00",
          row.balance ? Number(row.balance).toFixed(2) : "0.00",
          baselineStart,
          baselineFinish,
          indianDateFormat(effectiveActualStart) || indianDateFormat(row.forecastStart) || '',
          indianDateFormat(effectiveActualFinish) || indianDateFormat(row.forecastFinish) || '',
          finalResourceId,
          row.yesterdayValue || '',
          row.todayValue || ''
        ];

        arr._cellStatuses = { ...((row as any)._cellStatuses || {}) };
      }

      return arr;
    });
  }, [filteredData, yesterday, today, previousDate, resourcesByActivity]);

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
      }
    });
    return styles;
  }, [filteredData]);

  // Dynamically color cells based on approval status and actual vs forecast
  const cellTextColors = useMemo(() => {
    const colors: Record<number, Record<string, string>> = {};
    filteredData.forEach((row, rowIndex) => {
      colors[rowIndex] = {};

      if (row.yesterdayIsApproved === false) {
        colors[rowIndex][indianDateFormat(yesterday)] = "#ce440d";
        colors[rowIndex]["Actual"] = "#ce440d";
      } else if (row.yesterdayIsApproved === true) {
        colors[rowIndex][indianDateFormat(yesterday)] = "#16a34a";
        colors[rowIndex]["Actual"] = "#16a34a";
      }

      // Logic for Resource-level dates
      const actId = String(row.activityId || '').trim();
      const resources = actId ? resourcesByActivity[actId] : undefined;
      let finalResourceId = String(row.selectedResourceId || '').trim();
      if (!finalResourceId && actId && resources?.length === 1) {
        finalResourceId = String(resources[0].resourceId).trim();
      }
      const selectedRes = resources?.find(r => String(r.resourceId) === String(finalResourceId));

      const effectiveActualStart = selectedRes?.actualStart || row.actualStart;
      const effectiveActualFinish = selectedRes?.actualFinish || row.actualFinish;

      const isValid = (d: any) => typeof d === 'string' && d.trim() !== '' && d !== '-';

      if (isValid(effectiveActualStart)) {
        colors[rowIndex]["Actual/Forecast Start"] = "#16a34a"; // Green for actual
      } else if (isValid(row.forecastStart)) {
        colors[rowIndex]["Actual/Forecast Start"] = "#2563eb"; // Blue for forecast
      }

      if (isValid(effectiveActualFinish)) {
        colors[rowIndex]["Actual/Forecast Finish"] = "#16a34a"; // Green for actual
      } else if (isValid(row.forecastFinish)) {
        colors[rowIndex]["Actual/Forecast Finish"] = "#2563eb"; // Blue for forecast
      }
    });
    return colors;
  }, [filteredData, yesterday, resourcesByActivity]);

  // Handle data changes from ExcelTable
  const handleDataChange = useCallback((newData: any[][]) => {
    const actualDataRows = newData.slice(0, filteredData.length);
    const updatedRows = actualDataRows.map((row, index) => {
      const originalRow = filteredData[index];

      if (originalRow?.isCategoryRow) {
        return { ...originalRow };
      } else {
        // Indices: 9=Actual/Forecast Start, 10=Actual/Forecast Finish, 11=Resource, 12=Yesterday, 13=Today
        const editedStart = row[9] || '';
        const editedFinish = row[10] || '';
        const newSelectedResourceId = row[11] || '';
        const newYesterday = Number(row[12]) || 0;
        const newToday = Number(row[13]) || 0;

        let scope = Number(row[4]) || 0;
        let baseActual: number;
        const actId = originalRow.activityId;
        const resources = actId ? resourcesByActivity[actId] : undefined;
        const selectedRes = resources?.find(r => String(r.resourceId) === String(newSelectedResourceId));

        if (selectedRes) {
          scope = selectedRes.plannedUnits || 0;
          baseActual = selectedRes.actualUnits || 0;
        } else {
          const initialActual = Number(originalRow.actual) || 0;
          const initialToday = Number(originalRow.todayValue) || 0;
          const initialYesterday = Number(originalRow.yesterdayValue) || 0;
          baseActual = initialActual - initialToday - initialYesterday;
        }

        const calculatedActual = baseActual + newYesterday + newToday;
        const calculatedBalance = scope - calculatedActual;

        // Check if the user changed the Actual/Forecast dates
        // If the edited date doesn't match the combined formatted string of actual/forecast, they modified it.
        // We only update actual dates when they modify it. We preserve the original forecast dates.
        const prevEffectiveStart = indianDateFormat(originalRow.actualStart) || indianDateFormat(originalRow.forecastStart) || '';
        const prevEffectiveFinish = indianDateFormat(originalRow.actualFinish) || indianDateFormat(originalRow.forecastFinish) || '';

        let newActualStart = originalRow.actualStart || '';
        if (editedStart !== prevEffectiveStart) {
          newActualStart = editedStart;
        }

        let newActualFinish = originalRow.actualFinish || '';
        if (editedFinish !== prevEffectiveFinish) {
          newActualFinish = editedFinish;
        }

        const updatedRow: any = {
          ...originalRow,
          activityId: row[0] || '',
          description: row[1] || '',
          uom: row[3] || '',
          scope: String(scope),
          actual: String(calculatedActual),
          balance: String(calculatedBalance),
          actualStart: newActualStart,
          actualFinish: newActualFinish,
          forecastStart: originalRow.forecastStart || '',
          forecastFinish: originalRow.forecastFinish || '',
          selectedResourceId: newSelectedResourceId,
          yesterdayValue: String(newYesterday),
          todayValue: String(newToday)
        };

        const cellStatuses = (row as any)['_cellStatuses'];
        if (cellStatuses && Object.keys(cellStatuses).length > 0) {
          updatedRow._cellStatuses = cellStatuses;
        }

        return updatedRow;
      }
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

    if (selectedBlock !== "ALL") {
      const fullDataCopy = [...data];
      updatedRows.forEach(updatedRow => {
        if (updatedRow.isCategoryRow) {
          const catIdx = fullDataCopy.findIndex(d => d.isCategoryRow && d.description === updatedRow.description);
          if (catIdx !== -1) fullDataCopy[catIdx] = updatedRow;
        } else {
          const idx = fullDataCopy.findIndex(d => String(d.activityId) === String(updatedRow.activityId));
          if (idx !== -1) fullDataCopy[idx] = updatedRow;
        }
      });
      setData(fullDataCopy);
    } else {
      setData(updatedRows);
    }
  }, [data, filteredData, selectedBlock, setData, resourcesByActivity]);

  // Define which columns are editable
  const editableColumns = [
    "UOM",
    "Priority",
    "Contractor Name",
    "Scope",
    "Actual/Forecast Start",
    "Actual/Forecast Finish",
    "Resource",
    indianDateFormat(yesterday),
    indianDateFormat(today)
  ];

  // Define column types
  const columnTypes: Record<string, 'text' | 'number' | 'date' | 'select'> = {
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
    "Actual/Forecast Start": "date",
    "Actual/Forecast Finish": "date",
    "Resource": "select",
    [indianDateFormat(yesterday)]: "number",
    [indianDateFormat(today)]: "number"
  };

  return (
    <div className="space-y-2 w-full flex-1 min-h-0 flex flex-col">
      <StyledExcelTable
        title="AC Side"
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
          "Actual/Forecast Start": "inherit",
          "Actual/Forecast Finish": "inherit",
          "Resource": "#4f46e5"
        }}
        columnFontWeights={{
          "Actual/Forecast Start": "bold",
          "Actual/Forecast Finish": "bold",
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
        sheetType="dp_vendor_idt"
        rowColumnOptions={useMemo(() => {
          const opts: Record<number, Record<string, any[]>> = {};
          filteredData.forEach((row, index) => {
            if (row.isCategoryRow) return;
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
      />
    </div>
  );
}
