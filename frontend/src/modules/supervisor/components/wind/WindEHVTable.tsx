import React, { useMemo, useCallback } from 'react';
import { StyledExcelTable } from "@/components/StyledExcelTable";
import { Plus } from 'lucide-react';
import { useAuth } from '@/modules/auth/contexts/AuthContext';

export interface WindEHVData {
  id?: string;
  sNo?: string;
  locNo?: string;
  devAngle?: string;
  towerType?: string;
  span?: string;
  elevation?: string;
  village?: string;
  row?: string;
  classification?: string;
  // Check Survey
  csStatus?: string;
  csCompDate?: string;
  // ROW clearance
  rowAppRoad?: string;
  rowTowerLoc?: string;
  // Soil testing
  soilStart?: string;
  soilFinish?: string;
  // Excavation
  excPlanStart?: string;
  excPlanFinish?: string;
  excActStart?: string;
  excActFinish?: string;
  // PCC
  pccPlanStart?: string;
  pccPlanFinish?: string;
  pccActStart?: string;
  pccActFinish?: string;
  // Stub Setting
  stubPlanStart?: string;
  stubPlanFinish?: string;
  stubActStart?: string;
  stubActFinish?: string;
  // Steel Binding
  steelPlanStart?: string;
  steelPlanFinish?: string;
  steelActStart?: string;
  steelActFinish?: string;
  // Raft Casting
  raftPlanStart?: string;
  raftPlanFinish?: string;
  raftActStart?: string;
  raftActFinish?: string;
  // Chimney Casting
  chimPlanStart?: string;
  chimPlanFinish?: string;
  chimActStart?: string;
  chimActFinish?: string;
  // Backfilling
  backPlanStart?: string;
  backPlanFinish?: string;
  backActStart?: string;
  backActFinish?: string;
  
  [key: string]: any;
}

interface WindEHVTableProps {
  data: any[]; // Raw P6 Data passed from Dashboard
  manualData?: WindEHVData[]; // Manually entered/saved data (we might need to update WindDashboard to support this, but for now we'll mock it if not present)
  setData: (data: any[]) => void;
  onSave?: (isAuto?: boolean) => void | Promise<void>;
  onSubmit?: () => void;
  isLocked?: boolean;
  status?: string;
  onExportAll?: () => void;
  projectId?: number;
  onPush?: () => void;
  customActivities?: any[];
  onAddCustomActivity?: (act: any, silent?: boolean) => void;
  onEditCustomActivity?: (act: any) => void;
  onDeleteCustomActivity?: (id: number) => void;
  onBulkUploadActivities?: () => void;
}

const EHV_ACTIVITIES = [
  { key: 'exc', keywords: ['EXCAVATION'] },
  { key: 'pcc', keywords: ['PCC'] },
  { key: 'stub', keywords: ['STUB SETTING', 'STUB'] },
  { key: 'steel', keywords: ['STEEL BINDING'] },
  { key: 'raft', keywords: ['RAFT CASTING'] },
  { key: 'chim', keywords: ['CHIMNEY CASTING', 'CHIMNEY'] },
  { key: 'back', keywords: ['BACKFILLING'] },
];

export const WindEHVTable: React.FC<WindEHVTableProps> = ({
  data,
  manualData = [],
  setData,
  onSave,
  onSubmit,
  isLocked = false,
  status = 'draft',
  onExportAll,
  projectId,
  onPush,
  customActivities,
  onAddCustomActivity,
  onEditCustomActivity,
  onDeleteCustomActivity,
  onBulkUploadActivities,
}) => {
  const { user } = useAuth();
  const userRoleLower = (user?.role || user?.Role || '').toLowerCase();
  const isPmagOrAdmin = userRoleLower === 'pmag' || userRoleLower === 'super admin';

  // 1. Group P6 data by Location to extract Dates
  const p6MappedData = useMemo(() => {
    const safeData = Array.isArray(data) ? data : [];
    const locationMap = new Map<string, any>();
    
    // Filter EHV data
    const ehvRows = safeData.filter(d => {
      const wbs = (d.wbsName || '').toUpperCase();
      return wbs.includes("220KV") || wbs.includes("220 KV") || 
             wbs.includes("400KV") || wbs.includes("400 KV") || 
             wbs.includes("EHV");
    });
    
    ehvRows.forEach(row => {
      if (!row.locations || !row.locations.trim()) return;
      const loc = row.locations.trim().toUpperCase();
      
      if (!locationMap.has(loc)) {
        locationMap.set(loc, { locNo: row.locations.trim() });
      }
      
      const locData = locationMap.get(loc);
      const desc = (row.description || '').toUpperCase();
      
      if (desc.includes('CHECK SURVEY') || desc.includes('SURVEY')) {
         locData.csCompDate = row.actualFinish || row.plannedFinish || '';
         locData.csStatus = row.status || '';
      }
      if (desc.includes('ROW CLEARANCE') || desc.includes('CLEARANCE')) {
         locData.rowTowerLoc = row.actualStart || row.plannedStart || '';
      }
      if (desc.includes('SOIL TEST') || desc.includes('SOIL')) {
         locData.soilStart = row.actualStart || row.plannedStart || '';
         locData.soilFinish = row.actualFinish || row.plannedFinish || '';
      }
      
      EHV_ACTIVITIES.forEach(act => {
        if (act.keywords.some(k => desc.includes(k))) {
          locData[`${act.key}PlanStart`] = row.plannedStart || '';
          locData[`${act.key}PlanFinish`] = row.plannedFinish || '';
          locData[`${act.key}ActStart`] = row.actualStart || '';
          locData[`${act.key}ActFinish`] = row.actualFinish || '';
        }
      });
    });
    
    return Array.from(locationMap.values());
  }, [data]);

  // 2. Merge Manual Data with P6 Data
  const mergedData = useMemo(() => {
    // Separate manual rows into P6 overrides and standalone rows
    const p6Overrides = new Map();
    const standaloneRows: any[] = [];
    
    (manualData || []).forEach(m => {
      // If the row was originally derived from a P6 location, it usually has an ID like 'loc-XXX' or its locNo matches a P6 locNo exactly.
      // But we must be careful: if the user edits the locNo of a standalone row, it shouldn't overwrite another row.
      // Best way: key overrides by ID if they start with 'loc-', else key by original locNo if they match P6.
      if (m.id && m.id.toString().startsWith('loc-')) {
        p6Overrides.set(m.id, m);
      } else if (p6MappedData.some(p => p.locNo.toUpperCase() === m.locNo?.toUpperCase())) {
        // Fallback for older drafts where ID might not be set correctly but it matches a P6 locNo
        p6Overrides.set(`loc-${m.locNo?.toUpperCase()}`, m);
      } else {
        standaloneRows.push(m);
      }
    });

    const finalRows: WindEHVData[] = [];
    
    // Merge P6 derived rows with manual overrides
    p6MappedData.forEach(p6 => {
      const p6Id = `loc-${p6.locNo.toUpperCase()}`;
      const manualRow = p6Overrides.get(p6Id) || {};
      
      if (manualRow.isDeleted) return; // Skip deleted rows
      
      finalRows.push({ ...p6, ...manualRow, id: manualRow.id || `loc-${p6.locNo}` });
    });
    
    // Append standalone manual rows
    standaloneRows.forEach(manualRow => {
      if (manualRow.isDeleted) return; // Skip deleted rows
      finalRows.push(manualRow);
    });
    
    return finalRows.map((r, i) => ({ ...r, sNo: String(i + 1) }));
  }, [p6MappedData, manualData]);

  // Headers
  const headerStructure = useMemo(() => {
    return [
      [
        { key: 'locNo', label: 'Loc.No.', rowSpan: 2 },
        { key: 'towerType', label: 'Type of Tower', rowSpan: 2 },
        { key: 'row', label: 'ROW', rowSpan: 2 },
        { key: 'classification', label: 'Classification', rowSpan: 2 },
        { key: 'cs_group', label: 'Check Survey', colSpan: 2 },
        { key: 'row_group', label: 'ROW clearance', colSpan: 2 },
        { key: 'soil_group', label: 'Soil testing Status', colSpan: 2 },
        { key: 'exc_group', label: 'Excavation', colSpan: 4 },
        { key: 'pcc_group', label: 'PCC', colSpan: 4 },
        { key: 'stub_group', label: 'Stub Setting', colSpan: 4 },
        { key: 'steel_group', label: 'Steel Binding', colSpan: 4 },
        { key: 'raft_group', label: 'Raft Casting', colSpan: 4 },
        { key: 'chim_group', label: 'Chimney Casting', colSpan: 4 },
        { key: 'back_group', label: 'Backfilling Completion date', colSpan: 4 },
      ],
      [
        { key: 'csStatus', label: 'Status' },
        { key: 'csCompDate', label: 'Completion date' },
        { key: 'rowAppRoad', label: 'Approach Road' },
        { key: 'rowTowerLoc', label: 'Tower Location' },
        { key: 'soilStart', label: 'Start Date' },
        { key: 'soilFinish', label: 'Finish Date' },
        // Exc
        { key: 'excPlanStart', label: 'Plan Start Date' },
        { key: 'excPlanFinish', label: 'Plan Finish date' },
        { key: 'excActStart', label: 'Actual Start Date' },
        { key: 'excActFinish', label: 'Actual Finish Date' },
        // PCC
        { key: 'pccPlanStart', label: 'Plan Start Date' },
        { key: 'pccPlanFinish', label: 'Plan Finish date' },
        { key: 'pccActStart', label: 'Actual Start Date' },
        { key: 'pccActFinish', label: 'Actual Finish Date' },
        // Stub
        { key: 'stubPlanStart', label: 'Plan Start Date' },
        { key: 'stubPlanFinish', label: 'Plan Finish date' },
        { key: 'stubActStart', label: 'Actual Start Date' },
        { key: 'stubActFinish', label: 'Actual Finish Date' },
        // Steel
        { key: 'steelPlanStart', label: 'Plan Start Date' },
        { key: 'steelPlanFinish', label: 'Plan Finish date' },
        { key: 'steelActStart', label: 'Actual Start Date' },
        { key: 'steelActFinish', label: 'Actual Finish Date' },
        // Raft
        { key: 'raftPlanStart', label: 'Plan Start Date' },
        { key: 'raftPlanFinish', label: 'Plan Finish date' },
        { key: 'raftActStart', label: 'Actual Start Date' },
        { key: 'raftActFinish', label: 'Actual Finish Date' },
        // Chimney
        { key: 'chimPlanStart', label: 'Plan Start Date' },
        { key: 'chimPlanFinish', label: 'Plan Finish date' },
        { key: 'chimActStart', label: 'Actual Start Date' },
        { key: 'chimActFinish', label: 'Actual Finish Date' },
        // Backfill
        { key: 'backPlanStart', label: 'Plan Start Date' },
        { key: 'backPlanFinish', label: 'Plan Finish date' },
        { key: 'backActStart', label: 'Actual Start Date' },
        { key: 'backActFinish', label: 'Actual Finish Date' },
      ]
    ];
  }, []);

  const columns = useMemo(() => {
    const cols = ['locNo', 'towerType', 'row', 'classification'];
    const milestones = ['cs', 'row', 'soil'];
    milestones.forEach(m => {
      if (m === 'cs') cols.push('csStatus', 'csCompDate');
      if (m === 'row') cols.push('rowAppRoad', 'rowTowerLoc');
      if (m === 'soil') cols.push('soilStart', 'soilFinish');
    });
    
    EHV_ACTIVITIES.forEach(a => {
      cols.push(`${a.key}PlanStart`, `${a.key}PlanFinish`, `${a.key}ActStart`, `${a.key}ActFinish`);
    });
    
    return cols;
  }, []);

  const editableColumns = useMemo(() => columns, [columns]);

  const colWidths = useMemo(() => {
    const widths: Record<string, number | string> = {};
    columns.forEach(col => {
      // Default width for most columns is 120px to prevent vertical text squishing
      widths[col] = 130;
    });
    // Give location and general string columns a bit more space
    widths['locNo'] = 140;
    widths['towerType'] = 140;
    widths['rowAppRoad'] = 160;
    widths['rowTowerLoc'] = 160;
    return widths;
  }, [columns]);

  const tableData = useMemo(() => {
    return mergedData.map(row => {
      const arr = columns.map(c => row[c] || '');
      (arr as any)._activityId = row.id;
      if (row._cellStatuses) (arr as any)._cellStatuses = row._cellStatuses;
      return arr;
    });
  }, [mergedData, columns]);

  const handleDataChange = useCallback((newData: any[]) => {
    const updatedRows = newData.map(rowArr => {
      const rowObj: any = { id: rowArr._activityId };
      columns.forEach((c, i) => {
        rowObj[c] = rowArr[i];
      });
      if (rowArr._cellStatuses) rowObj._cellStatuses = rowArr._cellStatuses;
      return rowObj;
    });
    setData(updatedRows);
  }, [columns, setData]);

  const handleAddLocation = useCallback(() => {
    const newLoc = { id: `manual-${Date.now()}`, locNo: 'NEW TOWER' };
    setData([...(manualData || []), newLoc]); // Append to manualData instead of mergedData to avoid saving unmodified P6 rows
  }, [manualData, setData]);

  const handleRowDelete = useCallback((index: number) => {
    const rowToDelete = mergedData[index];
    if (!rowToDelete) return;

    const currentManualRows = Array.isArray(manualData) ? [...manualData] : [];
    const existingIdx = currentManualRows.findIndex(m => 
      (m.id && m.id === rowToDelete.id) || 
      (m.locNo && m.locNo.toUpperCase() === rowToDelete.locNo?.toUpperCase())
    );

    if (existingIdx >= 0) {
      currentManualRows[existingIdx] = { ...currentManualRows[existingIdx], isDeleted: true };
    } else {
      currentManualRows.push({ ...rowToDelete, isDeleted: true });
    }
    
    setData(currentManualRows);
  }, [mergedData, manualData, setData]);

  return (
    <div className="flex flex-col h-full relative group">
      <div className="flex items-center justify-between mb-4 mt-2 px-2">
        <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
          EHV Tracker Matrix
          <span className="text-sm font-normal text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200">
            {tableData.length} Locations
          </span>
        </h3>
        
        <div className="flex items-center gap-2">
          {!isLocked && (
            <button
              onClick={handleAddLocation}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-50 text-indigo-700 rounded-lg hover:bg-indigo-100 font-medium transition-colors border border-indigo-200"
            >
              <Plus className="w-4 h-4" />
              Add Location
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 min-h-0 bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <StyledExcelTable
          columns={columns}
          headerStructure={headerStructure}
          data={tableData}
          onDataChange={handleDataChange}
          editableColumns={isLocked ? [] : editableColumns}
          columnWidths={colWidths}
          status={status}
          isReadOnly={isLocked}
          hideAddRow={true}
          fixedColumnsCount={1}
          emptyMessage="No EHV Locations Tracked"
          onSave={onSave}
          onSubmit={onSubmit}
          onExportAll={onExportAll}
          onPush={onPush}
          onRowDelete={isLocked ? undefined : handleRowDelete}
        />
      </div>
    </div>
  );
};
