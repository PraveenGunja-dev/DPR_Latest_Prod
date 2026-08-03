import React, { useMemo, useCallback, memo } from 'react';
import { StyledExcelTable } from "@/components/StyledExcelTable";
import { indianDateFormat } from "@/services/dprService";

export interface PSSSummaryData {
  description: string;
  duration: string;
  startDate: string;
  endDate: string;
  uom: string;
  scope: string;
  completed: string;
  balance: string;
  actualForecastStart: string;
  actualForecastFinish: string;
  remarks: string;
  [key: string]: any;
}

interface PSSSummaryTableProps {
  data: PSSSummaryData[];
  setData: (data: PSSSummaryData[]) => void;
  onSave?: () => void;
  onSubmit?: () => void;
  isLocked?: boolean;
  status?: string;
  onExportAll?: () => void;
  projectId?: number;
  onPush?: () => void;
  /** Sheet this summary belongs to, e.g. "pss_summary" / "bess_summary". Drives columns + title. */
  sheetType?: string;
  /** Optional override; by default the title is derived from sheetType. */
  title?: string;
}

type SummaryColumn = {
  /** Column header / key used by StyledExcelTable */
  column: string;
  /** Row field this column reads and writes */
  field?: keyof PSSSummaryData;
  width: number;
  type: 'text' | 'number';
  editable?: boolean;
  /** Rendered through the date formatter */
  isDate?: boolean;
  /** Row number, not backed by a field */
  serial?: boolean;
  /** Always rendered empty (kept for the sheet layout only) */
  blank?: boolean;
  /** Part of the schedule/date block that BESS does not track on the summary */
  schedule?: boolean;
  /** Grouped header parent, e.g. "Actual" spanning Start + Finish */
  group?: string;
  /** Label shown under the group parent */
  groupLabel?: string;
  /** Which running total this column shows on the TOTAL row */
  total?: 'label' | 'scope' | 'completed' | 'balance';
  textColor?: string;
  fontWeight?: string;
  /** Extra keys to fall back to when the primary field is empty */
  fallbackFields?: string[];
};

// Single source of truth: every column list below is derived from this spec,
// so adding or hiding a column never needs positional indexes to be updated.
const SUMMARY_COLUMNS: SummaryColumn[] = [
  { column: "S.No", width: 50, type: 'text', serial: true, total: 'label' },
  {
    column: "Description", field: 'description', width: 250, type: 'text', editable: true,
    fallbackFields: ['activities', 'activity', 'activity_name', 'name', 'Name'],
  },
  { column: "Duration", field: 'duration', width: 80, type: 'text', editable: true, schedule: true },
  { column: "Start Date", field: 'startDate', width: 100, type: 'text', editable: true, isDate: true, schedule: true },
  { column: "End Date", field: 'endDate', width: 100, type: 'text', editable: true, isDate: true, schedule: true },
  { column: "UOM", field: 'uom', width: 60, type: 'text', editable: true },
  { column: "Scope", field: 'scope', width: 80, type: 'number', editable: true, total: 'scope' },
  { column: "Completed", field: 'completed', width: 90, type: 'number', editable: true, total: 'completed' },
  { column: "Balance", field: 'balance', width: 80, type: 'number', total: 'balance' },
  {
    column: "Actual Start", field: 'actualForecastStart', width: 100, type: 'text', editable: true,
    isDate: true, schedule: true, group: "Actual", groupLabel: "Start",
    textColor: "#00B050", fontWeight: "bold",
  },
  {
    column: "Actual Finish", field: 'actualForecastFinish', width: 100, type: 'text', editable: true,
    isDate: true, schedule: true, group: "Actual", groupLabel: "Finish",
    textColor: "#00B050", fontWeight: "bold",
  },
  {
    column: "Forecast Start", width: 100, type: 'text', blank: true, schedule: true,
    group: "Forecast", groupLabel: "Start", textColor: "#2563eb", fontWeight: "bold",
  },
  {
    column: "Forecast Finish", width: 100, type: 'text', blank: true, schedule: true,
    group: "Forecast", groupLabel: "Finish", textColor: "#2563eb", fontWeight: "bold",
  },
  { column: "Remarks", field: 'remarks', width: 180, type: 'text', editable: true },
];

/** Summary sheets rendered by this component - the single place that decides routing. */
export const PSS_STYLE_SUMMARY_SHEETS = ['pss_summary', 'bess_summary'];

export const isPSSStyleSummary = (sheetType?: string) =>
  PSS_STYLE_SUMMARY_SHEETS.includes(String(sheetType || ''));

/** Only the summary sheets that actually track a schedule show the date columns. */
const SHEETS_WITHOUT_SCHEDULE = ['bess_summary'];

/** "bess_summary" -> "BESS Project - Summary" */
const titleFromSheetType = (sheetType: string) => {
  const prefix = sheetType.replace(/_summary$/, '').replace(/_/g, ' ').trim();
  return `${prefix.toUpperCase() || 'Project'} Project - Summary`;
};

export const PSSSummaryTable = memo(({
  data,
  setData,
  onSave,
  onSubmit,
  isLocked = false,
  status = 'draft',
  onExportAll,
  projectId,
  onPush,
  sheetType = 'pss_summary',
  title,
}: PSSSummaryTableProps) => {
  const showSchedule = !SHEETS_WITHOUT_SCHEDULE.includes(sheetType);

  const activeColumns = useMemo(
    () => SUMMARY_COLUMNS.filter((c) => showSchedule || !c.schedule),
    [showSchedule]
  );

  const columns = useMemo(() => activeColumns.map((c) => c.column), [activeColumns]);

  const columnWidths = useMemo(
    () => Object.fromEntries(activeColumns.map((c) => [c.column, c.width])),
    [activeColumns]
  );

  const columnTypes = useMemo(
    () => Object.fromEntries(activeColumns.map((c) => [c.column, c.type])) as Record<string, 'text' | 'number'>,
    [activeColumns]
  );

  const columnTextColors = useMemo(
    () => Object.fromEntries(activeColumns.filter((c) => c.textColor).map((c) => [c.column, c.textColor!])),
    [activeColumns]
  );

  const columnFontWeights = useMemo(
    () => Object.fromEntries(activeColumns.filter((c) => c.fontWeight).map((c) => [c.column, c.fontWeight!])),
    [activeColumns]
  );

  const editableColumns = useMemo(
    () => activeColumns.filter((c) => c.editable).map((c) => c.column),
    [activeColumns]
  );

  // Two-row header only while grouped columns (Actual / Forecast) are visible;
  // otherwise fall back to StyledExcelTable's plain single-row header.
  const headerStructure = useMemo(() => {
    if (!activeColumns.some((c) => c.group)) return [];

    const parents: any[] = [];
    const children: any[] = [];
    activeColumns.forEach((c) => {
      if (!c.group) {
        parents.push({ label: c.column, column: c.column, rowSpan: 2, colSpan: 1 });
        return;
      }
      const existing = parents.find((p) => p.label === c.group && !p.column);
      if (existing) existing.colSpan += 1;
      else parents.push({ label: c.group, colSpan: 1, rowSpan: 1 });
      children.push({ label: c.groupLabel || c.column, column: c.column, colSpan: 1, rowSpan: 1 });
    });

    return [parents, children];
  }, [activeColumns]);

  const { tableData, rowStyles } = useMemo(() => {
    const safeData = Array.isArray(data) ? data : [];
    const formatDt = (dt: any) => {
      if (!dt) return '';
      const dtStr = String(dt).split('T')[0];
      return indianDateFormat(dtStr) || dtStr;
    };

    let totalScope = 0;
    let totalCompleted = 0;

    const rows = safeData.map((row, index) => {
      const s = Number(row.scope) || 0;
      const c = Number(row.completed) || 0;
      totalScope += s;
      totalCompleted += c;

      return activeColumns.map((col) => {
        if (col.serial) return String(index + 1);
        if (col.blank || !col.field) return '';
        const raw = col.fallbackFields?.reduce(
          (acc, key) => acc || (row as any)[key],
          row[col.field]
        ) ?? row[col.field];
        return col.isDate ? formatDt(raw) : (raw || '');
      });
    });

    const styles: Record<number, any> = {};
    if (rows.length > 0) {
      const totals = {
        label: "TOTAL",
        scope: String(totalScope || ''),
        completed: String(totalCompleted || ''),
        balance: String(Math.max(0, totalScope - totalCompleted) || ''),
      };
      rows.push(activeColumns.map((col) => (col.total ? totals[col.total] : '')));
      styles[rows.length - 1] = {
        backgroundColor: "#f1f5f9",
        color: "#0f172a",
        fontWeight: "bold",
        isTotalRow: true,
      };
    }

    return { tableData: rows, rowStyles: styles };
  }, [data, activeColumns]);

  const handleDataChange = useCallback((newData: any[][]) => {
    const safeData = Array.isArray(data) ? data : [];
    const actualRows = newData.slice(0, safeData.length);
    let hasChanges = false;

    const updated = actualRows.map((row, index) => {
      const original = safeData[index];

      // Columns the current sheet does not render keep whatever the row already had.
      const edits: Record<string, any> = {};
      activeColumns.forEach((col, i) => {
        if (col.editable && col.field) edits[col.field] = row[i] || '';
      });

      const scope = Number(edits.scope ?? original.scope) || 0;
      const completed = Number(edits.completed ?? original.completed) || 0;

      const changed = Object.keys(edits).some((field) =>
        field === 'scope' || field === 'completed'
          ? Number(original[field]) !== Number(edits[field] || 0)
          : original[field] !== edits[field]
      ) || original._cellStatuses !== (row as any)._cellStatuses;

      if (!changed) return original;

      hasChanges = true;
      return {
        ...original,
        ...edits,
        _cellStatuses: (row as any)._cellStatuses,
        scope: String(scope),
        completed: String(completed),
        balance: String(Math.max(0, scope - completed)),
      };
    });

    if (hasChanges) {
      setData(updated);
    }
  }, [data, setData, activeColumns]);

  return (
    <div className="space-y-4 w-full flex-1 min-h-0 flex flex-col">
      <StyledExcelTable
        title={title || titleFromSheetType(sheetType)}
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
        columnTextColors={columnTextColors}
        columnFontWeights={columnFontWeights}
        projectId={projectId}
        sheetType={sheetType}
      />
    </div>
  );
});
