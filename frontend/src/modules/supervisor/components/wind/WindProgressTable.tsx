import React, { useMemo, useCallback } from 'react';
import { StyledExcelTable } from "@/components/StyledExcelTable";
import { indianDateFormat } from "@/services/dprService";

// Wind Progress Sheet columns:
// S.No, Description, Substation, SPV, Locations, Feeder, WTG FDN Vendor,
// FDN Allotment Date, Stone Column Contractor, Soil Test Status,
// WTG Coordinates (E, N), Scope, Completed,
// Baseline Start, Baseline Finish, Actual Start, Actual Finish,
// Forecast Start, Forecast Finish, No of Days

export interface WindProgressData {
  sNo?: string;
  description: string;
  substation: string;
  spv: string;
  locations: string;
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
  selectedSPV?: string;
  selectedLocation?: string;
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
  selectedSPV = 'ALL',
  selectedLocation = 'ALL',
}) => {
  // Filter based on wind-specific filters
  const filteredData = useMemo(() => {
    if (!Array.isArray(data)) return [];
    let result = data;
    if (selectedSubstation !== 'ALL') {
      result = result.filter(d => d.substation === selectedSubstation);
    }
    if (selectedSPV !== 'ALL') {
      result = result.filter(d => d.spv === selectedSPV);
    }
    if (selectedLocation !== 'ALL') {
      result = result.filter(d => d.locations === selectedLocation);
    }
    return result;
  }, [data, selectedSubstation, selectedSPV, selectedLocation]);

  const columns = useMemo(() => [
    "S.No",
    "Description",
    "Substation",
    "SPV",
    "Locations",
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
    "Description": 220,
    "Substation": 100,
    "SPV": 80,
    "Locations": 100,
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
    "Description": "text" as const,
    "Substation": "text" as const,
    "SPV": "text" as const,
    "Locations": "text" as const,
    "Feeder": "text" as const,
    "WTG FDN Vendor": "text" as const,
    "FDN Allotment Date": "text" as const,
    "Stone Column Contractor": "text" as const,
    "Soil Test Status": "text" as const,
    "Coord E": "text" as const,
    "Coord N": "text" as const,
    "Scope": "number" as const,
    "Completed": "number" as const,
    "Baseline Start": "text" as const,
    "Baseline Finish": "text" as const,
    "Actual Start": "text" as const,
    "Actual Finish": "text" as const,
    "Forecast Start": "text" as const,
    "Forecast Finish": "text" as const,
    "No of Days": "number" as const,
  }), []);

  // Most columns are editable for manual data entry
  const editableColumns = useMemo(() => [
    "Description", "Substation", "SPV", "Locations", "Feeder",
    "WTG FDN Vendor", "FDN Allotment Date", "Stone Column Contractor",
    "Soil Test Status", "Coord E", "Coord N",
    "Scope", "Completed",
    "Actual Start", "Actual Finish", "Forecast Start", "Forecast Finish",
  ], []);

  const headerStructure = useMemo(() => [
    [
      { label: "S.No", rowSpan: 2, colSpan: 1 },
      { label: "Description", rowSpan: 2, colSpan: 1 },
      { label: "Substation", rowSpan: 2, colSpan: 1 },
      { label: "SPV", rowSpan: 2, colSpan: 1 },
      { label: "Locations", rowSpan: 2, colSpan: 1 },
      { label: "Feeder", rowSpan: 2, colSpan: 1 },
      { label: "WTG FDN Vendor", rowSpan: 2, colSpan: 1 },
      { label: "FDN Allotment Date", rowSpan: 2, colSpan: 1 },
      { label: "Stone Column Contractor", rowSpan: 2, colSpan: 1 },
      { label: "Soil Test Status", rowSpan: 2, colSpan: 1 },
      { label: "WTG Coordinates", colSpan: 2, rowSpan: 1 },
      { label: "Scope", rowSpan: 2, colSpan: 1 },
      { label: "Completed", rowSpan: 2, colSpan: 1 },
      { label: "Baseline Start", rowSpan: 2, colSpan: 1 },
      { label: "Baseline Finish", rowSpan: 2, colSpan: 1 },
      { label: "Actual Start", rowSpan: 2, colSpan: 1 },
      { label: "Actual Finish", rowSpan: 2, colSpan: 1 },
      { label: "Forecast Start", rowSpan: 2, colSpan: 1 },
      { label: "Forecast Finish", rowSpan: 2, colSpan: 1 },
      { label: "No of Days", rowSpan: 2, colSpan: 1 },
    ],
    [
      { label: "Coord E", colSpan: 1, rowSpan: 1 },
      { label: "Coord N", colSpan: 1, rowSpan: 1 },
    ]
  ], []);

  const tableData = useMemo(() => {
    const safeData = Array.isArray(filteredData) ? filteredData : [];
    const formatDt = (dt: any) => {
      if (!dt) return '';
      const dtStr = String(dt).split('T')[0];
      return indianDateFormat(dtStr) || dtStr;
    };

    const rows = safeData.map((row, index) => [
      String(index + 1),
      row.description || '',
      row.substation || '',
      row.spv || '',
      row.locations || '',
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
    ]);

    return rows;
  }, [filteredData]);

  const handleDataChange = useCallback((newData: any[][]) => {
    const safeData = Array.isArray(filteredData) ? filteredData : [];
    const actualRows = newData.slice(0, safeData.length);
    const updated = actualRows.map((row, index) => ({
      ...safeData[index],
      description: row[1] || '',
      substation: row[2] || '',
      spv: row[3] || '',
      locations: row[4] || '',
      feeder: row[5] || '',
      wtgFdnVendor: row[6] || '',
      fdnAllotmentDate: row[7] || '',
      stoneColumnContractor: row[8] || '',
      soilTestStatus: row[9] || '',
      wtgCoordE: row[10] || '',
      wtgCoordN: row[11] || '',
      scope: row[12] || '',
      completed: row[13] || '',
      actualStart: row[16] || '',
      actualFinish: row[17] || '',
      forecastStart: row[18] || '',
      forecastFinish: row[19] || '',
    }));

    // Merge back into full data if filtering is applied
    if (selectedSubstation !== 'ALL' || selectedSPV !== 'ALL' || selectedLocation !== 'ALL') {
      const fullCopy = [...data];
      updated.forEach(updatedRow => {
        const idx = fullCopy.findIndex(d =>
          d.description === updatedRow.description &&
          d.substation === updatedRow.substation
        );
        if (idx !== -1) fullCopy[idx] = updatedRow;
      });
      setData(fullCopy);
    } else {
      setData(updated);
    }
  }, [data, filteredData, selectedSubstation, selectedSPV, selectedLocation, setData]);

  return (
    <div className="space-y-4 w-full flex-1 min-h-0 flex flex-col">
      <StyledExcelTable
        title="Wind Project - Progress Sheet"
        columns={columns}
        data={tableData}
        onDataChange={handleDataChange}
        onSave={onSave || (() => {})}
        onSubmit={onSubmit}
        isReadOnly={isLocked}
        editableColumns={editableColumns}
        columnTypes={columnTypes}
        columnWidths={columnWidths}
        headerStructure={headerStructure}
        status={status}
        onExportAll={onExportAll}
        disableAutoHeaderColors={true}
        projectId={projectId}
        sheetType="wind_progress"
      />
    </div>
  );
};
