import React, { useMemo, useCallback } from 'react';
import { StyledExcelTable } from "@/components/StyledExcelTable";
import { Plus, Upload } from 'lucide-react';
import { useAuth } from '@/modules/auth/contexts/AuthContext';

export interface Wind33KVOHTableProps {
  data: any[];
  setData: (data: any[]) => void;
  onSave?: () => void;
  onSubmit?: () => void;
  isLocked?: boolean;
  status?: string;
  onExportAll?: () => void;
  projectId?: number;
  onPush?: () => void;
  customActivities?: any[];
  onAddCustomActivity?: (activity: any, silent?: boolean) => void;
  onEditCustomActivity?: (activity: any) => void;
  onDeleteCustomActivity?: (id: number) => void;
  onBulkUploadActivities?: () => void;
  projectDetails?: any;
  dynamicActivityTypes?: { key: string, label: string, group?: string }[];
}

export const Wind33KVOHTable: React.FC<Wind33KVOHTableProps> = ({
  data,
  setData,
  onSave,
  onSubmit,
  isLocked = false,
  status = 'draft',
  onExportAll,
  projectId,
  onPush,
  customActivities = [],
  onAddCustomActivity,
  onEditCustomActivity,
  onDeleteCustomActivity,
  onBulkUploadActivities,
  projectDetails,
  dynamicActivityTypes
}) => {
  const { user } = useAuth();
  const userRole = (user?.role || user?.Role || '').toLowerCase();
  const isPmagOrAdmin = userRole.includes('pmag') || userRole.includes('admin');

  const filteredData = useMemo(() => {
    const baseRows = Array.isArray(data) ? [...data] : [];
    const customRows = Array.isArray(customActivities) ? [...customActivities] : [];

    const matchedCustomIds = new Set<number>();

    const mergedRows = baseRows.map(baseRow => {
      const allMatches = customRows.filter(c => 
        (c.activityId && String(c.activityId) === String(baseRow.activityId)) || 
        (c.description && String(c.description) === String(baseRow.description))
      );

      if (allMatches.length > 0) {
        allMatches.forEach(c => matchedCustomIds.add(c.id));
        const customMatch = allMatches.sort((a, b) => b.id - a.id)[0];
        let ext = customMatch.extraData || {};
        if (typeof ext === 'string') {
          try { ext = JSON.parse(ext); } catch(e) { ext = {}; }
        }
        return {
          ...baseRow,
          ...ext,
          vendor: ext.vendor ?? baseRow.vendor,
          feederName: ext.feederName ?? baseRow.feederName,
          typeOfLine: ext.typeOfLine ?? baseRow.typeOfLine,
          btobLine: ext.btobLine ?? baseRow.btobLine,
          finalLine: ext.finalLine ?? baseRow.finalLine,
          totalLocations: ext.totalLocations ?? baseRow.totalLocations,
          activities: ext.activities ?? baseRow.activities ?? {},
          _isCustomMerged: true,
          _customId: customMatch.id
        };
      }
      return baseRow;
    });

    const rawUnmatched = customRows.filter(c => !matchedCustomIds.has(c.id));
    
    // Group unmatched to prevent duplicates
    const uniqueUnmatched = Object.values(
      rawUnmatched.reduce((acc: Record<string, any>, c: any) => {
        const key = c.description || `unmatched_${c.id}`;
        if (!acc[key] || acc[key].id < c.id) {
          acc[key] = { ...c, isCustom: true, _isCustomRow: true };
        }
        return acc;
      }, {})
    );

    return [...mergedRows, ...uniqueUnmatched];
  }, [data, customActivities]);

  const activityTypes = useMemo(() => {
    if (dynamicActivityTypes && dynamicActivityTypes.length > 0) {
      return dynamicActivityTypes;
    }
    return [
      { key: "poleErection", label: "Pole Erection" },
      { key: "stringing", label: "Stringing" },
      { key: "adss", label: "ADSS Stringing" },
      { key: "birdGuard", label: "Bird Guard" },
      { key: "poleEarthing", label: "Pole Earthing" },
      { key: "dangerBoard", label: "Danger Board / ACD" }
    ];
  }, [dynamicActivityTypes]);

  const columns = useMemo(() => {
    const cols = [
      "SR. NO.",
      "VENDOR",
      "FEEDER NAME",
      "TYPE OF LINE",
      "B-TO-B LINE (IN KM)",
      "FINAL LINE (IN KM)",
      "TOTAL LOCATIONS"
    ];
    activityTypes.forEach(act => {
      cols.push(`${act.key}_scope`);
      cols.push(`${act.key}_completed`);
      cols.push(`${act.key}_balance`);
    });
    return cols;
  }, [activityTypes]);

  const columnWidths = useMemo(() => {
    const widths: any = {
      "SR. NO.": 80,
      "VENDOR": 180,
      "FEEDER NAME": 180,
      "TYPE OF LINE": 140,
      "B-TO-B LINE (IN KM)": 140,
      "FINAL LINE (IN KM)": 140,
      "TOTAL LOCATIONS": 140
    };
    activityTypes.forEach(act => {
      widths[`${act.key}_scope`] = 80;
      widths[`${act.key}_completed`] = 100;
      widths[`${act.key}_balance`] = 90;
    });
    return widths;
  }, [activityTypes]);

  const columnTypes = useMemo(() => {
    const types: any = {
      "SR. NO.": "text",
      "VENDOR": "alphabet",
      "FEEDER NAME": "text",
      "TYPE OF LINE": "text",
      "B-TO-B LINE (IN KM)": "number",
      "FINAL LINE (IN KM)": "number",
      "TOTAL LOCATIONS": "number"
    };
    activityTypes.forEach(act => {
      types[`${act.key}_scope`] = "number";
      types[`${act.key}_completed`] = "number";
      types[`${act.key}_balance`] = "number";
    });
    return types;
  }, [activityTypes]);

  const editableColumns = useMemo(() => {
    const cols = [
      "VENDOR",
      "FEEDER NAME",
      "TYPE OF LINE",
      "B-TO-B LINE (IN KM)",
      "FINAL LINE (IN KM)",
      "TOTAL LOCATIONS"
    ];
    activityTypes.forEach(act => {
      cols.push(`${act.key}_scope`);
      cols.push(`${act.key}_completed`);
      cols.push(`${act.key}_balance`);
    });
    return cols;
  }, [activityTypes]);

  const headerStructure = useMemo(() => {
    // Check if we need 3 levels of headers (if any activity has a group)
    const hasGroups = activityTypes.some(act => act.group);
    
    if (hasGroups) {
      // Group activities by their group name
      const groupedActs: { group: string, activities: any[] }[] = [];
      activityTypes.forEach(act => {
        const groupName = act.group || 'OTHER ACTIVITIES';
        let group = groupedActs.find(g => g.group === groupName);
        if (!group) {
          group = { group: groupName, activities: [] };
          groupedActs.push(group);
        }
        group.activities.push(act);
      });

      return [
        [
          { label: "SR. NO.", rowSpan: 3, colSpan: 1 },
          { label: "VENDOR", rowSpan: 3, colSpan: 1 },
          { label: "FEEDER NAME", rowSpan: 3, colSpan: 1 },
          { label: "TYPE OF LINE", rowSpan: 3, colSpan: 1 },
          { label: "B-TO-B LINE (IN KM)", rowSpan: 3, colSpan: 1 },
          { label: "FINAL LINE (IN KM)", rowSpan: 3, colSpan: 1 },
          { label: "TOTAL LOCATIONS", rowSpan: 3, colSpan: 1 },
          ...groupedActs.map(g => ({ label: g.group, colSpan: g.activities.length * 3, rowSpan: 1 }))
        ],
        [
          ...groupedActs.flatMap(g => 
            g.activities.map(act => ({ label: act.label.toUpperCase(), colSpan: 3, rowSpan: 1 }))
          )
        ],
        [
          ...activityTypes.flatMap(() => [
            { label: "Scope", colSpan: 1, rowSpan: 1 },
            { label: "Completed", colSpan: 1, rowSpan: 1 },
            { label: "Balance", colSpan: 1, rowSpan: 1 }
          ])
        ]
      ];
    }

    return [
      [
        { label: "SR. NO.", rowSpan: 2, colSpan: 1 },
        { label: "VENDOR", rowSpan: 2, colSpan: 1 },
        { label: "FEEDER NAME", rowSpan: 2, colSpan: 1 },
        { label: "TYPE OF LINE", rowSpan: 2, colSpan: 1 },
        { label: "B-TO-B LINE (IN KM)", rowSpan: 2, colSpan: 1 },
        { label: "FINAL LINE (IN KM)", rowSpan: 2, colSpan: 1 },
        { label: "TOTAL LOCATIONS", rowSpan: 2, colSpan: 1 },
        ...activityTypes.map(act => ({ label: act.label.toUpperCase(), colSpan: 3, rowSpan: 1 }))
      ],
      [
        ...activityTypes.flatMap(() => [
          { label: "Scope", colSpan: 1, rowSpan: 1 },
          { label: "Completed", colSpan: 1, rowSpan: 1 },
          { label: "Balance", colSpan: 1, rowSpan: 1 }
        ])
      ]
    ];
  }, [activityTypes]);

  const { tableData, rowStyles } = useMemo(() => {
    const rows: any[] = [];
    const styles: Record<number, any> = {};

    let index = 1;
    filteredData.forEach(act => {
      const rowIdx = rows.length;
      
      let ext = act.extraData || {};
      if (typeof ext === 'string') {
        try { ext = JSON.parse(ext); } catch(e) { ext = {}; }
      }

      const row: any = [
        act.sNo || String(index++),
        ext.vendor || act.vendor || '',
        ext.feederName || act.feederName || act.feeder || act.description || '',
        ext.typeOfLine || act.typeOfLine || '',
        ext.btobLine || act.btobLine || '',
        ext.finalLine || act.finalLine || '',
        ext.totalLocations || act.totalLocations || ''
      ];

      const acts = ext.activities || act.activities || {};
      
      activityTypes.forEach(t => {
        const tData = acts[t.key] || {};
        row.push(tData.scope || '');
        row.push(tData.completed || '');
        row.push(tData.balance || '');
      });

      row._activityId = act.activityId;
      row._isCustomRow = act._isCustomRow;
      row._customId = act._customId;
      if (act._cellStatuses) row._cellStatuses = act._cellStatuses;
      
      if (act.isCategoryRow) {
        row.isCategoryRow = true;
        styles[rowIdx] = { backgroundColor: "#FADFAD", fontWeight: "bold" };
      } else if (act._isCustomRow) {
        styles[rowIdx] = { backgroundColor: "#FFFBEB" };
      }
      
      rows.push(row);
    });

    return { tableData: rows, rowStyles: styles };
  }, [filteredData, activityTypes]);

  const handleDataChange = useCallback((newData: any[][]) => {
    const fullData = [...data];
    
    newData.filter(r => !(r as any).isTotalRow && !(r as any).isCategoryRow).forEach((row) => {
      const actId = (row as any)._activityId;
      if (!actId) return;

      const idx = fullData.findIndex(d => d.activityId === actId);
      if (idx !== -1) {
        const activitiesObj: any = {};
        let colIdx = 7;
        
        activityTypes.forEach(t => {
          activitiesObj[t.key] = {
            scope: row[colIdx++] || '',
            completed: row[colIdx++] || '',
            balance: row[colIdx++] || ''
          };
        });

        fullData[idx] = {
          ...fullData[idx],
          vendor: row[1] || '',
          feederName: row[2] || '',
          typeOfLine: row[3] || '',
          btobLine: row[4] || '',
          finalLine: row[5] || '',
          totalLocations: row[6] || '',
          activities: activitiesObj,
          _cellStatuses: (row as any)._cellStatuses 
        };
      }
    });
    
    setData(fullData);
  }, [data, setData, activityTypes]);

  return (
    <div className="space-y-4 w-full h-full flex-1 min-h-0 flex flex-col">
      {!isLocked && onBulkUploadActivities && (
        <div className="flex justify-end px-2 gap-2">
          <button
            onClick={onBulkUploadActivities}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors shadow-sm"
          >
            <Upload className="w-4 h-4" />
            Upload Activities
          </button>
        </div>
      )}

      <StyledExcelTable
        title="Wind Project - 33KV Overhead Line Progress Sheet"
        columns={columns}
        data={tableData}
        columnWidths={columnWidths}
        columnTypes={columnTypes}
        editableColumns={isLocked ? [] : editableColumns}
        onDataChange={handleDataChange}
        hasChanges={status === 'draft'}
        onSave={isLocked ? undefined : onSave}
        onSubmit={isLocked ? undefined : onSubmit}
        onPush={onPush}
        isReadOnly={isLocked}
        headerStructure={headerStructure}
        disableAutoHeaderColors={true}
        sheetType="wind_33kv"
        projectId={projectId}
        rowStyles={rowStyles}
        fixedColumnsCount={3}
      />
    </div>
  );
};

