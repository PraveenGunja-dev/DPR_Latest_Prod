import React, { useState, useEffect, useMemo } from "react";
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
  selectedBlock = "ALL"
}: DPVendorIdtTableProps) {

  const previousDate = indianDateFormat(yesterday);


  // Define columns - 15 total (Removed Priority & Contractor Name)
  const columns = [
    "Activity ID",
    "Description",
    "Block",
    "UOM",
    "Scope",
    `Completed as on "${previousDate}"`,
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
          "", // Actual Start
          "", // Actual Finish
          "", // Forecast Start
          "", // Forecast Finish
          row.yesterdayValue || '', 
          row.todayValue || '' 
        ];
      } else {
        // Activity row - show all data
        arr = [
          row.activityId || '',
          row.description || '',
          row.newBlockNom || row.block || '',
          row.uom || '',
          row.scope ? Number(row.scope).toFixed(2) : "0.00",
          row.actual ? Number(row.actual).toFixed(2) : "0.00",
          row.balance ? Number(row.balance).toFixed(2) : "0.00",
          baselineStart,
          baselineFinish,
          indianDateFormat(row.actualStart) || '',
          indianDateFormat(row.actualFinish) || '',
          indianDateFormat(row.forecastStart) || '',
          indianDateFormat(row.forecastFinish) || '',
          row.yesterdayValue || '',
          row.todayValue || ''
        ];
      }

      if ((row as any)._cellStatuses) {
        arr._cellStatuses = (row as any)._cellStatuses;
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
      }
    });
    return styles;
  }, [filteredData]);

  // Dynamically color cells based on approval status
  const cellTextColors = useMemo(() => {
    const colors: Record<number, Record<string, string>> = {};
    filteredData.forEach((row, rowIndex) => {
      if (row.yesterdayIsApproved === false) {
        colors[rowIndex] = {
          [indianDateFormat(yesterday)]: "#ce440d", 
          "Actual": "#ce440d"
        };
      } else if (row.yesterdayIsApproved === true) {
        colors[rowIndex] = {
          [indianDateFormat(yesterday)]: "#16a34a", 
          "Actual": "#16a34a"
        };
      }
    });
    return colors;
  }, [filteredData, yesterday]);

  // Handle data changes from ExcelTable
  const handleDataChange = (newData: any[][]) => {
    const actualDataRows = newData.slice(0, filteredData.length);
    const updatedRows = actualDataRows.map((row, index) => {
      const originalRow = filteredData[index];

      if (originalRow?.isCategoryRow) {
        return { ...originalRow };
      } else {
        // Updated Indices: UOM=3, Scope=4, Actual=5, Balance=6, BaseStart=7, BaseFinish=8, ActualStart=9, ActualFinish=10, ForecastStart=11, ForecastFinish=12, Yesterday=13, Today=14
        const scope = Number(row[4]) || 0;
        const newYesterday = Number(row[13]) || 0;
        const newToday = Number(row[14]) || 0;

        const initialActual = Number(originalRow.actual) || 0;
        const initialToday = Number(originalRow.todayValue) || 0;
        const initialYesterday = Number(originalRow.yesterdayValue) || 0;
        const baseActual = initialActual - initialToday - initialYesterday;

        const calculatedActual = baseActual + newYesterday + newToday;
        const calculatedBalance = scope - calculatedActual;

        const updatedRow: any = {
          ...originalRow,
          activityId: row[0] || '',
          description: row[1] || '',
          uom: row[3] || '',
          scope: String(scope),
          actual: String(calculatedActual),
          balance: String(calculatedBalance),
          actualStart: row[9] || '',
          actualFinish: row[10] || '', 
          forecastStart: row[11] || '',
          forecastFinish: row[12] || '',
          yesterdayValue: String(newYesterday),
          todayValue: String(newToday)
        };

        const cellStatuses = (row as any)['_cellStatuses'];
        if (cellStatuses && Object.keys(cellStatuses).length > 0) {
          updatedRow._cellStatuses = { ...cellStatuses };
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
          const idx = fullDataCopy.findIndex(d => d.activityId === updatedRow.activityId);
          if (idx !== -1) fullDataCopy[idx] = updatedRow;
        }
      });
      setData(fullDataCopy);
    } else {
      setData(updatedRows);
    }
  };

  // Define which columns are editable
  const editableColumns = [
    "UOM",
    "Priority",
    "Contractor Name",
    "Scope",
    "Actual Start",
    "Actual Finish",
    "Forecast Start",
    "Forecast Finish",
    indianDateFormat(yesterday),
    indianDateFormat(today)
  ];

  // Define column types
  const columnTypes: Record<string, 'text' | 'number' | 'date'> = {
    "Activity ID": "text",
    "Description": "text",
    "Block": "text",
    "Priority": "text",
    "Contractor Name": "text",
    "UOM": "text",
    "Scope": "number",
    [`Completed as on "${previousDate}"`]: "number",
    "Balance": "number",
    "Baseline Start": "text",
    "Baseline Finish": "text",
    "Actual Start": "date",
    "Actual Finish": "date",
    "Forecast Start": "date",
    "Forecast Finish": "date",
    [indianDateFormat(yesterday)]: "number",
    [indianDateFormat(today)]: "number"
  };

  // Define column widths for better alignment
  const columnWidths = {
    "Activity ID": 80,
    "Description": 200,
    "Block": 80,
    "Priority": 60,
    "Contractor Name": 120,
    "UOM": 60,
    "Scope": 80,
    [`Completed as on "${previousDate}"`]: 100,
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

  return (
    <div className="space-y-2 w-full flex-1 min-h-0 flex flex-col">
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
        columnTypes={columnTypes}
        columnWidths={columnWidths}
        cellTextColors={cellTextColors}
        columnTextColors={{
          "Actual Start": "#00B050",
          "Actual Finish": "#00B050",
          "Forecast Start": "#0070C0",
          "Forecast Finish": "#0070C0"
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
            { label: "UOM", colSpan: 1, rowSpan: 2 },
            { label: "Scope", colSpan: 1, rowSpan: 2 },
            { label: `Completed as on "${previousDate}"`, colSpan: 1, rowSpan: 2 },
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
        sheetType="dp_vendor_idt"
      />
    </div>
  );
}
