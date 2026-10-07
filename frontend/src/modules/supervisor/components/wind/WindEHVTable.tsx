import React, { useMemo, useCallback, useRef, useState } from 'react';
import { StyledExcelTable } from "@/components/StyledExcelTable";
import { Plus, Download, Upload, X, FileSpreadsheet } from 'lucide-react';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { toast } from 'sonner';

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
        { key: 'locNo', column: 'locNo', label: 'Loc.No.', rowSpan: 2, colSpan: 1 },
        { key: 'towerType', column: 'towerType', label: 'Type of Tower', rowSpan: 2, colSpan: 1 },
        { key: 'row', column: 'row', label: 'ROW', rowSpan: 2, colSpan: 1 },
        { key: 'classification', column: 'classification', label: 'Classification', rowSpan: 2, colSpan: 1 },
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
        { key: 'csStatus', column: 'csStatus', label: 'Status' },
        { key: 'csCompDate', column: 'csCompDate', label: 'Completion date' },
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

  
  const COLUMN_MAP: Record<string, string> = {
    locNo: 'Loc.No.',
    towerType: 'Type of Tower',
    row: 'ROW',
    classification: 'Classification',
    csStatus: 'Check Survey Status',
    csCompDate: 'Check Survey Completion Date',
    rowAppRoad: 'Approach Road',
    rowTowerLoc: 'Tower Location',
    soilStart: 'Soil Start Date',
    soilFinish: 'Soil Finish Date',
    excPlanStart: 'Excavation Plan Start Date',
    excPlanFinish: 'Excavation Plan Finish date',
    excActStart: 'Excavation Actual Start Date',
    excActFinish: 'Excavation Actual Finish Date',
    pccPlanStart: 'PCC Plan Start Date',
    pccPlanFinish: 'PCC Plan Finish date',
    pccActStart: 'PCC Actual Start Date',
    pccActFinish: 'PCC Actual Finish Date',
    stubPlanStart: 'Stub Setting Plan Start Date',
    stubPlanFinish: 'Stub Setting Plan Finish date',
    stubActStart: 'Stub Setting Actual Start Date',
    stubActFinish: 'Stub Setting Actual Finish Date',
    steelPlanStart: 'Steel Binding Plan Start Date',
    steelPlanFinish: 'Steel Binding Plan Finish date',
    steelActStart: 'Steel Binding Actual Start Date',
    steelActFinish: 'Steel Binding Actual Finish Date',
    raftPlanStart: 'Raft Casting Plan Start Date',
    raftPlanFinish: 'Raft Casting Plan Finish date',
    raftActStart: 'Raft Casting Actual Start Date',
    raftActFinish: 'Raft Casting Actual Finish Date',
    chimPlanStart: 'Chimney Casting Plan Start Date',
    chimPlanFinish: 'Chimney Casting Plan Finish date',
    chimActStart: 'Chimney Casting Actual Start Date',
    chimActFinish: 'Chimney Casting Actual Finish Date',
    backPlanStart: 'Backfilling Plan Start Date',
    backPlanFinish: 'Backfilling Plan Finish date',
    backActStart: 'Backfilling Actual Start Date',
    backActFinish: 'Backfilling Actual Finish Date',
  };

  const editableColumns = useMemo(() => columns, [columns]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);

  const handleDownloadTemplate = async () => {
    try {
      const XLSX = await import('xlsx');
      
      const headerRow: string[] = [];
      columns.forEach(col => {
        headerRow.push(COLUMN_MAP[col] || col);
      });
      
      const ws = XLSX.utils.aoa_to_sheet([headerRow]);
      
      // Auto-size columns
      const wscols = headerRow.map(h => ({ wch: Math.max(15, h.length) }));
      ws['!cols'] = wscols;
      
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "EHV Tracker Template");
      
      XLSX.writeFile(wb, `EHV_Tracker_Template_${new Date().toISOString().split('T')[0]}.xlsx`);
      toast.success("Template downloaded successfully");
    } catch (err) {
      console.error("Error downloading template:", err);
      toast.error("Failed to download template");
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    toast.loading("Uploading...", { id: "upload" });
    
    try {
      const XLSX = await import('xlsx');
      const data = await file.arrayBuffer();
      const wb = XLSX.read(data, { type: 'array', cellDates: true });
      const wsname = wb.SheetNames[0];
      const ws = wb.Sheets[wsname];
      const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
      
      if (!rows || rows.length === 0) {
        toast.error("File is empty", { id: "upload" });
        return;
      }
      
      // Create reverse map
      const reverseMap: Record<string, string> = {};
      Object.entries(COLUMN_MAP).forEach(([k, v]) => {
        reverseMap[v] = k;
      });
      
      const newLocations: any[] = [];
      
      rows.forEach((row: any) => {
        if (!row['Loc.No.'] && !row['locNo']) return; // Skip empty rows
        
        const newRow: any = { id: `manual-upload-${Date.now()}-${Math.random().toString(36).substring(7)}` };
        
        const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

        Object.entries(row).forEach(([header, val]) => {
          const originalKey = reverseMap[header] || header;
          
          if (val instanceof Date) {
            const snapped = new Date(val.getFullYear(), val.getMonth(), val.getDate());
            if (val.getHours() >= 12) snapped.setDate(snapped.getDate() + 1);
            const y = String(snapped.getFullYear()).slice(-2);
            const m = MONTH_ABBR[snapped.getMonth()];
            const d = String(snapped.getDate()).padStart(2, '0');
            newRow[originalKey] = `${d}-${m}-${y}`;
          } else if (typeof val === 'number' && XLSX && (header.toLowerCase().includes('date') || header.toLowerCase().includes('start') || header.toLowerCase().includes('finish'))) {
            // Fallback if cellDates didn't catch it but we know it's a date column
            const dObj = XLSX.SSF.parse_date_code(val);
            if (dObj) {
              const y = String(dObj.y).slice(-2);
              const m = MONTH_ABBR[dObj.m - 1];
              const d = String(dObj.d).padStart(2, '0');
              newRow[originalKey] = `${d}-${m}-${y}`;
            } else {
              newRow[originalKey] = String(val).trim();
            }
          } else if (typeof val === 'string' && val.trim() !== '') {
            newRow[originalKey] = val.trim();
          } else if (val !== null && val !== undefined && val !== '') {
            newRow[originalKey] = String(val).trim();
          }
        });
        
        newLocations.push(newRow);
      });
      
      if (newLocations.length > 0) {
        setData([...(manualData || []), ...newLocations]);
        toast.success(`Successfully uploaded ${newLocations.length} locations`, { id: "upload" });
      } else {
        toast.error("No valid data found in file", { id: "upload" });
      }
    } catch (err) {
      console.error("Error reading file:", err);
      toast.error("Failed to process uploaded file", { id: "upload" });
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };


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
    
    // Check if this is a P6-derived row (id starts with 'loc-')
    const isP6Row = rowToDelete.id && rowToDelete.id.toString().startsWith('loc-');
    
    if (isP6Row) {
      // For P6 rows, mark as deleted so they stay hidden even though P6 data keeps re-adding them
      const existingIdx = currentManualRows.findIndex(m => 
        (m.id && m.id === rowToDelete.id) || 
        (m.locNo && m.locNo.toUpperCase() === rowToDelete.locNo?.toUpperCase())
      );
      if (existingIdx >= 0) {
        currentManualRows[existingIdx] = { ...currentManualRows[existingIdx], isDeleted: true };
      } else {
        currentManualRows.push({ ...rowToDelete, isDeleted: true });
      }
    } else {
      // For standalone/uploaded rows, physically remove them from the array
      const removeIdx = currentManualRows.findIndex(m => 
        (m.id && m.id === rowToDelete.id) || 
        (m.locNo && rowToDelete.locNo && m.locNo.toUpperCase() === rowToDelete.locNo.toUpperCase())
      );
      if (removeIdx >= 0) {
        currentManualRows.splice(removeIdx, 1);
      }
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
              onClick={() => setIsUploadModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors shadow-sm"
            >
              <Upload className="w-4 h-4" />
              Upload Activities
            </button>
          )}
          {!isLocked && (
            <button
              onClick={handleAddLocation}
              className="flex items-center gap-2 px-3 py-1.5 bg-indigo-50 text-indigo-700 rounded-lg hover:bg-indigo-100 font-medium transition-colors border border-indigo-200 text-sm"
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
          fixedColumnsCount={4}
          emptyMessage="No EHV Locations Tracked"
          onSave={onSave}
          onSubmit={onSubmit}
          onExportAll={onExportAll}
          onPush={onPush}
          onRowDelete={isLocked ? undefined : handleRowDelete}
        />
      </div>
      {isUploadModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl mx-4 max-h-[90vh] flex flex-col overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 bg-gradient-to-r from-emerald-600 to-teal-600 flex-shrink-0">
              <div className="flex items-center gap-2 text-white">
                <Upload className="w-5 h-5" />
                <h3 className="text-lg font-semibold">Upload Activities — EHV</h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleDownloadTemplate}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs text-white/90 bg-white/15 rounded-lg hover:bg-white/25 transition-colors"
                  title="Download Excel template"
                >
                  <Download className="w-3.5 h-3.5" />
                  Template
                </button>
                <button onClick={() => setIsUploadModalOpen(false)} className="text-white/80 hover:text-white transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              <div
                className="relative border-2 border-dashed rounded-xl p-10 text-center transition-all cursor-pointer border-gray-300 hover:border-emerald-400 hover:bg-emerald-50/30"
                onClick={() => fileInputRef.current?.click()}
              >
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={(e) => { handleFileUpload(e); setIsUploadModalOpen(false); }} 
                  accept=".xlsx,.xls,.csv" 
                  className="hidden" 
                />
                <div className="flex flex-col items-center gap-3">
                  <div className="w-14 h-14 rounded-full flex items-center justify-center transition-colors bg-gray-100 text-gray-400">
                    <FileSpreadsheet className="w-7 h-7" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-700">Drag & drop your Excel file here</p>
                    <p className="text-xs text-gray-500 mt-1">
                      or <span className="text-emerald-600 font-medium">click to browse</span> — supports .xlsx, .xls, .csv
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-2 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                <p className="text-xs text-yellow-800">
                  <span className="font-semibold">DPR-Level Activities:</span> Uploaded activities will be tracked within DPR only. If `Activity ID` is provided and exists, it will update the existing activity; otherwise, new Activity IDs (DPR-xxx) will be generated.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
