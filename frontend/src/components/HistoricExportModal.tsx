import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { History, Download, Loader2, AlertCircle } from "lucide-react";
import { getDailyProgressFullDump, indianDateFormat } from "@/services/dprService";
import { toast } from "sonner";

interface HistoricExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string | number;
  sheetType: string;
  title?: string;
  /** The sheet's own columns/rows/styling, so the export carries every column the live sheet has, not just Activity ID + Description. */
  columns: any[];
  data: any[];
  rowStyles?: Record<number, any>;
  columnWidths?: Record<string, number>;
}

const parseColor = (colorStr?: string) => {
  if (!colorStr) return null;
  const hex = colorStr.replace('#', '').toUpperCase();
  if (hex.length === 6) return 'FF' + hex;
  if (hex.length === 8) return hex;
  return null;
};

// Every column the live sheet shows (same as the "This Sheet" export), plus every daily-progress
// value ever recorded for this project/sheet appended as extra date columns - via the
// /daily-progress-full-dump endpoint, matched back to each row by its Activity ID.
export const HistoricExportModal = ({ isOpen, onClose, projectId, sheetType, title, columns, data, rowStyles = {}, columnWidths = {} }: HistoricExportModalProps) => {
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [bounds, setBounds] = useState<{ availableFrom: string | null; availableTo: string | null }>({ availableFrom: null, availableTo: null });
  const [loadingBounds, setLoadingBounds] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setLoadingBounds(true);
    getDailyProgressFullDump(projectId, sheetType, undefined, undefined, true)
      .then((res) => {
        if (cancelled) return;
        setBounds({ availableFrom: res.availableFrom, availableTo: res.availableTo });
        setFromDate(res.availableFrom || "");
        setToDate(res.availableTo || "");
      })
      .catch(() => {
        if (!cancelled) toast.error("Failed to check available historic date range");
      })
      .finally(() => { if (!cancelled) setLoadingBounds(false); });
    return () => { cancelled = true; };
  }, [isOpen, projectId, sheetType]);

  const handleExport = async () => {
    setExporting(true);
    try {
      const dump = await getDailyProgressFullDump(projectId, sheetType, fromDate || undefined, toDate || undefined);

      if (!dump.dates.length) {
        toast.info("No historic data found for the selected range.");
        return;
      }

      const safeColumns = Array.isArray(columns) ? columns : [];
      const safeData = Array.isArray(data) ? data : [];

      // Which sheet column holds the Activity ID - that's the key used to line a live row up
      // with its history. Falls back to column 0, which is where every sheet puts it.
      const idColIdx = (() => {
        const idx = safeColumns.findIndex((c: any) => {
          const label = String(typeof c === 'string' ? c : (c?.column || c?.label || '')).toLowerCase();
          return label === 'activity id' || label === 'activity' || label === 'activities';
        });
        return idx >= 0 ? idx : 0;
      })();

      const dumpByActivity = new Map(dump.rows.map((r) => [String(r.activityId || '').trim(), r]));

      const ExcelJS = await import('exceljs');
      const { saveAs } = await import('file-saver');

      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Historic Data');
      const totalCols = safeColumns.length + dump.dates.length;

      // Legend row - a "0" and a "never entered" cell look identical once both are just numbers,
      // so the green fill is what actually lets the reader tell "recorded, value was zero" apart
      // from "nobody ever filled this date in" (left blank below).
      const legendRow = worksheet.addRow(['Green cell = value recorded on that date. Blank = no entry made.']);
      worksheet.mergeCells(legendRow.number, 1, legendRow.number, totalCols);
      const legendCell = legendRow.getCell(1);
      legendCell.font = { italic: true, size: 10, color: { argb: 'FF166534' } };
      legendCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCFCE7' } };
      legendCell.alignment = { vertical: 'middle', horizontal: 'left' };

      const headers = [...safeColumns.map((c) => (typeof c === 'string' ? c : (c?.column || c?.label || ''))), ...dump.dates.map((d) => indianDateFormat(d))];
      const headerRow = worksheet.addRow(headers);
      headerRow.eachCell((cell, colNumber) => {
        const isDateCol = colNumber > safeColumns.length;
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: isDateCol ? 'FFFDE9C8' : 'FFDDE4EC' } };
        cell.font = { bold: true, color: { argb: 'FF000000' } };
        cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FF94A3B8' } },
          left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
          bottom: { style: 'thin', color: { argb: 'FF94A3B8' } },
          right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        };
      });

      safeColumns.forEach((col, idx) => {
        const label = typeof col === 'string' ? col : (col?.column || col?.label || '');
        worksheet.getColumn(idx + 1).width = (columnWidths[label] || 100) / 7.5;
      });
      dump.dates.forEach((_, i) => {
        worksheet.getColumn(safeColumns.length + i + 1).width = 12;
      });

      safeData.forEach((rowObj, index) => {
        const activityId = String((rowObj as any)?.[idColIdx] ?? '').trim();
        const matched = activityId ? dumpByActivity.get(activityId) : undefined;
        const dateValues = dump.dates.map((d) => (matched && d in matched.values ? matched.values[d] : ''));

        const sheetValues = safeColumns.map((_, idx) => (Array.isArray(rowObj) ? rowObj[idx] : (rowObj as any)?.[idx]));
        const row = worksheet.addRow([...sheetValues, ...dateValues]);

        const style = rowStyles[index] || {};
        const isCat = (rowObj as any).isCategoryRow || style.isCategoryRow || false;
        const bgColor = parseColor(style.backgroundColor) || (isCat ? 'FFFADFAD' : null);
        const textColor = parseColor(style.color) || 'FF000000';
        const isBold = isCat || style.fontWeight === 'bold';

        row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
          const isDateCol = colNumber > safeColumns.length;
          const colLabel = !isDateCol ? String(typeof safeColumns[colNumber - 1] === 'string' ? safeColumns[colNumber - 1] : (safeColumns[colNumber - 1]?.column || safeColumns[colNumber - 1]?.label || '')) : '';
          const lowerColName = colLabel.toLowerCase();
          const isLeftAlign = lowerColName.includes("description") || lowerColName.includes("activities") || lowerColName === "activity" || lowerColName === "activity id";

          cell.alignment = {
            vertical: 'middle',
            horizontal: isDateCol ? 'center' : (isCat ? 'center' : (isLeftAlign ? 'left' : 'center')),
            wrapText: true,
          };
          cell.border = {
            top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
            left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
            bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
            right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
          };

          if (isDateCol) {
            const dateKey = dump.dates[colNumber - safeColumns.length - 1];
            const hasValue = !!matched && dateKey in matched.values;
            if (hasValue) {
              cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCFCE7' } };
              cell.font = { color: { argb: 'FF166534' } };
            }
            return;
          }

          if (bgColor) {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } };
          }
          cell.font = { bold: isBold, color: { argb: textColor } };
        });
      });

      const buffer = await workbook.xlsx.writeBuffer();
      const safeTitle = (title || 'Sheet').replace(/[^a-z0-9]/gi, '_');
      const rangeTag = `${fromDate || 'all'}_to_${toDate || 'all'}`;
      saveAs(new Blob([buffer]), `${safeTitle}_Historic_${rangeTag}.xlsx`);
      toast.success(`Exported ${safeData.length} rows across ${dump.dates.length} historic dates`);
      onClose();
    } catch (error) {
      console.error("Historic export failed", error);
      toast.error("Historic export failed");
    } finally {
      setExporting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="w-5 h-5 text-primary" />
            Historic Export
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <p className="text-sm text-muted-foreground">
            Export this sheet's columns plus every daily progress value ever recorded - not just the rolling window shown on screen.
            Dates with a recorded value are highlighted green; blank cells mean no entry was ever made that day.
          </p>

          {loadingBounds ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
              <Loader2 className="w-4 h-4 animate-spin" /> Checking available date range...
            </div>
          ) : bounds.availableFrom ? (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">From</label>
                <Input
                  type="date"
                  value={fromDate}
                  min={bounds.availableFrom || undefined}
                  max={toDate || bounds.availableTo || undefined}
                  onChange={(e) => {
                    const val = e.target.value;
                    setFromDate(val);
                    // Keep the range valid instead of letting From land after the already-picked To.
                    if (val && toDate && val > toDate) setToDate(val);
                  }}
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">To</label>
                <Input
                  type="date"
                  value={toDate}
                  min={fromDate || bounds.availableFrom || undefined}
                  max={bounds.availableTo || undefined}
                  onChange={(e) => {
                    const val = e.target.value;
                    setToDate(val);
                    // Keep the range valid instead of letting To land before the already-picked From.
                    if (val && fromDate && val < fromDate) setFromDate(val);
                  }}
                />
              </div>
              <p className="col-span-2 text-[11px] text-muted-foreground">
                Data available from {indianDateFormat(bounds.availableFrom)} to {indianDateFormat(bounds.availableTo || bounds.availableFrom)}.
              </p>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-sm text-amber-600 py-4">
              <AlertCircle className="w-4 h-4 flex-shrink-0" /> No historic progress data recorded yet for this sheet.
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={exporting}>Cancel</Button>
          <Button onClick={handleExport} disabled={exporting || loadingBounds || !bounds.availableFrom} className="gap-2">
            {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            Export
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
