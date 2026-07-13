import React, { useMemo, useCallback } from 'react';
import { StyledExcelTable } from "@/components/StyledExcelTable";
import { indianDateFormat } from "@/services/dprService";
import { Plus, Upload } from 'lucide-react';
import { useAuth } from '@/modules/auth/contexts/AuthContext';

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
  selectedResourceId?: string;
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
  onFullscreenToggle?: (isFullscreen: boolean) => void;
  resourcesByActivity?: Record<string, any[]>;
  customActivities?: any[];
  onAddCustomActivity?: (activity: any) => void;
  onEditCustomActivity?: (activity: any) => void;
  onDeleteCustomActivity?: (id: number) => void;
  onBulkUploadActivities?: () => void;
  activityDateFilter?: string;
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
  onFullscreenToggle,
  resourcesByActivity = {},
  customActivities = [],
  onAddCustomActivity,
  onEditCustomActivity,
  onDeleteCustomActivity,
  onBulkUploadActivities,
  activityDateFilter,
}) => {
  const { user } = useAuth();
  const userRole = (user?.role || user?.Role || '').toLowerCase();
  const isPmagOrAdmin = userRole.includes('pmag') || userRole.includes('admin');

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
    return result;
  }, [data, selectedActivityGroup, selectedActivity, selectedLocation, selectedSubstation, extractBase]);

  const columns = useMemo(() => {
    const baseCols = [
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
      "Resource",
      "Scope",
      "Completed",
      "Baseline Start"
    ];

    if (activityDateFilter === "Delayed Activities") {
      baseCols.push(
        "Actual Start",
        "Actual Finish",
        "Forecast Start",
        "Forecast Finish",
        "No of Days Delay"
      );
    } else {
      baseCols.push(
        "Baseline Finish",
        "Actual Start",
        "Actual Finish",
        "Forecast Start",
        "Forecast Finish",
        "No of Days"
      );
    }
    return baseCols;
  }, [activityDateFilter]);

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
    "Resource": 140,
    "Scope": 70,
    "Completed": 80,
    "Baseline Start": 100,
    "Baseline Finish": 100,
    "Actual Start": 100,
    "Actual Finish": 100,
    "Forecast Start": 100,
    "Forecast Finish": 100,
    "No of Days": 80,
    "No of Days Delay": 80,
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
    "Resource": "select" as const,
    "Scope": "number" as const,
    "Completed": "number" as const,
    "Baseline Start": "text" as const,
    "Baseline Finish": "text" as const,
    "Actual Start": "date" as const,
    "Actual Finish": "date" as const,
    "Forecast Start": "date" as const,
    "Forecast Finish": "date" as const,
    "No of Days": "number" as const,
    "No of Days Delay": "number" as const,
  }), []);

  // For custom rows, Description, Substation, SPV, Location, Activity Group, Scope can also be editable
  const editableColumns = useMemo(() => [
    "Description", "Status", "Substation", "SPV", "Location", "Activity Group",
    "Feeder", "WTG FDN Vendor", "FDN Allotment Date",
    "Stone Column Contractor", "Soil Test Status", "Coord E", "Coord N",
    "Resource", "Scope", "Completed", "Actual Start", "Actual Finish",
  ], []);

  const headerStructure = useMemo(() => {
    const topRow = [
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
      { label: "Resource", rowSpan: 2, colSpan: 1 },
      { label: "Scope", rowSpan: 2, colSpan: 1 },
      { label: "Completed", rowSpan: 2, colSpan: 1 }
    ];

    const bottomRow = [
      { label: "Coord E", colSpan: 1, rowSpan: 1 },
      { label: "Coord N", colSpan: 1, rowSpan: 1 }
    ];

    if (activityDateFilter === "Delayed Activities") {
      topRow.push(
        { label: "Baseline Start", rowSpan: 2, colSpan: 1 },
        { label: "Actual", colSpan: 2, rowSpan: 1 },
        { label: "Forecast", colSpan: 2, rowSpan: 1 },
        { label: "No of Days Delay", rowSpan: 2, colSpan: 1 }
      );
      bottomRow.push(
        { label: "Start", colSpan: 1, rowSpan: 1 },
        { label: "Finish", colSpan: 1, rowSpan: 1 },
        { label: "Start", colSpan: 1, rowSpan: 1 },
        { label: "Finish", colSpan: 1, rowSpan: 1 }
      );
    } else {
      topRow.push(
        { label: "Baseline", colSpan: 2, rowSpan: 1 },
        { label: "Actual", colSpan: 2, rowSpan: 1 },
        { label: "Forecast", colSpan: 2, rowSpan: 1 },
        { label: "No of Days", rowSpan: 2, colSpan: 1 }
      );
      bottomRow.push(
        { label: "Start", colSpan: 1, rowSpan: 1 },
        { label: "Finish", colSpan: 1, rowSpan: 1 },
        { label: "Start", colSpan: 1, rowSpan: 1 },
        { label: "Finish", colSpan: 1, rowSpan: 1 },
        { label: "Start", colSpan: 1, rowSpan: 1 },
        { label: "Finish", colSpan: 1, rowSpan: 1 }
      );
    }

    return [topRow, bottomRow];
  }, [activityDateFilter]);

  // Grouped data calculation including category rows + custom activities
  const { groupedData, rowStyles } = useMemo(() => {
    const safeData = Array.isArray(filteredData) ? filteredData : [];
    const safeCustom = Array.isArray(customActivities) ? customActivities : [];

    // Filter custom activities based on the current location/substation/group filters
    const filteredCustom = safeCustom.filter(c => {
      if (selectedLocation !== 'ALL' && selectedLocation !== 'No Location' && c.block !== selectedLocation) return false;
      if (selectedActivityGroup !== 'ALL' && c.category !== selectedActivityGroup) return false;
      return true;
    });

    // Pre-merge custom rows into base data
    const matchedCustomIds = new Set<number>();

    const mergedData = safeData.map(baseRow => {
      const allMatches = filteredCustom.filter(c =>
        (c.activityId && String(c.activityId) === String(baseRow.activityId)) ||
        (c.description && String(c.description) === String(baseRow.description))
      );

      if (allMatches.length > 0) {
        allMatches.forEach(c => matchedCustomIds.add(c.id));
        const customMatch = allMatches.sort((a, b) => b.id - a.id)[0];
        let ext = customMatch.extraData || {};
        if (typeof ext === 'string') {
          try { ext = JSON.parse(ext); } catch (e) { ext = {}; }
        }
        return {
          ...baseRow,
          ...ext,
          substation: ext.substation || customMatch.substation || baseRow.substation,
          spv: ext.spv || customMatch.spv || baseRow.spv,
          locations: customMatch.block || baseRow.locations,
          activityGroup: customMatch.category || baseRow.activityGroup,
          feeder: ext.feeder || baseRow.feeder,
          wtgFdnVendor: ext.wtgFdnVendor || baseRow.wtgFdnVendor,
          fdnAllotmentDate: ext.fdnAllotmentDate || baseRow.fdnAllotmentDate,
          stoneColumnContractor: ext.stoneColumnContractor || baseRow.stoneColumnContractor,
          soilTestStatus: ext.soilTestStatus || baseRow.soilTestStatus,
          wtgCoordE: ext.wtgCoordE || baseRow.wtgCoordE,
          wtgCoordN: ext.wtgCoordN || baseRow.wtgCoordN,
          scope: customMatch.scope || baseRow.scope,
          completed: customMatch.cumulative || baseRow.completed,
          actualStart: customMatch.plannedStart || baseRow.actualStart,
          actualFinish: customMatch.plannedFinish || baseRow.actualFinish,
          _isCustomMerged: true,
          _customId: customMatch.id
        };
      }
      return baseRow;
    });

    const rawUnmatched = filteredCustom.filter(c => !matchedCustomIds.has(c.id));
    const uniqueUnmatched = Object.values(
      rawUnmatched.reduce((acc: Record<string, any>, c: any) => {
        const key = c.description || `unmatched_${c.id}`;
        if (!acc[key] || acc[key].id < c.id) {
          acc[key] = { ...c, isCustom: true, _isCustomRow: true };
        }
        return acc;
      }, {})
    ) as any[];

    const isOthersAct = (row: any) => {
      const group = (row.activityGroup || '').toUpperCase();
      const desc = (row.description || '').toUpperCase();
      const actId = (row.activityId || '').toUpperCase();

      const othersGroups = ['HOTO', 'MILESTONES', 'HSE', 'QA/QC', 'ENG', 'ORD', 'DEL', 'PRC', 'ENGINEERING', 'PROCUREMENT', 'LA', 'LAND ACQUISITION'];
      if (othersGroups.includes(group)) return true;

      const keywords = ['HOTO', 'MILESTONE', 'HSE', 'QA/QC', 'LAND ACQUISITION', '-LA-'];
      if (keywords.some(k => actId.includes(k) || desc.includes(k))) return true;

      return false;
    };

    const sortedData = [...mergedData].sort((a, b) => {
      if (selectedActivityGroup === 'ALL') {
        const locA = a.locations || '';
        const locB = b.locations || '';

        const isOthersA = isOthersAct(a);
        const isOthersB = isOthersAct(b);

        if (isOthersA && !isOthersB) return 1;
        if (!isOthersA && isOthersB) return -1;

        if (locA === '' && locB !== '') return 1;
        if (locA !== '' && locB === '') return -1;
        if (locA !== locB) return locA.localeCompare(locB, undefined, { numeric: true, sensitivity: 'base' });
      } else {
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
      let category = selectedActivityGroup === 'ALL'
        ? (row.locations || 'OTHERS')
        : extractBase(row.description || '');

      if (selectedActivityGroup === 'ALL' && isOthersAct(row)) {
        category = 'OTHERS';
      }

      if (category !== currentCategory) {
        currentCategory = category;

        let categoryCount = 0;
        sortedData.forEach(r => {
          let cat = selectedActivityGroup === 'ALL'
            ? (r.locations || 'OTHERS')
            : extractBase(r.description || '');
          if (selectedActivityGroup === 'ALL' && isOthersAct(r)) {
            cat = 'OTHERS';
          }
          if (cat === category) categoryCount++;
        });

        if (categoryCount >= 1) {
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
            backgroundColor: "#FADFAD",
            fontWeight: "bold",
            isCategoryRow: true,
            color: "#333333"
          };
        }
      }
      
      const rowIdx = grouped.length;
      grouped.push(row);
      
      const actId = String(row.activityId || '').trim();
      const resources = actId ? resourcesByActivity[actId] : undefined;
      if (!resources || resources.length === 0) {
        styles[rowIdx] = {
          readonlyCells: []
        };
      }
    });

    // Append DPR Custom Activities
    if (uniqueUnmatched.length > 0) {
      const dprHeaderIdx = grouped.length;
      grouped.push({
        isCategoryRow: true,
        description: "📝 DPR Level Activities",
        activityId: '',
        status: '',
        substation: '',
        spv: '',
        locations: '',
        activityGroup: '',
      });
      styles[dprHeaderIdx] = {
        backgroundColor: '#FADFAD',
        color: '#333333',
        fontWeight: "bold",
        isCategoryRow: true,
      };

      uniqueUnmatched.forEach(c => {
        const customIdx = grouped.length;
        grouped.push({
          ...c,
          isCustom: true,
          _isCustomRow: true,
          _customId: c.id,
          description: c.description || '',
          status: c.status || 'Not Started',
          substation: c.extraData?.substation || '',
          spv: c.extraData?.spv || '',
          locations: c.block || '',
          activityGroup: c.category || '',
          scope: c.scope || 0,
          completed: c.cumulative || 0,
        });
        styles[customIdx] = {
          backgroundColor: "#FFFBEB",
        };
      });
    }

    return { groupedData: grouped, rowStyles: styles };
  }, [filteredData, customActivities, extractBase, selectedActivityGroup, selectedLocation, resourcesByActivity]);

  const tableData = useMemo(() => {
    const formatDt = (dt: any) => {
      if (!dt) return '';
      const dtStr = String(dt).split('T')[0];
      return indianDateFormat(dtStr) || dtStr;
    };

    const parsedYesterdayStr = yesterday ? String(yesterday).split('T')[0] : '';

    const getDates = (r: any) => {
      const s = r.actualStart || r.plannedStart || r.forecastStart;
      const f = r.actualFinish || r.plannedFinish || r.forecastFinish;
      let actS = '', fcstS = '', actF = '', fcstF = '';

      if (s) {
        const sStr = String(s).split('T')[0];
        if (parsedYesterdayStr && sStr <= parsedYesterdayStr) {
          actS = indianDateFormat(sStr) || sStr;
        } else {
          fcstS = indianDateFormat(sStr) || sStr;
        }
      }
      if (f) {
        const fStr = String(f).split('T')[0];
        if (parsedYesterdayStr && fStr <= parsedYesterdayStr) {
          actF = indianDateFormat(fStr) || fStr;
        } else {
          fcstF = indianDateFormat(fStr) || fStr;
        }
      }
      return { actS, fcstS, actF, fcstF };
    };

    const rows = groupedData.map((row) => {
      if (row.isCategoryRow) {
        const arr: any = [
          '', '', row.description || '',
          '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''
        ];
        (arr as any).isCategoryRow = true;
        return arr;
      }

      let finalResourceId = String(row.selectedResourceId || '').trim();
      const actId = String(row.activityId || '').trim();

      if (!row.isCustom && !finalResourceId && actId && resourcesByActivity) {
        const resources = resourcesByActivity[actId];
        if (resources && resources.length === 1) {
          finalResourceId = String(resources[0].resourceId).trim();
        }
      }

      const resources = actId ? resourcesByActivity[actId] : undefined;
      const selectedRes = resources?.find(r => String(r.resourceId) === String(finalResourceId));

      let displayScope = row.scope || '';
      let displayCompleted = row.completed || '';

      if (!row.isCustom && selectedRes) {
        displayScope = String(selectedRes.plannedUnits || 0);
        displayCompleted = String(selectedRes.actualUnits || 0);
      }

      const d = getDates(row);

      // Activities without resources still show activity-level dates

      const arr: any = [
        "", // S.No
        row.activityId || '',
        row.description || '',
        row.status || 'Not Started',
        row.substation || '',
        row.spv || '',
        row.locations || '',
        row.activityGroup || '',
        row.feeder || row.extraData?.feeder || '',
        row.wtgFdnVendor || row.extraData?.wtgFdnVendor || '',
        formatDt(row.fdnAllotmentDate || row.extraData?.fdnAllotmentDate),
        row.stoneColumnContractor || row.extraData?.stoneColumnContractor || '',
        row.soilTestStatus || row.extraData?.soilTestStatus || '',
        row.wtgCoordE || row.extraData?.wtgCoordE || '',
        row.wtgCoordN || row.extraData?.wtgCoordN || '',
        finalResourceId,
        displayScope,
        displayCompleted,
        formatDt(row.baselineStart),
        formatDt(row.baselineFinish),
        d.actS,
        d.actF,
        d.fcstS,
        d.fcstF,
        row.noOfDays || '',
      ];

      if (row.isCustom) {
        arr._isCustomRow = true;
        arr._customId = row._customId;
      }
      if (row._cellStatuses) {
        arr._cellStatuses = row._cellStatuses;
      }

      return arr;
    });

    let sNo = 1;
    rows.forEach(r => {
      if (!(r as any).isCategoryRow) {
        r[0] = String(sNo++);
      }
    });

    return rows;
  }, [groupedData, resourcesByActivity]);

  const handleInlineAdd = useCallback(() => {
    if (onAddCustomActivity) {
      onAddCustomActivity({
        sheetType: 'wind_progress',
        description: 'New DPR Activity',
        uom: 'Nos',
        scope: 0,
        category: selectedActivityGroup !== 'ALL' ? selectedActivityGroup : '',
        block: selectedLocation !== 'ALL' && selectedLocation !== 'No Location' ? selectedLocation : '',
      });
    }
  }, [onAddCustomActivity, selectedActivityGroup, selectedLocation]);

  const handleDataChange = useCallback((newData: any[][]) => {
    const p6RowChanges: any[] = [];
    const customRowChanges: any[] = [];

    newData.filter((r: any) => !r.isCategoryRow).forEach((row) => {
      if ((row as any)._isCustomRow) {
        customRowChanges.push(row);
      } else {
        p6RowChanges.push(row);
      }
    });

    // Update P6 rows
    const updatedP6 = p6RowChanges.map((row) => {
      const activityId = row[1];
      const original = (filteredData as any[]).find(d => d.activityId === activityId);
      if (!original) return null;

      const newSelectedResourceId = row[15] || '';
      const actId = original.activityId;
      const resources = actId ? resourcesByActivity[actId] : undefined;
      const selectedRes = resources?.find(r => String(r.resourceId) === String(newSelectedResourceId));

      let newCompleted = row[17] || '';
      let newScope = original.scope;
      if (selectedRes) {
        newScope = String(selectedRes.plannedUnits || 0);
      }

      const newActualStart = row[20] || '';
      const newActualFinish = row[21] || '';
      let newForecastStart = row[22] || '';
      let newForecastFinish = row[23] || '';

      const prevEffectiveStart = indianDateFormat(original.actualStart || original.plannedStart) || '';
      let finalActualStart = original.actualStart || '';
      if (newActualStart !== prevEffectiveStart) {
        let isFuture = false;
        if (newActualStart && yesterday) {
          const editedDateStr = new Date(newActualStart).toISOString().split('T')[0];
          const calDateStr = new Date(today || yesterday).toISOString().split('T')[0];
          if (editedDateStr > calDateStr) isFuture = true;
        }
        if (isFuture) {
          if (window.confirm("You selected a future date for an Actual Start.\nP6 only accepts past/present dates for Actuals.\n\nClick OK to automatically save it as a Forecast date instead.\nClick Cancel to undo your change.")) {
            newForecastStart = newActualStart;
            finalActualStart = original.actualStart || '';
          }
        } else {
          finalActualStart = newActualStart;
        }
      }

      const prevEffectiveFinish = indianDateFormat(original.actualFinish || original.plannedFinish) || '';
      let finalActualFinish = original.actualFinish || '';
      if (newActualFinish !== prevEffectiveFinish) {
        let isFuture = false;
        if (newActualFinish && yesterday) {
          const editedDateStr = new Date(newActualFinish).toISOString().split('T')[0];
          const calDateStr = new Date(today || yesterday).toISOString().split('T')[0];
          if (editedDateStr > calDateStr) isFuture = true;
        }
        if (isFuture) {
          if (window.confirm("You selected a future date for an Actual Finish.\nP6 only accepts past/present dates for Actuals.\n\nClick OK to automatically save it as a Forecast date instead.\nClick Cancel to undo your change.")) {
            newForecastFinish = newActualFinish;
            finalActualFinish = original.actualFinish || '';
          }
        } else {
          finalActualFinish = newActualFinish;
        }
      }

      return {
        ...original,
        _cellStatuses: (row as any)._cellStatuses,
        feeder: row[8] || '',
        wtgFdnVendor: row[9] || '',
        fdnAllotmentDate: row[10] || '',
        stoneColumnContractor: row[11] || '',
        soilTestStatus: row[12] || '',
        wtgCoordE: row[13] || '',
        wtgCoordN: row[14] || '',
        selectedResourceId: newSelectedResourceId,
        scope: newScope,
        completed: newCompleted,
        actualStart: finalActualStart,
        actualFinish: finalActualFinish,
        forecastStart: newForecastStart !== (indianDateFormat(original.forecastStart) || '')
          ? newForecastStart : (original.forecastStart || ''),
        forecastFinish: newForecastFinish !== (indianDateFormat(original.forecastFinish) || '')
          ? newForecastFinish : (original.forecastFinish || ''),
      };
    }).filter(row => row !== null);

    updatedP6.forEach(updatedRow => {
      const originalDataRow = filteredData.find(d => d.activityId === updatedRow.activityId);
      if (originalDataRow && (originalDataRow as any)._customId && onEditCustomActivity) {
        onEditCustomActivity({
          id: (originalDataRow as any)._customId,
          sheetType: 'wind_progress',
          description: updatedRow.description,
          status: updatedRow.status || 'Not Started',
          category: updatedRow.activityGroup,
          block: updatedRow.locations,
          scope: Number(updatedRow.scope) || 0,
          cumulative: Number(updatedRow.completed) || 0,
          plannedStart: updatedRow.actualStart,
          plannedFinish: updatedRow.actualFinish,
          extraData: {
            ...originalDataRow.extraData,
            substation: updatedRow.substation,
            spv: updatedRow.spv,
            feeder: updatedRow.feeder,
            wtgFdnVendor: updatedRow.wtgFdnVendor,
            fdnAllotmentDate: updatedRow.fdnAllotmentDate,
            stoneColumnContractor: updatedRow.stoneColumnContractor,
            soilTestStatus: updatedRow.soilTestStatus,
            wtgCoordE: updatedRow.wtgCoordE,
            wtgCoordN: updatedRow.wtgCoordN,
          }
        });
      }
    });

    const fullCopy = [...data];
    updatedP6.forEach(updatedRow => {
      const idx = fullCopy.findIndex(d => d.activityId === updatedRow.activityId);
      if (idx !== -1) fullCopy[idx] = updatedRow;
    });
    setData(fullCopy);

    // Update custom rows inline
    if (onEditCustomActivity && customRowChanges.length > 0) {
      customRowChanges.forEach((row) => {
        const customId = (row as any)._customId;
        if (!customId) return;
        const original = customActivities.find(c => c.id === customId);
        if (!original) return;

        const newDesc = row[2] || '';
        const newStatus = row[3] || 'Not Started';
        const newSub = row[4] || '';
        const newSpv = row[5] || '';
        const newLoc = row[6] || '';
        const newGroup = row[7] || '';

        const newFeeder = row[8] || '';
        const newVendor = row[9] || '';
        const newDate = row[10] || '';
        const newContractor = row[11] || '';
        const newSoil = row[12] || '';
        const newE = row[13] || '';
        const newN = row[14] || '';

        const newScope = row[16] || '0';
        const newCum = row[17] || '0';
        const newActStart = row[20] || '';
        const newActFinish = row[21] || '';
        const newFcstStart = row[22] || '';
        const newFcstFinish = row[23] || '';

        let finalCustomActStart = original.actualStart || '';
        if (newActStart !== (indianDateFormat(original.actualStart) || '')) {
          let isFuture = false;
          if (newActStart && yesterday) {
            const editedDateStr = new Date(newActStart).toISOString().split('T')[0];
            const calDateStr = new Date(today || yesterday).toISOString().split('T')[0];
            if (editedDateStr > calDateStr) isFuture = true;
          }
          if (isFuture) {
            if (window.confirm("You selected a future date for an Actual Start.\nP6 only accepts past/present dates for Actuals.\n\nClick OK to automatically save it as a Forecast date instead.\nClick Cancel to undo your change.")) {
              finalCustomActStart = newActStart;
            }
          } else {
            finalCustomActStart = newActStart;
          }
        }

        let finalCustomActFinish = original.actualFinish || '';
        if (newActFinish !== (indianDateFormat(original.actualFinish) || '')) {
          let isFuture = false;
          if (newActFinish && yesterday) {
            const editedDateStr = new Date(newActFinish).toISOString().split('T')[0];
            const calDateStr = new Date(today || yesterday).toISOString().split('T')[0];
            if (editedDateStr > calDateStr) isFuture = true;
          }
          if (isFuture) {
            if (window.confirm("You selected a future date for an Actual Finish.\nP6 only accepts past/present dates for Actuals.\n\nClick OK to automatically save it as a Forecast date instead.\nClick Cancel to undo your change.")) {
              finalCustomActFinish = newActFinish;
            }
          } else {
            finalCustomActFinish = newActFinish;
          }
        }

        const hasChanges =
          newDesc !== (original.description || '') ||
          newStatus !== (original.status || 'Not Started') ||
          newSub !== (original.extraData?.substation || '') ||
          newSpv !== (original.extraData?.spv || '') ||
          newLoc !== (original.block || '') ||
          newGroup !== (original.category || '') ||
          newScope !== String(original.scope || 0) ||
          newCum !== String(original.cumulative || '0') ||
          finalCustomActStart !== (original.actualStart || '') ||
          finalCustomActFinish !== (original.actualFinish || '') ||
          newFcstStart !== (indianDateFormat(original.forecastStart) || '') ||
          newFeeder !== (original.extraData?.feeder || '') ||
          newVendor !== (original.extraData?.wtgFdnVendor || '') ||
          newDate !== (original.extraData?.fdnAllotmentDate || '') ||
          newContractor !== (original.extraData?.stoneColumnContractor || '') ||
          newSoil !== (original.extraData?.soilTestStatus || '') ||
          newE !== (original.extraData?.wtgCoordE || '') ||
          newN !== (original.extraData?.wtgCoordN || '');

        if (hasChanges) {
          onEditCustomActivity({
            id: customId,
            sheetType: 'wind_progress',
            description: newDesc,
            status: newStatus,
            category: newGroup,
            block: newLoc,
            scope: Number(newScope) || 0,
            cumulative: Number(newCum) || 0,
            plannedStart: newActStart,
            plannedFinish: newActFinish,
            extraData: {
              ...original.extraData,
              substation: newSub,
              spv: newSpv,
              feeder: newFeeder,
              wtgFdnVendor: newVendor,
              fdnAllotmentDate: newDate,
              stoneColumnContractor: newContractor,
              soilTestStatus: newSoil,
              wtgCoordE: newE,
              wtgCoordN: newN,
            }
          });
        }
      });
    }
  }, [data, filteredData, setData, customActivities, onEditCustomActivity, resourcesByActivity]);

  const cellTextColors = useMemo(() => {
    const colors: Record<number, Record<string, string>> = {};

    groupedData.forEach((row, rowIndex) => {
      if (row.isCategoryRow) return;

      const colorsForRow: Record<string, string> = {};

      const parseDate = (dStr: string) => {
        if (!dStr || dStr === '-') return null;
        if (dStr.includes('T')) dStr = dStr.split('T')[0];
        const parts = dStr.split('-');

        if (parts.length === 3) {
          if (parts[0].length === 4) return new Date(dStr);
          const day = parseInt(parts[0]);
          const mStr = parts[1];
          const yrShort = parseInt(parts[2]);
          const mNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
          const mIdx = mNames.indexOf(mStr);
          if (mIdx === -1) return new Date(dStr);
          const yr = yrShort + (yrShort < 70 ? 2000 : 1900);
          return new Date(yr, mIdx, day);
        }
        return null;
      };

      const isValidDate = (dStr: string | null | undefined) => dStr && typeof dStr === 'string' && dStr.trim() !== '' && dStr !== '-';

      if (isValidDate(row.actualStart || row.plannedStart)) {
        colorsForRow["Actual Start"] = "#16a34a";
      }
      if (isValidDate(row.actualFinish || row.plannedFinish)) {
        colorsForRow["Actual Finish"] = "#16a34a";
      }
      if (isValidDate(row.forecastStart)) {
        colorsForRow["Forecast Start"] = "#2563eb";
      }
      if (isValidDate(row.forecastFinish)) {
        colorsForRow["Forecast Finish"] = "#2563eb";
      }

      if (Object.keys(colorsForRow).length > 0) {
        colors[rowIndex] = colorsForRow;
      }
    });

    return colors;
  }, [groupedData]);

  const rowColumnOptions = useMemo(() => {
    const opts: Record<number, Record<string, { label: string, value: string }[]>> = {};
    groupedData.forEach((row, index) => {
      if (row.isCategoryRow || row.isCustom) return;
      const actId = String(row.activityId || '').trim();
      if (!actId) return;
      const resources = resourcesByActivity[actId];
      if (resources && resources.length > 0) {
        opts[index] = {
          "Resource": resources.map(r => ({
            label: r.resourceName,
            value: String(r.resourceId).trim()
          }))
        };
      }
    });
    return opts;
  }, [groupedData, resourcesByActivity]);

  const handleRowDelete = useCallback((index: number) => {
    const row = tableData[index];
    if (row && (row as any)._isCustomRow && onDeleteCustomActivity) {
      const customId = (row as any)._customId;
      if (customId) onDeleteCustomActivity(customId);
    }
  }, [tableData, onDeleteCustomActivity]);

  return (
    <div className="space-y-4 w-full flex-1 min-h-0 flex flex-col">
      {/* Inline Add Activity Button */}
      {!isLocked && (onAddCustomActivity || onBulkUploadActivities) && (
        <div className="flex justify-end px-2 gap-2">
          {onBulkUploadActivities && (
            <button
              onClick={onBulkUploadActivities}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors shadow-sm"
            >
              <Upload className="w-4 h-4" />
              Upload Activities
            </button>
          )}
          {onAddCustomActivity && (
            <button
              onClick={handleInlineAdd}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
            >
              <Plus className="w-4 h-4" />
              Add DPR Activity
            </button>
          )}
        </div>
      )}

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
        onFullscreenToggle={onFullscreenToggle}
        projectId={projectId}
        sheetType={sheetType}
        rowColumnOptions={rowColumnOptions}
        onRowDelete={isPmagOrAdmin && !isLocked && onDeleteCustomActivity ? handleRowDelete : undefined}
        rowIsEditable={(idx) => {
          const row = tableData[idx] as any;
          return row && !row.isCategoryRow;
        }}
        rowIsDeletable={(idx) => !!(tableData[idx] as any)?._isCustomRow && isPmagOrAdmin}
      />
    </div>
  );
};
