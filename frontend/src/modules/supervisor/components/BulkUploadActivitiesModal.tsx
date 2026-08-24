import React, { useState, useRef, useCallback, useMemo } from 'react';
import { X, Upload, FileSpreadsheet, AlertCircle, CheckCircle2, Download, Loader2, Trash2 } from 'lucide-react';
import * as XLSX from 'xlsx';
import { toast } from 'sonner';
import {
  HEADER_MAP,
  getSheetFieldConfig,
  getTemplateForSheet,
  getPreviewColumnsForSheet,
} from './bulkUploadTemplates';

interface ParsedActivity {
  activityId?: string;
  description: string;
  uom: string;
  scope: number;
  wbsName: string;
  category: string;
  plannedStart: string;
  plannedFinish: string;
  remarks: string;
  block?: string;
  /** Work already done. The BESS progress sheets upload this as their "Completed" column. */
  cumulative?: number;
  actualStart?: string;
  actualFinish?: string;
  status?: string;
  extraData: Record<string, any>;
  _valid: boolean;
  _error?: string;
}

interface BulkUploadActivitiesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUpload: (activities: Omit<ParsedActivity, '_valid' | '_error'>[]) => Promise<void>;
  sheetType: string;
  templateColumns?: string[];
  templateHeaderStructure?: any[];
  templateColumnWidths?: Record<string, number>;
  existingActivities?: any[];
}

function resolveField(header: string): string | null {
  const h = header.toLowerCase().trim();
  for (const [field, aliases] of Object.entries(HEADER_MAP)) {
    if (aliases.includes(h)) return field;
  }
  return null;
}

const MONTH_ABBR = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/**
 * Normalise anything a date cell can hold into YYYY-MM-DD. The backend's _parse_date accepts that
 * format and nothing else - it returns None for everything else - so a value that escapes this
 * function is not merely mis-shown, it is dropped on save.
 */
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
  // Real date cells arrive as Date objects. SheetJS converts the day serial through a float and can
  // land a few seconds SHORT of midnight - 01-Jun-26 comes back as May 31 23:59:50 - so reading the
  // parts straight off yields the previous day. Snap to the nearest midnight before splitting.
  if (val instanceof Date) {
    const snapped = new Date(val.getFullYear(), val.getMonth(), val.getDate());
    if (val.getHours() >= 12) snapped.setDate(snapped.getDate() + 1);
    const y = snapped.getFullYear();
    const m = String(snapped.getMonth() + 1).padStart(2, '0');
    const d = String(snapped.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  const s = String(val).trim();
  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.split('T')[0];

  const parts = s.split(/[\/\-\.\s]+/);
  if (parts.length === 3) {
    const [a, b, c] = parts;
    const year = c.length === 2 ? `20${c}` : c;
    if (year.length === 4) {
      // dd-MMM-yy / dd-MMM-yyyy - the format Excel displays these columns in, so it is also what
      // gets typed by hand. This used to fall through and reach the backend as raw text.
      const monthIdx = MONTH_ABBR.indexOf(b.slice(0, 3).toLowerCase());
      if (monthIdx !== -1) {
        return `${year}-${String(monthIdx + 1).padStart(2, '0')}-${a.padStart(2, '0')}`;
      }
      // dd/mm/yyyy or dd-mm-yyyy
      if (/^\d+$/.test(a) && /^\d+$/.test(b)) {
        return `${year}-${b.padStart(2, '0')}-${a.padStart(2, '0')}`;
      }
    }
  }
  return s;
}

export const BulkUploadActivitiesModal: React.FC<BulkUploadActivitiesModalProps> = ({
  isOpen,
  onClose,
  onUpload,
  sheetType,
  templateColumns,
  templateHeaderStructure,
  templateColumnWidths,
  existingActivities = [],
}) => {
  const [activities, setActivities] = useState<ParsedActivity[]>([]);
  const [fileName, setFileName] = useState('');
  const [parsing, setParsing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Get sheet-specific field config and preview columns from centralized templates
  const fieldConfig = useMemo(() => getSheetFieldConfig(sheetType), [sheetType]);
  const previewColumns = useMemo(() => getPreviewColumnsForSheet(sheetType), [sheetType]);

  const downloadTemplate = async () => {
    try {
      const ExcelJS = await import('exceljs');
      const { saveAs } = await import('file-saver');

      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Activities');

      let headers: string[] = [];
      
      if (templateColumns && templateColumns.length > 0) {
        // Actions and S.No are structural. Status is derived from the dates on most sheets, but
        // the BESS progress sheets store it per activity, so they opt back in.
        headers = templateColumns.filter(c => {
          const lc = c.toLowerCase();
          if (lc === 'actions' || lc === 's.no') return false;
          if (lc === 'status') return !!fieldConfig.statusIsUploadable;
          return true;
        });
      } else {
        const { cols } = getTemplateForSheet(sheetType);
        headers = cols;
      }

      // Add Headers
      const headerRow = worksheet.addRow(headers);
      headerRow.eachCell((cell) => {
        const headerName = String(cell.value || '').toLowerCase().trim();
        const mandatoryFields = [
          'description', 'block', 'status', 'scope', 'physical progress %', 'completed',
          'baseline start', 'baseline finish', 'actual start', 'actual finish',
          'forecast start', 'forecast finish', 'balance'
        ];
        const isMandatory = mandatoryFields.includes(headerName);

        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: isMandatory ? 'FFFFFF00' : 'FFDDE4EC' } // Yellow for mandatory, Light slate for others
        };
        cell.font = { bold: true, color: { argb: 'FF000000' } };
        cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FF94A3B8' } },
          left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
          bottom: { style: 'thin', color: { argb: 'FF94A3B8' } },
          right: { style: 'thin', color: { argb: 'FFCBD5E1' } }
        };
      });

      // Set Column Widths
      headers.forEach((col, idx) => {
        let w = 150; // Default width
        if (templateColumnWidths && templateColumnWidths[col]) {
          w = templateColumnWidths[col];
        } else if (col === 'Description') {
          w = 250;
        }
        worksheet.getColumn(idx + 1).width = w / 7.5;
      });

      // Add a couple of dummy/empty rows for styling
      for (let i = 0; i < 2; i++) {
        const row = worksheet.addRow(new Array(headers.length).fill(''));
        row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
          const colName = headers[colNumber - 1] || '';
          const isLeftAlign = colName.toLowerCase().includes("description") || colName.toLowerCase().includes("activity");
          
          cell.alignment = { 
            vertical: 'middle', 
            horizontal: isLeftAlign ? 'left' : 'center',
            wrapText: true 
          };
          cell.border = {
            top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
            left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
            bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
            right: { style: 'thin', color: { argb: 'FFCBD5E1' } }
          };
        });
      }

      const buffer = await workbook.xlsx.writeBuffer();
      const safeTitle = (sheetType || 'Activities').replace(/[^a-z0-9]/gi, '_');
      saveAs(new Blob([buffer]), `BulkUploadTemplate_${safeTitle}.xlsx`);

    } catch (err) {
      console.error("Export failed", err);
    }
  };

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

        // Get the field config for this sheet type to determine validation rules
        const config = getSheetFieldConfig(sheetType);

        const seenDescriptions = new Set<string>();

        const parsed: ParsedActivity[] = jsonRows
          .filter((row) => {
            // Skip completely empty rows
            const vals = Object.values(row).filter((v) => v !== '' && v !== null && v !== undefined);
            return vals.length > 0;
          })
          .map((row) => {
            let desc = mapping.description ? String(row[mapping.description] || '').trim() : '';
            if (!desc) {
              const fallbackBlock = mapping.block ? String(row[mapping.block] || '').trim() : '';
              desc = fallbackBlock ? fallbackBlock : sheetType.replace(/_/g, ' ').toUpperCase();
            }
            const actId = mapping.activityId ? String(row[mapping.activityId] || '').trim() : '';
            const blockVal = mapping.block ? String(row[mapping.block] || '') : '';

            // Build extraData from sheet-specific fields
            const extraData: Record<string, any> = {};
            if (mapping.vendor && row[mapping.vendor]) {
              if (config.vendorFieldName === 'agencyName') {
                extraData.agencyName = String(row[mapping.vendor]);
              } else if (config.vendorFieldName === 'soVendorName') {
                extraData.soVendorName = String(row[mapping.vendor]);
              } else {
                extraData.vendorName = String(row[mapping.vendor]);
                extraData.vendor = String(row[mapping.vendor]);
              }
            }
            if (mapping.feeder && row[mapping.feeder]) extraData.feeder = String(row[mapping.feeder]);
            if (mapping.priority && row[mapping.priority]) extraData.priority = String(row[mapping.priority]);
            if (mapping.duration && row[mapping.duration]) extraData.duration = String(row[mapping.duration]);
            if (mapping.lineKm && row[mapping.lineKm]) extraData.lineKm = String(row[mapping.lineKm]);
            if (mapping.totalPole && row[mapping.totalPole]) extraData.totalPole = String(row[mapping.totalPole]);
            if (mapping.cableFrom && row[mapping.cableFrom]) extraData.cableFrom = String(row[mapping.cableFrom]);
            if (mapping.cableTo && row[mapping.cableTo]) extraData.cableTo = String(row[mapping.cableTo]);
            if (mapping.totalLengthMeter && row[mapping.totalLengthMeter]) extraData.totalLengthMeter = String(row[mapping.totalLengthMeter]);
            if (mapping.terminationEnd && row[mapping.terminationEnd]) extraData.terminationEnd = String(row[mapping.terminationEnd]);
            if (mapping.jointingKit && row[mapping.jointingKit]) extraData.jointingKit = String(row[mapping.jointingKit]);

            // Stone Column fields
            if (mapping.pss && row[mapping.pss]) {
              extraData.pss = String(row[mapping.pss]);
              extraData.substation = String(row[mapping.pss]);
            }
            if (mapping.substation && row[mapping.substation]) extraData.substation = String(row[mapping.substation]);
            if (mapping.drawingStatus && row[mapping.drawingStatus]) extraData.drawingStatus = String(row[mapping.drawingStatus]);
            if (mapping.rig && row[mapping.rig]) extraData.rig = String(row[mapping.rig]);
            if (mapping.length && row[mapping.length]) extraData.length = String(row[mapping.length]);
            if (mapping.columnInScope && row[mapping.columnInScope]) extraData.columnInScope = String(row[mapping.columnInScope]);
            if (mapping.plan && row[mapping.plan]) extraData.plan = String(row[mapping.plan]);
            if (mapping.achieved && row[mapping.achieved]) extraData.achieved = String(row[mapping.achieved]);
            if (mapping.balance && row[mapping.balance]) extraData.balance = String(row[mapping.balance]);

            // Progress fields
            if (mapping.spv && row[mapping.spv]) extraData.spv = String(row[mapping.spv]);
            if (mapping.fdnAllotmentDate && row[mapping.fdnAllotmentDate]) extraData.fdnAllotmentDate = formatDate(row[mapping.fdnAllotmentDate]);
            if (mapping.soilTestStatus && row[mapping.soilTestStatus]) extraData.soilTestStatus = String(row[mapping.soilTestStatus]);
            if (mapping.wtgCoordE && row[mapping.wtgCoordE]) extraData.wtgCoordE = String(row[mapping.wtgCoordE]);
            if (mapping.wtgCoordN && row[mapping.wtgCoordN]) extraData.wtgCoordN = String(row[mapping.wtgCoordN]);
            
            // Manpower fields
            if (mapping.hoursPerDay && row[mapping.hoursPerDay]) extraData.hoursPerDay = String(row[mapping.hoursPerDay]);
            if (mapping.yesterdayValue && row[mapping.yesterdayValue]) extraData.yesterdayValue = String(row[mapping.yesterdayValue]);
            if (mapping.todayValue && row[mapping.todayValue]) extraData.todayValue = String(row[mapping.todayValue]);

            // 33KV fields
            if (mapping.jointingCumulative && row[mapping.jointingCumulative]) extraData.jointingCumulative = String(row[mapping.jointingCumulative]);
            if (mapping.jointingBalance && row[mapping.jointingBalance]) extraData.jointingBalance = String(row[mapping.jointingBalance]);
            if (mapping.terminationCumulative && row[mapping.terminationCumulative]) extraData.terminationCumulative = String(row[mapping.terminationCumulative]);
            if (mapping.terminationBalance && row[mapping.terminationBalance]) extraData.terminationBalance = String(row[mapping.terminationBalance]);

            // BESS Civil / Electrical / Testing. Forecast dates have no dedicated column on a
            // custom activity — the sheet derives Actual vs Forecast from the data date — so they
            // ride along in extraData rather than being silently dropped.
            if (mapping.forecastStart && row[mapping.forecastStart]) extraData.forecastStart = formatDate(row[mapping.forecastStart]);
            if (mapping.forecastFinish && row[mapping.forecastFinish]) extraData.forecastFinish = formatDate(row[mapping.forecastFinish]);
            if (mapping.physicalProgress && row[mapping.physicalProgress]) extraData.physicalProgress = String(row[mapping.physicalProgress]);

            if (config.useCableFromAsDescription) {
              extraData.cableFrom = desc;
            }

            // Validate based on per-sheet primary field configuration
            let valid: boolean;
            let validationError: string | undefined;

            if (config.primaryField === 'block') {
              // For sheets like Stone Column, the block/location is the primary identifier
              const blockPresent = blockVal.trim().length > 0 || desc.length > 0;
              valid = blockPresent;
              validationError = blockPresent ? undefined : `${config.primaryFieldLabel} is required`;
            } else {
              // Standard sheets require description
              valid = desc.length > 0;
              validationError = valid ? undefined : `${config.primaryFieldLabel} is required`;
            }

            // Duplicate Check
            if (valid) {
              const lowerDesc = desc.trim().toLowerCase();
              const isExisting = existingActivities.some((a: any) => {
                const actName = String(a.description || a.subHeading || a.name || '').trim().toLowerCase();
                return actName === lowerDesc;
              });
              if (isExisting) {
                valid = false;
                validationError = `Activity '${desc}' already exists. No duplication in DPR level activities.`;
              } else if (seenDescriptions.has(lowerDesc)) {
                valid = false;
                validationError = `Activity '${desc}' is duplicated in this file.`;
              } else {
                seenDescriptions.add(lowerDesc);
              }
            }

              // For Stone Column sheets, Plan column maps to plan field (not scope),
              // so fallback scope to the plan value when no explicit scope column is present
              const scopeVal = mapping.scope ? Number(row[mapping.scope]) || 0 :
                               (mapping.plan ? Number(row[mapping.plan]) || 0 : 0);

              const statusVal = mapping.status ? String(row[mapping.status] || '').trim() : '';
              // The sheet reads status off extraData, so keep both in step.
              if (statusVal) extraData.status = statusVal;

              return {
              activityId: actId,
              description: desc,
              uom: mapping.uom ? String(row[mapping.uom] || 'Nos') : 'Nos',
              scope: scopeVal,
              cumulative: mapping.cumulative ? Number(row[mapping.cumulative]) || 0 : 0,
              wbsName: mapping.wbsName ? String(row[mapping.wbsName] || '') : '',
              category: mapping.category ? String(row[mapping.category] || '') : '',
              block: blockVal,
              plannedStart: mapping.plannedStart ? formatDate(row[mapping.plannedStart]) : '',
              plannedFinish: mapping.plannedFinish ? formatDate(row[mapping.plannedFinish]) : '',
              actualStart: mapping.actualStart ? formatDate(row[mapping.actualStart]) : '',
              actualFinish: mapping.actualFinish ? formatDate(row[mapping.actualFinish]) : '',
              status: statusVal,
              remarks: mapping.remarks ? String(row[mapping.remarks] || '') : '',
              extraData,
              _valid: valid,
              _error: validationError,
            } as ParsedActivity;
          });

        if (parsed.length === 0) {
          setError('No valid rows found in the file. Please ensure data rows exist below the header.');
          setParsing(false);
          return;
        }

        setActivities(parsed);
        
        const dupCount = parsed.filter(a => !a._valid && a._error?.includes('already exists')).length;
        if (dupCount > 0) {
          toast.error("Activity already exists, no duplication in DPR level activities.");
        }
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
    sheetType === 'wind_stone_column' ? 'Stone Column' :
    sheetType === 'dp_qty' ? 'DP Qty' :
    sheetType === 'ac_sheet' ? 'AC Sheet' :
    sheetType === 'dc_sheet' ? 'DC Sheet' :
    sheetType === 'testing_commissioning' ? 'Testing & Comm.' :
    sheetType === 'manpower_details' ? 'Manpower' :
    sheetType === 'bess_civil' ? 'Civil' :
    sheetType === 'bess_electrical' ? 'Electrical' :
    sheetType === 'bess_testing' ? 'Testing & Comm.' :
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
              onClick={() => downloadTemplate()}
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

          {/* Preview Table — data-driven from previewColumns config */}
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
                      {previewColumns.map((col, colIdx) => (
                        <th
                          key={colIdx}
                          className={`px-2 py-2 font-semibold text-gray-600 ${col.align === 'right' ? 'text-right' : 'text-left'} ${col.minWidth || ''}`}
                        >
                          {col.header}
                        </th>
                      ))}
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
                        {previewColumns.map((col, colIdx) => {
                          const value = col.accessor(act);
                          const isRemarks = col.header === 'Remarks';
                          const isDescription = col.header === 'Description';
                          return (
                            <td
                              key={colIdx}
                              className={`px-2 py-1.5 ${col.align === 'right' ? 'text-right' : ''} ${
                                isDescription ? 'text-gray-800 whitespace-normal' :
                                isRemarks ? 'text-gray-500 max-w-[120px] truncate' :
                                colIdx === 0 ? 'text-gray-800 font-medium' :
                                'text-gray-600'
                              }`}
                              title={isRemarks ? String(value) : undefined}
                            >
                              {isDescription && !value ? (
                                <span className="text-red-400 italic">Missing</span>
                              ) : (
                                value || '-'
                              )}
                            </td>
                          );
                        })}
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
            <strong>DPR-Level Activities:</strong> Uploaded activities will be tracked within DPR only. If `Activity ID` is provided and exists, it will update the existing activity; otherwise, new Activity IDs (DPR-xxx) will be generated.
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

