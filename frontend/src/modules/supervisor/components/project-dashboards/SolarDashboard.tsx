import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { Plus, Download, Upload, AlertCircle, RefreshCw, Package, FileSpreadsheet } from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { processActivitiesForCharts, P6Activity } from '@/utils/projectUtils';
import { applyDraftOverlay } from '@/utils/draftUtils';
import { getCustomActivities, createCustomActivity, updateCustomActivity, deleteCustomActivity, bulkCreateCustomActivities } from "@/services/customActivityService";
import { getUIColumnsForSheet } from "../bulkUploadTemplates";
import {
  DPQtyTable,
  ACSheetTable,
  ManpowerDetailsTable,
  DCSheetTable,
  TestingCommTable,
  ManpowerTimephasedTable,
  DPRSummarySection,
  DroneVerificationModal,
  BulkUploadActivitiesModal
} from "../index";
import { ResourceTable } from "../ResourceTable";
import {
  getP6ActivitiesForProject,
  getResources,
  getYesterdayValues,
  mapActivitiesToDPQty,
  mapActivitiesToACSheet,
  mapActivitiesToDCSheet,
  mapActivitiesToTestingComm,
  mapResourcesToTable,
  aggregateManpowerByActivityName,
  aggregateDPQtyByActivityName,
  aggregateVendorIdtByActivityName,
  aggregateVendorBlockByActivityName,
  aggregateTestingCommByActivityName,
  extractBlockName,
  extractActivityName,
  getManpowerDetailsData,
  getManpowerTimephasedData,
  mapActivitiesToWbsSheet,
  aggregateByWbsName,
  getWbsTree,
  SWITCHYARD_WBS_PATTERNS,
  TRANS_LINE_WBS_PATTERNS,
  INFRA_WORKS_WBS_PATTERNS,
  getActivityMaterialResources
} from "@/services/p6ActivityService";
import type { WbsNode } from "@/services/p6ActivityService";
import {
  saveDraftEntry,
  submitEntry,
  getDraftEntry,
  pushEntryToP6,
  getDailyProgressHistory
} from "@/services/dprService";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { getProjectTypeConfig } from "@/config/sheetConfig";

interface SolarDashboardProps {
  projectId: number;
  projectName: string;
  targetDate: string;
  targetYesterday: string;
  activeTab: string;
  user: any;
  currentDraftEntry: any;
  onDraftUpdate: (draft: any) => void;
  isEntryReadOnly: boolean;
  universalFilter: string;
  setUniversalFilter: (val: string, pid?: number) => void;
  selectedBlock: string;
  p6Activities: any[];
  isDroneModalOpen?: boolean;
  onCloseDroneModal?: () => void;
  projectDetails?: any;
  selectedStatus?: string;
}
export const SolarDashboard: React.FC<SolarDashboardProps> = ({
  projectId,
  projectName,
  targetDate,
  targetYesterday,
  activeTab,
  user,
  currentDraftEntry,
  onDraftUpdate,
  isEntryReadOnly,
  universalFilter,
  setUniversalFilter,
  selectedBlock,
  p6Activities: passedActivities,
  isDroneModalOpen,
  onCloseDroneModal,
  projectDetails,
  selectedStatus = "ALL"
}) => {
  // Master Data State - Single source of truth for all project activities
  const [masterActivities, setMasterActivities] = useState<any[]>([]);
  const [manpowerDetailsData, setManpowerDetailsData] = useState<any[]>([]);
  const [manpowerTimephasedData, setManpowerTimephasedData] = useState<any[]>([]);
  const [resourceData, setResourceData] = useState<any[]>([]);
  const [totalManpower, setTotalManpower] = useState(0);
  const [loading, setLoading] = useState(false);
  const [wbsTree, setWbsTree] = useState<WbsNode[]>([]);
  const [resourcesByActivity, setResourcesByActivity] = useState<Record<string, any[]>>({});
  const [customActivitiesMap, setCustomActivitiesMap] = useState<Record<string, any[]>>({});
  const [isBulkUploadModalOpen, setIsBulkUploadModalOpen] = useState(false);
  const [bulkUploadSheetType, setBulkUploadSheetType] = useState<string>('');
  const [dailyHistoryMap, setDailyHistoryMap] = useState<Record<string, Record<string, Record<string, number>>>>({});
  const navigate = useNavigate();

  // Fetch daily progress history for the last 7 days (for DC/AC/T&C sheet date columns)
  useEffect(() => {
    const fetchHistory = async () => {
      if (!projectId) return;
      try {
        const sheetTypes = ['dc_sheet', 'ac_sheet', 'testing_commissioning', 'manpower_details'];
        const results = await Promise.all(
          sheetTypes.map(st => getDailyProgressHistory(projectId, st, 7, targetDate))
        );
        const newMap: Record<string, Record<string, Record<string, number>>> = {};
        sheetTypes.forEach((st, idx) => {
          newMap[st] = results[idx]?.data || {};
        });
        setDailyHistoryMap(newMap);
      } catch (err) {
        console.error("Error fetching daily history:", err);
      }
    };
    fetchHistory();
  }, [projectId, targetDate]);

  useEffect(() => {
    const fetchCustomActivities = async () => {
      if (!projectId) return;
      try {
        const sheetTypes = ['dp_qty', 'ac_sheet', 'dc_sheet', 'testing_commissioning', 'manpower_details'];
        const results = await Promise.all(sheetTypes.map(st => getCustomActivities(projectId, st)));
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
      console.error(err);
      toast.error("Failed to add activity");
    }
  }, [projectId]);

  const handleEditCustomActivity = useCallback(async (activity: any) => {
    try {
      await updateCustomActivity(activity.id, activity);
      const refreshed = await getCustomActivities(projectId, activity.sheetType);
      setCustomActivitiesMap(prev => ({ ...prev, [activity.sheetType]: refreshed || [] }));
    } catch (err) {
      console.error(err);
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
      console.error(err);
      toast.error("Failed to delete activity");
    }
  }, [projectId]);

  const handleBulkUploadSuccess = useCallback(async (data: any[]) => {
    try {
      if (!bulkUploadSheetType || !projectId) return;
      await bulkCreateCustomActivities(projectId, bulkUploadSheetType, data);
      const refreshed = await getCustomActivities(projectId, bulkUploadSheetType);
      setCustomActivitiesMap(prev => ({ ...prev, [bulkUploadSheetType]: refreshed || [] }));
      toast.success(`Successfully uploaded ${data.length} activities`);
      setIsBulkUploadModalOpen(false);
    } catch (error) {
      console.error("Bulk upload failed:", error);
      toast.error("Failed to upload activities");
    }
  }, [projectId, bulkUploadSheetType]);

  // Fetch WBS tree once per project (needed for hierarchy-based sheets)
  useEffect(() => {
    const fetchWbsTree = async () => {
      if (!projectId) return;
      try {
        const tree = await getWbsTree(projectId);
        setWbsTree(tree);
        console.log(`Loaded ${tree.length} WBS nodes for project ${projectId}`);
      } catch (error) {
        console.error('Error fetching WBS tree:', error);
      }
    };
    fetchWbsTree();
  }, [projectId]);

  // Fetch material resource assignments per activity (for Resource dropdown)
  useEffect(() => {
    const fetchResources = async () => {
      if (!projectId) return;
      try {
        const resByAct = await getActivityMaterialResources(projectId);
        setResourcesByActivity(resByAct);
        console.log(`Loaded material resources for ${Object.keys(resByAct).length} activities`);
      } catch (error) {
        console.error('Error fetching activity resources:', error);
      }
    };
    fetchResources();
  }, [projectId]);

  const roundP6Metrics = useCallback((row: any) => {
    if (!row) return row;
    const rounded = { ...row };
    const METRIC_KEYS = [
      'targetQty', 'scope', 'remainingQty', 'balance',
      'actualQty', 'cumulative', 'weightage',
      'yesterdayValue', 'yesterday', 'todayValue', 'today',
      'actual', 'completed', 'totalQuantity',
      'actualUnits', 'budgetedUnits', 'remainingUnits',
      'hoursPerDay', 'percentComplete', 'cumulativeValue'
    ];

    METRIC_KEYS.forEach(k => {
      if (rounded[k] !== undefined && rounded[k] !== null && rounded[k] !== "") {
        // Only round if it's actually a number.
        // Some percent fields might be strings like "100.00%". Number("100.00%") is NaN.
        let valStr = String(rounded[k]);
        let isPercentage = false;
        if (valStr.endsWith('%')) {
          isPercentage = true;
          valStr = valStr.replace('%', '');
        }

        const num = Number(valStr);
        if (!isNaN(num)) {
          if (isPercentage) {
            rounded[k] = Math.round(num) + '%';
          } else {
            rounded[k] = Math.round(num);
          }
        }
      }
    });

    Object.keys(rounded).forEach(k => {
      if (k.startsWith('actual_') || /^\d{2}-[a-zA-Z]{3}-\d{2}$/.test(k)) {
        const val = rounded[k];
        if (val !== undefined && val !== null && val !== "") {
          const num = Number(val);
          if (!isNaN(num)) rounded[k] = Math.round(num);
        }
      }
    });

    return rounded;
  }, []);

  // DERIVED STATES - These automatically update whenever masterActivities change
  // Apply roundP6Metrics after mapping+aggregation to catch any decimals from arithmetic
  const dpQtyData = useMemo(() => aggregateDPQtyByActivityName(mapActivitiesToDPQty(masterActivities)).map(roundP6Metrics), [masterActivities, roundP6Metrics]);
  const ACSheetData = useMemo(() => aggregateVendorBlockByActivityName(mapActivitiesToACSheet(masterActivities)).map(roundP6Metrics), [masterActivities, roundP6Metrics]);
  const DCSheetData = useMemo(() => aggregateVendorIdtByActivityName(mapActivitiesToDCSheet(masterActivities)).map(roundP6Metrics), [masterActivities, roundP6Metrics]);
  const testingCommData = useMemo(() => aggregateTestingCommByActivityName(mapActivitiesToTestingComm(masterActivities)).map(roundP6Metrics), [masterActivities, roundP6Metrics]);

  // Rajasthan WBS hierarchy-based sheets
  const switchyardData = useMemo(() => aggregateByWbsName(mapActivitiesToWbsSheet(masterActivities, SWITCHYARD_WBS_PATTERNS, wbsTree)).map(roundP6Metrics), [masterActivities, wbsTree, roundP6Metrics]);
  const transmissionLineData = useMemo(() => aggregateByWbsName(mapActivitiesToWbsSheet(masterActivities, TRANS_LINE_WBS_PATTERNS, wbsTree)).map(roundP6Metrics), [masterActivities, wbsTree, roundP6Metrics]);
  const infraWorksData = useMemo(() => aggregateByWbsName(mapActivitiesToWbsSheet(masterActivities, INFRA_WORKS_WBS_PATTERNS, wbsTree)).map(roundP6Metrics), [masterActivities, wbsTree, roundP6Metrics]);


  const isDataEntrySheet = useMemo(() => {
    // Pass { name: projectName } to allow fallback detection in getProjectTypeConfig
    const config = getProjectTypeConfig('solar', { name: projectName });
    const sheet = config.sheets.find(s => s.id === activeTab);
    return sheet ? sheet.dataEntry : false;
  }, [activeTab, projectName]);


  /**
   * Merges P6 activities with yesterday's progress values (from dpr_daily_progress).
   * Sets correct cumulative values per block before aggregation.
   * Draft/saved data overlay is handled separately by applyDraftOverlay() AFTER aggregation.
   */
  const mergeData = useCallback((baseActivities: any[], _unused: any[], yesterdayRows: any[]) => {
    if (!baseActivities) return [];

    return baseActivities.map(activity => {
      const activityId = activity.activityId || activity.activityObjectId;

      // Find yesterday's progress value by matching activityObjectId, stringActivityId, or name
      const yesterdayMatch = yesterdayRows?.find(yr =>
        (yr.activityId !== undefined && String(yr.activityId) === String(activity.activityObjectId)) ||
        (yr.stringActivityId !== undefined && String(yr.stringActivityId) === String(activityId)) ||
        (yr.name && activity.name && String(yr.name) === String(activity.name))
      );

      // The cumulative up to yesterday should prioritize the explicit dpr_daily_progress cumulative value
      // If it doesn't exist (new activity), fallback to the P6 cumulative.
      const yesterdayCumulative = yesterdayMatch?.cumulativeValue !== undefined
        ? Number(yesterdayMatch.cumulativeValue)
        : Number(activity.cumulative || activity.actualQty || activity.actual || activity.completed || 0);

      const liveCumulative = yesterdayCumulative;
      const scope = Number(activity.totalQuantity || activity.targetQty || activity.scope || 0);
      const liveBalance = scope - liveCumulative;

      return {
        ...activity,
        yesterday: yesterdayMatch ? String(yesterdayMatch.yesterdayValue || "") : (activity.yesterday || ""),
        yesterdayValue: yesterdayMatch ? String(yesterdayMatch.yesterdayValue || "") : (activity.yesterdayValue || activity.yesterday || ""),
        yesterdayIsApproved: yesterdayMatch ? yesterdayMatch.is_approved : undefined,
        cumulative: String(liveCumulative),
        balance: String(liveBalance),
        actualQty: String(liveCumulative),
        actual: String(liveCumulative),
        completed: String(liveCumulative),
      };
    });
  }, []);

  /**
   * Applies saved draft row values on top of aggregated P6 data.
   * Matches by 'description' (the aggregated activity name) since that's the key
   * used after aggregation (e.g. "Piling - MMS (Marking, Auguring & Concreting)").
   * This preserves _cellStatuses, todayValue, cumulative overrides, remarks, etc.
   */
  // Use extracted applyDraftOverlay from @/utils/draftUtils
  // Imported below or at the top of the file

  /**
   * Central Activity Update Handler - Ensures cross-tab sync.
   * Optimized with Map-based lookups and field aliasing for robust preservation.
   */
  const handleActivityUpdate = useCallback((newDataOrUpdater: any[] | ((prev: any[]) => any[])) => {
    setMasterActivities(prevMaster => {
      if (!prevMaster || prevMaster.length === 0) return prevMaster;

      let updatedRows: any[];
      if (typeof newDataOrUpdater === 'function') {
        console.warn("handleActivityUpdate received functional updater, this might be unstable.");
        return prevMaster;
      } else {
        updatedRows = newDataOrUpdater;
      }

      if (!Array.isArray(updatedRows)) return prevMaster;

      const newMaster = [...prevMaster];

      const updateById = new Map<string, any>();

      updatedRows.forEach(u => {
        if (u.isCategoryRow) return;
        const id = String(u.activityId || u.activityObjectId || '').trim();
        if (id) updateById.set(id, u);
      });

      let matchCount = 0;
      newMaster.forEach((m, idx) => {
        const mId = String(m.activityId || m.activityObjectId || '').trim();

        // ONLY update by ID to prevent "fan-out" bug. 
        // If an aggregated row is updated, we only update the proxy master activity (first in group).
        const updated = updateById.get(mId);

        if (updated) {
          // Merge updates into master activity using both standardized names and aliases
          // this ensures that various mapping functions in p6ActivityService correctly pick up changes
          const merged = { ...newMaster[idx] };

          if (updated.todayValue !== undefined) {
            merged.todayValue = updated.todayValue;
            merged.today = updated.todayValue; // Alias
          }
          if (updated.yesterdayValue !== undefined) {
            merged.yesterdayValue = updated.yesterdayValue;
            merged.yesterday = updated.yesterdayValue; // Alias
          }
          if (updated.cumulative !== undefined) {
            merged.cumulative = updated.cumulative;
            merged.actualQty = updated.cumulative; // Alias
          }
          if (updated.actual !== undefined) {
            merged.actual = updated.actual;
            merged.actualQty = updated.actual; // Alias
          }
          if (updated.completed !== undefined) {
            merged.completed = updated.completed;
            merged.cumulative = updated.completed; // Alias
          }
          if (updated.remarks !== undefined) merged.remarks = updated.remarks;
          if (updated._cellStatuses !== undefined) {
            merged._cellStatuses = { ...(merged._cellStatuses || {}), ...(updated._cellStatuses || {}) };
          }
          if (updated.uom !== undefined) {
            merged.uom = updated.uom;
            merged.unitOfMeasure = updated.uom; // Alias
          }
          if (updated.scope !== undefined) {
            merged.scope = updated.scope;
            merged.targetQty = updated.scope;
            merged.totalQuantity = updated.scope;
          }
          if (updated.totalQuantity !== undefined) {
            merged.scope = updated.totalQuantity;
            merged.targetQty = updated.totalQuantity;
            merged.totalQuantity = updated.totalQuantity;
          }
          if (updated.status !== undefined) merged.status = updated.status;

          // Solar specific metadata fields
          if (updated.priority !== undefined) merged.priority = updated.priority;
          if (updated.baselinePriority !== undefined) merged.baselinePriority = updated.baselinePriority;
          if (updated.contractorName !== undefined) merged.contractorName = updated.contractorName;
          if (updated.vendor !== undefined) merged.vendor = updated.vendor;
          if (updated.vendorName !== undefined) merged.vendorName = updated.vendorName;
          if (updated.plot !== undefined) merged.plot = updated.plot;
          if (updated.newBlockNom !== undefined) merged.newBlockNom = updated.newBlockNom;
          if (updated.block !== undefined) merged.block = updated.block;
          if (updated.holdDueToWtg !== undefined) merged.holdDueToWtg = updated.holdDueToWtg;
          if (updated.front !== undefined) merged.front = updated.front;

          if (updated.actualStart !== undefined) {
            merged.actualStart = updated.actualStart;
            merged.actualStartDate = updated.actualStart; // Alias
          }
          if (updated.actualFinish !== undefined) {
            merged.actualFinish = updated.actualFinish;
            merged.actualFinishDate = updated.actualFinish; // Alias
          }
          if (updated.forecastStart !== undefined) {
            merged.forecastStart = updated.forecastStart;
            merged.forecastStartDate = updated.forecastStart; // Alias
          }
          if (updated.forecastFinish !== undefined) {
            merged.forecastFinish = updated.forecastFinish;
            merged.forecastFinishDate = updated.forecastFinish; // Alias
          }
          if (updated.yesterdayValue !== undefined) {
            merged.yesterdayValue = updated.yesterdayValue;
            merged.yesterday = updated.yesterdayValue; // Alias
          }
          if (updated.selectedResourceId !== undefined) merged.selectedResourceId = updated.selectedResourceId;
          if (updated.resourceId !== undefined) merged.resourceId = updated.resourceId;

          // Preserve any other fields that might have been edited in the table
          // but aren't in our core sync list
          const coreFields = ['todayValue', 'cumulative', 'actual', 'completed', 'remarks', '_cellStatuses', 'uom', 'status', 'actualStart', 'actualFinish', 'forecastStart', 'forecastFinish', 'yesterdayValue', 'selectedResourceId', 'resourceId', 'scope', 'targetQty', 'totalQuantity'];
          Object.keys(updated).forEach(key => {
            if (!coreFields.includes(key) && !key.startsWith('_') && !['isCategoryRow', 'activityId', 'description', 'activities'].includes(key)) {
              merged[key] = updated[key];
            }
          });

          newMaster[idx] = merged;
          matchCount++;
        }
      });

      console.log(`Synced ${updatedRows.length} rows to ${matchCount} master activities.`);
      return newMaster;
    });
  }, []);

  const lastTargetYesterdayRef = useRef<string | null>(null);



  const updateTableData = useCallback(async (baseActivities: any[]) => {
    if (!baseActivities || baseActivities.length === 0) return;

    setLoading(true);
    try {
      // Fetch yesterday values for ALL sheets so masterActivities is fully populated
      const yesterdayData = await getYesterdayValues(projectId, targetYesterday, undefined);
      const yesterdayRows = (yesterdayData?.activities || []).map(roundP6Metrics);
      const roundedBaseActivities = baseActivities.map(roundP6Metrics);

      // Fetch drafts for all data entry sheets concurrently so the entire project state is overlayed
      const draftTypes = ['dc_sheet', 'ac_sheet', 'dp_qty', 'testing_commissioning'];
      const promises = draftTypes.map(t => getDraftEntry(projectId, t, targetDate).catch(() => null));
      const drafts = await Promise.all(promises);

      let draftRows: any[] = [];
      drafts.forEach(d => {
        if (d && d.data_json) {
          const data = typeof d.data_json === 'string' ? JSON.parse(d.data_json) : d.data_json;
          if (data.rows && Array.isArray(data.rows)) {
            draftRows = [...draftRows, ...data.rows];
          }
        }
      });

      setMasterActivities(prev => {
        // Step 1: Use existing master activities or initialize from baseline
        // Force rebuild if the target date has changed so we get the new yesterday rows!
        const dateChanged = lastTargetYesterdayRef.current !== targetYesterday;
        let merged = (prev && prev.length > 0 && !dateChanged)
          ? [...prev]
          : mergeData(roundedBaseActivities, [], yesterdayRows);

        lastTargetYesterdayRef.current = targetYesterday;

        // Step 2: Overlay draft/saved data onto flat activities ONLY if we rebuilt from scratch.
        // If we kept `prev` (date didn't change), we MUST NOT overlay the server draft again, 
        // because that would overwrite any unsaved local edits the user made in the UI!
        if (!prev || prev.length === 0 || dateChanged) {
          if (draftRows.length > 0) {
            merged = applyDraftOverlay(merged, draftRows);
          }
        }

        // Force rounding again to catch any unrounded values introduced by drafts
        return merged.map(roundP6Metrics);
      });
    } catch (err) {
      console.error("Error updating table data:", err);
    } finally {
      setLoading(false);
    }
  }, [projectId, targetYesterday, activeTab, currentDraftEntry, mergeData, applyDraftOverlay]);

  const [lastAppliedDraftId, setLastAppliedDraftId] = useState<number | null>(null);
  const [lastTabLoaded, setLastTabLoaded] = useState<string>("");

  useEffect(() => {
    const shouldUpdate =
      masterActivities.length === 0 ||
      lastTabLoaded !== activeTab ||
      (currentDraftEntry && currentDraftEntry.id !== lastAppliedDraftId);

    if (passedActivities && passedActivities.length > 0 && shouldUpdate) {
      updateTableData(passedActivities);
      setLastTabLoaded(activeTab);
      if (currentDraftEntry) {
        setLastAppliedDraftId(currentDraftEntry.id);
      }
    }
  }, [passedActivities, updateTableData, activeTab, currentDraftEntry, lastTabLoaded, lastAppliedDraftId]);

  // Fetch Manpower Data
  useEffect(() => {
    const fetchManpower = async () => {
      // Fetch for both details view and summary calculation
      if ((activeTab === 'manpower_details' || activeTab === 'summary') && projectId) {
        try {
          const rawManpower = await getManpowerDetailsData(projectId);
          const mappedManpower = rawManpower.map((m: any) => ({
            ...roundP6Metrics(m),
            block: extractBlockName(m.description || m.activity || '') || m.block
          }));
          let aggregated = aggregateManpowerByActivityName(mappedManpower);

          // Always fetch the manpower_details draft independently.
          // We cannot rely on `currentDraftEntry` because it tracks the ACTIVE tab's draft,
          // which may be 'summary' or another sheet type when this effect runs.
          let manpowerDraft = currentDraftEntry?.sheet_type === 'manpower_details'
            ? currentDraftEntry
            : null;

          if (!manpowerDraft) {
            try {
              manpowerDraft = await getDraftEntry(projectId, 'manpower_details', targetDate);
            } catch { /* no draft exists yet — that's fine */ }
          }

          if (manpowerDraft?.data_json) {
            const draftData = typeof manpowerDraft.data_json === 'string'
              ? JSON.parse(manpowerDraft.data_json)
              : manpowerDraft.data_json;

            if (draftData.rows) {
              aggregated = applyDraftOverlay(aggregated, draftData.rows);
              if (draftData.totalManpower !== undefined) {
                // @ts-ignore - setTotalManpower exists in component scope
                setTotalManpower(draftData.totalManpower);
              }
            }
          }
          setManpowerDetailsData(aggregated.map(roundP6Metrics));
        } catch (error) {
          console.error("Error fetching manpower:", error);
        }
      }
    };
    fetchManpower();
  }, [projectId, targetDate, activeTab, currentDraftEntry, applyDraftOverlay]);

  // Fetch Timephased Manpower Data
  useEffect(() => {
    const fetchTimephased = async () => {
      if (activeTab === 'manpower_details_2' && projectId) {
        try {
          const rawData = await getManpowerTimephasedData(projectId, targetDate);

          if (!rawData || !Array.isArray(rawData)) {
            setManpowerTimephasedData([]);
            return;
          }

          // Map blocks but keep the original description intact for sub-rows so block prefix shows
          const mappedTimephased = rawData.map((m: any) => ({
            ...roundP6Metrics(m),
            block: extractBlockName(m.description || m.activityId || '') || m.block,
            // DO NOT OVERRIDE description with extractActivityName; let the aggregate func handle headers
          }));

          // Apply the #FADFAD grouping wrapper
          let aggregated = aggregateManpowerByActivityName(mappedTimephased);

          // Fetch manpower_details_2 draft independently
          let timephasedDraft = currentDraftEntry?.sheet_type === 'manpower_details_2'
            ? currentDraftEntry
            : null;

          if (!timephasedDraft) {
            try {
              timephasedDraft = await getDraftEntry(projectId, 'manpower_details_2', targetDate);
            } catch { /* no draft exists yet */ }
          }

          if (timephasedDraft?.data_json) {
            const draftData = typeof timephasedDraft.data_json === 'string'
              ? JSON.parse(timephasedDraft.data_json)
              : timephasedDraft.data_json;

            if (draftData.rows) {
              aggregated = applyDraftOverlay(aggregated, draftData.rows);
            }
          }
          setManpowerTimephasedData(aggregated.map(roundP6Metrics));
        } catch (error) {
          console.error("Error fetching timephased manpower:", error);
        }
      }
    };
    fetchTimephased();
  }, [projectId, activeTab, targetDate]);

  // Derive merged dailyHistory for Labour Days by overlaying timephased Available values
  const mergedManpowerHistory = useMemo(() => {
    const base = dailyHistoryMap['manpower_details'] || {};
    if (!manpowerTimephasedData || manpowerTimephasedData.length === 0) return base;

    // Deep-clone the base so we don't mutate the original
    const merged: Record<string, Record<string, number>> = {};
    Object.keys(base).forEach(actId => {
      merged[actId] = { ...base[actId] };
    });

    // Overlay timephased actual_ values
    manpowerTimephasedData.forEach(row => {
      if (row.isCategoryRow) return;
      const id = String(row.activityId || row.activityObjectId || '').trim();
      if (!id) return;
      if (!merged[id]) merged[id] = {};
      Object.keys(row).forEach(k => {
        if (k.startsWith('actual_')) {
          const dateSuffix = k.replace('actual_', '');
          const val = row[k];
          if (val !== undefined && val !== null && val !== '') {
            merged[id][dateSuffix] = val;
          }
        }
      });
    });
    return merged;
  }, [dailyHistoryMap, manpowerTimephasedData]);

  // Fetch Resources
  useEffect(() => {
    const fetchResources = async () => {
      if (activeTab === 'resource' && projectId) {
        try {
          const resources = await getResources(projectId);
          setResourceData(mapResourcesToTable(resources));
        } catch (error) {
          toast.error("Failed to load resources");
        }
      }
    };
    fetchResources();
  }, [activeTab, projectId]);








  const autoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (isEntryReadOnly || !masterActivities || masterActivities.length === 0) return;

    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
    }

    autoSaveTimeoutRef.current = setTimeout(() => {
      handleSaveEntry(true);
    }, 2000);

    return () => {
      if (autoSaveTimeoutRef.current) clearTimeout(autoSaveTimeoutRef.current);
    };
  }, [masterActivities, manpowerDetailsData, manpowerTimephasedData, resourceData, isEntryReadOnly]);

  const handleSaveEntry = async (isAutoSave: boolean = false) => {
    if (!currentDraftEntry || !masterActivities) return;

    try {
      // Find all activities across the entire project that have unsaved changes
      const getDeltaRows = (rows: any[]) => {
        if (!rows || !Array.isArray(rows)) return [];
        return rows.filter((row: any) => {
          if (row.isCategoryRow) return false;

          // Count rows that have metadata (explicit edits)
          const hasMetadata = row._cellStatuses && Object.keys(row._cellStatuses).length > 0;

          // For sheets that don't use _cellStatuses (like manpower_details),
          // consider the row a delta if it has a non-zero value for today, yesterday, or history
          const hasValues = (parseFloat(row.todayValue) > 0) ||
            (parseFloat(row.yesterdayValue) > 0) ||
            (row.historyValues && Object.values(row.historyValues).some((v: any) => parseFloat(v) > 0)) ||
            Object.keys(row).some(k => k.startsWith('actual_') && parseFloat(row[k]) > 0);

          return !!hasMetadata || hasValues;
        });
      };

      let currentData: any[] = [];
      switch (activeTab) {
        case 'dc_sheet':
        case 'ac_sheet':
        case 'dp_qty':
        case 'testing_commissioning':
          currentData = masterActivities;
          break;
        case 'manpower_details':
          currentData = manpowerDetailsData;
          break;
        case 'manpower_details_2':
          currentData = manpowerTimephasedData;
          break;
        case 'machinery_details':
          currentData = resourceData;
          break;
        default:
          return;
      }

      const allDeltaRows = getDeltaRows(currentData);

      if (allDeltaRows.length === 0) {
        if (!isAutoSave) toast.warning("No new changes detected. Entry is up to date.");
        return;
      }

      // Debug logging for manpower save diagnostics
      if (activeTab === 'manpower_details' || activeTab === 'manpower_details_2') {
        if (allDeltaRows.length > 0) {
          console.log('[SaveEntry] Manpower delta rows:', allDeltaRows.map(r => ({
            activityId: r.activityId,
            todayValue: r.todayValue,
            yesterdayValue: r.yesterdayValue,
            historyValues: r.historyValues,
            actualKeys: Object.keys(r).filter(k => k.startsWith('actual_')).map(k => `${k}=${r[k]}`),
            _cellStatuses: r._cellStatuses
          })));
        }
      }

      let dataToSave: any = { rows: allDeltaRows };

      // Add metadata before saving (single save instead of double save)
      dataToSave.staticHeader = {
        projectInfo: projectName,
        reportingDate: targetDate,
        progressDate: targetYesterday
      };
      
      if (activeTab === 'manpower_details') {
        dataToSave.totalManpower = totalManpower;
      }

      await saveDraftEntry(currentDraftEntry.id, dataToSave, true);
      if (!isAutoSave) {
        toast.success(`Saved changes: ${allDeltaRows.length} rows updated.`);
        // Refresh global state so UI reflects saved changes across the dashboard
        const updatedDraft = await getDraftEntry(projectId, activeTab, targetDate);
        if (updatedDraft) {
          onDraftUpdate(updatedDraft);
        }
      }
    } catch (error) {
      console.error('handleSaveEntry error:', error);
      toast.error("Failed to save entry");
    }
  };

  const handleSubmitEntry = async () => {
    if (!currentDraftEntry) {
      toast.error("No entry found to submit");
      return;
    }

    // SAFETY CHECK: Ensure the draft entry matches the active tab.
    // This prevents a race condition where tab-switching overwrites currentDraftEntry
    // with a different sheet's entry, causing the wrong sheet to be submitted.
    if (currentDraftEntry.sheet_type && currentDraftEntry.sheet_type !== activeTab) {
      console.error('[SubmitEntry] SHEET TYPE MISMATCH!', {
        entrySheetType: currentDraftEntry.sheet_type,
        activeTab,
        entryId: currentDraftEntry.id
      });
      toast.error(`Sheet mismatch detected (expected "${activeTab}" but got "${currentDraftEntry.sheet_type}"). Refreshing...`);
      // Re-fetch the correct draft for the current tab
      const correctDraft = await getDraftEntry(projectId, activeTab, targetDate);
      if (correctDraft) onDraftUpdate(correctDraft);
      return;
    }

    try {
      console.log('[SubmitEntry] Starting submit for:', {
        entryId: currentDraftEntry.id,
        sheetType: currentDraftEntry.sheet_type,
        status: currentDraftEntry.status,
        activeTab
      });
      await handleSaveEntry(true); // Save first before submitting
      console.log('[SubmitEntry] Save done, now submitting entry id:', currentDraftEntry.id);
      // Pass activeTab as sheetType for backend validation
      const response = await submitEntry(currentDraftEntry.id, "Submitted from Sheet", activeTab);
      console.log('[SubmitEntry] Submit response:', response);
      toast.success(response.message || "Entry submitted successfully!");

      const updatedDraft = await getDraftEntry(projectId, activeTab, targetDate);
      if (updatedDraft) {
        onDraftUpdate(updatedDraft);
      }
    } catch (error: any) {
      console.error('handleSubmitEntry error:', error);
      toast.error(error.message || "Failed to submit entry");
    }
  };




  const handlePushToP6 = async () => {
    if (!currentDraftEntry) return;
    try {
      const resp = await pushEntryToP6(currentDraftEntry.id);
      if (resp.message) {
        toast.success(resp.message);
        // Refresh draft to see updated pushed_at time
        const updatedDraft = await getDraftEntry(projectId, activeTab, targetDate);
        if (updatedDraft) onDraftUpdate(updatedDraft);
      }
    } catch (error: any) {
      toast.error(error?.response?.data?.detail || error?.message || "P6 Push failed");
    }
  };

  const filterByStatus = (rows: any[]): any[] => {
    if (selectedStatus === 'ALL' || !selectedStatus || !Array.isArray(rows)) return rows;
    return rows.filter(r => {
      const s = r.status || 'Not Started';
      if (selectedStatus === 'COMPLETED') return s === 'Completed' || s === 'Complete';
      if (selectedStatus === 'IN_PROGRESS') return s === 'In Progress' || s === 'InProgress';
      if (selectedStatus === 'NOT_STARTED') return s === 'Not Started';
      return false;
    });
  };

  const renderActiveTable = () => {
    const entryStatus = currentDraftEntry?.status || 'draft';
    const isRejected = currentDraftEntry?.isRejected;
    const rejectionReason = currentDraftEntry?.rejectionReason;

    const RejectedAlert = () => isRejected && rejectionReason ? (
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

    const userRoleLower = (user?.role || user?.Role || '').toLowerCase();
    const canPush = userRoleLower === 'site pm' || userRoleLower === 'super admin';

    switch (activeTab) {
      case 'summary':
        return (
          <DPRSummarySection
            p6Activities={passedActivities}
            dpQtyData={dpQtyData}
            ACSheetData={ACSheetData}
            DCSheetData={DCSheetData}
            manpowerDetailsData={manpowerDetailsData}
            resourceData={resourceData}
            selectedBlock={selectedBlock}
            universalFilter={universalFilter}
            projectName={projectName}
            projectDetails={projectDetails}
            yesterday={targetYesterday}
          />
        );
      case 'dp_qty':
        return (
          <>
            <RejectedAlert />
            <DPQtyTable
              data={filterByStatus(dpQtyData)}
              setData={handleActivityUpdate as any}
              onSave={(isEntryReadOnly || !isDataEntrySheet) ? undefined : handleSaveEntry}
              onSubmit={(isEntryReadOnly || !isDataEntrySheet) ? undefined : handleSubmitEntry}
              onPush={canPush ? handlePushToP6 : undefined}

              yesterday={targetYesterday}
              today={targetDate}
              dataDate={projectDetails?.p6_data_date}
              isLocked={isEntryReadOnly}
              status={entryStatus}
              universalFilter={universalFilter}
              projectId={projectId}
              selectedBlock={selectedBlock}
              dailyHistory={dailyHistoryMap['dp_qty'] || {}}
              customActivities={customActivitiesMap['dp_qty'] || []}
              onAddCustomActivity={handleAddCustomActivity}
              onEditCustomActivity={handleEditCustomActivity}
              onDeleteCustomActivity={(id) => handleDeleteCustomActivity(id, 'dp_qty')}
              onBulkUploadActivities={() => { setBulkUploadSheetType('dp_qty'); setIsBulkUploadModalOpen(true); }}
            />
          </>
        );
      case 'ac_sheet':
        return (
          <>
            <RejectedAlert />
            <ACSheetTable
              data={filterByStatus(ACSheetData)}
              setData={handleActivityUpdate as any}
              onSave={(isEntryReadOnly || !isDataEntrySheet) ? undefined : handleSaveEntry}
              onSubmit={(isEntryReadOnly || !isDataEntrySheet) ? undefined : handleSubmitEntry}
              onPush={canPush ? handlePushToP6 : undefined}

              yesterday={targetYesterday}
              today={targetDate}
              dataDate={projectDetails?.p6_data_date}
              isLocked={isEntryReadOnly}
              status={entryStatus}
              projectName={projectName}
              universalFilter={universalFilter}
              projectId={projectId}
              selectedBlock={selectedBlock}
              resourcesByActivity={resourcesByActivity}
              dailyHistory={dailyHistoryMap['ac_sheet'] || {}}
              customActivities={customActivitiesMap['ac_sheet'] || []}
              onAddCustomActivity={handleAddCustomActivity}
              onEditCustomActivity={handleEditCustomActivity}
              onDeleteCustomActivity={(id) => handleDeleteCustomActivity(id, 'ac_sheet')}
              onBulkUploadActivities={() => { setBulkUploadSheetType('ac_sheet'); setIsBulkUploadModalOpen(true); }}
            />
          </>
        );
      case 'manpower_details':
        return (
          <>
            <RejectedAlert />
            <ManpowerDetailsTable
              data={filterByStatus(manpowerDetailsData)}
              setData={setManpowerDetailsData}
              selectedBlock={selectedBlock}
              totalManpower={totalManpower}
              setTotalManpower={setTotalManpower}
              onSave={(isEntryReadOnly || !isDataEntrySheet) ? undefined : handleSaveEntry}
              onSubmit={(isEntryReadOnly || !isDataEntrySheet) ? undefined : handleSubmitEntry}
              onPush={canPush ? handlePushToP6 : undefined}

              yesterday={targetYesterday}
              today={targetDate}
              isLocked={isEntryReadOnly}
              status={entryStatus}
              universalFilter={universalFilter}
              projectId={projectId}
              dailyHistory={mergedManpowerHistory}
              customActivities={customActivitiesMap['manpower_details'] || []}
              onAddCustomActivity={handleAddCustomActivity}
              onEditCustomActivity={handleEditCustomActivity}
              onDeleteCustomActivity={(id) => handleDeleteCustomActivity(id, 'manpower_details')}
              onBulkUploadActivities={() => { setBulkUploadSheetType('manpower_details'); setIsBulkUploadModalOpen(true); }}
            />
          </>
        );
      case 'manpower_details_2':
        return (
          <>
            <RejectedAlert />
            <ManpowerTimephasedTable
              data={manpowerTimephasedData}
              setData={setManpowerTimephasedData}
              selectedBlock={selectedBlock}
              onSave={(isEntryReadOnly || !isDataEntrySheet) ? undefined : handleSaveEntry}
              onSubmit={(isEntryReadOnly || !isDataEntrySheet) ? undefined : handleSubmitEntry}
              onPush={canPush ? handlePushToP6 : undefined}

              yesterday={targetYesterday}
              today={targetDate}
              isLocked={isEntryReadOnly}
              status={entryStatus}
              universalFilter={universalFilter}
              projectId={projectId}
              userRole={user?.role || user?.Role}
            />
          </>
        );
      case 'dc_sheet':
        return (
          <>
            <RejectedAlert />
            <DCSheetTable
              data={filterByStatus(DCSheetData)}
              setData={handleActivityUpdate as any}
              onSave={(isEntryReadOnly || !isDataEntrySheet) ? undefined : handleSaveEntry}
              onSubmit={(isEntryReadOnly || !isDataEntrySheet) ? undefined : handleSubmitEntry}
              onPush={canPush ? handlePushToP6 : undefined}

              yesterday={targetYesterday}
              today={targetDate}
              dataDate={projectDetails?.p6_data_date}
              isLocked={isEntryReadOnly}
              status={entryStatus}
              universalFilter={universalFilter}
              projectId={projectId}
              selectedBlock={selectedBlock}
              resourcesByActivity={resourcesByActivity}
              dailyHistory={dailyHistoryMap['dc_sheet'] || {}}
              customActivities={customActivitiesMap['dc_sheet'] || []}
              onAddCustomActivity={handleAddCustomActivity}
              onEditCustomActivity={handleEditCustomActivity}
              onDeleteCustomActivity={(id) => handleDeleteCustomActivity(id, 'dc_sheet')}
              onBulkUploadActivities={() => { setBulkUploadSheetType('dc_sheet'); setIsBulkUploadModalOpen(true); }}
            />
          </>
        );
      case 'testing_commissioning':
        return (
          <>
            <RejectedAlert />
            <TestingCommTable
              data={filterByStatus(testingCommData)}
              setData={handleActivityUpdate as any}
              onSave={(isEntryReadOnly || !isDataEntrySheet) ? undefined : handleSaveEntry}
              onSubmit={(isEntryReadOnly || !isDataEntrySheet) ? undefined : handleSubmitEntry}
              onPush={canPush ? handlePushToP6 : undefined}

              yesterday={targetYesterday}
              today={targetDate}
              dataDate={projectDetails?.p6_data_date}
              isLocked={isEntryReadOnly}
              status={entryStatus}
              projectName={projectName}
              universalFilter={universalFilter}
              projectId={projectId}
              selectedBlock={selectedBlock}
              dailyHistory={dailyHistoryMap['testing_commissioning'] || {}}
              customActivities={customActivitiesMap['testing_commissioning'] || []}
              onAddCustomActivity={handleAddCustomActivity}
              onEditCustomActivity={handleEditCustomActivity}
              onDeleteCustomActivity={(id) => handleDeleteCustomActivity(id, 'testing_commissioning')}
              onBulkUploadActivities={() => { setBulkUploadSheetType('testing_commissioning'); setIsBulkUploadModalOpen(true); }}
            />
          </>
        );
      case 'resource':
        return (
          <ResourceTable
            data={resourceData}
            setData={setResourceData}
            today={targetDate}
            isLocked={isEntryReadOnly}
            status={entryStatus}
            onSave={(isEntryReadOnly || !isDataEntrySheet) ? undefined : handleSaveEntry}
            onSubmit={(isEntryReadOnly || !isDataEntrySheet) ? undefined : handleSubmitEntry}
            onPush={canPush ? handlePushToP6 : undefined}
          />
        );
      case 'switchyard':
      case 'transmission_line':
      case 'infra_works':
        const dataMap: Record<string, any[]> = {
          'switchyard': switchyardData,
          'transmission_line': transmissionLineData,
          'infra_works': infraWorksData
        };
        return (
          <>
            <RejectedAlert />
            <ACSheetTable
              data={dataMap[activeTab]}
              setData={handleActivityUpdate as any}
              onSave={(isEntryReadOnly || !isDataEntrySheet) ? undefined : handleSaveEntry}
              onSubmit={(isEntryReadOnly || !isDataEntrySheet) ? undefined : handleSubmitEntry}
              onPush={canPush ? handlePushToP6 : undefined}

              yesterday={targetYesterday}
              today={targetDate}
              dataDate={projectDetails?.p6_data_date}
              isLocked={isEntryReadOnly}
              status={entryStatus}
              projectName={projectName}
              universalFilter={universalFilter}
              projectId={projectId}
              selectedBlock={selectedBlock}
              customActivities={customActivitiesMap[activeTab] || []}
              onAddCustomActivity={handleAddCustomActivity}
              onEditCustomActivity={handleEditCustomActivity}
              onDeleteCustomActivity={(id) => handleDeleteCustomActivity(id, activeTab)}
              onBulkUploadActivities={() => { setBulkUploadSheetType(activeTab); setIsBulkUploadModalOpen(true); }}
            />
          </>
        );
      default:
        return null;
    }
  };

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex-1 min-h-0 flex flex-col">
        {loading && !passedActivities?.length ? (
          <div className="flex flex-col items-center justify-center p-12">
            <RefreshCw className="w-12 h-12 text-blue-500 animate-spin mb-4" />
            <p className="text-muted-foreground">Loading Solar activities...</p>
          </div>
        ) : (
          renderActiveTable()
        )}

        {isDroneModalOpen && onCloseDroneModal && (
          <DroneVerificationModal
            isOpen={isDroneModalOpen}
            onClose={onCloseDroneModal}
            projectId={projectId}
            reportDate={targetDate}
            dprRows={dpQtyData}
          />
        )}

        <BulkUploadActivitiesModal
          isOpen={isBulkUploadModalOpen}
          onClose={() => setIsBulkUploadModalOpen(false)}
          onUpload={handleBulkUploadSuccess}
          sheetType={bulkUploadSheetType}
          templateColumns={getUIColumnsForSheet(bulkUploadSheetType)?.columns}
          templateColumnWidths={getUIColumnsForSheet(bulkUploadSheetType)?.columnWidths}
        />
      </div>
    </div>
  );
};


