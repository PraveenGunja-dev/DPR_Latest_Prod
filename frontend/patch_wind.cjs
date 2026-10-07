const fs = require('fs');
let content = fs.readFileSync('D:\\\\BESS\\\\frontend\\\\src\\\\modules\\\\supervisor\\\\components\\\\wind\\\\WindEHVTable.tsx', 'utf8');

const columnMap = `
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
`;

const fileRef = `
  const fileInputRef = useRef<HTMLInputElement>(null);

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
      
      XLSX.writeFile(wb, \`EHV_Tracker_Template_\${new Date().toISOString().split('T')[0]}.xlsx\`);
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
        
        const newRow: any = { id: \`manual-upload-\${Date.now()}-\${Math.random().toString(36).substring(7)}\` };
        
        Object.entries(row).forEach(([header, val]) => {
          const originalKey = reverseMap[header] || header;
          
          if (val instanceof Date) {
            newRow[originalKey] = val.toISOString().split('T')[0];
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
        toast.success(\`Successfully uploaded \${newLocations.length} locations\`, { id: "upload" });
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
`;

// Insert the column map right after columns useMemo
content = content.replace('const editableColumns = useMemo(() => columns, [columns]);', columnMap + '\n  const editableColumns = useMemo(() => columns, [columns]);\n' + fileRef);

// Add the buttons
const buttonsHTML = `
          {!isLocked && (
            <>
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileUpload} 
                accept=".xlsx,.xls,.csv" 
                className="hidden" 
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-lg hover:bg-emerald-100 font-medium transition-colors border border-emerald-200 text-sm"
              >
                <Upload className="w-4 h-4" />
                Upload
              </button>
              <button
                onClick={handleDownloadTemplate}
                className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 text-slate-700 rounded-lg hover:bg-slate-100 font-medium transition-colors border border-slate-200 text-sm"
              >
                <Download className="w-4 h-4" />
                Template
              </button>
              <button
                onClick={handleAddLocation}
                className="flex items-center gap-2 px-3 py-1.5 bg-indigo-50 text-indigo-700 rounded-lg hover:bg-indigo-100 font-medium transition-colors border border-indigo-200 text-sm"
              >
                <Plus className="w-4 h-4" />
                Add Location
              </button>
            </>
          )}
`;

content = content.replace(
  /{!isLocked && \([\s\S]*?<Plus className="w-4 h-4" \/>[\s\S]*?Add Location[\s\S]*?<\/button>[\s\S]*?\)}/,
  buttonsHTML
);

fs.writeFileSync('D:\\\\BESS\\\\frontend\\\\src\\\\modules\\\\supervisor\\\\components\\\\wind\\\\WindEHVTable.tsx', content, 'utf8');
console.log('Patched WindEHVTable.tsx successfully');
