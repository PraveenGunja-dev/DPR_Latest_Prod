import React, { useMemo, useCallback, memo } from 'react';
import { StyledExcelTable } from "@/components/StyledExcelTable";
import { indianDateFormat } from "@/services/dprService";

export interface PSSProgressData {
  sNo?: string;
  description: string;
  priority: string;
  duration: string;
  planStart: string;
  planFinish: string;
  actualStart: string;
  actualFinish: string;
  forecastStart: string;
  forecastFinish: string;
  soVendorName: string;
  uom: string;
  scope: string;
  completed: string;
  balance: string;
  remarks: string;
  status?: string;
  mainHeading?: string;
  subHeading?: string;
  isCategoryRow?: boolean;
  [key: string]: any;
}

// Colors for main and sub headings
const MAIN_HEADING_COLOR = "#1B4F72";    // Deep navy blue - main heading background
const MAIN_HEADING_TEXT = "#FFFFFF";       // White text for main heading
const SUB_HEADING_COLOR = "#85C1E9";      // Light blue - sub heading background  
const SUB_HEADING_TEXT = "#1B2631";        // Dark text for sub heading

interface PSSProgressTableProps {
  data: PSSProgressData[];
  setData: (data: PSSProgressData[]) => void;
  onSave?: () => void;
  onSubmit?: () => void;
  yesterday?: string;
  today?: string;
  isLocked?: boolean;
  status?: string;
  onExportAll?: () => void;
  projectId?: number;
  onPush?: () => void;
}

export const PSSProgressTable = memo(({
  data,
  setData,
  onSave,
  onSubmit,
  isLocked = false,
  status = 'draft',
  onExportAll,
  projectId,
  onPush,
}: PSSProgressTableProps) => {
  const columns = useMemo(() => [
    "S.No",
    "Description",
    "Status",
    "Priority",
    "Duration",
    "Plan Start",
    "Plan Finish",
    "Actual Start",
    "Actual Finish",
    "Forecast Start",
    "Forecast Finish",
    "SO Vendor Name",
    "UOM",
    "Scope",
    "Completed",
    "Balance",
    "Remarks",
  ], []);

  const columnWidths = useMemo(() => ({
    "S.No": 50,
    "Description": 280,
    "Status": 110,
    "Priority": 80,
    "Duration": 80,
    "Plan Start": 100,
    "Plan Finish": 100,
    "Actual Start": 100,
    "Actual Finish": 100,
    "Forecast Start": 100,
    "Forecast Finish": 100,
    "SO Vendor Name": 160,
    "UOM": 60,
    "Scope": 80,
    "Completed": 90,
    "Balance": 80,
    "Remarks": 180,
  }), []);

  const columnTypes = useMemo(() => ({
    "S.No": "text" as const,
    "Description": "text" as const,
    "Status": "select" as const,
    "Priority": "text" as const,
    "Duration": "text" as const,
    "Plan Start": "text" as const,
    "Plan Finish": "text" as const,
    "Actual Start": "text" as const,
    "Actual Finish": "text" as const,
    "Forecast Start": "text" as const,
    "Forecast Finish": "text" as const,
    "SO Vendor Name": "text" as const,
    "UOM": "text" as const,
    "Scope": "number" as const,
    "Completed": "number" as const,
    "Balance": "number" as const,
    "Remarks": "text" as const,
  }), []);

  const columnTextColors = useMemo(() => ({
    "Actual Start": "#00B050",
    "Actual Finish": "#00B050",
    "Forecast Start": "#2E86C1",
    "Forecast Finish": "#2E86C1",
  }), []);

  const columnFontWeights = useMemo(() => ({
    "Actual Start": "bold",
    "Actual Finish": "bold",
    "Forecast Start": "bold",
    "Forecast Finish": "bold",
  }), []);

  const editableColumns = useMemo(() => [
    "Description", "Status", "Priority", "Duration",
    "Plan Start", "Plan Finish", "Actual Start", "Actual Finish", "Forecast Start", "Forecast Finish",
    "SO Vendor Name", "UOM", "Scope", "Completed", "Remarks"
  ], []);

  const headerStructure = useMemo(() => [
    [
      { label: "S.No", rowSpan: 2, colSpan: 1 },
      { label: "Description", rowSpan: 2, colSpan: 1 },
      { label: "Status", rowSpan: 2, colSpan: 1 },
      { label: "Priority", rowSpan: 2, colSpan: 1 },
      { label: "Duration", rowSpan: 2, colSpan: 1 },
      { label: "Plan", colSpan: 2, rowSpan: 1 },
      { label: "Actual", colSpan: 2, rowSpan: 1 },
      { label: "Forecast", colSpan: 2, rowSpan: 1 },
      { label: "SO Vendor Name", rowSpan: 2, colSpan: 1 },
      { label: "UOM", rowSpan: 2, colSpan: 1 },
      { label: "Scope", rowSpan: 2, colSpan: 1 },
      { label: "Completed", rowSpan: 2, colSpan: 1 },
      { label: "Balance", rowSpan: 2, colSpan: 1 },
      { label: "Remarks", rowSpan: 2, colSpan: 1 },
    ],
    [
      { label: "Plan Start", colSpan: 1, rowSpan: 1 },
      { label: "Plan Finish", colSpan: 1, rowSpan: 1 },
      { label: "Actual Start", colSpan: 1, rowSpan: 1 },
      { label: "Actual Finish", colSpan: 1, rowSpan: 1 },
      { label: "Forecast Start", colSpan: 1, rowSpan: 1 },
      { label: "Forecast Finish", colSpan: 1, rowSpan: 1 },
    ]
  ], []);

  // Build table data with heading rows inserted
  const { tableData, rowStylesMap, dataIndexMap } = useMemo(() => {
    const safeData = Array.isArray(data) ? data : [];
    const formatDt = (dt: any) => {
      if (!dt) return '';
      const dtStr = String(dt).split('T')[0];
      return indianDateFormat(dtStr) || dtStr;
    };

    const rows: string[][] = [];
    const styles: Record<number, any> = {};
    const indexMap: number[] = []; // maps row index -> data index (-1 for heading rows)
    
    let currentMainHeading = '';
    let currentSubHeading = '';
    let sNo = 1;

    let totalScope = 0;
    let totalCompleted = 0;

    safeData.forEach((row, dataIdx) => {
      const mainH = row.mainHeading || '';
      const subH = row.subHeading || '';

      // Insert main heading row if changed
      if (mainH && mainH !== currentMainHeading) {
        currentMainHeading = mainH;
        currentSubHeading = ''; // Reset sub heading
        const headingRow = ["", mainH, "", "", "", "", "", "", "", "", "", "", "", "", "", "", ""];
        rows.push(headingRow);
        styles[rows.length - 1] = {
          backgroundColor: MAIN_HEADING_COLOR,
          color: MAIN_HEADING_TEXT,
          fontWeight: "bold",
          fontSize: "13px",
          isCategoryRow: true,
        };
        indexMap.push(-1);
      }

      // Insert sub heading row if changed
      if (subH && subH !== currentSubHeading) {
        currentSubHeading = subH;
        const subRow = ["", `  ${subH}`, "", "", "", "", "", "", "", "", "", "", "", "", "", "", ""];
        rows.push(subRow);
        styles[rows.length - 1] = {
          backgroundColor: SUB_HEADING_COLOR,
          color: SUB_HEADING_TEXT,
          fontWeight: "600",
          fontSize: "12px",
          isCategoryRow: true,
        };
        indexMap.push(-1);
      }

      // Track totals for the activity rows
      const s = Number(row.scope) || 0;
      const c = Number(row.completed) || 0;
      totalScope += s;
      totalCompleted += c;

      // Insert activity row
      rows.push([
        String(sNo++),
        row.description || (row as any).activities || '',
        row.status || 'Not Started',
        row.priority || '',
        row.duration || '',
        formatDt(row.planStart),
        formatDt(row.planFinish),
        formatDt(row.actualStart),
        formatDt(row.actualFinish),
        formatDt(row.forecastStart),
        formatDt(row.forecastFinish),
        row.soVendorName || '',
        row.uom || '',
        row.scope || '',
        row.completed || '',
        row.balance || '',
        row.remarks || '',
      ]);
      indexMap.push(dataIdx);
    });

    // Grand Total Row
    if (rows.length > 0) {
      const totalBalance = Math.max(0, totalScope - totalCompleted);
      rows.push([
        "TOTAL", "", "", "", "", "", "", "", "", "", "", "", "",
        String(totalScope || ''),
        String(totalCompleted || ''),
        String(totalBalance || ''),
        ""
      ]);
      styles[rows.length - 1] = {
        backgroundColor: "#f1f5f9",
        color: "#0f172a",
        fontWeight: "bold",
        isTotalRow: true,
      };
      indexMap.push(-2); // -2 for total row
    }

    return { tableData: rows, rowStylesMap: styles, dataIndexMap: indexMap };
  }, [data]);

  const handleDataChange = useCallback((newData: any[][]) => {
    const safeData = Array.isArray(data) ? data : [];
    const updated = [...safeData];
    let hasChanges = false;

    newData.forEach((row, rowIdx) => {
      if (rowIdx >= dataIndexMap.length) return;
      const dataIdx = dataIndexMap[rowIdx];
      if (dataIdx < 0) return; // Skip heading and total rows

      const original = safeData[dataIdx];
      const scope = Number(row[13]) || 0;
      const completed = Number(row[14]) || 0;

      if (
        original.description !== row[1] ||
        original.status !== row[2] ||
        original.priority !== row[3] ||
        original.duration !== row[4] ||
        original.planStart !== row[5] ||
        original.planFinish !== row[6] ||
        original.actualStart !== row[7] ||
        original.actualFinish !== row[8] ||
        original.forecastStart !== row[9] ||
        original.forecastFinish !== row[10] ||
        original.soVendorName !== row[11] ||
        original.uom !== row[12] ||
        Number(original.scope) !== scope ||
        Number(original.completed) !== completed ||
        original.remarks !== row[16] ||
        original._cellStatuses !== (row as any)._cellStatuses
      ) {
        hasChanges = true;
        updated[dataIdx] = {
          ...original,
          _cellStatuses: (row as any)._cellStatuses,
          description: row[1] || '',
          status: row[2] || '',
          priority: row[3] || '',
          duration: row[4] || '',
          planStart: row[5] || '',
          planFinish: row[6] || '',
          actualStart: row[7] || '',
          actualFinish: row[8] || '',
          forecastStart: row[9] || '',
          forecastFinish: row[10] || '',
          soVendorName: row[11] || '',
          uom: row[12] || '',
          scope: String(scope),
          completed: String(completed),
          balance: String(Math.max(0, scope - completed)),
          remarks: row[16] || '',
        };
      }
    });

    if (hasChanges) {
      setData(updated);
    }
  }, [data, setData, dataIndexMap]);

  return (
    <div className="space-y-4 w-full flex-1 min-h-0 flex flex-col">
      <StyledExcelTable
        title="PSS Project - Progress Sheet"
        columns={columns}
        data={tableData}
        onDataChange={handleDataChange}
        onSave={onSave || (() => {})}
        onSubmit={onSubmit}
        onPush={onPush}
        isReadOnly={isLocked}
        editableColumns={editableColumns}
        columnTypes={columnTypes}
        columnOptions={useMemo(() => ({ 
          "Status": ["Not Started", "In Progress", "Completed", "On Hold"]
        }), [])}
        columnWidths={columnWidths}
        headerStructure={headerStructure}
        rowStyles={rowStylesMap}
        status={status}
        onExportAll={onExportAll}
        disableAutoHeaderColors={true}
        columnTextColors={columnTextColors}
        columnFontWeights={columnFontWeights}
        projectId={projectId}
        sheetType="pss_progress"
      />
    </div>
  );
});
