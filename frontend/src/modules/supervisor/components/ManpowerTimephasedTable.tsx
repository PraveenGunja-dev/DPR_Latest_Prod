import React, { useEffect, useMemo } from "react";
import { StyledExcelTable } from "@/components/StyledExcelTable";
import { indianDateFormat, getTodayAndYesterday } from "@/services/dprService";
import { EntryStatus } from "@/types";

interface ManpowerDetailsData {
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

interface ManpowerTimephasedTableProps {
  data: ManpowerDetailsData[];
  setData: (data: ManpowerDetailsData[]) => void;
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
}

const formatUnits = (val: any) => {
  const num = Number(val) || 0;
  if (num === 0) return '0';
  return Number.isInteger(num) ? String(num) : num.toFixed(2);
};

export function ManpowerTimephasedTable({
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
}: ManpowerTimephasedTableProps) {

  const { yesterday: previousDateISO } = getTodayAndYesterday();
  const previousDate = indianDateFormat(previousDateISO);

  // 9-column structure as requested
  const columns = useMemo(() => {
    const baseCols = [
      "Activity ID",
      "Description",
      "Block"
    ];
    // Create 7 trailing date columns, 0 is oldest, 6 is today
    const dateRange = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const formattedDate = indianDateFormat(d.toISOString().split('T')[0]);
      dateRange.push(`${formattedDate} - Contractor`);
      dateRange.push(`${formattedDate} - Budgeted Units`);
      dateRange.push(`${formattedDate} - Actual Units`);
      dateRange.push(`${formattedDate} - Remaining Units`);
      dateRange.push(`${formattedDate} - At Completion`);
      dateRange.push(`${formattedDate} - % Comp`);
    }
    return [...baseCols, ...dateRange];
  }, [today]);

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

  // Convert objects to arrays — Vendor IDT display structure
  const tableData = useMemo(() => {
    return (Array.isArray(filteredData) ? filteredData : []).map(row => {
      let arr: any;
      if (row.isCategoryRow) {
        // Category heading row
        const datesArray: any[] = [];
        for (let i = 6; i >= 0; i--) {
          const d = new Date(today);
          d.setDate(d.getDate() - i);
          const dateSuffix = d.toISOString().split('T')[0];
          
          const dayActual = row[`actual_${dateSuffix}`] || "0";
          const dayBudgeted = row.budgetedUnits || "0";

          datesArray.push(
            row[`contractor_${dateSuffix}`] || '', 
            formatUnits(dayBudgeted), 
            formatUnits(dayActual), 
            '', 
            '', 
            row.percentComplete || ""
          );
        }
        arr = [
          '',
          row.description || (row as any).activities || (row as any).activity || (row as any).activity_name || (row as any).name || (row as any).Name || '',
          '',
          ...datesArray
        ];
      } else {
        const datesArray: any[] = [];
        for (let i = 6; i >= 0; i--) {
          const d = new Date(today);
          d.setDate(d.getDate() - i);
          const dateSuffix = d.toISOString().split('T')[0];
          
          const dayVal = row[`actual_${dateSuffix}`] || "0";
          
          datesArray.push(
            row[`contractor_${dateSuffix}`] ?? row.contractorName ?? '',
            formatUnits(row.budgetedUnits), 
            formatUnits(dayVal),     
            '', 
            '', 
            '' 
          );
        }
        arr = [
          row.activityId || '',
          row.description || (row as any).activities || (row as any).activity || (row as any).activity_name || (row as any).name || (row as any).Name || '',
          row.block || '',
          ...datesArray
        ];
      }
      if ((row as any)._cellStatuses) {
        arr._cellStatuses = (row as any)._cellStatuses;
      }
      return arr;
    });
  }, [filteredData]);

  // #FADFAD heading rows — same as Vendor IDT
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

  // Handle data changes
  const handleDataChange = (newData: any[][]) => {
    const actualDataRows = newData.slice(0, filteredData.length);
    const updatedRows = actualDataRows.map((row, index) => {
      const originalRow = filteredData[index];

      if (originalRow?.isCategoryRow) {
        return { ...originalRow };
      } else {
        // Layout: cols 0=ActivityID, 1=Description, 2=Block
        // Then 7 date blocks of 6 cols each (indices 3..44):
        //   offset 0=Contractor, 1=Budgeted, 2=Actual, 3=Remaining, 4=AtCompletion, 5=%Comp
        // So Actual Units for day i is at index: 3 + i*6 + 2 = 5 + i*6

        const newDateValues: Record<string, any> = {};

        for (let i = 0; i < 7; i++) {
          const actualIdx = 3 + i * 6 + 2; // = 5 + i*6
          const contractorIdx = 3 + i * 6;
          const val = Number(String(row[actualIdx] || '0').trim()) || 0;

          const d = new Date(today);
          d.setDate(d.getDate() - (6 - i));
          const dateSuffix = d.toISOString().split('T')[0];

          newDateValues[`actual_${dateSuffix}`] = val;
          newDateValues[`contractor_${dateSuffix}`] = row[contractorIdx] || originalRow[`contractor_${dateSuffix}`] || originalRow.contractorName || '';
        }

        const updatedRow: any = {
          ...originalRow,
          ...newDateValues
        };

        // Preserve _cellStatuses metadata from the array row (set by StyledExcelTable)
        const cellStatuses = (row as any)['_cellStatuses'];
        if (cellStatuses && Object.keys(cellStatuses).length > 0) {
          updatedRow._cellStatuses = { ...cellStatuses };
        }

        return updatedRow;
      }
    });

    // Recalculate category row totals
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

      const totalBudgeted = activities.reduce((sum, r) => sum + (Number(r.budgetedUnits) || 0), 0);
      const totalActual = activities.reduce((sum, r) => sum + (Number(r.actualUnits) || 0), 0);
      const totalRemaining = activities.reduce((sum, r) => sum + (Number(r.remainingUnits) || 0), 0);
      const pct = totalBudgeted > 0 ? ((totalActual / totalBudgeted) * 100) + '%' : '0%';

      // Aggregate daily keys for category row
      const dailyAgg: Record<string, any> = {};
      const allKeys = new Set<string>();
      activities.forEach(r => Object.keys(r).forEach(k => allKeys.add(k)));
      allKeys.forEach(k => {
        if (k.startsWith('actual_')) {
          dailyAgg[k] = activities.reduce((s, r) => s + (Number(r[k]) || 0), 0);
        }
      });

      updatedRows[catIdx] = {
        ...catRow,
        budgetedUnits: String(totalBudgeted),
        actualUnits: String(totalActual),
        remainingUnits: String(totalRemaining),
        percentComplete: pct,
        ...dailyAgg
      };
    });

    if (selectedBlock !== "ALL") {
      const fullDataCopy = [...data];
      updatedRows.forEach(updatedRow => {
        if (updatedRow.isCategoryRow) return;
        const idx = fullDataCopy.findIndex(d => d.activityId === updatedRow.activityId);
        if (idx !== -1) fullDataCopy[idx] = updatedRow;
      });
      setData(fullDataCopy);
    } else {
      setData(updatedRows);
    }
  };
  const editableColumns = useMemo(() => {
    // Only Actual Units under each date are editable
    return columns.filter(c => c.includes('Actual Units'));
  }, [columns]);

  const columnTypes = useMemo(() => {
    const types: Record<string, 'text' | 'number' | 'date'> = {
      "Activity ID": "text",
      "Description": "text",
      "Block": "text"
    };
    columns.slice(3).forEach(c => {
      if (c.includes("Contractor") || c.includes("% Comp")) {
        types[c] = "text";
      } else {
        types[c] = "number";
      }
    });
    return types;
  }, [columns]);

  const columnWidths = useMemo(() => {
    const widths: Record<string, number> = {
      "Activity ID": 90,
      "Description": 230,
      "Block": 80
    };
    // Map dynamically generated columns
    columns.slice(3).forEach(c => {
      if (c.includes("Contractor")) widths[c] = 160;
      else if (c.includes("Budgeted")) widths[c] = 130;
      else if (c.includes("Actual")) widths[c] = 120;
      else if (c.includes("Remaining")) widths[c] = 130;
      else if (c.includes("At Completion")) widths[c] = 140;
      else if (c.includes("% Comp")) widths[c] = 80;
      else widths[c] = 90; // Fallback
    });
    return widths;
  }, [columns]);

  return (
    <div className="space-y-2 w-full flex-1 min-h-0 flex flex-col">
      <StyledExcelTable
        title="Manpower Details"
        columns={columns}
        data={tableData}
        totalRows={totalRows}
        onDataChange={handleDataChange}
        onSave={onSave}
        onSubmit={onSubmit}
        onPush={onPush}
        isReadOnly={isLocked}
        fixedColumnsCount={3}
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
            ...Array(7).fill(0).map((_, i) => {
               const d = new Date(today);
               d.setDate(d.getDate() - (6 - i));
               return { label: indianDateFormat(d.toISOString().split('T')[0]), colSpan: 6 };
            })
          ],
          [
            ...Array(7).fill(0).flatMap(() => [
               { label: "Contractor", colSpan: 1 },
               { label: "Budgeted Units", colSpan: 1 },
               { label: "Actual Units", colSpan: 1 },
               { label: "Remaining Units", colSpan: 1 },
               { label: "At Completion", colSpan: 1 },
               { label: "% Comp", colSpan: 1 }
            ])
          ]
        ]}
        status={status}
        onExportAll={onExportAll}
        onFullscreenToggle={onFullscreenToggle}
        onReachEnd={onReachEnd}
        externalGlobalFilter={universalFilter}
        projectId={projectId}
        sheetType="manpower_details_2"
      />
    </div>
  );
}

