import React, { useMemo, useCallback, useState } from 'react';
import { StyledExcelTable } from "@/components/StyledExcelTable";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus } from 'lucide-react';
import { useAuth } from '@/modules/auth/contexts/AuthContext';

export interface Wind33KVData {
  sNo?: string;
  activityId?: string;
  description: string;
  feeder: string;
  agencyName: string;
  scope: string;
  todayValue: string;
  cumulative: string;
  balance: string;
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
}) => {
  const [subSheet, setSubSheet] = useState<'OH' | 'UG'>('OH');

  const { user } = useAuth();
  const userRole = (user?.role || user?.Role || '').toLowerCase();
  const isPmagOrAdmin = userRole.includes('pmag') || userRole.includes('admin');

  // Filter activities based on OH/UG sub-sheet
  const filteredData = useMemo(() => {
    const safeData = Array.isArray(data) ? data : [];
    const safeCustom = Array.isArray(customActivities) ? customActivities : [];
    const allData = [...safeData, ...safeCustom];
    
    return allData.filter(d => {
      const wbs = (d.wbsName || '').toUpperCase();
      const desc = (d.description || '').toUpperCase();
      const id = (d.activityId || '').toUpperCase();
      
      // Keep custom activities if they match the current sub-sheet implicitly or explicitly
      if (d.isCustom) {
        if (subSheet === 'OH') {
          return !desc.includes('UNDERGROUND') && !desc.includes(' U/G') && !desc.includes(' UG ');
        } else {
          return desc.includes('UNDERGROUND') || desc.includes(' U/G') || desc.includes(' UG ');
        }
      }
      
      if (subSheet === 'OH') {
        return wbs === '33KV LINE ELETRICAL WORKS' || (!desc.includes('UNDERGROUND') && !id.includes('-UG'));
      } else {
        return desc.includes('UNDERGROUND') || desc.includes(' U/G') || desc.includes(' UG ') || id.includes('-UG');
      }
    });
  }, [data, customActivities, subSheet]);

  const columns = useMemo(() => [
    "S.No",
    "Name of Activity",
    "Vendor",
    "Feeder Name",
    "Type of line",
    "Line in KM",
    "Total Pole",
    "Scope",
    "Cum",
    "Balance"
  ], []);

  const columnWidths = useMemo(() => ({
    "S.No": 60,
    "Name of Activity": 250,
    "Vendor": 150,
    "Feeder Name": 120,
    "Type of line": 100,
    "Line in KM": 100,
    "Total Pole": 100,
    "Scope": 80,
    "Cum": 80,
    "Balance": 80
  }), []);

  const columnTypes = useMemo(() => ({
    "S.No": "text" as const,
    "Name of Activity": "text" as const,
    "Vendor": "text" as const,
    "Feeder Name": "text" as const,
    "Type of line": "text" as const,
    "Line in KM": "text" as const,
    "Total Pole": "text" as const,
    "Scope": "number" as const,
    "Cum": "number" as const,
    "Balance": "number" as const
  }), []);

  // For custom rows, everything except S.No and Balance can be inline editable.
  // We'll conditionally allow these columns if it's a custom row.
  const editableColumns = useMemo(() => [
    "Name of Activity", "Vendor", "Feeder Name", "Type of line", "Line in KM", "Total Pole", "Scope", "Cum"
  ], []);

  const headerStructure = useMemo(() => [
    [
      { label: "S.No", rowSpan: 1, colSpan: 1 },
      { label: "Name of Activity", rowSpan: 1, colSpan: 1 },
      { label: "Vendor", rowSpan: 1, colSpan: 1 },
      { label: "Feeder Name", rowSpan: 1, colSpan: 1 },
      { label: "Type of line", rowSpan: 1, colSpan: 1 },
      { label: "Line in KM", rowSpan: 1, colSpan: 1 },
      { label: "Total Pole", rowSpan: 1, colSpan: 1 },
      { label: "Scope", rowSpan: 1, colSpan: 1 },
      { label: "Cum", rowSpan: 1, colSpan: 1 },
      { label: "Balance", rowSpan: 1, colSpan: 1 }
    ]
  ], []);

  const getFeederName = useCallback((act: any) => {
    if (act.feeder && act.feeder.trim()) return act.feeder.trim().toUpperCase();
    
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

  const tableData = useMemo(() => {
    const rows: any[] = [];
    let addedDprHeader = false;
    let actIndex = 1;

    filteredData.forEach((act) => {
      const scope = Number(act.scope) || 0;
      const cum = Number(act.completed) || Number(act.cumulative) || 0;
      const bal = Math.max(0, scope - cum);
      const feederName = getFeederName(act);

      if ((act._isCustomRow || act.isCustom) && !addedDprHeader) {
        addedDprHeader = true;
        const dprRow = ["", "📝 DPR Level Activities", "", "", "", "", "", "", "", ""];
        (dprRow as any).isCategoryRow = true;
        rows.push(dprRow);
      }

      const row: any = [
        String(actIndex++),
        act.description || act.activityName || '',
        act.agencyName || act.vendor || '',
        feederName,
        subSheet,
        act.lineKm || '0',
        act.totalPole || '0',
        String(scope),
        String(cum),
        String(bal)
      ];

      // Maintain internal ID mapping to write back
      row._activityId = act.activityId;

      if (act._isCustomRow || act.isCustom) {
        row._isCustomRow = true;
        row._customId = act.id;
      }

      rows.push(row);
    });

    return rows;
  }, [filteredData, subSheet, getFeederName]);

  const rowStyles = useMemo(() => {
    const styles: Record<number, any> = {};
    tableData.forEach((row, index) => {
      if ((row as any).isCategoryRow) {
        styles[index] = {
          backgroundColor: "#FADFAD",
          color: "#333333",
          fontWeight: "bold",
          isCategoryRow: true,
        };
      } else if ((row as any)._isCustomRow) {
        styles[index] = {
          backgroundColor: "#FFFBEB",
        };
      }
    });
    return styles;
  }, [tableData]);

  // Inline add: create a stub custom activity
  const handleInlineAdd = useCallback(() => {
    if (onAddCustomActivity) {
      onAddCustomActivity({
        sheetType: 'wind_33kv',
        description: `New ${subSheet} Activity`,
        uom: 'Nos',
        scope: 0,
        wbsName: '33KV LINE',
        category: '33KV',
      });
    }
  }, [onAddCustomActivity, subSheet]);

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
          fullData[idx] = {
            ...fullData[idx],
            agencyName: row[2] || '',
            lineKm: row[5] || '0',
            totalPole: row[6] || '0',
            _cellStatuses: (row as any)._cellStatuses // Important for tracking edits
          };
        }
      }
    });

    setData(fullData);

    // Update custom rows inline
    if (onEditCustomActivity && customRowChanges.length > 0) {
      customRowChanges.forEach((row) => {
        const customId = (row as any)._customId;
        if (!customId) return;
        const original = customActivities.find(c => c.id === customId);
        if (!original) return;

        const newDesc = row[1] || '';
        const newAgency = row[2] || '';
        const newFeeder = row[3] || '';
        const newLineKm = row[5] || '0';
        const newTotalPole = row[6] || '0';
        const newScope = row[7] || '0';
        const newCum = row[8] || '0';

        const hasChanges =
          newDesc !== (original.description || '') ||
          newAgency !== (original.agencyName || '') ||
          newFeeder !== (original.feeder || '') ||
          newLineKm !== (original.lineKm || '0') ||
          newTotalPole !== (original.totalPole || '0') ||
          newScope !== String(Number(original.scope || 0)) ||
          newCum !== String(Number(original.cumulative || original.completed || 0));

        if (hasChanges) {
          onEditCustomActivity({
            id: customId,
            sheetType: 'wind_33kv',
            description: newDesc,
            uom: 'Nos',
            scope: Number(newScope) || 0,
            cumulative: Number(newCum) || 0,
            extraData: {
              agencyName: newAgency,
              feeder: newFeeder,
              lineKm: newLineKm,
              totalPole: newTotalPole,
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
          <label className="text-sm font-medium text-gray-700">Type:</label>
          <Select value={subSheet} onValueChange={(val: any) => setSubSheet(val)}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Select type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="OH">Overhead (OH)</SelectItem>
              <SelectItem value="UG">Underground (UG)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {!isLocked && onAddCustomActivity && (
          <button
            onClick={handleInlineAdd}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" />
            Add DPR Activity
          </button>
        )}
      </div>

      <div className="flex-1 min-h-0 bg-white rounded-lg shadow-sm border overflow-hidden">
        <StyledExcelTable
          title={`Wind Project - 33KV ${subSheet} Matrix`}
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
          sheetType={`wind_33kv_matrix_${subSheet.toLowerCase()}`}
          fixedColumnsCount={4}
          emptyMessage={`No ${subSheet} 33KV Line Activities found for this project.`}
          onRowDelete={isPmagOrAdmin && !isLocked && onDeleteCustomActivity ? handleRowDelete : undefined}
          rowIsEditable={(idx) => {
            const row = tableData[idx] as any;
            return row && !row.isCategoryRow;
            // P6 rows have specific editable columns based on `editableColumns` array (Vendor, Line in KM, Total Pole).
            // For custom rows, everything except S.No and Balance should be editable because `editableColumns` includes them now.
          }}
          rowIsDeletable={(idx) => !!(tableData[idx] as any)?._isCustomRow && isPmagOrAdmin}
        />
      </div>
    </div>
  );
};
