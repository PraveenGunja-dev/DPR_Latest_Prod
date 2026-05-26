import React, { useState, useRef, useCallback } from 'react';
import { X, Upload, FileSpreadsheet, AlertCircle, CheckCircle2, Download, Loader2, Trash2 } from 'lucide-react';
import * as XLSX from 'xlsx';

interface ParsedActivity {
  description: string;
  uom: string;
  scope: number;
  wbsName: string;
  category: string;
  plannedStart: string;
  plannedFinish: string;
  remarks: string;
  extraData: Record<string, any>;
  _valid: boolean;
  _error?: string;
}

interface BulkUploadActivitiesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUpload: (activities: Omit<ParsedActivity, '_valid' | '_error'>[]) => Promise<void>;
  sheetType: string;
}

/**
 * Column header aliases → field mapping.
 * Each key is the internal field name; values are possible Excel column headers (lowercase).
 */
const HEADER_MAP: Record<string, string[]> = {
  description: ['description', 'activity description', 'activity', 'activity name', 'desc', 'name'],
  uom: ['uom', 'unit', 'unit of measure', 'unit of measurement'],
  scope: ['scope', 'quantity', 'qty', 'total quantity', 'total qty', 'target'],
  wbsName: ['wbs', 'wbs name', 'section', 'wbs / section', 'wbs/section'],
  category: ['category', 'cat', 'type'],
  plannedStart: ['planned start', 'plan start', 'start date', 'planned_start', 'start'],
  plannedFinish: ['planned finish', 'plan finish', 'finish date', 'planned_finish', 'finish', 'end date'],
  remarks: ['remarks', 'remark', 'notes', 'note', 'comment', 'comments'],
  vendor: ['vendor', 'vendor name', 'agency', 'agency name', 'vendor / agency'],
  feeder: ['feeder', 'feeder name'],
  priority: ['priority'],
  duration: ['duration'],
  lineKm: ['line km', 'line in km', 'linekm'],
  totalPole: ['total poles', 'total pole', 'poles', 'totalpole'],
  block: ['block', 'block name'],
};

function resolveField(header: string): string | null {
  const h = header.toLowerCase().trim();
  for (const [field, aliases] of Object.entries(HEADER_MAP)) {
    if (aliases.includes(h)) return field;
  }
  return null;
}

function formatDate(val: any): string {
  if (!val) return '';
  // xlsx may return serial date numbers
  if (typeof val === 'number') {
    const d = XLSX.SSF.parse_date_code(val);
    if (d) {
      const mm = String(d.m).padStart(2, '0');
      const dd = String(d.d).padStart(2, '0');
      return `${d.y}-${mm}-${dd}`;
    }
  }
  const s = String(val).trim();
  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.split('T')[0];
  // Try DD/MM/YYYY or DD-MM-YYYY
  const parts = s.split(/[\/\-\.]/);
  if (parts.length === 3) {
    const [a, b, c] = parts;
    if (c.length === 4) return `${c}-${b.padStart(2, '0')}-${a.padStart(2, '0')}`;
  }
  return s;
}

function getTemplateForSheet(sheetType: string) {
  let cols = ['Description', 'UOM', 'Scope', 'Planned Start', 'Planned Finish', 'Remarks'];
  let sampleData1 = ['Sample Activity 1', 'Nos', 10, '2025-01-01', '2025-01-15', 'Phase 1'];
  let sampleData2 = ['Sample Activity 2', 'Nos', 5, '2025-02-01', '2025-02-28', ''];

  switch (sheetType) {
    case 'wind_33kv':
      cols = ['Description', 'UOM', 'Scope', 'Vendor', 'Feeder', 'Line in KM', 'Total Pole', 'Planned Start', 'Planned Finish', 'Remarks'];
      sampleData1 = ['Pole Erection', 'Nos', 15, 'ABC Corp', 'Feeder A', '10.5', '15', '2025-01-01', '2025-01-15', 'Phase 1'];
      sampleData2 = ['Stringing', 'KM', 10.5, 'XYZ Ltd', 'Feeder A', '10.5', '0', '2025-02-01', '2025-02-28', 'Phase 2'];
      break;
    case 'wind_pss':
    case 'wind_progress':
      cols = ['Description', 'UOM', 'Scope', 'Vendor', 'Planned Start', 'Planned Finish', 'Remarks'];
      sampleData1 = ['Tower Foundation', 'Nos', 10, 'ABC Corp', '2025-01-01', '2025-01-15', 'Phase 1'];
      sampleData2 = ['Tower Erection', 'Nos', 10, 'XYZ Ltd', '2025-02-01', '2025-02-28', 'Phase 2'];
      break;
    case 'dp_qty':
    case 'dp_block':
    case 'dp_vendor_idt':
      cols = ['Description', 'UOM', 'Scope', 'Block', 'Planned Start', 'Planned Finish', 'Remarks'];
      sampleData1 = ['Trenching', 'Mtr', 500, 'Block A', '2025-01-01', '2025-01-15', 'Phase 1'];
      sampleData2 = ['Cable Laying', 'Mtr', 500, 'Block A', '2025-02-01', '2025-02-28', 'Phase 2'];
      break;
    case 'wind_ehv':
    case 'testing_commissioning':
      cols = ['Description', 'UOM', 'Scope', 'Planned Start', 'Planned Finish', 'Remarks'];
      sampleData1 = ['Equipment Installation', 'Nos', 10, '2025-01-01', '2025-01-15', 'Phase 1'];
      sampleData2 = ['Testing & Commissioning', 'Lot', 1, '2025-02-01', '2025-02-28', ''];
      break;
    case 'manpower_details':
      cols = ['Description', 'UOM', 'Scope', 'Vendor', 'Planned Start', 'Planned Finish', 'Remarks'];
      sampleData1 = ['Supervisor', 'Nos', 5, 'ABC Corp', '2025-01-01', '2025-01-15', 'Phase 1'];
      sampleData2 = ['Labor', 'Nos', 50, 'XYZ Ltd', '2025-02-01', '2025-02-28', 'Phase 2'];
      break;
    case 'ac_sheet':
    case 'dc_sheet':
      cols = ['Description', 'UOM', 'Scope', 'WBS / Section', 'Category', 'Planned Start', 'Planned Finish', 'Remarks'];
      sampleData1 = ['Inverter Installation', 'Nos', 5, 'Section A', 'Electrical', '2025-01-01', '2025-01-15', 'Phase 1'];
      sampleData2 = ['Module Mounting', 'Nos', 100, 'Section A', 'Mechanical', '2025-02-01', '2025-02-28', 'Phase 2'];
      break;
    default:
      break;
  }
  
  return { cols, data: [cols, sampleData1, sampleData2] };
}

function downloadTemplate(sheetType: string) {
  const { cols, data } = getTemplateForSheet(sheetType);
  const ws = XLSX.utils.aoa_to_sheet(data);
  // Set column widths dynamically
  ws['!cols'] = cols.map((col, i) => ({ wch: col === 'Description' ? 35 : 18 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Activities');
  XLSX.writeFile(wb, `DPR_Activities_Template_${sheetType}.xlsx`);
}

export const BulkUploadActivitiesModal: React.FC<BulkUploadActivitiesModalProps> = ({
  isOpen,
  onClose,
  onUpload,
  sheetType,
}) => {
  const [activities, setActivities] = useState<ParsedActivity[]>([]);
  const [fileName, setFileName] = useState('');
  const [parsing, setParsing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reset = useCallback(() => {
    setActivities([]);
    setFileName('');
    setError('');
    setParsing(false);
    setUploading(false);
  }, []);

  const handleClose = useCallback(() => {
    reset();
    onClose();
  }, [reset, onClose]);

  const parseFile = useCallback((file: File) => {
    setError('');
    setParsing(true);
    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: 'array', cellDates: true });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const jsonRows: any[] = XLSX.utils.sheet_to_json(ws, { defval: '' });

        if (jsonRows.length === 0) {
          setError('The Excel file has no data rows. Please check the file and try again.');
          setParsing(false);
          return;
        }

        // Build column mapping from actual headers
        const headers = Object.keys(jsonRows[0]);
        const mapping: Record<string, string> = {};
        headers.forEach((h) => {
          const field = resolveField(h);
          if (field) mapping[field] = h;
        });

        if (!mapping.description) {
          setError('Could not find a "Description" column in the file. Please ensure your Excel has a column named "Description" or "Activity Description".');
          setParsing(false);
          return;
        }

        const parsed: ParsedActivity[] = jsonRows
          .filter((row) => {
            // Skip completely empty rows
            const vals = Object.values(row).filter((v) => v !== '' && v !== null && v !== undefined);
            return vals.length > 0;
          })
          .map((row) => {
            const desc = String(row[mapping.description] || '').trim();

            // Build extraData from sheet-specific fields
            const extraData: Record<string, any> = {};
            if (mapping.vendor && row[mapping.vendor]) {
              if (sheetType === 'wind_33kv') {
                extraData.agencyName = String(row[mapping.vendor]);
              } else {
                extraData.vendorName = String(row[mapping.vendor]);
              }
            }
            if (mapping.feeder && row[mapping.feeder]) extraData.feeder = String(row[mapping.feeder]);
            if (mapping.priority && row[mapping.priority]) extraData.priority = String(row[mapping.priority]);
            if (mapping.duration && row[mapping.duration]) extraData.duration = String(row[mapping.duration]);
            if (mapping.lineKm && row[mapping.lineKm]) extraData.lineKm = String(row[mapping.lineKm]);
            if (mapping.totalPole && row[mapping.totalPole]) extraData.totalPole = String(row[mapping.totalPole]);

            const valid = desc.length > 0;

            return {
              description: desc,
              uom: mapping.uom ? String(row[mapping.uom] || 'Nos') : 'Nos',
              scope: mapping.scope ? Number(row[mapping.scope]) || 0 : 0,
              wbsName: mapping.wbsName ? String(row[mapping.wbsName] || '') : '',
              category: mapping.category ? String(row[mapping.category] || '') : '',
              block: mapping.block ? String(row[mapping.block] || '') : '',
              plannedStart: mapping.plannedStart ? formatDate(row[mapping.plannedStart]) : '',
              plannedFinish: mapping.plannedFinish ? formatDate(row[mapping.plannedFinish]) : '',
              remarks: mapping.remarks ? String(row[mapping.remarks] || '') : '',
              extraData,
              _valid: valid,
              _error: valid ? undefined : 'Description is required',
            } as ParsedActivity;
          });

        if (parsed.length === 0) {
          setError('No valid rows found in the file. Please ensure data rows exist below the header.');
          setParsing(false);
          return;
        }

        setActivities(parsed);
      } catch (err: any) {
        console.error('Excel parse error:', err);
        setError(`Failed to parse file: ${err.message || 'Unknown error'}`);
      }
      setParsing(false);
    };
    reader.readAsArrayBuffer(file);
  }, [sheetType]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) parseFile(file);
  }, [parseFile]);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) parseFile(file);
    // Reset input so same file can be re-selected
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [parseFile]);

  const removeRow = useCallback((index: number) => {
    setActivities((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleUpload = useCallback(async () => {
    const validActivities = activities.filter((a) => a._valid);
    if (validActivities.length === 0) return;

    setUploading(true);
    try {
      // Strip internal flags before sending
      const payload = validActivities.map(({ _valid, _error, ...rest }) => rest);
      await onUpload(payload);
      handleClose();
    } catch (err) {
      console.error('Bulk upload error:', err);
      setError('Failed to upload activities. Please try again.');
    }
    setUploading(false);
  }, [activities, onUpload, handleClose]);

  if (!isOpen) return null;

  const validCount = activities.filter((a) => a._valid).length;
  const invalidCount = activities.length - validCount;

  const sheetLabel =
    sheetType === 'wind_ehv' ? 'EHV' :
    sheetType === 'wind_pss' ? 'PSS' :
    sheetType === 'wind_33kv' ? '33KV' :
    sheetType === 'wind_progress' ? 'Progress' :
    sheetType === 'dp_qty' ? 'DP Qty' :
    sheetType === 'ac_sheet' ? 'AC Sheet' :
    sheetType === 'dc_sheet' ? 'DC Sheet' :
    sheetType === 'testing_commissioning' ? 'Testing & Comm.' :
    sheetType === 'manpower_details' ? 'Manpower' :
    sheetType;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl mx-4 max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-gradient-to-r from-emerald-600 to-teal-600 flex-shrink-0">
          <div className="flex items-center gap-2 text-white">
            <Upload className="w-5 h-5" />
            <h3 className="text-lg font-semibold">Upload Activities — {sheetLabel}</h3>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => downloadTemplate(sheetType)}
              className="flex items-center gap-1 px-3 py-1.5 text-xs text-white/90 bg-white/15 rounded-lg hover:bg-white/25 transition-colors"
              title="Download Excel template"
            >
              <Download className="w-3.5 h-3.5" />
              Template
            </button>
            <button onClick={handleClose} className="text-white/80 hover:text-white transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* Drop Zone (shown when no activities parsed yet) */}
          {activities.length === 0 && !parsing && (
            <div
              className={`relative border-2 border-dashed rounded-xl p-10 text-center transition-all cursor-pointer ${
                dragActive
                  ? 'border-emerald-500 bg-emerald-50'
                  : 'border-gray-300 hover:border-emerald-400 hover:bg-emerald-50/30'
              }`}
              onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
              onDragLeave={() => setDragActive(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleFileChange}
                className="hidden"
              />
              <div className="flex flex-col items-center gap-3">
                <div className={`w-14 h-14 rounded-full flex items-center justify-center transition-colors ${
                  dragActive ? 'bg-emerald-100 text-emerald-600' : 'bg-gray-100 text-gray-400'
                }`}>
                  <FileSpreadsheet className="w-7 h-7" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-700">
                    {dragActive ? 'Drop file here' : 'Drag & drop your Excel file here'}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    or <span className="text-emerald-600 font-medium">click to browse</span> — supports .xlsx, .xls, .csv
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Parsing Spinner */}
          {parsing && (
            <div className="flex items-center justify-center gap-3 py-12">
              <Loader2 className="w-6 h-6 text-emerald-600 animate-spin" />
              <span className="text-sm text-gray-600">Parsing {fileName}...</span>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="flex items-start gap-2 p-4 bg-red-50 border border-red-200 rounded-lg">
              <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm text-red-800 font-medium">Error</p>
                <p className="text-xs text-red-700 mt-0.5">{error}</p>
              </div>
            </div>
          )}

          {/* Preview Table */}
          {activities.length > 0 && (
            <>
              {/* Summary bar */}
              <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-3">
                  <span className="text-sm text-gray-700 font-medium">
                    <FileSpreadsheet className="w-4 h-4 inline mr-1.5 text-emerald-600" />
                    {fileName}
                  </span>
                  <span className="text-xs px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full font-medium">
                    {validCount} valid
                  </span>
                  {invalidCount > 0 && (
                    <span className="text-xs px-2 py-0.5 bg-red-100 text-red-700 rounded-full font-medium">
                      {invalidCount} invalid
                    </span>
                  )}
                </div>
                <button
                  onClick={reset}
                  className="text-xs text-gray-500 hover:text-gray-700 underline"
                >
                  Choose different file
                </button>
              </div>

              {/* Table */}
              <div className="border border-gray-200 rounded-lg overflow-auto max-h-[45vh]">
                <table className="w-full text-xs whitespace-nowrap">
                  <thead className="bg-gray-50 sticky top-0 z-10">
                    <tr>
                      <th className="px-2 py-2 text-left font-semibold text-gray-600 w-8">#</th>
                      <th className="px-2 py-2 text-left font-semibold text-gray-600 w-8"></th>
                      <th className="px-2 py-2 text-left font-semibold text-gray-600 min-w-[180px]">Description</th>
                      <th className="px-2 py-2 text-left font-semibold text-gray-600">UOM</th>
                      <th className="px-2 py-2 text-right font-semibold text-gray-600">Scope</th>
                      {sheetType === 'ac_sheet' || sheetType === 'dc_sheet' ? (
                        <>
                          <th className="px-2 py-2 text-left font-semibold text-gray-600">WBS</th>
                          <th className="px-2 py-2 text-left font-semibold text-gray-600">Category</th>
                        </>
                      ) : null}
                      {sheetType.includes('dp_') ? (
                        <th className="px-2 py-2 text-left font-semibold text-gray-600">Block</th>
                      ) : null}
                      {sheetType === 'wind_33kv' || sheetType === 'wind_pss' || sheetType === 'wind_progress' || sheetType === 'manpower_details' ? (
                        <th className="px-2 py-2 text-left font-semibold text-gray-600">Vendor</th>
                      ) : null}
                      {sheetType === 'wind_33kv' ? (
                        <>
                          <th className="px-2 py-2 text-left font-semibold text-gray-600">Feeder</th>
                          <th className="px-2 py-2 text-right font-semibold text-gray-600">Line KM</th>
                          <th className="px-2 py-2 text-right font-semibold text-gray-600">Poles</th>
                        </>
                      ) : null}
                      <th className="px-2 py-2 text-left font-semibold text-gray-600">Start</th>
                      <th className="px-2 py-2 text-left font-semibold text-gray-600">Finish</th>
                      <th className="px-2 py-2 text-left font-semibold text-gray-600">Remarks</th>
                      <th className="px-2 py-2 w-8"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {activities.map((act, i) => (
                      <tr
                        key={i}
                        className={`border-t border-gray-100 ${
                          !act._valid
                            ? 'bg-red-50'
                            : i % 2 === 0
                            ? 'bg-white'
                            : 'bg-gray-50/50'
                        } hover:bg-blue-50/30 transition-colors`}
                      >
                        <td className="px-2 py-1.5 text-gray-400">{i + 1}</td>
                        <td className="px-2 py-1.5">
                          {act._valid ? (
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                          ) : (
                            <AlertCircle className="w-3.5 h-3.5 text-red-500" title={act._error} />
                          )}
                        </td>
                        <td className="px-2 py-1.5 text-gray-800 font-medium whitespace-normal">{act.description || <span className="text-red-400 italic">Missing</span>}</td>
                        <td className="px-2 py-1.5 text-gray-600">{act.uom}</td>
                        <td className="px-2 py-1.5 text-right text-gray-600">{act.scope || '-'}</td>
                        {sheetType === 'ac_sheet' || sheetType === 'dc_sheet' ? (
                          <>
                            <td className="px-2 py-1.5 text-gray-600">{act.wbsName || '-'}</td>
                            <td className="px-2 py-1.5 text-gray-600">{act.category || '-'}</td>
                          </>
                        ) : null}
                        {sheetType.includes('dp_') ? (
                          <td className="px-2 py-1.5 text-gray-600">{act.block || '-'}</td>
                        ) : null}
                        {sheetType === 'wind_33kv' || sheetType === 'wind_pss' || sheetType === 'wind_progress' || sheetType === 'manpower_details' ? (
                          <td className="px-2 py-1.5 text-gray-600">{act.extraData?.vendorName || act.extraData?.agencyName || '-'}</td>
                        ) : null}
                        {sheetType === 'wind_33kv' ? (
                          <>
                            <td className="px-2 py-1.5 text-gray-600">{act.extraData?.feeder || '-'}</td>
                            <td className="px-2 py-1.5 text-right text-gray-600">{act.extraData?.lineKm || '-'}</td>
                            <td className="px-2 py-1.5 text-right text-gray-600">{act.extraData?.totalPole || '-'}</td>
                          </>
                        ) : null}
                        <td className="px-2 py-1.5 text-gray-600">{act.plannedStart || '-'}</td>
                        <td className="px-2 py-1.5 text-gray-600">{act.plannedFinish || '-'}</td>
                        <td className="px-2 py-1.5 text-gray-500 max-w-[120px] truncate" title={act.remarks}>{act.remarks || '-'}</td>
                        <td className="px-2 py-1.5">
                          <button
                            onClick={() => removeRow(i)}
                            className="text-gray-400 hover:text-red-500 transition-colors"
                            title="Remove row"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* Info banner */}
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5 text-xs text-amber-800">
            <strong>DPR-Level Activities:</strong> Uploaded activities will be tracked within DPR only. Activity IDs (DPR-xxx) will be auto-generated. They will not be synced to Oracle P6.
          </div>
        </div>

        {/* Footer */}
        {activities.length > 0 && (
          <div className="flex justify-end gap-3 px-6 py-4 bg-gray-50 border-t border-gray-200 flex-shrink-0">
            <button
              type="button"
              onClick={handleClose}
              className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-100 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleUpload}
              disabled={validCount === 0 || uploading}
              className="px-5 py-2 text-sm text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
            >
              {uploading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4" />
                  Upload {validCount} {validCount === 1 ? 'Activity' : 'Activities'}
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
