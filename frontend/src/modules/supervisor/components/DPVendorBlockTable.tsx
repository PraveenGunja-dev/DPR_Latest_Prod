import React, { useState, useEffect, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Save } from "lucide-react";
import { StyledExcelTable } from "@/components/StyledExcelTable";
import { StatusChip } from "@/components/StatusChip";
import { indianDateFormat, getTodayAndYesterday } from "@/services/dprService";
import { EntryStatus } from "@/types";

interface DPVendorBlockData {
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
  bl1Start?: string;
  bl1Finish?: string;
  bl2Start?: string;
  bl2Finish?: string;
  bl3Start?: string;
  bl3Finish?: string;
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
}

interface DPVendorBlockTableProps {
  data: DPVendorBlockData[];
  setData: (data: DPVendorBlockData[]) => void;
  onSave: () => void;
  onSubmit?: () => void;
  yesterday: string;
  today: string;
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
}

export function DPVendorBlockTable({
  data,
  setData,
  onSave,
  onSubmit,
  yesterday,
  today,
  isLocked = false,
  status = 'draft',
  onExportAll,
  totalRows,
  projectName = "Unknown Project",
  onFullscreenToggle,
  onReachEnd,
  universalFilter,
  projectId,
  selectedBlock = "ALL"
}: DPVendorBlockTableProps) {

  const { yesterday: previousDateISO } = getTodayAndYesterday();
  const previousDate = indianDateFormat(previousDateISO);

  // Define columns - 15 total (same structure as Vendor IDT)
  const columns = [
    "Activity ID",
    "Description",
    "Block",
    "Priority",
    "Contractor Name",
    "UOM",
    "Scope",
    `Completed as on "${previousDate}"`,
    "Balance",
    "Baseline Start",
    "Baseline Finish",
    "Actual/Forecast Start",
    "Actual/Forecast Finish",
    indianDateFormat(yesterday),
    indianDateFormat(today)
  ];

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
    "Actual/Forecast Start": 120,
    "Actual/Forecast Finish": 120,
    [indianDateFormat(yesterday)]: 80,
    [indianDateFormat(today)]: 80
  };

  // Filter data based on selected block
  const filteredData = useMemo(() => {
    if (!Array.isArray(data)) return [];
    return selectedBlock === "ALL" ? data : data.filter(d => d.isCategoryRow || d.block === selectedBlock || d.newBlockNom === selectedBlock);
  }, [data, selectedBlock]);

  // Convert array of objects to array of arrays
  const tableData = useMemo(() => {
    const formatDt = (dt: any) => {
      if (!dt) return '';
      const dtStr = String(dt).split('T')[0];
      return indianDateFormat(dtStr) || dtStr;
    };

    return (Array.isArray(filteredData) ? filteredData : []).map(row => {
        const baselineStart = formatDt((row as any).bl4Start || row.bl3Start || row.bl2Start || row.bl1Start || row.basePlanStart);
        const baselineFinish = formatDt((row as any).bl4Finish || row.bl3Finish || row.bl2Finish || row.bl1Finish || row.basePlanFinish);

        if (row.isCategoryRow) {
          // Category row - Heading row with sums
          return [
            '', // Activity ID (empty for heading)
            row.description || '', // Description
            '', // Block
            '', // Priority
            '', // Contractor Name
            '', // UOM (Keep empty for header if not needed, or row.uom)
            row.scope || '', // Scope (Index 6 -> Col 7)
            row.actual || '', // Completed as on date (sum) (Index 7 -> Col 8)
            row.balance || '', // Balance (Index 8 -> Col 9)
            baselineStart, // Index 9
            baselineFinish, // Index 10
            indianDateFormat(row.actualStart || row.forecastStart) || '', // Index 11
            indianDateFormat(row.actualFinish || row.forecastFinish) || '', // Index 12
            row.yesterdayValue || '', // Index 13
            row.todayValue || '' // Index 14
          ];
        } else {
        // Activity row - show all data
        return [
            row.activityId || '',
            row.description || '',
            row.newBlockNom || row.block || '',
            row.priority || '',
            row.contractorName || '',
            row.uom || '',
            row.scope || '',
            row.actual || '',
            row.balance || '',
            baselineStart,
            baselineFinish,
            indianDateFormat(row.actualStart || row.forecastStart) || '',
            indianDateFormat(row.actualFinish || row.forecastFinish) || '',
            row.yesterdayValue || '',
            row.todayValue || ''
        ];
        }
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
          [indianDateFormat(yesterday)]: "#ce440d", // Darker orange
          "Actual": "#ce440d"
        };
      } else if (row.yesterdayIsApproved === true) {
        colors[rowIndex] = {
          [indianDateFormat(yesterday)]: "#16a34a", // Green
          "Actual": "#16a34a"
        };
      }
    });
    return colors;
  }, [filteredData, yesterday]);

  // Handle data changes from ExcelTable
  const handleDataChange = (newData: any[][]) => {
    // Convert array of arrays back to array of objects
    const actualDataRows = newData.slice(0, filteredData.length);
    const updatedRows = actualDataRows.map((row, index) => {
      const originalRow = filteredData[index];

      if (originalRow?.isCategoryRow) {
        // Category row - preserve as-is (will be recalculated below)
        return { ...originalRow };
      } else {
        // Activity row - map columns back correctly
        // Columns: 0=ActivityID, 1=Description, 2=Block, 3=Priority, 4=ContractorName,
        //          5=UOM, 6=Scope, 7=Completed, 8=Balance, 9=BaseStart, 10=BaseFinish,
        //          11=ActualStart, 12=ForecastComp, 13=Yesterday, 14=Today
        const scope = Number(row[6]) || 0;
        const newYesterday = Number(row[13]) || 0;
        const newToday = Number(row[14]) || 0;

        // Calculate Base Actual (Total excluding current today/yesterday)
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
          priority: row[3] || '',
          contractorName: row[4] || '',
          uom: row[5] || '',
          scope: String(scope),
          actual: String(calculatedActual),
          balance: String(calculatedBalance),
          actualStart: row[11] || '',
          actualFinish: row[12] || '',
          yesterdayValue: String(newYesterday),
          todayValue: String(newToday)
        };

        // Preserve _cellStatuses metadata from the array row (set by StyledExcelTable)
        const cellStatuses = (row as any)['_cellStatuses'];
        if (cellStatuses && Object.keys(cellStatuses).length > 0) {
          updatedRow._cellStatuses = { ...cellStatuses };
        }

        return updatedRow;
      }
    });

    // Recalculate category row totals from updated activity rows
    // Group activities by their category heading (find nearest preceding category row)
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

    // Update each category row's totals
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
            if (updatedRow.isCategoryRow) return; // Skip category rows in full data update
            const idx = fullDataCopy.findIndex(d => d.activityId === updatedRow.activityId);
            if (idx !== -1) fullDataCopy[idx] = updatedRow;
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
    "Actual/Forecast Start",
    "Actual/Forecast Finish",
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
    "Actual/Forecast Start": "date",
    "Actual/Forecast Finish": "date",
    [indianDateFormat(yesterday)]: "number",
    [indianDateFormat(today)]: "number"
  };

  return (
    <div className="space-y-2 w-full flex-1 min-h-0 flex flex-col">
      <StyledExcelTable
        title="DP Vendor Block Table"
        columns={columns}
        data={tableData}
        totalRows={totalRows}
        onDataChange={handleDataChange}
        onSave={onSave}
        onSubmit={onSubmit}
        isReadOnly={isLocked}
        editableColumns={editableColumns}
        columnTypes={columnTypes}
        columnWidths={columnWidths}
        cellTextColors={cellTextColors}
        columnTextColors={{
          "% Completion": "#74DB4B"
        }}
        columnFontWeights={{
          "% Completion": "bold"
        }}
        rowStyles={rowStyles}
        headerStructure={[
          // First header row - main column names
          [
            { label: "Activity ID", colSpan: 1 },
            { label: "Description", colSpan: 1 },
            { label: "Block", colSpan: 1 },
            { label: "Priority", colSpan: 1 },
            { label: "Contractor Name", colSpan: 1 },
            { label: "UOM", colSpan: 1 },
            { label: "Scope", colSpan: 1 },
            { label: `Completed as on "${previousDate}"`, colSpan: 1 },
            { label: "Balance", colSpan: 1 },
            { label: "Baseline Start", colSpan: 1 },
            { label: "Baseline Finish", colSpan: 1 },
            { label: "Actual/Forecast Start", colSpan: 1 },
            { label: "Actual/Forecast Finish", colSpan: 1 },
            { label: indianDateFormat(yesterday), colSpan: 1 },
            { label: indianDateFormat(today), colSpan: 1 }
          ]
        ]}
        status={status} // Pass status to StyledExcelTable
        onExportAll={onExportAll}
        onFullscreenToggle={onFullscreenToggle}
        onReachEnd={onReachEnd}
        externalGlobalFilter={universalFilter}
        projectId={projectId}
        sheetType="dp_vendor_block"
      />
    </div>
  );
}
