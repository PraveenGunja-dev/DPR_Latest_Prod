import React, { useMemo, useCallback, memo } from 'react';
import { StyledExcelTable } from "@/components/StyledExcelTable";
import { indianDateFormat } from "@/services/dprService";
import { Plus } from "lucide-react";
import { useAuth } from '@/modules/auth/contexts/AuthContext';

export interface PSSManpowerData {
  sNo?: string;
  description: string;
  areas: string;
  department: string;
  completedCumulative: string;
  today: string;
  [key: string]: any;
}

interface PSSManpowerTableProps {
  data: PSSManpowerData[];
  setData: (data: PSSManpowerData[]) => void;
  onSave?: () => void;
  onSubmit?: () => void;
  yesterday?: string;
  today?: string;
  todayDate?: string;
  isLocked?: boolean;
  status?: string;
  onExportAll?: () => void;
  projectId?: number;
  onPush?: () => void;
  // When `yesterday` is provided, show the past-7-days columns (5 history + yesterday + today),
  // matching the DP Qty sheet. Values for the historical days come from `dailyHistory`.
  dailyHistory?: Record<string, Record<string, number>>;

  customActivities?: any[];
  onAddCustomActivity?: (activity: any, silent?: boolean) => void;
  onEditCustomActivity?: (activity: any) => void;
  onDeleteCustomActivity?: (id: number) => void;
}

const HISTORY_COLS = 5;

export const PSSManpowerTable = memo(({
  data,
  setData,
  onSave,
  onSubmit,
  todayDate,
  yesterday,
  dailyHistory = {},
  isLocked = false,
  status = 'draft',
  onExportAll,
  projectId,
  onPush,
  customActivities = [],
  onAddCustomActivity,
  onEditCustomActivity,
  onDeleteCustomActivity
}: PSSManpowerTableProps) => {
  const { user } = useAuth();
  const userRole = (user?.role || user?.Role || '').toLowerCase();
  const isPmagOrAdmin = userRole.includes('pmag') || userRole.includes('admin');

  const todayLabel = useMemo(() => todayDate ? indianDateFormat(todayDate) : 'Today', [todayDate]);
  // Show the 7-day history layout only when a `yesterday` reference is supplied (BESS). PSS keeps
  // the original single-today column since it doesn't pass `yesterday`.
  const showHistory = !!yesterday;
  const yesterdayLabel = useMemo(() => yesterday ? (indianDateFormat(yesterday) || yesterday) : '', [yesterday]);

  // The 5 days that precede `yesterday` (so history + yesterday + today = 7 consecutive days).
  const historyDates = useMemo(() => {
    if (!yesterday) return [] as { iso: string; label: string }[];
    const out: { iso: string; label: string }[] = [];
    const yDate = new Date(yesterday);
    for (let i = HISTORY_COLS; i >= 1; i--) {
      const d = new Date(yDate);
      d.setDate(d.getDate() - i);
      const iso = d.toISOString().split('T')[0];
      out.push({ iso, label: indianDateFormat(iso) || iso });
    }
    return out;
  }, [yesterday]);

  const columns = useMemo(() => [
    "Sr.No",
    "Description",
    "Areas",
    "Department",
    "Completed (Cumulative)",
    ...(showHistory ? [...historyDates.map(d => d.label), yesterdayLabel] : []),
    todayLabel,
  ], [todayLabel, showHistory, historyDates, yesterdayLabel]);

  const columnWidths = useMemo(() => {
    const widths: Record<string, number> = {
      "Sr.No": 55,
      "Description": 250,
      "Areas": 180,
      "Department": 160,
      "Completed (Cumulative)": 150,
      [todayLabel]: 100,
    };
    if (showHistory) {
      historyDates.forEach(d => { widths[d.label] = 85; });
      widths[yesterdayLabel] = 85;
    }
    return widths;
  }, [todayLabel, showHistory, historyDates, yesterdayLabel]);

  const columnTypes = useMemo(() => {
    const types: Record<string, "text" | "number"> = {
      "Sr.No": "text",
      "Description": "text",
      "Areas": "text",
      "Department": "text",
      "Completed (Cumulative)": "number",
      [todayLabel]: "number",
    };
    if (showHistory) {
      historyDates.forEach(d => { types[d.label] = "number"; });
      types[yesterdayLabel] = "number";
    }
    return types;
  }, [todayLabel, showHistory, historyDates, yesterdayLabel]);

  // All day columns (the 5 history days, yesterday and today) are editable and numeric-only.
  const editableColumns = useMemo(() => [
    "Description", "Areas", "Department", "Completed (Cumulative)",
    ...(showHistory ? [...historyDates.map(d => d.label), yesterdayLabel] : []),
    todayLabel,
  ], [todayLabel, showHistory, historyDates, yesterdayLabel]);

  const headerStructure = useMemo(() => [
    [
      { label: "Sr.No", colSpan: 1 },
      { label: "Description", colSpan: 1 },
      { label: "Areas", colSpan: 1 },
      { label: "Department", colSpan: 1 },
      { label: "Completed (Cumulative)", colSpan: 1 },
      ...(showHistory ? [...historyDates.map(d => ({ label: d.label, colSpan: 1 })), { label: yesterdayLabel, colSpan: 1 }] : []),
      { label: todayLabel, colSpan: 1 },
    ]
  ], [todayLabel, showHistory, historyDates, yesterdayLabel]);

  const yesterdayIso = useMemo(() => yesterday ? new Date(yesterday).toISOString().split('T')[0] : '', [yesterday]);

  const { tableData, rowStyles } = useMemo(() => {
    const safeData = Array.isArray(data) ? data : [];
    const safeCustom = Array.isArray(customActivities) ? customActivities : [];

    let totalCumulative = 0;
    let totalToday = 0;
    let sNo = 1;

    const rows: any[][] = [];
    const styles: Record<number, any> = {};
    const historyTotals: number[] = Array(historyDates.length).fill(0);
    let totalYesterday = 0;

    // Build the [ ...history(5), yesterday ] cells for a row, pulling from the row's own history
    // values first, then the shared dailyHistory map (keyed by activityId or description).
    const fmtVal = (v: any) => (v === undefined || v === null || v === '' || Number(v) === 0) ? "" : String(v);
    const buildMiddle = (key: string, rowHistory: Record<string, any> | undefined): string[] => {
      if (!showHistory) return [];
      const hm = dailyHistory[key] || {};
      const cells = historyDates.map((hd, i) => {
        const raw = rowHistory && rowHistory[hd.iso] !== undefined ? rowHistory[hd.iso] : hm[hd.iso];
        historyTotals[i] += Number(raw) || 0;
        return fmtVal(raw);
      });
      const yraw = rowHistory && rowHistory[yesterdayIso] !== undefined ? rowHistory[yesterdayIso] : hm[yesterdayIso];
      totalYesterday += Number(yraw) || 0;
      cells.push(fmtVal(yraw));
      return cells;
    };

    safeData.forEach((row) => {
      totalCumulative += Number(row.completedCumulative) || 0;
      totalToday += Number(row.today) || 0;

      const key = String(row.activityId || row.description || '');
      const arr: any = [
        String(sNo++),
        row.description || '',
        row.areas || '',
        row.department || '',
        row.completedCumulative || '',
        ...buildMiddle(key, row.historyValues),
        row.today || '',
      ];
      if (row._cellStatuses) arr._cellStatuses = row._cellStatuses;
      rows.push(arr);
    });

    // Number of blank placeholder cells for the history+yesterday span (for category/total rows).
    const midBlanks = showHistory ? Array(historyDates.length + 1).fill("") : [];

    if (safeCustom.length > 0) {
      const customCatRow: any = ["", "📝 DPR Level Activities", "", "", "", ...midBlanks, ""];
      customCatRow.isCategoryRow = true;
      rows.push(customCatRow);
      styles[rows.length - 1] = {
        backgroundColor: "#FADFAD",
        color: "#333333",
        fontWeight: "bold",
        isCategoryRow: true,
      };

      safeCustom.forEach((c) => {
        const cumulative = Number(c.cumulative) || 0;
        const todayVal = Number(c.extraData?.todayValue) || 0;

        totalCumulative += cumulative;
        totalToday += todayVal;

        const key = String(c.activityId || c.description || '');
        const customArr: any = [
          String(sNo++),
          c.description || '',
          c.extraData?.areas || '',
          c.extraData?.department || '',
          String(cumulative),
          ...buildMiddle(key, c.extraData?.historyValues),
          String(todayVal),
        ];
        customArr._isCustomRow = true;
        customArr._customId = c.id;

        rows.push(customArr);
        styles[rows.length - 1] = { backgroundColor: "#FFFBEB" };
      });
    }

    if (rows.length > 0) {
      const totalRow: any = [
        "TOTAL", "", "", "",
        String(totalCumulative || ''),
        ...(showHistory ? [...historyTotals.map(t => t ? String(t) : ''), totalYesterday ? String(totalYesterday) : ''] : []),
        String(totalToday || ''),
      ];
      totalRow.isTotalRow = true;
      rows.push(totalRow);
      styles[rows.length - 1] = {
        backgroundColor: "#f1f5f9",
        color: "#0f172a",
        fontWeight: "bold",
        isTotalRow: true,
      };
    }

    return { tableData: rows, rowStyles: styles };
  }, [data, customActivities, showHistory, historyDates, dailyHistory, yesterdayIso]);

  const handleInlineAdd = useCallback(() => {
    if (onAddCustomActivity) {
      onAddCustomActivity({
        sheetType: 'pss_manpower',
        description: 'New DPR Activity',
        uom: 'Nos',
        scope: 0,
      });
    }
  }, [onAddCustomActivity]);

  // Today is the last column; its index shifts when the history columns are shown.
  const TODAY_IDX = showHistory ? 5 + historyDates.length + 1 : 5;

  // Read the edited history + yesterday cells (indices 5..) back into a { iso: value } map so the
  // user's edits to past days persist.
  const readHistoryValues = useCallback((row: any[], prev?: Record<string, any>): Record<string, any> | undefined => {
    if (!showHistory) return prev;
    const hv: Record<string, any> = { ...(prev || {}) };
    historyDates.forEach((hd, i) => {
      const v = row[5 + i];
      hv[hd.iso] = (v === undefined || v === null) ? '' : String(v);
    });
    const yv = row[5 + historyDates.length];
    if (yesterdayIso) hv[yesterdayIso] = (yv === undefined || yv === null) ? '' : String(yv);
    return hv;
  }, [showHistory, historyDates, yesterdayIso]);

  const handleDataChange = useCallback((newData: any[][]) => {
    const safeData = Array.isArray(data) ? data : [];
    const p6RowChanges: any[] = [];
    const customRowChanges: any[] = [];

    // Extract non-total, non-category rows and map them
    // newData contains all rows including categories, custom, and totals.
    let p6Index = 0;

    newData.forEach((row, index) => {
      if ((row as any).isTotalRow || (row as any).isCategoryRow) return;

      if ((row as any)._isCustomRow) {
        customRowChanges.push(row);
      } else {
        const original = safeData[p6Index];
        if (original) {
          if (
            original.description !== row[1] ||
            original.areas !== row[2] ||
            original.department !== row[3] ||
            original.completedCumulative !== row[4] ||
            original.today !== row[TODAY_IDX] ||
            original._cellStatuses !== (row as any)._cellStatuses
          ) {
            p6RowChanges.push({
              index: p6Index,
              data: {
                ...original,
                _cellStatuses: (row as any)._cellStatuses,
                description: row[1] || '',
                areas: row[2] || '',
                department: row[3] || '',
                completedCumulative: row[4] || '',
                today: row[TODAY_IDX] || '',
                historyValues: readHistoryValues(row, original.historyValues),
              }
            });
          }
        }
        p6Index++;
      }
    });

    if (p6RowChanges.length > 0) {
      const updated = [...safeData];
      p6RowChanges.forEach(change => {
        updated[change.index] = change.data;
      });
      setData(updated);
    }

    if (onEditCustomActivity && customRowChanges.length > 0) {
      customRowChanges.forEach(row => {
        const customId = (row as any)._customId;
        if (!customId) return;
        const c = customActivities.find(x => x.id === customId);
        if (!c) return;

        const newDesc = row[1] || '';
        const newAreas = row[2] || '';
        const newDept = row[3] || '';
        const newCum = row[4] || '0';
        const newToday = row[TODAY_IDX] || '0';
        const newHistory = readHistoryValues(row, c.extraData?.historyValues);

        const hasCustomChanges =
          newDesc !== (c.description || '') ||
          newAreas !== (c.extraData?.areas || '') ||
          newDept !== (c.extraData?.department || '') ||
          newCum !== String(c.cumulative || 0) ||
          newToday !== String(c.extraData?.todayValue || 0) ||
          JSON.stringify(newHistory || {}) !== JSON.stringify(c.extraData?.historyValues || {});

        if (hasCustomChanges) {
          onEditCustomActivity({
            id: customId,
            sheetType: 'pss_manpower',
            description: newDesc,
            cumulative: Number(newCum) || 0,
            extraData: {
              ...c.extraData,
              areas: newAreas,
              department: newDept,
              todayValue: newToday,
              historyValues: newHistory,
            }
          });
        }
      });
    }

  }, [data, setData, customActivities, onEditCustomActivity, TODAY_IDX, readHistoryValues]);

  const handleRowDelete = useCallback((index: number) => {
    const row = tableData[index];
    if (row && (row as any)._isCustomRow && onDeleteCustomActivity) {
      const customId = (row as any)._customId;
      if (customId) onDeleteCustomActivity(customId);
    }
  }, [tableData, onDeleteCustomActivity]);

  return (
    <div className="space-y-4 w-full flex-1 min-h-0 flex flex-col">
      {!isLocked && onAddCustomActivity && (
        <div className="flex justify-end px-2">
          <button
            onClick={handleInlineAdd}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" />
            Add DPR Activity
          </button>
        </div>
      )}

      <StyledExcelTable
        title="PSS Project - Manpower"
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
        sheetType="pss_manpower"
        onRowDelete={isPmagOrAdmin && !isLocked && onDeleteCustomActivity ? handleRowDelete : undefined}
        rowIsEditable={(idx) => {
          const row = tableData[idx] as any;
          return row && !row.isCategoryRow && !row.isTotalRow;
        }}
        rowIsDeletable={(idx) => !!(tableData[idx] as any)?._isCustomRow && isPmagOrAdmin}
      />
    </div>
  );
});
