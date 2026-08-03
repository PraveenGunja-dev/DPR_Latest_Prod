import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
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
  aggregateManpowerByActivityName
} from "@/services/p6ActivityService";
import apiClient from "@/services/apiClient";

interface BessDashboardProps {
  projectId: number;
  projectName: string;
  targetDate: string;
  targetYesterday: string;
  activeTab: string;
  currentDraftEntry: any;
  onDraftUpdate: (draft: any) => void;
  isEntryReadOnly: boolean;
  projectDetails?: any;
  selectedBlock?: string;
  selectedActivity?: string;
  onActivityOptionsChange?: (options: string[]) => void;
}

export const BessDashboard: React.FC<BessDashboardProps> = ({
  projectId,
  projectName,
  targetDate,
  targetYesterday,
  activeTab,
  currentDraftEntry,
  onDraftUpdate,
  isEntryReadOnly,
  projectDetails,
  selectedBlock = "ALL",
  selectedActivity = "ALL",
  onActivityOptionsChange
}) => {
  const dataDate = projectDetails?.p6_data_date;
  const { user } = useAuth();

  // BESS sheets that support save/submit (mirrors the dataEntry flags in sheetConfig).
  const BESS_DATA_ENTRY_TABS = ['bess_dp_qty', 'bess_civil', 'bess_electrical', 'bess_testing', 'bess_manpower'];

  // Data states for BESS sheets
  const [summaryData, setSummaryData] = useState<any[]>([]);
  const [dpQtyData, setDpQtyData] = useState<any[]>([]);
  const [civilData, setCivilData] = useState<any[]>([]);
  const [electricalData, setElectricalData] = useState<any[]>([]);

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
          'bess_civil', 'bess_electrical', 'bess_testing',
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
        // Fetch the past-days daily history for the DP Qty, Manpower and the three progress sheets
        // (Civil / Electrical / Testing) so their day-columns can back-fill. The endpoint is keyed
        // by sheet_type, so each sheet reads only its own history.
        const hist = (sheet_type: string) =>
          apiClient.get(`/oracle-p6/daily-history/${projectId}`, { params: { sheet_type, target_date: targetDate } });
        const [dpRes, mpRes, civRes, eleRes, tstRes] = await Promise.all([
          hist('bess_dp_qty'),
          hist('bess_manpower'),
          hist('bess_civil'),
          hist('bess_electrical'),
          hist('bess_testing'),
        ]);
        setDailyHistoryMap({
          'bess_dp_qty': dpRes.data || {},
          'bess_manpower': mpRes.data || {},
          'bess_civil': civRes.data || {},
          'bess_electrical': eleRes.data || {},
          'bess_testing': tstRes.data || {},
        });
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

  // DP Qty sheet must only reflect activities we actually cover on the Civil and Electrical
  // sheets - not the unfiltered whole-project activity list (which also pulls in un-mapped WBS
  // nodes, plus BOP/Testing which aren't implemented sheets yet). Group by (mainHeading,
  // subHeading) - the same grouping already used to band rows on the Civil/Electrical sheets -
  // and roll dates up as MIN start / MAX finish, quantities summed.
  const minRawDate = (dates: (string | undefined)[]): string => {
    const valid = dates.filter((d): d is string => !!d);
    return valid.length ? valid.sort()[0] : '';
  };
  const maxRawDate = (dates: (string | undefined)[]): string => {
    const valid = dates.filter((d): d is string => !!d);
    return valid.length ? valid.sort()[valid.length - 1] : '';
  };

  // manpowerDaily maps an activityId -> { isoDate -> value }. The Manpower sheet's per-day entries
  // are mirrored into the DP Qty date columns: for each DP Qty group (which aggregates several
  // source activities) we sum the manpower entered against those activities on each date.
  const aggregateCoveredToDPQty = (rawActivities: any[], manpowerDaily: Record<string, Record<string, any>> = {}) => {
    const toIso = (d: any) => d ? String(d).split('T')[0] : '';
    const todayIso = toIso(targetDate);
    const yIso = toIso(targetYesterday);

    const groups = new Map<string, any[]>();
    rawActivities.forEach(act => {
      const key = `${act.mainHeading || ''}||${act.subHeading || act.description || ''}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(act);
    });

    const result: any[] = [];
    let slNo = 1;
    groups.forEach(group => {
      const first = group[0];
      const totalQty = group.reduce((s, a) => s + (Number(a.scope) || 0), 0);
      const totalCum = group.reduce((s, a) => s + (Number(a.completed) || 0), 0);

      // Testing & Commissioning activities repeat across Parts/Phases with the same short name
      // (e.g. "Site Inspection" in Part-1..4). On the flat DP Qty sheet that reads as duplicates,
      // so prefix them with their Part to keep each row distinguishable.
      let description = first.subHeading || first.description || '';
      const partMatch = (first.superHeading || '').match(/Part-?\s*(\d+)/i);
      if (partMatch) description = `Part-${partMatch[1]} - ${first.description || ''}`;

      // Sum the manpower entered against this group's source activities, per date.
      const mpByDate: Record<string, number> = {};
      group.forEach(a => {
        const m = manpowerDaily[String(a.activityId || '')];
        if (m) Object.keys(m).forEach(d => { mpByDate[d] = (mpByDate[d] || 0) + (Number(m[d]) || 0); });
      });
      const fmt = (n: number | undefined) => (n ? String(n) : '');

      result.push({
        activityId: first.activityId,
        activityObjectId: first.activityObjectId,
        slNo: String(slNo++),
        description,
        status: first.status || 'Not Started',
        totalQuantity: totalQty ? String(totalQty) : '',
        uom: first.uom || '',
        balance: String(Math.max(0, totalQty - totalCum)),
        basePlanStart: minRawDate(group.map(a => a.baselineStart)),
        basePlanFinish: maxRawDate(group.map(a => a.baselineFinish)),
        forecastStart: minRawDate(group.map(a => a.forecastStart)),
        forecastFinish: maxRawDate(group.map(a => a.forecastFinish)),
        actualStart: minRawDate(group.map(a => a.actualStart)),
        actualFinish: maxRawDate(group.map(a => a.actualFinish)),
        cumulative: totalCum ? String(totalCum) : '',
        block: '',
        remarks: '',
        // Mirrored manpower per date -> drives the DP Qty date columns.
        historyValues: mpByDate,
        yesterdayValue: fmt(mpByDate[yIso]),
        todayValue: fmt(mpByDate[todayIso]),
      });
    });
    return result;
  };

  // Fetch all BESS data on mount
  useEffect(() => {
    const fetchBessData = async () => {
      if (!projectId) return;
      setLoading(true);
      try {
        // We fetch data based on active tab to optimize loading, 
        // but for now let's just fetch the active tab data.
        if (activeTab === 'bess_dp_qty') {
          // DP Qty is a rollup of the Civil / Electrical / Testing sheets. Derive it from those
          // sheets' in-memory state (which carries the user's scope edits) rather than re-fetching
          // raw P6, so a scope change on Civil/Electrical/Testing flows through to DP Qty. Load any
          // source sheet that hasn't been opened yet into its own state first.
          let civ = civilData, ele = electricalData, tst = testingData;
          const pending: Promise<void>[] = [];
          if (civ.length === 0) pending.push(getBessData(projectId, 'civil').then(r => { civ = mapActivities(r?.data || []); setCivilData(civ); }));
          if (ele.length === 0) pending.push(getBessData(projectId, 'electrical').then(r => { ele = mapActivities(r?.data || []); setElectricalData(ele); }));
          if (tst.length === 0) pending.push(getBessData(projectId, 'testing').then(r => { tst = mapActivities(r?.data || []); setTestingData(tst); }));
          if (pending.length) await Promise.all(pending);

          // Mirror the per-day entries made on the Civil / Electrical / Testing sheets into the
          // DP Qty date columns: build activityId -> { isoDate -> value } from each sheet's
          // in-memory historyValues (the values the user just typed), backfilled by that sheet's
          // saved daily-history so previously-submitted days still show. aggregateCoveredToDPQty
          // then sums these per DP Qty group and drives its history / yesterday / today columns.
          const progressDaily: Record<string, Record<string, any>> = {};
          const addProgressDaily = (rows: any[], sheetHist: Record<string, Record<string, number>> = {}) => {
            (Array.isArray(rows) ? rows : []).forEach((r: any) => {
              const aid = String(r.activityId || '');
              if (!aid) return;
              progressDaily[aid] = { ...(sheetHist[aid] || {}), ...(r.historyValues || {}) };
            });
          };
          addProgressDaily(civ, dailyHistoryMap['bess_civil']);
          addProgressDaily(ele, dailyHistoryMap['bess_electrical']);
          addProgressDaily(tst, dailyHistoryMap['bess_testing']);
          // DPR-level (custom) rows keep their day entries in extraData.historyValues.
          const addCustomDaily = (acts: any[]) => (Array.isArray(acts) ? acts : []).forEach((a: any) => {
            const aid = String(a.activityId || '');
            if (!aid) return;
            progressDaily[aid] = { ...(progressDaily[aid] || {}), ...(a.extraData?.historyValues || {}) };
          });
          addCustomDaily(customActivitiesMap['bess_civil']);
          addCustomDaily(customActivitiesMap['bess_electrical']);
          addCustomDaily(customActivitiesMap['bess_testing']);

          const mapCustomToP6Shape = (acts: any[]) => (acts || []).map(a => ({
            ...a,
            mainHeading: a.category || '',
            subHeading: a.wbsName || '',
            baselineStart: a.plannedStart,
            baselineFinish: a.plannedFinish,
            activityObjectId: `custom_${a.id}`,
          }));

          const rolled = aggregateCoveredToDPQty([
            ...civ, ...ele, ...tst,
            ...mapCustomToP6Shape(customActivitiesMap['bess_civil']),
            ...mapCustomToP6Shape(customActivitiesMap['bess_electrical']),
            ...mapCustomToP6Shape(customActivitiesMap['bess_testing'])
          ], progressDaily);

          setDpQtyData(rolled);
        } else if (activeTab === 'bess_civil' && civilData.length === 0) {
          const resp = await getBessData(projectId, 'civil');
          if (resp?.data) setCivilData(mapActivities(resp.data));
        } else if (activeTab === 'bess_electrical' && electricalData.length === 0) {
          const resp = await getBessData(projectId, 'electrical');
          if (resp?.data) setElectricalData(mapActivities(resp.data));
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
  }, [projectId, targetDate, activeTab, customActivitiesMap, dailyHistoryMap]);

  // The "Activity Filter" options are the top-level headings (superHeading, else mainHeading) of
  // the currently active progress sheet - e.g. Battery Container / Harmonic Filter (civil), or
  // Erection of Equipment / Cable Laying / Grid Earthing (electrical). Report them up so the
  // dashboard header can render the dropdown next to the Location filter.
  const topHeadingOf = (r: any): string => (r?.superHeading || r?.mainHeading || "").trim();

  const activeSheetData = useMemo(() => {
    switch (activeTab) {
      case 'bess_civil': return civilData;
      case 'bess_electrical': return electricalData;

      case 'bess_testing': return testingData;
      default: return [];
    }
  }, [activeTab, civilData, electricalData, testingData]);

  useEffect(() => {
    if (!onActivityOptionsChange) return;
    const seen = new Set<string>();
    const opts: string[] = [];
    (Array.isArray(activeSheetData) ? activeSheetData : []).forEach((r: any) => {
      const t = topHeadingOf(r);
      if (t && !seen.has(t)) { seen.add(t); opts.push(t); }
    });
    onActivityOptionsChange(opts);
  }, [activeSheetData, onActivityOptionsChange]);

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
      // The 7 day-columns (Civil / Electrical / Testing) are stored per-row as historyValues, which
      // is not a label-keyed field - restore it directly so daily entries survive a reload.
      if (draft.historyValues !== undefined) merged.historyValues = draft.historyValues;
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

    if (activeTab === 'bess_testing') setTestingData(prev => applyDraftOverlay(prev, draftRows));

  }, [currentDraftEntry, activeTab, applyDraftOverlay]);

  const autoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Only autosave DRAFT entries. A submitted/approved sheet stays editable (isEntryReadOnly is
    // always false), but saving it as a supervisor reverts its status back to 'draft' on the
    // backend - which would make an already-submitted/approved sheet silently disappear from the
    // PM/PMAG queue. Edits to a submitted sheet must therefore be an explicit Save/Submit.
    const entryStatus = currentDraftEntry?.status || 'draft';
    if (isEntryReadOnly || entryStatus !== 'draft') return;

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
    summaryData, civilData, electricalData, testingData,
    manpowerData, resourceData, isEntryReadOnly, currentDraftEntry
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

      const dataToSave: any = {
        rows: deltaRows,
        staticHeader: {
          projectInfo: projectName || `Project #${projectId}`,
          reportingDate: targetDate,
          progressDate: targetYesterday
        }
      };

      if (activeTab === 'bess_manpower') {
        dataToSave.totalManpower = manpowerData[0]?.totalManpower || 0;
      }

      await saveDraftEntry(currentDraftEntry.id, dataToSave, true);
      if (!isAutoSave) toast.success(`Updated ${deltaRows.length} activities successfully!`);
    } catch (error) {
      toast.error("Failed to save entry");
    }
  };

  // Supervisor submits the current sheet for approval (draft -> submitted). Site PM approve and
  // PMAG push-to-P6 happen on the submitted entry in their own dashboards - same pipeline as
  // Solar/Wind. The entry is per-sheet (sheet_type = activeTab), so each sheet submits on its own.
  const handleSubmitEntry = async () => {
    if (!currentDraftEntry) { toast.error("No entry found to submit"); return; }

    // Guard against a tab-switch race putting a different sheet's draft in currentDraftEntry.
    if (currentDraftEntry.sheet_type && currentDraftEntry.sheet_type !== activeTab) {
      toast.error(`Sheet mismatch (expected "${activeTab}"). Refreshing...`);
      const correctDraft = await getDraftEntry(projectId, activeTab, targetDate);
      if (correctDraft) onDraftUpdate(correctDraft);
      return;
    }

    try {
      await handleSaveEntry(true); // save latest edits first
      const response = await submitEntry(currentDraftEntry.id, "Submitted from Sheet", activeTab);
      toast.success(response?.message || "Entry submitted successfully!");
      const updatedDraft = await getDraftEntry(projectId, activeTab, targetDate);
      if (updatedDraft) onDraftUpdate(updatedDraft);
    } catch (error: any) {
      toast.error(error?.message || "Failed to submit entry");
    }
  };

  const handlePushToP6 = async () => {
    if (!currentDraftEntry) return;
    try {
      const resp = await pushEntryToP6(currentDraftEntry.id);
      if (resp?.message) {
        toast.success(resp.message);
        const updatedDraft = await getDraftEntry(projectId, activeTab, targetDate);
        if (updatedDraft) onDraftUpdate(updatedDraft);
      }
    } catch (error: any) {
      toast.error(error?.response?.data?.detail || error?.message || "P6 Push failed");
    }
  };

  const renderActiveTable = () => {
    const entryStatus = currentDraftEntry?.status || 'draft';
    const isRejected = currentDraftEntry?.isRejected;
    const rejectionReason = currentDraftEntry?.rejectionReason;

    // Submit/Push wiring (same as Solar/Wind): the supervisor sees a Submit button on data-entry
    // sheets; Site PM / Super Admin get push-to-P6.
    const userRoleLower = (user?.role || user?.Role || '').toLowerCase();
    const canPush = userRoleLower === 'site pm' || userRoleLower === 'super admin';
    const isDataEntrySheet = BESS_DATA_ENTRY_TABS.includes(activeTab);
    const submitHandler = (isEntryReadOnly || !isDataEntrySheet) ? undefined : handleSubmitEntry;
    const pushHandler = canPush ? handlePushToP6 : undefined;

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

    // Filter block-structured sheet rows by the selected Block. The row's `block` field can be
    // "Block 1", "Block 01", "Block 03 - BCT 1", etc., so match on the block NUMBER. Rows with no
    // block number (e.g. "Common" project-wide items like Road Works) always stay visible.
    const blockNumberOf = (b: any): string | null => {
      const m = /block\s*0*(\d+)/i.exec(String(b || ''));
      return m ? m[1] : null;
    };
    const filterByBlock = (rows: any[]): any[] => {
      const sel = blockNumberOf(selectedBlock);
      if (selectedBlock === 'ALL' || !sel || !Array.isArray(rows)) return rows;
      return rows.filter(r => {
        const rn = blockNumberOf(r?.block);
        return rn === null || rn === sel;
      });
    };

    // Filter by the selected Activity (top-level heading: superHeading, else mainHeading).
    const filterByActivity = (rows: any[]): any[] => {
      if (selectedActivity === 'ALL' || !selectedActivity || !Array.isArray(rows)) return rows;
      return rows.filter(r => topHeadingOf(r) === selectedActivity);
    };

    // When a Block or Activity filter is active the table only sees the filtered subset, so an
    // edit must be merged back into the full dataset (by activity identity) instead of replacing
    // it - otherwise saving would drop the hidden rows.
    const filtersActive = (selectedBlock !== 'ALL' && !!blockNumberOf(selectedBlock)) ||
      (selectedActivity !== 'ALL' && !!selectedActivity);
    const rowKey = (r: any) => String(r?.activityObjectId ?? r?.activityId ?? '');
    const filterAwareSetData = (fullData: any[], setter: (d: any[]) => void) => (updatedSubset: any[]) => {
      if (!filtersActive) { setter(updatedSubset); return; }
      const edited = new Map<string, any>();
      (Array.isArray(updatedSubset) ? updatedSubset : []).forEach(r => {
        const k = rowKey(r);
        if (k) edited.set(k, r);
      });
      setter((Array.isArray(fullData) ? fullData : []).map(r => {
        const k = rowKey(r);
        return k && edited.has(k) ? edited.get(k) : r;
      }));
    };

    const renderProgressTable = (data: any[], setData: any, title: string, sheetType: string, extraProps: Record<string, any> = {}) => (
      <>
        {renderRejectedAlert()}
        <PSSProgressTable
          data={data}
          setData={setData}
          onSave={isEntryReadOnly ? undefined : handleSaveEntry}
          onSubmit={submitHandler}
          onPush={pushHandler}
          yesterday={targetYesterday}
          today={targetDate}
          dataDate={dataDate}
          dailyHistory={dailyHistoryMap[sheetType] || {}}
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
            sheetType={activeTab}
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
              onSubmit={submitHandler}
              onPush={pushHandler}
              yesterday={targetYesterday}
              today={targetDate}
              isLocked={isEntryReadOnly}
              status={entryStatus}
              projectId={projectId}
              dailyHistory={dailyHistoryMap['bess_dp_qty'] || {}}
              hideGrandTotal
              showActivityId
            />
          </>
        );
      case 'bess_civil': return renderProgressTable(filterByActivity(filterByBlock(civilData)), filterAwareSetData(civilData, setCivilData), "BESS - Civil Works", "bess_civil", { renamePlanToBaseline: true });
      case 'bess_electrical': return renderProgressTable(filterByActivity(filterByBlock(electricalData)), filterAwareSetData(electricalData, setElectricalData), "BESS - Electrical Works", "bess_electrical", { renamePlanToBaseline: true });

      case 'bess_testing': return renderProgressTable(filterByActivity(testingData), filterAwareSetData(testingData, setTestingData), "BESS - Testing & Commissioning", "bess_testing", { renamePlanToBaseline: true });


      case 'bess_manpower':
        return (
          <>
            {renderRejectedAlert()}
            <PSSManpowerTable
              data={manpowerData}
              setData={setManpowerData}
              onSave={isEntryReadOnly ? undefined : handleSaveEntry}
              onSubmit={submitHandler}
              onPush={pushHandler}
              todayDate={targetDate}
              yesterday={targetYesterday}
              dailyHistory={dailyHistoryMap['bess_manpower'] || {}}
              showActivityId
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
