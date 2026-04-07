import { memo, useCallback, useMemo } from "react";
import { StyledExcelTable } from "@/components/StyledExcelTable";
import { getTodayAndYesterday, indianDateFormat } from "@/services/dprService";
import { EntryStatus } from "@/types";

interface DPQtyData {
  yesterdayIsApproved?: boolean;
  activityId?: string;
  block?: string;
  slNo: string;
  description: string;
  totalQuantity: string;
  uom: string;
  basePlanStart: string;
  basePlanFinish: string;
  bl1Start?: string;
  bl1Finish?: string;
  bl2Start?: string;
  bl2Finish?: string;
  bl3Start?: string;
  bl3Finish?: string;
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
}

interface DPQtyTableProps {
  data: DPQtyData[];
  setData: React.Dispatch<React.SetStateAction<DPQtyData[]>>;
  onSave: () => void;
  onSubmit?: () => void;
  yesterday: string;
  today: string;
  isLocked?: boolean;
  status?: EntryStatus;
  projectId?: number;
  onExportAll?: () => void;
  totalRows?: number;
  onFullscreenToggle?: (isFullscreen: boolean) => void;
  onReachEnd?: () => void;
  universalFilter?: string;
  selectedBlock?: string;
}

export const DPQtyTable = memo(({ data, setData, onSave, onSubmit, yesterday, today, isLocked = false, status = 'draft', projectId, onExportAll, totalRows, onFullscreenToggle, onReachEnd, universalFilter, selectedBlock = "ALL" }: DPQtyTableProps) => {
  const { yesterday: previousDate } = getTodayAndYesterday();

  // Filter data based on selected block and universal filter
  const filteredData = useMemo(() => {
    if (!Array.isArray(data)) return [];
    let result = selectedBlock === "ALL" ? data : data.filter(d => d.block === selectedBlock);
    
    if (universalFilter && universalFilter.trim()) {
      const filters = universalFilter.trim().split(/\s+/);
      result = result.filter(d => {
        const id = d.activityId || "";
        const desc = d.description || "";
        
        return filters.some(f => {
          // Use word boundary regex to match term as a standalone part (e.g., between dashes)
          const regex = new RegExp(`\\b${f}\\b`, 'i');
          return regex.test(id) || regex.test(desc);
        });
      });
    }
    return result;
  }, [data, selectedBlock, universalFilter]);

  // Convert data to the format expected by ExcelTable - memoized
  const columns = useMemo(() => [
    "S.No",
    "Description",
    "UOM",
    "Scope",
    `Completed as on "${indianDateFormat(yesterday)}"`,
    "Balance",
    "Baseline Start",
    "Baseline Finish",
    "Actual/Forecast Start",
    "Actual/Forecast Finish",
    indianDateFormat(yesterday),
    indianDateFormat(today)
  ], [yesterday, today, previousDate]);

  // Define column widths for better alignment - memoized
  const columnWidths = useMemo(() => ({
    "S.No": 50,
    "Description": 250,
    "UOM": 60,
    "Scope": 80,
    [`Completed as on "${indianDateFormat(yesterday)}"`]: 120,
    "Balance": 80,
    "Baseline Start": 100,
    "Baseline Finish": 100,
    "Actual/Forecast Start": 120,
    "Actual/Forecast Finish": 120,
    [indianDateFormat(yesterday)]: 80,
    [indianDateFormat(today)]: 80
  }), [yesterday, today, previousDate]);

  // Define which columns are editable by the user
  const editableColumns = useMemo(() => [
    "UOM",
    "Actual/Forecast Finish"
  ], []);

  // Convert array of objects to array of arrays - memoized
  const tableData = useMemo(() => {
    const formatDt = (dt: any) => {
      if (!dt) return '';
      const dtStr = String(dt).split('T')[0];
      return indianDateFormat(dtStr) || dtStr;
    };

    const rows = (Array.isArray(filteredData) ? filteredData : []).map((row, index) => {
      const baselineStart = formatDt(row.basePlanStart || row.baselineStartDate);
      const baselineFinish = formatDt(row.basePlanFinish || row.baselineEndDate);

      const arr: any = [
        String(index + 1),
        row.description || "",
        row.uom || "",
        row.totalQuantity ? Number(row.totalQuantity).toFixed(2) : "0.00",
        row.cumulative ? Number(row.cumulative).toFixed(2) : "0.00",
        row.balance ? Number(row.balance).toFixed(2) : "0.00",
        baselineStart,
        baselineFinish,
        indianDateFormat(row.actualStart || row.forecastStart) || "", 
        indianDateFormat(row.actualFinish || row.forecastFinish) || "", 
        row.yesterdayValue ? Number(row.yesterdayValue).toFixed(2) : "0.00", 
        row.todayValue ? Number(row.todayValue).toFixed(2) : "0.00"
      ];
      if ((row as any)._cellStatuses) {
        arr._cellStatuses = (row as any)._cellStatuses;
      }
      return arr;
    });

    // Add Grand Total Row
    if (rows.length > 0) {
      const totalScope = rows.reduce((sum, r) => sum + (Number(r[3]) || 0), 0);
      const totalCompleted = rows.reduce((sum, r) => sum + (Number(r[4]) || 0), 0);
      const totalBalance = rows.reduce((sum, r) => sum + (Number(r[5]) || 0), 0);
      const totalYesterday = rows.reduce((sum, r) => sum + (Number(r[10]) || 0), 0);
      const totalToday = rows.reduce((sum, r) => sum + (Number(r[11]) || 0), 0);

      rows.push([
        "GRAND TOTAL",
        "", 
        "", // UOM
        String(totalScope.toFixed(2)),
        String(totalCompleted.toFixed(2)),
        String(totalBalance.toFixed(2)),
        "", // Baseline Start
        "", // Baseline Finish
        "", // Actual/Forecast Start
        "", // Actual/Forecast Finish
        String(totalYesterday.toFixed(2)),
        String(totalToday.toFixed(2))
      ]);
    }

    return rows;
  }, [filteredData]);

  // Row styles for the Grand Total row
  const rowStyles = useMemo(() => {
    const styles: Record<number, any> = {};
    const safeData = Array.isArray(filteredData) ? filteredData : [];
    if (safeData.length > 0) {
      styles[safeData.length] = {
        backgroundColor: "#f1f5f9", // slate-100
        color: "#0f172a", // slate-900
        fontWeight: "bold",
        isTotalRow: true
      };
    }
    return styles;
  }, [filteredData]);

  // Dynamically color cells based on approval status
  const cellTextColors = useMemo(() => {
    const colors: Record<number, Record<string, string>> = {};
    const safeData = Array.isArray(filteredData) ? filteredData : [];
    const formattedYesterday = indianDateFormat(yesterday);
    safeData.forEach((row, rowIndex) => {
      if (row.yesterdayIsApproved === false) {
        colors[rowIndex] = {
          [formattedYesterday]: "#ce440d",
          [`Completed as on "${previousDate}"`]: "#ce440d"
        };
      } else if (row.yesterdayIsApproved === true) {
        colors[rowIndex] = {
          [formattedYesterday]: "#16a34a",
          [`Completed as on "${previousDate}"`]: "#16a34a"
        };
      }
    });
    return colors;
  }, [filteredData, yesterday, previousDate]);

  // Handle data changes from ExcelTable
  const handleDataChange = useCallback((newData: any[][]) => {
    const actualDataRows = newData.slice(0, filteredData.length);
    const updatedData = actualDataRows.map((row, index) => {
      const updatedRow: any = {
        ...filteredData[index],
        uom: row[2] || '',
        actualStart: row[8] || '',
        actualFinish: row[9] || '',
        todayValue: row[11] || '',
        balance: (Number(row[3] || 0) - Number(row[4] || 0) - Number(row[11] || 0)).toFixed(2)
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
  }, [data, filteredData, selectedBlock, setData]);

  return (
    <div className="space-y-4 w-full flex-1 min-h-0 flex flex-col">
      <StyledExcelTable
        title="DP Qty Table"
        columns={columns}
        data={tableData}
        totalRows={totalRows}
        onDataChange={handleDataChange}
        onSave={onSave}
        onSubmit={onSubmit}
        isReadOnly={isLocked} // Controlled by lock status
        editableColumns={editableColumns}
        disableAutoHeaderColors={true}
        columnTypes={{
          "S.No": "text",
          "Description": "text",
          "UOM": "text",
          "Scope": "number",
          [`Completed as on "${indianDateFormat(yesterday)}"`]: "number",
          "Balance": "number",
          "Baseline Start": "text",
          "Baseline Finish": "text",
          "Actual/Forecast Start": "date",
          "Actual/Forecast Finish": "date",
          [indianDateFormat(yesterday)]: "number",
          [indianDateFormat(today)]: "number"
        }}
        columnWidths={columnWidths}
        cellTextColors={cellTextColors}
        columnTextColors={{
          "Actual/Forecast Start": "#00B050",
          "Actual/Forecast Finish": "#00B050"
        }}
        columnFontWeights={{
          "Actual/Forecast Start": "bold",
          "Actual/Forecast Finish": "bold"
        }}
        headerStructure={[
          [
            { label: "S.No", colSpan: 1 },
            { label: "Description", colSpan: 1 },
            { label: "UOM", colSpan: 1 },
            { label: "Scope", colSpan: 1 },
            { label: `Completed as on "${indianDateFormat(yesterday)}"`, colSpan: 1 },
            { label: "Balance", colSpan: 1 },
            { label: "Baseline Start", colSpan: 1 },
            { label: "Baseline Finish", colSpan: 1 },
            { label: "Actual/Forecast Start", colSpan: 1 },
            { label: "Actual/Forecast Finish", colSpan: 1 },
            { label: indianDateFormat(yesterday), colSpan: 1 },
            { label: indianDateFormat(today), colSpan: 1 }
          ]
        ]}
        status={status}
        onExportAll={onExportAll}
        onFullscreenToggle={onFullscreenToggle}
        onReachEnd={onReachEnd}
        rowStyles={rowStyles}
        projectId={projectId}
        sheetType="dp_qty"
      />
    </div>
  );
});
