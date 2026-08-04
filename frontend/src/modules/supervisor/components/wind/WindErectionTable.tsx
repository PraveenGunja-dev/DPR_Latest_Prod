import React, { useMemo, useCallback } from 'react';
import { StyledExcelTable } from "@/components/StyledExcelTable";
import { Plus, Upload } from 'lucide-react';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { indianDateFormat } from "@/services/dprService";

export interface WindErectionData {
  slNo?: string;
  activityId?: string;
  description: string;
  locations?: string;
  craneNo?: string;
  craneAssyStart?: string;
  craneBoomUpFinish?: string;
  wtgTowerEreStart?: string;
  wtgTowerEreFinish?: string;
  nacelleEreStart?: string;
  nacelleEreFinish?: string;
  dtEreStart?: string;
  dtEreFinish?: string;
  hubEreStart?: string;
  hubEreFinish?: string;
  bladeEreStart?: string;
  bladeEreFinish?: string;
  nacelleCoverEreFinish?: string;
  craneBoomDown?: string;
  craneDismentalingStart?: string;
  craneDismentalingFinish?: string;
  craneIntercartingStart?: string;
  craneIntercartingFinish?: string;
  remarks?: string;
  timeLossFmHighWindRain?: string;
  timeLossAgelRow?: string;
  timeLossNonAvailFront?: string;
  timeLossUnavailWtgMaterial?: string;
  timeLossCraneBreakDown?: string;
  timeLossAgelToolsTackles?: string;
  timeLossCraneManpower?: string;
  timeLossEreContractor?: string;
  timeLossTensionTorquing?: string;
  [key: string]: any;
}

interface WindErectionTableProps {
  data: WindErectionData[];
  setData: (data: WindErectionData[]) => void;
  onSave?: () => void;
  onSubmit?: () => void;
  isLocked?: boolean;
  status?: string;
  projectId?: number;
  customActivities?: any[];
  onAddCustomActivity?: (activity: any, silent?: boolean) => void;
  onEditCustomActivity?: (activity: any) => void;
  onDeleteCustomActivity?: (id: number) => void;
  onBulkUploadActivities?: () => void;
}

export const WindErectionTable: React.FC<WindErectionTableProps> = ({
  data,
  setData,
  onSave,
  onSubmit,
  isLocked = false,
  status = 'draft',
  projectId,
  customActivities = [],
  onAddCustomActivity,
  onEditCustomActivity,
  onDeleteCustomActivity,
  onBulkUploadActivities,
}) => {
  const { user } = useAuth();
  const userRole = (user?.role || user?.Role || '').toLowerCase();
  const isPmagOrAdmin = userRole.includes('pmag') || userRole.includes('admin');

  const filteredData = useMemo(() => {
    const baseRows = Array.isArray(data) ? [...data] : [];
    const customRows = Array.isArray(customActivities) ? customActivities : [];

    const matchedCustomIds = new Set<number>();

    const mergedRows = baseRows.map(baseRow => {
      const allMatches = customRows.filter(c =>
        String(c.activityId) === String(baseRow.activityId) ||
        String(c.block) === String(baseRow.locations)
      );

      allMatches.forEach(c => matchedCustomIds.add(c.id));

      if (allMatches.length > 0) {
        const customMatch = allMatches.sort((a, b) => b.id - a.id)[0];
        let ext = customMatch.extraData || {};
        if (typeof ext === 'string') {
          try { ext = JSON.parse(ext); } catch (e) { ext = {}; }
        }
        return {
          ...baseRow,
          _customId: customMatch.id,
          craneNo: ext.craneNo ?? customMatch.craneNo ?? baseRow.craneNo ?? '',
          craneAssyStart: ext.craneAssyStart ?? baseRow.craneAssyStart ?? '',
          craneBoomUpFinish: ext.craneBoomUpFinish ?? baseRow.craneBoomUpFinish ?? '',
          wtgTowerEreStart: ext.wtgTowerEreStart ?? baseRow.wtgTowerEreStart ?? '',
          wtgTowerEreFinish: ext.wtgTowerEreFinish ?? baseRow.wtgTowerEreFinish ?? '',
          nacelleEreStart: ext.nacelleEreStart ?? baseRow.nacelleEreStart ?? '',
          nacelleEreFinish: ext.nacelleEreFinish ?? baseRow.nacelleEreFinish ?? '',
          dtEreStart: ext.dtEreStart ?? baseRow.dtEreStart ?? '',
          dtEreFinish: ext.dtEreFinish ?? baseRow.dtEreFinish ?? '',
          hubEreStart: ext.hubEreStart ?? baseRow.hubEreStart ?? '',
          hubEreFinish: ext.hubEreFinish ?? baseRow.hubEreFinish ?? '',
          bladeEreStart: ext.bladeEreStart ?? baseRow.bladeEreStart ?? '',
          bladeEreFinish: ext.bladeEreFinish ?? baseRow.bladeEreFinish ?? '',
          nacelleCoverEreFinish: ext.nacelleCoverEreFinish ?? baseRow.nacelleCoverEreFinish ?? '',
          craneBoomDown: ext.craneBoomDown ?? baseRow.craneBoomDown ?? '',
          craneDismentalingStart: ext.craneDismentalingStart ?? baseRow.craneDismentalingStart ?? '',
          craneDismentalingFinish: ext.craneDismentalingFinish ?? baseRow.craneDismentalingFinish ?? '',
          craneIntercartingStart: ext.craneIntercartingStart ?? baseRow.craneIntercartingStart ?? '',
          craneIntercartingFinish: ext.craneIntercartingFinish ?? baseRow.craneIntercartingFinish ?? '',
          remarks: ext.remarks ?? customMatch.remarks ?? baseRow.remarks ?? '',
          timeLossFmHighWindRain: ext.timeLossFmHighWindRain ?? baseRow.timeLossFmHighWindRain ?? '',
          timeLossAgelRow: ext.timeLossAgelRow ?? baseRow.timeLossAgelRow ?? '',
          timeLossNonAvailFront: ext.timeLossNonAvailFront ?? baseRow.timeLossNonAvailFront ?? '',
          timeLossUnavailWtgMaterial: ext.timeLossUnavailWtgMaterial ?? baseRow.timeLossUnavailWtgMaterial ?? '',
          timeLossCraneBreakDown: ext.timeLossCraneBreakDown ?? baseRow.timeLossCraneBreakDown ?? '',
          timeLossAgelToolsTackles: ext.timeLossAgelToolsTackles ?? baseRow.timeLossAgelToolsTackles ?? '',
          timeLossCraneManpower: ext.timeLossCraneManpower ?? baseRow.timeLossCraneManpower ?? '',
          timeLossEreContractor: ext.timeLossEreContractor ?? baseRow.timeLossEreContractor ?? '',
          timeLossTensionTorquing: ext.timeLossTensionTorquing ?? baseRow.timeLossTensionTorquing ?? '',
        };
      }
      return baseRow;
    });

    const rawUnmatched = customRows.filter(c => !matchedCustomIds.has(c.id));

    const uniqueUnmatched = Object.values(
      rawUnmatched.reduce((acc: Record<string, any>, c: any) => {
        const key = String(c.block || c.id).toLowerCase();
        if (!acc[key] || acc[key].id < c.id) {
          acc[key] = c;
        }
        return acc;
      }, {})
    );

    const unmatchedRows = uniqueUnmatched.map((c: any, i) => {
      let ext = c.extraData || {};
      if (typeof ext === 'string') {
        try { ext = JSON.parse(ext); } catch (e) { ext = {}; }
      }
      return {
        slNo: String(mergedRows.length + i + 1),
        activityId: c.activityId || '',
        description: c.description || c.block || '',
        locations: c.block || '',
        _customId: c.id,
        craneNo: ext.craneNo || '',
        craneAssyStart: ext.craneAssyStart || '',
        craneBoomUpFinish: ext.craneBoomUpFinish || '',
        wtgTowerEreStart: ext.wtgTowerEreStart || '',
        wtgTowerEreFinish: ext.wtgTowerEreFinish || '',
        nacelleEreStart: ext.nacelleEreStart || '',
        nacelleEreFinish: ext.nacelleEreFinish || '',
        dtEreStart: ext.dtEreStart || '',
        dtEreFinish: ext.dtEreFinish || '',
        hubEreStart: ext.hubEreStart || '',
        hubEreFinish: ext.hubEreFinish || '',
        bladeEreStart: ext.bladeEreStart || '',
        bladeEreFinish: ext.bladeEreFinish || '',
        nacelleCoverEreFinish: ext.nacelleCoverEreFinish || '',
        craneBoomDown: ext.craneBoomDown || '',
        craneDismentalingStart: ext.craneDismentalingStart || '',
        craneDismentalingFinish: ext.craneDismentalingFinish || '',
        craneIntercartingStart: ext.craneIntercartingStart || '',
        craneIntercartingFinish: ext.craneIntercartingFinish || '',
        remarks: ext.remarks || c.remarks || '',
        timeLossFmHighWindRain: ext.timeLossFmHighWindRain || '',
        timeLossAgelRow: ext.timeLossAgelRow || '',
        timeLossNonAvailFront: ext.timeLossNonAvailFront || '',
        timeLossUnavailWtgMaterial: ext.timeLossUnavailWtgMaterial || '',
        timeLossCraneBreakDown: ext.timeLossCraneBreakDown || '',
        timeLossAgelToolsTackles: ext.timeLossAgelToolsTackles || '',
        timeLossCraneManpower: ext.timeLossCraneManpower || '',
        timeLossEreContractor: ext.timeLossEreContractor || '',
        timeLossTensionTorquing: ext.timeLossTensionTorquing || '',
      };
    });

    return [...mergedRows, ...unmatchedRows];
  }, [data, customActivities]);

  const columns = useMemo(() => [
    "Sr. No.",
    "WTG Location",
    "Crane No.",
    "Crane Assy Start date",
    "Crane boom up Finish date",
    "WTG Tower Ere Start date",
    "WTG Tower Ere Finish date",
    "Nacelle Erection Start",
    "Nacelle Erection Finish",
    "DT Erection Start",
    "DT Erection Finish",
    "Hub Erection Start",
    "Hub Erection Finish",
    "Blade Erection Start",
    "Blade Erection Finish",
    "Nacelle Cover Erection Finish",
    "Crane Boom Down",
    "Crane Dismentaling Start",
    "Crane Dismentaling Finish",
    "Crane Intercarting Start",
    "Crane Intercarting Finish",
    "Remarks / Issues",
    "Time Loss due to FM - High Wind / Rain (hr.)",
    "Time Loss due to AGEL ROW (hr.)",
    "Time Loss due to non avaibility of front (hr.)",
    "Time Loss due to unavaibility of WTG material (hr.)",
    "Time Loss due to Crane Break Down (hr.)",
    "Time Loss due to AGEL Tools & Tackles Breakdown (hr.)",
    "Time Loss due to Crane Manpower Issues (hr.)",
    "Time Loss due to Erection Contractor Issues (hr.)",
    "Time Loss due to Tensioning & Torquing Manpower/Tools (hr.)"
  ], []);

  const columnWidths = useMemo(() => {
    const w: any = { "Sr. No.": 70, "WTG Location": 130, "Crane No.": 120, "Remarks / Issues": 200 };
    columns.forEach(c => { if (!w[c]) w[c] = c.includes('Time Loss') ? 150 : 120; });
    return w;
  }, [columns]);

  const columnTypes = useMemo(() => {
    const t: any = { "Sr. No.": "text", "WTG Location": "text", "Crane No.": "text", "Remarks / Issues": "text" };
    columns.forEach(c => { 
      if (!t[c]) {
        if (c.includes('Start') || c.includes('Finish') || c.includes('Down')) t[c] = "date";
        else if (c.includes('Time Loss')) t[c] = "number";
      }
    });
    return t;
  }, [columns]);

  const editableColumns = useMemo(() => columns.filter(c => c !== "Sr. No."), [columns]);

  const headerStructure = useMemo(() => {
    return [ columns.map(c => ({ label: c, rowSpan: 1, colSpan: 1 })) ];
  }, [columns]);

  const tableData = useMemo(() => {
    const rows: any[] = [];
    let addedDprHeader = false;
    const baseRowCount = Array.isArray(data) ? data.length : 0;

    filteredData.forEach((row, index) => {
      if (index >= baseRowCount && row._customId && !addedDprHeader) {
        addedDprHeader = true;
        const headerRow: any = ['', '📝 DPR Level Activities', ...Array(29).fill('')];
        headerRow.isCategoryRow = true;
        headerRow._originalRow = null;
        rows.push(headerRow);
      }

      const arr: any = [
        row.slNo || String(index + 1),
        row.description || row.locations || '',
        row.craneNo || '',
        row.craneAssyStart ? (indianDateFormat(row.craneAssyStart) || row.craneAssyStart) : '',
        row.craneBoomUpFinish ? (indianDateFormat(row.craneBoomUpFinish) || row.craneBoomUpFinish) : '',
        row.wtgTowerEreStart ? (indianDateFormat(row.wtgTowerEreStart) || row.wtgTowerEreStart) : '',
        row.wtgTowerEreFinish ? (indianDateFormat(row.wtgTowerEreFinish) || row.wtgTowerEreFinish) : '',
        row.nacelleEreStart ? (indianDateFormat(row.nacelleEreStart) || row.nacelleEreStart) : '',
        row.nacelleEreFinish ? (indianDateFormat(row.nacelleEreFinish) || row.nacelleEreFinish) : '',
        row.dtEreStart ? (indianDateFormat(row.dtEreStart) || row.dtEreStart) : '',
        row.dtEreFinish ? (indianDateFormat(row.dtEreFinish) || row.dtEreFinish) : '',
        row.hubEreStart ? (indianDateFormat(row.hubEreStart) || row.hubEreStart) : '',
        row.hubEreFinish ? (indianDateFormat(row.hubEreFinish) || row.hubEreFinish) : '',
        row.bladeEreStart ? (indianDateFormat(row.bladeEreStart) || row.bladeEreStart) : '',
        row.bladeEreFinish ? (indianDateFormat(row.bladeEreFinish) || row.bladeEreFinish) : '',
        row.nacelleCoverEreFinish ? (indianDateFormat(row.nacelleCoverEreFinish) || row.nacelleCoverEreFinish) : '',
        row.craneBoomDown ? (indianDateFormat(row.craneBoomDown) || row.craneBoomDown) : '',
        row.craneDismentalingStart ? (indianDateFormat(row.craneDismentalingStart) || row.craneDismentalingStart) : '',
        row.craneDismentalingFinish ? (indianDateFormat(row.craneDismentalingFinish) || row.craneDismentalingFinish) : '',
        row.craneIntercartingStart ? (indianDateFormat(row.craneIntercartingStart) || row.craneIntercartingStart) : '',
        row.craneIntercartingFinish ? (indianDateFormat(row.craneIntercartingFinish) || row.craneIntercartingFinish) : '',
        row.remarks || '',
        row.timeLossFmHighWindRain || '',
        row.timeLossAgelRow || '',
        row.timeLossNonAvailFront || '',
        row.timeLossUnavailWtgMaterial || '',
        row.timeLossCraneBreakDown || '',
        row.timeLossAgelToolsTackles || '',
        row.timeLossCraneManpower || '',
        row.timeLossEreContractor || '',
        row.timeLossTensionTorquing || '',
      ];

      arr._originalRow = row;
      arr._customId = row._customId;
      if (row._customId) arr._isCustomRow = true;
      if (row._cellStatuses) arr._cellStatuses = row._cellStatuses;
      rows.push(arr);
    });

    return rows;
  }, [filteredData, data]);

  const rowStyles = useMemo(() => {
    const styles: Record<number, any> = {};
    tableData.forEach((row, index) => {
      if ((row as any).isCategoryRow) {
        styles[index] = {
          backgroundColor: '#FADFAD',
          color: '#333333',
          fontWeight: 'bold',
          isCategoryRow: true,
        };
      } else if ((row as any)._isCustomRow) {
        styles[index] = {
          backgroundColor: '#FFFBEB',
        };
      }
    });
    return styles;
  }, [tableData]);

  const handleDataChange = useCallback((newData: any[][]) => {
    let changedRowIndex = -1;
    for (let i = 0; i < newData.length; i++) {
      const oldRow = tableData[i];
      const newRow = newData[i];
      if (!oldRow || !newRow) continue;
      if ((oldRow as any).isCategoryRow) continue;
      for (let j = 0; j < newRow.length; j++) {
        if (String(newRow[j] || '') !== String(oldRow[j] || '')) {
          changedRowIndex = i;
          break;
        }
      }
      if (changedRowIndex >= 0) break;
    }

    if (changedRowIndex < 0) return;

    const row = newData[changedRowIndex];
    const original = (tableData[changedRowIndex] as any)?._originalRow;
    if (!original || !row) return;

    const [
      _, newLocation, newCraneNo, newCraneAssyStart, newCraneBoomUpFinish, newWtgTowerEreStart, 
      newWtgTowerEreFinish, newNacelleEreStart, newNacelleEreFinish, newDtEreStart, newDtEreFinish,
      newHubEreStart, newHubEreFinish, newBladeEreStart, newBladeEreFinish, newNacelleCoverEreFinish,
      newCraneBoomDown, newCraneDismentalingStart, newCraneDismentalingFinish, newCraneIntercartingStart,
      newCraneIntercartingFinish, newRemarks, newTimeLossFmHighWindRain, newTimeLossAgelRow, 
      newTimeLossNonAvailFront, newTimeLossUnavailWtgMaterial, newTimeLossCraneBreakDown, 
      newTimeLossAgelToolsTackles, newTimeLossCraneManpower, newTimeLossEreContractor, newTimeLossTensionTorquing
    ] = row;

    const extraDataObj = {
      craneNo: newCraneNo,
      craneAssyStart: newCraneAssyStart,
      craneBoomUpFinish: newCraneBoomUpFinish,
      wtgTowerEreStart: newWtgTowerEreStart,
      wtgTowerEreFinish: newWtgTowerEreFinish,
      nacelleEreStart: newNacelleEreStart,
      nacelleEreFinish: newNacelleEreFinish,
      dtEreStart: newDtEreStart,
      dtEreFinish: newDtEreFinish,
      hubEreStart: newHubEreStart,
      hubEreFinish: newHubEreFinish,
      bladeEreStart: newBladeEreStart,
      bladeEreFinish: newBladeEreFinish,
      nacelleCoverEreFinish: newNacelleCoverEreFinish,
      craneBoomDown: newCraneBoomDown,
      craneDismentalingStart: newCraneDismentalingStart,
      craneDismentalingFinish: newCraneDismentalingFinish,
      craneIntercartingStart: newCraneIntercartingStart,
      craneIntercartingFinish: newCraneIntercartingFinish,
      remarks: newRemarks,
      timeLossFmHighWindRain: newTimeLossFmHighWindRain,
      timeLossAgelRow: newTimeLossAgelRow,
      timeLossNonAvailFront: newTimeLossNonAvailFront,
      timeLossUnavailWtgMaterial: newTimeLossUnavailWtgMaterial,
      timeLossCraneBreakDown: newTimeLossCraneBreakDown,
      timeLossAgelToolsTackles: newTimeLossAgelToolsTackles,
      timeLossCraneManpower: newTimeLossCraneManpower,
      timeLossEreContractor: newTimeLossEreContractor,
      timeLossTensionTorquing: newTimeLossTensionTorquing
    };

    if (original._customId && onEditCustomActivity) {
      onEditCustomActivity({
        id: original._customId,
        sheetType: 'wind_erection',
        description: newLocation,
        block: newLocation,
        plannedStart: original.startDate,
        plannedFinish: original.finishDate,
        remarks: newRemarks,
        extraData: extraDataObj
      });
    } else if (!original._customId && onAddCustomActivity) {
      onAddCustomActivity({
        sheetType: 'wind_erection',
        description: newLocation,
        block: newLocation,
        plannedStart: '',
        plannedFinish: '',
        remarks: newRemarks,
        extraData: extraDataObj
}, true);
    }

    const dataIndex = (data as any[]).findIndex(d => d === original ||
      (d.activityId && d.activityId === original.activityId) ||
      (d.locations && d.locations === original.locations && d.description === original.description));
    if (dataIndex < 0) return;

    const updatedData = [...(data as any[])];
    updatedData[dataIndex] = {
      ...original,
      description: newLocation,
      locations: newLocation,
      ...extraDataObj,
      _cellStatuses: row._cellStatuses
    };

    setData(updatedData);
  }, [filteredData, tableData, data, setData, onEditCustomActivity, onAddCustomActivity]);

  const handleRowDelete = useCallback((index: number) => {
    const tableRow = tableData[index];
    if (tableRow && (tableRow as any)._isCustomRow && onDeleteCustomActivity) {
      const customId = (tableRow as any)._customId;
      if (customId) onDeleteCustomActivity(customId);
    }
  }, [tableData, onDeleteCustomActivity]);

  const handleInlineAdd = useCallback(() => {
    if (onAddCustomActivity) {
      onAddCustomActivity({
        sheetType: 'wind_erection',
        description: 'New WTG Location',
        block: 'New WTG Location',
}, true);
    }
  }, [onAddCustomActivity]);

  return (
    <div className="space-y-4 w-full h-full flex-1 min-h-0 flex flex-col">
      <div className="flex items-center justify-between bg-white p-2 rounded-md shadow-sm border">
        <div className="flex items-center space-x-4">
          <h2 className="text-lg font-semibold text-gray-800">Erection</h2>
        </div>
        {!isLocked && (
          <div className="flex items-center space-x-2">
            {onBulkUploadActivities && (
              <button
                onClick={onBulkUploadActivities}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors shadow-sm"
              >
                <Upload className="w-4 h-4" />
                Bulk Upload
              </button>
            )}
            {onAddCustomActivity && (
              <button
                onClick={handleInlineAdd}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
              >
                <Plus className="w-4 h-4" />
                Add Row
              </button>
            )}
          </div>
        )}
      </div>

      <StyledExcelTable
        title="Wind Project - Erection Sheet"
        columns={columns}
        data={tableData}
        columnWidths={columnWidths}
        columnTypes={columnTypes}
        editableColumns={isLocked ? [] : editableColumns}
        onDataChange={handleDataChange}
        hasChanges={status === 'draft'}
        onSave={isLocked ? undefined : onSave}
        onSubmit={isLocked ? undefined : onSubmit}
        isReadOnly={isLocked}
        headerStructure={headerStructure}
        disableAutoHeaderColors={true}
        sheetType="wind_erection"
        projectId={projectId}
        rowStyles={rowStyles}
        onRowDelete={!isLocked && onDeleteCustomActivity ? handleRowDelete : undefined}
        rowIsDeletable={(idx) => !!(tableData[idx] as any)?._isCustomRow && isPmagOrAdmin}
        fixedColumnsCount={3}
      />
    </div>
  );
};

