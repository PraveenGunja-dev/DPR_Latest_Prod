import { useState, memo, useCallback, useMemo } from "react";
import { StyledExcelTable } from "@/components/StyledExcelTable";
import { Plus } from "lucide-react";

export interface ResourceData {
    id?: string;
    contractorIndex?: string;
    contractorName?: string;
    typeOfMachine: string;
    uom: string;
    total: string;
    yesterday: string;
    today: string;
    remarks: string;
    isCategoryRow?: boolean;
    contractorId?: string;
    _cellStatuses?: any;
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

    const columns = useMemo(() => [
        "S.No",
        "Contractor Name",
        "Machinery",
        "UoM",
        "Total",
        yesterday,
        today,
        "Remarks"
    ], [yesterday, today]);

    const columnWidths = useMemo(() => ({
        "S.No": 60,
        "Contractor Name": 200,
        "Machinery": 160,
        "UoM": 80,
        "Total": 90,
        [yesterday]: 100,
        [today]: 100,
        "Remarks": 200
    }), [yesterday, today]);

    const editableColumns = useMemo(() => [
        "Contractor Name",
        yesterday,
        today,
        "Remarks"
    ], [yesterday, today]);

    const columnTypes = useMemo(() => ({
        "S.No": "text",
        "Contractor Name": "text",
        "Machinery": "text",
        "UoM": "text",
        "Total": "number",
        [yesterday]: "number",
        [today]: "number",
        "Remarks": "text"
    }), [yesterday, today]);

    // Recalculate totals across all contractors for the "Total" block
    const calculateData = useCallback((currentData: ResourceData[]) => {
        // Group values by machine type for all contractor blocks
        const sums: Record<string, { yesterday: number, today: number }> = {};
        MACHINERY_TYPES.forEach(m => sums[m] = { yesterday: 0, today: 0 });

        currentData.forEach(row => {
            if (!row.isCategoryRow && row.typeOfMachine) {
                const y = Number(row.yesterday) || 0;
                const t = Number(row.today) || 0;
                if (sums[row.typeOfMachine]) {
                    sums[row.typeOfMachine].yesterday += y;
                    sums[row.typeOfMachine].today += t;
                }
            }
        });

        // Update the array
        return currentData.map(row => {
            if (row.isCategoryRow && sums[row.typeOfMachine]) {
                const y = sums[row.typeOfMachine].yesterday;
                const t = sums[row.typeOfMachine].today;
                return {
                    ...row,
                    yesterday: String(y),
                    today: String(t),
                    total: String(y + t)
                };
            }
            // For contractor rows, just calc their own total
            if (!row.isCategoryRow) {
                const y = Number(row.yesterday) || 0;
                const t = Number(row.today) || 0;
                return {
                    ...row,
                    total: String(y + t)
                };
            }
            return row;
        });
    }, []);

    const tableData = useMemo(() => {
        const safeData = Array.isArray(data) ? data : [];
        return safeData.map(row => {
            const arr: any = [
                row.contractorIndex || "",
                row.contractorName || "",
                row.typeOfMachine || "",
                row.uom || "Nos",
                row.total || "0",
                row.yesterday || "0",
                row.today || "0",
                row.remarks || ""
            ];
            if (row._cellStatuses) arr._cellStatuses = row._cellStatuses;
            return arr;
        });
    }, [data]);

    const rowStyles = useMemo(() => {
        const styles: Record<number, any> = {};
        const safeData = Array.isArray(data) ? data : [];
        safeData.forEach((row, idx) => {
            if (row.isCategoryRow) {
                styles[idx] = { backgroundColor: '#ffe6cc', fontWeight: 'bold' }; // Light orange from screenshot
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

            return {
                ...row,
                contractorName: newContractorName,
                yesterday: String(newRowArr[5] || "0"),
                today: String(newRowArr[6] || "0"),
                remarks: newRowArr[7] || "",
                _cellStatuses: (newRowArr as any)._cellStatuses || row._cellStatuses
            };
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
    }, [data, setData, calculateData]);

    const handleAddContractor = () => {
        const safeData = Array.isArray(data) ? data : [];
        const contractorIds = safeData.map(d => d.contractorId).filter(Boolean);
        const uniqueIds = Array.from(new Set(contractorIds));
        const nextIdx = uniqueIds.length + 1;
        const newId = `c${nextIdx}`;
        
        const newRows = MACHINERY_TYPES.map((machine, i) => ({
            id: `${newId}_${i}`,
            contractorIndex: i === 0 ? String(nextIdx) : "",
            contractorName: "",
            typeOfMachine: machine,
            uom: "Nos",
            total: "0",
            yesterday: "0",
            today: "0",
            remarks: "",
            isCategoryRow: false,
            contractorId: newId
        }));
        
        setData([...safeData, ...newRows]);
    };

    return (
        <div className="space-y-4 w-full flex-1 min-h-0 flex flex-col">
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
