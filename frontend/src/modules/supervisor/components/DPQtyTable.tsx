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
  status?: string;
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
  onPush?: () => void;
}

export const DPQtyTable = memo(({ data, setData, onSave, onSubmit, yesterday, today, isLocked = false, status = 'draft', projectId, onExportAll, totalRows, onFullscreenToggle, onReachEnd, universalFilter, selectedBlock = "ALL", onPush }: DPQtyTableProps) => {
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
    "Status",
    "UOM",
    "Scope",
    `Completed as on\n${indianDateFormat(yesterday)}`,
    "Balance",
    "Baseline Start",
    "Baseline Finish",
    "Actual Start",
    "Actual Finish",
    "Forecast Start",
    "Forecast Finish",
    indianDateFormat(yesterday),
    indianDateFormat(today)
  ], [yesterday, today]);

  // Define column widths for better alignment - memoized
  const columnWidths = useMemo(() => ({
    "S.No": 50,
    "Description": 250,
    "Status": 110,
    "UOM": 60,
    "Scope": 80,
    [`Completed as on\n${indianDateFormat(yesterday)}`]: 120,
    "Balance": 80,
    "Baseline Start": 100,
    "Baseline Finish": 100,
    "Actual Start": 100,
    "Actual Finish": 100,
    "Forecast Start": 100,
    "Forecast Finish": 100,
    [indianDateFormat(yesterday)]: 80,
    [indianDateFormat(today)]: 80
  }), [yesterday, today]);

  // Define which columns are editable by the user
  const editableColumns = useMemo(() => [
    "UOM",
    "Actual Start",
    "Actual Finish",
    "Forecast Start",
    "Forecast Finish",
    indianDateFormat(today)
  ], [today]);

  // Convert array of objects to array of arrays - memoized
  const tableData = useMemo(() => {
    const formatDt = (dt: any) => {
      if (!dt) return '';
      const dtStr = String(dt).split('T')[0];
      return indianDateFormat(dtStr) || dtStr;
    };

    const rows = (Array.isArray(filteredData) ? filteredData : []).map((row, index) => {
      const baselineStart = formatDt(row.basePlanStart);
      const baselineFinish = formatDt(row.basePlanFinish);

      const arr: any = [
        String(index + 1),
        row.description || "",
        row.status || "Not Started",
        row.uom || "",
        row.totalQuantity ? Number(row.totalQuantity).toFixed(2) : "0.00",
        row.cumulative ? Number(row.cumulative).toFixed(2) : "0.00",
        row.balance ? Number(row.balance).toFixed(2) : "0.00",
        baselineStart,
        baselineFinish,
        indianDateFormat(row.actualStart) || "",
        indianDateFormat(row.actualFinish) || "",
        indianDateFormat(row.forecastStart) || "",
        indianDateFormat(row.forecastFinish) || "",
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
      const totalScope = rows.reduce((sum, r) => sum + (Number(r[4]) || 0), 0);
      const totalCompleted = rows.reduce((sum, r) => sum + (Number(r[5]) || 0), 0);
      const totalBalance = rows.reduce((sum, r) => sum + (Number(r[6]) || 0), 0);
      const totalYesterday = rows.reduce((sum, r) => sum + (Number(r[13]) || 0), 0);
      const totalToday = rows.reduce((sum, r) => sum + (Number(r[14]) || 0), 0);

      rows.push([
        "GRAND TOTAL",
        "",
        "", // Status
        "", // UOM
        String(totalScope.toFixed(2)),
        String(totalCompleted.toFixed(2)),
        String(totalBalance.toFixed(2)),
        "", // Baseline Start
        "", // Baseline Finish
        "", // Actual Start
        "", // Actual Finish
        "", // Forecast Start
        "", // Forecast Finish
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
        backgroundColor: "#FADFAD", 
        color: "#000000",
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
    const completedLabel = `Completed as on\n${indianDateFormat(yesterday)}`;
    safeData.forEach((row, rowIndex) => {
      if (row.yesterdayIsApproved === false) {
        colors[rowIndex] = {
          [formattedYesterday]: "#ce440d",
          [completedLabel]: "#ce440d"
        };
      } else if (row.yesterdayIsApproved === true) {
        colors[rowIndex] = {
          [formattedYesterday]: "#16a34a",
          [completedLabel]: "#16a34a"
        };
      }
    });
    return colors;
  }, [filteredData, yesterday, previousDate]);

  // Handle data changes from ExcelTable
  const handleDataChange = useCallback((newData: any[][]) => {
    const actualDataRows = newData.slice(0, filteredData.length);
    const updatedData = actualDataRows.map((row, index) => {
      const original = filteredData[index];
      const updatedRow: any = { ...original };
      
      const cellStatuses = (row as any)['_cellStatuses'] || {};
      
      // Update indices based on new columns
      // 2: Status, 3: UOM, 9: Actual Start, 10: Actual Finish, 11: Forecast Start, 12: Forecast Finish, 14: Today Value
      if (cellStatuses[2]) updatedRow.status = row[2] || '';
      if (cellStatuses[3]) updatedRow.uom = row[3] || '';
      if (cellStatuses[9]) updatedRow.actualStart = row[9] || '';
      if (cellStatuses[10]) updatedRow.actualFinish = row[10] || '';
      if (cellStatuses[11]) updatedRow.forecastStart = row[11] || '';
      if (cellStatuses[12]) updatedRow.forecastFinish = row[12] || '';
      if (cellStatuses[14]) updatedRow.todayValue = row[14] || '';
      
      const scope = Number(row[4] || 0);
      const completed = Number(row[5] || 0);
      const today = Number(row[14] || 0);
      updatedRow.balance = (scope - completed - today).toFixed(2);
      
      updatedRow._cellStatuses = cellStatuses;
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
        onPush={onPush}
        isReadOnly={isLocked}
        editableColumns={editableColumns}
        columnTypes={{
          "S.No": "text",
          "Description": "text",
          "Status": "text",
          "UOM": "text",
          "Scope": "number",
          [`Completed as on "${indianDateFormat(yesterday)}"`]: "number",
          "Balance": "number",
          "Baseline Start": "text",
          "Baseline Finish": "text",
          "Actual Start": "date",
          "Actual Finish": "date",
          "Forecast Start": "date",
          "Forecast Finish": "date",
          [indianDateFormat(yesterday)]: "number",
          [indianDateFormat(today)]: "number"
        }}
        columnOptions={{}}
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
        headerStructure={[
          [
            { label: "S.No", colSpan: 1 },
            { label: "Description", colSpan: 1 },
            { label: "Status", colSpan: 1 },
            { label: "UOM", colSpan: 1 },
            { label: "Scope", colSpan: 1 },
            { label: `Completed as on\n${indianDateFormat(yesterday)}`, colSpan: 1 },
            { label: "Balance", colSpan: 1 },
            { label: "Baseline Start", colSpan: 1 },
            { label: "Baseline Finish", colSpan: 1 },
            { label: "Actual Start", colSpan: 1 },
            { label: "Actual Finish", colSpan: 1 },
            { label: "Forecast Start", colSpan: 1 },
            { label: "Forecast Finish", colSpan: 1 },
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
