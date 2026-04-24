import React, { useMemo, useCallback, useState } from 'react';
import { StyledExcelTable } from "@/components/StyledExcelTable";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

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
}) => {
  const [subSheet, setSubSheet] = useState<'OH' | 'UG'>('OH');

  // Filter activities based on OH/UG sub-sheet
  const filteredData = useMemo(() => {
    const safeData = Array.isArray(data) ? data : [];
    return safeData.filter(d => {
      const wbs = (d.wbsName || '').toUpperCase();
      const desc = (d.description || '').toUpperCase();
      const id = (d.activityId || '').toUpperCase();
      
      if (subSheet === 'OH') {
        return wbs === '33KV LINE ELETRICAL WORKS' || (!desc.includes('UNDERGROUND') && !id.includes('-UG'));
      } else {
        return desc.includes('UNDERGROUND') || desc.includes(' U/G') || desc.includes(' UG ') || id.includes('-UG');
      }
    });
  }, [data, subSheet]);

  const activityTypes = useMemo(() => [
    { label: "OH Stringing Works", match: "Stringing" },
    { label: "Pole Erection", match: "Pole Erection" },
    { label: "Tower Foundation", match: "Foundation" },
    { label: "Tower Erection", match: "Tower Erection" },
    { label: "RoW Clearance", match: "RoW" },
    { label: "ADSS Cable Laying", match: "ADSS" }
  ], []);

  const columns = useMemo(() => {
    const cols = [
      "S.No",
      "Vendor",
      "Feeder Name",
      "Type of line",
      "Line in KM",
      "Total Pole"
    ];
    activityTypes.forEach(act => {
      cols.push(`${act.label}_Scope`);
      cols.push(`${act.label}_Cumulative`);
      cols.push(`${act.label}_Balance`);
    });
    return cols;
  }, [activityTypes]);

  const columnWidths = useMemo(() => {
    const widths: Record<string, number> = {
      "S.No": 60,
      "Vendor": 150,
      "Feeder Name": 180,
      "Type of line": 100,
      "Line in KM": 100,
      "Total Pole": 100
    };
    activityTypes.forEach(act => {
      widths[`${act.label}_Scope`] = 80;
      widths[`${act.label}_Cumulative`] = 80;
      widths[`${act.label}_Balance`] = 80;
    });
    return widths;
  }, [activityTypes]);

  const columnTypes = useMemo(() => {
    const types: Record<string, any> = {
      "S.No": "text",
      "Vendor": "text",
      "Feeder Name": "text",
      "Type of line": "text",
      "Line in KM": "text",
      "Total Pole": "text"
    };
    activityTypes.forEach(act => {
      types[`${act.label}_Scope`] = "number";
      types[`${act.label}_Cumulative`] = "number";
      types[`${act.label}_Balance`] = "number";
    });
    return types;
  }, [activityTypes]);

  const editableColumns = useMemo(() => {
    return ["Vendor", "Line in KM", "Total Pole"];
  }, []);

  const getFeederName = useCallback((act: any) => {
    // 1. Check explicit feeder field
    if (act.feeder && act.feeder.trim()) return act.feeder.trim().toUpperCase();
    
    // 2. Extract from ID, Description, or WBS Name using a very robust search
    const desc = (act.description || '').toUpperCase();
    const id = (act.activityId || '').toUpperCase();
    const wbs = (act.wbsName || '').toUpperCase();
    const combined = `${id} ${desc} ${wbs}`;

    // Aggressive match for FDR, F, or FEEDER followed by numbers
    const feederMatch = combined.match(/(FDR[-\s]?\d+|F[-\s]?\d+|FEEDER[-\s]?\d+)/i);
    if (feederMatch) {
      return feederMatch[1].toUpperCase().trim();
    }

    return "GENERAL";
  }, []);

  const tableData = useMemo(() => {
    const feederMap: Record<string, any[]> = {};
    filteredData.forEach(act => {
      const fName = getFeederName(act);
      if (!feederMap[fName]) feederMap[fName] = [];
      feederMap[fName].push(act);
    });

    return Object.entries(feederMap).map(([feederName, acts], index) => {
      const firstAct = acts[0] || {};
      const poleErectionActs = acts.filter(a => (a.activityName || a.description || '').toLowerCase().includes('pole erection'));
      const totalPoleScope = poleErectionActs.reduce((sum, a) => sum + (Number(a.scope) || 0), 0);

      const row = [
        String(index + 1),
        firstAct.agencyName || firstAct.vendor || '',
        feederName,
        subSheet,
        firstAct.lineKm || '0',
        String(totalPoleScope)
      ];

      activityTypes.forEach(type => {
        const matchingActs = acts.filter(a => (a.activityName || a.description || '').toLowerCase().includes(type.match.toLowerCase()));
        if (matchingActs.length > 0) {
          const totalScope = matchingActs.reduce((sum, a) => sum + (Number(a.scope) || 0), 0);
          const totalCum = matchingActs.reduce((sum, a) => sum + (Number(a.completed) || Number(a.cumulative) || 0), 0);
          row.push(String(totalScope), String(totalCum), String(Math.max(0, totalScope - totalCum)));
        } else {
          row.push('0', '0', '0');
        }
      });
      return row;
    });
  }, [filteredData, subSheet, activityTypes, getFeederName]);

  const handleDataChange = useCallback((newData: any[][]) => {
    const fullData = [...data];
    const feederMap: Record<string, any[]> = {};
    filteredData.forEach(act => {
      const fName = getFeederName(act);
      if (!feederMap[fName]) feederMap[fName] = [];
      feederMap[fName].push(act);
    });
    
    const feeders = Object.keys(feederMap);

    newData.filter(r => !(r as any).isTotalRow).forEach((row, rowIndex) => {
      const feederName = feeders[rowIndex];
      if (!feederName) return;
      const acts = feederMap[feederName];
      
      acts.forEach(act => {
        const idx = fullData.findIndex(d => d.activityId === act.activityId);
        if (idx !== -1) {
          fullData[idx] = {
            ...fullData[idx],
            agencyName: row[1] || '',
            lineKm: row[4] || '0',
            totalPole: row[5] || '0'
          };
        }
      });
    });
    setData(fullData);
  }, [data, filteredData, setData, getFeederName]);

  const headerStructure = useMemo(() => [
    [
      { label: "S.No", rowSpan: 2, colSpan: 1 },
      { label: "Vendor", rowSpan: 2, colSpan: 1 },
      { label: "Feeder Name", rowSpan: 2, colSpan: 1 },
      { label: "Type of line", rowSpan: 2, colSpan: 1 },
      { label: "Line in KM", rowSpan: 2, colSpan: 1 },
      { label: "Total Pole", rowSpan: 2, colSpan: 1 },
      ...activityTypes.map(act => ({ label: act.label.toUpperCase(), colSpan: 3, rowSpan: 1 }))
    ],
    [
      ...activityTypes.flatMap(() => [
        { label: "Scope", colSpan: 1, rowSpan: 1 },
        { label: "Cum", colSpan: 1, rowSpan: 1 },
        { label: "Bal", colSpan: 1, rowSpan: 1 }
      ])
    ]
  ], [activityTypes]);

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
          status={status}
          onExportAll={onExportAll}
          disableAutoHeaderColors={true}
          projectId={projectId}
          sheetType={`wind_33kv_matrix_${subSheet.toLowerCase()}`}
          fixedColumnsCount={6}
        />
      </div>
    </div>
  );
};
