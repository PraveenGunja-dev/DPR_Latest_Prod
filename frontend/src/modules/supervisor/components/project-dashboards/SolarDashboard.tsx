import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { Plus, Download, Upload, AlertCircle, RefreshCw, Package, FileSpreadsheet } from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
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
import {   saveDraftEntry, 
  submitEntry, 
  getDraftEntry,
  pushEntryToP6 
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
  projectDetails
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
  const navigate = useNavigate();

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

  // DERIVED STATES - These automatically update whenever masterActivities change
  const dpQtyData = useMemo(() => aggregateDPQtyByActivityName(mapActivitiesToDPQty(masterActivities)), [masterActivities]);
  const ACSheetData = useMemo(() => aggregateVendorBlockByActivityName(mapActivitiesToACSheet(masterActivities)), [masterActivities]);
  const DCSheetData = useMemo(() => aggregateVendorIdtByActivityName(mapActivitiesToDCSheet(masterActivities)), [masterActivities]);
  const testingCommData = useMemo(() => aggregateTestingCommByActivityName(mapActivitiesToTestingComm(masterActivities)), [masterActivities]);
  
  // Rajasthan WBS hierarchy-based sheets â€” pass wbsTree for proper subtree filtering
  const switchyardData = useMemo(() => aggregateByWbsName(mapActivitiesToWbsSheet(masterActivities, SWITCHYARD_WBS_PATTERNS, wbsTree)), [masterActivities, wbsTree]);
  const transmissionLineData = useMemo(() => aggregateByWbsName(mapActivitiesToWbsSheet(masterActivities, TRANS_LINE_WBS_PATTERNS, wbsTree)), [masterActivities, wbsTree]);
  const infraWorksData = useMemo(() => aggregateByWbsName(mapActivitiesToWbsSheet(masterActivities, INFRA_WORKS_WBS_PATTERNS, wbsTree)), [masterActivities, wbsTree]);

  
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
  const applyDraftOverlay = useCallback((rows: any[], draftRows: any[]) => {
    if (!draftRows || draftRows.length === 0) return rows;
    
    // Build a lookup map from draft rows keyed by description and activityId
    const draftByDesc = new Map<string, any>();
    const draftByActId = new Map<string, any>();
    for (const dr of draftRows) {
      if (dr.description) draftByDesc.set(String(dr.description).trim(), dr);
      if (dr.activities) draftByDesc.set(String(dr.activities).trim(), dr);
      if (dr.activityId) draftByActId.set(String(dr.activityId).trim(), dr);
    }
    
    return rows.map(row => {
      const rId = String(row.activityId || row.activityObjectId || '').trim();
      const rName = String(row.name || row.description || row.activities || '').trim();
      
      // Strict ID-first matching to prevent "fan-out" (one draft row affecting multiple blocks by name)
      const match = draftByActId.get(rId) || (rId ? null : draftByDesc.get(rName));
      if (!match) return row;
      
      const merged = { ...row };
      
      // DEBUG LOG
      if (match.todayValue !== undefined) {
        console.log(`[DPR Debug] overlaying draft onto ${rId}: match.todayValue='${match.todayValue}'`);
      }

      // Sync today progress + aliases
      if (match.todayValue !== undefined && match.todayValue !== '') {
        merged.todayValue = match.todayValue;
        merged.today = match.todayValue; 
      }
      
      // Sync yesterday progress + aliases
      if (match.yesterdayValue !== undefined && match.yesterdayValue !== '') {
        merged.yesterdayValue = match.yesterdayValue;
        merged.yesterday = match.yesterdayValue;
      }
      
      // Sync cumulative + aliases
      if (match.cumulative !== undefined && match.cumulative !== '') {
        merged.cumulative = match.cumulative;
        merged.actualQty = match.cumulative;
      }
      
      // Sync actual + aliases (vendor block style)
      if (match.actual !== undefined && match.actual !== '') {
        merged.actual = match.actual;
        merged.actualQty = match.actual;
      }
      
      if (match.completed !== undefined && match.completed !== '') {
        merged.completed = match.completed;
        merged.cumulative = match.completed;
      }

      // Preserve Scope from draft if the user manually edited it
      if (match.scope !== undefined && match.scope !== '') {
        merged.scope = match.scope;
        merged.targetQty = match.scope;
        merged.totalQuantity = match.scope;
      } else if (match.totalQuantity !== undefined && match.totalQuantity !== '') {
        merged.scope = match.totalQuantity;
        merged.targetQty = match.totalQuantity;
        merged.totalQuantity = match.totalQuantity;
      }

      // Recalculate balance for master activity consistency
      const scope = Number(merged.totalQuantity || merged.scope || 0);
      const cumVal = Number(merged.cumulative || 0);
      const todayVal = Number(merged.todayValue || 0);
      merged.balance = String(scope - cumVal - todayVal);
      
      // Preserve _cellStatuses (edit highlights, rejection markers)
      if (match._cellStatuses && Object.keys(match._cellStatuses).length > 0) {
        merged._cellStatuses = { ...(merged._cellStatuses || {}), ...(match._cellStatuses || {}) };
      }

      // Cleanup: If the draft row only had metadata for dates that were never actually changed 
      // (likely from the old hasDateOverrides bug), remove those bits of metadata.
      if (merged._cellStatuses) {
          const statusKeys = Object.keys(merged._cellStatuses);
          const isDateOnlyEdit = statusKeys.every(k => 
              k.toLowerCase().includes('start') || k.toLowerCase().includes('finish') || k.toLowerCase().includes('date')
          );
          
          if (isDateOnlyEdit && !merged.todayValue && !merged.remarks) {
              // Be very strict: only clean if the current values match the P6 baseline exactly
              // Note: actualStart is usually the property, while Column Label might be "Actual Start"
              const datesMatched = (merged.actualStart === row.actualStart) && 
                                  (merged.actualFinish === row.actualFinish) &&
                                  (merged.forecastStart === row.forecastStart) &&
                                  (merged.forecastFinish === row.forecastFinish);
              
              if (datesMatched) {
                  delete merged._cellStatuses;
              }
          }
      }
      
      if (match.remarks) merged.remarks = match.remarks;
      if (match.actualStart) { merged.actualStart = match.actualStart; merged.actualStartDate = match.actualStart; }
      if (match.actualFinish) { merged.actualFinish = match.actualFinish; merged.actualFinishDate = match.actualFinish; }
      if (match.forecastStart) { merged.forecastStart = match.forecastStart; merged.forecastStartDate = match.forecastStart; }
      if (match.forecastFinish) { merged.forecastFinish = match.forecastFinish; merged.forecastFinishDate = match.forecastFinish; }
      if (match.uom) { merged.uom = match.uom; merged.unitOfMeasure = match.uom; }
      if (match.status) merged.status = match.status;
      if (match.selectedResourceId !== undefined) merged.selectedResourceId = match.selectedResourceId;
      if (match.resourceId !== undefined) merged.resourceId = match.resourceId; // Some tables might use this instead
      
      return merged;
    });
  }, []);

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
      const yesterdayRows = yesterdayData?.activities || [];
      
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
          : mergeData(baseActivities, [], yesterdayRows);
        
        lastTargetYesterdayRef.current = targetYesterday;
        
        // Step 2: Overlay draft/saved data onto flat activities ONLY if we rebuilt from scratch.
        // If we kept `prev` (date didn't change), we MUST NOT overlay the server draft again, 
        // because that would overwrite any unsaved local edits the user made in the UI!
        if (!prev || prev.length === 0 || dateChanged) {
            if (draftRows.length > 0) {
              merged = applyDraftOverlay(merged, draftRows);
            }
        }
        return merged;
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
            ...m,
            block: extractBlockName(m.description || m.activity || '') || m.block
          }));
          let aggregated = aggregateManpowerByActivityName(mappedManpower);
          const draftData = typeof currentDraftEntry?.data_json === 'string' 
            ? JSON.parse(currentDraftEntry.data_json) 
            : (currentDraftEntry?.data_json || {});
            
          if (draftData.rows && currentDraftEntry?.sheet_type === 'manpower_details') {
             aggregated = applyDraftOverlay(aggregated, draftData.rows);
             if (draftData.totalManpower !== undefined) {
                 // @ts-ignore - setTotalManpower exists in component scope
                 setTotalManpower(draftData.totalManpower);
             }
          }
          setManpowerDetailsData(aggregated);
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
            ...m,
            block: extractBlockName(m.description || m.activityId || '') || m.block,
            // DO NOT OVERRIDE description with extractActivityName; let the aggregate func handle headers
          }));
          
          // Apply the #FADFAD grouping wrapper
          let aggregated = aggregateManpowerByActivityName(mappedTimephased);
          
          const draftData = typeof currentDraftEntry?.data_json === 'string' 
            ? JSON.parse(currentDraftEntry.data_json) 
            : (currentDraftEntry?.data_json || {});
            
          if (draftData.rows && currentDraftEntry?.sheet_type === 'manpower_details_2') {
             aggregated = applyDraftOverlay(aggregated, draftData.rows);
          }
          setManpowerTimephasedData(aggregated);
        } catch (error) {
          console.error("Error fetching timephased manpower:", error);
        }
      }
    };
    fetchTimephased();
  }, [projectId, activeTab, targetDate]);

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
          return !!hasMetadata;
        });
      };

      const deltaActivities = getDeltaRows(masterActivities);
      const deltaManpower = getDeltaRows(manpowerDetailsData);
      const deltaManpower2 = getDeltaRows(manpowerTimephasedData);
      const deltaResources = getDeltaRows(resourceData);

      console.log("Save Diagnostics:", {
        activities: deltaActivities.map(a => ({ id: a.activityId, status: a._cellStatuses })),
        manpower: deltaManpower.map(m => ({ id: m.activityId, status: m._cellStatuses })),
        manpower2: deltaManpower2.map(m => ({ id: m.activityId, status: m._cellStatuses })),
        resources: deltaResources.map(r => ({ type: r.typeOfMachine, status: r._cellStatuses }))
      });

      if (deltaActivities.length === 0 && deltaManpower.length === 0 && deltaManpower2.length === 0 && deltaResources.length === 0) {
        if (!isAutoSave) toast.warning("No new changes detected. Entry is up to date.");
        return;
      }

      // Merge all modified rows into one flat list for saving (backend expects a 'rows' array)
      const allDeltaRows = [...deltaActivities, ...deltaManpower, ...deltaManpower2, ...deltaResources];

      let dataToSave: any = { rows: allDeltaRows };
      
      await saveDraftEntry(currentDraftEntry.id, dataToSave, true);
      
      if (!isAutoSave) {
        toast.success(
          `Saved changes: ${deltaActivities.length} activities, ` +
          `${deltaManpower.length} manpower rows, ${deltaResources.length} resources.`
        );
      }

      if (activeTab === 'dp_qty') {
        dataToSave.staticHeader = {
          projectInfo: projectName,
          reportingDate: targetDate,
          progressDate: targetYesterday
        };
      } else if (activeTab === 'manpower_details') {
        dataToSave.totalManpower = totalManpower;
      }

      await saveDraftEntry(currentDraftEntry.id, dataToSave, true);
      if (!isAutoSave) toast.success(`Updated ${allDeltaRows.length} modified rows across all sheets!`);
      
      // Refresh global state so UI reflects saved changes across the dashboard
      const updatedDraft = await getDraftEntry(projectId, activeTab, targetDate);
      if (updatedDraft) {
        onDraftUpdate(updatedDraft);
      }
    } catch (error) {
      console.error('handleSaveEntry error:', error);
      toast.error("Failed to save entry");
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
    } catch (error) {
      toast.error("P6 Push failed");
    }
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
    const canPush = userRoleLower === 'site pm' || userRoleLower === 'pmag' || userRoleLower === 'super admin';

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
              data={dpQtyData}
              setData={handleActivityUpdate as any}
              onSave={(isEntryReadOnly || !isDataEntrySheet) ? undefined : handleSaveEntry}
              
              yesterday={targetYesterday}
              today={targetDate}
              dataDate={projectDetails?.p6_data_date}
              isLocked={isEntryReadOnly}
              status={entryStatus}
              universalFilter={universalFilter}
              projectId={projectId}
              selectedBlock={selectedBlock}
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
              data={ACSheetData}
              setData={handleActivityUpdate as any}
              onSave={(isEntryReadOnly || !isDataEntrySheet) ? undefined : handleSaveEntry}
              
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
              data={manpowerDetailsData}
              setData={setManpowerDetailsData}
              selectedBlock={selectedBlock}
              totalManpower={totalManpower}
              setTotalManpower={setTotalManpower}
              onSave={(isEntryReadOnly || !isDataEntrySheet) ? undefined : handleSaveEntry}
              
              yesterday={targetYesterday}
              today={targetDate}
              isLocked={isEntryReadOnly}
              status={entryStatus}
              universalFilter={universalFilter}
              projectId={projectId}
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
              data={DCSheetData}
              setData={handleActivityUpdate as any}
              onSave={(isEntryReadOnly || !isDataEntrySheet) ? undefined : handleSaveEntry}
              
              yesterday={targetYesterday}
              today={targetDate}
              dataDate={projectDetails?.p6_data_date}
              isLocked={isEntryReadOnly}
              status={entryStatus}
              universalFilter={universalFilter}
              projectId={projectId}
              selectedBlock={selectedBlock}
              resourcesByActivity={resourcesByActivity}
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
              data={testingCommData}
              setData={handleActivityUpdate as any}
              onSave={(isEntryReadOnly || !isDataEntrySheet) ? undefined : handleSaveEntry}
              
              yesterday={targetYesterday}
              today={targetDate}
              dataDate={projectDetails?.p6_data_date}
              isLocked={isEntryReadOnly}
              status={entryStatus}
              projectName={projectName}
              universalFilter={universalFilter}
              projectId={projectId}
              selectedBlock={selectedBlock}
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
            yesterday={targetYesterday}
            today={targetDate}
            isLocked={isEntryReadOnly}
            status={entryStatus}
            onSave={(isEntryReadOnly || !isDataEntrySheet) ? undefined : handleSaveEntry}
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

