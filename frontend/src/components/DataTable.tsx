import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Maximize, Minimize, Save, Filter } from "lucide-react";
import { StatusChip } from "./StatusChip";
import { ConfirmationModal } from "./ConfirmationModal";

interface DataTableProps {
  title: string;
  columns: string[];
  data: any[][];
  onDataChange: (newData: any[][]) => void;
  onSave?: () => void;
  onSubmit?: () => void;
  isReadOnly?: boolean;
  hideAddRow?: boolean;
  editableColumns?: string[];
  columnTypes?: Record<string, string>;
  columnWidths?: Record<string, number>;
  columnTextColors?: Record<string, string>;
  columnFontWeights?: Record<string, string>;
  status?: string;
  customHeaderActions?: React.ReactNode;
}

export const DataTable = ({
  title,
  columns,
  data,
  onDataChange,
  onSave,
  onSubmit,
  isReadOnly = false,
  hideAddRow = false,
  editableColumns = [],
  columnTypes = {},
  columnWidths = {},
  columnTextColors = {},
  columnFontWeights = {},
  status = "draft",
  customHeaderActions,
}: DataTableProps) => {
  const [activeCell, setActiveCell] = useState<{ row: number; col: number } | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isSubmitModalOpen, setIsSubmitModalOpen] = useState(false);

  const handleCellChange = (rowIndex: number, colIndex: number, value: string) => {
    const columnName = columns[colIndex];
    const canEdit = !isReadOnly || editableColumns.includes(columnName);
    if (!canEdit) return;

    const updated = [...data];
    updated[rowIndex] = [...updated[rowIndex]];
    updated[rowIndex][colIndex] = value;
    onDataChange(updated);
  };

  const toggleFullscreen = () => setIsFullscreen(!isFullscreen);

  // Check if a row is a category row (first cell empty, second cell has content)
  const isCategoryRow = (row: any[]) => {
    return row[0] === "" && row[1] !== "";
  };

  return (
    <div className={`rounded-lg border ${isFullscreen ? "fixed inset-0 z-50 bg-white dark:bg-gray-900" : ""}`}>
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b rounded-t-lg bg-gray-100 dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <div className="flex items-center space-x-2">
          <h3 className="font-semibold text-lg text-gray-900 dark:text-gray-100">
            {title}
          </h3>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            ({data.length} rows)
          </span>
          {status !== "draft" && <StatusChip status={status} />}
        </div>

        <div className="flex items-center space-x-2">
          {customHeaderActions ? (
            customHeaderActions
          ) : (
            <>
              {onSave && (
                <Button size="sm" variant="outline" onClick={onSave}>
                  <Save className="w-4 h-4 mr-1" />
                  Save
                </Button>
              )}
              {!isReadOnly && onSubmit && (
                <Button
                  size="sm"
                  onClick={() => setIsSubmitModalOpen(true)}
                >
                  Submit
                </Button>
              )}
            </>
          )}
          <Button size="sm" variant="outline" onClick={toggleFullscreen}>
            {isFullscreen ? (
              <Minimize className="w-4 h-4 mr-1" />
            ) : (
              <Maximize className="w-4 h-4 mr-1" />
            )}
            {isFullscreen ? "Exit" : "Fullscreen"}
          </Button>
        </div>
      </div>

      {/* Table Container */}
      <div className={`overflow-auto ${isFullscreen ? "h-[calc(100vh-120px)]" : "max-h-[600px]"}`}>
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((column, colIndex) => (
                <TableHead
                  key={colIndex}
                  style={{
                    backgroundColor: "#6699cc",
                    color: "#000000",
                    border: "1px solid #D4D4D4",
                    fontSize: "12px",
                    fontWeight: "500",
                    padding: "3px",
                    textAlign: "center",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    height: "32px",
                    minWidth: columnWidths[column] ? `${columnWidths[column]}px` : "90px",
                  }}
                >
                  {column}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((row, rowIndex) => {
              const isCatRow = isCategoryRow(row);
              return (
                <TableRow
                  key={rowIndex}
                  style={{
                    backgroundColor: isCatRow ? "#DFC57B" : rowIndex % 2 === 0 ? "#FFFFFF" : "#F8FBFF",
                  }}
                >
                  {row.map((cell, colIndex) => {
                    const columnName = columns[colIndex];
                    const type = columnTypes[columnName] || "text";
                    const isEditable = !isReadOnly || editableColumns.includes(columnName);
                    const isActive = activeCell?.row === rowIndex && activeCell?.col === colIndex;
                    
                    return (
                      <TableCell
                        key={colIndex}
                        style={{
                          border: "1px solid #D4D4D4",
                          height: "24px",
                          padding: "0",
                          fontSize: "8px",
                          position: "relative",
                          color: isCatRow ? "#000000" : undefined,
                          fontWeight: isCatRow ? "bold" : (columnFontWeights[columnName] || "normal"),
                        }}
                      >
                        {isCatRow && colIndex === 1 ? (
                          // Category row - only show content in the description column
                          <div className="w-full h-full px-2 flex items-center font-bold">
                            {cell}
                          </div>
                        ) : isEditable ? (
                          <Input
                            type={type}
                            value={cell || ""}
                            onChange={(e) => {
                              // Prevent negative values for number inputs
                              if (type === "number") {
                                const inputValue = e.target.value;
                                // Allow empty value or positive numbers only
                                if (inputValue === "" || (/^\d*\.?\d*$/.test(inputValue) && parseFloat(inputValue) >= 0)) {
                                  handleCellChange(rowIndex, colIndex, inputValue);
                                }
                                return;
                              }
                              handleCellChange(rowIndex, colIndex, e.target.value);
                            }}
                            onClick={() => setActiveCell({ row: rowIndex, col: colIndex })}
                            className="w-full h-full px-2 text-[8px] border-none focus-visible:ring-0 [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none [-moz-appearance:textfield]"
                            style={{
                              background: "transparent",
                              fontSize: "10px",
                              color: isCatRow ? "#000000" : (columnTextColors[columnName] || "#000000"),
                              fontWeight: isCatRow ? "bold" : (columnFontWeights[columnName] || "normal"),
                            }}
                          />
                        ) : (
                          // Read-only cell
                          <div 
                            className="w-full h-full px-2 flex items-center"
                            style={{
                              color: isCatRow ? "#000000" : (columnTextColors[columnName] || "#000000"),
                              fontWeight: isCatRow ? "bold" : (columnFontWeights[columnName] || "normal"),
                            }}
                          >
                            {cell}
                          </div>
                        )}
                      </TableCell>
                    );
                  })}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Status Bar */}
      {!isFullscreen && (
        <div className="flex justify-between px-3 py-1 text-xs border-t bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400">
          <div style={{ fontSize: "8px" }}>
            Ready | {data.length} rows × {columns.length} columns
          </div>
          <div style={{ fontSize: "10px" }}>Excel Style Sheet</div>
        </div>
      )}
      <ConfirmationModal 
        isOpen={isSubmitModalOpen}
        onClose={() => setIsSubmitModalOpen(false)}
        onConfirm={() => {
          setIsSubmitModalOpen(false);
          if (onSubmit) onSubmit();
        }}
        title="Submit Confirmation"
        description="Once submitted, editing is not possible. Proceed?"
        confirmLabel="Submit"
      />
    </div>
  );
};