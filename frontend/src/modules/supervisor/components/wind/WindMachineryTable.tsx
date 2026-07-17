import React, { useMemo, useCallback, useState, useEffect } from 'react';
import { StyledExcelTable } from "@/components/StyledExcelTable";
import { Plus } from 'lucide-react';
import { useAuth } from '@/modules/auth/contexts/AuthContext';

export interface WindMachineryData {
  id?: number;
  sNo?: string;
  vendorName: string;
  area: string;
  totalEquipments: string;
  _isCustomRow?: boolean;
  [key: string]: any;
}

interface WindMachineryTableProps {
  data: WindMachineryData[];
  setData: (data: WindMachineryData[]) => void;
  onSave?: () => void;
  onSubmit?: () => void;
  isLocked?: boolean;
  status?: string;
  projectId?: number;
  targetDate?: string;
  customActivities?: any[];
  onAddCustomActivity?: (activity: any, silent?: boolean) => void;
  onEditCustomActivity?: (activity: any) => void;
  onDeleteCustomActivity?: (id: number) => void;
}

export const WindMachineryTable: React.FC<WindMachineryTableProps> = ({
  data,
  setData,
  onSave,
  onSubmit,
  isLocked = false,
  status = 'draft',
  projectId,
  targetDate,
  customActivities = [],
  onAddCustomActivity,
  onEditCustomActivity,
  onDeleteCustomActivity,
}) => {
  const { user } = useAuth();
  const userRole = (user?.role || user?.Role || '').toLowerCase();
  const isPmagOrAdmin = userRole.includes('pmag') || userRole.includes('admin');

  const [localCustomActivities, setLocalCustomActivities] = useState<any[]>(customActivities || []);

  useEffect(() => {
    setLocalCustomActivities(customActivities || []);
  }, [customActivities]);

  const dateInfo = useMemo(() => {
    const dates = [];
    const baseDate = targetDate ? new Date(targetDate) : new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(baseDate);
      d.setDate(d.getDate() - i);
      dates.push(d);
    }
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    
    const dateLabels = dates.map(d => {
      const dd = String(d.getDate()).padStart(2, '0');
      const mm = months[d.getMonth()];
      const yy = String(d.getFullYear()).slice(-2);
      return `${dd}-${mm}-${yy}`;
    });
    const dayLabels = dates.map(d => days[d.getDay()]);
    
    const isoDates = dates.map(d => {
      const dd = String(d.getDate()).padStart(2, '0');
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const yyyy = d.getFullYear();
      return `${yyyy}-${mm}-${dd}`;
    });

    return { dateLabels, dayLabels, isoDates };
  }, [targetDate]);

  const columns = useMemo(() => [
    "Sr no",
    "Vendor Name",
    "Area",
    "Equipment Name",
    ...dateInfo.dateLabels
  ], [dateInfo.dateLabels]);

  const columnWidths = useMemo(() => {
    const w: Record<string, number> = {
      "Sr no": 60,
      "Vendor Name": 200,
      "Area": 150,
      "Equipment Name": 130
    };
    dateInfo.dateLabels.forEach(d => w[d] = 90);
    return w;
  }, [dateInfo.dateLabels]);

  const columnTypes = useMemo(() => {
    const t: Record<string, any> = {
      "Sr no": "text",
      "Vendor Name": "alphabet",
      "Area": "text",
      "Equipment Name": "text"
    };
    dateInfo.dateLabels.forEach(d => t[d] = "number");
    return t;
  }, [dateInfo.dateLabels]);

  const editableColumns = useMemo(() => [
    "Vendor Name",
    "Area",
    "Equipment Name",
    ...dateInfo.dateLabels
  ], [dateInfo.dateLabels]);

  const headerStructure = useMemo(() => [
    [
      { label: "Equipments Details", colSpan: 3, rowSpan: 1 },
      { label: "Date", colSpan: 1, rowSpan: 1 },
      ...dateInfo.dateLabels.map(d => ({ label: d, colSpan: 1, rowSpan: 1 }))
    ],
    [
      { label: "Sr no", rowSpan: 2, colSpan: 1 },
      { label: "Vendor Name", rowSpan: 2, colSpan: 1 },
      { label: "Area", rowSpan: 2, colSpan: 1 },
      { label: "Day", colSpan: 1, rowSpan: 1 },
      ...dateInfo.dayLabels.map(d => ({ label: d, colSpan: 1, rowSpan: 1 }))
    ],
    [
      { label: "Total Equipments", colSpan: 1, rowSpan: 1 },
      ...dateInfo.dateLabels.map(d => ({ label: "", colSpan: 1, rowSpan: 1 }))
    ]
  ], [dateInfo]);

  const { tableData, rowStyles } = useMemo(() => {
    const rows: any[] = [];
    const styles: Record<number, any> = {};

    const baseRows = Array.isArray(data) ? [...data] : [];
    const customRows = Array.isArray(localCustomActivities) ? [...localCustomActivities] : [];
    const matchedCustomIds = new Set<number>();

    const mergedRows = baseRows.map(baseRow => {
      const allMatches = customRows.filter(c => 
        (c.activityId && String(c.activityId) === String(baseRow.activityId)) || 
        (c.description && String(c.description) === String(baseRow.description))
      );

      if (allMatches.length > 0) {
        allMatches.forEach(c => matchedCustomIds.add(c.id));
        const customMatch = allMatches.sort((a, b) => b.id - a.id)[0];
        let ext = customMatch.extraData || {};
        if (typeof ext === 'string') {
          try { ext = JSON.parse(ext); } catch(e) { ext = {}; }
        }
        return {
          ...baseRow,
          ...ext,
          vendorName: ext.vendorName ?? baseRow.vendorName,
          area: ext.area ?? baseRow.area,
          day: ext.day ?? baseRow.day,
          totalEquipments: ext.totalEquipments ?? baseRow.totalEquipments,
          _isCustomMerged: true,
          _customId: customMatch.id
        };
      }
      return baseRow;
    });

    const rawUnmatched = customRows.filter(c => !matchedCustomIds.has(c.id));
    const uniqueUnmatched = Object.values(
      rawUnmatched.reduce((acc: Record<string, any>, c: any) => {
        const key = `unmatched_${c.id}`;
        if (!acc[key] || acc[key].id < c.id) {
          acc[key] = { ...c, isCustom: true, _isCustomRow: true };
        }
        return acc;
      }, {})
    );

    const finalFilteredData = [...mergedRows, ...uniqueUnmatched];

    let index = 1;
    const dataRows: any[] = [];
    const dailyTotals: number[] = Array(7).fill(0);

    finalFilteredData.forEach(item => {
      let ext = item.extraData || {};
      if (typeof ext === 'string') {
        try { ext = JSON.parse(ext); } catch (e) { ext = {}; }
      }

      const dateValues = dateInfo.isoDates.map((iso, i) => {
        const val = Number(ext[iso] || 0);
        dailyTotals[i] += val;
        return ext[iso] !== undefined ? ext[iso] : '0';
      });

      const row: any = [
        item.sNo || String(index++),
        ext.vendorName !== undefined ? ext.vendorName : (item.vendorName || item.description || ''),
        ext.area !== undefined ? ext.area : (item.area || ''),
        ext.totalEquipments !== undefined ? ext.totalEquipments : (item.totalEquipments || ''),
        ...dateValues
      ];

      row._activityId = item.activityId;
      row._isCustomRow = item._isCustomRow || item.isCustom;
      row._customId = item._customId || item.id;
      if (item._cellStatuses) row._cellStatuses = item._cellStatuses;

      dataRows.push(row);
    });

    const totalRow = [
      '', 'Total', '', '', '', ...dailyTotals.map(t => String(t))
    ];
    totalRow.isTotalRow = true;
    
    rows.push(totalRow);
    styles[0] = { backgroundColor: '#E2EFDA', fontWeight: 'bold' };

    dataRows.forEach((r) => {
      const rowIdx = rows.length;
      if (r._isCustomRow) {
        styles[rowIdx] = { backgroundColor: "#FFFBEB" };
      }
      rows.push(r);
    });

    return { tableData: rows, rowStyles: styles };
  }, [data, localCustomActivities, dateInfo]);

  const handleDataChange = useCallback((newData: any[][]) => {
    const fullData = [...data];
    const customRowChanges: any[] = [];
    const newLocalCustomActivities = [...localCustomActivities];

    newData.filter(r => !(r as any).isTotalRow && !(r as any).isCategoryRow).forEach((row) => {
      if ((row as any)._isCustomRow) {
        customRowChanges.push(row);
        
        // Optimistically update the local state to eliminate input lag
        const customId = (row as any)._customId;
        if (customId) {
          const idx = newLocalCustomActivities.findIndex(c => c.id === customId || c._customId === customId);
          if (idx !== -1) {
            const original = newLocalCustomActivities[idx];
            let ext = original.extraData || {};
            if (typeof ext === 'string') {
              try { ext = JSON.parse(ext); } catch(e) { ext = {}; }
            }
            
            const newDateValues: any = {};
            dateInfo.isoDates.forEach((iso, i) => {
              newDateValues[iso] = row[4 + i] !== undefined ? row[4 + i] : '0';
            });
            
            newLocalCustomActivities[idx] = {
              ...original,
              description: row[1] || ' ',
              extraData: {
                ...ext,
                vendorName: row[1] || '',
                area: row[2] || '',
                totalEquipments: row[3] || '',
                ...newDateValues
              }
            };
          }
        }
      } else {
        const actId = (row as any)._activityId;
        if (!actId) return;

        const idx = fullData.findIndex(d => d.activityId === actId);
        if (idx !== -1) {
          const dateUpdates: any = {};
          dateInfo.isoDates.forEach((iso, i) => {
            dateUpdates[iso] = row[4 + i];
          });

          fullData[idx] = {
            ...fullData[idx],
            vendorName: row[1] || '',
            area: row[2] || '',
            totalEquipments: row[3] || '',
            ...dateUpdates,
            _cellStatuses: (row as any)._cellStatuses
          };
        }
      }
    });

    setData(fullData);
    setLocalCustomActivities(newLocalCustomActivities);

    if (onEditCustomActivity && customRowChanges.length > 0) {
      if ((window as any)._customActivityDebounce) clearTimeout((window as any)._customActivityDebounce);
      
      (window as any)._customActivityDebounce = setTimeout(() => {
        customRowChanges.forEach((row) => {
          const customId = (row as any)._customId;
          if (!customId) return;
          const original = customActivities.find(c => c.id === customId || c._customId === customId) || data.find(c => c.id === customId || c._customId === customId);
          if (!original) return;

          let ext = original.extraData || {};
          if (typeof ext === 'string') {
            try { ext = JSON.parse(ext); } catch(e) { ext = {}; }
          }

          const newVendorName = row[1] || '';
          const newArea = row[2] || '';
          const newTotalEquipments = row[3] || '';
          
          let hasChanges = newVendorName !== (ext.vendorName || original.vendorName || original.description || '') ||
                           newArea !== (ext.area || original.area || '') ||
                           newTotalEquipments !== (ext.totalEquipments || original.totalEquipments || '');
                           
          const newDateValues: any = {};
          dateInfo.isoDates.forEach((iso, i) => {
            const newVal = row[4 + i];
            newDateValues[iso] = newVal !== undefined ? newVal : '0';
            if (newDateValues[iso] !== (ext[iso] || '0')) hasChanges = true;
          });

          if (hasChanges) {
            onEditCustomActivity({
              id: customId,
              sheetType: 'wind_machinery',
              description: newVendorName || ' ',
              uom: 'Nos',
              extraData: {
                ...ext,
                vendorName: newVendorName,
                area: newArea,
                totalEquipments: newTotalEquipments,
                ...newDateValues
              }
            });
          }
        });
      }, 1000);
    }
  }, [data, localCustomActivities, customActivities, onEditCustomActivity, dateInfo, setData]);

  const handleInlineAdd = useCallback(() => {
    if (onAddCustomActivity) {
      onAddCustomActivity({
        sheetType: 'wind_machinery',
        description: `New Equipment Details`,
        uom: 'Nos',
        category: 'Equipment',
}, true);
    }
  }, [onAddCustomActivity]);

  const handleRowDelete = useCallback((originalIndex: number) => {
    const row = tableData[originalIndex] as any;
    if (row && (row._isCustomMerged || row._isCustomRow || row.isCustom) && row._customId && onDeleteCustomActivity) {
      onDeleteCustomActivity(row._customId);
    }
  }, [tableData, onDeleteCustomActivity]);

  const rowIsDeletable = useCallback((originalIndex: number) => {
    const row = tableData[originalIndex] as any;
    return !!(row && (row._isCustomMerged || row._isCustomRow || row.isCustom) && row._customId);
  }, [tableData]);

  return (
    <div className="space-y-4 w-full flex-1 min-h-0 flex flex-col">
      <div className="flex items-center justify-between bg-white p-2 rounded-md shadow-sm border">
        <h2 className="text-lg font-semibold text-gray-800">Equipments Details</h2>
        {!isLocked && onAddCustomActivity && (
          <button
            onClick={handleInlineAdd}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" />
            Add Equipment
          </button>
        )}
      </div>

      <div className="flex-1 min-h-0 bg-white rounded-lg shadow-sm border overflow-hidden">
        <StyledExcelTable
          title="Equipments Details"
          columns={columns}
          data={tableData}
          columnWidths={columnWidths}
          columnTypes={columnTypes}
          editableColumns={isLocked ? [] : editableColumns}
          onDataChange={handleDataChange}
          hasChanges={status === 'draft'}
          onSave={isLocked ? undefined : onSave}
          onSubmit={isLocked ? undefined : onSubmit}
          isReadOnly={isLocked}
          headerStructure={headerStructure}
          disableAutoHeaderColors={true}
          sheetType="wind_machinery"
          projectId={projectId}
          rowStyles={rowStyles}
          fixedColumnsCount={3}
          onRowDelete={isLocked ? undefined : handleRowDelete}
          rowIsDeletable={rowIsDeletable}
        />
      </div>
    </div>
  );
};
