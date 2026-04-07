import { useState, useEffect, useMemo } from "react";
import { StyledExcelTable } from "@/components/StyledExcelTable";
import { StatusChip } from "@/components/StatusChip";
import { indianDateFormat } from "@/services/dprService";
import { EntryStatus } from "@/types";

interface DPBlockData {
  // Identification
  activityId: string;
  activities: string;

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
  baselineStartDate: string;
  baselineEndDate: string;
  bl1Start?: string;
  bl1Finish?: string;
  bl2Start?: string;
  bl2Finish?: string;
  bl3Start?: string;
  bl3Finish?: string;
  actualStartDate: string;
  actualFinishDate: string;
  forecastStartDate: string;
  forecastFinishDate: string;
  remarks?: string;
  yesterdayIsApproved?: boolean;
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
}

export function DPBlockTable({ data, setData, onSave, onSubmit, yesterday, today, isLocked = false, status = 'draft', onExportAll, totalRows, onFullscreenToggle, onReachEnd, universalFilter, projectId, selectedBlock = "ALL" }: DPBlockTableProps) {


  // Define columns - 18 columns total (no Yesterday/Today)
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
    "Baseline 1 Start",
    "Baseline 1 Finish",
    "Baseline 2 Start",
    "Baseline 2 Finish",
    "Baseline 3 Start",
    "Baseline 3 Finish",
    "Actual Start",
    "Actual Finish",
    "Forecast Start",
    "Forecast Finish",
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
    "Baseline 1 Start": 90,
    "Baseline 1 Finish": 90,
    "Baseline 2 Start": 90,
    "Baseline 2 Finish": 90,
    "Baseline 3 Start": 90,
    "Baseline 3 Finish": 90,
    "Actual Start": 90,
    "Actual Finish": 90,
    "Forecast Start": 90,
    "Forecast Finish": 90
  };

  // Define which columns are editable by the user
  const editableColumns = [
    "Phase",
    "Priority",
    "Hold",
    "Front",
    "Actual Start",
    "Actual Finish",
    "Forecast Start",
    "Forecast Finish",
    "Remarks"
  ];

  // Filter data based on selected block
  const filteredData = useMemo(() => {
    if (!Array.isArray(data)) return [];
    const result = selectedBlock === "ALL" ? data : data.filter(d => d.block === selectedBlock);
    return [...result].sort((a, b) => (String(a.activityId || "")).localeCompare(String(b.activityId || "")));
  }, [data, selectedBlock]);

  // Convert array of objects to array of arrays
  const tableData = useMemo(() => {
    return (Array.isArray(filteredData) ? filteredData : []).map(row => {
      const arr: any = [
        row.activityId || '',
        row.activities || '',
        row.blockCapacity || '',
        row.phase || '',
        row.block || '',
        row.spvNumber || '',
        row.priority || '',
        row.scope || '',
        row.hold || '',
        row.front || '',
        row.completed || '',
        row.balance || '',
        indianDateFormat(row.baselineStartDate) || '',
        indianDateFormat(row.baselineEndDate) || '',
        indianDateFormat(row.bl1Start) || '',
        indianDateFormat(row.bl1Finish) || '',
        indianDateFormat(row.bl2Start) || '',
        indianDateFormat(row.bl2Finish) || '',
        indianDateFormat(row.bl3Start) || '',
        indianDateFormat(row.bl3Finish) || '',
        indianDateFormat(row.actualStartDate) || '',
        indianDateFormat(row.actualFinishDate) || '',
        indianDateFormat(row.forecastStartDate) || '',
        indianDateFormat(row.forecastFinishDate) || ''
      ];
      if ((row as any)._cellStatuses) {
        arr._cellStatuses = (row as any)._cellStatuses;
      }
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
        baselineStartDate: row[12] || '',
        baselineEndDate: row[13] || '',
        bl1Start: row[14] || '',
        bl1Finish: row[15] || '',
        bl2Start: row[16] || '',
        bl2Finish: row[17] || '',
        bl3Start: row[18] || '',
        bl3Finish: row[19] || '',
        actualStartDate: row[20] || '',
        actualFinishDate: row[21] || '',
        forecastStartDate: row[22] || '',
        forecastFinishDate: row[23] || ''
      };

      // Preserve _cellStatuses metadata from the array row (set by StyledExcelTable)
      const cellStatuses = (row as any)['_cellStatuses'];
      if (cellStatuses && Object.keys(cellStatuses).length > 0) {
        updatedRow._cellStatuses = { ...cellStatuses };
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
        isReadOnly={isLocked}
        editableColumns={editableColumns}
        disableAutoHeaderColors={true}
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
          "Baseline 1 Start": "text",
          "Baseline 1 Finish": "text",
          "Baseline 2 Start": "text",
          "Baseline 2 Finish": "text",
          "Baseline 3 Start": "text",
          "Baseline 3 Finish": "text",
          "Actual Start": "date",
          "Actual Finish": "date",
          "Forecast Start": "date",
          "Forecast Finish": "date",
          "Remarks": "text"
        }}
        columnWidths={columnWidths}
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
        headerStructure={[
          [
            { label: "Activity ID", colSpan: 1 },
            { label: "Activity", colSpan: 1 },
            { label: "Block Capacity (MWac)", colSpan: 1 },
            { label: "Phase", colSpan: 1 },
            { label: "Block", colSpan: 1 },
            { label: "SPV Number", colSpan: 1 },
            { label: "Priority", colSpan: 1 },
            { label: "Total Quantity", colSpan: 1 },
            { label: "Hold", colSpan: 1 },
            { label: "Front", colSpan: 1 },
            { label: "Completed", colSpan: 1 },
            { label: "Balance", colSpan: 1 },
            { label: "Baseline Start", colSpan: 1 },
            { label: "Baseline End", colSpan: 1 },
            { label: "Baseline 1 Start", colSpan: 1 },
            { label: "Baseline 1 Finish", colSpan: 1 },
            { label: "Baseline 2 Start", colSpan: 1 },
            { label: "Baseline 2 Finish", colSpan: 1 },
            { label: "Baseline 3 Start", colSpan: 1 },
            { label: "Baseline 3 Finish", colSpan: 1 },
            { label: "Actual Start", colSpan: 1 },
            { label: "Actual Finish", colSpan: 1 },
            { label: "Forecast Start", colSpan: 1 },
            { label: "Forecast Finish", colSpan: 1 },
            { label: "Remarks", colSpan: 1 }
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
