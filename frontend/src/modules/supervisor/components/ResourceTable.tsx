import { useState, memo, useCallback, useMemo } from "react";
import { StyledExcelTable } from "@/components/StyledExcelTable";
import { Plus } from "lucide-react";

export interface ResourceData {
    id?: string;
    contractorIndex?: string;
    contractorName?: string;
    typeOfMachine: string;
    uom: string;
    remarks: string;
    isCategoryRow?: boolean;
    contractorId?: string;
    _cellStatuses?: any;
    [key: string]: any;
}

interface ResourceTableProps {
    data: ResourceData[];
    setData: React.Dispatch<React.SetStateAction<ResourceData[]>>;
    onSave?: (isAutoSave?: boolean) => void | Promise<void>;
    onSubmit?: () => void;
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

const MACHINERY_TYPES = [
    "DTH",
    "Augur",
    "Tractor Trolley",
    "Ajax",
    "Farana /Crane",
    "DG Set",
    "JCB/Excavator",
    "Manlifter",
    "Other resource"
];

export const ResourceTable = memo(({
    data,
    setData,
    onSave,
    onSubmit,
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

    const dateColumns = useMemo(() => {
        const dates: string[] = [];
        for (let i = 6; i >= 0; i--) {
            const d = new Date(today);
            d.setDate(d.getDate() - i);
            const day = String(d.getDate()).padStart(2, '0');
            const month = d.toLocaleString('en-US', { month: 'short' }); // e.g. Jun
            const year = String(d.getFullYear()).slice(-2); // e.g. 26
            dates.push(`${day}-${month}-${year}`);
        }
        return dates;
    }, [today]);

    const columns = useMemo(() => [
        "S.No",
        "Contractor Name",
        "Machinery",
        "UoM",
        ...dateColumns,
        "Remarks",
        "Actions"
    ], [dateColumns]);

    const columnWidths = useMemo(() => {
        const widths: Record<string, number> = {
            "S.No": 60,
            "Contractor Name": 200,
            "Machinery": 160,
            "UoM": 80,
            "Remarks": 200,
            "Actions": 80
        };
        dateColumns.forEach(date => {
            widths[date] = 100;
        });
        return widths;
    }, [dateColumns]);

    const editableColumns = useMemo(() => [
        "Contractor Name",
        ...dateColumns,
        "Remarks"
    ], [dateColumns]);

    const columnTypes = useMemo(() => {
        const types: Record<string, string> = {
            "S.No": "text",
            "Contractor Name": "alphabet",
            "Machinery": "text",
            "UoM": "text",
            "Remarks": "text"
        };
        dateColumns.forEach(date => {
            types[date] = "number";
        });
        return types;
    }, [dateColumns]);

    // Recalculate totals across all contractors for the "Total" block
    const calculateData = useCallback((currentData: ResourceData[]) => {
        // Group values by machine type for all contractor blocks
        const sums: Record<string, Record<string, number>> = {};
        MACHINERY_TYPES.forEach(m => {
            sums[m] = {};
            dateColumns.forEach(date => sums[m][date] = 0);
        });

        currentData.forEach(row => {
            if (!row.isCategoryRow && row.typeOfMachine) {
                dateColumns.forEach(date => {
                    const val = Number(row[date]) || 0;
                    if (sums[row.typeOfMachine]) {
                        sums[row.typeOfMachine][date] += val;
                    }
                });
            }
        });

        // Update the array
        return currentData.map(row => {
            if (row.isCategoryRow && sums[row.typeOfMachine]) {
                const updatedRow = { ...row };
                dateColumns.forEach(date => {
                    const sum = sums[row.typeOfMachine][date];
                    updatedRow[date] = sum === 0 ? "" : String(sum);
                });
                return updatedRow;
            }
            return row;
        });
    }, [dateColumns]);

    const tableData = useMemo(() => {
        const safeData = Array.isArray(data) ? data : [];
        return safeData.map(row => {
            const arr: any = [
                row.contractorIndex || "",
                row.contractorName || "",
                row.typeOfMachine || "",
                row.uom || "Nos"
            ];
            dateColumns.forEach(date => {
                arr.push(row[date] === undefined ? "" : row[date]);
            });
            arr.push(row.remarks || "");
            arr.push(""); // Actions

            if (row._cellStatuses) arr._cellStatuses = row._cellStatuses;
            return arr;
        });
    }, [data, dateColumns]);

    const rowStyles = useMemo(() => {
        const styles: Record<number, any> = {};
        const safeData = Array.isArray(data) ? data : [];
        safeData.forEach((row, idx) => {
            if (row.isCategoryRow) {
                styles[idx] = { backgroundColor: '#ffe6cc', fontWeight: 'bold' }; // Light orange from screenshot
            }

            // Determine if this is the start of a block
            if (idx === 0 && row.isCategoryRow) {
               // Total block start
               styles[idx] = {
                   ...styles[idx],
                   rowSpans: {
                       "S.No": MACHINERY_TYPES.length,
                       "Contractor Name": MACHINERY_TYPES.length
                   }
               };
            } else if (!row.isCategoryRow && row.contractorIndex) {
               // Contractor block start
               styles[idx] = {
                   ...styles[idx],
                   rowSpans: {
                       "S.No": MACHINERY_TYPES.length,
                       "Contractor Name": MACHINERY_TYPES.length
                   }
               };
            }
        });
        return styles;
    }, [data]);

    const handleDataChange = useCallback((newData: any[][]) => {
        const safeData = Array.isArray(data) ? data : [];
        const updatedRaw = safeData.map((row, idx) => {
            const newRowArr = newData[idx];
            if (!newRowArr) return row;

            // Only allow editing Contractor Name for the FIRST row of a contractor block (index 1)
            let newContractorName = row.contractorName;
            if (!row.isCategoryRow && row.contractorIndex) {
                newContractorName = newRowArr[1] || "";
            }

            const updatedRow: any = {
                ...row,
                contractorName: newContractorName,
                remarks: newRowArr[4 + dateColumns.length] === undefined || newRowArr[4 + dateColumns.length] === null ? "" : String(newRowArr[4 + dateColumns.length]),
                _cellStatuses: (newRowArr as any)._cellStatuses || row._cellStatuses
            };

            dateColumns.forEach((date, dateIdx) => {
                const val = newRowArr[4 + dateIdx];
                updatedRow[date] = val === undefined || val === null ? "" : String(val);
            });

            return updatedRow;
        });

        // Sync contractor names to all rows in that block
        const contractorNameMap: Record<string, string> = {};
        updatedRaw.forEach(r => {
            if (r.contractorIndex && r.contractorId && r.contractorName) {
                contractorNameMap[r.contractorId] = r.contractorName;
            }
        });
        
        const finalRaw = updatedRaw.map(r => {
            if (!r.isCategoryRow && r.contractorId && contractorNameMap[r.contractorId] !== undefined) {
                // Keep the value empty visually for subsequent rows, but technically we could store it
                // For UI matching, only the first row has it. We rely on contractorIndex to know if it's the first row.
            }
            return r;
        });

        const calculated = calculateData(finalRaw);
        setData(calculated);
    }, [data, setData, calculateData, dateColumns]);

    const handleAddContractor = () => {
        const safeData = Array.isArray(data) ? data : [];
        const contractorIds = safeData.map(d => d.contractorId).filter(Boolean);
        const uniqueIds = Array.from(new Set(contractorIds));
        const nextIdx = uniqueIds.length + 1;
        const newId = `c${nextIdx}`;
        
        const newRows = MACHINERY_TYPES.map((machine, i) => {
            const newRow: any = {
                id: `${newId}_${i}`,
                contractorIndex: i === 0 ? String(nextIdx) : "",
                contractorName: "",
                typeOfMachine: machine,
                uom: "Nos",
                remarks: "",
                isCategoryRow: false,
                contractorId: newId
            };
            dateColumns.forEach(date => {
                newRow[date] = "";
            });
            return newRow;
        });
        
        setData([...safeData, ...newRows]);
    };

    const handleDeleteContractor = useCallback((index: number) => {
        const safeData = Array.isArray(data) ? data : [];
        const rowToDelete = safeData[index];
        if (!rowToDelete || !rowToDelete.contractorId) return;

        const newData = safeData.filter(r => r.contractorId !== rowToDelete.contractorId);
        
        // Re-index remaining contractors
        let currentIdx = 1;
        let lastId = "";
        const finalData = newData.map(r => {
            if (r.isCategoryRow) return r;
            if (r.contractorId !== lastId) {
                lastId = r.contractorId!;
                // It's the first row of a new contractor block
                return { ...r, contractorIndex: String(currentIdx++) };
            }
            return { ...r, contractorIndex: "" };
        });

        const calculated = calculateData(finalData);
        setData(calculated);
    }, [data, setData, calculateData]);

    return (
        <div className="space-y-4 w-full h-full flex-1 min-h-0 flex flex-col">
            <div className="bg-muted p-3 rounded-lg border border-gray-200 dark:border-gray-700 flex justify-between items-center">
                <div>
                    <h3 className="font-bold text-base mb-1">Machinery Details</h3>
                    <p className="font-medium text-sm text-muted-foreground">
                        Track daily machinery availability per contractor
                    </p>
                </div>
                {!isLocked && (
                    <button
                        onClick={handleAddContractor}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
                    >
                        <Plus className="w-4 h-4" />
                        Add Contractor
                    </button>
                )}
            </div>

            <StyledExcelTable
                title="Machinery Table"
                columns={columns}
                data={tableData}
                onDataChange={handleDataChange}
                onSave={onSave}
                onSubmit={onSubmit}
                onPush={onPush}
                isReadOnly={isLocked}
                editableColumns={editableColumns}
                columnTypes={columnTypes as any}
                columnWidths={columnWidths}
                rowStyles={rowStyles}
                status={status}
                onExportAll={onExportAll}
                totalRows={totalRows}
                onFullscreenToggle={onFullscreenToggle}
                onReachEnd={onReachEnd}
                externalGlobalFilter={universalFilter}
                disableAutoHeaderColors={true}
                onRowDelete={isLocked ? undefined : handleDeleteContractor}
                rowIsDeletable={(idx) => {
                    const safeData = Array.isArray(data) ? data : [];
                    const row = safeData[idx];
                    // Only allow deleting on the first row of a contractor block
                    return !!row && !row.isCategoryRow && !!row.contractorIndex;
                }}
                rowIsEditable={(idx) => {
                    const safeData = Array.isArray(data) ? data : [];
                    const row = safeData[idx];
                    return !!row && !row.isCategoryRow;
                }}
            />
        </div>
    );
});

ResourceTable.displayName = 'ResourceTable';

