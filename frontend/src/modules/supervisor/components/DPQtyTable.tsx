import { useState, useEffect, memo, useCallback, useMemo, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Save } from "lucide-react";
import { StyledExcelTable } from "@/components/StyledExcelTable";
import { getTodayAndYesterday } from "@/modules/auth/services/dprSupervisorService";
import { toast } from "sonner";
import { StatusChip } from "@/components/StatusChip";
import { fetchDpQtyData } from "@/modules/supervisor/services/mockDataService";
import { HyperFormula } from "hyperformula";

interface DPQtyData {
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
  yesterday?: string; // Number value, not editable
  today?: string; // Number value, editable
}

interface DPQtyTableProps {
  data: DPQtyData[];
  setData: React.Dispatch<React.SetStateAction<DPQtyData[]>>;
  onSave: () => void;
  onSubmit?: () => void;
  yesterday: string;
  today: string;
  isLocked?: boolean;
  status?: 'draft' | 'submitted_to_pm' | 'approved_by_pm' | 'rejected_by_pm' | 'final_approved';
  projectId?: number; // Add projectId prop for P6 integration
  useMockData?: boolean; // Flag to use mock data
}

export const DPQtyTable = memo(({ data, setData, onSave, onSubmit, yesterday, today, isLocked = false, status = 'draft', projectId, useMockData = false }: DPQtyTableProps) => {
  const { today: currentDate, yesterday: previousDate } = getTodayAndYesterday();

  // Fetch data from Oracle P6 ONLY if data is empty and useMockData is true
  // When useMockData is false, data comes from parent component (DPRDashboard)
  useEffect(() => {
    const fetchData = async () => {
      // Skip if data is already provided by parent
      if (!useMockData && data.length > 0) {
        console.log('DPQtyTable: Using data from parent', data.length, 'rows');
        return;
      }

      if (useMockData) {
        // Fetch from mock API
        try {
          const mockData = await fetchDpQtyData();
          setData(mockData);
        } catch (error) {
          console.error('Error fetching mock data:', error);
        }
      }
      // When useMockData is false, data is provided by parent (DPRDashboard) via P6 activities
    };

    fetchData();
  }, [projectId, useMockData, data.length, setData]); // Added data.length and setData to deps

  // HyperFormula Integration
  // HyperFormula Integration
  const hfInstance = useMemo(() => {
    return HyperFormula.buildEmpty({
      licenseKey: 'gpl-v3',
    });
  }, []);

  const sheetNameRef = useMemo(() => 'Sheet1', []);

  // Column Indices (0-based) to match tableData
  // Added BASE_CUMULATIVE at index 14 to store the original cumulative value
  const COL = useMemo(() => ({
    DESCRIPTION: 0,
    TOTAL_QTY: 1,
    UOM: 2,
    BALANCE: 3,
    BASE_PLAN_START: 4,
    BASE_PLAN_FINISH: 5,
    ACTUAL_START: 6,
    ACTUAL_FINISH: 7,
    FORECAST_START: 8,
    FORECAST_FINISH: 9,
    REMARKS: 10,
    CUMULATIVE: 11,
    YESTERDAY: 12,
    TODAY: 13,
    BASE_CUMULATIVE: 14  // Hidden column to store original cumulative (before today's entry)
  }), []);

  // Track if sheet has been initialized
  const sheetInitializedRef = useRef(false);
  const dataIdRef = useRef(0);

  // Build sheet data with formulas
  const buildSheetData = useCallback((rowData: DPQtyData[]) => {
    return rowData.map((row, rowIndex) => {
      const rowNum = rowIndex + 1;

      // Cumulative Formula: = Base Cumulative (O) + Today (N)
      const cumulativeFormula = `=O${rowNum}+N${rowNum}`;

      // Balance Formula: = Total Quantity (B) - Cumulative (L)
      const balanceFormula = `=B${rowNum}-L${rowNum}`;

      // Base Cumulative is the initial cumulative value from data (before today's entry)
      const initialCumulative = Number(row.cumulative) || 0;
      const initialToday = Number(row.today) || 0;
      const baseCumulative = initialCumulative - initialToday;

      return [
        row.description,                    // 0 - A
        Number(row.totalQuantity) || 0,     // 1 - B (Total Quantity)
        row.uom,                            // 2 - C
        balanceFormula,                     // 3 - D (Balance = B - L)
        row.basePlanStart,                  // 4 - E
        row.basePlanFinish,                 // 5 - F
        row.actualStart,                    // 6 - G
        row.actualFinish,                   // 7 - H
        row.forecastStart,                  // 8 - I
        row.forecastFinish,                 // 9 - J
        row.remarks,                        // 10 - K
        cumulativeFormula,                  // 11 - L (Cumulative = O + N)
        Number(row.yesterday) || 0,         // 12 - M (Yesterday)
        Number(row.today) || 0,             // 13 - N (Today - editable)
        baseCumulative                      // 14 - O (Base Cumulative - hidden, stores original)
      ];
    });
  }, []);

  // Initialize HyperFormula with data and read calculated values
  useEffect(() => {
    if (data.length === 0) return;

    // Create or update the sheet
    let sheetId = hfInstance.getSheetId(sheetNameRef);

    if (!hfInstance.doesSheetExist(sheetNameRef)) {
      hfInstance.addSheet(sheetNameRef);
      sheetId = hfInstance.getSheetId(sheetNameRef);
    }

    if (sheetId === undefined) return;

    // Build and set sheet data with formulas
    const sheetData = buildSheetData(data);
    hfInstance.setSheetContent(sheetId, sheetData);
    sheetInitializedRef.current = true;

    // Read calculated values and update data if needed
    let needsUpdate = false;
    const updatedData = data.map((row, rowIndex) => {
      const hfBalance = hfInstance.getCellValue({ sheet: sheetId!, row: rowIndex, col: COL.BALANCE });
      const hfCumulative = hfInstance.getCellValue({ sheet: sheetId!, row: rowIndex, col: COL.CUMULATIVE });

      const newBalance = typeof hfBalance === 'number' ? String(hfBalance) :
        (typeof hfBalance === 'string' && !hfBalance.startsWith('#')) ? hfBalance : row.balance;
      const newCumulative = typeof hfCumulative === 'number' ? String(hfCumulative) :
        (typeof hfCumulative === 'string' && !hfCumulative.startsWith('#')) ? hfCumulative : row.cumulative;

      if (newBalance !== row.balance || newCumulative !== row.cumulative) {
        needsUpdate = true;
      }

      return {
        ...row,
        balance: newBalance,
        cumulative: newCumulative
      };
    });

    // Only update if values changed (avoid infinite loop)
    if (needsUpdate && dataIdRef.current === 0) {
      dataIdRef.current++;
      setData(updatedData);
    }
  }, [data.length, hfInstance, sheetNameRef, buildSheetData, COL, setData]);

  // Convert data to the format expected by ExcelTable - memoized
  const columns = useMemo(() => [
    "Description",
    "Total Quantity",
    "UOM",
    "Balance",
    "Base Plan Start",
    "Base Plan Finish",
    "Actual Start",
    "Actual Finish",
    "Forecast Start",
    "Forecast Finish",
    "Remarks",
    "Cumulative",
    yesterday,
    today
  ], [yesterday, today]);

  // Define column widths for better alignment - memoized
  const columnWidths = useMemo(() => ({
    "Description": 150,
    "Total Quantity": 80,
    "UOM": 60,
    "Balance": 70,
    "Base Plan Start": 80,
    "Base Plan Finish": 80,
    "Actual Start": 80,
    "Actual Finish": 80,
    "Forecast Start": 80,
    "Forecast Finish": 80,
    "Remarks": 100,
    "Cumulative": 70,
    [yesterday]: 70,
    [today]: 70
  }), [yesterday, today]);

  // Define which columns are editable by the user - memoized
  const editableColumns = useMemo(() => [
    "Total Quantity",
    "UOM",
    "Actual Start",
    "Actual Finish",
    "Remarks",
    today // Today value is editable
  ], [today]);

  // Convert array of objects to array of arrays - memoized
  const tableData = useMemo(() => data.map(row => [
    row.description,
    row.totalQuantity,
    row.uom,
    row.balance,
    row.basePlanStart,
    row.basePlanFinish,
    row.actualStart,
    row.actualFinish,
    row.forecastStart,
    row.forecastFinish,
    row.remarks,
    row.cumulative,
    row.yesterday || "", // Number value for yesterday
    row.today || "" // Number value for today (editable)
  ]), [data]);

  // Handle data changes from ExcelTable - memoized
  const handleDataChange = useCallback((newData: any[][]) => {
    const sheetId = hfInstance.getSheetId(sheetNameRef);
    if (sheetId === undefined) {
      console.warn('HyperFormula sheet not found, skipping calculation update');
      return;
    }

    // Table data has 14 columns (columnIndex 0-13), mapped as:
    // 0: Description, 1: Total Quantity, 2: UOM, 3: Balance (auto), 
    // 4: Base Plan Start, 5: Base Plan Finish, 6: Actual Start, 7: Actual Finish,
    // 8: Forecast Start, 9: Forecast Finish, 10: Remarks, 11: Cumulative (auto),
    // 12: Yesterday, 13: Today

    const TABLE_COL = {
      TOTAL_QTY: 1,
      TODAY: 13,
      BALANCE: 3,
      CUMULATIVE: 11
    };

    // Batch updates to HyperFormula for performance
    hfInstance.batch(() => {
      newData.forEach((row, rowIndex) => {
        const totalQty = Number(row[TABLE_COL.TOTAL_QTY]) || 0;
        const todayVal = Number(row[TABLE_COL.TODAY]) || 0;

        // Update Total Quantity in HyperFormula (affects Balance)
        hfInstance.setCellContents(
          { sheet: sheetId, row: rowIndex, col: COL.TOTAL_QTY },
          totalQty
        );

        // Update Today in HyperFormula (affects Cumulative, which affects Balance)
        hfInstance.setCellContents(
          { sheet: sheetId, row: rowIndex, col: COL.TODAY },
          todayVal
        );
      });
    });

    // Read back calculated values and update state
    const updatedData = newData.map((row, rowIndex) => {
      // Get calculated Balance from HyperFormula
      const hfBalance = hfInstance.getCellValue({ sheet: sheetId, row: rowIndex, col: COL.BALANCE });
      let calculatedBalance = String(row[TABLE_COL.BALANCE] || "");
      if (typeof hfBalance === 'number') {
        calculatedBalance = String(hfBalance);
      } else if (typeof hfBalance === 'string' && !hfBalance.startsWith('#') && !hfBalance.startsWith('=')) {
        calculatedBalance = hfBalance;
      }

      // Get calculated Cumulative from HyperFormula
      const hfCumulative = hfInstance.getCellValue({ sheet: sheetId, row: rowIndex, col: COL.CUMULATIVE });
      let calculatedCumulative = String(row[TABLE_COL.CUMULATIVE] || "");
      if (typeof hfCumulative === 'number') {
        calculatedCumulative = String(hfCumulative);
      } else if (typeof hfCumulative === 'string' && !hfCumulative.startsWith('#') && !hfCumulative.startsWith('=')) {
        calculatedCumulative = hfCumulative;
      }

      return {
        slNo: "",
        description: row[0] || "",
        totalQuantity: String(row[TABLE_COL.TOTAL_QTY] || ""),
        uom: row[2] || "",
        balance: calculatedBalance,
        basePlanStart: row[4] || "",
        basePlanFinish: row[5] || "",
        actualStart: row[6] || "",
        actualFinish: row[7] || "",
        forecastStart: row[8] || "",
        forecastFinish: row[9] || "",
        remarks: row[10] || "",
        cumulative: calculatedCumulative,
        yesterday: row[12] || "",
        today: String(row[TABLE_COL.TODAY] || "")
      };
    });

    // Update dataIdRef to prevent re-initialization loop
    dataIdRef.current++;
    setData(updatedData);
  }, [setData, hfInstance, sheetNameRef, COL]);

  return (
    <div className="space-y-4 w-full">
      <div className="bg-muted p-3 rounded-lg border border-gray-200 dark:border-gray-700">
        <h3 className="font-bold text-base mb-1">Project Information</h3>
        <p className="font-medium text-sm">PLOT - A-06 135 MW - KHAVDA HYBRID SOLAR PHASE 3 (YEAR 2025-26)</p>
      </div>

      <StyledExcelTable
        title="DP Qty Table"
        columns={columns}
        data={tableData}
        onDataChange={handleDataChange}
        onSave={onSave}
        onSubmit={onSubmit}
        isReadOnly={isLocked}
        editableColumns={editableColumns}
        columnTypes={{
          "Description": "text",
          "Total Quantity": "number",
          "UOM": "text",
          "Balance": "number",
          "Base Plan Start": "date",
          "Base Plan Finish": "date",
          "Actual Start": "date",
          "Actual Finish": "date",
          "Forecast Start": "date",
          "Forecast Finish": "date",
          "Remarks": "text",
          "Cumulative": "number",
          [yesterday]: "number",
          [today]: "number"
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
          // First header row - main column names
          [
            { label: "Description", colSpan: 1 },
            { label: "Total Quantity", colSpan: 1 },
            { label: "UOM", colSpan: 1 },
            { label: "Balance", colSpan: 1 },
            { label: "Base Plan Start", colSpan: 1 },
            { label: "Base Plan Finish", colSpan: 1 },
            { label: "Actual Start", colSpan: 1 },
            { label: "Actual Finish", colSpan: 1 },
            { label: "Forecast Start", colSpan: 1 },
            { label: "Forecast Finish", colSpan: 1 },
            { label: "Remarks", colSpan: 1 },
            { label: "Cumulative", colSpan: 1 },
            { label: yesterday, colSpan: 1 },
            { label: today, colSpan: 1 }
          ]
        ]}
        status={status} // Pass status to StyledExcelTable
      />
    </div>
  );
});