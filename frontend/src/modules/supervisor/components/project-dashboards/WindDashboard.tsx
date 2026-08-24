import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { AlertCircle, Package } from "lucide-react";
import { toast } from "sonner";
import { WindSummaryTable, WindProgressTable, WindManpowerTable, WindContractorManpowerTable, buildWindContractorManpowerRows, orderWindContractorRows, WindMachineryTable, Wind33KVTable, Wind33KVOHTable, WindPSSTable, WindEHVTable, WindStoneColumnTable, WindErectionTable, WindProductivityTable, BulkUploadActivitiesModal, ManpowerTimephasedTable } from "../index";
import { getWindProgressActivities, getManpowerDetailsData, getWindPSSData, getWindEHVData, getWind33KVData, getActivityMaterialResources, getManpowerTimephasedData, aggregateManpowerByActivityName } from "@/services/p6ActivityService";
import { saveDraftEntry, submitEntry, getDraftEntry, pushEntryToP6 } from "@/services/dprService";
import { 
  getCustomActivities, createCustomActivity, updateCustomActivity, deleteCustomActivity, bulkCreateCustomActivities 
} from "@/services/customActivityService";
import { useFilter } from "@/modules/auth/contexts/FilterContext";
import { useAuth } from "@/modules/auth/contexts/AuthContext";
import { getUIColumnsForSheet } from "../bulkUploadTemplates";

interface WindDashboardProps {
  projectId: number;
  targetDate: string;
  targetYesterday: string;
  activeTab: string;
  currentDraftEntry: any;
  onDraftUpdate: (draft: any) => void;
  isEntryReadOnly: boolean;
  projectName: string;
  selectedSubstation: string;
  selectedLocation: string;
  selectedActivityGroup: string;
  selectedActivity: string;
  onFiltersLoaded?: (filters: { locations: string[]; substations: string[]; activityGroups: string[]; activities: string[]; }) => void;
  onDateChange?: (date: string) => void;
  projectDetails?: any;
}

export const WindDashboard: React.FC<WindDashboardProps> = ({
  projectId,
  targetDate,
  targetYesterday,
  activeTab,
  currentDraftEntry,
  onDraftUpdate,
  isEntryReadOnly,
  projectName,
  selectedSubstation,
  selectedLocation,
  selectedActivityGroup,
  selectedActivity,
  onFiltersLoaded,
  onDateChange,
  projectDetails
}) => {
  const [windProgressData, setWindProgressData] = useState<any[]>([]);
  const [wind33kvData, setWind33kvData] = useState<any[]>([]);
  const [dynamic33kvColumns, setDynamic33kvColumns] = useState<{key: string, label: string, group?: string}[]>([]);
  const [selectedEntry, setSelectedEntry] = useState<any>(null);
  const [windErectionData, setWindErectionData] = useState<any[]>([]);
  const [windStoneColumnData, setWindStoneColumnData] = useState<any[]>([]);
  const [windPssData, setWindPssData] = useState<any[]>([]);
  const [windEhvData, setWindEhvData] = useState<any[]>([]);
  const [windSummaryData, setWindSummaryData] = useState<any[]>([]);
  const [windManpowerData, setWindManpowerData] = useState<any[]>([]);
  const [windMachineryData, setWindMachineryData] = useState<any[]>([]);
  const [manpowerTimephasedData, _setManpowerTimephasedData] = useState<any[]>([]);
  // Manpower (Contractor) rows are typed by hand, so once the user has touched them the draft
  // reload must leave them alone.
  const contractorManpowerDirtyRef = useRef(false);
  // Which draft those in-memory edits belong to, so a change of report date reloads rather than
  // carrying the previous date's figures across.
  const prevContractorDraftIdRef = useRef<number | null>(null);
  const setManpowerTimephasedData = useCallback((val: any[]) => {
    contractorManpowerDirtyRef.current = true;
    _setManpowerTimephasedData(val);
  }, []);
  const [resourcesByActivity, setResourcesByActivity] = useState<Record<string, any[]>>({});
  const [loading, setLoading] = useState(false);
  const { activityDateFilter } = useFilter();
  const { user } = useAuth();
  
  const [isBulkUploadModalOpen, setIsBulkUploadModalOpen] = useState(false);
  const [bulkUploadSheetType, setBulkUploadSheetType] = useState("");

  const isMandvi = useMemo(() => {
    const epsName = (projectDetails?.parentEps || projectDetails?.ParentEPSName || projectDetails?.parent_eps || '').toLowerCase();
    const projName = (projectDetails?.name || projectDetails?.Name || projectName || '').toLowerCase();
    return epsName.includes('mandvi') || projName.includes('mandvi');
  }, [projectDetails, projectName]);

  useEffect(() => {
    const fetchResources = async () => {
      if (!projectId) return;
      try {
        const resByAct = await getActivityMaterialResources(projectId);
        setResourcesByActivity(resByAct);
      } catch (error) {
        console.error('Error fetching activity resources:', error);
      }
    };
    fetchResources();
  }, [projectId]);

  // DPR-level custom activities (per sheet)
  const [customEhvActivities, setCustomEhvActivities] = useState<any[]>([]);
  const [customPssActivities, setCustomPssActivities] = useState<any[]>([]);
  const [custom33kvActivities, setCustom33kvActivities] = useState<any[]>([]);
  const [customStoneColumnActivities, setCustomStoneColumnActivities] = useState<any[]>([]);
  const [customErectionActivities, setCustomErectionActivities] = useState<any[]>([]);
  const [customMachineryActivities, setCustomMachineryActivities] = useState<any[]>([]);

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

  const extractActivityBaseWind = useCallback((desc: string) => {
    if (!desc) return "";
    let cleanDesc = desc.trim();
    if (cleanDesc.toUpperCase() === 'WTG SCOD' || cleanDesc.toUpperCase() === 'WTG COD') {
      return 'WTG COD';
    }
    // Matches patterns like "WTG1-CW-Stone Column" -> "Stone Column"
    const match = desc.match(/^(?:WTG\d+|[A-Z\d]+)[-_\s](?:CW|EL|TC|ER|PSS|USS|TC|ELE|ERE|ERECTION|COMM)[-_\s](.+)$/i) ||
      desc.match(/^(?:WTG\d+|[A-Z\d]+)[-_\s](.+)$/i);
    return (match ? match[1] : desc).replace(/_/g, ' ').trim();
  }, []);

  const fetchWindActivities = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const response = await getWindProgressActivities(projectId, targetDate);
      let dataArray = Array.isArray(response.data) ? response.data : [];

      // Enhance data with SPV, Location, and Feeder
      const spv = projectName.match(/^[A-Z0-9]+/i)?.[0] || "";

      // First pass: Identify all rows that explicitly mention a WTG or Substation
      const explicitWtgs: string[] = [];
      const explicitSubstations: string[] = [];

      dataArray.forEach((row: any) => {
        // WTG Detection
        const wtgMatch = row.description?.match(/(WTG\d+)/i);
        explicitWtgs.push(wtgMatch ? wtgMatch[1].toUpperCase() : "");

        // Substation Detection (PSS-XX pattern)
        const pssMatch = (row.description + " " + row.activityId + " " + (row.wbsName || "")).match(/(PSS-?\d+)/i);
        explicitSubstations.push(pssMatch ? pssMatch[1].toUpperCase() : "");
      });

      // Skip Bi-directional propagation to avoid polluting non-WTG tasks (like HOTO/LA/SA) with adjacent WTG names.
      // We will only use explicitly detected WTGs and Substations.
      const rowWtgs = [...explicitWtgs];
      const rowSubstations = [...explicitSubstations];

      // 3. Extract Feeders using "Feeder Charging" logic
      const wtgFeeders: Record<string, string> = {};
      dataArray.forEach((row: any, idx: number) => {
        const wtg = rowWtgs[idx];
        if (wtg) {
          const desc = (row.description || "").toUpperCase();
          if (desc.includes("FEEDER CHARGING")) {
            const parts = desc.split("FEEDER CHARGING");
            if (parts.length > 1) {
              const feederStr = parts[1].trim().replace(/^[-:\s]+/, "");
              if (feederStr) {
                wtgFeeders[wtg] = feederStr;
              }
            }
          }
        }
      });

      // 4. Final Enhancement Pass
      const enhancedData = dataArray.map((row: any, idx: number) => {
        const newRow = { ...row };
        const wtg = rowWtgs[idx];
        const pss = rowSubstations[idx];
        newRow.spv = spv;
        if (!newRow.locations && wtg) {
          newRow.locations = wtg;
        }
        // Always try to extract feeder from the inferred WTG
        if (wtg && !newRow.feeder) {
            newRow.feeder = wtgFeeders[wtg] || "";
        }
        if (!newRow.substation && pss) newRow.substation = pss;
        return newRow;
      });

      const parseDateRobustly = (d: any): Date | null => {
        if (!d || d === "-") return null;
        const date = new Date(d);
        if (!isNaN(date.getTime())) return date;
        if (typeof d === "string") {
          const parts = d.split(/[-/]/);
          if (parts.length === 3) {
            const try2 = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
            if (!isNaN(try2.getTime())) return try2;
          }
        }
        return null;
      };

      let finalFilteredData = enhancedData;
      if (activityDateFilter) {
        const now = new Date();
        const days = activityDateFilter === "Last 7 days" ? 7 : activityDateFilter === "Last 30 days" ? 30 : 0;
        if (days > 0) {
          const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
          finalFilteredData = finalFilteredData.filter((row: any) => {
            if (row.status === 'Not Started') return false;
            if (row.actualStart && row.actualStart !== "-") {
              const start = parseDateRobustly(row.actualStart);
              return start !== null && start >= cutoff && start <= now;
            }
            return false;
          });
        } else if (activityDateFilter === "Delayed Activities") {
          finalFilteredData = finalFilteredData.filter((row: any) => {
            if (row.status === 'Completed' || row.completionPercentage === '100' || row.status === 'Complete') return false;

            const actGroup = (row.activityGroup || "").toUpperCase();
            const allowedGroups = ["ENG", "PRC", "CON", "ENGINEERING", "PROCUREMENT", "CONSTRUCTION", "CIVIL", "ELECTRICAL", "WTG", "INSTALLATION", "CW", "EL", "TC", "ER", "ME", "LA", "-"];
            const isAllowedGroup = allowedGroups.some(g => actGroup === g || actGroup.includes(g));
            if (!isAllowedGroup && actGroup !== "") return false;

            const referenceDate = response.dataDate ? parseDateRobustly(response.dataDate) : new Date();
            if (!referenceDate) return false;

            const hasActualStart = row.actualStart && row.actualStart !== "-";
            const hasActualFinish = row.actualFinish && row.actualFinish !== "-";

            let isDelayed = false;
            if (hasActualStart && !hasActualFinish) {
              const fFinish = parseDateRobustly(row.forecastFinish || row.forecastFinishDate);
              if (fFinish && fFinish < referenceDate) isDelayed = true;
            } else if (!hasActualStart) {
              const fStart = parseDateRobustly(row.forecastStart || row.forecastStartDate);
              if (fStart && fStart < referenceDate) isDelayed = true;
            }

            if (!isDelayed) return false;
            return true;
          }).map((row: any) => {
            const referenceDate = response.dataDate ? parseDateRobustly(response.dataDate) : new Date();
            const hasActualStart = row.actualStart && row.actualStart !== "-";
            
            let delayDays = 0;
            if (hasActualStart) {
              const fFinish = parseDateRobustly(row.forecastFinish || row.forecastFinishDate);
              if (fFinish && referenceDate && fFinish < referenceDate) {
                delayDays = Math.floor((referenceDate.getTime() - fFinish.getTime()) / (1000 * 3600 * 24));
              }
            } else {
              const fStart = parseDateRobustly(row.forecastStart || row.forecastStartDate);
              if (fStart && referenceDate && fStart < referenceDate) {
                delayDays = Math.floor((referenceDate.getTime() - fStart.getTime()) / (1000 * 3600 * 24));
              }
            }

            let displayStatus = row.status;
            if ((row.status === 'In Progress' || hasActualStart) && row.completionPercentage) {
              displayStatus = `In Progress (${Math.round(parseFloat(row.completionPercentage))}%)`;
            }

            return {
              ...row,
              status: displayStatus,
              noOfDays: delayDays > 0 ? String(delayDays) : "",
            };
          });
        } else {
          // "All Time" acts as a reset, showing everything
          finalFilteredData = finalFilteredData;
        }
      }

      setWindProgressData(finalFilteredData.map(roundP6Metrics));
      
      // Fetch specialized PSS, EHV and 33KV data
      const [pssData, ehvData, kv33Data] = await Promise.all([
        getWindPSSData(projectId),
        getWindEHVData(projectId),
        getWind33KVData(projectId)
      ]);

      // Enhance specialized sheets by matching with master data or applying same logic
      const enhanceSpecialized = (list: any[]) => {
        return list.map(row => {
          const masterMatch = enhancedData.find(m => m.activityId === row.activityId);
          if (masterMatch) {
            return { ...row, feeder: masterMatch.feeder, locations: masterMatch.locations, substation: masterMatch.substation };
          }
          // Fallback logic if not in master list
          const wtgMatch = row.description?.match(/(WTG\d+)/i);
          const wtg = wtgMatch ? wtgMatch[1].toUpperCase() : "";
          return { ...row, feeder: wtg ? (wtgFeeders[wtg] || "") : "", locations: wtg };
        });
      };
      
      const isEhvWbs = (wbsName: string) => {
        const wbs = (wbsName || "").toUpperCase();
        return wbs.includes("220KV") || wbs.includes("220 KV") || 
               wbs.includes("400KV") || wbs.includes("400 KV") || 
               wbs.includes("BOS CONSTRUCTION") || wbs.includes("BOS CONSTARTCUTION");
      };

      setWindPssData(enhanceSpecialized(pssData).map(roundP6Metrics));
      setWindEhvData(enhanceSpecialized(ehvData.length > 0 ? ehvData : enhancedData.filter((r: any) => isEhvWbs(r.wbsName))).map(roundP6Metrics));
      
      // Determine if it's a Non-Khavda project
      const epsName = (projectDetails?.parentEps || projectDetails?.ParentEPSName || projectDetails?.parent_eps || '').toLowerCase();
      const projName = (projectDetails?.name || projectDetails?.Name || projectName || '').toLowerCase();
      const isNonKhavda = epsName.includes('outside khavda') || epsName.includes('mandvi') || epsName.includes('mundra') || projName.includes('mandvi') || projName.includes('mundra');

      if (isNonKhavda) {
        // For non-Khavda projects, dynamically map P6 activities into horizontal columns of a single row.
        const ohRow: any = {
          activityId: 'OH-33KV-AGGREGATE',
          description: '',
          vendor: '',
          feederName: '',
          typeOfLine: '',
          btobLine: '',
          finalLine: '',
          totalLocations: '',
          activities: {}
        };
        
        const generatedColumns: {key: string, label: string, group?: string}[] = [];
        
        // Ensure fixed ordering: Row Clearance, Pole Erection (grouped), Stringing (grouped), ADSS, others
        const sortedActs = [...kv33Data].sort((a: any, b: any) => {
          const descA = (a.description || '').toLowerCase();
          const descB = (b.description || '').toLowerCase();
          const orderA = descA.includes('row') ? 1 : descA.includes('foundation') ? 2 : descA.includes('pole erection') ? 3 : descA.includes('tower erection') ? 4 : descA.includes('sc works') ? 5 : descA.includes('dpdc') ? 6 : descA.includes('mc works') ? 7 : descA.includes('adss') ? 8 : 99;
          const orderB = descB.includes('row') ? 1 : descB.includes('foundation') ? 2 : descB.includes('pole erection') ? 3 : descB.includes('tower erection') ? 4 : descB.includes('sc works') ? 5 : descB.includes('dpdc') ? 6 : descB.includes('mc works') ? 7 : descB.includes('adss') ? 8 : 99;
          return orderA - orderB;
        });
        
        sortedActs.forEach((act: any) => {
          const desc = act.description || '';
          // Create a clean key for the object
          const key = desc.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
          
          if (desc) {
            // Determine group
            const lDesc = desc.toLowerCase();
            let groupName = 'OTHER ACTIVITIES';
            if (lDesc.includes('pole erection') || lDesc.includes('tower erection') || lDesc.includes('tower foundation')) {
              groupName = 'POLE ERECTION';
            } else if (lDesc.includes('sc works') || lDesc.includes('dpdc works') || lDesc.includes('mc works') || (lDesc.includes('stringing') && !lDesc.includes('adss'))) {
              groupName = 'STRINGING';
            } else if (lDesc.includes('adss')) {
              groupName = 'ADSS STRINGING';
            } else if (lDesc.includes('row clearance')) {
              groupName = 'ROW CLEARANCE';
            }
            
            // Add to columns if not exists
            if (!generatedColumns.find(c => c.key === key)) {
               generatedColumns.push({ key, label: desc, group: groupName });
            }
            
            if (!ohRow.activities[key]) ohRow.activities[key] = { scope: 0, completed: 0, balance: 0 };
            ohRow.activities[key].scope += Number(act.scope) || 0;
            ohRow.activities[key].completed += Number(act.cumulative) || 0;
            ohRow.activities[key].balance += Number(act.balance) || 0;
          }
        });
        
        setDynamic33kvColumns(generatedColumns);
        setWind33kvData(kv33Data.length > 0 ? [ohRow].map(roundP6Metrics) : []);
      } else {
        // For 33kV HT Cable, we strictly want a list of unique WTGs grouped by Feeder, ignoring P6 activities
        const uniqueWtgsMap = new Map();
        enhancedData.forEach((r: any) => {
          if (r.locations && r.locations.toUpperCase().startsWith('WTG')) {
            uniqueWtgsMap.set(r.locations.toUpperCase(), {
               locations: r.locations,
               feeder: r.feeder || 'GENERAL',
               pss: r.substation || r.substationName || ''
            });
          }
        });
        
        const sortedWtgs = Array.from(uniqueWtgsMap.values()).sort((a: any, b: any) => 
          a.locations.localeCompare(b.locations, undefined, { numeric: true, sensitivity: 'base' })
        );
  
        const uniqueWtgRows = sortedWtgs.map(wtg => ({
           activityId: `CABLE-${wtg.locations}`,
           description: wtg.locations,
           cableFrom: wtg.locations,
           locations: wtg.locations,
           feeder: wtg.feeder
        }));
        setWind33kvData(uniqueWtgRows.map(roundP6Metrics));
      }
      
      const sortedWtgsForOthers = Array.from(new Map(
        enhancedData.filter((r: any) => r.locations && r.locations.toUpperCase().startsWith('WTG'))
        .map((r: any) => [r.locations.toUpperCase(), { locations: r.locations, pss: r.substation || '' }])
      ).values()).sort((a: any, b: any) => 
        a.locations.localeCompare(b.locations, undefined, { numeric: true, sensitivity: 'base' })
      );
      
      const stoneColumnWtgs = sortedWtgsForOthers.map((wtg, i) => ({
         activityId: `STONE-${wtg.locations}`,
         description: wtg.locations,
         locations: wtg.locations,
         pss: wtg.pss,
         sNo: String(i + 1),
      }));
      setWindStoneColumnData(stoneColumnWtgs.map(roundP6Metrics));

      // Erection data - start empty so users can define locations themselves
      setWindErectionData([]);

      const manpowerData = await getManpowerDetailsData(projectId);
      setWindManpowerData(manpowerData.map(roundP6Metrics));

      if (isMandvi) {
        // Manpower (Contractor) is a manual sheet now - no P6 timephased resource data behind it.
        _setManpowerTimephasedData(prev =>
          prev && prev.length ? prev : buildWindContractorManpowerRows());
      } else {
        const rawTimephased = await getManpowerTimephasedData(projectId, targetDate);
        if (rawTimephased && Array.isArray(rawTimephased)) {
          const mappedTimephased = rawTimephased.map((m: any) => ({
            ...roundP6Metrics(m),
            block: m.locations || m.block
          }));
          const aggregated = aggregateManpowerByActivityName(mappedTimephased);
          _setManpowerTimephasedData(aggregated.map(roundP6Metrics));
        } else {
          _setManpowerTimephasedData([]);
        }
      }

      // Fetch DPR-level custom activities for all sheets
      const [customEhv, customPss, custom33kv, customStoneColumn, customErection, customMachinery] = await Promise.all([
        getCustomActivities(projectId, 'wind_ehv'),
        getCustomActivities(projectId, 'wind_pss'),
        getCustomActivities(projectId, 'wind_33kv'),
        getCustomActivities(projectId, 'wind_stone_column'),
        getCustomActivities(projectId, 'wind_erection'),
        getCustomActivities(projectId, 'wind_machinery'),
      ]);
      setCustomEhvActivities(customEhv);
      setCustomPssActivities(customPss);
      setCustom33kvActivities(custom33kv);
      setCustomStoneColumnActivities(customStoneColumn);
      setCustomErectionActivities(customErection);
      setCustomMachineryActivities(customMachinery);
    } catch (error) {
      console.error("Failed to load wind activities:", error);
      toast.error("Failed to load wind activities");
    } finally {
      setLoading(false);
    }
  }, [projectId, projectName, activityDateFilter]);

  useEffect(() => {
    fetchWindActivities();
  }, [fetchWindActivities]);

  const applyDraftOverlay = useCallback((rows: any[], draftRows: any[]) => {
    if (!draftRows || draftRows.length === 0) return rows;
    return rows.map(r => {
      const draft = draftRows.find((d: any) => 
        (d.activityObjectId && r.activityObjectId && String(d.activityObjectId) === String(r.activityObjectId)) || 
        (d.activityId && r.activityId && String(d.activityId) === String(r.activityId))
      );
      if (draft) {
        return {
          ...r,
          ...draft,
          _cellStatuses: { ...(r._cellStatuses || {}), ...(draft._cellStatuses || {}) }
        };
      }
      return r;
    });
  }, []);

  useEffect(() => {
    if (!currentDraftEntry) return;
    const draftData = typeof currentDraftEntry?.data_json === 'string' 
      ? JSON.parse(currentDraftEntry.data_json) 
      : (currentDraftEntry?.data_json || {});
    const draftRows = draftData.rows || [];

    // Manpower (Contractor) has no P6 rows to overlay onto if Mandvi
    if (activeTab === 'manpower_details_2') {
      const draftId = currentDraftEntry?.id ?? null;
      const sameDraft = draftId === prevContractorDraftIdRef.current;
      
      if (isMandvi) {
        if (!(contractorManpowerDirtyRef.current && sameDraft)) {
          contractorManpowerDirtyRef.current = false;
          prevContractorDraftIdRef.current = draftId;
          // Ordered on the way in, so the list that is saved back is already in the standing
          // order - a sheet read straight from storage (a PM's view, an export) then matches the
          // dates either side of it instead of following whatever order that date was left in.
          _setManpowerTimephasedData(
            draftRows.length
              ? orderWindContractorRows(draftRows.map((r: any) => r.id ? r : { ...r, id: Date.now().toString(36) + Math.random().toString(36).substring(2, 9) }))
              : buildWindContractorManpowerRows()
          );
        }
      } else {
        if (draftRows.length > 0) {
          _setManpowerTimephasedData(prev => applyDraftOverlay(prev, draftRows));
        }
      }
      return;
    }

    if (draftRows.length === 0) return;

    if (activeTab === 'wind_progress') setWindProgressData(prev => applyDraftOverlay(prev, draftRows));
    if (activeTab === 'wind_pss') setWindPssData(prev => applyDraftOverlay(prev, draftRows));
    if (activeTab === 'wind_ehv') setWindEhvData(prev => applyDraftOverlay(prev, draftRows));
    if (activeTab === 'wind_33kv') setWind33kvData(prev => applyDraftOverlay(prev, draftRows));
    if (activeTab === 'wind_stone_column') setWindStoneColumnData(prev => applyDraftOverlay(prev, draftRows));
    if (activeTab === 'wind_erection') setWindErectionData(prev => applyDraftOverlay(prev, draftRows));
    if (activeTab === 'wind_machinery') setWindMachineryData(prev => applyDraftOverlay(prev, draftRows));
  }, [currentDraftEntry, activeTab, applyDraftOverlay]);

  // Sync available filters back up to parent
  useEffect(() => {
    if (onFiltersLoaded && windProgressData.length > 0) {
      const subs = new Set<string>();
      const grps = new Set<string>();
      const acts = new Set<string>();
      
      subs.add("ALL");
      grps.add("ALL");
      acts.add("ALL");

      const extractWtg = (str: string) => {
        const match = str.match(/WTG[\s\-_.]*0*(\d+[a-zA-Z]?)/i);
        if (!match) return null;
        const num = match[1].toUpperCase();
        // Exclude false positives from "33KV" electrical activities
        if (num === '33K' || num === '33KV') return null;
        return num;
      };

      // Build a map for locations: WTG number -> best display name
      const wtgMap = new Map<string, string>();
      wtgMap.set("ALL", "ALL");

      windProgressData.forEach(row => {
        if (!row.isCategoryRow) {
          // Process locations
          const processLoc = (rawLoc: string) => {
            const locTrimmed = rawLoc.trim();
            if (locTrimmed) {
              const wtgNum = extractWtg(locTrimmed);
              if (wtgNum) {
                const existing = wtgMap.get(wtgNum);
                if (!existing || locTrimmed.length > existing.length) {
                  wtgMap.set(wtgNum, locTrimmed.toUpperCase());
                }
              }
            }
          };

          if (row.locations) {
            processLoc(row.locations);
          }
          
          if (row.description) {
            const match = row.description.match(/(WTG[\s\-_.]*\d+[a-zA-Z]?)/i);
            if (match) processLoc(match[1]);
          }
        }

        if (row.substation) subs.add(row.substation.toUpperCase().trim());
        if (row.activityGroup) grps.add(row.activityGroup.toUpperCase().trim());
        const base = extractActivityBaseWind(row.description || '');
        if (base) acts.add(base.trim());
      });

      onFiltersLoaded({
        locations: Array.from(wtgMap.values()).sort((a, b) => {
          if (a === "ALL") return -1;
          if (b === "ALL") return 1;
          return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
        }),
        substations: Array.from(subs).sort((a, b) => {
          if (a === "ALL") return -1;
          if (b === "ALL") return 1;
          return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
        }),
        activityGroups: Array.from(grps).sort((a, b) => {
          if (a === "ALL") return -1;
          if (b === "ALL") return 1;
          return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
        }),
        activities: Array.from(acts).sort((a, b) => {
          if (a === "ALL") return -1;
          if (b === "ALL") return 1;
          return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
        })
      });
    }
  }, [windProgressData, onFiltersLoaded]);

  const derivedWindSummaryData = useMemo(() => {
    if (!Array.isArray(windProgressData) || windProgressData.length === 0) return [];

    const isMandvi = projectName.toLowerCase().includes('mandvi');
    const isMundraNorthNew = projectName.toLowerCase().includes('mundra north-new') || projectName.toLowerCase().includes('mundra north - new');

    let civilActivities = [
      'Stone column', 'Approach Road', 'Excavation', 'PCC', 'Steel Binding',
      'Raft Casting', 'Grouting', 'WTG earthing', 'Curing', 'Ready for Erection',
      'USS precast Installation', 'Road Construction (For WTG Erection)', 'Crane pad Construction'
    ];
    let electricalActivities = ['HT Cable Laying & Termination', 'USS Erection', 'USS Earthing', 'USS Testing', 'USS CFT'];

    if (isMandvi) {
      civilActivities = civilActivities.filter(a => !['WTG earthing', 'Stone column'].includes(a));
      electricalActivities = electricalActivities.filter(a => a !== 'HT Cable Laying & Termination');
    } else if (isMundraNorthNew) {
      civilActivities = civilActivities.filter(a => a !== 'Stone column');
      electricalActivities = electricalActivities.filter(a => a !== 'HT Cable Laying & Termination');
    }

    const masterGroups = [
      {
        name: 'CIVIL WORKS',
        color: '#D1E9FF',
        activities: civilActivities
      },
      {
        name: 'WTG ERECTION WORKS (ERW)',
        color: '#F0D1FF',
        activities: ['WTG Erection', 'WTG MCC', 'WTG Pre-commissioning']
      },
      {
        name: 'ELECTRICAL WORKS',
        color: '#FFF4D1',
        activities: electricalActivities
      },
      {
        name: 'TESTING & COMMISSIONING',
        color: '#D1FFD7',
        activities: [
          'CEIG Approval', 'FTC Approval', '33kV Feeder Charging', 'USS charging',
          'WTG Commissioning', 'WTG Trial Run', 'WTG COD'
        ]
      }
    ];

    const stats: Record<string, any> = {};

    const parseDateHelper = (dStr: string) => {
      if (!dStr || dStr === '-' || dStr === '0') return null;
      const parts = dStr.split('-');
      if (parts.length === 3) {
        if (parts[0].length === 4) return new Date(dStr);
        const day = parseInt(parts[0]);
        const mStr = parts[1];
        const yrShort = parseInt(parts[2]);
        const mNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        const mIdx = mNames.indexOf(mStr);
        if (mIdx !== -1) {
          const yr = yrShort + (yrShort < 70 ? 2000 : 1900);
          return new Date(yr, mIdx, day);
        }
      }
      return null;
    };

    const today = new Date();
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - today.getDay());
    startOfWeek.setHours(0, 0, 0, 0);
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    endOfWeek.setHours(23, 59, 59, 999);

    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    startOfMonth.setHours(0, 0, 0, 0);
    const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    endOfMonth.setHours(23, 59, 59, 999);

    windProgressData.forEach(p => {
      if (p.isCategoryRow) return;
      const grp = (p.activityGroup || '').trim().toUpperCase();
      const actId = (p.activityId || '').trim().toUpperCase();
      const fullDesc = (p.description || "").trim();
      const descLower = fullDesc.toLowerCase();

      // Exhaustive check to exclude Non-Construction activities (PR, ENG, PM)
      if (grp.includes('ENG') || grp.includes('PROC') || grp.includes('PM') || grp === 'PR') return;
      if (actId.includes('-ENG-') || actId.includes('-PR-') || actId.includes('-PM-')) return;
      if (descLower.includes('ordering') || descLower.includes('engineering') || descLower.includes('procurement') || descLower.startsWith('engg')) return;

      // Extract the activity name from the description.
      // Descriptions follow patterns like:
      //   "WTG1-CW-Stone Column"     → activity = "Stone Column"
      //   "WTG1-ERW-WTG Erection"    → activity = "WTG Erection"
      //   "WTG2-CW-Road Construction (For WTG Erection)" → activity = "Road Construction (For WTG Erection)"
      //   "WTG1-EL-HT Cable Laying & Termination"        → activity = "HT Cable Laying & Termination"
      //   "WTG1-TC-CEIG Approval"     → activity = "CEIG Approval"
      // We split on the FIRST TWO dash-separated segments (WTG+code), rest is the activity name.

      let activityName = fullDesc;

      // Pattern: WTGn-CODE-ActivityName  (e.g., WTG1-CW-Stone Column, WTG1-T&C-CEIG Approval)
      // CODE can be any short segment (CW, ELW, ERW, T&C, TC, PSS, etc.)
      const twoPartPrefix = fullDesc.match(/^(?:WTG\d+|[A-Z\d]+)[-_]([^-_]{1,6})[-_](.+)$/i);
      if (twoPartPrefix) {
        activityName = twoPartPrefix[2].trim();
      } else {
        // Pattern: WTGn-ActivityName (e.g., WTG1-Stone Column)
        const onePartPrefix = fullDesc.match(/^(?:WTG\d+)[-_](.+)$/i);
        if (onePartPrefix) {
          activityName = onePartPrefix[1].trim();
        }
      }

      // Strip trailing feeder tags like "(F-01)", "- FDR01" only — not general text like "(For WTG Erection)"
      const activityNameClean = activityName.replace(/\s*(?:-\s*|\()(?:FDR-?\d+|F-?\d+)(?:\))?\s*$/i, '').trim();

      // EXACT match against master activities (case-insensitive)
      let matchedName = '';
      for (const group of masterGroups) {
        const found = group.activities.find(act => {
          // Normalize: lowercase, collapse multiple spaces, trim
          const masterNorm = act.toLowerCase().replace(/\s+/g, ' ').trim();
          const extractedNorm = activityNameClean.toLowerCase().replace(/\s+/g, ' ').trim();
          const fullDescNorm = fullDesc.toLowerCase().replace(/\s+/g, ' ').trim();

          if (extractedNorm === masterNorm || fullDescNorm.includes(masterNorm)) return true;

          // Custom mapping for Foundation to match Raft Casting
          if (masterNorm === 'raft casting' && (extractedNorm === 'wtg foundation' || extractedNorm === 'foundation' || fullDescNorm.includes('wtg foundation'))) {
            return true;
          }

          // Handle missing "WTG ", "USS ", or "33kV " prefixes in the extracted name
          const withoutWtgMaster = masterNorm.replace(/^wtg\s+/, '');
          const withoutUssMaster = masterNorm.replace(/^uss\s+/, '');
          const without33kvMaster = masterNorm.replace(/^33kv\s+/, '');
          
          if (extractedNorm === withoutWtgMaster || fullDescNorm.includes(withoutWtgMaster)) {
            // Avoid collisions between WTG and USS for "earthing" and "erection"
            if (withoutWtgMaster === 'earthing') return fullDesc.toUpperCase().includes('-CW-') || fullDesc.toUpperCase().includes(' WTG ');
            if (withoutWtgMaster === 'erection') {
              if (fullDescNorm.includes('road construction')) return false;
              return fullDesc.toUpperCase().includes('-ERW-') || fullDesc.toUpperCase().includes('ERECTION WORKS');
            }
            return true;
          }

          if (extractedNorm === withoutUssMaster || fullDescNorm.includes(withoutUssMaster)) {
            if (withoutUssMaster === 'earthing') return fullDesc.toUpperCase().includes('-EL') || fullDesc.toUpperCase().includes('USS');
            if (withoutUssMaster === 'erection') return fullDesc.toUpperCase().includes('-EL') || fullDesc.toUpperCase().includes('USS');
            return true;
          }

          if (extractedNorm === without33kvMaster || fullDescNorm.includes(without33kvMaster)) {
            return true;
          }

          // Custom fallback matching for historically problematic activities
          if (masterNorm === 'ht cable laying & termination') {
            if (fullDescNorm.includes('ht cable') || fullDescNorm.includes('cable laying') || (fullDescNorm.includes('cable') && fullDesc.toUpperCase().includes('EL'))) {
              return true;
            }
          }
          if (masterNorm === 'uss earthing') {
            // Civil earthing is processed first, so any remaining earthing for a WTG is guaranteed to be USS Earthing
            if (fullDescNorm.includes('earthing') || fullDescNorm.includes('earth pit')) return true;
          }

          return false;
        });

        if (found) {
          matchedName = found;
          break;
        }
      }

      if (matchedName) {
        // Enforce that WTG-specific activities MUST belong to a WTG location
        const isWtg = (p.locations || "").toUpperCase().startsWith("WTG");
        const actLower = matchedName.toLowerCase();
        const isWtgSpecificAct = actLower.includes('wtg') || actLower.includes('uss') || actLower.includes('cable') || 
                                 actLower.includes('stone column') || actLower.includes('excavation') || 
                                 actLower.includes('pcc') || actLower.includes('steel binding') || 
                                 actLower.includes('raft casting') || actLower.includes('grouting') || 
                                 actLower.includes('crane pad');
        
        if (isWtgSpecificAct && !isWtg) {
           return; // Skip counting this rogue match (e.g., a PSS activity accidentally matching USS Erection)
        }

        if (!stats[matchedName]) {
          stats[matchedName] = { scope: 0, achieved: 0, weeklyPlan: 0, weeklyAchieved: 0, monthlyPlan: 0, monthlyAchieved: 0, _locs: new Set(), _achievedLocs: new Set() };
        }
        const s = stats[matchedName];
        
        if (p.locations && p.locations.trim() !== '') {
          s._locs.add(p.locations.trim().toUpperCase());
          s.scope = s._locs.size;
          if (matchedName === 'USS Earthing') {
             console.log(`[DEBUG USS] Matched USS Earthing for location: ${p.locations.trim().toUpperCase()} | Activity: ${fullDesc}`);
          }
        } else {
          s.scope += 1;
        }

        const scopeNum = Number(p.scope) || 0;
        const compNum = Number(p.completed) || 0;

        // REQUIREMENT: only status === 'Completed' counts as achieved
        const isDone = p.status === 'Completed';

        if (isDone) {
          if (p.locations && p.locations.trim() !== '') {
            s._achievedLocs.add(p.locations.trim().toUpperCase());
            s.achieved = s._achievedLocs.size;
          } else {
            s.achieved += 1;
          }
        }

        // Use Baseline Start for Plan as per user request
        const planDate = parseDateHelper(p.baselineStart || p.plannedStart || p.baselineStartDate);
        // Use Actual Finish for Achieved
        const achDate = parseDateHelper(p.actualFinish);

        if (planDate && planDate >= startOfWeek && planDate <= endOfWeek) {
          s.weeklyPlan += 1;
          if (matchedName === 'PCC') {
            console.log(`[PCC Debug] Found Weekly Plan Activity: ${p.activityId} - ${fullDesc}. Baseline Start: ${planDate.toISOString()}`);
          }
        }
        if (achDate && achDate >= startOfWeek && achDate <= endOfWeek) s.weeklyAchieved += 1;
        if (planDate && planDate >= startOfMonth && planDate <= endOfMonth) s.monthlyPlan += 1;
        if (achDate && achDate >= startOfMonth && achDate <= endOfMonth) s.monthlyAchieved += 1;
      }
    });

    const finalResult: any[] = [];
    masterGroups.forEach(g => {
      if (g.activities.length >= 2) {
        finalResult.push({ isCategoryRow: true, description: g.name, backgroundColor: g.color });
      }
      g.activities.forEach(actName => {
        const s = stats[actName] || { scope: 0, achieved: 0, weeklyPlan: 0, weeklyAchieved: 0, monthlyPlan: 0, monthlyAchieved: 0 };
        finalResult.push({
          description: actName,
          scope: String(s.scope),
          achieved: String(s.achieved),
          balance: String(Math.max(0, s.scope - s.achieved)),
          weeklyPlan: String(s.weeklyPlan),
          weeklyAchieved: String(s.weeklyAchieved),
          weeklyBalance: String(Math.max(0, s.weeklyPlan - s.weeklyAchieved)),
          cumulativePlan: String(s.monthlyPlan),
          cumulativeAchieved: String(s.monthlyAchieved),
          cumulativeBalance: String(Math.max(0, s.monthlyPlan - s.monthlyAchieved)),
        });
      });
    });
    return finalResult;
  }, [windProgressData, extractActivityBaseWind]);

  // Prepare Wind Heatmap Data
  const windHeatmapData = useMemo(() => {
    if (!windProgressData || windProgressData.length === 0) return { blocks: [], activities: [], matrix: [] };

    const blockSet = new Set<string>();
    const activitySet = new Set<string>();
    
    // Key activities for Wind heatmap
    let keyActivities = [
      'Stone column', 'Excavation', 'PCC', 'Steel Binding', 'Raft Casting',
      'Grouting', 'Crane pad Construction', 'WTG Erection', 'WTG MCC',
      'HT Cable Laying & Termination', 'USS Erection', 'WTG Commissioning'
    ];

    if (projectName.toLowerCase().includes('mandvi')) {
      keyActivities = keyActivities.filter(a => !['Stone column', 'WTG earthing', 'HT Cable Laying & Termination'].includes(a));
    } else if (projectName.toLowerCase().includes('mundra north-new') || projectName.toLowerCase().includes('mundra north - new')) {
      keyActivities = keyActivities.filter(a => !['Stone column', 'HT Cable Laying & Termination'].includes(a));
    }

    keyActivities.forEach(act => activitySet.add(act.toUpperCase()));

    const dataMap: Record<string, Record<string, { progress: number; delay: number }>> = {};

    windProgressData.forEach(row => {
      if (row.isCategoryRow || !row.locations) return;
      
      const block = row.locations.toUpperCase();
      const cleanAct = extractActivityBaseWind(row.description || "").toUpperCase();

      // Find matching key activity
      const masterAct = keyActivities.find(ka => cleanAct.includes(ka.toUpperCase()) || ka.toUpperCase().includes(cleanAct));
      if (!masterAct) return;

      const actKey = masterAct.toUpperCase();
      blockSet.add(block);

      if (!dataMap[block]) dataMap[block] = {};
      
      const progress = (row.status === 'Completed' || row.completionPercentage === '100') ? 100 : 
                       (row.status === 'In Progress' ? 50 : 0);

      // Delay calculation for Wind
      let delay = 0;
      if (progress < 100 && row.baselineFinish) {
        const finishDate = new Date(row.baselineFinish);
        const today = new Date();
        if (finishDate < today) {
          delay = Math.floor((today.getTime() - finishDate.getTime()) / (1000 * 3600 * 24));
        }
      }

      dataMap[block][actKey] = { progress, delay };
    });

    const sortedBlocks = Array.from(blockSet).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    const sortedActivities = Array.from(activitySet);

    const matrix: [number, number, number, number][] = [];
    sortedBlocks.forEach((b, bIdx) => {
      sortedActivities.forEach((a, aIdx) => {
        if (dataMap[b] && dataMap[b][a]) {
          matrix.push([bIdx, aIdx, dataMap[b][a].progress, dataMap[b][a].delay]);
        } else {
          matrix.push([bIdx, aIdx, 0, 0]);
        }
      });
    });

    return { blocks: sortedBlocks, activities: sortedActivities, matrix };
  }, [windProgressData, extractActivityBaseWind]);

  // Sync summary data with derived data
  useEffect(() => {
    if (activeTab === 'wind_summary' && derivedWindSummaryData.length > 0) {
      // If the current summary data is all zeros but the derived data has info, sync it
      const currentScopeTotal = windSummaryData.reduce((acc, row) => acc + (Number(row.scope) || 0), 0);
      const derivedScopeTotal = derivedWindSummaryData.reduce((acc, row) => acc + (Number(row.scope) || 0), 0);

      if (currentScopeTotal === 0 && derivedScopeTotal > 0) {
        setWindSummaryData(derivedWindSummaryData);
      } else if (windSummaryData.length === 0) {
        setWindSummaryData(derivedWindSummaryData);
      }
    }
  }, [activeTab, derivedWindSummaryData, windSummaryData.length]);

  const autoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (isEntryReadOnly || (!windProgressData.length && !wind33kvData.length && !windStoneColumnData.length && !windErectionData.length && !windPssData.length && !windEhvData.length)) return;

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
    windProgressData, wind33kvData, windStoneColumnData, windErectionData, windPssData, windEhvData,
    windManpowerData, manpowerTimephasedData, isEntryReadOnly, activeTab
  ]);

  const handleSaveEntry = async (isAutoSave: boolean = false) => {
    if (!currentDraftEntry) return;
    try {
      let currentData: any[] = [];
      switch (activeTab) {
        case 'wind_summary': currentData = windSummaryData; break;
        case 'wind_progress': currentData = windProgressData; break;
        case 'wind_33kv': currentData = wind33kvData; break;
        case 'wind_pss': currentData = windPssData; break;
        case 'wind_ehv': currentData = windEhvData; break;
        case 'wind_stone_column': currentData = windStoneColumnData; break;
        case 'wind_erection': currentData = windErectionData; break;
        case 'wind_manpower': currentData = windManpowerData; break;
        case 'manpower_details_2': currentData = manpowerTimephasedData; break;
        case 'wind_machinery': currentData = windMachineryData; break;
        default: return;
      }

      // Manpower (Contractor) is a standalone manual grid - its rows exist only in the draft, so
      // the whole sheet is saved rather than a _cellStatuses delta, otherwise a row typed but not
      // yet marked, or a row deleted, would never reach the draft.
      const isStandaloneGrid = activeTab === 'manpower_details_2' && isMandvi;
      const deltaRows = isStandaloneGrid ? currentData : currentData.filter((row: any) => {
        if (row.isCategoryRow) return false;

        // Use cell metadata (highlights/edits) as the primary indicator for delta tracking
        const hasMetadata = row._cellStatuses && Object.keys(row._cellStatuses).length > 0;
        
        // For non-Mandvi manpower timephased, check actual values
        const hasValues = activeTab === 'manpower_details_2' && !isMandvi && Object.keys(row).some(k => k.startsWith('actual_') && parseFloat(row[k]) > 0);
        
        if (hasMetadata || hasValues) return true;

        // Manual override for specific fields if needed
        return false;
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

      if (activeTab === 'wind_manpower') {
        dataToSave.totalManpower = windManpowerData[0]?.totalManpower || 0; // Or calculate if needed
      }

      // A partial save merges rows into the stored draft keyed on activityId / description. This
      // sheet's rows carry neither, so every row would key to nothing and the backend would APPEND
      // it on each save - the same way BESS Productivity grew to over a million rows. It saves
      // whole instead, which also lets a deleted row stay deleted. Issues live in the same
      // data_json blob, so carry them across the overwrite.
      if (isStandaloneGrid) {
        const existing = typeof currentDraftEntry?.data_json === 'string'
          ? JSON.parse(currentDraftEntry.data_json)
          : (currentDraftEntry?.data_json || {});
        if (existing?.issues) dataToSave.issues = existing.issues;
      }

      await saveDraftEntry(currentDraftEntry.id, dataToSave, !isStandaloneGrid);
      if (!isAutoSave) {
        if (isStandaloneGrid) {
          // The whole grid is written, standing activity list included, so deltaRows counts every
          // row rather than the ones actually filled in - reporting "10 activities" for a single
          // contractor entered. Count what the supervisor put in instead.
          const hasEntry = (r: any) =>
            !!(r.contractor || r.soScope || r.uom)
            || Object.values(r.agreedValues || {}).some((v: any) => String(v ?? '').trim())
            || Object.values(r.availableValues || {}).some((v: any) => String(v ?? '').trim());
          const filled = deltaRows.filter(hasEntry).length;
          toast.success(filled
            ? `Saved ${filled} contractor ${filled === 1 ? 'entry' : 'entries'}`
            : "Sheet saved");
        } else {
          toast.success(`Updated ${deltaRows.length} activities successfully!`);
        }
      }
    } catch (error) {
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
      const correctDraft = await getDraftEntry(projectId, activeTab, targetDate);
      if (correctDraft) onDraftUpdate(correctDraft);
      return;
    }

    try {
      toast.info("Saving recent changes before submitting...");
      await new Promise(resolve => setTimeout(resolve, 2500));
      
      await handleSaveEntry(true); // Save first before submitting
      // Pass activeTab as sheetType for backend validation
      const response = await submitEntry(currentDraftEntry.id, "Submitted from Sheet", activeTab);
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
        const updatedDraft = await getDraftEntry(projectId, activeTab, targetDate);
        if (updatedDraft) onDraftUpdate(updatedDraft);
      }
    } catch (error: any) {
      toast.error(error?.response?.data?.detail || error?.message || "P6 Push failed");
    }
  };
  /**
   * Handle adding a DPR-level custom activity.
   * Creates via API and refreshes the corresponding sheet's custom activities.
   */
  const handleAddCustomActivity = async (activity: any, silent: boolean = false) => {
    try {
      let p6DataForCheck: any[] = [];
      switch(activity.sheetType) {
        case 'wind_ehv': p6DataForCheck = ehvData; break;
        case 'wind_pss': p6DataForCheck = pssData; break;
        case 'wind_33kv': p6DataForCheck = data33kv; break;
        case 'wind_progress': p6DataForCheck = windProgressData; break;
        case 'wind_stone_column': p6DataForCheck = stoneColumnData; break;
        case 'wind_erection': p6DataForCheck = erectionData; break;
        case 'wind_machinery': p6DataForCheck = machineryData; break;
      }
      const existingActs = [
        ...(customActivitiesMap[activity.sheetType] || []),
        ...p6DataForCheck
      ];
      const lowerNewDesc = String(activity.description || '').trim().toLowerCase();
      let isDuplicate = false;
      if (lowerNewDesc !== '' && !lowerNewDesc.startsWith('new ')) {
        isDuplicate = existingActs.some((a: any) => {
          const actName = String(a.description || a.subHeading || a.name || '').trim().toLowerCase();
          return actName === lowerNewDesc;
        });
      }
        if (isDuplicate) {
          if (!silent) toast.error("Activity already exists, no duplication in DPR level activities.");
          return;
        }

      const created = await createCustomActivity({
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

      if (created) {
        if (!silent) {
          toast.success(`DPR Activity "${activity.description}" added successfully!`);
        }

        // Refresh the custom activities for the relevant sheet
        const sheetType = activity.sheetType;
        const refreshed = await getCustomActivities(projectId, sheetType);
        if (sheetType === 'wind_ehv') setCustomEhvActivities(refreshed);
        else if (sheetType === 'wind_pss') setCustomPssActivities(refreshed);
        else if (sheetType === 'wind_33kv') setCustom33kvActivities(refreshed);
        else if (sheetType === 'wind_stone_column') setCustomStoneColumnActivities(refreshed);
        else if (sheetType === 'wind_erection') setCustomErectionActivities(refreshed);
        else if (sheetType === 'wind_machinery') setCustomMachineryActivities(refreshed);
      }
    } catch (error) {
      console.error("Failed to add custom activity:", error);
      toast.error("Failed to add DPR activity");
    }
  };

  const handleBulkUploadActivities = async (activities: any[]) => {
    try {
      const created = await bulkCreateCustomActivities(projectId, bulkUploadSheetType, activities);
      if (created && created.length > 0) {
        toast.success(`Successfully uploaded ${created.length} DPR activities!`);
        
        // Refresh the custom activities for the relevant sheet
        const refreshed = await getCustomActivities(projectId, bulkUploadSheetType);
        if (bulkUploadSheetType === 'wind_ehv') setCustomEhvActivities(refreshed);
        else if (bulkUploadSheetType === 'wind_pss') setCustomPssActivities(refreshed);
        else if (bulkUploadSheetType === 'wind_33kv') setCustom33kvActivities(refreshed);
        else if (bulkUploadSheetType === 'wind_stone_column') setCustomStoneColumnActivities(refreshed);
        else if (bulkUploadSheetType === 'wind_erection') setCustomErectionActivities(refreshed);
        else if (bulkUploadSheetType === 'wind_machinery') setCustomMachineryActivities(refreshed);
      }
    } catch (error) {
      console.error("Failed to bulk upload activities:", error);
      toast.error("Failed to upload DPR activities");
    }
  };

  const handleEditCustomActivity = async (activity: any) => {
    try {
      if (!activity.id) return;
      
      let p6DataForCheck: any[] = [];
      switch(activity.sheetType) {
        case 'wind_ehv': p6DataForCheck = ehvData; break;
        case 'wind_pss': p6DataForCheck = pssData; break;
        case 'wind_33kv': p6DataForCheck = data33kv; break;
        case 'wind_progress': p6DataForCheck = windProgressData; break;
        case 'wind_stone_column': p6DataForCheck = stoneColumnData; break;
        case 'wind_erection': p6DataForCheck = erectionData; break;
        case 'wind_machinery': p6DataForCheck = machineryData; break;
      }
      const existingActs = [
        ...(customActivitiesMap[activity.sheetType] || []),
        ...p6DataForCheck
      ];
      
      const lowerNewDesc = String(activity.description || '').trim().toLowerCase();
      if (lowerNewDesc !== '') {
        const isDuplicate = existingActs.some((a: any) => {
          if (a.id === activity.id) return false;
          const actName = String(a.description || a.subHeading || a.name || '').trim().toLowerCase();
          return actName === lowerNewDesc;
        });
        if (isDuplicate) {
          toast.error("Activity already exists, no duplication in DPR level activities.");
          return;
        }
      }

      // Optimistically update the frontend state BEFORE the API call so typing is synchronous and lag-free
      const sheetType = activity.sheetType;
      const updater = (prev: any[]) => prev.map(a => a.id === activity.id ? { ...a, ...activity } : a);
      
      if (sheetType === 'wind_ehv') setCustomEhvActivities(updater);
      else if (sheetType === 'wind_pss') setCustomPssActivities(updater);
      else if (sheetType === 'wind_33kv') setCustom33kvActivities(updater);
      else if (sheetType === 'wind_stone_column') setCustomStoneColumnActivities(updater);
      else if (sheetType === 'wind_erection') setCustomErectionActivities(updater);
      else if (sheetType === 'wind_machinery') setCustomMachineryActivities(updater);

      updateCustomActivity(activity.id, {
        description: activity.description,
        uom: activity.uom,
        scope: activity.scope,
        wbsName: activity.wbsName,
        category: activity.category,
        plannedStart: activity.plannedStart,
        plannedFinish: activity.plannedFinish,
        remarks: activity.remarks,
        extraData: activity.extraData,
      }).catch(err => {
        console.error("API failed to update custom activity", err);
        toast.error("Failed to save changes. Please try again.");
      });
    } catch (error) {
      console.error("Failed to update custom activity:", error);
      toast.error("Failed to update DPR activity");
    }
  };

  const handleDeleteCustomActivity = async (id: number) => {
    try {
      if (window.confirm("Are you sure you want to delete this DPR Activity? This action cannot be undone.")) {
        const success = await deleteCustomActivity(id);
        if (success) {
          toast.success("DPR Activity deleted successfully!");
          if (customEhvActivities.some(a => a.id === id)) {
            setCustomEhvActivities(await getCustomActivities(projectId, 'wind_ehv'));
          } else if (customPssActivities.some(a => a.id === id)) {
            setCustomPssActivities(await getCustomActivities(projectId, 'wind_pss'));
          } else if (custom33kvActivities.some(a => a.id === id)) {
            setCustom33kvActivities(await getCustomActivities(projectId, 'wind_33kv'));
          } else if (customStoneColumnActivities.some(a => a.id === id)) {
            setCustomStoneColumnActivities(await getCustomActivities(projectId, 'wind_stone_column'));
          } else if (customErectionActivities.some(a => a.id === id)) {
            setCustomErectionActivities(await getCustomActivities(projectId, 'wind_erection'));
          } else if (customMachineryActivities.some(a => a.id === id)) {
            setCustomMachineryActivities(await getCustomActivities(projectId, 'wind_machinery'));
          }
        }
      }
    } catch (error) {
      console.error("Failed to delete custom activity:", error);
      toast.error("Failed to delete DPR activity");
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
      case 'wind_summary':
        return (
          <div className="space-y-6">
            <WindSummaryTable
              data={windSummaryData}
              setData={setWindSummaryData}
              onSave={isEntryReadOnly ? undefined : handleSaveEntry}
              onSubmit={isEntryReadOnly ? undefined : handleSubmitEntry}
              isLocked={isEntryReadOnly}
              status={entryStatus}
              projectId={projectId}
            />
          </div>
        );
      case 'wind_progress':
        return (
          <>
            <RejectedAlert />
            <WindProgressTable
              data={windProgressData}
              setData={setWindProgressData}
              onSave={isEntryReadOnly ? undefined : handleSaveEntry}
              onSubmit={isEntryReadOnly ? undefined : handleSubmitEntry}
              yesterday={targetYesterday}
              today={targetDate}
              isLocked={isEntryReadOnly}
              status={entryStatus}
              projectId={projectId}
              selectedSubstation={selectedSubstation}
              selectedLocation={selectedLocation}
              selectedActivityGroup={selectedActivityGroup}
              selectedActivity={selectedActivity}
              resourcesByActivity={resourcesByActivity}
              activityDateFilter={activityDateFilter}
              onBulkUploadActivities={() => { setBulkUploadSheetType('wind_progress'); setIsBulkUploadModalOpen(true); }}
            />
          </>
        );
      case 'wind_33kv': {
        const isNonKhavda = projectDetails?.parentEps?.toLowerCase().includes('outside khavda') || projectDetails?.parentEps?.toLowerCase().includes('mandvi') || projectDetails?.parentEps?.toLowerCase().includes('mundra');
        
        return (
          <>
            <RejectedAlert />
            {isNonKhavda ? (
              <Wind33KVOHTable
                data={wind33kvData}
                setData={setWind33kvData}
                onSave={isEntryReadOnly ? undefined : handleSaveEntry}
                onSubmit={isEntryReadOnly ? undefined : handleSubmitEntry}
                isLocked={isEntryReadOnly}
                status={entryStatus}
                projectId={projectId}
                customActivities={custom33kvActivities}
                onAddCustomActivity={handleAddCustomActivity}
                onEditCustomActivity={handleEditCustomActivity}
                onDeleteCustomActivity={handleDeleteCustomActivity}
                onBulkUploadActivities={() => { setBulkUploadSheetType('wind_33kv'); setIsBulkUploadModalOpen(true); }}
                projectDetails={projectDetails}
                dynamicActivityTypes={dynamic33kvColumns}
              />
            ) : (
              <Wind33KVTable
                data={wind33kvData}
                setData={setWind33kvData}
                onSave={isEntryReadOnly ? undefined : handleSaveEntry}
                onSubmit={isEntryReadOnly ? undefined : handleSubmitEntry}
                isLocked={isEntryReadOnly}
                status={entryStatus}
                projectId={projectId}
                customActivities={custom33kvActivities}
                onAddCustomActivity={handleAddCustomActivity}
                onEditCustomActivity={handleEditCustomActivity}
                onDeleteCustomActivity={handleDeleteCustomActivity}
                onBulkUploadActivities={() => { setBulkUploadSheetType('wind_33kv'); setIsBulkUploadModalOpen(true); }}
                projectDetails={projectDetails}
              />
            )}
          </>
        );
      }
      case 'wind_erection':
        return (
          <>
            <RejectedAlert />
            <WindErectionTable
              data={windErectionData}
              setData={setWindErectionData}
              onSave={isEntryReadOnly ? undefined : handleSaveEntry}
              onSubmit={isEntryReadOnly ? undefined : handleSubmitEntry}
              isLocked={isEntryReadOnly}
              status={entryStatus}
              projectId={projectId}
              customActivities={customErectionActivities}
              onAddCustomActivity={handleAddCustomActivity}
              onEditCustomActivity={handleEditCustomActivity}
              onDeleteCustomActivity={handleDeleteCustomActivity}
              onBulkUploadActivities={() => { setBulkUploadSheetType('wind_erection'); setIsBulkUploadModalOpen(true); }}
            />
          </>
        );
      case 'wind_stone_column':
        return (
          <>
            <RejectedAlert />
            <WindStoneColumnTable
              data={windStoneColumnData}
              setData={setWindStoneColumnData}
              onSave={isEntryReadOnly ? undefined : handleSaveEntry}
              onSubmit={isEntryReadOnly ? undefined : handleSubmitEntry}
              isLocked={isEntryReadOnly}
              status={entryStatus}
              projectId={projectId}
              targetDate={targetDate}
              customActivities={customStoneColumnActivities}
              onAddCustomActivity={handleAddCustomActivity}
              onEditCustomActivity={handleEditCustomActivity}
              onDeleteCustomActivity={handleDeleteCustomActivity}
              onBulkUploadActivities={() => { setBulkUploadSheetType('wind_stone_column'); setIsBulkUploadModalOpen(true); }}
            />
          </>
        );
      case 'wind_pss':
        return (
          <>
            <RejectedAlert />
            <WindPSSTable
              data={windPssData}
              setData={setWindPssData}
              onSave={isEntryReadOnly ? undefined : handleSaveEntry}
              onSubmit={isEntryReadOnly ? undefined : handleSubmitEntry}
              isLocked={isEntryReadOnly}
              status={entryStatus}
              projectId={projectId}
              onPush={currentDraftEntry?.status === 'final_approved' ? handlePushToP6 : undefined}
              customActivities={customPssActivities}
              onAddCustomActivity={handleAddCustomActivity}
              onEditCustomActivity={handleEditCustomActivity}
              onDeleteCustomActivity={handleDeleteCustomActivity}
              onBulkUploadActivities={() => { setBulkUploadSheetType('wind_pss'); setIsBulkUploadModalOpen(true); }}
              yesterday={targetYesterday}
              today={targetDate}
            />
          </>
        );
      case 'wind_ehv':
        return (
          <>
            <RejectedAlert />
            <WindEHVTable
              data={windEhvData}
              setData={setWindEhvData}
              onSave={isEntryReadOnly ? undefined : handleSaveEntry}
              onSubmit={isEntryReadOnly ? undefined : handleSubmitEntry}
              isLocked={isEntryReadOnly}
              status={entryStatus}
              projectId={projectId}
              onPush={currentDraftEntry?.status === 'final_approved' ? handlePushToP6 : undefined}
              customActivities={customEhvActivities}
              onAddCustomActivity={handleAddCustomActivity}
              onEditCustomActivity={handleEditCustomActivity}
              onDeleteCustomActivity={handleDeleteCustomActivity}
              onBulkUploadActivities={() => { setBulkUploadSheetType('wind_ehv'); setIsBulkUploadModalOpen(true); }}
            />
          </>
        );
      case 'wind_manpower':
        return (
          <>
            <RejectedAlert />
            <WindManpowerTable
              data={windManpowerData}
              setData={setWindManpowerData}
              onSave={isEntryReadOnly ? undefined : handleSaveEntry}
              onSubmit={isEntryReadOnly ? undefined : handleSubmitEntry}
              yesterday={targetYesterday}
              today={targetDate}
              isLocked={isEntryReadOnly}
              status={entryStatus}
              projectId={projectId}
              selectedLocation={selectedLocation}
              selectedSubstation={selectedSubstation}
              selectedActivityGroup={selectedActivityGroup}
              onDateChange={onDateChange}
              onBulkUploadActivities={() => { setBulkUploadSheetType('wind_manpower'); setIsBulkUploadModalOpen(true); }}
            />
          </>
        );
      case 'manpower_details_2':
        // Wind's Manpower (Contractor) is its own manual grid for Mandvi.
        // For other projects, it uses the shared ManpowerTimephasedTable.
        return (
          <>
            <RejectedAlert />
            {isMandvi ? (
              <WindContractorManpowerTable
                data={manpowerTimephasedData}
                setData={setManpowerTimephasedData}
                onSave={isEntryReadOnly ? undefined : handleSaveEntry}
                onSubmit={isEntryReadOnly ? undefined : handleSubmitEntry}
                isLocked={isEntryReadOnly}
                status={entryStatus}
                projectId={projectId}
                today={targetDate}
              />
            ) : (
              <ManpowerTimephasedTable
                data={manpowerTimephasedData}
                setData={setManpowerTimephasedData}
                selectedBlock={selectedLocation}
                onSave={isEntryReadOnly ? undefined : handleSaveEntry}
                onSubmit={isEntryReadOnly ? undefined : handleSubmitEntry}
                onPush={canPush ? handlePushToP6 : undefined}
                yesterday={targetYesterday}
                today={targetDate}
                isLocked={isEntryReadOnly}
                status={entryStatus}
                projectId={projectId}
                userRole={user?.role || user?.Role}
              />
            )}
          </>
        );
      case 'wind_machinery':
        return (
          <>
            <RejectedAlert />
            <WindMachineryTable
              data={windMachineryData}
              setData={setWindMachineryData}
              onSave={isEntryReadOnly ? undefined : handleSaveEntry}
              onSubmit={isEntryReadOnly ? undefined : handleSubmitEntry}
              isLocked={isEntryReadOnly}
              status={entryStatus}
              projectId={projectId}
              targetDate={targetDate}
              customActivities={customMachineryActivities}
              onAddCustomActivity={handleAddCustomActivity}
              onEditCustomActivity={handleEditCustomActivity}
              onDeleteCustomActivity={handleDeleteCustomActivity}
            />
          </>
        );
      case 'wind_productivity':
        return (
          <>
            <RejectedAlert />
            <WindProductivityTable
              projectId={projectId}
              isLocked={isEntryReadOnly}
              status={entryStatus}
            />
          </>
        );
      default:
        return null;
    }
  };

  const getP6DataForBulkUpload = (type: string) => {
    switch(type) {
      case 'wind_ehv': return ehvData;
      case 'wind_pss': return pssData;
      case 'wind_33kv': return data33kv;
      case 'wind_progress': return windProgressData;
      case 'wind_stone_column': return stoneColumnData;
      case 'wind_erection': return erectionData;
      case 'wind_machinery': return machineryData;
      default: return [];
    }
  };

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex-1 min-h-0">
        {loading && !windProgressData.length ? (
          <div className="flex flex-col items-center justify-center p-12">
            <Package className="w-12 h-12 text-blue-500 animate-spin mb-4" />
            <p className="text-muted-foreground">Loading Wind Progress...</p>
          </div>
        ) : (
          renderActiveTable()
        )}
      </div>
      
      <BulkUploadActivitiesModal
        isOpen={isBulkUploadModalOpen}
        onClose={() => setIsBulkUploadModalOpen(false)}
        onUpload={handleBulkUploadActivities}
        sheetType={bulkUploadSheetType}
        existingActivities={[
          ...(customActivitiesMap[bulkUploadSheetType] || []),
          ...(getP6DataForBulkUpload(bulkUploadSheetType))
        ]}
        templateColumns={getUIColumnsForSheet(bulkUploadSheetType)?.columns}
        templateColumnWidths={getUIColumnsForSheet(bulkUploadSheetType)?.columnWidths}
      />
    </div>
  );
};

