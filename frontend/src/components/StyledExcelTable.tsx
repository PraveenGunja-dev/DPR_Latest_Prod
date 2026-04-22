import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { getColumnPreferences, saveColumnPreferences } from "@/services/columnPreferencesService";
import React from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Maximize, Minimize, Save, Search, Download, FileSpreadsheet, Columns, AlertCircle, RefreshCw } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuCheckboxItem,
} from "@/components/ui/dropdown-menu";
import { StatusChip } from "./StatusChip";
import { indianDateFormat } from "@/services/dprService";
import { useAuth } from "@/modules/auth/contexts/AuthContext";
import { ConfirmationModal } from "./ConfirmationModal";
import "@/index.css";

export interface StyledExcelTableProps {
  title?: string;
  columns?: any[];
  data?: any[];
  onDataChange?: (data: any[]) => void;
  onSave?: () => void;
  onSubmit?: () => void;
  isReadOnly?: boolean;
  hideAddRow?: boolean;
  excludeColumns?: string[];
  editableColumns?: string[];
  columnTypes?: Record<string, any>;
  columnWidths?: Record<string, number>;
  columnTextColors?: Record<string, string>;
  columnFontWeights?: Record<string, string>;
  rowStyles?: Record<number, any>;
  cellTextColors?: Record<number, Record<string, string>>;
  headerStructure?: any[];
  status?: string;
  onExportAll?: () => void;
  filters?: Record<string, string>;
  totalRows?: number;
  onFullscreenToggle?: (isFullscreen: boolean) => void;
  onReachEnd?: () => void;
  externalGlobalFilter?: string;
  projectId?: string | number;
  sheetType?: string;
  disableAutoHeaderColors?: boolean;
  columnOptions?: Record<string, string[]>;
  onPush?: () => void;
  hideRejection?: boolean;
  fixedColumnsCount?: number;
}

export const StyledExcelTable = ({
  title,
  columns,
  data,
  onDataChange = () => { },
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
  rowStyles = {}, // New prop for row styles
  cellTextColors = {}, // New prop for specific cell text colors
  headerStructure = [], // New prop for multi-row headers
  status = "draft",
  onExportAll, // Callback for exporting all project sheets
  filters = {}, // Added missing filters prop
  totalRows, // Optional: Real server-side total count
  onFullscreenToggle, // New callback for fullscreen toggle
  onReachEnd, // New callback for infinite scroll loading
  externalGlobalFilter = "", // Filter coming from parent
  projectId, // Project ID for saving column preferences
  sheetType, // Sheet type for saving column preferences
  disableAutoHeaderColors = false, // New prop to disable automatic header coloring
  columnOptions = {}, // New prop for dropdown options
  onPush,
  hideRejection = true,
  fixedColumnsCount = 0, // Number of columns to freeze on the left
}: StyledExcelTableProps) => {
  const [isSubmitModalOpen, setIsSubmitModalOpen] = useState(false);
  const [isPushModalOpen, setIsPushModalOpen] = useState(false);
  const { user } = useAuth();
  const currentUserRole = user?.role || user?.Role || "";
  const roleLower = String(currentUserRole).toLowerCase().trim();

  const safeData = Array.isArray(data) ? data : [];
  const safeColumns = Array.isArray(columns) ? columns : [];
  const safeExclude = Array.isArray(excludeColumns) ? excludeColumns : [];
  const safeFilters = filters || {};

  const [activeCell, setActiveCell] = useState(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [filtersState, setFiltersState] = useState(safeFilters); // State for column filters
  const [showFilters, setShowFilters] = useState(false); // Toggle filter row visibility
  const [isMobile, setIsMobile] = useState(false); // Detect mobile/tablet screen
  const [hiddenColumns, setHiddenColumns] = useState<string[]>([]); // New state for multi select columns
  const [prefsLoaded, setPrefsLoaded] = useState(false); // Track if preferences have been loaded

  // Load saved column preferences on mount (per project + sheet)
  useEffect(() => {
    if (!projectId || !sheetType) {
      setPrefsLoaded(true);
      return;
    }
    let cancelled = false;
    const loadPrefs = async () => {
      try {
        const prefs = await getColumnPreferences(projectId, sheetType);
        if (!cancelled && prefs.visibleColumns) {
          setHiddenColumns(prefs.visibleColumns);
        }
      } catch (e) {
        console.error('[StyledExcelTable] Failed to load column prefs:', e);
      } finally {
        if (!cancelled) setPrefsLoaded(true);
      }
    };
    setPrefsLoaded(false);
    loadPrefs();
    return () => { cancelled = true; };
  }, [projectId, sheetType]);

  const [colWidths, setColWidths] = useState(columnWidths || {});
  // Track edited cells locally
  const [editedCells, setEditedCells] = useState<Record<string, boolean>>({});
  // Filter for showing ONLY modified rows (Site PM review tool)
  const [showOnlyModified, setShowOnlyModified] = useState(false);

  // Save column preferences with debounce when user changes them
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!projectId || !sheetType || !prefsLoaded) return;
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      saveColumnPreferences(projectId, sheetType, hiddenColumns).catch(() => { });
    }, 800);
    return () => { if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current); };
  }, [hiddenColumns, projectId, sheetType, prefsLoaded]);

  const filteredColumns = safeColumns.filter((c) => !safeExclude.includes(c) && !hiddenColumns.includes(c));

  // Update colWidths when props change, but preserve user modifications if possible? 
  // For now, simpler to jus sync or initialize. Let's sync if keys are missing vs new.
  // Actually, to respect manual resize, we shouldn't overwrite blindly.
  // But if parent changes widths, maybe we should?
  // Let's assume parent prop is initial config.
  useEffect(() => {
    setColWidths(prev => {
      // Merge prop widths into state, prioritizing prev state if it exists (so we don't lose resize)
      const newWidths = { ...columnWidths, ...prev };

      // Prevent infinite render loop if the parent passes a new object reference `{}` every time
      // Check if newWidths is actually different from prev before returning the new object
      const isDifferent = Object.keys(newWidths).some(key => newWidths[key] !== prev[key]) ||
        Object.keys(prev).length !== Object.keys(newWidths).length;

      if (isDifferent) {
        return newWidths;
      }
      return prev;
    });
  }, [columnWidths]);

  const resizingRef = useRef<{ colName: string, startX: number, startWidth: number } | null>(null);
  const dataSnapshotRef = useRef<any[]>([]);

  // Reset snapshot when project or sheet target changes
  const prevProjectSheetRef = useRef<string>('');
  useEffect(() => {
    const key = `${projectId}_${sheetType}`;
    if (prevProjectSheetRef.current && prevProjectSheetRef.current !== key) {
      dataSnapshotRef.current = [];
      setEditedCells({}); // Only clear when project/sheet ACTUALLY changes
    }
    prevProjectSheetRef.current = key;
  }, [projectId, sheetType]);

  // Capture initial snapshot only once per unique project/sheet target
  useEffect(() => {
    if (data && data.length > 0 && dataSnapshotRef.current.length === 0) {
      dataSnapshotRef.current = JSON.parse(JSON.stringify(data));
    }
  }, [data, projectId, sheetType]);

  const handleResizeMove = useCallback((e: MouseEvent) => {
    if (!resizingRef.current) return;
    const { colName, startX, startWidth } = resizingRef.current;
    const diff = e.clientX - startX;
    const newWidth = Math.max(50, startWidth + diff); // Min width 50px

    setColWidths((prev) => ({
      ...prev,
      [colName]: newWidth,
    }));
  }, []);

  const handleResizeEnd = useCallback(() => {
    resizingRef.current = null;
    document.removeEventListener("mousemove", handleResizeMove);
    document.removeEventListener("mouseup", handleResizeEnd);
    document.body.style.cursor = "";
    document.body.style.userSelect = ""; // Re-enable selection
  }, [handleResizeMove]);

  const handleResizeStart = (e: React.MouseEvent, colName: string) => {
    e.preventDefault();
    e.stopPropagation();
    const currentWidth = colWidths[colName] || 100;
    resizingRef.current = {
      colName,
      startX: e.clientX,
      startWidth: Number(currentWidth),
    };

    document.addEventListener("mousemove", handleResizeMove);
    document.addEventListener("mouseup", handleResizeEnd);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none"; // Disable text selection while dragging
  };

  // Detect mobile/tablet screen size (< 1024px)
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 1024);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Excel Themes
  const excelThemes = {
    light: {
      bg: "#FFFFFF",
      headerBg: "#F3F3F3",
      headerText: "#000",
      text: "#000",
      grid: "#D4D4D4",
      activeBorder: "#217346",
      hoverBg: "#EAF2FB",
      statusBg: "#F4F4F4",
      filterBg: "#E6E6E6",
    },
    dark: {
      bg: "#1E1E1E",
      headerBg: "#2B2B2B",
      headerText: "#FFFFFF",
      text: "#E8E8E8",
      grid: "#3A3A3A",
      activeBorder: "#2EA3F2",
      hoverBg: "#2E3238",
      statusBg: "#252525",
      filterBg: "#333333",
    },
  };

  // Detect system/UI theme
  const [themeMode, setThemeMode] = useState("light");
  const T = themeMode === "dark" ? excelThemes.dark : excelThemes.light;

  useEffect(() => {
    const updateTheme = () => {
      const isDark = document.documentElement.classList.contains("dark");
      setThemeMode(isDark ? "dark" : "light");
    };

    updateTheme();

    const observer = new MutationObserver(updateTheme);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    return () => observer.disconnect();
  }, []);


  // Pre-calculate which rows should be visible in "Changed Only" mode
  // A category should only show if at least one of its children has edits.
  const visibleIndicesForChanges = useMemo(() => {
    if (!showOnlyModified) return null;
    const visible = new Set<number>();
    const safeDataArr = Array.isArray(safeData) ? safeData : [];

    // 1. Mark rows with direct edits
    const hasDirectEdit = safeDataArr.map((row, idx) => {
      const hasStatus = (row as any)?._cellStatuses && Object.keys((row as any)._cellStatuses).length > 0;
      const hasLegacy = Object.keys(editedCells).some(k => k.startsWith(`${idx}-`));
      return hasStatus || hasLegacy;
    });

    // 2. Propagation: Show categories only if they have edited children
    let lastCategoryIdx = -1;
    hasDirectEdit.forEach((hasEdit, idx) => {
      const rowStyle = rowStyles[idx] || {};
      const isCat = rowStyle.isCategoryRow || (rowStyle.fontWeight === 'bold' && !rowStyle.isTotalRow);

      if (isCat) {
        lastCategoryIdx = idx;
      } else {
        if (hasEdit) {
          visible.add(idx);
          if (lastCategoryIdx !== -1) visible.add(lastCategoryIdx);
        }
      }
      // Always show total rows for context
      if (rowStyle.isTotalRow) visible.add(idx);
    });

    return visible;
  }, [safeData, editedCells, showOnlyModified, rowStyles]);

  // Filter the data based on active filters, preserving the original data index
  const filteredDataWithIndices = useMemo(() => {
    return (safeData || []).map((row, index) => ({ row, index })).filter(({ row, index }) => {
      if (!Array.isArray(row)) return false;

      // Site PM / Reviewer Tool: Show only modified rows + relevant categories
      if (showOnlyModified && visibleIndicesForChanges) {
        if (!visibleIndicesForChanges.has(index)) {
          return false;
        }
      }

      // Apply Global Search ONLY to the first column (usually Activity ID)
      // BUT preserve category/heading rows (they have empty Activity ID but should always show)
      if (externalGlobalFilter) {
        const rowStyle = rowStyles[index] || {};
        const isHeader = rowStyle.isTotalRow || rowStyle.isCategoryRow || rowStyle.fontWeight === 'bold';
        if (!isHeader) {
          const searchLower = externalGlobalFilter.toLowerCase();
          const firstColValue = row[0]?.toString().toLowerCase() || "";
          if (!firstColValue.includes(searchLower)) {
            return false;
          }
        }
      }

      return filteredColumns.every(col => {
        const filterValue = filtersState[col];
        if (!filterValue) return true; // No filter for this column

        const colIndex = safeColumns.indexOf(col);
        const cellValue = row[colIndex]?.toString().toLowerCase() || "";
        return cellValue.includes(filterValue.toLowerCase());
      });
    });
  }, [safeData, externalGlobalFilter, filtersState, filteredColumns, safeColumns, showOnlyModified, editedCells, rowStyles]);

  // Compatibility for older parts of the code using filteredData
  const filteredData = useMemo(() => filteredDataWithIndices.map(f => f.row), [filteredDataWithIndices]);

  // Calculate sticky left offsets for fixed columns
  const stickyLeftOffsets = useMemo(() => {
    if (fixedColumnsCount <= 0) return {};
    const offsets: Record<string, number> = {};
    let currentOffset = 0;

    // We only calculate offsets for columns that are actually visible
    filteredColumns.forEach((col, idx) => {
      if (idx < fixedColumnsCount) {
        offsets[col] = currentOffset;
        // Use prioritized width from state or props
        const width = colWidths[col] || columnWidths[col] || 100;
        currentOffset += Number(width);
      }
    });
    return offsets;
  }, [fixedColumnsCount, filteredColumns, colWidths, columnWidths]);

  // Progressive Rendering State - Start with initial chunk
  const [renderCount, setRenderCount] = useState(50);
  const observerTarget = useRef<HTMLTableRowElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          const dataLen = (filteredData || []).length;
          setRenderCount((prev) => {
            if (prev < dataLen) return Math.min(prev + 100, dataLen);
            if (onReachEnd) onReachEnd();
            return prev;
          });
        }
      },
      { root: null, rootMargin: "400px", threshold: 0 }
    );
    if (observerTarget.current) observer.observe(observerTarget.current);
    return () => observer.disconnect();
  }, [filteredData, onReachEnd, renderCount]);

  // Reset render count only when filters change or significantly different data arrives
  // NOT on every character edit (which changes data reference)
  const prevDataLengthRef = useRef(safeData.length);
  useEffect(() => {
    const dataLengthChanged = safeData.length !== prevDataLengthRef.current;
    if (dataLengthChanged) {
      setRenderCount(50);
      prevDataLengthRef.current = safeData.length;
    }
  }, [safeData.length]);

  useEffect(() => {
    setRenderCount(50);
  }, [filtersState, externalGlobalFilter]);

  // Frontend infinite scroll logic - append rows smoothly when scrolling
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const dataLen = (filteredData || []).length;
    const bottom = e.currentTarget.scrollHeight - e.currentTarget.scrollTop <= e.currentTarget.clientHeight + 800; // 800px threshold
    if (bottom && renderCount < dataLen) {
      setRenderCount(prev => Math.min(prev + 100, dataLen));
    } else if (bottom && renderCount >= dataLen && onReachEnd) {
      // If we've shown all local data and are still at the bottom, 
      // trigger the parent to fetch more data from the API
      onReachEnd();
    }
  }, [renderCount, filteredData, onReachEnd]);

  const handleCellChange = (row, col, value) => {
    const cName = columns[col];

    // Check global lock first
    if (isReadOnly) {
      // Check if this column is explicitly allowed even in read-only mode (e.g. for historical edits)
      if (!editableColumns.includes(cName)) return;
    }

    // Check strict column whitelist
    if (editableColumns.length > 0 && !editableColumns.includes(cName)) return;

    const currentValue = data[row]?.[col];
    if (currentValue === value) return;

    // Check against snapshot to see if we're reverting to original
    const snapshotValue = dataSnapshotRef.current[row]?.[col];
    const isRevertingToOriginal = snapshotValue === value;

    const updated = [...data];
    // For arrays, we need to clone the array element properly
    if (Array.isArray(updated[row])) {
      updated[row] = [...updated[row]];
    } else {
      updated[row] = { ...updated[row] };
    }
    updated[row][col] = value;

    // Embed edit tracking metadata (works on both arrays and objects since arrays are objects in JS)
    (updated[row] as any)._cellStatuses = { ...((updated[row] as any)._cellStatuses || {}) };

    if (isRevertingToOriginal) {
      delete (updated[row] as any)._cellStatuses[cName];
      // Also remove from legacy tracker
      setEditedCells(prev => {
        const next = { ...prev };
        delete next[`${row}-${col}`];
        return next;
      });
    } else {
      (updated[row] as any)._cellStatuses[cName] = (currentUserRole === 'Site PM' || currentUserRole === 'PMAG')
        ? 'edited_pm'
        : 'edited_supervisor';

      // Mark as edited (legacy) - this is the PRIMARY tracker that survives array conversions
      setEditedCells(prev => ({
        ...prev,
        [`${row}-${col}`]: true
      }));
    }

    onDataChange(updated);
  };

  const handleCellReject = (row: number, col: number) => {
    // Rejection marking should be allowed for PM/PMAG even in read-only mode
    if (isReadOnly && roleLower !== 'site pm' && roleLower !== 'pmag') return;
    const cName = columns[col];

    const updated = [...safeData];
    updated[row] = { ...updated[row] };

    // Switch tracking status to rejected (Toggle)
    (updated[row] as any)._cellStatuses = { ...((updated[row] as any)._cellStatuses || {}) };
    if ((updated[row] as any)._cellStatuses[cName] === 'rejected') {
      delete (updated[row] as any)._cellStatuses[cName];
    } else {
      (updated[row] as any)._cellStatuses[cName] = 'rejected';
    }

    onDataChange(updated);
  };

  const addRow = () => {
    if (isReadOnly) return;
    onDataChange([...safeData, Array(safeColumns.length).fill("")]);
  };

  const toggleFullscreen = () => {
    const nextValue = !isFullscreen;
    setIsFullscreen(nextValue);
    if (onFullscreenToggle) {
      onFullscreenToggle(nextValue);
    }
  };

  // Handle filter change
  const handleFilterChange = (column, value) => {
    setFiltersState(prev => ({
      ...prev,
      [column]: value
    }));
  };

  // Clear all filters
  const clearFilters = () => {
    setFiltersState({});
  };

  // Handle Export Current Sheet
  const handleExportCurrent = async () => {
    try {
      const XLSX = await import('xlsx');

      // Prepare data combining header and rows
      // Use columns as header row
      const exportData = [columns, ...data];

      const ws = XLSX.utils.aoa_to_sheet(exportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Sheet1");

      const safeTitle = (title || 'Export').replace(/[^a-z0-9]/gi, '_');
      const dateStr = new Date().toISOString().split('T')[0];
      XLSX.writeFile(wb, `${dateStr}_${safeTitle}.xlsx`);
    } catch (error) {
      console.error("Export failed", error);
    }
  };

  // Helper function to clean header labels by removing tags like (p6), (edit), (user), etc.
  // and applying abbreviations for common terms
  const cleanHeaderLabel = (label) => {
    if (typeof label !== 'string') return label;

    // Remove tags first
    let cleanedLabel = label.replace(/\s*\(p6\)|\s*\(edit\)|\s*\(user\)|\s*\(auto\)/gi, '').trim();

    // Apply abbreviations for common terms
    const abbreviations = {
      // User requested full names, so we comment out or remove abbreviations
      /*
      'Actual Start': 'A.S',
      'Actual Finish': 'A.F',
      'Base Plan Start': 'B.P.S',
      'Base Plan Finish': 'B.P.F',
      'Forecast Start': 'F.S',
      'Forecast Finish': 'F.F',
      'Planned Start': 'P.S',
      'Planned Finish': 'P.F',
      'Baseline Start': 'B.S',
      'Baseline Finish': 'B.F',

      'Completion Percentage': '% Comp',
      'Deviation Plan vs Actual': 'Dev P vs A',
      'Catch Up Plan': 'C.U.Plan',
      'Hold Due to WTG': 'Hold WTG',
      'New Block Nom': 'New Blk',
      'Baseline Priority': 'B.Priority'
      */
    };

    // Apply abbreviations
    Object.keys(abbreviations).forEach(fullTerm => {
      const abbreviation = abbreviations[fullTerm];
      cleanedLabel = cleanedLabel.replace(new RegExp(fullTerm, 'gi'), abbreviation);
    });

    return cleanedLabel;
  };

  // ==========================================
  // EXCEL HEADER STYLE
  // ==========================================
  const excelHeaderStyle = (col: any, rowIndex = 0): React.CSSProperties => {
    // Apply custom background colors based on column names for special columns
    const colName = typeof col === 'string' ? col : (col.column || col.label || '');
    const lowerColName = colName.toLowerCase();

    // Default background color (Ash / Light Gray)
    let backgroundColor = "#d1d5db";
    const textColor = "#000000"; // Black text

    // If auto-coloring is disabled, return default styles early
    if (disableAutoHeaderColors) {
      if (colName === "Spacer") {
        return {
          backgroundColor: "transparent",
          border: "none",
          width: "30px",
          minWidth: "30px",
          maxWidth: "30px",
          padding: 0
        };
      }
      if (rowIndex === 1) backgroundColor = "#DDE4EC";
      return {
        backgroundColor,
        color: textColor,
        fontSize: isMobile ? "13px" : "11px",
        fontWeight: "800",
        padding: "0",
        textAlign: "center" as const,
        whiteSpace: "normal" as const,
        wordBreak: "break-word" as const,
        height: isMobile ? "auto" : (
          typeof col === 'object' && col.rowSpan === 2
            ? "70px" // 38px + 32px
            : (rowIndex === 1 ? "32px" : "38px")
        ),
        minHeight: isMobile ? "38px" : (
          typeof col === 'object' && col.rowSpan === 2
            ? "70px"
            : (rowIndex === 1 ? "32px" : "38px")
        ),
        minWidth: isMobile ? "80px" : (colWidths[colName] ? `${colWidths[colName]}px` : (columnWidths[colName] ? `${columnWidths[colName]}px` : "fit-content")),
        width: isMobile ? "80px" : (colWidths[colName] ? `${colWidths[colName]}px` : (columnWidths[colName] ? `${columnWidths[colName]}px` : "fit-content")),
        textTransform: "uppercase" as const,
        borderBottom: "2px solid #94a3b8",
        borderRight: "1px solid #cbd5e1",
      };
    }

    if (colName === "Spacer") {
      return {
        backgroundColor: "transparent",
        border: "none",
        width: "15px",
        minWidth: "15px",
        maxWidth: "15px",
        padding: 0
      };
    }

    // Apply custom background color if provided in the header cell object
    if (typeof col === 'object' && col.bgColor) {
      backgroundColor = col.bgColor;
    } else if (rowIndex === 1) {
      backgroundColor = "#d1d5db"; // Stay ash for sub-headers
    } else if (rowIndex > 1) {
      backgroundColor = "#d1d5db";
    }

    // COLOR SCHEME:
    // User requested to remove automatic header colors.
    // Defaulting to standardized ash background.

    return {
      backgroundColor,
      color: textColor,
      fontSize: isMobile ? "13px" : "11px",
      fontWeight: "700",
      padding: isMobile ? "6px 8px" : "4px 6px",
      textAlign: "center" as const,
      whiteSpace: "pre-wrap" as const,
      wordBreak: "break-word" as const,
      overflow: "visible" as const,
      height: isMobile ? "auto" : (
        typeof col === 'object' && col.rowSpan === 2
          ? "70px"
          : "auto" // Allow auto height for wrapping
      ),
      minHeight: isMobile ? "38px" : (
        typeof col === 'object' && col.rowSpan === 2
          ? "70px"
          : "38px"
      ),
      verticalAlign: "middle",
      boxSizing: "border-box" as const,
      minWidth: isMobile ? "100px" : (colWidths[colName] ? `${colWidths[colName]}px` : (columnWidths[colName] ? `${columnWidths[colName]}px` : "100px")),
      width: isMobile ? "100px" : (colWidths[colName] ? `${colWidths[colName]}px` : (columnWidths[colName] ? `${columnWidths[colName]}px` : "100px")),
      textTransform: "uppercase" as const,
      letterSpacing: "0.5px",
      borderBottom: "2px solid #94a3b8",
      borderRight: "1px solid #cbd5e1",
    };
  };

  const excelCellStyle = (r: number, originalRowIdx: number, col: number, colName: string, type: string, val: any): React.CSSProperties => {
    const isActive = activeCell?.row === r && activeCell?.col === col;
    const isEvenRow = r % 2 === 0;

    // Get row style if available
    const rowStyle = rowStyles[r] || {};

    // Determine text alignment based on data type and row style
    let textAlign: React.CSSProperties['textAlign'] = "center"; // Default to center for arrangement clarity

    // Only Description and Activities columns are left-aligned as requested
    const lowerColName = colName.toLowerCase();
    if (lowerColName.includes("description") || lowerColName.includes("activities") || lowerColName === "activity" || lowerColName === "activity id") {
      textAlign = "left";
    }
    // Remaining all (including category row values in other columns) keep at center
    else {
      textAlign = "center";
    }

    const rowObj = (Array.isArray(safeData) && safeData[originalRowIdx]) ? safeData[originalRowIdx] : null;
    const cellStatus = (rowObj && (rowObj as any)._cellStatuses && (rowObj as any)._cellStatuses[colName])
      || (editedCells[`${originalRowIdx}-${col}`] ? 'edited_supervisor' : null);

    let bgColor = rowStyle.backgroundColor || (isEvenRow ? T.bg : themeMode === "dark" ? "#242424" : "#F8FBFF");
    let txtColor = (cellTextColors[r] && cellTextColors[r][colName]) || columnTextColors[colName] || rowStyle.color || (rowStyle.isCategoryRow ? "#000000" : T.text);
    let fontWeightValue = rowStyle.isCategoryRow ? "bold" : "normal";
    let outlineStyle = isActive ? `2px solid ${T.activeBorder}` : undefined;

    if (cellStatus === 'edited_supervisor') {
      bgColor = themeMode === "dark" ? "#713f12" : "#fef08a"; // Yellow highlight
      txtColor = themeMode === "dark" ? "#fde047" : "#854d0e";
      fontWeightValue = "bold";
    } else if (cellStatus === 'edited_pm') {
      bgColor = themeMode === "dark" ? "#1e3a8a" : "#bfdbfe"; // Blue highlight
      txtColor = themeMode === "dark" ? "#bfdbfe" : "#1e40af";
      fontWeightValue = "bold";
    }
    /* 
    } else if (cellStatus === 'rejected') {
      bgColor = themeMode === "dark" ? "#7f1d1d" : "#fecaca"; // Red highlight
      txtColor = themeMode === "dark" ? "#fca5a5" : "#b91c1c";
      fontWeightValue = "bold";
      outlineStyle = `2px solid ${themeMode === "dark" ? "#ef4444" : "#dc2626"}`;
    }
    */

    const isSpacer = colName === "Spacer";

    // Check if neighbors are spacers (to draw "outer" borders)
    const colIdx = filteredColumns.indexOf(colName);
    const isBeforeSpacer = filteredColumns[colIdx + 1] === "Spacer";
    const isAfterSpacer = filteredColumns[colIdx - 1] === "Spacer";

    // Date-based text coloring for Actual/Forecast columns
    const valStr = String(val || '');
    if (valStr && valStr !== '-' && (colName === "Actual/Forecast Start" || colName === "Actual/Forecast Finish")) {
      if (valStr.toLowerCase() === 'completed') {
        txtColor = "#16a34a"; // Green for completed
      } else {
        // Handle DD-MMM-YY specifically per user "our format" rule
        const parts = valStr.split('-');
        if (parts.length === 3) {
          const day = parseInt(parts[0]);
          const mStr = parts[1];
          const yrShort = parseInt(parts[2]);
          const mNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
          const mIdx = mNames.indexOf(mStr);

          if (mIdx !== -1 && !isNaN(day) && !isNaN(yrShort)) {
            const yr = yrShort + (yrShort < 70 ? 2000 : 1900); // Heuristic for 2-digit years
            const d = new Date(yr, mIdx, day);
            const now = new Date();
            now.setHours(0, 0, 0, 0);
            if (d < now) {
              txtColor = "#16a34a"; // Green for past
            } else {
              txtColor = "#2563eb"; // Blue for upcoming
            }
          }
        }
      }
    }

    if (isSpacer) {
      return {
        backgroundColor: "transparent",
        border: "none",
        width: "30px",
        minWidth: "30px",
        maxWidth: "30px",
        padding: 0,
        pointerEvents: "none" as const
      };
    }

    const cellStyle: React.CSSProperties = {
      backgroundColor: bgColor,
      height: isMobile ? "40px" : "32px",
      padding: isMobile ? "4px 6px" : "1px 4px",
      fontSize: isMobile ? "14px" : "12px",
      position: "relative" as const,
      transition: "background 0.1s",
      color: txtColor,
      textAlign,
      fontWeight: fontWeightValue,
      minWidth: isMobile ? "100px" : undefined,
      ...(outlineStyle ? { outline: outlineStyle, outlineOffset: "-2px" } : {}),
    };

    if (isBeforeSpacer) {
      cellStyle.borderRight = "2px solid #999999";
    }
    if (isAfterSpacer) {
      cellStyle.borderLeft = "2px solid #999999";
    }

    return cellStyle;
  };

  return (
    <div
      className={`rounded-lg border flex flex-col ${isFullscreen ? "fixed inset-0 z-[9999] p-4 bg-background" : "flex-1 w-full min-h-0"}`}
      style={{
        borderColor: T.grid,
        backgroundColor: T.bg,
      }}
    >
      {/* ======================= HEADER ======================= */}
      {!isFullscreen && (
        <div
          className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-2 sm:p-3 border-b rounded-t-lg gap-2 flex-shrink-0"
          style={{ backgroundColor: T.headerBg, borderColor: T.grid }}
        >
          <div className="flex items-center space-x-2 flex-wrap">
            <h3
              className="font-bold text-sm sm:text-lg text-primary"
              style={{ color: T.headerText }}
            >
              {title}
            </h3>
            <span style={{ color: T.headerText, fontSize: "9px" }} className="hidden sm:inline font-medium opacity-70">({(filteredData || []).length} of {Math.max(totalRows || 0, safeData.length)} rows)</span>

            {status !== "draft" && <StatusChip status={status} />}
          </div>

          <div className="flex items-center flex-wrap gap-1 sm:gap-2">
            {onSave && (
              <Button size="sm" variant="outline" onClick={onSave} className="text-xs sm:text-sm h-8 px-2 sm:px-3 border-primary/20 hover:bg-primary/10">
                <Save className="w-3 h-3 sm:w-4 sm:h-4 sm:mr-1" />
                <span className="hidden sm:inline">Save</span>
              </Button>
            )}

            {onSubmit && (
              <Button
                size="sm"
                className="text-xs sm:text-sm h-8 px-2 sm:px-3 bg-green-600 hover:bg-green-700 font-bold"
                onClick={() => setIsSubmitModalOpen(true)}
              >
                Submit
              </Button>
            )}

            {onPush && (
              <Button
                size="sm"
                variant="outline"
                className="text-xs sm:text-sm h-8 px-2 sm:px-3 border-blue-400 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold"
                onClick={() => setIsPushModalOpen(true)}
              >
                <div className="flex items-center gap-1">
                  <RefreshCw className="w-3 h-3 sm:w-4 sm:h-4" />
                  <span className="hidden sm:inline">Push P6</span>
                </div>
              </Button>
            )}

            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowFilters(!showFilters)}
              className={`text-xs sm:text-sm h-8 px-2 sm:px-3 ${showFilters ? "bg-primary/20 border-primary" : "border-slate-200"}`}
            >
              <Search className="w-3 h-3 sm:w-4 sm:h-4 sm:mr-1" />
              <span className="hidden sm:inline">Filters</span>
            </Button>

            {showFilters && filters && Object.keys(filters).length > 0 && Object.keys(filters).some(key => filters[key]) && (
              <Button
                size="sm"
                variant="outline"
                onClick={clearFilters}
                className="bg-destructive/10 text-destructive h-8 text-xs sm:text-sm px-2 sm:px-3 hover:bg-destructive hover:text-white"
              >
                <span className="hidden sm:inline">Clear</span>
                <span className="sm:hidden">X</span>
              </Button>
            )}

            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowOnlyModified(!showOnlyModified)}
              className={`text-xs sm:text-sm h-8 px-2 sm:px-3 border-amber-300 ${showOnlyModified ? "bg-amber-500 text-white " : "text-amber-700"}`}
              title="Show only rows with modifications/highlights"
            >
              <AlertCircle className="w-3 h-3 sm:w-4 sm:h-4 sm:mr-1" />
              <span className="hidden lg:inline">{showOnlyModified ? "Showing Changes" : "Changed Only"}</span>
              <span className="lg:hidden">Changes</span>
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline" className="text-xs sm:text-sm h-8 px-2 sm:px-3">
                  <Columns className="w-3 h-3 sm:w-4 sm:h-4 sm:mr-1" />
                  <span className="hidden sm:inline">Cols</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-[240px] max-h-[400px] overflow-y-auto rounded-xl shadow-xl border-slate-200">
                <DropdownMenuLabel className="font-bold">Columns Visibility</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {safeColumns.map((col, idx) => {
                  if (safeExclude.includes(col)) return null;
                  return (
                    <DropdownMenuCheckboxItem
                      key={idx}
                      checked={!hiddenColumns.includes(col)}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setHiddenColumns(prev => prev.filter(c => c !== col));
                        } else {
                          setHiddenColumns(prev => [...prev, col]);
                        }
                      }}
                      className="font-medium"
                    >
                      {col}
                    </DropdownMenuCheckboxItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline" className="text-xs sm:text-sm h-8 px-2 sm:px-3">
                  <Download className="w-3 h-3 sm:w-4 sm:h-4 sm:mr-1" />
                  <span className="hidden sm:inline">Export</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="rounded-xl shadow-xl">
                <DropdownMenuLabel className="font-bold">Excel Options</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleExportCurrent} className="cursor-pointer font-medium">
                  <FileSpreadsheet className="mr-2 h-4 w-4" />
                  This Sheet
                </DropdownMenuItem>
                {onExportAll && (
                  <DropdownMenuItem onClick={onExportAll} className="cursor-pointer font-medium">
                    <FileSpreadsheet className="mr-2 h-4 w-4 text-blue-600" />
                    Entire Project
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>

            <Button
              size="sm"
              variant="outline"
              onClick={toggleFullscreen}
              title="Full Width & Height"
              className="text-xs sm:text-sm h-8 px-2 sm:px-3"
              style={{
                backgroundColor: themeMode === "dark" ? "#2B2B2B" : "#F8FAFC",
                color: themeMode === "dark" ? "#FFFFFF" : "#475569",
                borderColor: themeMode === "dark" ? "#3A3A3A" : "#CBD5E1",
              }}
            >
              <Maximize className="w-3 h-3 sm:w-4 sm:h-4 sm:mr-1" />
              <span className="hidden sm:inline">Fullscreen</span>
            </Button>
          </div>
        </div>
      )}

      {/* ======================= FULLSCREEN HEADER ======================= */}
      {isFullscreen && (
        <div
          className="flex items-center justify-between p-4 border-b flex-shrink-0 bg-slate-50 dark:bg-slate-900"
          style={{
            borderColor: T.grid,
          }}
        >
          <div className="flex items-center gap-4 flex-wrap">
            <div>
              <h2
                className="text-2xl font-bold tracking-tight"
                style={{ color: T.headerText }}
              >
                {title}
              </h2>
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                {(filteredData || []).length} of {totalRows || safeData.length} records detected × {safeColumns.length} attributes
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {onSave && (
              <Button size="sm" variant="outline" onClick={onSave} className="h-10 px-4 font-bold border-primary/20 hover:bg-primary/10">
                <Save className="w-4 h-4 mr-2" />
                Save
              </Button>
            )}
            {onSubmit && (
              <Button
                size="sm"
                className="h-10 px-6 font-bold bg-green-600 hover:bg-green-700"
                onClick={() => setIsSubmitModalOpen(true)}
              >
                Submit
              </Button>
            )}

            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowOnlyModified(!showOnlyModified)}
              className={`h-10 px-4 font-bold border-amber-300 ${showOnlyModified ? "bg-amber-500 text-white " : "text-amber-700"}`}
            >
              <AlertCircle className="w-4 h-4 mr-2" />
              {showOnlyModified ? "Showing Changes" : "Changed Only"}
            </Button>

            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowFilters(!showFilters)}
              className={`h-10 px-4 font-bold ${showFilters ? "bg-primary/20 border-primary" : "border-slate-300"}`}
            >
              <Search className="w-4 h-4 mr-2" />
              Filters
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline" className="h-10 px-4 font-bold">
                  <Columns className="w-4 h-4 mr-2" />
                  Cols
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-[260px] max-h-[500px] overflow-y-auto rounded-xl shadow-2xl border-slate-200">
                <DropdownMenuLabel className="font-bold">Setup View</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {safeColumns.map((col, idx) => {
                  if (safeExclude.includes(col)) return null;
                  return (
                    <DropdownMenuCheckboxItem
                      key={idx}
                      checked={!hiddenColumns.includes(col)}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setHiddenColumns(prev => prev.filter(c => c !== col));
                        } else {
                          setHiddenColumns(prev => [...prev, col]);
                        }
                      }}
                      className="font-bold"
                    >
                      {col}
                    </DropdownMenuCheckboxItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>

            <Button
              size="sm"
              variant="destructive"
              onClick={toggleFullscreen}
              className="h-10 px-4 font-bold"
            >
              <Minimize className="w-4 h-4 mr-2" />
              Exit
            </Button>
          </div>
        </div>
      )}

      {/* ======================= TABLE ======================= */}
      <div
        className={`overflow-x-auto overflow-y-auto mobile-scroll-container flex-1 w-full min-h-0 relative ${isFullscreen ? "bg-background" : ""}`}
        style={{
          WebkitOverflowScrolling: "touch",
          maxHeight: isFullscreen ? "none" : "calc(100vh - 320px)"
        }}
        onScroll={handleScroll}
      >
        <table
          className="excel-grid w-full"
          style={{
            tableLayout: isMobile ? "auto" : "fixed",
            borderCollapse: "separate",
            borderSpacing: 0,
            border: "2px solid #999999",
            fontSize: isMobile ? "15px" : "14px",
            width: "100%",
            minWidth: "100%",
          }}
        >
          {/* Explicit Column Widths for Fixed Layout */}
          {!isMobile && (
            <colgroup>
              {filteredColumns.map((col, idx) => {
                const lowerCol = col.toLowerCase();
                const isFlexible = lowerCol.includes("description") ||
                  lowerCol === "activities" ||
                  lowerCol === "activity" ||
                  lowerCol === "activity id";

                return (
                  <col
                    key={`col-${idx}`}
                    style={{
                      width: !isFlexible && (colWidths[col] || columnWidths[col])
                        ? `${colWidths[col] || columnWidths[col]}px`
                        : "auto"
                    }}
                  />
                );
              })}
            </colgroup>
          )}

          <thead style={{
            zIndex: 10,
          }}>
            {/* Conditional rendering for header structure */}
            {headerStructure && headerStructure.length > 0 ? (
              <>
                {/* Render multi-row headers if headerStructure is provided */}
                {headerStructure.map((headerRow, rowIndex) => {
                  // Calculate column offset for this row by counting how many columns
                  // are occupied by rowSpan cells from previous rows
                  let rowSpanOffset = 0;
                  if (rowIndex > 0) {
                    for (let prevRow = 0; prevRow < rowIndex; prevRow++) {
                      for (const prevCell of headerStructure[prevRow]) {
                        const pc = typeof prevCell === 'string' ? { colSpan: 1, rowSpan: 1 } : prevCell;
                        if ((pc.rowSpan || 1) > rowIndex - prevRow) {
                          // This cell from a previous row spans into the current row
                          rowSpanOffset += (pc.colSpan || 1);
                        }
                      }
                    }
                  }

                  // Filter headerRow based on hiddenColumns
                  const visibleHeaderCells = headerRow.map(cell => {
                    // Normalize cell to object with colSpan/rowSpan/column/label
                    const cellObj = typeof cell === 'string' ? { label: cell, column: cell, colSpan: 1, rowSpan: 1 } : { ...cell };

                    // If no explicit column, but it represents a single column, use label as column name
                    if (!cellObj.column && (!cellObj.colSpan || cellObj.colSpan === 1)) {
                      cellObj.column = cellObj.label;
                    }

                    // For multi-column headers (categories), calculate effective colSpan
                    if (cellObj.colSpan > 1) {
                      let startAt = rowSpanOffset;
                      for (let c of headerRow) {
                        if (c === cell) break;
                        startAt += (typeof c === 'object' ? (c.colSpan || 1) : 1);
                      }
                      const covers = safeColumns.slice(startAt, startAt + cellObj.colSpan);
                      const visibleCount = covers.filter(c => !hiddenColumns.includes(c) && !safeExclude.includes(c)).length;
                      cellObj.colSpan = visibleCount;
                    }

                    return cellObj;
                  }).filter(cell => {
                    // Filter out cells that are explicitly hidden or have 0 colSpan after calculation
                    if (cell.column && (hiddenColumns.includes(cell.column) || safeExclude.includes(cell.column))) {
                      return false;
                    }
                    if (cell.colSpan !== undefined && cell.colSpan <= 0) {
                      return false;
                    }
                    return true;
                  });

                  return (
                    <tr key={rowIndex}>
                      {visibleHeaderCells.map((headerCell, cellIndex) => {
                        // Apply special text colors based on header content
                        let textColor = "#000000"; // Always black text for visibility
                        const headerLabel = typeof headerCell === 'string' ? headerCell : headerCell.label;
                        if (headerLabel.includes("Catch Up Plan")) {
                          textColor = "#0000FF"; // Blue for "Catch Up Plan"
                        } else if (headerLabel.includes("% Status")) {
                          textColor = "#008000"; // Green for "% Status"
                        } else if (headerLabel.includes("Deviation Plan vs Actual")) {
                          textColor = "#FF0000"; // Red for "Deviation Plan vs Actual"
                        } else if (headerLabel.includes("Summary in MW")) {
                          textColor = "#070707ff"; // Deep Blue for "Charging Plan in MW"
                        }

                        return (
                          <th
                            key={cellIndex}
                            style={{
                              ...excelHeaderStyle(headerCell, rowIndex),
                              color: textColor,
                              position: "sticky",
                              top: rowIndex === 0 ? 0 : (isMobile ? 38 : 38),
                              left: (fixedColumnsCount > 0 && headerCell.colSpan === 1 && stickyLeftOffsets[headerCell.column]) !== undefined
                                ? stickyLeftOffsets[headerCell.column]
                                : undefined,
                              zIndex: (fixedColumnsCount > 0 && headerCell.colSpan === 1 && stickyLeftOffsets[headerCell.column] !== undefined) ? 25 : 11,
                              borderRight: "1px solid #999999",
                              borderBottom: "2px solid #94a3b8",
                              ...(rowIndex === 0 && { borderTop: "1px solid #999999" }),
                              ...(cellIndex === 0 && { borderLeft: "1px solid #999999" }),
                              // Add a background shadow to simulate border during sticky scroll
                              boxShadow: "inset 0 -1px 0 #94a3b8",
                              // Spacer neighbor logic for headers
                              ...(headerCell.column && headerCell.column === "Spacer" && {
                                border: "none",
                                boxShadow: "none",
                                borderBottom: "none"
                              }),
                              // Find if next or prev visible cell is spacer - this is harder for headers,
                              // but we can check the label/column if it's a single column header.
                              ...(typeof headerCell === 'object' && headerCell.colSpan === 1 && {
                                ...(visibleHeaderCells[cellIndex + 1]?.column === "Spacer" && { borderRight: "2px solid #999999" }),
                                ...(visibleHeaderCells[cellIndex - 1]?.column === "Spacer" && { borderLeft: "2px solid #999999" }),
                              } as React.CSSProperties)
                            }}
                            colSpan={headerCell.colSpan || 1}
                            rowSpan={headerCell.rowSpan || 1}
                          >
                            <div style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              width: "100%",
                              padding: "4px 10px",
                              textAlign: "center"
                            }}>
                              <span>{cleanHeaderLabel(typeof headerCell === 'string' ? headerCell : headerCell.label)}</span>
                            </div>
                            {/* Resize Handle */}
                            {!isMobile && (headerCell.colSpan === 1 || !headerCell.colSpan) && (
                              <div
                                onMouseDown={(e) => handleResizeStart(e, typeof headerCell === 'string' ? headerCell : headerCell.label)}
                                style={{
                                  position: 'absolute',
                                  right: 0,
                                  top: 0,
                                  bottom: 0,
                                  width: '5px',
                                  cursor: 'col-resize',
                                  zIndex: 12,
                                  backgroundColor: 'transparent', // Invisible hit area, usually
                                }}
                                className="hover:bg-gray-400/50 transition-colors"
                              />
                            )}
                          </th>
                        );
                      })}
                    </tr>
                  );
                })}
                {/* Filter row for multi-row headers */}
                {showFilters && headerStructure && headerStructure.length > 0 && (
                  <tr>
                    {filteredColumns.map((col, i) => (
                      <th
                        key={`filter-multi-${i}`}
                        style={{
                          backgroundColor: T.filterBg,
                          padding: "6px",
                          position: "sticky",
                          top: headerStructure.length > 1 ? "70px" : "38px", // 38px (R0) + 32px (R1)
                          zIndex: 11,
                          height: "48px",
                          boxSizing: "border-box" as const,
                          ...(i === 0 && {
                            borderLeft: "2px solid #999999",
                            borderBottom: "1px dashed #999999",
                          }),
                          ...(i === filteredColumns.length - 1 && {
                            borderRight: "2px solid #999999",
                            borderBottom: "1px dashed #999999",
                          }),
                          ...(i > 0 && i < filteredColumns.length - 1 && {
                            borderBottom: "1px dashed #999999",
                            borderLeft: "1px dashed #999999",
                            borderRight: "1px dashed #999999",
                          }),
                        }}
                      >
                        <Input
                          type="text"
                          placeholder={`Filter ${cleanHeaderLabel(col)}`}
                          value={filtersState[col] || ""}
                          onChange={(e) => handleFilterChange(col, e.target.value)}
                          className="w-full h-9 text-sm px-2 py-1"
                          style={{
                            backgroundColor: themeMode === "dark" ? "#444" : "#FFF",
                            color: themeMode === "dark" ? "#E8E8E8" : "#000000",
                            border: "1px solid #999",
                          }}
                        />
                      </th>
                    ))}
                  </tr>
                )}
              </>
            ) : (
              <>
                {/* Render single-row headers if no headerStructure is provided */}
                <tr>
                  {filteredColumns.map((col, i) => {
                    // Apply special text colors based on column name
                    let textColor = "#000000"; // Always black text for visibility
                    if (col.includes("Catch Up Plan")) {
                      textColor = "#2053abff"; // Blue for "Catch Up Plan"
                    } else if (col.includes("% Status")) {
                      textColor = "#008000"; // Green for "% Status"
                    } else if (col.includes("Deviation Plan vs Actual")) {
                      textColor = "#FF0000"; // Red for "Deviation Plan vs Actual"
                    }

                    return (
                      <th
                        key={i}
                        style={{
                          ...excelHeaderStyle(col),
                          color: textColor,
                          position: "sticky",
                          top: 0,
                          left: (fixedColumnsCount > 0 && stickyLeftOffsets[col] !== undefined) ? stickyLeftOffsets[col] : undefined,
                          zIndex: (fixedColumnsCount > 0 && stickyLeftOffsets[col] !== undefined) ? 25 : 11,
                          borderRight: "1px solid #999999",
                          borderBottom: "2px solid #94a3b8",
                          borderTop: "1px solid #999999",
                          ...(i === 0 && { borderLeft: "1px solid #999999" }),
                          boxShadow: "inset 0 -1px 0 #94a3b8",
                          // Spacer logic for single row headers
                          ...(col === "Spacer" && { border: "none", boxShadow: "none" }),
                          ...(filteredColumns[i + 1] === "Spacer" && { borderRight: "2px solid #999999" }),
                          ...(filteredColumns[i - 1] === "Spacer" && { borderLeft: "2px solid #999999" }),
                        }}
                      >
                        <div style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          width: "100%",
                          padding: "4px 10px",
                          textAlign: "center"
                        }}>
                          <span>{cleanHeaderLabel(col)}</span>
                        </div>
                        {/* Resize Handle */}
                        {!isMobile && (
                          <div
                            onMouseDown={(e) => handleResizeStart(e, col)}
                            style={{
                              position: 'absolute',
                              right: 0,
                              top: 0,
                              bottom: 0,
                              width: '5px',
                              cursor: 'col-resize',
                              zIndex: 12,
                            }}
                            className="hover:bg-gray-400/50 transition-colors"
                          />
                        )}
                      </th>
                    );
                  })}
                </tr>
                {/* Filter row for single-row headers */}
                {showFilters && (
                  <tr>
                    {filteredColumns.map((col, i) => (
                      <th
                        key={`filter-${i}`}
                        style={{
                          backgroundColor: T.filterBg,
                          padding: "4px",
                          position: "sticky",
                          top: "38px", // Sticky right below the single-row header
                          zIndex: 11,
                          height: "48px",
                          boxSizing: "border-box" as const,
                          ...(i === 0 && {
                            borderLeft: "2px solid #999999",
                            borderBottom: "1px dashed #999999",
                          }),
                          ...(i === filteredColumns.length - 1 && {
                            borderRight: "2px solid #999999",
                            borderBottom: "1px dashed #999999",
                          }),
                          ...(i > 0 && i < filteredColumns.length - 1 && {
                            borderBottom: "1px dashed #999999",
                            borderLeft: "1px dashed #999999",
                            borderRight: "1px dashed #999999",
                          }),
                        }}
                      >
                        <Input
                          type="text"
                          placeholder={`Filter ${cleanHeaderLabel(col)}`}
                          value={filtersState[col] || ""}
                          onChange={(e) => handleFilterChange(col, e.target.value)}
                          className="w-full h-9 text-sm px-2 py-1"
                          style={{
                            backgroundColor: themeMode === "dark" ? "#444" : "#FFF",
                            color: themeMode === "dark" ? "#E8E8E8" : "#000000",
                            border: "1px solid #999",
                          }}
                        />
                      </th>
                    ))}
                  </tr>
                )}
              </>
            )}
          </thead>

          <tbody>
            {(filteredDataWithIndices || []).slice(0, renderCount).map(({ row, index: originalIndex }, r) => {
              const rowObj = (Array.isArray(safeData) && safeData[originalIndex]) ? safeData[originalIndex] : null;
              return (
                <tr key={r}>
                  {filteredColumns.map((colName, i) => {
                    const col = columns.indexOf(colName);
                    const value = row[col];
                    const type = columnTypes[colName] || "text";

                    const rowStyle = rowStyles[originalIndex] || rowStyles[r] || {};
                    const isActive = activeCell?.row === r && activeCell?.col === col;
                    return (
                      <td
                        key={i}
                        className="group relative"
                        style={{
                          ...excelCellStyle(r, originalIndex, col, colName, type, value),
                          position: (fixedColumnsCount > 0 && stickyLeftOffsets[colName] !== undefined) ? "sticky" : "relative",
                          left: (fixedColumnsCount > 0 && stickyLeftOffsets[colName] !== undefined) ? stickyLeftOffsets[colName] : undefined,
                          zIndex: (fixedColumnsCount > 0 && stickyLeftOffsets[colName] !== undefined) ? 5 : 1,
                          padding: 0, // Ensure no padding pushes content out
                          overflow: "hidden",
                          ...(colName !== "Spacer" && {
                            borderBottom: rowStyle.isCategoryRow ? "1px solid #999999" : "1px dashed #999999",
                            borderRight: "1px dashed #999999",
                            // Left border for start of table
                            ...(i === 0 && { borderLeft: "2px solid #999999" }),
                            // Right border for end of table
                            ...(i === filteredColumns.length - 1 && { borderRight: "2px solid #999999" }),
                            // Bottom border for last row
                            ...(r === Math.min(filteredData.length, renderCount) - 1 && { borderBottom: "2px solid #999999" }),
                          }),
                          // Neighbor of Spacer logic
                          ...(filteredColumns[i + 1] === "Spacer" && { borderRight: "2px solid #999999" }),
                          ...(filteredColumns[i - 1] === "Spacer" && { borderLeft: "2px solid #999999" }),
                          // No borders for spacer itself
                          ...(colName === "Spacer" && {
                            border: "none",
                            borderLeft: "none",
                            borderRight: "none",
                            borderTop: "none",
                            borderBottom: "none"
                          } as React.CSSProperties)
                        }}
                        onClick={() => setActiveCell({ row: r, col })}
                      >
                        {colName !== "Spacer" && (
                          <>
                            <Input
                              type={(type === "date" && isActive) ? "date" : (type === "date" ? "text" : type)}
                              value={
                                (type === "date" && isActive) ? (() => {
                                  if (!value || typeof value !== 'string') return "";
                                  // Handle "Completed" or other non-date values explicitly
                                  if (value.toLowerCase() === 'completed') return "";

                                  // Parse DD-MMM-YY to YYYY-MM-DD for native date picker
                                  const parts = value.split('-');
                                  if (parts.length === 3) {
                                    const day = parts[0].padStart(2, '0');
                                    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                                    const monthIdx = monthNames.findIndex(m => m.toLowerCase() === parts[1].toLowerCase());
                                    if (monthIdx !== -1) {
                                      const month = (monthIdx + 1).toString().padStart(2, '0');
                                      const year = parts[2].length === 2 ? `20${parts[2]}` : parts[2];
                                      return `${year}-${month}-${day}`;
                                    }
                                  }
                                  // Fallback: if it's already ISO or something else
                                  try {
                                    const d = new Date(value);
                                    if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
                                  } catch (e) { }
                                  return "";
                                })() : (value !== undefined && value !== null ? value : "")
                              }
                              readOnly={isReadOnly || !editableColumns.includes(colName) || !!rowStyle.isTotalRow}
                              onFocus={() => setActiveCell({ row: r, col })}
                              onKeyDown={(e) => {
                                if (type === "number") {
                                  // Allow: backspace, delete, tab, escape, enter, decimal point, minus sign
                                  if (
                                    ["Backspace", "Delete", "Tab", "Escape", "Enter", ".", "-", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].indexOf(e.key) !== -1 ||
                                    // Allow: Ctrl+A, Ctrl+C, Ctrl+V, Ctrl+X
                                    (e.ctrlKey === true || e.metaKey === true)
                                  ) {
                                    return;
                                  }
                                  // Ensure that it is a number or minus sign and stop the keypress
                                  if ((e.key < "0" || e.key > "9") && e.key !== "-") {
                                    e.preventDefault();
                                  }
                                }
                              }}
                              onChange={(e) => {
                                if (type === "date") {
                                  const isoVal = e.target.value; // YYYY-MM-DD
                                  if (!isoVal) {
                                    handleCellChange(originalIndex, col, "");
                                    return;
                                  }
                                  // Use indianDateFormat to convert back to DD-MMM-YY
                                  const formatted = indianDateFormat(isoVal);
                                  handleCellChange(originalIndex, col, formatted);
                                  return;
                                }
                                // Allow empty value, "-", or valid numbers (including negative)
                                // Helper regex to allow "123", "-123", "123.", "-123.45"
                                if (type === "number") {
                                  const inputValue = e.target.value;
                                  if (inputValue === "" || inputValue === "-" || /^-?\d*\.?\d*$/.test(inputValue)) {
                                    handleCellChange(originalIndex, col, inputValue);
                                  }
                                  return;
                                }
                                handleCellChange(originalIndex, col, e.target.value);
                              }}
                              className="w-full h-full px-1 border-none focus-visible:ring-0 [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none [-moz-appearance:textfield]"
                              style={
                                type === "date" ?
                                  {
                                    background: "transparent",
                                    fontSize: isMobile ? "14px" : "11px",
                                    color: "inherit",
                                    fontWeight: "inherit",
                                    textAlign: "center",
                                    padding: "0",
                                    margin: "0",
                                    border: "none",
                                    width: "100%",
                                    height: "100%",
                                    lineHeight: isMobile ? "40px" : "32px",
                                    boxSizing: "border-box" as const,
                                    position: "relative",
                                    zIndex: "1",
                                    cursor: "pointer",
                                    display: "block"
                                  } :
                                  {
                                    background: "transparent",
                                    fontSize: "inherit",
                                    color: "inherit",
                                    fontWeight: "inherit",
                                    textAlign: "inherit",
                                  }
                              }
                            />
                            {type === "select" && (
                              <select
                                value={value || ""}
                                disabled={isReadOnly || !editableColumns.includes(colName) || !!rowStyle.isTotalRow}
                                onFocus={() => setActiveCell({ row: r, col })}
                                onChange={(e) => handleCellChange(originalIndex, col, e.target.value)}
                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                              >
                                <option value="">Select Status</option>
                                {(columnOptions[colName] || []).map(opt => (
                                  <option key={opt} value={opt}>{opt}</option>
                                ))}
                              </select>
                            )}
                            {type === "select" && (
                              <div className="absolute inset-0 flex items-center justify-center pointer-events-none truncate px-1">
                                {value || ""}
                              </div>
                            )}
                            {/* Rejection marker for PM/PMAG - hidden by default, visible on hover or if rejected */}
                            {!hideRejection && (roleLower === 'site pm' || roleLower === 'pmag') && (editableColumns.includes(colName) || isReadOnly) && status !== 'final_approved' && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleCellReject(originalIndex, col);
                                }}
                                className={`absolute right-1 top-1/2 -translate-y-1/2 p-1 text-red-500 rounded z-[100] transition-all flex items-center justify-center bg-white/90 dark:bg-slate-900/90 shadow-sm border ${(rowObj && (rowObj as any)._cellStatuses && (rowObj as any)._cellStatuses[colName] === 'rejected')
                                    ? "border-red-500 bg-red-50 opacity-100 scale-110"
                                    : "border-red-200 dark:border-red-800 opacity-0 group-hover:opacity-100 hover:scale-110"
                                  }`}
                                title="Reject this specific cell"
                              >
                                <AlertCircle className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
            {/* Observer Target for Infinite Scrolling */}
            {renderCount < (filteredData || []).length && (
              <tr ref={observerTarget}>
                <td colSpan={safeColumns.length} style={{ height: "40px" }} />
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ======================= STATUS BAR ======================= */}
      {!isFullscreen && (
        <div
          className="flex justify-between px-3 py-1 text-xs border-t"
          style={{
            backgroundColor: T.statusBg,
            borderColor: T.grid,
            color: T.headerText,
          }}
        >
          {/* <div style={{ fontSize: "8px" }}>
            Ready | {filteredData.length} of {safeData.length} rows × {safeColumns.length} columns
          </div>
          <div style={{ fontSize: "10px" }}>Excel Style Sheet</div> */}
        </div>
      )}
      <ConfirmationModal
        isOpen={isSubmitModalOpen}
        onClose={() => setIsSubmitModalOpen(false)}
        onConfirm={() => {
          setIsSubmitModalOpen(false);
          if (onSubmit) onSubmit();
        }}
        title="Submit Sheet Entry"
        description="Are you sure you want to submit this sheet? Once submitted, it will be sent to the PM for review."
        confirmLabel="Submit Entry"
      />
      <ConfirmationModal
        isOpen={isPushModalOpen}
        onClose={() => setIsPushModalOpen(false)}
        onConfirm={() => {
          setIsPushModalOpen(false);
          if (onPush) onPush();
        }}
        title="Sync to P6/ERP"
        description="Are you sure you want to sync this data to P6/ERP? This will update the project schedules."
        confirmLabel="Sync Data"
      />
    </div>
  );
};