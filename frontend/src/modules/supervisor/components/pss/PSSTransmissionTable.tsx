import React, { useState, useMemo, useCallback, memo } from 'react';
import { StyledExcelTable } from "@/components/StyledExcelTable";
import { indianDateFormat } from "@/services/dprService";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { createCustomActivity, deleteCustomActivity } from "@/services/customActivityService";

type SubSheet = 'stringing' | 'erection' | 'foundation';

interface PSSTransmissionTableProps {
  projectId?: number;
  stringingData: any[];
  setStringingData: (data: any[]) => void;
  erectionData: any[];
  setErectionData: (data: any[]) => void;
  foundationData: any[];
  setFoundationData: (data: any[]) => void;
  onSave?: () => void;
  onSubmit?: () => void;
  isLocked?: boolean;
  status?: string;
  onPush?: () => void;
  activeSubSheet?: SubSheet;
  onSubSheetChange?: (sheet: SubSheet) => void;
}

// ── Stringing Columns ──────────────────────────────────
const STRINGING_COLUMNS = [
  "S.No", "Section (From-To)", "Vendor Name", "Section Length", "Completed",
  "Section Readiness",
  "A/F Start", "A/F Finish",
  "Ins. Hoisting Start", "Ins. Hoisting Finish",
  "Paying Out Start", "Paying Out Finish",
  "Rough Sag Start", "Rough Sag Finish",
  "Final Sag Start", "Final Sag Finish",
];

const STRINGING_WIDTHS: Record<string, number> = {
  "S.No": 50, "Section (From-To)": 180, "Vendor Name": 140, "Section Length": 110,
  "Completed": 100, "Section Readiness": 120,
  "A/F Start": 100, "A/F Finish": 100,
  "Ins. Hoisting Start": 110, "Ins. Hoisting Finish": 110,
  "Paying Out Start": 110, "Paying Out Finish": 110,
  "Rough Sag Start": 110, "Rough Sag Finish": 110,
  "Final Sag Start": 110, "Final Sag Finish": 110,
};

const STRINGING_HEADER = [
  [
    { label: "S.No", rowSpan: 2, colSpan: 1 },
    { label: "Section (From-To)", rowSpan: 2, colSpan: 1 },
    { label: "Vendor Name", rowSpan: 2, colSpan: 1 },
    { label: "Section Length", rowSpan: 2, colSpan: 1 },
    { label: "Completed", rowSpan: 2, colSpan: 1 },
    { label: "Section Readiness", rowSpan: 2, colSpan: 1 },
    { label: "Actual/Forecast", colSpan: 2, rowSpan: 1 },
    { label: "Insulator Hoisting", colSpan: 2, rowSpan: 1 },
    { label: "Paying Out", colSpan: 2, rowSpan: 1 },
    { label: "Rough Sag", colSpan: 2, rowSpan: 1 },
    { label: "Final Sag", colSpan: 2, rowSpan: 1 },
  ],
  [
    { label: "A/F Start", colSpan: 1, rowSpan: 1 },
    { label: "A/F Finish", colSpan: 1, rowSpan: 1 },
    { label: "Ins. Hoisting Start", colSpan: 1, rowSpan: 1 },
    { label: "Ins. Hoisting Finish", colSpan: 1, rowSpan: 1 },
    { label: "Paying Out Start", colSpan: 1, rowSpan: 1 },
    { label: "Paying Out Finish", colSpan: 1, rowSpan: 1 },
    { label: "Rough Sag Start", colSpan: 1, rowSpan: 1 },
    { label: "Rough Sag Finish", colSpan: 1, rowSpan: 1 },
    { label: "Final Sag Start", colSpan: 1, rowSpan: 1 },
    { label: "Final Sag Finish", colSpan: 1, rowSpan: 1 },
  ],
];

// ── Erection Columns ───────────────────────────────────
const ERECTION_COLUMNS = [
  "S.No", "Month S.No", "AP-No", "Location No.", "Type of Tower",
  "A/F Start", "A/F Finish", "Vendor Name",
];

const ERECTION_WIDTHS: Record<string, number> = {
  "S.No": 50, "Month S.No": 90, "AP-No": 90, "Location No.": 110,
  "Type of Tower": 130, "A/F Start": 110, "A/F Finish": 110, "Vendor Name": 160,
};

const ERECTION_HEADER = [
  [
    { label: "S.No", rowSpan: 2, colSpan: 1 },
    { label: "Month S.No", rowSpan: 2, colSpan: 1 },
    { label: "AP-No", rowSpan: 2, colSpan: 1 },
    { label: "Location No.", rowSpan: 2, colSpan: 1 },
    { label: "Type of Tower", rowSpan: 2, colSpan: 1 },
    { label: "Actual/Forecast", colSpan: 2, rowSpan: 1 },
    { label: "Vendor Name", rowSpan: 2, colSpan: 1 },
  ],
  [
    { label: "A/F Start", colSpan: 1, rowSpan: 1 },
    { label: "A/F Finish", colSpan: 1, rowSpan: 1 },
  ],
];

// ── Add Row Modal Fields ───────────────────────────────
const STRINGING_FIELDS = [
  { key: 'section', label: 'Section (From-To)', type: 'text' },
  { key: 'vendorName', label: 'Vendor Name', type: 'text' },
  { key: 'sectionLength', label: 'Section Length', type: 'number' },
  { key: 'completed', label: 'Completed', type: 'number' },
  { key: 'sectionReadiness', label: 'Section Readiness', type: 'text' },
  { key: 'afStart', label: 'Actual/Forecast Start', type: 'date' },
  { key: 'afFinish', label: 'Actual/Forecast Finish', type: 'date' },
  { key: 'insHoistStart', label: 'Insulator Hoisting Start', type: 'date' },
  { key: 'insHoistFinish', label: 'Insulator Hoisting Finish', type: 'date' },
  { key: 'payOutStart', label: 'Paying Out Start', type: 'date' },
  { key: 'payOutFinish', label: 'Paying Out Finish', type: 'date' },
  { key: 'roughSagStart', label: 'Rough Sag Start', type: 'date' },
  { key: 'roughSagFinish', label: 'Rough Sag Finish', type: 'date' },
  { key: 'finalSagStart', label: 'Final Sag Start', type: 'date' },
  { key: 'finalSagFinish', label: 'Final Sag Finish', type: 'date' },
];

const ERECTION_FIELDS = [
  { key: 'monthSNo', label: 'Month S.No', type: 'text' },
  { key: 'apNo', label: 'AP-No', type: 'text' },
  { key: 'locationNo', label: 'Location No.', type: 'text' },
  { key: 'towerType', label: 'Type of Tower', type: 'text' },
  { key: 'afStart', label: 'Actual/Forecast Start', type: 'date' },
  { key: 'afFinish', label: 'Actual/Forecast Finish', type: 'date' },
  { key: 'vendorName', label: 'Vendor Name', type: 'text' },
];

export const PSSTransmissionTable = memo(({
  projectId,
  stringingData, setStringingData,
  erectionData, setErectionData,
  foundationData, setFoundationData,
  onSave, onSubmit, isLocked = false, status = 'draft',
  onPush, activeSubSheet = 'stringing', onSubSheetChange,
}: PSSTransmissionTableProps) => {
  const [subSheet, setSubSheet] = useState<SubSheet>(activeSubSheet);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newRowData, setNewRowData] = useState<Record<string, string>>({});

  const handleSubSheetChange = useCallback((val: string) => {
    const sheet = val as SubSheet;
    setSubSheet(sheet);
    onSubSheetChange?.(sheet);
  }, [onSubSheetChange]);

  const formatDt = (dt: any) => {
    if (!dt) return '';
    const dtStr = String(dt).split('T')[0];
    return indianDateFormat(dtStr) || dtStr;
  };

  // ── Stringing Table Data ───────────────────────────────
  const stringingTableData = useMemo(() => {
    return (stringingData || []).map((row: any, i: number) => [
      String(i + 1),
      row.section || '',
      row.vendorName || '',
      row.sectionLength || '',
      row.completed || '',
      row.sectionReadiness || '',
      formatDt(row.afStart),
      formatDt(row.afFinish),
      formatDt(row.insHoistStart),
      formatDt(row.insHoistFinish),
      formatDt(row.payOutStart),
      formatDt(row.payOutFinish),
      formatDt(row.roughSagStart),
      formatDt(row.roughSagFinish),
      formatDt(row.finalSagStart),
      formatDt(row.finalSagFinish),
    ]);
  }, [stringingData]);

  // ── Erection Table Data ────────────────────────────────
  const erectionTableData = useMemo(() => {
    return (erectionData || []).map((row: any, i: number) => [
      String(i + 1),
      row.monthSNo || '',
      row.apNo || '',
      row.locationNo || '',
      row.towerType || '',
      formatDt(row.afStart),
      formatDt(row.afFinish),
      row.vendorName || '',
    ]);
  }, [erectionData]);

  // ── Stringing handleDataChange ─────────────────────────
  const handleStringingChange = useCallback((newData: any[][]) => {
    const safe = stringingData || [];
    const updated = newData.slice(0, safe.length).map((row, idx) => ({
      ...safe[idx],
      _cellStatuses: (row as any)._cellStatuses,
      section: row[1], vendorName: row[2], sectionLength: row[3],
      completed: row[4], sectionReadiness: row[5],
      afStart: row[6], afFinish: row[7],
      insHoistStart: row[8], insHoistFinish: row[9],
      payOutStart: row[10], payOutFinish: row[11],
      roughSagStart: row[12], roughSagFinish: row[13],
      finalSagStart: row[14], finalSagFinish: row[15],
    }));
    setStringingData(updated);
  }, [stringingData, setStringingData]);

  // ── Erection handleDataChange ──────────────────────────
  const handleErectionChange = useCallback((newData: any[][]) => {
    const safe = erectionData || [];
    const updated = newData.slice(0, safe.length).map((row, idx) => ({
      ...safe[idx],
      _cellStatuses: (row as any)._cellStatuses,
      monthSNo: row[1], apNo: row[2], locationNo: row[3],
      towerType: row[4], afStart: row[5], afFinish: row[6], vendorName: row[7],
    }));
    setErectionData(updated);
  }, [erectionData, setErectionData]);

  const handleAddRow = () => {
    const fields = subSheet === 'stringing' ? STRINGING_FIELDS : ERECTION_FIELDS;
    const empty: Record<string, string> = {};
    fields.forEach(f => { empty[f.key] = ''; });
    setNewRowData(empty);
    setIsAddModalOpen(true);
  };

  const handleConfirmAdd = async () => {
    if (!projectId) return;
    try {
      const sheetType = subSheet === 'stringing' ? 'pss_tl_stringing' : 'pss_tl_erection';
      
      const payload = {
        projectId,
        sheetType,
        description: newRowData.section || newRowData.locationNo || 'New Activity',
        extraData: { ...newRowData }
      };

      const savedRow = await createCustomActivity(payload);
      
      // Append the saved row (with its DB id) to the local state
      if (subSheet === 'stringing') {
        setStringingData([...(stringingData || []), savedRow]);
      } else if (subSheet === 'erection') {
        setErectionData([...(erectionData || []), savedRow]);
      }
      toast.success("Row added successfully!");
      setIsAddModalOpen(false);
    } catch (error) {
      console.error(error);
      toast.error("Failed to add row");
    }
  };

  const handleDeleteRow = async (idx: number) => {
    if (!projectId) return;
    try {
      const data = subSheet === 'stringing' ? stringingData : erectionData;
      const row = data[idx];
      if (row?.id) {
        await deleteCustomActivity(row.id);
      }
      if (subSheet === 'stringing') {
        setStringingData(stringingData.filter((_: any, i: number) => i !== idx));
      } else if (subSheet === 'erection') {
        setErectionData(erectionData.filter((_: any, i: number) => i !== idx));
      }
      toast.success("Row deleted!");
    } catch (error) {
      console.error(error);
      toast.error("Failed to delete row");
    }
  };

  const currentFields = subSheet === 'stringing' ? STRINGING_FIELDS : ERECTION_FIELDS;

  return (
    <div className="space-y-4 w-full flex-1 min-h-0 flex flex-col">
      {/* Sub-sheet selector + Add Row */}
      <div className="flex items-center gap-4 flex-shrink-0">
        <Select value={subSheet} onValueChange={handleSubSheetChange}>
          <SelectTrigger className="w-[200px] h-9 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="stringing">Stringing</SelectItem>
            <SelectItem value="erection">Erection</SelectItem>
            <SelectItem value="foundation">Foundation</SelectItem>
          </SelectContent>
        </Select>

        {subSheet !== 'foundation' && !isLocked && (
          <Button variant="outline" size="sm" onClick={handleAddRow} className="h-9">
            <Plus className="w-4 h-4 mr-1" /> Add Row
          </Button>
        )}
      </div>

      {/* Render the active sub-sheet */}
      {subSheet === 'stringing' && (
        <StyledExcelTable
          title="400KV Transmission - Stringing"
          columns={STRINGING_COLUMNS}
          data={stringingTableData}
          onDataChange={handleStringingChange}
          onSave={onSave || (() => {})}
          onSubmit={onSubmit}
          onPush={onPush}
          isReadOnly={isLocked}
          editableColumns={STRINGING_COLUMNS.filter(c => c !== "S.No")}
          columnTypes={Object.fromEntries(STRINGING_COLUMNS.map(c => [c, "text" as const]))}
          columnWidths={STRINGING_WIDTHS}
          headerStructure={STRINGING_HEADER}
          status={status}
          disableAutoHeaderColors={true}
          projectId={projectId}
          sheetType="pss_tl_stringing"
        />
      )}

      {subSheet === 'erection' && (
        <StyledExcelTable
          title="400KV Transmission - Erection"
          columns={ERECTION_COLUMNS}
          data={erectionTableData}
          onDataChange={handleErectionChange}
          onSave={onSave || (() => {})}
          onSubmit={onSubmit}
          onPush={onPush}
          isReadOnly={isLocked}
          editableColumns={ERECTION_COLUMNS.filter(c => c !== "S.No")}
          columnTypes={Object.fromEntries(ERECTION_COLUMNS.map(c => [c, "text" as const]))}
          columnWidths={ERECTION_WIDTHS}
          headerStructure={ERECTION_HEADER}
          status={status}
          disableAutoHeaderColors={true}
          projectId={projectId}
          sheetType="pss_tl_erection"
        />
      )}

      {subSheet === 'foundation' && (
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          <div className="text-center">
            <h3 className="text-lg font-semibold mb-2">Foundation</h3>
            <p className="text-sm">Coming soon — this section is under development.</p>
          </div>
        </div>
      )}

      {/* Add Row Modal */}
      <Dialog open={isAddModalOpen} onOpenChange={setIsAddModalOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add {subSheet === 'stringing' ? 'Stringing' : 'Erection'} Row</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            {currentFields.map(field => (
              <div key={field.key} className="grid grid-cols-5 items-center gap-2">
                <Label className="col-span-2 text-xs font-medium">{field.label}</Label>
                <Input
                  className="col-span-3 h-8 text-sm"
                  type={field.type}
                  value={newRowData[field.key] || ''}
                  onChange={e => setNewRowData(prev => ({ ...prev, [field.key]: e.target.value }))}
                />
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddModalOpen(false)}>Cancel</Button>
            <Button onClick={handleConfirmAdd}>Add</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
});
