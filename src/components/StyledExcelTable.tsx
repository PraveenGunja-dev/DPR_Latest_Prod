import { useState, useEffect, useContext } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Maximize, Minimize, Save } from "lucide-react";
import { StatusChip } from "./StatusChip"; // Import StatusChip

// Theme types
type ThemeMode = 'light' | 'dark';
type ThemeColor = 'blue' | 'purple' | 'pink' | 'green';

// Theme configuration - aligned with navbar theme
const themeConfig = {
  light: {
    headerBg: '#C7CCD1',
    groupHeaderBg: '#B2B2B5',
    headerText: '#000000',
    row1Bg: '#FFFFFF',
    row2Bg: '#F8FBFF',
    gridLines: '#D0D0D0',
    textColor: '#333333',
    shadow: '0 2px 4px rgba(0,0,0,0.1)',
    activeCellBg: '#E6F3FF',
    borderColor: '#999999',
    dividerColor: '#E0E0E0'
  },
  dark: {
    headerBg: '#2D2D2D',
    groupHeaderBg: '#3A3A3A',
    headerText: '#FFFFFF',
    row1Bg: '#1E1E1E',
    row2Bg: '#242424',
    gridLines: '#333333',
    textColor: '#E6E6E6',
    shadow: '0 2px 4px rgba(0,0,0,0.3)',
    activeCellBg: 'rgba(11,116,176,0.15)',
    borderColor: '#555555',
    dividerColor: '#444444'
  }
};

// Color variants - aligned with navbar theme
const colorVariants = {
  blue: '#0B74B0',
  purple: '#75479C',
  pink: '#BD3861',
  green: '#22A04B'
};

interface StyledExcelTableProps {
  title: string;
  columns: string[];
  data: any[];
  onDataChange: (newData: any[]) => void;
  onSave?: () => void;
  onSubmit?: () => void;
  isReadOnly?: boolean;
  hideAddRow?: boolean;
  excludeColumns?: string[];
  editableColumns?: string[]; // Columns that can be edited even when isReadOnly is true
  columnTypes?: Record<string, 'text' | 'number' | 'date'>; // Input types for specific columns
  columnWidths?: Record<string, number>; // Custom widths for specific columns
  status?: string; // Add status prop
}

export const StyledExcelTable = ({ 
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
  status = 'draft' // Add status prop with default
}: StyledExcelTableProps) => {
  // Filter out excluded columns
  const filteredColumns = columns.filter(column => !excludeColumns.includes(column));
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [activeCell, setActiveCell] = useState<{row: number, col: number} | null>(null);
  
  // Get theme from context or default to light
  const [themeMode, setThemeMode] = useState<ThemeMode>('light');
  const themeColor: ThemeColor = 'blue';
  
  // Detect theme changes
  useEffect(() => {
    // Check for theme class on document body
    const updateTheme = () => {
      const isDark = document.documentElement.classList.contains('dark');
      setThemeMode(isDark ? 'dark' : 'light');
    };
    
    // Initial theme detection
    updateTheme();
    
    // Watch for theme changes
    const observer = new MutationObserver(updateTheme);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class']
    });
    
    return () => observer.disconnect();
  }, []);
  
  // Get current theme
  const currentTheme = themeConfig[themeMode];
  const currentColor = colorVariants[themeColor];

  // Apply theme styles to document for dynamic CSS variables
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--excel-header-bg', currentTheme.headerBg);
    root.style.setProperty('--excel-group-header-bg', currentTheme.groupHeaderBg);
    root.style.setProperty('--excel-header-text', currentTheme.headerText);
    root.style.setProperty('--excel-row1-bg', currentTheme.row1Bg);
    root.style.setProperty('--excel-row2-bg', currentTheme.row2Bg);
    root.style.setProperty('--excel-grid-lines', currentTheme.gridLines);
    root.style.setProperty('--excel-text-color', currentTheme.textColor);
    root.style.setProperty('--excel-shadow', currentTheme.shadow);
    root.style.setProperty('--excel-active-cell-bg', currentTheme.activeCellBg);
    root.style.setProperty('--excel-border-color', currentTheme.borderColor);
    root.style.setProperty('--excel-divider-color', currentTheme.dividerColor);
    root.style.setProperty('--excel-theme-color', currentColor);
  }, [themeMode]);

  const handleCellChange = (rowIndex: number, colIndex: number, value: string) => {
    // Allow editing if not readonly or if the column is in the editableColumns list
    const columnName = columns[colIndex];
    const canEdit = !isReadOnly || editableColumns.includes(columnName);
    
    if (!canEdit) return;
    
    const newData = [...data];
    newData[rowIndex] = [...newData[rowIndex]];
    newData[rowIndex][colIndex] = value;
    onDataChange(newData);
  };

  const handleAddRow = () => {
    if (isReadOnly) return;
    
    const newRow = Array(columns.length).fill("");
    onDataChange([...data, newRow]);
  };

  const handleDeleteRow = (rowIndex: number) => {
    if (isReadOnly) return;
    
    const newData = [...data];
    newData.splice(rowIndex, 1);
    onDataChange(newData);
  };

  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
  };

  // Get header styling
  const getHeaderStyling = (columnName: string) => {
    // Check if there's a custom width for this column
    const customWidth = columnWidths[columnName];
    
    return {
      backgroundColor: 'var(--excel-header-bg)',
      color: 'var(--excel-header-text)',
      borderBottom: '1px dashed var(--excel-border-color)',
      borderRight: '1px solid var(--excel-divider-color)',
      fontSize: '13px',
      fontWeight: 'bold',
      textAlign: 'center' as const,
      padding: '6px 8px',
      minWidth: customWidth ? `${customWidth}px` : '100px',
      width: customWidth ? `${customWidth}px` : 'auto'
    };
  };

  // Get cell styling
  const getCellStyling = (rowIndex: number, colIndex: number, columnName: string) => {
    const isEvenRow = rowIndex % 2 === 0;
    const isActive = activeCell?.row === rowIndex && activeCell?.col === colIndex;
    
    // Check if there's a custom width for this column
    const customWidth = columnWidths[columnName];
    
    // Determine text alignment based on column type
    let textAlign: 'left' | 'center' | 'right' = 'left';
    if (columnTypes[columnName] === 'number') {
      textAlign = 'right';
    } else if (['date', 'boolean'].includes(columnTypes[columnName])) {
      textAlign = 'center';
    }
    
    let bgColor = isEvenRow ? 'var(--excel-row1-bg)' : 'var(--excel-row2-bg)';
    if (isActive) {
      bgColor = 'var(--excel-active-cell-bg)';
    }
    
    return {
      backgroundColor: bgColor,
      color: 'var(--excel-text-color)',
      borderRight: '1px solid var(--excel-grid-lines)',
      borderTop: '1px solid var(--excel-grid-lines)',
      borderBottom: '1px solid var(--excel-grid-lines)',
      fontSize: '12px',
      padding: '4px 6px',
      minWidth: customWidth ? `${customWidth}px` : '100px',
      width: customWidth ? `${customWidth}px` : 'auto',
      whiteSpace: 'nowrap' as const,
      overflow: 'hidden' as const,
      textOverflow: 'ellipsis' as const,
      textAlign: textAlign,
      boxSizing: 'border-box' as const
    };
  };

  return (
    <div className={`border rounded-lg overflow-hidden shadow-sm ${isFullscreen ? 'fixed inset-0 z-50 m-0 rounded-none' : ''}`} 
         style={{ 
           backgroundColor: themeMode === 'light' ? '#FFFFFF' : '#1E1E1E',
           boxShadow: isFullscreen ? 'none' : 'var(--excel-shadow)'
         }}>
      {/* Header - hidden in fullscreen mode */}
      <div className={`flex items-center justify-between px-4 py-3 border-b ${isFullscreen ? 'hidden' : ''}`} 
           style={{ 
             backgroundColor: themeMode === 'light' ? '#F8F9FA' : '#2D2D2D',
             borderBottom: '1px solid var(--excel-grid-lines)'
           }}>
        <div className="flex items-center space-x-2">
          <h3 className="font-semibold text-lg" style={{ color: currentTheme.textColor }}>{title}</h3>
          <span className="text-sm" style={{ color: themeMode === 'light' ? '#6C757D' : '#ADB5BD' }}>({data.length} rows)</span>
        </div>
        
        {/* Simplified toolbar without theme selection */}
        <div className="flex items-center space-x-2">
          {/* Status chip - show when status is not draft */}
          {status && status !== 'draft' && (
            <StatusChip status={status} />
          )}
          
          {/* Save button - always visible when onSave is provided */}
          {onSave && (
            <Button 
              size="sm" 
              onClick={onSave} 
              variant="outline"
              className="flex items-center"
              style={{
                borderColor: currentColor,
                color: currentColor,
                backgroundColor: 'transparent'
              }}
              onMouseOver={(e) => e.currentTarget.style.backgroundColor = `${currentColor}20`}
              onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
            >
              <Save className="w-4 h-4 mr-1" />
              Save
            </Button>
          )}
          
          {/* Fullscreen toggle button */}
          <Button 
            size="sm" 
            onClick={toggleFullscreen}
            variant="outline"
            className="flex items-center"
            style={{
              borderColor: themeMode === 'light' ? '#D0D0D0' : '#444444',
              color: currentTheme.textColor,
              backgroundColor: 'transparent'
            }}
            onMouseOver={(e) => e.currentTarget.style.backgroundColor = themeMode === 'light' ? '#F0F0F0' : '#333333'}
            onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
          >
            {isFullscreen ? (
              <>
                <Minimize className="w-4 h-4 mr-1" />
                Exit Fullscreen
              </>
            ) : (
              <>
                <Maximize className="w-4 h-4 mr-1" />
                Fullscreen
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Fullscreen header when in fullscreen mode */}
      {isFullscreen && (
        <div className="p-4 border-b" style={{ 
          backgroundColor: themeMode === 'light' ? '#FFFFFF' : '#1E1E1E',
          borderBottom: '1px solid var(--excel-grid-lines)'
        }}>
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-xl font-bold" style={{ color: currentTheme.textColor }}>{title} - Fullscreen View</h2>
              <p className="text-sm" style={{ color: themeMode === 'light' ? '#6C757D' : '#ADB5BD' }}>{data.length} rows × {columns.length} columns</p>
            </div>
            <div className="flex space-x-2">
              {/* Save button in fullscreen mode - always visible when onSave is provided */}
              {onSave && (
                <Button 
                  size="sm" 
                  onClick={onSave} 
                  variant="outline"
                  className="flex items-center"
                  style={{
                    borderColor: currentColor,
                    color: currentColor,
                    backgroundColor: 'transparent'
                  }}
                  onMouseOver={(e) => e.currentTarget.style.backgroundColor = `${currentColor}20`}
                  onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                  <Save className="w-4 h-4 mr-1" />
                  Save
                </Button>
              )}
              {!isReadOnly && onSubmit && (
                <Button 
                  size="sm" 
                  onClick={() => {
                    const confirmed = window.confirm("Check once - if submitted, editing is not possible. Do you want to proceed?");
                    if (confirmed) {
                      onSubmit();
                    }
                  }}
                  style={{
                    backgroundColor: currentColor,
                    color: '#FFFFFF'
                  }}
                  onMouseOver={(e) => {
                    const darkerColor = currentColor === '#0B74B0' ? '#095a8a' : 
                                     currentColor === '#75479C' ? '#5d387a' : 
                                     currentColor === '#BD3861' ? '#9a2d4e' : '#1b803d';
                    e.currentTarget.style.backgroundColor = darkerColor;
                  }}
                  onMouseOut={(e) => e.currentTarget.style.backgroundColor = currentColor}
                >
                  Submit
                </Button>
              )}
              <Button 
                size="sm" 
                variant="outline" 
                onClick={toggleFullscreen}
                style={{
                  borderColor: themeMode === 'light' ? '#D0D0D0' : '#444444',
                  color: currentTheme.textColor,
                  backgroundColor: 'transparent'
                }}
              >
                <Minimize className="w-4 h-4 mr-1" />
                Exit Fullscreen
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      <div className={`overflow-auto ${isFullscreen ? 'h-[calc(100vh-140px)]' : 'max-h-[600px]'}`}>
        <table className="w-full border-collapse" style={{ tableLayout: 'fixed' }}>
          <thead>
            <tr style={{ 
              backgroundColor: 'var(--excel-header-bg)',
              boxShadow: '0 2px 2px rgba(0,0,0,0.05)'
            }}>
              {filteredColumns.map((column, index) => (
                <th 
                  key={index} 
                  style={getHeaderStyling(column)}
                >
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row, rowIndex) => (
              <tr 
                key={rowIndex} 
                style={{
                  backgroundColor: rowIndex % 2 === 0 ? 'var(--excel-row1-bg)' : 'var(--excel-row2-bg)'
                }}
              >
                {filteredColumns.map((_, filteredColIndex) => {
                  // Find the original column index to map to the correct data
                  const originalColIndex = columns.findIndex(col => col === filteredColumns[filteredColIndex]);
                  const isActive = activeCell?.row === rowIndex && activeCell?.col === originalColIndex;
                  
                  return (
                    <td 
                      key={filteredColIndex} 
                      style={getCellStyling(rowIndex, originalColIndex, filteredColumns[filteredColIndex])}
                      onClick={() => setActiveCell({row: rowIndex, col: originalColIndex})}
                    >
                      <Input
                        value={row[originalColIndex] || ""}
                        onChange={(e) => handleCellChange(rowIndex, originalColIndex, e.target.value)}
                        className="border-0 rounded-none focus-visible:ring-0 h-6 w-full px-1"
                        readOnly={!editableColumns.includes(columns[originalColIndex]) && isReadOnly}
                        type={columnTypes[columns[originalColIndex]] || 'text'}
                        style={{
                          backgroundColor: 'transparent',
                          color: 'var(--excel-text-color)',
                          fontSize: '12px',
                          border: isActive ? `2px solid var(--excel-theme-color)` : 'none',
                          boxShadow: isActive ? `inset 0 0 0 1px var(--excel-theme-color)` : 'none',
                          padding: '2px 4px',
                          textAlign: getCellStyling(rowIndex, originalColIndex, filteredColumns[filteredColIndex]).textAlign,
                          width: '100%',
                          boxSizing: 'border-box'
                        }}
                        onFocus={() => setActiveCell({row: rowIndex, col: originalColIndex})}
                        onBlur={() => setActiveCell(null)}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Status bar - hidden in fullscreen mode */}
      <div className={`border-t px-4 py-1 flex justify-between text-xs ${isFullscreen ? 'hidden' : ''}`} 
           style={{ 
             backgroundColor: themeMode === 'light' ? '#F8F9FA' : '#2D2D2D',
             borderTop: '1px solid var(--excel-grid-lines)',
             color: themeMode === 'light' ? '#6C757D' : '#ADB5BD'
           }}>
        <div>
          Ready | {data.length} rows × {columns.length} columns
        </div>
        <div>
          Adani Workflow Excel Sheet
        </div>
      </div>
    </div>
  );
};