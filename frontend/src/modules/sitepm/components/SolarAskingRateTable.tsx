import React, { useMemo, useEffect, useState } from 'react';
import { SOLAR_SUMMARY_CATEGORIES } from "@/components/SummaryCharts";
import { formatNum } from "@/utils/formatters";
import { getProjectSummaryDraft } from "@/services/dprService";
import { getProjectById } from "@/services/projectService";
import { getDPQtyActivities, mapActivitiesToDPQty } from "@/services/p6ActivityService";
import { Activity, Target, TrendingUp } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { SolarActivityGanttChart } from "./SolarActivityGanttChart";

interface HeatmapData {
  blocks: string[];
  activities: string[];
  matrix: [number, number, number, number, number?][];
}

interface SolarAskingRateTableProps {
  projectId: number;
  submittedEntries: any[];
  historyEntries?: any[];
  onHeatmapDataChange?: (data: HeatmapData) => void;
}

export const SolarAskingRateTable: React.FC<SolarAskingRateTableProps> = ({
  projectId,
  submittedEntries = [],
  historyEntries = [],
  onHeatmapDataChange
}) => {
  const [projectDataDate, setProjectDataDate] = useState<string | null>(null);
  const [liveDpQtyData, setLiveDpQtyData] = useState<any[]>([]);
  const [milestoneStats, setMilestoneStats] = useState<Record<string, any>>({});
  const [viewMode, setViewMode] = useState<'data' | 'graph'>('data');

  useEffect(() => {
    const fetchProject = async () => {
      if (!projectId) return;
      try {
        const proj = await getProjectById(Number(projectId));
        if (proj && (proj as any).p6_data_date) {
            setProjectDataDate((proj as any).p6_data_date);
        }
      } catch (err) {
        console.error("Failed to fetch project:", err);
      }
    };
    
    const fetchLiveQty = async () => {
      if (!projectId) return;
      try {
        const yesterdayDate = new Date();
        yesterdayDate.setDate(yesterdayDate.getDate() - 1);
        const targetYesterday = yesterdayDate.toISOString().split('T')[0];
        
        const { getDPQtyActivities, mapActivitiesToDPQty, getYesterdayValues } = await import('@/services/p6ActivityService');
        const { getProjectSummaryDraft } = await import('@/services/dprService');
        const { applyDraftOverlay } = await import('@/utils/draftUtils');
        
        const [qtyResp, yesterdayData, draftDataResp] = await Promise.all([
          getDPQtyActivities(String(projectId)),
          getYesterdayValues(String(projectId), targetYesterday),
          getProjectSummaryDraft(String(projectId), 'all')
        ]);

        const yesterdayMap = new Map<string, { yesterday: number; cumulative: number; is_approved: boolean }>();
        if (yesterdayData && yesterdayData.activities) {
            yesterdayData.activities.forEach((item: any) => {
                const val = {
                    yesterday: item.yesterdayValue,
                    cumulative: item.cumulativeValue,
                    is_approved: item.is_approved
                };
                if (item.activityObjectId) yesterdayMap.set(String(item.activityObjectId), val);
                if (item.activityId) yesterdayMap.set(String(item.activityId), val);
                if (item.stringActivityId) yesterdayMap.set(item.stringActivityId, val);
                if (item.name) yesterdayMap.set(item.name.trim().toLowerCase(), val);
            });
        }

        if (qtyResp && qtyResp.data) {
           const rawQty = qtyResp.data || [];
           const mergedQty = rawQty.map((activity: any) => {
               const yVal = yesterdayMap.get(String(activity.activityObjectId)) ||
                   (activity.activityId ? yesterdayMap.get(activity.activityId) : undefined) ||
                   (activity.name ? yesterdayMap.get(activity.name.trim().toLowerCase()) : undefined);

               const cumulativeVal = yVal?.cumulative?.toString() || activity.cumulative || "";

               return {
                   ...activity,
                   cumulative: cumulativeVal,
               };
           });

           const draftRows = draftDataResp?.data_json ?
               (typeof draftDataResp.data_json === 'string' ? JSON.parse(draftDataResp.data_json) : draftDataResp.data_json).rows
               : [];
           const finalQty = applyDraftOverlay(mergedQty, draftRows || []);

           const mapped = mapActivitiesToDPQty(finalQty);
           setLiveDpQtyData(mapped);

           // FTC / COD are milestone activities named directly in P6 (e.g. "First Time Charging",
           // "COD") - match them by activity name across all activities, not the CC quantity list.
           const extractMilestoneStat = (nameMatch: (name: string) => boolean, options?: { statusOnly?: boolean }) => {
             const extractNum = (val: any) => {
               if (!val) return 0;
               if (typeof val === 'string') val = val.replace(/,/g, '');
               const num = parseFloat(val);
               return isNaN(num) ? 0 : num;
             };
             const trackEarliest = (cur: string | undefined, val?: string) => (!val ? cur : (!cur || val < cur ? val : cur));
             const trackLatest = (cur: string | undefined, val?: string) => (!val ? cur : (!cur || val > cur ? val : cur));

             let scope = 0, completed = 0;
             let baselineStart: string | undefined, baselineFinishDate: string | undefined;
             let actualStart: string | undefined, actualFinish: string | undefined;
             let forecastStart: string | undefined, forecastFinishDate: string | undefined;

             finalQty.forEach((a: any) => {
               const name = (a.name || '').toUpperCase();
               if (!nameMatch(name)) return;

               if (options?.statusOnly) {
                 // Only count a completed status as "done" - in progress / not started contribute 0
                 scope += 1;
                 completed += (a.status || '').trim().toLowerCase() === 'completed' ? 1 : 0;
               } else {
                 scope += extractNum(a.targetQty ?? a.scope) || 1;
                 completed += extractNum(a.actualQty ?? a.cumulative) || (Number(a.percentComplete) >= 100 ? 1 : 0);
               }

               // COD has no baseline in P6 - only track it for activities that carry a real schedule (FTC)
               if (!options?.statusOnly) {
                 baselineStart = trackEarliest(baselineStart, a.baselineStartDate);
                 baselineFinishDate = trackLatest(baselineFinishDate, a.baselineFinishDate);
               }
               actualStart = trackEarliest(actualStart, a.actualStartDate || a.actualStart);
               actualFinish = trackLatest(actualFinish, a.actualFinishDate || a.actualFinish);
               forecastStart = trackEarliest(forecastStart, a.forecastStartDate || a.forecastStart);
               forecastFinishDate = trackLatest(forecastFinishDate, a.forecastFinishDate || a.forecastFinish);
             });

             return { scope, completed, baselineStart, baselineFinishDate, actualStart, actualFinish, forecastStart, forecastFinishDate };
           };

           const ftcStat = extractMilestoneStat((n) => n.includes('FIRST TIME CHARGING') || n.includes('FTC'));
           const codStat = extractMilestoneStat((n) => n.includes('COD') && !n.includes('CEA'), { statusOnly: true });

           // TEMP DEBUG - remove once confirmed against real data
           console.log('[FTC/COD Debug] FTC match ->', ftcStat, 'from activities:', finalQty.filter((a: any) => (a.name || '').toUpperCase().includes('FIRST TIME CHARGING') || (a.name || '').toUpperCase().includes('FTC')).map((a: any) => a.name));
           console.log('[FTC/COD Debug] COD match ->', codStat, 'from activities:', finalQty.filter((a: any) => (a.name || '').toUpperCase().includes('COD') && !(a.name || '').toUpperCase().includes('CEA')).map((a: any) => a.name));

           setMilestoneStats({
             'ftc milestone': ftcStat,
             'cod milestone': codStat,
           });
        }
      } catch (e) {
        console.error("Failed to fetch live DP Qty activities:", e);
      }
    };
    
    fetchProject();
    fetchLiveQty();
  }, [projectId]);

  // 1. Aggregate Scope and Completed from DPR entries (dp_qty, ac_sheet, dc_sheet)
  const activityStats = useMemo(() => {
    const stats: Record<string, {
      scope: number, completed: number,
      baselineStart?: string, baselineFinishDate?: string,
      actualStart?: string, actualFinish?: string,
      forecastStart?: string, forecastFinishDate?: string,
      last3DaysAvg?: number, _debug?: any
    }> = {};

    // MIN-date helper for start fields (earliest of any contributing row)
    const trackEarliest = (bucket: typeof stats[string], field: 'baselineStart' | 'actualStart' | 'forecastStart', value: string) => {
      if (!value) return;
      if (!bucket[field] || value < bucket[field]!) bucket[field] = value;
    };
    // MAX-date helper for finish fields (latest of any contributing row)
    const trackLatest = (bucket: typeof stats[string], field: 'baselineFinishDate' | 'actualFinish' | 'forecastFinishDate', value: string) => {
      if (!value) return;
      if (!bucket[field] || value > bucket[field]!) bucket[field] = value;
    };

    const allEntries = [...(submittedEntries || []), ...(historyEntries || [])];

    // Helper to strip block prefixes
    const stripBlockPrefix = (name: string): string => {
      if (!name) return '';
      return name.replace(/^(Block|Blk|Plot)\s*[- ]?\s*\w+\s*-\s*/i, '').trim();
    };

    // Helper to process a specific sheet type and update stats
    const processSheet = (sheetsToProcess: string[]) => {
      if (sheetsToProcess.length === 0) return;

      const validEntries = allEntries.filter(e => sheetsToProcess.includes(e.sheet_type));
      if (validEntries.length === 0) return;
      
      const sortedEntries = validEntries.sort((a, b) => {
        const dateA = new Date(a.submitted_at || a.created_at || a.entry_date || 0).getTime();
        const dateB = new Date(b.submitted_at || b.created_at || b.entry_date || 0).getTime();
        return dateB - dateA;
      });

      let entry: any = null;
      let rows: any[] = [];
      for (const e of sortedEntries) {
        if (sheetsToProcess.includes(e.sheet_type)) {
          try {
            const data = typeof e.data_json === 'string' ? JSON.parse(e.data_json) : e.data_json;
            rows = data.rows || (Array.isArray(data) ? data : []);
            if (rows.length > 0) {
              entry = e;
              break;
            }
          } catch (err) {
            // ignore parsing errors and try next
          }
        }
      }

      if (entry && rows.length > 0) {
        try {
          rows.forEach((row: any) => {
            if (!row.isCategoryRow) {
              const rawName = row.description || row.name || row.activities || row.activity || '';
              const cleanName = stripBlockPrefix(rawName).toLowerCase().trim();
              if (!cleanName) return;
              
              if (!stats[cleanName]) {
                stats[cleanName] = { scope: 0, completed: 0, last3DaysAvg: 0 };
              }
              
              const extractNum = (val: any) => {
                  if (!val) return 0;
                  if (typeof val === 'string') val = val.replace(/,/g, '');
                  const num = parseFloat(val);
                  return isNaN(num) ? 0 : num;
              };
              
              const extractHistoryAvg = (historyValues?: Record<string, any>) => {
                if (!historyValues) return 0;
                let sum = 0;
                const baseDate = projectDataDate ? new Date(projectDataDate) : new Date();
                for (let i = 0; i < 3; i++) {
                  const d = new Date(baseDate);
                  d.setDate(baseDate.getDate() - i);
                  const yyyy = d.getFullYear();
                  const mm = String(d.getMonth() + 1).padStart(2, '0');
                  const dd = String(d.getDate()).padStart(2, '0');
                  const dateStr = `${yyyy}-${mm}-${dd}`;
                  const val = parseFloat(historyValues[dateStr]);
                  if (!isNaN(val)) sum += val;
                }
                return sum / 3;
              };
              
              const scopeVal = extractNum(row.totalQuantity) !== 0 ? extractNum(row.totalQuantity) : extractNum(row.scope);
              let compVal = 0;
              if (row.cumulative !== undefined && row.cumulative !== "" && row.cumulative !== null) {
                compVal = extractNum(row.cumulative);
              } else if (row.actual !== undefined && row.actual !== "" && row.actual !== null) {
                compVal = extractNum(row.actual);
              } else {
                compVal = extractNum(row.completed);
              }
              
              if (scopeVal > 0) stats[cleanName].scope += scopeVal;
              if (compVal > 0) stats[cleanName].completed += compVal;
              
              const avgVal = extractHistoryAvg(row.historyValues);
              if (avgVal > 0) stats[cleanName].last3DaysAvg += avgVal;
              
              const bFinish = row.baselineFinishDate || row.basePlanFinish || row.plannedFinishDate || '';
              if (bFinish) {
                if (!stats[cleanName].baselineFinishDate || bFinish > stats[cleanName].baselineFinishDate!) {
                  stats[cleanName].baselineFinishDate = bFinish;
                }
              }
              
              const fFinish = row.forecastFinishDate || row.forecastFinish || row.actualFinishDate || row.actualFinish || '';
              if (fFinish) {
                if (!stats[cleanName].forecastFinishDate || fFinish > stats[cleanName].forecastFinishDate!) {
                  stats[cleanName].forecastFinishDate = fFinish;
                }
              }

              trackEarliest(stats[cleanName], 'baselineStart', row.baselineStartDate || row.basePlanStart || row.plannedStartDate || '');
              trackEarliest(stats[cleanName], 'actualStart', row.actualStartDate || row.actualStart || '');
              trackLatest(stats[cleanName], 'actualFinish', row.actualFinishDate || row.actualFinish || '');
              trackEarliest(stats[cleanName], 'forecastStart', row.forecastStartDate || row.forecastStart || '');
            }
          });
        } catch (e) {
          console.error("Error parsing row in processSheet", e);
        }
      }
    };

    // 1. Process LIVE EXACT data from P6 mapping first! (Same as SummaryModal)
    if (liveDpQtyData && liveDpQtyData.length > 0) {
      liveDpQtyData.forEach((row: any) => {
        if (!row.isCategoryRow) {
          const rawName = row.description || row.name || '';
          const cleanName = stripBlockPrefix(rawName).toLowerCase().trim();
          if (!cleanName) return;
          
          if (!stats[cleanName]) {
            stats[cleanName] = { scope: 0, completed: 0, last3DaysAvg: 0 };
          }
          
          const extractNum = (val: any) => {
              if (!val) return 0;
              if (typeof val === 'string') val = val.replace(/,/g, '');
              const num = parseFloat(val);
              return isNaN(num) ? 0 : num;
          };

          const scopeVal = extractNum(row.totalQuantity) !== 0 ? extractNum(row.totalQuantity) : extractNum(row.scope);
          let compVal = 0;
          if (row.cumulative !== undefined && row.cumulative !== "" && row.cumulative !== null) {
            compVal = extractNum(row.cumulative);
          } else if (row.actual !== undefined && row.actual !== "" && row.actual !== null) {
            compVal = extractNum(row.actual);
          } else {
            compVal = extractNum(row.completed);
          }
          
          if (cleanName === "voc testing") {
            console.log(`[VOC Debug] row: ${row.description}, cumulative: '${row.cumulative}', actual: '${row.actual}', compVal: ${compVal}, scopeVal: ${scopeVal}`);
          }
          
          if (scopeVal > 0) stats[cleanName].scope += scopeVal;
          if (compVal > 0) stats[cleanName].completed += compVal;
          
          const extractHistoryAvg = (historyValues?: Record<string, any>) => {
            if (!historyValues) return 0;
            let sum = 0;
            const baseDate = projectDataDate ? new Date(projectDataDate) : new Date();
            for (let i = 0; i < 3; i++) {
              const d = new Date(baseDate);
              d.setDate(baseDate.getDate() - i);
              const yyyy = d.getFullYear();
              const mm = String(d.getMonth() + 1).padStart(2, '0');
              const dd = String(d.getDate()).padStart(2, '0');
              const dateStr = `${yyyy}-${mm}-${dd}`;
              const val = parseFloat(historyValues[dateStr]);
              if (!isNaN(val)) sum += val;
            }
            return sum / 3;
          };

          const avgVal = extractHistoryAvg(row.historyValues);
          if (avgVal > 0) stats[cleanName].last3DaysAvg += avgVal;
          
          const bFinish = row.baselineFinishDate || row.basePlanFinish || row.plannedFinishDate || '';
          if (bFinish) {
            if (!stats[cleanName].baselineFinishDate || bFinish > stats[cleanName].baselineFinishDate!) {
              stats[cleanName].baselineFinishDate = bFinish;
            }
          }
          
          const fFinish = row.forecastFinishDate || row.forecastFinish || row.actualFinishDate || row.actualFinish || '';
          if (fFinish) {
            if (!stats[cleanName].forecastFinishDate || fFinish > stats[cleanName].forecastFinishDate!) {
              stats[cleanName].forecastFinishDate = fFinish;
            }
          }

          trackEarliest(stats[cleanName], 'baselineStart', row.baselineStartDate || row.basePlanStart || row.plannedStartDate || '');
          trackEarliest(stats[cleanName], 'actualStart', row.actualStartDate || row.actualStart || '');
          trackLatest(stats[cleanName], 'actualFinish', row.actualFinishDate || row.actualFinish || '');
          trackEarliest(stats[cleanName], 'forecastStart', row.forecastStartDate || row.forecastStart || '');
        }
      });
    }

    // FTC/COD are sourced separately from the Milestone WBS (see fetchLiveQty) - overlay them last
    return { ...stats, ...milestoneStats };
  }, [submittedEntries, historyEntries, projectDataDate, liveDpQtyData, milestoneStats]);

  // Use exact rows requested by the user
  const exactActivities = useMemo(() => [
    "Piling - MMS (Marking, Auguring & Concreting)",
    "MMS Erection - Torque Tube/Rafter",
    "MMS Erection - Purlin",
    "Module Installation",
    "VOC Testing",
    "Robot Installation",
    "IDT Foundation Up To Rail",
    "IDT Erection",
    "LT Cable Laying",
    "HT Cable Laying",
    "Inverter Installation",
    "FTC Milestone",
    "COD Milestone"
  ], []);

  // Helper to get stats
  const getStat = (actName: string) => {
      const normalized = actName.toLowerCase().trim();
      const altNormalized = normalized.replace('rafter', 'raftar');
      
      if (activityStats[normalized]) return activityStats[normalized];
      if (activityStats[altNormalized]) return activityStats[altNormalized];
      
      // Fallback: Fuzzy matching
      const matchedKey = Object.keys(activityStats).find(key => {
          return key.includes(normalized) || normalized.includes(key) ||
                 key.includes(altNormalized) || altNormalized.includes(key);
      });
      
      return matchedKey ? activityStats[matchedKey] : { scope: 0, completed: 0 };
  };

  // Block-wise progress heatmap, built from the live DP Qty data (same source as the table above)
  const heatmapData = useMemo(() => {
    if (!liveDpQtyData || liveDpQtyData.length === 0) return { blocks: [], activities: [], matrix: [] };

    const stripBlockPrefixLocal = (name: string): string => {
      if (!name) return '';
      return name.replace(/^(Block|Blk|Plot)\s*[- ]?\s*\w+\s*-\s*/i, '').trim();
    };

    const blockSet = new Set<string>();
    const activitySet = new Set<string>();
    const targetActivities = SOLAR_SUMMARY_CATEGORIES.flatMap(c => c.activities);
    targetActivities.forEach(act => activitySet.add(act.toUpperCase()));

    const dataMap: Record<string, Record<string, { progress: number; delay: number }>> = {};

    liveDpQtyData.forEach((row: any) => {
      if (row.isCategoryRow || !row.block) return;

      const block = String(row.block).toUpperCase();
      const cleanAct = stripBlockPrefixLocal((row.description || '').toLowerCase()).toUpperCase();
      const masterAct = targetActivities.find(ta => cleanAct.includes(ta.toUpperCase()) || ta.toUpperCase().includes(cleanAct));
      if (!masterAct) return;

      const actKey = masterAct.toUpperCase();
      blockSet.add(block);
      if (!dataMap[block]) dataMap[block] = {};

      const scope = parseFloat(String(row.totalQuantity || '0').replace(/,/g, '')) || 0;
      const actual = parseFloat(String(row.cumulative || '0').replace(/,/g, '')) || 0;
      const progress = scope > 0 ? Math.min(100, Math.round((actual / scope) * 100)) : 0;

      let delay = 0;
      if (progress < 100 && row.basePlanFinish) {
        const finishDate = new Date(row.basePlanFinish);
        const today = new Date();
        if (finishDate < today) delay = Math.floor((today.getTime() - finishDate.getTime()) / (1000 * 3600 * 24));
      }

      dataMap[block][actKey] = { progress, delay };
    });

    const sortedBlocks = Array.from(blockSet).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    const sortedActivities = Array.from(activitySet);

    const matrix: [number, number, number, number, number?][] = [];
    sortedBlocks.forEach((b, bIdx) => {
      sortedActivities.forEach((a, aIdx) => {
        if (dataMap[b] && dataMap[b][a]) {
          matrix.push([bIdx, aIdx, dataMap[b][a].progress, dataMap[b][a].delay]);
        } else {
          matrix.push([bIdx, aIdx, 0, 0]);
        }
      });
    });

    // Trailing "TOTAL" column showing how many blocks completed each activity
    const totalBlockIdx = sortedBlocks.length;
    sortedBlocks.push("TOTAL");
    sortedActivities.forEach((a, aIdx) => {
      let completedCount = 0;
      sortedBlocks.slice(0, -1).forEach(b => {
        if (dataMap[b] && dataMap[b][a] && dataMap[b][a].progress >= 100) completedCount++;
      });
      matrix.push([totalBlockIdx, aIdx, 0, 0, completedCount]);
    });

    return { blocks: sortedBlocks, activities: sortedActivities, matrix };
  }, [liveDpQtyData]);

  useEffect(() => {
    onHeatmapDataChange?.(heatmapData);
  }, [heatmapData, onHeatmapDataChange]);

  return (
    <div className="w-[65%] mt-6 mb-8">
      <div className="w-full bg-card/95 backdrop-blur-sm rounded-xl shadow-lg border border-border overflow-hidden relative group">
        {/* Decorative top gradient */}
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary via-blue-500 to-secondary" />
        
        <div className="px-6 py-5 flex justify-between items-center border-b border-border bg-muted/10">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-primary/10 rounded-lg text-primary shadow-sm">
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-foreground tracking-tight">Solar Progress & Asking Rates</h3>
              <p className="text-sm text-muted-foreground mt-0.5">Real-time breakdown of activities, completion percentages, and required velocity.</p>
            </div>
          </div>
          <div className="flex items-center gap-1 bg-muted/40 rounded-lg p-1 border border-border shrink-0">
            <button
              type="button"
              onClick={() => setViewMode('data')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                viewMode === 'data'
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Data
            </button>
            <button
              type="button"
              onClick={() => setViewMode('graph')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                viewMode === 'graph'
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Graph
            </button>
          </div>
        </div>
        {viewMode === 'data' && (
        <div className="overflow-x-auto p-1">
          <TooltipProvider>
            <table className="w-full text-xs text-left border-collapse min-w-full">
            <thead>
              <tr className="border-b border-border bg-muted/20">
                <th className="px-4 py-3.5 font-semibold text-muted-foreground whitespace-nowrap text-[11px] uppercase">Activity</th>
                <th className="px-4 py-3.5 font-semibold text-muted-foreground text-center text-[11px] uppercase">Scope</th>
                <th className="px-4 py-3.5 font-semibold text-muted-foreground text-center text-[11px] uppercase">Completed</th>
                <th className="px-4 py-3.5 font-semibold text-muted-foreground text-center text-[11px] uppercase">%</th>
                <th className="px-4 py-3.5 font-semibold text-muted-foreground text-center text-[11px] uppercase w-40 leading-snug">
                  Asking Rate as Per Baseline Plan
                </th>
                <th className="px-4 py-3.5 font-semibold text-muted-foreground text-center text-[11px] uppercase w-40 leading-snug">
                  Asking Rate as per Forecast Completion Date
                </th>
                <th className="px-4 py-3.5 font-semibold text-muted-foreground text-center text-[11px] uppercase w-32 leading-snug">Last 3 Days Avg</th>
              </tr>
            </thead>
            <tbody className="">
              {exactActivities.map((act, idx) => {
                const stat = getStat(act);
                const pct = stat.scope > 0 ? (stat.completed / stat.scope) * 100 : 0;
                
                const balance = Math.max(0, stat.scope - stat.completed);
                const dataDate = projectDataDate ? new Date(projectDataDate) : new Date();
                dataDate.setHours(0, 0, 0, 0);

                const calcDays = (dateStr?: string) => {
                  if (!dateStr) return 0;
                  const d = new Date(dateStr);
                  if (isNaN(d.getTime())) return 0;
                  const diffTime = d.getTime() - dataDate.getTime();
                  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                };

                const baselineDays = calcDays(stat.baselineFinishDate);
                const forecastDays = calcDays(stat.forecastFinishDate);

                const baselineAskingRate = baselineDays > 0 && balance > 0 ? balance / baselineDays : null;
                const forecastAskingRate = forecastDays > 0 && balance > 0 ? balance / forecastDays : null;
                
                const last3DaysAvg = stat.last3DaysAvg || 0;
                
                const formatHoverDate = (dateInput: string | Date | undefined) => {
                  if (!dateInput) return "N/A";
                  const d = new Date(dateInput);
                  if (isNaN(d.getTime())) return "N/A";
                  return d.toLocaleDateString("en-IN", { day: '2-digit', month: 'short', year: '2-digit' }).replace(/ /g, '-');
                };
                const dataDateStr = formatHoverDate(dataDate);
                
                return (
                  <tr key={idx} className="border-b border-border hover:bg-muted/40 transition-all duration-200 last:border-0 hover:-translate-y-[1px] hover:shadow-sm relative z-0 hover:z-10 bg-card">
                    <td className="px-4 py-1.5 font-medium text-foreground">
                      {act}
                    </td>
                    <td className="px-4 py-1.5 text-center text-slate-700 dark:text-slate-300 font-medium">
                      {formatNum(stat.scope)}
                    </td>
                    <td className="px-4 py-1.5 text-center text-green-700 dark:text-green-400 font-medium">
                      {formatNum(stat.completed)}
                    </td>
                    <td className="px-4 py-1.5 text-center">
                      <span className={`text-[13px] font-bold ${
                        pct >= 100 ? 'text-green-600 dark:text-green-500' :
                        pct >= 50 ? 'text-blue-600 dark:text-blue-500' :
                        pct > 0 ? 'text-amber-600 dark:text-amber-500' :
                        'text-muted-foreground'
                      }`}>
                        {formatNum(pct)}%
                      </span>
                    </td>
                    <td className="px-4 py-1.5 text-center font-medium text-amber-600 dark:text-amber-400/90">
                      {baselineAskingRate !== null ? (
                        <Tooltip>
                          <TooltipTrigger className="cursor-pointer hover:underline underline-offset-4 decoration-amber-500/30">
                            {formatNum(baselineAskingRate)}
                          </TooltipTrigger>
                          <TooltipContent side="top" className="text-xs bg-slate-800 text-white border-slate-700">
                            <p className="font-mono">
                              <span className="text-amber-400">{balance}</span> / (Baseline: <span className="text-sky-300">{formatHoverDate(stat.baselineFinishDate)}</span> - Data Date: <span className="text-sky-300">{dataDateStr}</span>)
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </td>
                    <td className="px-4 py-1.5 text-center font-medium text-blue-600 dark:text-blue-400/90">
                      {forecastAskingRate !== null ? (
                        <Tooltip>
                          <TooltipTrigger className="cursor-pointer hover:underline underline-offset-4 decoration-blue-500/30">
                            {formatNum(forecastAskingRate)}
                          </TooltipTrigger>
                          <TooltipContent side="top" className="text-xs bg-slate-800 text-white border-slate-700">
                            <p className="font-mono">
                              <span className="text-blue-400">{balance}</span> / (Forecast: <span className="text-sky-300">{formatHoverDate(stat.forecastFinishDate)}</span> - Data Date: <span className="text-sky-300">{dataDateStr}</span>)
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </td>
                    <td className="px-4 py-1.5 text-center text-muted-foreground font-medium">{last3DaysAvg > 0 ? formatNum(last3DaysAvg) : '0'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </TooltipProvider>
        </div>
        )}

        {viewMode === 'graph' && (
        <div className="px-6 py-5 border-t border-border bg-muted/10">
          <SolarActivityGanttChart activities={exactActivities} getStat={getStat} />
        </div>
        )}
      </div>
    </div>
  );
};
