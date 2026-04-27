import { useState, useEffect, useMemo } from "react";
import { StyledExcelTable } from "@/components/StyledExcelTable";
import { StatusChip } from "@/components/StatusChip";
import { indianDateFormat } from "@/services/dprService";
import { EntryStatus } from "@/types";

export interface DPBlockData {
  // Identification
  activityId: string;
  activities: string;
  description?: string;

  // Block details (from P6 UDF)
  blockCapacity: string;
  phase: string;
  block: string;
  spvNumber: string;

  // Status fields
  priority: string;
  scope: string;
  hold: string;
  front: string;
  completed: string;
  balance: string;

  // Date fields
  basePlanStart: string;
  basePlanFinish: string;
  actualStartDate: string;
  actualFinishDate: string;
  forecastStartDate: string;
  forecastFinishDate: string;
  remarks?: string;
  yesterdayIsApproved?: boolean;
  _cellStatuses?: Record<string, any>;
}

interface DPBlockTableProps {
  data: DPBlockData[];
  setData: (data: DPBlockData[]) => void;
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
  universalFilter?: string;
  projectId?: number;
  selectedBlock?: string;
  onPush?: () => void;

}

export function DPBlockTable({ data, setData, onSave, onSubmit, yesterday, today, isLocked = false, status = 'draft', onExportAll, totalRows, onFullscreenToggle, onReachEnd, universalFilter, projectId, selectedBlock = "ALL", onPush }: DPBlockTableProps) {


  const columns = [
    "Activity ID",
    "Activity",
    "Block Capacity (MWac)",
    "Phase",
    "Block",
    "SPV Number",
    "Priority",
    "Total Quantity",
    "Hold",
    "Front",
    "Completed",
    "Balance",
    "Baseline Start",
    "Baseline End",
    "Actual/Forecast Start",
    "Actual/Forecast Finish",
    "Remarks"
  ];

  // Define column widths for better alignment
  const columnWidths = {
    "Activity ID": 80,
    "Activity": 150,
    "Block Capacity (MWac)": 100,
    "Phase": 70,
    "Block": 70,
    "SPV Number": 80,
    "Priority": 70,
    "Total Quantity": 100,
    "Hold": 60,
    "Front": 60,
    "Completed": 80,
    "Balance": 70,
    "Baseline Start": 90,
    "Baseline End": 90,
    "Actual/Forecast Start": 110,
    "Actual/Forecast Finish": 110,
    "Remarks": 150
  };

  // Define which columns are editable by the user
  const editableColumns = [
    "Phase",
    "Priority",
    "Hold",
    "Front",
    "Actual/Forecast Start",
    "Actual/Forecast Finish",
    "Remarks"
  ];

  // Filter data based on selected block and universal filter
  const filteredData = useMemo(() => {
    if (!Array.isArray(data)) return [];
    
    const result = data.filter(d => {
      const matchBlock = selectedBlock === "ALL" || d.block === selectedBlock;
      
      const filterText = (universalFilter || "").trim().toUpperCase();
      const matchActivity = !filterText || filterText === "ALL" || 
                           (d.activityId && String(d.activityId).toUpperCase().includes(filterText)) ||
                           (d.activities && String(d.activities).toUpperCase().includes(filterText));
                           
      return matchBlock && matchActivity;
    });
    
    return result.sort((a, b) => (String(a.activityId || "")).localeCompare(String(b.activityId || "")));
  }, [data, selectedBlock, universalFilter]);

  // Convert array of objects to array of arrays
  const tableData = useMemo(() => {
    return (Array.isArray(filteredData) ? filteredData : []).map(row => {
      // Fallback logic for dates
      const effectiveActualStart = row.actualStartDate;
      const effectiveActualFinish = row.actualFinishDate;
      const displayStart = effectiveActualStart || row.forecastStartDate;
      const displayFinish = effectiveActualFinish || row.forecastFinishDate;

      // Status markers for coloring
      const startStatus = effectiveActualStart ? 'actual_date' : (row.forecastStartDate ? 'forecast_date' : '');
      const finishStatus = effectiveActualFinish ? 'actual_date' : (row.forecastFinishDate ? 'forecast_date' : '');

      const arr: any = [
        row.activityId || '',
        row.description || (row as any).activities || (row as any).activity || (row as any).activity_name || (row as any).name || (row as any).Name || '',
        row.blockCapacity || '',
        row.phase || '',
        row.block || '',
        row.spvNumber || '',
        row.priority || '',
        row.scope ? Number(row.scope).toFixed(2) : "0.00",
        row.hold || '',
        row.front || '',
        row.completed ? Number(row.completed).toFixed(2) : "0.00",
        row.balance ? Number(row.balance).toFixed(2) : "0.00",
        indianDateFormat(row.basePlanStart) || '',
        indianDateFormat(row.basePlanFinish) || '',
        indianDateFormat(displayStart) || '',
        indianDateFormat(displayFinish) || '',
        row.remarks || ''
      ];

      // Merge real edit statuses + display-only date markers for rendering
      arr._cellStatuses = {
        ...((row as any)._cellStatuses || {}),
        ...(startStatus ? { "Actual/Forecast Start": startStatus } : {}),
        ...(finishStatus ? { "Actual/Forecast Finish": finishStatus } : {})
      };

      return arr;
    });
  }, [filteredData]);

  // Handle data changes from ExcelTable
  const handleDataChange = (newData: any[][]) => {
    const actualDataRows = newData.slice(0, filteredData.length);
    const updatedData = actualDataRows.map((row, index) => {
      const updatedRow: any = {
        ...filteredData[index],
        activityId: row[0] || '',
        activities: row[1] || '',
        blockCapacity: row[2] || '',
        phase: row[3] || '',
        block: row[4] || '',
        spvNumber: row[5] || '',
        priority: row[6] || '',
        scope: row[7] || '',
        hold: row[8] || '',
        front: row[9] || '',
        completed: row[10] || '',
        balance: row[11] || '',
        basePlanStart: row[12] || '',
        basePlanFinish: row[13] || '',
        // Map back to actualStartDate/actualFinishDate
        actualStartDate: row[14] || '',
        actualFinishDate: row[15] || '',
        remarks: row[16] || ''
      };

      const cellStatuses = (row as any)['_cellStatuses'];
      if (cellStatuses && Object.keys(cellStatuses).length > 0) {
        // Strip out display-only date markers before writing back to data model
        const cleanedStatuses = { ...cellStatuses };
        delete cleanedStatuses["Actual/Forecast Start"];
        delete cleanedStatuses["Actual/Forecast Finish"];
        if (Object.keys(cleanedStatuses).length > 0) {
          updatedRow._cellStatuses = cleanedStatuses;
        }
      }

      return updatedRow;
    });

    if (selectedBlock !== "ALL") {
      const fullDataCopy = [...data];
      updatedData.forEach(updatedRow => {
        const idx = fullDataCopy.findIndex(d => d.activityId === updatedRow.activityId);
        if (idx !== -1) fullDataCopy[idx] = updatedRow;
      });
      setData(fullDataCopy);
    } else {
      setData(updatedData);
    }
  };

  return (
    <div className="space-y-4 w-full flex-1 min-h-0 flex flex-col">
      <StyledExcelTable
        title="DP Block Table"
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
          "Activity ID": "text",
          "Activity": "text",
          "Block Capacity (MWac)": "text",
          "Phase": "text",
          "Block": "text",
          "SPV Number": "text",
          "Priority": "text",
          "Total Quantity": "number",
          "Hold": "text",
          "Front": "number",
          "Completed": "number",
          "Balance": "number",
          "Baseline Start": "text",
          "Baseline End": "text",
          "Actual/Forecast Start": "date",
          "Actual/Forecast Finish": "date",
          "Remarks": "text"
        }}

        columnWidths={columnWidths}
        columnFontWeights={{
          "Actual/Forecast Start": "bold",
          "Actual/Forecast Finish": "bold"
        }}
        headerStructure={[
          [
            { label: "Activity ID", rowSpan: 2 },
            { label: "Activity", rowSpan: 2 },
            { label: "Block Capacity (MWac)", rowSpan: 2 },
            { label: "Phase", rowSpan: 2 },
            { label: "Block", rowSpan: 2 },
            { label: "SPV Number", rowSpan: 2 },
            { label: "Priority", rowSpan: 2 },
            { label: "Total Quantity", rowSpan: 2 },
            { label: "Hold", rowSpan: 2 },
            { label: "Front", rowSpan: 2 },
            { label: "Completed", rowSpan: 2 },
            { label: "Balance", rowSpan: 2 },
            { label: "Baseline Start", rowSpan: 2 },
            { label: "Baseline End", rowSpan: 2 },
            { label: "Actual/Forecast", colSpan: 2 },
            { label: "Remarks", rowSpan: 2 }
          ],
          [
            "Start",
            "Finish"
          ]
        ]}
        status={status}
        onExportAll={onExportAll}
        onFullscreenToggle={onFullscreenToggle}
        onReachEnd={onReachEnd}
        externalGlobalFilter={universalFilter}
        projectId={projectId}
        sheetType="dp_block"
      />
    </div>
  );
}
