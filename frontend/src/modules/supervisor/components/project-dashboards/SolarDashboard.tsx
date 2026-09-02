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
import { SubmitStatusModal } from "@/components/SubmitStatusModal";
import type { SubmitStep, SubmitStepState, SubmitStatusRow, SubmitStatusMode } from "@/components/SubmitStatusModal";
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
  // Bumped whenever a save / submit / push has just changed what the server holds, so the trailing
  // date columns are re-read instead of being left on the snapshot taken when the page loaded.
  const [dailyHistoryTick, setDailyHistoryTick] = useState(0);
  const navigate = useNavigate();

  // Fetch daily progress history for the last 7 days (for DC/AC/T&C sheet date columns)
  useEffect(() => {
    const fetchHistory = async () => {
      if (!projectId) return;
      try {
        // Switchyard / Transmission Line / Infra Works belong here too. They were left out, so
        // their per-day columns had no data source at all: the sheet showed whatever the user had
        // just typed and nothing after a reload, while "Completed as on" still moved (that comes
        // from the server's cumulative, which does include those days) - the "daily values vanished
        // but the aggregation is there" symptom.
        const sheetTypes = [
          'dc_sheet', 'ac_sheet', 'testing_commissioning', 'manpower_details',
          'switchyard', 'transmission_line', 'infra_works',
        ];
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
    // dailyHistoryTick: a submit rebuilds the sheet from the server but this map was not part of
    // that rebuild, so the history columns fell back to the snapshot taken at page load - the value
    // just entered read as blank until the user did a full browser reload, which is the only reason
    // it "came back on refresh". Refetching it as part of the same refresh removes that gap.
  }, [projectId, targetDate, dailyHistoryTick]);

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

  // The values each row held when the server last confirmed them, so a save sends the rows whose
  // values have actually moved since.
  //
  // This deliberately fingerprints VALUES, not _cellStatuses. _cellStatuses records only *which*
  // cell was touched - the value is always the literal 'edited_supervisor' - and it is stored
  // inside data_json, so applyDraftOverlay hands every previously-touched row back with its
  // markers intact. Reading those markers as "unsaved" made a sheet whose rows had all been
  // touched at some point (entry 2973 carried markers on all 714 of its rows) re-send the entire
  // sheet on every two-second autosave. But comparing the markers against a baseline instead was
  // worse: re-editing a cell that had already been edited once produces an identical marker map,
  // so a genuine correction (29-Aug: 5 -> 12) fingerprinted the same as the saved state and was
  // silently dropped - the sheet reported "4 cell edits detected" and sent 0 rows. Only the values
  // themselves distinguish "already saved" from "changed again".
  const savedRowFingerprintRef = useRef<Record<string, string>>({});

  const deltaRowKey = useCallback((row: any): string => {
    if (!row) return '';
    return String(
      row.assignmentId ?? row.activityId ?? row._customId ?? row.id ??
      `${row.description || row.activities || ''}|${row.block || ''}`
    );
  }, []);

  /**
   * Every field a save actually persists, canonicalised so that a value merely making a round trip
   * through the grid never looks like an edit.
   *
   * handleDataChange rebuilds EVERY row from the rendered cells, not just the one that was typed
   * into, so each row's values come back through the display formatting on every keystroke. Two of
   * those trips are lossy, and comparing the raw values flagged all ~1,080 rows as changed after a
   * single-cell edit:
   *
   *   - a blank day cell renders as "" and is written back as "0" - the same figure, two spellings
   *   - percentComplete is shown as Math.round(v * 100) and written back as that / 100, so a P6
   *     value of 0.982 returns as 0.98
   *
   * Comparing numbers as numbers, and the percentage at the whole-percent precision the sheet
   * actually displays and accepts, makes an untouched row compare equal while a real edit (98 -> 99,
   * or a day value 5 -> 12) still differs.
   */
  const rowValueFingerprint = useCallback((row: any): string => {
    if (!row) return '';
    const text = (v: any) => (v === null || v === undefined ? '' : String(v).trim());
    /** A quantity: "" and "0" and 0 are the same figure. */
    const num = (v: any) => {
      const s = text(v);
      if (s === '') return '0';
      const n = Number(s);
      return Number.isFinite(n) ? String(n) : s;
    };
    /** Whole percent - the only precision the Physical Progress % column can show or accept. */
    const pct = (v: any, scale: number) => {
      const s = text(v);
      if (s === '') return '';
      const n = Number(s);
      return Number.isFinite(n) ? String(Math.round(n * scale)) : s;
    };
    /**
     * Calendar day only. These columns are `timestamp with time zone` in P6, so a seeded value
     * arrives as "2025-07-10T00:00:00+05:30" while an edit writes back parseDateToIso's bare
     * "2025-07-10". Same day, two spellings - and with 3,059 of this project's 4,811 activities
     * carrying an actual start, comparing them literally marked almost the whole sheet as changed.
     */
    const day = (v: any) => text(v).split('T')[0].split(' ')[0];
    /** A blank status is displayed - and written back - as "Not Started"; treat them as one. */
    const st = (v: any) => text(v) || 'Not Started';

    // History needs the same care. A saved draft stores one entry per date INCLUDING yesterday and
    // today, while an edit rewrites historyValues with only the five history columns the grid
    // shows - putting yesterday and today in their own fields. Compared literally, the seeded row
    // (7 dates) and the edited row (5 dates) never match, which flagged every row on the sheet.
    // Yesterday and today are already compared as their own fields above, so they are excluded
    // here, and days worth nothing are dropped so "absent" and "0" read the same.
    const dayExcluded = new Set([
      String(targetDate || '').split('T')[0],
      String(targetYesterday || '').split('T')[0],
    ].filter(Boolean));
    const history = row.historyValues && typeof row.historyValues === 'object'
      ? Object.keys(row.historyValues)
          .filter(d => !dayExcluded.has(d) && num(row.historyValues[d]) !== '0')
          .sort()
          .map(d => `${d}=${num(row.historyValues[d])}`)
          .join(',')
      : '';
    // Manpower/machinery sheets carry their per-day figures as actual_YYYY-MM-DD keys instead.
    const actualKeys = Object.keys(row)
      .filter(k => k.startsWith('actual_') && num(row[k]) !== '0')
      .sort()
      .map(k => `${k}=${num(row[k])}`)
      .join(',');

    // Labelled so a mismatch can be named, not guessed at - see explainRowDelta below.
    const parts: [string, string][] = [
      ['todayValue', num(row.todayValue)],
      ['yesterdayValue', num(row.yesterdayValue)],
      ['history', history],
      ['actual_*', actualKeys],
      ['scope', num(row.scope ?? row.totalQuantity)],
      ['uom', text(row.uom)],
      ['status', st(row.status)],
      ['percentComplete', pct(row.percentComplete, 100)],
      ['completionPercentage', pct(row.completionPercentage, 1)],
      ['actualStart', day(row.actualStart)],
      ['actualFinish', day(row.actualFinish)],
      ['forecastStart', day(row.forecastStart)],
      ['forecastFinish', day(row.forecastFinish)],
      ['remarks', text(row.remarks)],
      ['selectedResourceId', text(row.selectedResourceId)],
      ['priority', text(row.priority)],
      ['contractorName', text(row.contractorName)],
      ['description', text(row.description ?? row.activities)],
      ['block', text(row.block ?? row.newBlockNom)],
    ];
    return parts.map(([k, v]) => `${k}=${v}`).join('|');
  }, [targetDate, targetYesterday]);

  /**
   * Names the fields that differ between a row and its saved baseline.
   *
   * The delta is decided by comparing values, and a mismatch in any single field marks the row as
   * needing a save. When that goes wrong it goes wrong for the whole sheet at once, and the only
   * way to tell WHICH field is responsible has been to reason about it. This reports it directly.
   */
  const explainRowDelta = useCallback((row: any): string[] => {
    const baseline = savedRowFingerprintRef.current[deltaRowKey(row)];
    if (baseline === undefined) return ['(no baseline - row never seeded)'];
    const now = rowValueFingerprint(row).split('|');
    const was = baseline.split('|');
    const diffs: string[] = [];
    for (let i = 0; i < Math.max(now.length, was.length); i++) {
      if (now[i] !== was[i]) diffs.push(`${was[i] ?? '(absent)'} -> ${now[i] ?? '(absent)'}`);
    }
    return diffs;
  }, [deltaRowKey, rowValueFingerprint]);

  /** Records the current values of these rows as the "already saved" baseline. */
  const seedRowBaseline = useCallback((rows: any[]) => {
    if (!Array.isArray(rows)) return;
    rows.forEach(r => {
      if (!r || r.isCategoryRow) return;
      const key = deltaRowKey(r);
      if (key) savedRowFingerprintRef.current[key] = rowValueFingerprint(r);
    });
  }, [deltaRowKey, rowValueFingerprint]);

  const updateTableData = useCallback(async (baseActivities: any[]) => {
    if (!baseActivities || baseActivities.length === 0) return;

    setLoading(true);
    try {
      // Fetch yesterday values for ALL sheets so masterActivities is fully populated
      const yesterdayData = await getYesterdayValues(projectId, targetYesterday, undefined);
      const yesterdayRows = (yesterdayData?.activities || []).map(roundP6Metrics);
      const roundedBaseActivities = baseActivities.map(roundP6Metrics);

      // Fetch drafts for all data entry sheets concurrently so the entire project state is overlayed
      // Every sheet whose edits live in masterActivities has to be overlaid here, or a rebuild
      // silently drops that sheet's saved values. The three WBS sheets were missing, so their
      // saved daily figures were never read back - they survived only as long as the tab stayed
      // open, and disappeared on the next reload.
      const draftTypes = [
        'dc_sheet', 'ac_sheet', 'dp_qty', 'testing_commissioning',
        'switchyard', 'transmission_line', 'infra_works',
      ];
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
        const rebuiltFromServer = !prev || prev.length === 0 || dateChanged;
        if (rebuiltFromServer) {
          if (draftRows.length > 0) {
            merged = applyDraftOverlay(merged, draftRows);
          }
        }

        // Force rounding again to catch any unrounded values introduced by drafts
        const result = merged.map(roundP6Metrics);

        // These rows are exactly what the server holds, so they are the "already saved" baseline
        // a later save compares against. Only seed on a genuine rebuild: re-seeding from `prev`
        // would record the user's in-progress edits as already-saved and drop them.
        if (rebuiltFromServer) seedRowBaseline(result);

        return result;
      });
    } catch (err) {
      console.error("Error updating table data:", err);
    } finally {
      setLoading(false);
    }
  }, [projectId, targetYesterday, activeTab, currentDraftEntry, mergeData, applyDraftOverlay, seedRowBaseline]);

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

  // ── Submit status modal ─────────────────────────────────────────
  const activeSheetLabel = useMemo(() => {
    const sheets = getProjectTypeConfig('solar', { name: projectName })?.sheets || [];
    return sheets.find((s: any) => s.id === activeTab)?.label || activeTab;
  }, [activeTab, projectName]);

  const [isSubmitStatusOpen, setIsSubmitStatusOpen] = useState(false);
  const [submitMode, setSubmitMode] = useState<SubmitStatusMode>('submit');
  const [submitSteps, setSubmitSteps] = useState<SubmitStep[]>([]);
  const [submitRows, setSubmitRows] = useState<SubmitStatusRow[]>([]);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitFinished, setSubmitFinished] = useState(false);

  /** Marks one stage of the status modal. Shared by save, submit and push. */
  const setStatusStep = useCallback((key: string, state: SubmitStepState, detail?: string) => {
    setSubmitSteps(prev => prev.map(s => (s.key === key ? { ...s, state, detail: detail ?? s.detail } : s)));
  }, []);

  /** Opens the status modal on a fresh set of stages. */
  const beginStatus = useCallback((mode: SubmitStatusMode, steps: SubmitStep[]) => {
    setSubmitMode(mode);
    setSubmitError(null);
    setSubmitRows([]);
    setSubmitFinished(false);
    setSubmitSteps(steps);
    setIsSubmitStatusOpen(true);
  }, []);

  /** Whichever stage was still running is the one that broke. */
  const failStatus = useCallback((message: string) => {
    setSubmitSteps(prev => prev.map(s => (s.state === 'running' ? { ...s, state: 'failed' } : s)));
    setSubmitError(message);
    setSubmitFinished(true);
  }, []);

  /**
   * Everything worked: dismiss the modal on its own and rebuild the sheet from the server.
   *
   * The modal exists to make the wait legible, not to be clicked away afterwards - so it closes
   * itself once the last stage is green, after a short beat so the ticks are actually seen. A
   * failure does NOT come through here: that stays open until dismissed, because it is the only
   * place the reason is shown.
   *
   * Clearing masterActivities is what makes this a real refresh rather than a repaint.
   * updateTableData deliberately re-applies the server draft only when it is rebuilding from
   * scratch (otherwise an in-flight edit would be overwritten mid-typing), so without this the
   * screen would keep showing the pre-submit figures. Rebuilding also re-derives "Completed as on"
   * from the server, which is how a row whose stored figure had drifted comes back correct.
   */
  const closeStatusAndRefresh = useCallback((rebuild: boolean = true) => {
    window.setTimeout(() => {
      setIsSubmitStatusOpen(false);
      if (!rebuild) return;
      // Force updateTableData to re-read the server and re-apply the draft, WITHOUT emptying the
      // grid first. Clearing masterActivities blanked all 936 rows while the rebuild ran, so a
      // supervisor who carried on typing straight after a submit had that input thrown away and
      // the sheet appeared to stop accepting edits. Resetting the date ref makes updateTableData
      // treat this as a genuine rebuild (its `dateChanged` branch), which re-overlays from the
      // server in place - the same refreshed figures, no empty state in between.
      lastTargetYesterdayRef.current = null;
      setLastTabLoaded("");
      setLastAppliedDraftId(null);
      setDailyHistoryTick(t => t + 1);
    }, 900);
  }, []);

  /**
   * The activityIds each masterActivities-backed sheet actually shows.
   *
   * DC / AC / DP Qty / T&C / Switchyard / Transmission Line / Infra Works are all views of the one
   * masterActivities list, so a save on any of them used to send every dirty row in the project -
   * including rows belonging to a different sheet. The backend then filed those rows' daily figures
   * under the active sheet's sheet_type, so one activity's progress ended up recorded under several
   * sheets at once: 366 activities in this database carry daily-progress rows under two or more
   * sheet_types (one under eleven), and 102 of those rows - 1,838 units - are the same activity on
   * the same date counted twice. Anything that totals across sheets double-counts them.
   */
  const sheetActivityIds = useMemo(() => {
    const collect = (rows: any[]) => {
      const s = new Set<string>();
      (rows || []).forEach(r => {
        if (!r || r.isCategoryRow) return;
        const id = String(r.activityId || r.activityObjectId || '').trim();
        if (id) s.add(id);
      });
      return s;
    };
    return {
      dp_qty: collect(dpQtyData),
      ac_sheet: collect(ACSheetData),
      dc_sheet: collect(DCSheetData),
      testing_commissioning: collect(testingCommData),
      switchyard: collect(switchyardData),
      transmission_line: collect(transmissionLineData),
      infra_works: collect(infraWorksData),
    } as Record<string, Set<string>>;
  }, [dpQtyData, ACSheetData, DCSheetData, testingCommData, switchyardData, transmissionLineData, infraWorksData]);

  /** The rows behind whichever sheet is active; [] for a tab that holds no editable data. */
  const getActiveSheetRows = useCallback((): any[] => {
    switch (activeTab) {
      case 'dc_sheet':
      case 'ac_sheet':
      case 'dp_qty':
      case 'testing_commissioning':
      case 'switchyard':
      case 'transmission_line':
      case 'infra_works':
        return masterActivities || [];
      case 'manpower_details':
        return manpowerDetailsData || [];
      case 'manpower_details_2':
        return manpowerTimephasedData || [];
      case 'resource':
      case 'machinery_details':
        return resourceData || [];
      default:
        return [];
    }
  }, [activeTab, masterActivities, manpowerDetailsData, manpowerTimephasedData, resourceData]);

  /** Turns the delta rows a save just sent into the plain listing the modal shows. */
  const toSubmitStatusRows = useCallback((rows: any[] | null | undefined): SubmitStatusRow[] => {
    if (!Array.isArray(rows)) return [];
    const fmt = (v: any) => (v === null || v === undefined || v === '' ? '' : String(v));
    return rows.map((r: any) => ({
      activityId: String(r.activityId ?? r.activityObjectId ?? r._customId ?? ''),
      description: String(r.description ?? r.activities ?? ''),
      todayValue: fmt(r.todayValue),
      cumulative: fmt(r.cumulative ?? r.actual),
      // A DPR-level activity is one this project created itself; it carries a "DPR-{project}-{n}"
      // id and lives in dpr_custom_activities rather than in P6.
      source: (r.isCustom || r._isCustomRow || String(r.activityId || '').startsWith('DPR-')) ? 'dpr' : 'p6',
      changedFields: Object.keys(r._cellStatuses || {}),
    }));
  }, []);

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

  /** Returns the rows it sent, [] if there was nothing to send, or null if the save failed. */
  const handleSaveEntry = async (isAutoSave: boolean = false): Promise<any[] | null> => {
    if (!currentDraftEntry || !masterActivities) return [];

    // A manual Save gets the same visible progress a Submit does. The 2-second autosave does not -
    // it must stay silent, and handleSubmitEntry calls this with isAutoSave so the submit modal
    // isn't replaced by a save one mid-flight.
    const showStatus = !isAutoSave;
    if (showStatus) {
      beginStatus('save', [
        { key: 'collect', label: 'Collecting your changes', state: 'running' },
        { key: 'save', label: 'Saving to the draft', state: 'pending' },
        { key: 'refresh', label: 'Refreshing the sheet', state: 'pending' },
      ]);
    }

    try {
      // Find all activities across the entire project that have unsaved changes
      // The four P6-backed sheets stamp _cellStatuses on every user edit, so for those an edit
      // marker is the whole signal. The value-based fallback below is only for the sheets that
      // do not stamp them (manpower / machinery); applying it to a P6 sheet would classify every
      // row that merely *holds* a figure - i.e. most of a 900-row sheet - as needing a re-save.
      // Switchyard / Transmission Line / Infra Works render through ACSheetTable too, so they
      // stamp _cellStatuses on every edit exactly like DC/AC and belong on this list. Leaving them
      // off would fall back to the value-based test below, which on a P6-backed sheet treats every
      // row that merely holds a figure as unsaved - the whole-sheet delta that made saves time out.
      const usesCellStatuses =
        activeTab === 'dc_sheet' || activeTab === 'ac_sheet' ||
        activeTab === 'dp_qty' || activeTab === 'testing_commissioning' ||
        activeTab === 'switchyard' || activeTab === 'transmission_line' ||
        activeTab === 'infra_works';

      // Only this sheet's own rows may be saved under this sheet's entry. A dirty row that belongs
      // to a different sheet is left alone: it stays dirty in masterActivities and is saved when
      // that sheet is the active one, instead of being filed under the wrong sheet_type here.
      // A row that no sheet claims is still sent, so a gap in the mappings can never silently
      // swallow an edit.
      const ownIds = sheetActivityIds[activeTab];
      const belongsToThisSheet = (row: any) => {
        if (!ownIds) return true;
        const id = String(row.activityId || row.activityObjectId || '').trim();
        if (!id) return true;
        if (ownIds.has(id)) return true;
        const claimedElsewhere = Object.keys(sheetActivityIds)
          .some(t => t !== activeTab && sheetActivityIds[t].has(id));
        return !claimedElsewhere;
      };

      const getDeltaRows = (rows: any[]) => {
        if (!rows || !Array.isArray(rows)) return [];
        return rows.filter((row: any) => {
          if (row.isCategoryRow) return false;
          if (!belongsToThisSheet(row)) return false;

          // For sheets that don't use _cellStatuses (like manpower_details),
          // consider the row a delta if it has a non-zero value for today, yesterday, or history
          const hasValues = (parseFloat(row.todayValue) > 0) ||
            (parseFloat(row.yesterdayValue) > 0) ||
            (row.historyValues && Object.values(row.historyValues).some((v: any) => parseFloat(v) > 0)) ||
            Object.keys(row).some(k => k.startsWith('actual_') && parseFloat(row[k]) > 0);

          if (!usesCellStatuses) return hasValues;

          // _cellStatuses is now exactly "edited in this session and not yet saved": the server's
          // copy is restored into _savedCellStatuses instead (see applyDraftOverlay), and a
          // successful save clears it. So it is the delta, directly.
          //
          // This replaces comparing every value against a baseline snapshot. That approach was
          // correct in principle but impossible to keep right in practice: handleDataChange rebuilds
          // every row from the rendered grid on any single edit, so each round trip re-formats
          // values - a blank cell becoming "0", 0.982 becoming 0.98, a timestamp losing its time
          // component - and each difference marked the whole sheet as changed. Every such mismatch
          // fixed revealed the next one. An explicit marker cannot drift.
          return !!(row._cellStatuses && Object.keys(row._cellStatuses).length > 0);
        });
      };

      let currentData: any[] = [];
      switch (activeTab) {
        case 'dc_sheet':
        case 'ac_sheet':
        case 'dp_qty':
        case 'testing_commissioning':
        // Switchyard / Transmission Line / Infra Works are WBS-filtered views of the same
        // masterActivities (see switchyardData et al: mapActivitiesToWbsSheet -> aggregateByWbsName),
        // and they edit through the same ACSheetTable and handleActivityUpdate, so their edits land
        // in masterActivities exactly like DC/AC. They were simply missing from this switch and so
        // fell to `default: return` - Save did nothing at all on those three tabs: no request, no
        // error, not even the "no changes" toast, and the 2-second autosave bailed out the same way.
        case 'switchyard':
        case 'transmission_line':
        case 'infra_works':
          currentData = masterActivities;
          break;
        case 'manpower_details':
          currentData = manpowerDetailsData;
          break;
        case 'manpower_details_2':
          currentData = manpowerTimephasedData;
          break;
        // 'resource' is the tab id the Machinery Sheet actually uses (see SOLAR_CONFIG);
        // 'machinery_details' was the only case here, so Save on that tab matched nothing and
        // fell through to `default` - the same silent no-op Infra Works had. Both are accepted.
        case 'resource':
        case 'machinery_details':
          currentData = resourceData;
          break;
        default:
          if (showStatus) {
            setStatusStep('collect', 'failed', `"${activeTab}" is not a data-entry sheet`);
            failStatus(`This sheet ("${activeTab}") has no editable data to save.`);
          }
          return [];
      }

      const allDeltaRows = getDeltaRows(currentData);

      if (allDeltaRows.length === 0) {
        if (!isAutoSave) toast.warning("No new changes detected. Entry is up to date.");
        if (showStatus) {
          setStatusStep('collect', 'done', 'nothing changed');
          setStatusStep('save', 'skipped', 'nothing to send');
          setStatusStep('refresh', 'skipped');
          setSubmitFinished(true);
          closeStatusAndRefresh(false);
        }
        return [];
      }

      // A single edit should not produce a large delta. When it does, name the field responsible
      // instead of leaving it to be guessed at.
      if (!isAutoSave && allDeltaRows.length > 5) {
        console.warn(
          `[SaveEntry] ${allDeltaRows.length} rows flagged as changed. Fields differing from the ` +
          `saved baseline, for the first few rows:`,
          allDeltaRows.slice(0, 5).map((r: any) => ({
            activityId: r.activityId, differs: explainRowDelta(r),
          }))
        );
      }

      if (showStatus) {
        setSubmitRows(toSubmitStatusRows(allDeltaRows));
        setStatusStep('collect', 'done', `${allDeltaRows.length} changed row(s)`);
        setStatusStep('save', 'running');
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

      // The server stores one _cellStatuses per row and a partial save replaces it, so send this
      // session's markers merged over the ones already saved - otherwise the PM's "what changed"
      // highlighting would be reset to only today's edits.
      const rowsToSend = allDeltaRows.map((r: any) => {
        if (!r || !r._savedCellStatuses) return r;
        // _savedCellStatuses is a client-side split of the same field; fold it back in and drop it,
        // so data_json keeps its existing shape rather than gaining a duplicate key.
        const { _savedCellStatuses, ...rest } = r;
        return { ...rest, _cellStatuses: { ..._savedCellStatuses, ...(r._cellStatuses || {}) } };
      });

      let dataToSave: any = { rows: rowsToSend };

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

      // getDeltaRows() above treats "has any _cellStatuses entries" as "needs saving" - but
      // nothing ever cleared that flag once a row's changes actually reached the server. Every
      // activity ever touched in this session stayed in allDeltaRows forever, so on a large sheet
      // (900+ rows) a long editing session's delta only grew across autosaves, no matter how small
      // the actual edit was - which is what was still driving save-draft into the two-minute
      // timeout even after scoping the backend's per-row work to the delta. This just saved
      // successfully, so these specific rows' dirty flag is cleared; a genuinely new edit re-marks
      // it immediately via StyledExcelTable's own handleCellChange, so nothing real is lost.
      const savedRowRefs = new Set(allDeltaRows);
      const clearSavedCellStatuses = (rows: any[]) =>
        rows.map(r => (savedRowRefs.has(r) ? { ...r, _cellStatuses: {} } : r));

      // These values are now on the server, so they become the baseline the next save compares
      // against - without this the same rows would be re-sent on every subsequent autosave.
      seedRowBaseline(allDeltaRows);

      switch (activeTab) {
        case 'dc_sheet':
        case 'ac_sheet':
        case 'dp_qty':
        case 'testing_commissioning':
        case 'switchyard':
        case 'transmission_line':
        case 'infra_works':
          setMasterActivities(prev => clearSavedCellStatuses(prev));
          break;
        case 'manpower_details':
          setManpowerDetailsData(prev => clearSavedCellStatuses(prev));
          break;
        case 'manpower_details_2':
          setManpowerTimephasedData(prev => clearSavedCellStatuses(prev));
          break;
        case 'resource':
        case 'machinery_details':
          setResourceData(prev => clearSavedCellStatuses(prev));
          break;
      }

      if (showStatus) setStatusStep('save', 'done', `${allDeltaRows.length} row(s) saved`);

      if (!isAutoSave) {
        toast.success(`Saved changes: ${allDeltaRows.length} rows updated.`);
        if (showStatus) setStatusStep('refresh', 'running');
        // Refresh global state so UI reflects saved changes across the dashboard
        const updatedDraft = await getDraftEntry(projectId, activeTab, targetDate);
        if (updatedDraft) {
          onDraftUpdate(updatedDraft);
        }
        if (showStatus) {
          setStatusStep('refresh', 'done');
          setSubmitFinished(true);
          // A save keeps the sheet you are working in exactly as it is - rebuilding here would
          // throw away anything typed in the moment between the save starting and finishing.
          closeStatusAndRefresh(false);
        }
      }

      // Handed back so the submit flow can show exactly which rows it just sent.
      return allDeltaRows;
    } catch (error: any) {
      console.error('handleSaveEntry error:', error);
      toast.error("Failed to save entry");
      if (showStatus) failStatus(error?.message || "Failed to save entry");
      // null (rather than a throw) distinguishes "the save failed" from "there was nothing to
      // save" for the submit flow, without turning the fire-and-forget autosave call into an
      // unhandled rejection.
      return null as any;
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

    // Drive the status modal through the same three stages the submit actually has, so the wait
    // is legible instead of a silent pause ending in a toast.
    const setStep = setStatusStep;

    beginStatus('submit', [
      { key: 'save', label: 'Saving your changes', state: 'running' },
      { key: 'submit', label: 'Submitting to Site PM', state: 'pending' },
      { key: 'refresh', label: 'Refreshing the sheet', state: 'pending' },
    ]);

    try {
      console.log('[SubmitEntry] Starting submit for:', {
        entryId: currentDraftEntry.id,
        sheetType: currentDraftEntry.sheet_type,
        status: currentDraftEntry.status,
        activeTab
      });

      const sentRows = await handleSaveEntry(true); // Save first before submitting
      if (sentRows === null) {
        setStep('save', 'failed', 'could not reach the server');
        setSubmitError('Your changes could not be saved, so nothing was submitted. Check your connection and try again — the sheet still holds everything you typed.');
        setSubmitFinished(true);
        return;
      }

      let draftRows = [];
      if (currentDraftEntry?.data_json) {
        const data = typeof currentDraftEntry.data_json === 'string' ? JSON.parse(currentDraftEntry.data_json) : currentDraftEntry.data_json;
        if (data.rows && Array.isArray(data.rows)) draftRows = data.rows;
      }
      
      // Combine newly sent rows with previously auto-saved draft rows to show the user EVERYTHING being submitted
      const combinedRowsMap = new Map();
      draftRows.forEach((r: any) => combinedRowsMap.set(String(r.activityId || r.activityObjectId || r._customId || Math.random()), r));
      sentRows.forEach((r: any) => combinedRowsMap.set(String(r.activityId || r.activityObjectId || r._customId || Math.random()), r));
      
      setSubmitRows(toSubmitStatusRows(Array.from(combinedRowsMap.values())));
      setStep('save', 'done', sentRows.length === 0 ? 'no unsaved changes (auto-saved)' : `${sentRows.length} row(s) saved`);
      setStep('submit', 'running');

      console.log('[SubmitEntry] Save done, now submitting entry id:', currentDraftEntry.id);
      // Pass activeTab as sheetType for backend validation
      const response = await submitEntry(currentDraftEntry.id, "Submitted from Sheet", activeTab);
      console.log('[SubmitEntry] Submit response:', response);
      setStep('submit', 'done', `entry #${currentDraftEntry.id}`);
      toast.success(response.message || "Entry submitted successfully!");

      setStep('refresh', 'running');
      const updatedDraft = await getDraftEntry(projectId, activeTab, targetDate);
      if (updatedDraft) {
        onDraftUpdate(updatedDraft);
      }
      setStep('refresh', 'done');
      setSubmitFinished(true);
      // Submit only changes the entry's status (draft → submitted_to_pm), not the data.
      // The values are already correct in masterActivities and the parent's draft state
      // was updated by onDraftUpdate above. A full rebuild (rebuild=true) would re-fetch
      // all 7 sheet drafts and run them through the backend's _finalize_entry →
      // universal_progress_rebuild, which can return a differently-structured data_json
      // that applyDraftOverlay fails to merge correctly — causing the submitted values
      // to disappear until a full page reload.
      // Unlike P6 push (which modifies external P6 data requiring a re-read), submit
      // is purely a status change, so skipping the rebuild is both safe and correct.
      closeStatusAndRefresh(false);
    } catch (error: any) {
      console.error('handleSubmitEntry error:', error);
      failStatus(error?.message || "Failed to submit entry");
      toast.error(error?.message || "Failed to submit entry");
    }
  };




  const handlePushToP6 = async () => {
    if (!currentDraftEntry) return;

    // A P6 push writes into the live project schedule, so it gets the same visible progress as a
    // submit - and, unlike a submit, it is worth showing what left the sheet even when it works.
    beginStatus('push', [
      { key: 'push', label: 'Pushing to P6 / ERP', state: 'running' },
      { key: 'refresh', label: 'Refreshing the sheet', state: 'pending' },
    ]);
    // The push service writes a row only when it carries a todayValue (see _parse_today_value in
    // p6_push_service), so these are exactly the rows this push will touch.
    setSubmitRows(toSubmitStatusRows(
      getActiveSheetRows().filter((r: any) => !r.isCategoryRow && Number(r.todayValue) > 0)
    ));

    try {
      const resp = await pushEntryToP6(currentDraftEntry.id);
      setStatusStep('push', 'done', resp?.message || `entry #${currentDraftEntry.id}`);
      if (resp.message) toast.success(resp.message);

      setStatusStep('refresh', 'running');
      // Refresh draft to see updated pushed_at time
      const updatedDraft = await getDraftEntry(projectId, activeTab, targetDate);
      if (updatedDraft) onDraftUpdate(updatedDraft);
      setStatusStep('refresh', 'done');
      setSubmitFinished(true);
      // A push changes percent-complete and actual dates in P6, and those come back down on the
      // next load - so rebuild rather than leave the pre-push figures on screen.
      closeStatusAndRefresh();
    } catch (error: any) {
      const message = error?.response?.data?.detail || error?.message || "P6 Push failed";
      console.error('handlePushToP6 error:', error);
      failStatus(typeof message === 'string' ? message : JSON.stringify(message));
      toast.error(typeof message === 'string' ? message : "P6 Push failed");
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
              onSave={(isEntryReadOnly || !isDataEntrySheet) ? undefined : async (isAuto) => { await handleSaveEntry(isAuto); }}
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
              onSave={(isEntryReadOnly || !isDataEntrySheet) ? undefined : async (isAuto) => { await handleSaveEntry(isAuto); }}
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
              onSave={(isEntryReadOnly || !isDataEntrySheet) ? undefined : async (isAuto) => { await handleSaveEntry(isAuto); }}
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
              onSave={(isEntryReadOnly || !isDataEntrySheet) ? undefined : async (isAuto) => { await handleSaveEntry(isAuto); }}
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
              onSave={(isEntryReadOnly || !isDataEntrySheet) ? undefined : async (isAuto) => { await handleSaveEntry(isAuto); }}
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
              onSave={(isEntryReadOnly || !isDataEntrySheet) ? undefined : async (isAuto) => { await handleSaveEntry(isAuto); }}
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
            onSave={(isEntryReadOnly || !isDataEntrySheet) ? undefined : async (isAuto) => { await handleSaveEntry(isAuto); }}
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
              title={activeSheetLabel}
              sheetType={activeTab}
              data={dataMap[activeTab]}
              setData={handleActivityUpdate as any}
              onSave={(isEntryReadOnly || !isDataEntrySheet) ? undefined : async (isAuto) => { await handleSaveEntry(isAuto); }}
              onSubmit={(isEntryReadOnly || !isDataEntrySheet) ? undefined : handleSubmitEntry}
              onPush={canPush ? handlePushToP6 : undefined}
              dailyHistory={dailyHistoryMap[activeTab] || {}}

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

        <SubmitStatusModal
          isOpen={isSubmitStatusOpen}
          onClose={() => setIsSubmitStatusOpen(false)}
          mode={submitMode}
          sheetLabel={activeSheetLabel}
          reportDate={targetDate}
          entryId={currentDraftEntry?.id ?? null}
          steps={submitSteps}
          rows={submitRows}
          error={submitError}
          isFinished={submitFinished}
        />
      </div>
    </div>
  );
};


