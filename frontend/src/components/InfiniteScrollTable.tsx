import { useEffect } from "react";
import { StyledExcelTable } from "./StyledExcelTable";
import { useInfiniteScroll } from "@/hooks/useInfiniteScroll";

interface InfiniteScrollTableProps {
  title: string;
  columns: string[];
  data: any[][];
  onDataChange?: (data: any[][]) => void;
  onSave?: (isAuto?: boolean) => void | Promise<void>;
  onSubmit?: () => void;
  isReadOnly?: boolean;
  hideAddRow?: boolean;
  excludeColumns?: string[];
  editableColumns?: string[];
  columnTypes?: Record<string, string>;
  columnWidths?: Record<string, number>;
  columnTextColors?: Record<string, string>;
  columnFontWeights?: Record<string, string>;
  rowStyles?: Record<number, any>;
  headerStructure?: any[];
  status?: string;
  batchSize?: number; // Number of rows to load per batch
}

export const InfiniteScrollTable = ({
  title,
  columns,
  data,
  onDataChange,
  onSave,
  onSubmit,
  isReadOnly = false,
  hideAddRow = false,
  excludeColumns = [],
  editableColumns = [],
  columnTypes = {},
  columnWidths = {},
  columnTextColors = {},
  columnFontWeights = {},
  rowStyles = {},
  headerStructure = [],
  status = "draft",
  batchSize = 50, // Load 50 rows at a time by default
}: InfiniteScrollTableProps) => {
  const {
    visibleData,
    loadedCount: loadedRows,
    totalCount,
    hasMore,
    loadMore,
    containerRef
  } = useInfiniteScroll(data, { batchSize });
  
  // Manual load more function (can be triggered by a button)
  const handleLoadMore = () => {
    loadMore();
  };
  return (
    <div 
      ref={containerRef}
      style={{ 
        height: '100%', 
        maxHeight: 'calc(100vh - 200px)', 
        overflowY: 'auto',
        position: 'relative'
      }}
    >
      <StyledExcelTable
        title={`${title} (${loadedRows} of ${totalCount} rows)`}
        columns={columns}
        data={visibleData}
        onDataChange={onDataChange ? (updatedData) => {
          // Merge visible data changes back to full dataset
          const newData = [...data];
          // Update only the visible portion
          for (let i = 0; i < updatedData.length && i < loadedRows; i++) {
            newData[i] = updatedData[i];
          }
          onDataChange(newData);
        } : undefined}
        onSave={onSave}
        onSubmit={onSubmit}
        isReadOnly={isReadOnly}
        hideAddRow={hideAddRow}
        excludeColumns={excludeColumns}
        editableColumns={editableColumns}
        columnTypes={columnTypes}
        columnWidths={columnWidths}
        columnTextColors={columnTextColors}
        columnFontWeights={columnFontWeights}
        rowStyles={rowStyles}
        headerStructure={headerStructure}
        status={status}
      />
      
      {/* Loading indicator */}
      {hasMore && (
        <div style={{ 
          padding: '20px', 
          textAlign: 'center',
          backgroundColor: '#f5f5f5',
          borderTop: '1px solid #ddd'
        }}>
          <button 
            onClick={handleLoadMore}
            style={{
              padding: '8px 16px',
              backgroundColor: '#007bff',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            Load More Rows ({Math.min(batchSize, totalCount - loadedRows)} remaining)
          </button>
        </div>
      )}
      
      {/* End of data indicator */}
      {!hasMore && loadedRows > 0 && (
        <div style={{ 
          padding: '10px', 
          textAlign: 'center',
          backgroundColor: '#e9ecef',
          borderTop: '1px solid #ddd',
          fontSize: '14px'
        }}>
          All {totalCount} rows loaded
        </div>
      )}
    </div>
  );
};