import React, { useState, useEffect, useCallback, useRef } from "react";
import { AlertCircle, Package } from "lucide-react";
import { toast } from "sonner";
import { PSSSummaryTable } from "../pss/PSSSummaryTable";
import { PSSProgressTable } from "../pss/PSSProgressTable";
import { PSSManpowerTable } from "../pss/PSSManpowerTable";
import { ManpowerTimephasedTable } from "../ManpowerTimephasedTable";
import { DPQtyTable } from "../DPQtyTable";
import { saveDraftEntry, submitEntry, getDraftEntry, pushEntryToP6 } from "@/services/dprService";
import { getCustomActivities, createCustomActivity, updateCustomActivity, deleteCustomActivity } from "@/services/customActivityService";
import { useAuth } from "@/modules/auth/contexts/AuthContext";
// We'll need to create or map these BESS specific fetch functions in p6ActivityService
import {
  getBessData, // A generic fetcher for BESS progress sheets
  getManpowerDetailsData,
  getManpowerTimephasedData,
  aggregateManpowerByActivityName,
  getDPQtyActivities
} from "@/services/p6ActivityService";
import apiClient from "@/services/apiClient";

interface BessDashboardProps {
  projectId: number;
  targetDate: string;
  targetYesterday: string;
  activeTab: string;
  currentDraftEntry: any;
  onDraftUpdate: (draft: any) => void;
  isEntryReadOnly: boolean;
  projectDetails?: any;
}

export const BessDashboard: React.FC<BessDashboardProps> = ({
  projectId,
  targetDate,
  targetYesterday,
  activeTab,
  currentDraftEntry,
  onDraftUpdate,
  isEntryReadOnly,
  projectDetails
}) => {
  const dataDate = projectDetails?.p6_data_date;

  // Data states for BESS sheets
  const [summaryData, setSummaryData] = useState<any[]>([]);
  const [dpQtyData, setDpQtyData] = useState<any[]>([]);
  const [civilData, setCivilData] = useState<any[]>([]);
  const [electricalData, setElectricalData] = useState<any[]>([]);
  const [bopData, setBopData] = useState<any[]>([]);
  const [testingData, setTestingData] = useState<any[]>([]);

  const [manpowerData, setManpowerData] = useState<any[]>([]);
  const [resourceData, setResourceData] = useState<any[]>([]);
  const [dailyHistoryMap, setDailyHistoryMap] = useState<Record<string, Record<string, Record<string, number>>>>({});

  const [loading, setLoading] = useState(false);
  const [customActivitiesMap, setCustomActivitiesMap] = useState<Record<string, any[]>>({});

  useEffect(() => {
    const fetchCustomActivities = async () => {
      if (!projectId) return;
      try {
        const sheetTypes = [
          'bess_civil', 'bess_electrical', 'bess_bop', 'bess_testing',
          'bess_manpower'
        ];
        const results = await Promise.all(sheetTypes.map(st => getCustomActivities(projectId, st).catch(() => [])));
        const newMap: Record<string, any[]> = {};
        sheetTypes.forEach((st, idx) => {
          newMap[st] = results[idx] || [];
        });
        setCustomActivitiesMap(newMap);
      } catch (err) {
        console.error("Error fetching custom activities:", err);
      }
    };
    fetchCustomActivities();
  }, [projectId]);

  // Fetch daily progress history for the last 7 days (for DP Qty sheet)
  useEffect(() => {
    const fetchDailyHistory = async () => {
      if (!projectId) return;
      try {
        // 'bess_dp_qty' logic on backend uses same universal logic for daily history? 
        // Wait, the backend expects 'bess_dp_qty' or 'dp_qty' for the sheet_type to get history.
        // Since the entry is saved as 'bess_dp_qty' for BESS, we pass 'bess_dp_qty'
        const res = await apiClient.get(`/oracle-p6/daily-history/${projectId}`, { params: { sheet_type: 'bess_dp_qty', target_date: targetDate } });
        setDailyHistoryMap({ 'bess_dp_qty': res.data || {} });
      } catch (err) {
        console.error("Error fetching daily history:", err);
      }
    };
    fetchDailyHistory();
  }, [projectId, targetDate]);

  const handleAddCustomActivity = useCallback(async (activity: any) => {
    try {
      await createCustomActivity({
        projectId,
        sheetType: activity.sheetType,
        description: activity.description,
        uom: activity.uom,
        scope: activity.scope,
        wbsName: activity.wbsName,
        category: activity.category,
        plannedStart: activity.plannedStart,
        plannedFinish: activity.plannedFinish,
        remarks: activity.remarks,
        extraData: activity.extraData,
      });
      const refreshed = await getCustomActivities(projectId, activity.sheetType);
      setCustomActivitiesMap(prev => ({ ...prev, [activity.sheetType]: refreshed || [] }));
      toast.success("Custom activity added");
    } catch (err) {
      toast.error("Failed to add activity");
    }
  }, [projectId]);

  const handleEditCustomActivity = useCallback(async (activity: any) => {
    try {
      await updateCustomActivity(activity.id, activity);
      const refreshed = await getCustomActivities(projectId, activity.sheetType);
      setCustomActivitiesMap(prev => ({ ...prev, [activity.sheetType]: refreshed || [] }));
    } catch (err) {
      toast.error("Failed to update activity");
    }
  }, [projectId]);

  const handleDeleteCustomActivity = useCallback(async (id: number, sheetType: string) => {
    try {
      await deleteCustomActivity(id);
      const refreshed = await getCustomActivities(projectId, sheetType);
      setCustomActivitiesMap(prev => ({ ...prev, [sheetType]: refreshed || [] }));
      toast.success("Activity deleted");
    } catch (err) {
      toast.error("Failed to delete activity");
    }
  }, [projectId]);

  // Map P6 response to table format
  const mapActivities = (acts: any[]) => acts.map((act: any) => ({
    ...act,
    sNo: '',
    description: act.description || act.name || '',
    priority: act.priority || '',
    duration: act.duration ? String(act.duration) : '',
    planStart: act.baselineStart || act.forecastStart || '',
    planFinish: act.baselineFinish || act.forecastFinish || '',
    actualStart: act.actualStart || '',
    actualFinish: act.actualFinish || '',
    forecastStart: act.forecastStart || '',
    forecastFinish: act.forecastFinish || '',
    soVendorName: act.vendorName || act.agencyName || '',
    uom: act.uom || '',
    scope: act.scope ? String(act.scope) : '',
    completed: act.completed ? String(act.completed) : '',
    balance: act.balance ? String(act.balance) : '',
    remarks: '',
    mainHeading: act.mainHeading || '',
    subHeading: act.subHeading || '',
  }));

  // Fetch all BESS data on mount
  useEffect(() => {
    const fetchBessData = async () => {
      if (!projectId) return;
      setLoading(true);
      try {
        // We fetch data based on active tab to optimize loading, 
        // but for now let's just fetch the active tab data.
        if (activeTab === 'bess_dp_qty' && dpQtyData.length === 0) {
          const resp = await getDPQtyActivities(projectId);
          if (resp?.data) setDpQtyData(resp.data);
        } else if (activeTab === 'bess_civil' && civilData.length === 0) {
          const resp = await getBessData(projectId, 'civil');
          if (resp?.data) setCivilData(mapActivities(resp.data));
        } else if (activeTab === 'bess_electrical' && electricalData.length === 0) {
          const resp = await getBessData(projectId, 'electrical');
          if (resp?.data) setElectricalData(mapActivities(resp.data));
        } else if (activeTab === 'bess_bop' && bopData.length === 0) {
          const resp = await getBessData(projectId, 'bop');
          if (resp?.data) setBopData(mapActivities(resp.data));
        } else if (activeTab === 'bess_testing' && testingData.length === 0) {
          const resp = await getBessData(projectId, 'testing');
          if (resp?.data) setTestingData(mapActivities(resp.data));

        } else if (activeTab === 'bess_manpower' && manpowerData.length === 0) {
          const mpData = await getManpowerDetailsData(projectId);
          if (mpData) setManpowerData(mpData);
        } else if (activeTab === 'bess_resource' && resourceData.length === 0) {
          const resData = await getManpowerTimephasedData(projectId, targetDate);
          if (resData) setResourceData(aggregateManpowerByActivityName(resData));
        }
      } catch (error) {
        console.error("Failed to load BESS data", error);
      } finally {
        setLoading(false);
      }
    };
    fetchBessData();
  }, [projectId, targetDate, activeTab]);

  // Column label (as tracked in _cellStatuses) -> row field name, for PSSProgressTable-style sheets.
  const EDITABLE_FIELD_BY_LABEL: Record<string, string> = {
    "Description": "description", "Status": "status", "Priority": "priority", "Duration": "duration",
    "Plan Start": "planStart", "Plan Finish": "planFinish",
    "Actual Start": "actualStart", "Actual Finish": "actualFinish",
    "SO Vendor Name": "soVendorName", "UOM": "uom",
    "Scope": "scope", "Completed": "completed", "Remarks": "remarks",
  };

  const applyDraftOverlay = useCallback((rows: any[], draftRows: any[]) => {
    if (!draftRows || draftRows.length === 0) return rows;
    return rows.map(r => {
      const draft = draftRows.find((d: any) =>
        String(d.activityObjectId) === String(r.activityObjectId) ||
        String(d.activityId) === String(r.activityId) ||
        (d.stringActivityId && String(d.stringActivityId) === String(r.activityId))
      );
      if (!draft) return r;

      // Only overlay fields the user actually edited (per _cellStatuses). Structural/computed
      // fields (description, mainHeading, subHeading, block, baseline/forecast dates, etc.) must
      // always come from the live P6 fetch, never from a possibly-stale saved draft snapshot.
      const merged = { ...r };
      const cellStatuses = draft._cellStatuses || {};
      Object.keys(cellStatuses).forEach(label => {
        const key = EDITABLE_FIELD_BY_LABEL[label];
        if (key && draft[key] !== undefined) merged[key] = draft[key];
      });
      merged._cellStatuses = { ...(r._cellStatuses || {}), ...cellStatuses };
      return merged;
    });
  }, []);

  useEffect(() => {
    if (!currentDraftEntry) return;
    const draftData = typeof currentDraftEntry?.data_json === 'string'
      ? JSON.parse(currentDraftEntry.data_json)
      : (currentDraftEntry?.data_json || {});
    const draftRows = draftData.rows || [];
    if (draftRows.length === 0) return;

    if (activeTab === 'bess_dp_qty') {
      // DP Qty has its own structure, usually we don't overlay it with applyDraftOverlay the same way
      // But let's assume applyDraftOverlay works or DPQty handles its own overlay in backend
    } else if (activeTab === 'bess_civil') setCivilData(prev => applyDraftOverlay(prev, draftRows));
    if (activeTab === 'bess_electrical') setElectricalData(prev => applyDraftOverlay(prev, draftRows));
    if (activeTab === 'bess_bop') setBopData(prev => applyDraftOverlay(prev, draftRows));
    if (activeTab === 'bess_testing') setTestingData(prev => applyDraftOverlay(prev, draftRows));

  }, [currentDraftEntry, activeTab, applyDraftOverlay]);

  const autoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (isEntryReadOnly) return;

    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
    }

    autoSaveTimeoutRef.current = setTimeout(() => {
      handleSaveEntry(true);
    }, 2000);

    return () => {
      if (autoSaveTimeoutRef.current) clearTimeout(autoSaveTimeoutRef.current);
    };
  }, [
    summaryData, civilData, electricalData, bopData, testingData, 
    manpowerData, resourceData, isEntryReadOnly
  ]);

  const handleSaveEntry = async (isAutoSave: boolean = false) => {
    if (!currentDraftEntry) return;
    try {
      let currentData: any[] = [];

      switch (activeTab) {
        case 'bess_summary': currentData = summaryData; break;
        case 'bess_dp_qty': currentData = dpQtyData; break;
        case 'bess_civil': currentData = civilData; break;
        case 'bess_electrical': currentData = electricalData; break;
        case 'bess_bop': currentData = bopData; break;
        case 'bess_testing': currentData = testingData; break;

        case 'bess_manpower': currentData = manpowerData; break;
        case 'bess_resource': currentData = resourceData; break;
        default: return;
      }

      const deltaRows = currentData.filter((row: any) => {
        if (row.isCategoryRow) return false;
        const hasMetadata = row._cellStatuses && Object.keys(row._cellStatuses).length > 0;
        return hasMetadata;
      });

      if (deltaRows.length === 0) {
        if (!isAutoSave) toast.warning("No new changes detected.");
        return;
      }

      await saveDraftEntry(currentDraftEntry.id, { rows: deltaRows }, true);
      if (!isAutoSave) toast.success(`Updated ${deltaRows.length} activities successfully!`);
    } catch (error) {
      toast.error("Failed to save entry");
    }
  };

  const renderActiveTable = () => {
    const entryStatus = currentDraftEntry?.status || 'draft';
    const isRejected = currentDraftEntry?.isRejected;
    const rejectionReason = currentDraftEntry?.rejectionReason;

    const renderRejectedAlert = () => isRejected && rejectionReason ? (
      <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
        <div className="flex items-start">
          <AlertCircle className="h-5 w-5 text-red-500 mt-0.5 mr-2 flex-shrink-0" />
          <div>
            <h4 className="text-red-800 font-medium">Entry Rejected by PM</h4>
            <p className="text-red-700 mt-1">Reason: {rejectionReason}</p>
          </div>
        </div>
      </div>
    ) : null;

    const renderProgressTable = (data: any[], setData: any, title: string, sheetType: string, extraProps: Record<string, any> = {}) => (
      <>
        {renderRejectedAlert()}
        <PSSProgressTable
          data={data}
          setData={setData}
          onSave={isEntryReadOnly ? undefined : handleSaveEntry}
          yesterday={targetYesterday}
          today={targetDate}
          dataDate={dataDate}
          isLocked={isEntryReadOnly}
          status={entryStatus}
          projectId={projectId}
          title={title}
          sheetType={sheetType}
          customActivities={customActivitiesMap[sheetType] || []}
          onAddCustomActivity={handleAddCustomActivity}
          onEditCustomActivity={handleEditCustomActivity}
          onDeleteCustomActivity={(id) => handleDeleteCustomActivity(id, sheetType)}
          {...extraProps}
        />
      </>
    );

    switch (activeTab) {
      case 'bess_summary':
        return (
          <PSSSummaryTable
            data={summaryData}
            setData={setSummaryData}
            onSave={isEntryReadOnly ? undefined : handleSaveEntry}
            isLocked={isEntryReadOnly}
            status={entryStatus}
            projectId={projectId}
          />
        );
      case 'bess_dp_qty':
        return (
          <>
            {renderRejectedAlert()}
            <DPQtyTable
              data={dpQtyData}
              setData={setDpQtyData}
              onSave={isEntryReadOnly ? undefined : handleSaveEntry}
              yesterday={targetYesterday}
              today={targetDate}
              isLocked={isEntryReadOnly}
              status={entryStatus}
              projectId={projectId}
              dailyHistory={dailyHistoryMap['bess_dp_qty'] || {}}
            />
          </>
        );
      case 'bess_civil': return renderProgressTable(civilData, setCivilData, "BESS - Civil Works", "bess_civil", { renamePlanToBaseline: true });
      case 'bess_electrical': return renderProgressTable(electricalData, setElectricalData, "BESS - Electrical Works", "bess_electrical", { renamePlanToBaseline: true });
      case 'bess_bop': return renderProgressTable(bopData, setBopData, "BESS - BOP", "bess_bop", { renamePlanToBaseline: true });
      case 'bess_testing': return renderProgressTable(testingData, setTestingData, "BESS - Testing & Commissioning", "bess_testing", { renamePlanToBaseline: true });


      case 'bess_manpower':
        return (
          <>
            {renderRejectedAlert()}
            <PSSManpowerTable
              data={manpowerData}
              setData={setManpowerData}
              onSave={isEntryReadOnly ? undefined : handleSaveEntry}
              todayDate={targetDate}
              isLocked={isEntryReadOnly}
              status={entryStatus}
              projectId={projectId}
              customActivities={customActivitiesMap['bess_manpower'] || []}
              onAddCustomActivity={handleAddCustomActivity}
              onEditCustomActivity={handleEditCustomActivity}
              onDeleteCustomActivity={(id) => handleDeleteCustomActivity(id, 'bess_manpower')}
            />
          </>
        );
      case 'bess_resource':
        return (
          <>
            {renderRejectedAlert()}
            <ManpowerTimephasedTable
              data={resourceData}
              setData={setResourceData}
              onSave={isEntryReadOnly ? undefined : handleSaveEntry}
              yesterday={targetYesterday}
              today={targetDate}
              isLocked={isEntryReadOnly}
              status={entryStatus}
              projectId={projectId}
            />
          </>
        );
      default:
        return (
          <div className="flex flex-col items-center justify-center p-12">
            <Package className="w-12 h-12 text-blue-500 mb-4" />
            <p className="text-muted-foreground">Sheet {activeTab} is not yet implemented.</p>
          </div>
        );
    }
  };

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex-1 min-h-0">
        {loading ? (
          <div className="flex flex-col items-center justify-center p-12">
            <Package className="w-12 h-12 text-blue-500 animate-spin mb-4" />
            <p className="text-muted-foreground">Loading BESS Data...</p>
          </div>
        ) : (
          renderActiveTable()
        )}
      </div>
    </div>
  );
};
