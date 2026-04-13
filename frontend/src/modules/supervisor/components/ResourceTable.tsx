import { useState, useEffect, memo, useCallback, useMemo, useRef } from "react";
import { StyledExcelTable } from "@/components/StyledExcelTable";
import { HyperFormula } from "hyperformula";

interface ResourceData {
    typeOfMachine: string;
    total: string;
    yesterday: string;
    today: string;
    remarks: string;
}

interface ResourceTableProps {
    data: ResourceData[];
    setData: React.Dispatch<React.SetStateAction<ResourceData[]>>;
    onSave: () => void;
    onSubmit?: () => void;
    yesterday: string;
    today: string;
    isLocked?: boolean;
    status?: string;
    onExportAll?: () => void;
    totalRows?: number;
    onFullscreenToggle?: (isFullscreen: boolean) => void;
    onReachEnd?: () => void;
    universalFilter?: string;
    onPush?: () => void;
}

// Note: Resource data should be fetched from P6 API via parent component
// No dummy/fallback data - if no resources exist in P6, table will be empty

export const ResourceTable = memo(({
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
    onFullscreenToggle,
    onReachEnd,
    universalFilter,
    onPush
}: ResourceTableProps) => {

    // HyperFormula instance
    const hfInstance = useMemo(() => {
        return HyperFormula.buildEmpty({
            licenseKey: 'gpl-v3',
        });
    }, []);

    const sheetNameRef = useMemo(() => 'ResourceSheet', []);
    const sheetInitializedRef = useRef(false);

    // Column indices for HyperFormula
    const COL = useMemo(() => ({
        TYPE_OF_MACHINE: 0,
        TOTAL: 1,
        YESTERDAY: 2,
        TODAY: 3,
        REMARKS: 4
    }), []);

    // Initialize HyperFormula with data
    useEffect(() => {
        if (!Array.isArray(data) || data.length === 0) return;

        let sheetId = hfInstance.getSheetId(sheetNameRef);

        if (!hfInstance.doesSheetExist(sheetNameRef)) {
            hfInstance.addSheet(sheetNameRef);
            sheetId = hfInstance.getSheetId(sheetNameRef);
        }

        if (sheetId === undefined) return;

        // Build sheet data with formulas
        const sheetData = data.map((row, rowIndex) => {
            const rowNum = rowIndex + 1;
            // Total = Yesterday + Today
            const totalFormula = `=C${rowNum}+D${rowNum}`;

            return [
                row.typeOfMachine,               // 0 - A (Type of Machine)
                totalFormula,                     // 1 - B (Total = C + D)
                Number(row.yesterday) || 0,       // 2 - C (Yesterday)
                Number(row.today) || 0,           // 3 - D (Today)
                row.remarks                       // 4 - E (Remarks)
            ];
        });

        hfInstance.setSheetContent(sheetId, sheetData);
        sheetInitializedRef.current = true;

        // Read calculated values and update data if needed
        let needsUpdate = false;
        const safeData = Array.isArray(data) ? data : [];
        const updatedData = safeData.map((row, rowIndex) => {
            const hfTotal = hfInstance.getCellValue({ sheet: sheetId!, row: rowIndex, col: COL.TOTAL });
            const newTotal = typeof hfTotal === 'number' ? String(hfTotal) : row.total;

            if (newTotal !== row.total) {
                needsUpdate = true;
            }

            return {
                ...row,
                total: newTotal
            };
        });

        if (needsUpdate) {
            setData(updatedData);
        }
    }, [data.length, hfInstance, sheetNameRef, COL, setData]);

    // Column definitions
    const columns = useMemo(() => [
        "Type of Machine",
        "Total",
        yesterday,
        today,
        "Remarks"
    ], [yesterday, today]);

    // Column widths
    const columnWidths = useMemo(() => ({
        "Type of Machine": 150,
        "Total": 100,
        [yesterday]: 100,
        [today]: 100,
        "Remarks": 200
    }), [yesterday, today]);

    // Editable columns (Yesterday, Today, Remarks - not Total since it's auto-calculated)
    const editableColumns = useMemo(() => [
        "Type of Machine",
        yesterday,
        today,
        "Remarks"
    ], [yesterday, today]);

    // Convert data to table format
    const tableData = useMemo(() => (Array.isArray(data) ? data : []).map(row => [
        row.typeOfMachine,
        row.total,
        row.yesterday || "0",
        row.today || "0",
        row.remarks || ""
    ]), [data]);

    // Handle data changes
    const handleDataChange = useCallback((newData: any[][]) => {
        const sheetId = hfInstance.getSheetId(sheetNameRef);
        if (sheetId === undefined) {
            console.warn('HyperFormula sheet not found');
            return;
        }

        // Table column indices
        const TABLE_COL = {
            TYPE_OF_MACHINE: 0,
            TOTAL: 1,
            YESTERDAY: 2,
            TODAY: 3,
            REMARKS: 4
        };

        // Batch updates to HyperFormula
        hfInstance.batch(() => {
            newData.forEach((row, rowIndex) => {
                const yesterdayVal = Number(row[TABLE_COL.YESTERDAY]) || 0;
                const todayVal = Number(row[TABLE_COL.TODAY]) || 0;

                hfInstance.setCellContents(
                    { sheet: sheetId, row: rowIndex, col: COL.YESTERDAY },
                    yesterdayVal
                );
                hfInstance.setCellContents(
                    { sheet: sheetId, row: rowIndex, col: COL.TODAY },
                    todayVal
                );
            });
        });

        // Read back calculated Total values
        const updatedData = newData.map((row, rowIndex) => {
            const hfTotal = hfInstance.getCellValue({ sheet: sheetId, row: rowIndex, col: COL.TOTAL });
            let calculatedTotal = String(row[TABLE_COL.TOTAL] || "0");

            if (typeof hfTotal === 'number') {
                calculatedTotal = String(hfTotal);
            } else if (typeof hfTotal === 'string' && !hfTotal.startsWith('#') && !hfTotal.startsWith('=')) {
                calculatedTotal = hfTotal;
            }

            return {
                typeOfMachine: row[TABLE_COL.TYPE_OF_MACHINE] || "",
                total: calculatedTotal,
                yesterday: String(row[TABLE_COL.YESTERDAY] || "0"),
                today: String(row[TABLE_COL.TODAY] || "0"),
                remarks: row[TABLE_COL.REMARKS] || ""
            };
        });

        setData(updatedData);
    }, [setData, hfInstance, sheetNameRef, COL]);

    return (
        <div className="space-y-4 w-full flex-1 min-h-0 flex flex-col">
            <div className="bg-muted p-3 rounded-lg border border-gray-200 dark:border-gray-700">
                <h3 className="font-bold text-base mb-1">Resource / Machine Details</h3>
                <p className="font-medium text-sm text-muted-foreground">
                    Track daily machine/resource availability and usage
                </p>
            </div>

            <StyledExcelTable
                title="Resource Table"
                columns={columns}
                data={tableData}
                onDataChange={handleDataChange}
                onSave={onSave}
                onSubmit={onSubmit}
                onPush={onPush}
                isReadOnly={isLocked}
                editableColumns={editableColumns}
                disableAutoHeaderColors={true}
                columnTypes={{
                    "Type of Machine": "text",
                    "Total": "number",
                    [yesterday]: "number",
                    [today]: "number",
                    "Remarks": "text"
                }}
                columnWidths={columnWidths}
                headerStructure={[
                    [
                        { label: "Type of Machine", colSpan: 1 },
                        { label: "Total", colSpan: 1 },
                        { label: yesterday, colSpan: 1 },
                        { label: today, colSpan: 1 },
                        { label: "Remarks", colSpan: 1 }
                    ]
                ]}
                status={status}
                onExportAll={onExportAll}
                totalRows={totalRows}
                onFullscreenToggle={onFullscreenToggle}
                onReachEnd={onReachEnd}
                externalGlobalFilter={universalFilter}
            />
        </div>
    );
});

ResourceTable.displayName = 'ResourceTable';
