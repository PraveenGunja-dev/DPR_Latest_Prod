import React, { useMemo, useCallback } from 'react';
import { StyledExcelTable } from "@/components/StyledExcelTable";
import { indianDateFormat } from "@/services/dprService";

// Wind Progress Sheet columns mapped from P6:
// S.No (auto), Activity ID (from P6 Id), Description (from P6 Name),
// Status (from P6), Substation (from WBS PSS-XX), SPV (from spv_no / project name),
// Location (WTG{N} from activity name), Activity Group (CW/EL/TC/ER from name),
// Scope, Completed, Baseline Start/Finish, Actual Start/Finish, Forecast Start/Finish

export interface WindProgressData {
  sNo?: string;
  activityId?: string;
  description: string;
  fullName?: string;
  status?: string;
  substation: string;
  spv: string;
  locations: string;
  activityGroup?: string;
  wbsName?: string;
  feeder: string;
  wtgFdnVendor: string;
  fdnAllotmentDate: string;
  stoneColumnContractor: string;
  soilTestStatus: string;
  wtgCoordE: string;
  wtgCoordN: string;
  scope: string;
  completed: string;
  baselineStart: string;
  baselineFinish: string;
  actualStart: string;
  actualFinish: string;
  forecastStart: string;
  forecastFinish: string;
  noOfDays: string;
  percentComplete?: number;
  [key: string]: any;
}

interface WindProgressTableProps {
  data: WindProgressData[];
  setData: (data: WindProgressData[]) => void;
  onSave?: () => void;
  onSubmit?: () => void;
  yesterday?: string;
  today?: string;
  isLocked?: boolean;
  status?: string;
  onExportAll?: () => void;
  projectId?: number;
  selectedSubstation?: string;
  selectedLocation?: string;
  selectedActivityGroup?: string;
  selectedActivity?: string;
  onPush?: () => void;
  sheetType?: string;
}

export const WindProgressTable: React.FC<WindProgressTableProps> = ({
  data,
  setData,
  onSave,
  onSubmit,
  yesterday,
  today,
  isLocked = false,
  status = 'draft',
  onExportAll,
  projectId,
  selectedSubstation = 'ALL',
  selectedLocation = 'ALL',
  selectedActivityGroup = 'ALL',
  selectedActivity = 'ALL',
  onPush,
  sheetType = 'wind_progress',
}) => {
  // Filter based on wind-specific filters
  const extractBase = useCallback((desc: string) => {
    if (!desc) return 'Other';
    // Match common wind naming patterns: 
    // 1. Location-Group-Task (e.g., WTG01-CW-Excavation)
    // 2. Location-Task (e.g., WTG01-Excavation)
    const match = desc.match(/^(?:WTG\d+|[A-Z\d]+)-(?:CW|EL|TC|ER|PSS|USS|TC|ELE|ERE|ERECTION|COMM)[-_](.+)$/i) ||
      desc.match(/^(?:WTG\d+|[A-Z\d]+)[-_](.+)$/i);

    if (match && match[1]) {
      return match[1].replace(/_/g, ' ').trim();
    }
    return desc;
  }, []);
  // Filter based on wind-specific filters
  const filteredData = useMemo(() => {
    if (!Array.isArray(data)) return [];
    let result = data;
    if (selectedActivityGroup !== 'ALL') {
      result = result.filter(d => d.activityGroup === selectedActivityGroup);
    }
    if (selectedActivity !== 'ALL') {
      result = result.filter(d => extractBase(d.description) === selectedActivity);
    }
    if (selectedSubstation !== 'ALL') {
      if (selectedSubstation === 'No Location') {
        result = result.filter(d => !d.substation || d.substation === '');
      } else {
        result = result.filter(d => d.substation === selectedSubstation);
      }
    }
    if (selectedLocation !== 'ALL') {
      if (selectedLocation === 'No Location') {
        result = result.filter(d => !d.locations || d.locations === '');
      } else {
        result = result.filter(d => d.locations === selectedLocation);
      }
    }


    console.log(`[WindProgressTable] Data processed:`, {
      totalInput: data.length,
      filteredOutput: result.length,
      filters: {
        Group: selectedActivityGroup,
        Activity: selectedActivity,
        Location: selectedLocation,
        Substation: selectedSubstation
      }
    });

    if (result.length === 0 && data.length > 0) {
      console.warn(`[WindProgressTable] WARNING: All ${data.length} activities were filtered out! Check filter criteria.`);
    }

    return result;
  }, [data, selectedActivityGroup, selectedActivity, selectedLocation, selectedSubstation, extractBase]);

  const columns = useMemo(() => [
    "S.No",
    "Activity ID",
    "Description",
    "Status",
    "Substation",
    "SPV",
    "Location",
    "Activity Group",
    "Feeder",
    "WTG FDN Vendor",
    "FDN Allotment Date",
    "Stone Column Contractor",
    "Soil Test Status",
    "Coord E",
    "Coord N",
    "Scope",
    "Completed",
    "Baseline Start",
    "Baseline Finish",
    "Actual Start",
    "Actual Finish",
    "Forecast Start",
    "Forecast Finish",
    "No of Days",
  ], []);

  const columnWidths = useMemo(() => ({
    "S.No": 50,
    "Activity ID": 160,
    "Description": 220,
    "Status": 110,
    "Substation": 100,
    "SPV": 100,
    "Location": 90,
    "Activity Group": 110,
    "Feeder": 80,
    "WTG FDN Vendor": 130,
    "FDN Allotment Date": 120,
    "Stone Column Contractor": 150,
    "Soil Test Status": 110,
    "Coord E": 80,
    "Coord N": 80,
    "Scope": 70,
    "Completed": 80,
    "Baseline Start": 100,
    "Baseline Finish": 100,
    "Actual Start": 100,
    "Actual Finish": 100,
    "Forecast Start": 100,
    "Forecast Finish": 100,
    "No of Days": 80,
  }), []);

  const columnTypes = useMemo(() => ({
    "S.No": "text" as const,
    "Activity ID": "text" as const,
    "Description": "text" as const,
    "Status": "text" as const,
    "Substation": "text" as const,
    "SPV": "text" as const,
    "Location": "text" as const,
    "Activity Group": "text" as const,
    "Feeder": "text" as const,
    "WTG FDN Vendor": "text" as const,
    "FDN Allotment Date": "date" as const,
    "Stone Column Contractor": "text" as const,
    "Soil Test Status": "text" as const,
    "Coord E": "text" as const,
    "Coord N": "text" as const,
    "Scope": "number" as const,
    "Completed": "number" as const,
    "Baseline Start": "text" as const,
    "Baseline Finish": "text" as const,
    "Actual Start": "date" as const,
    "Actual Finish": "date" as const,
    "Forecast Start": "date" as const,
    "Forecast Finish": "date" as const,
    "No of Days": "number" as const,
  }), []);

  // Editable columns - P6 fields (Activity ID, Description, Status, etc.) are read-only
  const editableColumns = useMemo(() => [
    "Feeder", "WTG FDN Vendor", "FDN Allotment Date",
    "Stone Column Contractor", "Soil Test Status", "Coord E", "Coord N",
    "Completed", "Actual Start", "Actual Finish", "Forecast Start", "Forecast Finish",
  ], []);

  const headerStructure = useMemo(() => [
    [
      { label: "S.No", rowSpan: 2, colSpan: 1 },
      { label: "Activity ID", rowSpan: 2, colSpan: 1 },
      { label: "Description", rowSpan: 2, colSpan: 1 },
      { label: "Status", rowSpan: 2, colSpan: 1 },
      { label: "Substation", rowSpan: 2, colSpan: 1 },
      { label: "SPV", rowSpan: 2, colSpan: 1 },
      { label: "Location", rowSpan: 2, colSpan: 1 },
      { label: "Activity Group", rowSpan: 2, colSpan: 1 },
      { label: "Feeder", rowSpan: 2, colSpan: 1 },
      { label: "WTG FDN Vendor", rowSpan: 2, colSpan: 1 },
      { label: "FDN Allotment Date", rowSpan: 2, colSpan: 1 },
      { label: "Stone Column Contractor", rowSpan: 2, colSpan: 1 },
      { label: "Soil Test Status", rowSpan: 2, colSpan: 1 },
      { label: "WTG Coordinates", colSpan: 2, rowSpan: 1 },
      { label: "Scope", rowSpan: 2, colSpan: 1 },
      { label: "Completed", rowSpan: 2, colSpan: 1 },
      { label: "Baseline", colSpan: 2, rowSpan: 1 },
      { label: "Actual", colSpan: 2, rowSpan: 1 },
      { label: "Forecast", colSpan: 2, rowSpan: 1 },
      { label: "No of Days", rowSpan: 2, colSpan: 1 },
    ],
    [
      { label: "Coord E", colSpan: 1, rowSpan: 1 },
      { label: "Coord N", colSpan: 1, rowSpan: 1 },
      { label: "Start", colSpan: 1, rowSpan: 1 },
      { label: "Finish", colSpan: 1, rowSpan: 1 },
      { label: "Start", colSpan: 1, rowSpan: 1 },
      { label: "Finish", colSpan: 1, rowSpan: 1 },
      { label: "Start", colSpan: 1, rowSpan: 1 },
      { label: "Finish", colSpan: 1, rowSpan: 1 },
    ]
  ], []);



  // Grouped data calculation including category rows
  const { groupedData, rowStyles } = useMemo(() => {
    const safeData = Array.isArray(filteredData) ? filteredData : [];

    // First, we need to sort by the grouping category then by ID
    const sortedData = [...safeData].sort((a, b) => {
      if (selectedActivityGroup === 'ALL') {
        // Group by Location
        const locA = a.locations || '';
        const locB = b.locations || '';
        // Push empty locations to the end
        if (locA === '' && locB !== '') return 1;
        if (locA !== '' && locB === '') return -1;
        if (locA !== locB) return locA.localeCompare(locB, undefined, { numeric: true, sensitivity: 'base' });
      } else {
        // Group by Activity Base
        const baseA = extractBase(a.description || '');
        const baseB = extractBase(b.description || '');
        if (baseA !== baseB) return baseA.localeCompare(baseB);
      }
      return (a.activityId || '').localeCompare(b.activityId || '');
    });

    const grouped: any[] = [];
    const styles: Record<number, any> = {};
    let currentCategory: string | null = null;

    sortedData.forEach((row) => {
      const category = selectedActivityGroup === 'ALL'
        ? (row.locations || 'No Location')
        : extractBase(row.description || '');

      if (category !== currentCategory) {
        currentCategory = category;
        // Add Category Header Row
        const headerIdx = grouped.length;
        grouped.push({
          isCategoryRow: true,
          description: currentCategory,
          activityId: '',
          status: '',
          substation: '',
          spv: '',
          locations: '',
          activityGroup: '',
        });
        styles[headerIdx] = {
          backgroundColor: "#FADFAD", // Standard category color used in solar sheets
          fontWeight: "bold",
          isCategoryRow: true,
          color: "#333333" // Standard text color used in solar sheets
        };
      }
      grouped.push(row);
    });

    return { groupedData: grouped, rowStyles: styles };
  }, [filteredData, extractBase, selectedActivityGroup]);

  const tableData = useMemo(() => {
    const formatDt = (dt: any) => {
      if (!dt) return '';
      const dtStr = String(dt).split('T')[0];
      return indianDateFormat(dtStr) || dtStr;
    };

    const rows = groupedData.map((row) => {
      if (row.isCategoryRow) {
        // Category row only shows the location name in the description column (index 2)
        const arr: any = [
          '', // S.No
          '', // Activity ID
          row.description || '',
          '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''
        ];
        (arr as any).isCategoryRow = true;
        return arr;
      }

      // Normal activity row
      const arr: any = [
        "", // Will fill S.No below
        row.activityId || '',
        row.description || (row as any).activities || (row as any).activity || (row as any).activity_name || (row as any).name || (row as any).Name || '',
        row.status || 'Not Started',
        row.substation || '',
        row.spv || '',
        row.locations || '',
        row.activityGroup || '',
        row.feeder || '',
        row.wtgFdnVendor || '',
        formatDt(row.fdnAllotmentDate),
        row.stoneColumnContractor || '',
        row.soilTestStatus || '',
        row.wtgCoordE || '',
        row.wtgCoordN || '',
        row.scope || '',
        row.completed || '',
        formatDt(row.baselineStart),
        formatDt(row.baselineFinish),
        formatDt(row.actualStart),
        formatDt(row.actualFinish),
        formatDt(row.forecastStart),
        formatDt(row.forecastFinish),
        row.noOfDays || '',
      ];
      return arr;
    });

    // Re-calculate S.No for non-category rows
    let sNo = 1;
    rows.forEach(r => {
      if (!(r as any).isCategoryRow) {
        r[0] = String(sNo++);
      }
    });

    return rows;
  }, [groupedData]);

  const handleDataChange = useCallback((newData: any[][]) => {
    // Filter out category rows from the returned data array to find actual activities
    const updated = newData.filter((r: any) => !r.isCategoryRow).map((row) => {
      // We need to find the original activity object by ID to preserve other fields
      const activityId = row[1];
      const original = (filteredData as any[]).find(d => d.activityId === activityId);

      if (!original) return null;

      return {
        ...original,
        _cellStatuses: (row as any)._cellStatuses, // Preserve metadata for delta detection
        feeder: row[8] || '',
        wtgFdnVendor: row[9] || '',
        fdnAllotmentDate: row[10] || '',
        stoneColumnContractor: row[11] || '',
        soilTestStatus: row[12] || '',
        wtgCoordE: row[13] || '',
        wtgCoordN: row[14] || '',
        completed: row[16] || '',
        actualStart: row[19] || '',
        actualFinish: row[20] || '',
        forecastStart: row[21] || '',
        forecastFinish: row[22] || '',
      };
    }).filter(row => row !== null);

    // Merge back into full data
    const fullCopy = [...data];
    updated.forEach(updatedRow => {
      const idx = fullCopy.findIndex(d =>
        d.activityId === updatedRow.activityId
      );
      if (idx !== -1) fullCopy[idx] = updatedRow;
    });
    setData(fullCopy);
  }, [data, filteredData, setData]);

  // Dynamic coloring for dates: Actual Start/Finish vs Forecast Start
  const cellTextColors = useMemo(() => {
    const colors: Record<number, Record<string, string>> = {};

    groupedData.forEach((row, rowIndex) => {
      if (row.isCategoryRow) return;

      const colorsForRow: Record<string, string> = {};

      const parseDate = (dStr: string) => {
        if (!dStr || dStr === '-') return null;
        // Handle both DD-MMM-YY and YYYY-MM-DD
        if (dStr.includes('T')) dStr = dStr.split('T')[0];
        const parts = dStr.split('-');

        if (parts.length === 3) {
          if (parts[0].length === 4) {
            // YYYY-MM-DD
            return new Date(dStr);
          } else {
            // DD-MMM-YY
            const day = parseInt(parts[0]);
            const mStr = parts[1];
            const yrShort = parseInt(parts[2]);
            const mNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
            const mIdx = mNames.indexOf(mStr);
            if (mIdx === -1) return new Date(dStr); // Fallback
            const yr = yrShort + (yrShort < 70 ? 2000 : 1900);
            return new Date(yr, mIdx, day);
          }
        }
        return null;
      };

      const actualStart = parseDate(row.actualStart);
      const actualFinish = parseDate(row.actualFinish);
      const now = new Date();
      now.setHours(0, 0, 0, 0);

      if (actualStart) {
        colorsForRow["Actual Start"] = actualStart < now ? "#16a34a" : "#2563eb";
      }
      if (actualFinish) {
        colorsForRow["Actual Finish"] = actualFinish < now ? "#16a34a" : "#2563eb";
      }

      if (Object.keys(colorsForRow).length > 0) {
        colors[rowIndex] = colorsForRow;
      }
    });

    return colors;
  }, [groupedData]);

  return (
    <div className="space-y-4 w-full flex-1 min-h-0 flex flex-col">
      <StyledExcelTable
        title="Wind Project - Progress Sheet"
        columns={columns}
        data={tableData}
        onDataChange={handleDataChange}
        onSave={onSave || (() => { })}
        onSubmit={onSubmit}
        onPush={onPush}
        isReadOnly={isLocked}
        editableColumns={editableColumns}
        columnTypes={columnTypes}
        columnOptions={{}}
        columnWidths={columnWidths}
        headerStructure={headerStructure}
        rowStyles={rowStyles}
        cellTextColors={cellTextColors}
        status={status}
        onExportAll={onExportAll}
        disableAutoHeaderColors={true}
        projectId={projectId}
        sheetType={sheetType}
      />
    </div>
  );
};
