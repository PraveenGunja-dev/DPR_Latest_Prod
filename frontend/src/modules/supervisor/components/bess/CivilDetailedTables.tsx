import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer, Cell, LabelList } from 'recharts';

export interface CivilDetailedTablesProps {
  block: string;
  civilData: any[];
  dpQtyData?: any[];
  projectName?: string;
}

export const CivilDetailedTables: React.FC<CivilDetailedTablesProps> = ({ block, civilData, dpQtyData = [], projectName = '' }) => {
  // Filter data strictly for this block.
  const blockData = civilData.filter(r => {
    // 1. If the overall project name matches the requested block (e.g. project is PSS11, slide is PSS-11),
    // then ALL activities in this project belong to this slide.
    if (projectName) {
      const projMatch = projectName.match(/(?:pss|block|blk)[\s-]*([0-9]+[a-z]*)/i);
      if (projMatch && projMatch[1].toUpperCase() === block.toUpperCase()) {
        return true;
      }
    }

    // 2. Otherwise, check if the specific activity is explicitly tagged for this block.
    const blockStr = r.block || r.subWbs || r.wbsName || r.description || '';
    const blockMatch = blockStr.match(/(?:pss|block|blk)[\s-]*([0-9]+[a-z]*)/i);
    if (blockMatch) {
      return blockMatch[1].toUpperCase() === block.toUpperCase();
    }
    
    // If neither matches, exclude it to prevent data bleeding into the wrong slide.
    return false;
  });

  const extractStageData = (headingPatterns: string[], stageKeywords: string[]) => {
    const matches = blockData.filter(r => {
      const searchString = [r.name, r.description, r.activity, r.mainHeading, r.subHeading, r.category, r.wbsName].filter(Boolean).join(' ').toUpperCase();
      
      const hasHeading = headingPatterns.some(p => searchString.includes(p));
      const hasStage = stageKeywords.some(k => searchString.includes(k));
      return hasHeading && hasStage;
    });

    const scope = matches.reduce((sum, r) => sum + (parseFloat(r.totalScopeQty) || parseFloat(r.totalQuantity) || parseFloat(r.scope) || parseFloat(r.plan) || 0), 0);
    const completed = matches.reduce((sum, r) => sum + (parseFloat(r.completed) || parseFloat(r.cumulative) || parseFloat(r.actual) || 0), 0);

    return { plan: scope, actual: completed };
  };

  // Helper to generate a row for a package
  const generateRow = (packageName: string, headingPatterns: string[], stagesMap: Record<string, string[]>) => {
    let totalScope = 0;
    let totalCompleted = 0;
    const stages: Record<string, { plan: number, actual: number }> = {};

    for (const [stageName, keywords] of Object.entries(stagesMap)) {
      const data = extractStageData(headingPatterns, keywords);
      stages[stageName] = data;
      totalScope += data.plan;
      totalCompleted += data.actual;
    }

    const progress = totalScope > 0 ? Math.round((totalCompleted / totalScope) * 100) : (totalCompleted > 0 ? 100 : 0);

    return { packageName, totalScope, stages, progress };
  };

  // --- Table 1: PCS, SGR, MCR ---
  const pcsStages = {
    'DCIS Piling': ['PCS - DRIVEN CAST IN-SITU PILE'],
    'PCC': ['PCS - PCC'],
    'Footing & Column': ['PCS - FOOTING & PILE BEAM CASTING'],
    'Slab Casting': ['PCS - SLAB CASTING'],
    'Staircase & Finishing': ['PCS - STAIRECASE INSTALLATION']
  };

  const sgrStages = {
    'DCIS Piling': ['SGR - DRIVEN CAST IN-SITU PILING'],
    'PCC': ['SGR - PCC'],
    'Footing & Column': ['SGR - FOOTING & PILE BEAM CASTING'],
    'Slab Casting': ['SGR - SLAB CASTING'],
    'Staircase & Finishing': ['SGR - STAIRECASE INSTALLATION']
  };

  const mcrStages = {
    'DCIS Piling': ['MCR - DRIVEN CAST IN-SITU PILING'],
    'PCC': ['MCR - PCC'],
    'Footing & Column': ['MCR - FOOTING & PILE BEAM CASTING'],
    'Slab Casting': ['MCR - SLAB CASTING'],
    'Staircase & Finishing': ['MCR - STAIRECASE INSTALLATION']
  };

  const table1 = [
    generateRow('PCS', ['PCS'], pcsStages),
    generateRow('SGR', ['SGR'], sgrStages),
    generateRow('MCR', ['ELECTRICAL ROOM', 'MCR'], mcrStages)
  ];

  // --- Table 2: CT, CSS, BOT, NIFPS, HF ---
  const ctStages = {
    'Excavation & PCC': ['CT - EXCAVATION OF CT', 'CT - PCC OF CT'],
    'Footing & Wall Casting / Precast Installation': [],
    'Backfilling': ['CT - BACKFILLING OF CT'],
    'Final Lift & Rail Fixing': ['CT - FINAL LIFT', 'CT - RAIL FIXING OF CT'],
    'Slab Work': []
  };

  const cssStages = {
    'Excavation & PCC': ['CSS - MARKING & EXCAVATION', 'CSS - PCC'],
    'Footing & Wall Casting / Precast Installation': ['CSS - WALL CASTING', 'CSS - FOOTING & CASTING'],
    'Backfilling': ['CSS - BACKFILLING'],
    'Final Lift & Rail Fixing': [],
    'Slab Work': ['CSS - SLAB CASTING']
  };

  const botStages = {
    'Excavation & PCC': ['EXCAVATION OF BOT', 'PCC OF BOT'],
    'Footing & Wall Casting / Precast Installation': [],
    'Backfilling': ['BACK FILLING OF BOT'],
    'Final Lift & Rail Fixing': ['BOT - FINAL LIFT'],
    'Slab Work': ['BOT - SLAB']
  };

  const nifpsStages = {
    'Excavation & PCC': ['EXCAVATION OF NIFPS', 'PCC OF NIFPS'],
    'Footing & Wall Casting / Precast Installation': ['PRECAST INSTALLATION OF NIFPS'],
    'Backfilling': [],
    'Final Lift & Rail Fixing': [],
    'Slab Work': []
  };

  const hfStages = {
    'Excavation & PCC': [],
    'Footing & Wall Casting / Precast Installation': [],
    'Backfilling': [],
    'Final Lift & Rail Fixing': [],
    'Slab Work': []
  };

  const table2 = [
    generateRow('CT', ['CONVERTER TRANSFORMER', 'CT'], ctStages),
    generateRow('CSS', ['CSS'], cssStages),
    generateRow('BOT', ['BURN OIL TANK', 'BOT'], botStages),
    generateRow('NIFPS', ['NIFPS'], nifpsStages),
    generateRow('HF', ['HARMONIC FILTER', 'HF'], hfStages)
  ];

  // --- Table 3: BCF ---
  const bcfStages = {
    'DCIS Piling': ['BCF - DRIVEN CAST IN-SITU PILING'],
    'Pile Built Up': ['BCF - PILE BUILT UP'],
    'Precast Erection': ['BCF - PRECAST ERECTION'],
    'Connection with Pile': ['BCF - PRECAST CONNECTION WITH PILE AND LEVELING']
  };

  const table3 = [
    generateRow('BCF', ['BATTERY CONTAINER', 'BCF'], bcfStages)
  ];

  // Colors based on user screenshot
  const planColor = '#1f77b4'; // Blue
  const actHighColor = '#2ca02c'; // Green (80%+)
  const actMidColor = '#ffbb00'; // Yellow (40-80%)
  const actLowColor = '#d62728'; // Red (<40%)

  const getActualColor = (pct: number) => {
    if (pct >= 80) return actHighColor;
    if (pct >= 40) return actMidColor;
    if (pct > 0) return actLowColor;
    return '#ccc'; // Grey if 0
  };

  const bopChartData = [...table1, ...table2].map(r => ({
    name: r.packageName,
    plan: 100, // Normalized to 100% for plan
    actual: r.progress,
    actColor: getActualColor(r.progress)
  }));

  const bcfChartData = table3.map(r => ({
    name: r.packageName,
    plan: 100,
    actual: r.progress,
    actColor: getActualColor(r.progress)
  }));

  const renderTable = (rows: any[], stageKeys: string[]) => (
    <>
      <table className="w-full text-[10px] text-center border-collapse border border-slate-800 mb-2 bg-white">
      <thead>
        <tr className="bg-slate-50">
          <th className="p-1 border border-slate-800 w-16" colSpan={2}></th>
          <th className="p-1 border border-slate-800 font-bold w-12">Total<br/>Scope</th>
          {stageKeys.map(k => <th key={k} className="p-1 border border-slate-800 font-bold">{k}</th>)}
          <th className="p-1 border border-slate-800 font-bold w-16">Progress</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(r => (
          <React.Fragment key={r.packageName}>
            <tr className="bg-orange-50/50">
              <td className="p-1 border border-slate-800 font-bold bg-orange-100/50" rowSpan={2}>{r.packageName}</td>
              <td className="p-1 border border-slate-800 text-slate-700 bg-orange-50">Plan</td>
              <td className="p-1 border border-slate-800 bg-orange-50">{r.totalScope || '-'}</td>
              {stageKeys.map(k => (
                <td key={k} className="p-1 border border-slate-800 text-green-600 bg-orange-50 font-medium">
                  {r.stages[k].plan > 0 ? r.stages[k].plan : '-'}
                </td>
              ))}
              <td className="p-1 border border-slate-800 font-bold text-slate-700 bg-orange-50" rowSpan={2}>
                {r.progress}%
              </td>
            </tr>
            <tr>
              <td className="p-1 border border-slate-800 text-slate-700 bg-white">Actual</td>
              <td className="p-1 border border-slate-800 bg-white">{r.totalScope || '-'}</td>
              {stageKeys.map(k => (
                <td key={k} className="p-1 border border-slate-800 text-green-600 bg-white font-medium">
                  {r.stages[k].actual > 0 ? r.stages[k].actual : (r.stages[k].plan > 0 ? '0' : '-')}
                </td>
              ))}
            </tr>
          </React.Fragment>
        ))}
      </tbody>
    </table>
    </>
  );

  return (
    <div className="flex h-full gap-2 w-full pt-2">
      {/* Left side Tables */}
      <div className="w-[60%] flex flex-col justify-between">
        {renderTable(table1, Object.keys(pcsStages))}
        {renderTable(table2, Object.keys(ctStages))}
        {renderTable(table3, Object.keys(bcfStages))}
      </div>

      {/* Right side Charts */}
      <div className="w-[40%] flex flex-col gap-2">
        {/* BOP Chart */}
        <div className="flex-1 border border-slate-800 p-2 bg-white relative flex flex-col min-h-0">
          <h3 className="text-center font-bold text-slate-600 text-[11px] mb-2">BOP CIVIL PROGRESS PSS-{block}</h3>
          <div className="flex-1 min-h-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={bopChartData} margin={{ top: 15, right: 0, left: -25, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 9 }} axisLine={true} tickLine={false} interval={0} />
                <YAxis domain={[0, 100]} ticks={[0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]} tickFormatter={v => `${v}%`} tick={{ fontSize: 9 }} axisLine={true} tickLine={false} />
                <RechartsTooltip cursor={{ fill: 'transparent' }} />
                
                <Bar dataKey="plan" fill={planColor} barSize={10}>
                  <LabelList dataKey="plan" position="top" formatter={() => '100%'} style={{ fontSize: 8, fontWeight: 'bold' }} />
                </Bar>
                <Bar dataKey="actual" barSize={10}>
                  {bopChartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.actColor} />
                  ))}
                  <LabelList dataKey="actual" position="top" formatter={(val: number) => `${val}%`} style={{ fontSize: 8, fontWeight: 'bold' }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* BCF Chart */}
        <div className="h-[30%] border border-slate-800 p-2 bg-white relative flex flex-col min-h-0">
          <h3 className="text-center font-bold text-slate-600 text-[11px] mb-2">BCF PROGRESS PSS-{block}</h3>
          <div className="flex-1 min-h-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={bcfChartData} margin={{ top: 15, right: 30, left: 30, bottom: 0 }}>
                <XAxis dataKey="name" tick={{ fontSize: 9 }} axisLine={true} tickLine={false} />
                <YAxis hide domain={[0, 100]} />
                
                <Bar dataKey="plan" fill={planColor} barSize={40}>
                  <LabelList dataKey="plan" position="top" formatter={() => '100%'} style={{ fontSize: 9, fontWeight: 'bold' }} />
                </Bar>
                <Bar dataKey="actual" barSize={40}>
                  {bcfChartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.actColor} />
                  ))}
                  <LabelList dataKey="actual" position="top" formatter={(val: number) => `${val}%`} style={{ fontSize: 9, fontWeight: 'bold' }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Legend */}
        <div className="flex text-[8px] gap-2 items-center justify-center mt-1 flex-wrap">
          <div className="flex items-center gap-1"><div className="w-2 h-2 bg-[#1f77b4]"></div> Plan</div>
          <div className="flex items-center gap-1"><div className="w-2 h-2 bg-[#2ca02c]"></div> Actual (80%+ plan achieved)</div>
          <div className="flex items-center gap-1"><div className="w-2 h-2 bg-[#ffbb00]"></div> Actual (40%-80% plan achieved)</div>
          <div className="flex items-center gap-1"><div className="w-2 h-2 bg-[#d62728]"></div> Actual (below 40% plan achieved)</div>
        </div>
      </div>
      
    </div>
  );
};
