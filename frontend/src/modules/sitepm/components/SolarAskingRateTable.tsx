import React, { useMemo, useEffect, useState } from 'react';
import { SOLAR_SUMMARY_CATEGORIES } from "@/components/SummaryCharts";
import { formatNum } from "@/utils/formatters";
import { getProjectSummaryDraft } from "@/services/dprService";
import { getProjectById } from "@/services/projectService";

interface SolarAskingRateTableProps {
  projectId: number;
  submittedEntries: any[];
  historyEntries?: any[];
}

export const SolarAskingRateTable: React.FC<SolarAskingRateTableProps> = ({ 
  projectId,
  submittedEntries = [], 
  historyEntries = [] 
}) => {
  const [draftStats, setDraftStats] = useState<Record<string, { scope: number; completed: number; baselineFinishDate?: string; forecastFinishDate?: string; last3DaysAvg?: number }>>({});
  const [draftSheetsLoaded, setDraftSheetsLoaded] = useState<Set<string>>(new Set());
  const [projectDataDate, setProjectDataDate] = useState<string | null>(null);

  useEffect(() => {
    const fetchDraft = async () => {
      if (!projectId) return;

      try {
        const proj = await getProjectById(Number(projectId));
        if (proj && (proj as any).p6_data_date) {
            setProjectDataDate((proj as any).p6_data_date);
        }

        // Fetch drafted sheets sequentially to overlay data just like submitted logic
        const sheetTypes = ['dp_qty', 'ac_sheet', 'dc_sheet'];
        const newStats: Record<string, { scope: number; completed: number; baselineFinishDate?: string; forecastFinishDate?: string; last3DaysAvg?: number }> = {};
        const loadedSheets = new Set<string>();
        
        for (const st of sheetTypes) {
          const draft = await getProjectSummaryDraft(projectId, st);
          if (draft && draft.data_json) {
            const data = typeof draft.data_json === 'string' ? JSON.parse(draft.data_json) : draft.data_json;
            const rows = data.rows || (Array.isArray(data) ? data : []);
            
            if (rows.length > 0) {
              loadedSheets.add(st);
            }
            
            rows.forEach((row: any) => {
              if (!row.isCategoryRow) {
                const rawName = row.description || row.name || row.activities || row.activity || '';
                
                const stripBlockPrefix = (name: string): string => {
                  if (!name) return '';
                  return name.replace(/^(Block|Blk|Plot)\s*[- ]?\s*\w+\s*-\s*/i, '').trim();
                };
                
                const cleanName = stripBlockPrefix(rawName).toLowerCase();
                if (!cleanName) return;
                
                if (!newStats[cleanName]) {
                  newStats[cleanName] = { scope: 0, completed: 0, last3DaysAvg: 0 };
                }
                
                const extractNum = (val: any) => {
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
                
                const scopeVal = extractNum(row.totalQuantity) || extractNum(row.scope) || 0;
                // Prefer cumulative (total) over completed/actual (which are often daily)
                const compVal = extractNum(row.cumulative) || extractNum(row.actual) || extractNum(row.completed) || 0;
                
                if (scopeVal > 0) newStats[cleanName].scope += scopeVal;
                if (compVal > 0) newStats[cleanName].completed += compVal;
                
                const avgVal = extractHistoryAvg(row.historyValues);
                if (avgVal > 0) newStats[cleanName].last3DaysAvg += avgVal;
                
                const bFinish = row.baselineFinishDate || row.basePlanFinish || row.plannedFinishDate || '';
                if (bFinish) {
                  if (!newStats[cleanName].baselineFinishDate || bFinish > newStats[cleanName].baselineFinishDate!) {
                    newStats[cleanName].baselineFinishDate = bFinish;
                  }
                }
                
                const fFinish = row.forecastFinishDate || row.forecastFinish || row.actualFinishDate || row.actualFinish || '';
                if (fFinish) {
                  if (!newStats[cleanName].forecastFinishDate || fFinish > newStats[cleanName].forecastFinishDate!) {
                    newStats[cleanName].forecastFinishDate = fFinish;
                  }
                }
              }
            });
          }
        }
        setDraftStats(newStats);
        setDraftSheetsLoaded(loadedSheets);
      } catch (err) {
        console.error("Failed to fetch draft summary:", err);
      }
    };
    fetchDraft();
  }, [projectId, submittedEntries, historyEntries]);

  // 1. Aggregate Scope and Completed from DPR entries (dp_qty, ac_sheet, dc_sheet)
  const activityStats = useMemo(() => {
    // Deep clone draftStats to prevent mutation
    const stats: Record<string, { scope: number, completed: number, baselineFinishDate?: string, forecastFinishDate?: string, last3DaysAvg?: number, _debug?: any }> = JSON.parse(JSON.stringify(draftStats));
    
    const allEntries = [...(submittedEntries || []), ...(historyEntries || [])];
    
    // Helper to strip block prefixes
    const stripBlockPrefix = (name: string): string => {
      if (!name) return '';
      return name.replace(/^(Block|Blk|Plot)\s*[- ]?\s*\w+\s*-\s*/i, '').trim();
    };

    // Helper to process a specific sheet type and update stats
    const processSheet = (sheetTypes: string[]) => {
      // Filter out any sheets that we ALREADY loaded from drafts so we don't double count!
      const sheetsToProcess = sheetTypes.filter(st => !draftSheetsLoaded.has(st));
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
              const cleanName = stripBlockPrefix(rawName).toLowerCase();
              if (!cleanName) return;
              
              if (!stats[cleanName]) {
                stats[cleanName] = { scope: 0, completed: 0, last3DaysAvg: 0 };
              }
              
              const extractNum = (val: any) => {
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
              
              const scopeVal = extractNum(row.totalQuantity) || extractNum(row.scope) || 0;
              // Prefer cumulative (total) over completed/actual (which are often daily)
              const compVal = extractNum(row.cumulative) || extractNum(row.actual) || extractNum(row.completed) || 0;
              
              if (scopeVal > 0) stats[cleanName].scope += scopeVal;
              if (compVal > 0) stats[cleanName].completed += compVal;
              
              const avgVal = extractHistoryAvg(row.historyValues);
              if (avgVal > 0) {
                stats[cleanName].last3DaysAvg = (stats[cleanName].last3DaysAvg || 0) + avgVal;
              }
              
              const bFinish = row.baselineFinishDate || row.basePlanFinish || row.plannedFinishDate || '';
              if (bFinish) {
                if (!stats[cleanName].baselineFinishDate || bFinish > stats[cleanName].baselineFinishDate!) {
                  stats[cleanName].baselineFinishDate = bFinish;
                }
              }
              
              // DEBUG: Save raw values to help debugging
              stats[cleanName]._debug = { rawScope: row.scope, rawCompleted: row.completed, rawActual: row.actual, rawCum: row.cumulative, rawTQ: row.totalQuantity, parsedScope: scopeVal, parsedComp: compVal };
            }
          });
        } catch (e) {
          console.error(`Error parsing entry for ${sheetTypes}`, e);
        }
      }
    };

    // Process progress sheets to calculate scope and completed
    // The user requested to take data from 'summary' sheet
    processSheet(['summary', 'dp_qty', 'solar_construction']);
      
    // Update with AC sheet data if available
    processSheet(['ac_sheet']);

    // Update with DC sheet data if available
    processSheet(['dc_sheet']);

    return stats;
  }, [submittedEntries, historyEntries, draftStats]);

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
      const normalized = actName.toLowerCase();
      const altNormalized = normalized.replace('rafter', 'raftar');
      return activityStats[normalized] || activityStats[altNormalized] || { scope: 0, completed: 0 };
  };

  return (
    <div className="w-full flex justify-start mt-4">
      <div className="w-full bg-white rounded-lg shadow-sm border border-slate-300 overflow-hidden">
        <div className="p-3 border-b border-slate-300 bg-slate-100">
          <h3 className="font-semibold text-slate-800 text-base">Solar Progress & Asking Rates</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-300">
                <th className="p-2.5 font-semibold text-slate-700 border-r border-slate-300 whitespace-nowrap">Activity</th>
                <th className="p-2.5 font-semibold text-slate-700 text-center border-r border-slate-300">Scope</th>
                <th className="p-2.5 font-semibold text-slate-700 text-center border-r border-slate-300">Completed</th>
                <th className="p-2.5 font-semibold text-slate-700 text-center border-r border-slate-300">%</th>
                <th className="p-2.5 font-semibold text-slate-700 text-center border-r border-slate-300">Asking Rate as Per Baseline Plan</th>
                <th className="p-2.5 font-semibold text-slate-700 text-center border-r border-slate-300">Asking Rate as per Forecast Completion Date</th>
                <th className="p-2.5 font-semibold text-slate-700 text-center">Last 3 Days Average</th>
              </tr>
            </thead>
            <tbody>
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
                  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                  return Math.max(1, diffDays); // If past due or today, consider it 1 day to avoid Infinity
                };

                const baselineDays = calcDays(stat.baselineFinishDate);
                const forecastDays = calcDays(stat.forecastFinishDate);

                const baselineAskingRate = baselineDays > 0 && balance > 0 ? balance / baselineDays : 0;
                const forecastAskingRate = forecastDays > 0 && balance > 0 ? balance / forecastDays : 0;
                
                const last3DaysAvg = stat.last3DaysAvg || 0;
                
                return (
                  <tr key={idx} className="border-b border-slate-200 hover:bg-slate-50">
                    <td className="p-2.5 font-medium text-slate-800 border-r border-slate-200">{act}</td>
                    <td className="p-2.5 text-center text-slate-600 border-r border-slate-200">{formatNum(stat.scope)}</td>
                    <td className="p-2.5 text-center text-slate-600 border-r border-slate-200">{formatNum(stat.completed)}</td>
                    <td className="p-2.5 text-center text-slate-600 font-medium border-r border-slate-200">{formatNum(pct)}%</td>
                    <td className="p-2.5 text-center text-slate-600 border-r border-slate-200">{balance > 0 ? formatNum(baselineAskingRate) : '-'}</td>
                    <td className="p-2.5 text-center text-slate-600 border-r border-slate-200">{balance > 0 ? formatNum(forecastAskingRate) : '-'}</td>
                    <td className="p-2.5 text-center text-slate-600">{last3DaysAvg > 0 ? formatNum(last3DaysAvg) : '0'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
