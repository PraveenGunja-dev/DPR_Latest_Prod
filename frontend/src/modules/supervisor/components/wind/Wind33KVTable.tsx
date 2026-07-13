import React, { useMemo, useCallback } from 'react';
import { StyledExcelTable } from "@/components/StyledExcelTable";
import { Plus, Upload } from 'lucide-react';
import { useAuth } from '@/modules/auth/contexts/AuthContext';

export interface Wind33KVData {
  sNo?: string;
  activityId?: string;
  description: string;
  feeder: string;
  agencyName?: string;
  cableFrom?: string;
  cableTo?: string;
  totalLengthMeter?: string;
  terminationEnd?: string;
  jointingKit?: string;
  todayValue?: string;
  cumulative?: string;
  balance?: string;
  jointingCumulative?: string;
  jointingBalance?: string;
  terminationCumulative?: string;
  terminationBalance?: string;
  [key: string]: any;
}

interface Wind33KVTableProps {
  data: Wind33KVData[];
  setData: (data: Wind33KVData[]) => void;
  onSave?: () => void;
  onSubmit?: () => void;
  isLocked?: boolean;
  status?: string;
  onExportAll?: () => void;
  projectId?: number;
  onPush?: () => void;
  customActivities?: Wind33KVData[];
  onAddCustomActivity?: (activity: any) => void;
  onEditCustomActivity?: (activity: any) => void;
  onDeleteCustomActivity?: (id: number) => void;
  onBulkUploadActivities?: () => void;
}

export const Wind33KVTable: React.FC<Wind33KVTableProps> = ({
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
        (c.extraData?.cableFrom && String(c.extraData.cableFrom) === String(baseRow.cableFrom)) ||
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
          cableFrom: ext.cableFrom || customMatch.description || baseRow.cableFrom,
          cableTo: ext.cableTo || baseRow.cableTo,
          totalLengthMeter: ext.totalLengthMeter || baseRow.totalLengthMeter,
          terminationEnd: ext.terminationEnd || baseRow.terminationEnd,
          jointingKit: ext.jointingKit || baseRow.jointingKit,
          todayValue: ext.todayValue || baseRow.todayValue,
          cumulative: customMatch.cumulative || ext.cumulative || baseRow.cumulative,
          balance: ext.balance || baseRow.balance,
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
        const key = c.extraData?.cableFrom || c.description || `unmatched_${c.id}`;
        if (!acc[key] || acc[key].id < c.id) {
          acc[key] = { ...c, isCustom: true, _isCustomRow: true };
        }
        return acc;
      }, {})
    );

    return [...mergedRows, ...uniqueUnmatched];
  }, [data, customActivities]);

  const columns = useMemo(() => [
    "SR. NO.",
    "CABLE FROM",
    "CABLE TO",
    "TOTAL LENGTH (METER)",
    "TERMINATION END",
    "JOINTING KIT",
    "Today",
    "Cumulative",
    "Balance",
    "Jointing Cumulative",
    "Jointing Balance",
    "Termination Cumulative",
    "Termination Balance"
  ], []);

  const columnWidths = useMemo(() => ({
    "SR. NO.": 80,
    "CABLE FROM": 220,
    "CABLE TO": 220,
    "TOTAL LENGTH (METER)": 160,
    "TERMINATION END": 140,
    "JOINTING KIT": 120,
    "Today": 100,
    "Cumulative": 120,
    "Balance": 100,
    "Jointing Cumulative": 160,
    "Jointing Balance": 140,
    "Termination Cumulative": 180,
    "Termination Balance": 160
  }), []);

  const columnTypes = useMemo(() => ({
    "SR. NO.": "text" as const,
    "CABLE FROM": "text" as const,
    "CABLE TO": "text" as const,
    "TOTAL LENGTH (METER)": "number" as const,
    "TERMINATION END": "number" as const,
    "JOINTING KIT": "number" as const,
    "Today": "text" as const,
    "Cumulative": "number" as const,
    "Balance": "number" as const,
    "Jointing Cumulative": "number" as const,
    "Jointing Balance": "number" as const,
    "Termination Cumulative": "number" as const,
    "Termination Balance": "number" as const
  }), []);

  const editableColumns = useMemo(() => [
    "CABLE FROM",
    "CABLE TO",
    "TOTAL LENGTH (METER)",
    "TERMINATION END",
    "JOINTING KIT",
    "Today",
    "Cumulative",
    "Balance",
    "Jointing Cumulative",
    "Jointing Balance",
    "Termination Cumulative",
    "Termination Balance"
  ], []);

  const headerStructure = useMemo(() => [
    [
      { label: "SR. NO.", rowSpan: 1, colSpan: 1 },
      { label: "CABLE FROM", rowSpan: 1, colSpan: 1 },
      { label: "CABLE TO", rowSpan: 1, colSpan: 1 },
      { label: "TOTAL LENGTH (METER)", rowSpan: 1, colSpan: 1 },
      { label: "TERMINATION END", rowSpan: 1, colSpan: 1 },
      { label: "JOINTING KIT", rowSpan: 1, colSpan: 1 },
      { label: "Today", rowSpan: 1, colSpan: 1 },
      { label: "Cumulative", rowSpan: 1, colSpan: 1 },
      { label: "Balance", rowSpan: 1, colSpan: 1 },
      { label: "Jointing Cumulative", rowSpan: 1, colSpan: 1 },
      { label: "Jointing Balance", rowSpan: 1, colSpan: 1 },
      { label: "Termination Cumulative", rowSpan: 1, colSpan: 1 },
      { label: "Termination Balance", rowSpan: 1, colSpan: 1 }
    ]
  ], []);

  const getFeederName = useCallback((act: any) => {
    if (act.feeder && act.feeder.trim()) return act.feeder.trim().toUpperCase();
    if (act.extraData?.feeder && act.extraData.feeder.trim()) return act.extraData.feeder.trim().toUpperCase();
    
    const desc = (act.description || '').toUpperCase();
    const id = (act.activityId || '').toUpperCase();
    const wbs = (act.wbsName || '').toUpperCase();
    const combined = `${id} ${desc} ${wbs}`;

    const feederMatch = combined.match(/(FDR[-\s]?\d+|F[-\s]?\d+|FEEDER[-\s]?\d+)/i);
    if (feederMatch) {
      return feederMatch[1].toUpperCase().trim();
    }
    return "GENERAL";
  }, []);

  const { tableData, rowStyles } = useMemo(() => {
    const rows: any[] = [];
    const styles: Record<number, any> = {};
    const groupedByFeeder: Record<string, any[]> = {};

    // Separate P6 and custom activities, and parse extraData if it's a string
    const p6Activities: any[] = [];
    const dprActivities: any[] = [];
    filteredData.forEach(act => {
      // Ensure extraData is an object
      if (typeof (act as any).extraData === 'string') {
        try {
          (act as any).extraData = JSON.parse((act as any).extraData);
        } catch (e) {
          (act as any).extraData = {};
        }
      }

      if ((act as any).isCustom || (act as any)._isCustomRow) {
        dprActivities.push(act);
      } else {
        p6Activities.push(act);
      }
    });

    // Group P6 activities by feeder
    p6Activities.forEach(act => {
      const feederName = getFeederName(act);
      if (!groupedByFeeder[feederName]) {
        groupedByFeeder[feederName] = [];
      }
      groupedByFeeder[feederName].push(act);
    });

    let feederCode = 65; // Starts at 'A'
    
    Object.keys(groupedByFeeder).sort().forEach(feeder => {
      const activities = groupedByFeeder[feeder];
      
      let sumLength = 0, sumCum = 0, sumBal = 0;
      let sumJointKit = 0, sumJointCum = 0, sumTermCum = 0;

      activities.forEach(act => {
        sumLength += Number(act.totalLengthMeter || act.extraData?.totalLengthMeter || 0);
        sumCum += Number(act.cumulative || act.completed || act.extraData?.cumulative || 0);
        sumBal += Number(act.balance || act.extraData?.balance || 0);
        sumJointKit += Number(act.jointingKit || act.extraData?.jointingKit || 0);
        sumJointCum += Number(act.jointingCumulative || act.extraData?.jointingCumulative || 0);
        sumTermCum += Number(act.terminationCumulative || act.extraData?.terminationCumulative || 0);
      });

      const headerIdx = rows.length;
      rows.push({
        isCategoryRow: true,
        sNo: String.fromCharCode(feederCode++),
        cableFrom: feeder,
        cableTo: '',
        totalLengthMeter: sumLength > 0 ? String(sumLength) : '',
        terminationEnd: '',
        jointingKit: sumJointKit > 0 ? String(sumJointKit) : '',
        todayValue: '',
        cumulative: sumCum > 0 ? String(sumCum) : '',
        balance: sumBal > 0 ? String(sumBal) : '',
        jointingCumulative: sumJointCum > 0 ? String(sumJointCum) : '',
        jointingBalance: '',
        terminationCumulative: sumTermCum > 0 ? String(sumTermCum) : '',
        terminationBalance: ''
      });

      styles[headerIdx] = {
        backgroundColor: "#FADFAD",
        color: "#333333",
        fontWeight: "bold",
        isCategoryRow: true,
      };

      let actIndex = 1;
      activities.forEach((act) => {
        const rowIdx = rows.length;
        
        let displayCableFrom = act.cableFrom || act.extraData?.cableFrom || '';
        if (!displayCableFrom) {
          displayCableFrom = act.locations ? (act.locations.toUpperCase().startsWith('WTG') ? act.locations : `WTG${act.locations}`) : act.description;
        }

        const row: any = [
          String(actIndex++),
          displayCableFrom,
          act.cableTo || act.extraData?.cableTo || '',
          act.totalLengthMeter || act.extraData?.totalLengthMeter || '0',
          act.terminationEnd || act.extraData?.terminationEnd || '2',
          act.jointingKit || act.extraData?.jointingKit || '0',
          act.todayValue || act.extraData?.todayValue || '',
          act.cumulative || act.completed || act.extraData?.cumulative || '0',
          act.balance || act.extraData?.balance || '0',
          act.jointingCumulative || act.extraData?.jointingCumulative || '0',
          act.jointingBalance || act.extraData?.jointingBalance || '0',
          act.terminationCumulative || act.extraData?.terminationCumulative || '0',
          act.terminationBalance || act.extraData?.terminationBalance || '0'
        ];

        row._activityId = act.activityId;
        if (act._cellStatuses) row._cellStatuses = act._cellStatuses;
        rows.push(row);
      });
    });

    // Add DPR Level Activities section if there are custom activities
    if (dprActivities.length > 0) {
      const dprHeaderIdx = rows.length;
      rows.push({
        isCategoryRow: true,
        sNo: '',
        cableFrom: '📝 DPR Level Activities',
        cableTo: '',
        totalLengthMeter: '',
        terminationEnd: '',
        jointingKit: '',
        todayValue: '',
        cumulative: '',
        balance: '',
        jointingCumulative: '',
        jointingBalance: '',
        terminationCumulative: '',
        terminationBalance: ''
      });
      styles[dprHeaderIdx] = {
        backgroundColor: "#FADFAD",
        color: "#333333",
        fontWeight: "bold",
        isCategoryRow: true,
      };

      let dprIndex = 1;
      dprActivities.forEach((act) => {
        const rowIdx = rows.length;
        
        let displayCableFrom = act.cableFrom || act.extraData?.cableFrom || '';
        if (!displayCableFrom) {
          displayCableFrom = act.locations ? (act.locations.toUpperCase().startsWith('WTG') ? act.locations : `WTG${act.locations}`) : act.description;
        }

        const row: any = [
          String(dprIndex++),
          displayCableFrom,
          act.cableTo || act.extraData?.cableTo || '',
          act.totalLengthMeter || act.extraData?.totalLengthMeter || '0',
          act.terminationEnd || act.extraData?.terminationEnd || '2',
          act.jointingKit || act.extraData?.jointingKit || '0',
          act.todayValue || act.extraData?.todayValue || '',
          act.cumulative || act.completed || act.extraData?.cumulative || '0',
          act.balance || act.extraData?.balance || '0',
          act.jointingCumulative || act.extraData?.jointingCumulative || '0',
          act.jointingBalance || act.extraData?.jointingBalance || '0',
          act.terminationCumulative || act.extraData?.terminationCumulative || '0',
          act.terminationBalance || act.extraData?.terminationBalance || '0'
        ];

        row._activityId = act.activityId;
        row._isCustomRow = true;
        row._customId = act.id;
        if (act._cellStatuses) row._cellStatuses = act._cellStatuses;
        styles[rowIdx] = { backgroundColor: "#FFFBEB" };
        rows.push(row);
      });
    }

    // Flatten Category Rows into Arrays for Handsontable
    const finalTableData = rows.map((r) => {
      if (r.isCategoryRow) {
        const arr = [
          r.sNo,
          r.cableFrom,
          r.cableTo,
          r.totalLengthMeter,
          r.terminationEnd,
          r.jointingKit,
          r.todayValue,
          r.cumulative,
          r.balance,
          r.jointingCumulative,
          r.jointingBalance,
          r.terminationCumulative,
          r.terminationBalance
        ];
        (arr as any).isCategoryRow = true;
        return arr;
      }
      return r;
    });

    return { tableData: finalTableData, rowStyles: styles };
  }, [filteredData, getFeederName]);

  const handleInlineAdd = useCallback(() => {
    if (onAddCustomActivity) {
      onAddCustomActivity({
        sheetType: 'wind_33kv',
        description: `New 33kV HT Cable Activity`,
        uom: 'Meters',
        scope: 0,
        wbsName: '33KV LINE',
        category: '33KV',
      });
    }
  }, [onAddCustomActivity]);

  const handleDataChange = useCallback((newData: any[][]) => {
    const fullData = [...data];
    const customRowChanges: any[] = [];
    
    newData.filter(r => !(r as any).isTotalRow && !(r as any).isCategoryRow).forEach((row) => {
      if ((row as any)._isCustomRow) {
        customRowChanges.push(row);
      } else {
        const actId = (row as any)._activityId;
        if (!actId) return;

        const idx = fullData.findIndex(d => d.activityId === actId);
        if (idx !== -1) {
          // Use extraData or main fields for edits on P6 rows
          fullData[idx] = {
            ...fullData[idx],
            cableFrom: row[1] || '',
            cableTo: row[2] || '',
            totalLengthMeter: row[3] || '0',
            terminationEnd: row[4] || '0',
            jointingKit: row[5] || '0',
            todayValue: row[6] || '',
            cumulative: row[7] || '0',
            balance: row[8] || '0',
            jointingCumulative: row[9] || '0',
            jointingBalance: row[10] || '0',
            terminationCumulative: row[11] || '0',
            terminationBalance: row[12] || '0',
            _cellStatuses: (row as any)._cellStatuses 
          };
          const originalDataRow = filteredData.find(d => d.activityId === actId);
          if (originalDataRow && (originalDataRow as any)._customId && onEditCustomActivity) {
            onEditCustomActivity({
              id: (originalDataRow as any)._customId,
              sheetType: 'wind_33kv',
              description: row[1] || originalDataRow.description,
              cableTo: row[2] || '',
              totalLengthMeter: row[3] || '0',
              terminationEnd: row[4] || '0',
              jointingKit: row[5] || '0',
              todayValue: row[6] || '',
              cumulative: row[7] || '0',
              balance: row[8] || '0',
              jointingCumulative: row[9] || '0',
              jointingBalance: row[10] || '0',
              terminationCumulative: row[11] || '0',
              terminationBalance: row[12] || '0',
              extraData: {
                ...originalDataRow.extraData,
                cableFrom: row[1] || '',
                cableTo: row[2] || '',
                totalLengthMeter: row[3] || '0',
                terminationEnd: row[4] || '0',
                jointingKit: row[5] || '0',
                todayValue: row[6] || '',
                cumulative: row[7] || '0',
                balance: row[8] || '0',
                jointingCumulative: row[9] || '0',
                jointingBalance: row[10] || '0',
                terminationCumulative: row[11] || '0',
                terminationBalance: row[12] || '0',
              }
            });
          }
        }
      }
    });

    setData(fullData);

    if (onEditCustomActivity && customRowChanges.length > 0) {
      customRowChanges.forEach((row) => {
        const customId = (row as any)._customId;
        if (!customId) return;
        const original = customActivities.find(c => c.id === customId);
        if (!original) return;

        let originalExtra = original.extraData || {};
        if (typeof originalExtra === 'string') {
          try { originalExtra = JSON.parse(originalExtra); } catch(e) { originalExtra = {}; }
        }

        const newCableFrom = row[1] || '';
        const newCableTo = row[2] || '';
        const newTotalLen = row[3] || '0';
        const newTermEnd = row[4] || '0';
        const newJointKit = row[5] || '0';
        const newToday = row[6] || '';
        const newCum = row[7] || '0';
        const newBal = row[8] || '0';
        const newJointCum = row[9] || '0';
        const newJointBal = row[10] || '0';
        const newTermCum = row[11] || '0';
        const newTermBal = row[12] || '0';

        const hasChanges =
          newCableFrom !== (original.extraData?.cableFrom || original.description || '') ||
          newCableTo !== (original.extraData?.cableTo || '') ||
          newTotalLen !== (original.extraData?.totalLengthMeter || '0') ||
          newTermEnd !== (original.extraData?.terminationEnd || '0') ||
          newJointKit !== (original.extraData?.jointingKit || '0') ||
          newToday !== (original.extraData?.todayValue || '') ||
          newCum !== String(Number(original.cumulative || 0)) ||
          newBal !== (original.extraData?.balance || '0') ||
          newJointCum !== (original.extraData?.jointingCumulative || '0') ||
          newJointBal !== (original.extraData?.jointingBalance || '0') ||
          newTermCum !== (original.extraData?.terminationCumulative || '0') ||
          newTermBal !== (original.extraData?.terminationBalance || '0');

        if (hasChanges) {
          onEditCustomActivity({
            id: customId,
            sheetType: 'wind_33kv',
            description: newCableFrom || ' ',
            uom: 'Meters',
            scope: Number(newTotalLen) || 0,
            cumulative: Number(newCum) || 0,
            extraData: {
              ...original.extraData,
              cableFrom: newCableFrom,
              cableTo: newCableTo,
              totalLengthMeter: newTotalLen,
              terminationEnd: newTermEnd,
              jointingKit: newJointKit,
              todayValue: newToday,
              balance: newBal,
              jointingCumulative: newJointCum,
              jointingBalance: newJointBal,
              terminationCumulative: newTermCum,
              terminationBalance: newTermBal
            }
          });
        }
      });
    }
  }, [data, setData, customActivities, onEditCustomActivity]);

  const handleRowDelete = useCallback((index: number) => {
    const row = tableData[index];
    if (row && (row as any)._isCustomRow && onDeleteCustomActivity) {
      const customId = (row as any)._customId;
      if (customId) onDeleteCustomActivity(customId);
    }
  }, [tableData, onDeleteCustomActivity]);

  return (
    <div className="space-y-4 w-full flex-1 min-h-0 flex flex-col">
      <div className="flex items-center justify-between bg-white p-2 rounded-md shadow-sm border">
        <div className="flex items-center space-x-4">
          <h2 className="text-lg font-semibold text-gray-800">33kV HT Cable</h2>
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
                Add Cable Activity
              </button>
            )}
          </div>
        )}
      </div>

      <div className="flex-1 min-h-0 bg-white rounded-lg shadow-sm border overflow-hidden">
        <StyledExcelTable
          title={`Wind Project - 33kV HT Cable`}
          columns={columns}
          data={tableData}
          onDataChange={handleDataChange}
          onSave={onSave || (() => {})}
          onSubmit={onSubmit}
          onPush={onPush}
          isReadOnly={isLocked}
          editableColumns={editableColumns}
          columnTypes={columnTypes}
          columnWidths={columnWidths}
          headerStructure={headerStructure}
          rowStyles={rowStyles}
          status={status}
          onExportAll={onExportAll}
          disableAutoHeaderColors={true}
          projectId={projectId}
          sheetType={`wind_33kv`}
          fixedColumnsCount={3}
          emptyMessage={`No 33kV HT Cable Activities found for this project.`}
          onRowDelete={!isLocked && onDeleteCustomActivity ? handleRowDelete : undefined}
          rowIsEditable={(idx) => {
            const row = tableData[idx] as any;
            return row && !row.isCategoryRow;
          }}
          rowIsDeletable={(idx) => !!(tableData[idx] as any)?._isCustomRow}
        />
      </div>
    </div>
  );
};
