import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { StyledExcelTable } from "@/components/StyledExcelTable";
import { P6Activity, P6Resource } from "@/services/p6ActivityService";
import { indianDateFormat, parseDateToIso } from "@/services/dprService";
import { ResourceTable } from './ResourceTable';

interface DPRSummarySectionProps {
  p6Activities?: P6Activity[];
  dpQtyData?: any[];
  ACSheetData?: any[];
  DCSheetData?: any[];
  manpowerDetailsData?: any[];
  resourceData?: P6Resource[];
  onExportAll?: () => void;
  onReachEnd?: () => void;
  selectedBlock?: string;
  universalFilter?: string;
  projectName?: string;
  projectDetails?: any;
  yesterday?: string | Date;
}

// ============================================================================
// SOLAR SUMMARY — Fixed Category-to-Activity Mapping (CC activities only)
// ============================================================================
// Activity names below are the "clean" names after stripping block prefix
// e.g. "Block-01 - Piling - MMS (Marking, Auguring & Concreting)" -> "Piling - MMS (Marking, Auguring & Concreting)"

interface CategoryDef {
  name: string;
  activities: string[];  // normalized lowercase substrings to match
}

const SOLAR_SUMMARY_CATEGORIES: CategoryDef[] = [
  {
    name: 'PILING',
    activities: [
      'piling - mms (marking, auguring & concreting)',
      'pile capping',
      'piling - lt cable hanger system',
      'piling - inverters',
      'piling - robotic docking system',
    ],
  },
  {
    name: 'MMS & MODULE',
    activities: [
      'array earthing',
      'mms erection - torque tube/rafter',
      'mms erection - transmission shaft/bracing',
      'mms erection - purlin',
      'mms  - rfi completion',
      'module installation',
      'module - rfi completion',
    ],
  },
  {
    name: 'ROBOTIC WORKS',
    activities: [
      'robotic structure - docking station installation',
      'robotic structure - reverse station installation',
      'robotic structure - bridges installation',
      'robot installation',
    ],
  },
  {
    name: 'IDT',
    activities: [
      'idt foundation up to rail',
      'ht & lt station - slab',
      'ht lt station - slab',
      'ht & lt station - shed installation',
      'ht & lt station - sheeting installation',
      'nifps foundation',
      'bot foundation',
      'aux transformer foundation',
    ],
  },
  {
    name: 'AC / DC',
    activities: [
      'dc cable laying',
      'module interconnection & mc4 termination',
      'voc testing',
      'lt cable laying',
      'ht cable laying',
      'fo cable laying',
      'ht panel erection',
      'lt panel erection',
      'idt erection',
      'inverter installation',
      'scada & sacu installation',
      'aux transformer - installation',
    ],
  },
  {
    name: 'TESTING',
    activities: [
      'idt filtration',
      'idt testing',
      'ht panel testing',
      'lt panel testing',
    ],
  },
  {
    name: 'COMMISSIONING & COD',
    activities: [
      'cea compliance & approval',
      'first time charging',
      'trial operation',
      'trial run certificate',
      'cod',
    ],
  },
];

const RAJASTHAN_SUMMARY_CATEGORIES: CategoryDef[] = [
  {
    name: 'Piling',
    activities: [
      'piling - mms (marking, auguring & concreting)',
      'pile capping',
      'piling - inverters',
      'piling - robotic docking system',
    ],
  },
  {
    name: 'AC/DC',
    activities: [
      'array earthing',
      'dc cable laying',
      'module interconnection & mc4 termination',
      'voc testing',
      'lt cable laying',
      'ht cable laying',
      'fo cable laying',
      'control cable laying',
      'ht panel erection',
      'lt panel erection',
      'idt erection',
      'inverter installation',
      'scada & sacu installation',
      'acdb installation',
      'aux transformer - instalaltion',
      'aux transformer - installation',
      'nifps - installation',
      'ht cable terminations - idt side',
      'lt cable terminations - idt side',
      'lt cable terminations - inverter side'
    ],
  },
  {
    name: 'MMS',
    activities: [
      'mms erection - torque tube/raftar',
      'mms erection - torque tube/rafter',
      'mms erection - transmission shaft/bracing',
      'mms erection - purlin',
      'mms  - rfi completion',
      'mms - rfi completion'
    ],
  },
  {
    name: 'Module',
    activities: [
      'module installation',
      'module - rfi completion'
    ],
  },
  {
    name: 'Robotic Module Cleaning System',
    activities: [
      'robotic structure - docking station installation',
      'robotic structure - reverse station installation',
      'robotic structure - bridges installation',
      'robot installation'
    ],
  },
  {
    name: 'IDT Civil',
    activities: [
      'idt foundation up to rail',
      'ht & lt station - slab',
      'ht lt station - slab',
      'ht & lt station - shed installation',
      'ht & lt station - sheeting installation',
      'idt foundation - grade slab casting & dyke wall',
      'nifps foundation',
      'bot foundation',
      'aux transformer foundation',
      'idt area - fencing',
      'idt area - gate installation',
      'idt area - gravel filling',
      'ht lt station - staircase'
    ],
  },
  {
    name: 'Testing',
    activities: [
      'idt filtration',
      'idt testing',
      'ht panel testing',
      'lt panel testing'
    ]
  }
];

// ============================================================================
// Helper: strip block prefix from activity name
// Handles "Block-01 - ", "Blk 02 - ", "Plot-03 - ", etc.
// ============================================================================
const stripBlockPrefix = (name: string): string => {
  if (!name) return '';
  // Match prefix like "Block-01 - ", "Blk 02 - ", "Plot-03 - " case-insensitive
  return name.replace(/^(Block|Blk|Plot)\s*[- ]?\s*\w+\s*-\s*/i, '').trim();
};

// ============================================================================
// Helper: check if an item matches the selected block
// ============================================================================
const matchesBlock = (item: any, selectedBlock: string): boolean => {
  if (!selectedBlock || selectedBlock === 'ALL') return true;
  // Try explicit fields first, fallback to extracting from name for raw P6 activities
  const itemBlock = String(
    item.block ||
    item.newBlockNom ||
    item.plot ||
    (item.name ? (item.name.match(/^(Block[-\s]*\d+)/i)?.[1] || "") : "")
  ).toLowerCase().trim();

  const targetBlock = selectedBlock.toLowerCase().trim();
  return itemBlock === targetBlock;
};

// ============================================================================
// Helper: check if an activity is a CC activity (case-insensitive)
// ============================================================================
const isCCActivity = (activity: P6Activity): boolean => {
  const id = (activity.activityId || '').toUpperCase();
  const name = (activity.name || '').toUpperCase();
  return id.includes('CC') || name.includes('CC');
};

// ============================================================================
// Helper: format date in Indian format
// ============================================================================
const formatDt = (dt: any): string => {
  if (!dt) return '';
  const dtStr = String(dt).split('T')[0];
  return indianDateFormat(dtStr) || dtStr;
};

// Helper: format MW values to remove trailing zeros (e.g. 25.000 -> 25)
const formatMW = (val: number): string => {
  if (!val || val === 0) return '0';
  return Number(val.toFixed(3)).toString();
};

// Helper: format quantity/manpower values to 2 decimals max (e.g. 14042.109999 -> 14042.11)
const formatNum = (val: number): string => {
  if (!val || val === 0) return '0';
  return Number(val.toFixed(2)).toString();
};

// ============================================================================
// Group and aggregate CC activities by category
// ============================================================================
interface AggregatedActivity {
  name: string;
  uom: string;
  totalScope: number;
  completed: number;
  balance: number;
  percentStatus: number;
  mpScope: number;
  mpActual: number;
  mpBalance: number;
  mwScope: number;
  mwCompleted: number;
  mwBalance: number;
  basePlanStart: string;
  basePlanFinish: string;
  actualStart: string;
  actualFinish: string;
  forecastStart: string;
  forecastFinish: string;
}

const aggregateAndGroupCCActivities = (
  p6Activities: P6Activity[],
  dpQtyData: any[],
  manpowerDetailsData: any[],
  selectedBlock: string,
  universalFilter: string,
  projectName: string = '',
  projectDetails: any = null,
  yesterday?: string | Date,
  DCSheetData: any[] = [],
  ACSheetData: any[] = [],
): { rows: string[][]; categoryRowIndices: number[]; cellTextColors: Record<number, Record<string, string>> } => {
  // Step 1: Pre-aggregate DP Qty Data (filtered by block)
  const dpQtyAggMap = new Map<string, { scope: number; comp: number; bal: number }>();
  dpQtyData.forEach(entry => {
    if (entry.isCategoryRow || !matchesBlock(entry, selectedBlock)) return;
    const cleanName = stripBlockPrefix(entry.description || entry.name || '');
    if (!cleanName) return;
    const key = cleanName.toLowerCase();
    const existing = dpQtyAggMap.get(key) || { scope: 0, comp: 0, bal: 0 };
    const scope = existing.scope + parseFloat(entry.totalQuantity || '0');
    const comp = existing.comp + parseFloat(entry.cumulative || '0');
    dpQtyAggMap.set(key, {
      scope,
      comp,
      bal: scope - comp
    });
  });

  // Step 1b: Overlay DC/AC Sheet data — these contain live edits with scope/actual
  // that are more up-to-date than dpQtyData (which may have empty cumulative from P6)
  const sheetOverlay = new Map<string, { scope: number; comp: number }>();
  [...DCSheetData, ...ACSheetData].forEach(entry => {
    if (entry.isCategoryRow || !matchesBlock(entry, selectedBlock)) return;
    const cleanName = stripBlockPrefix(entry.description || entry.name || entry.activities || '');
    if (!cleanName) return;
    const key = cleanName.toLowerCase();
    const existing = sheetOverlay.get(key) || { scope: 0, comp: 0 };
    existing.scope += parseFloat(entry.scope || '0');
    existing.comp += parseFloat(entry.actual || entry.cumulative || '0');
    sheetOverlay.set(key, existing);
  });

  // Merge overlay into dpQtyAggMap — prefer sheet data when it has actual values
  sheetOverlay.forEach((overlay, key) => {
    const existing = dpQtyAggMap.get(key);
    // Use sheet data scope/comp if it has meaningful values
    const scope = overlay.scope > 0 ? overlay.scope : (existing?.scope || 0);
    const comp = overlay.comp > 0 ? overlay.comp : (existing?.comp || 0);
    dpQtyAggMap.set(key, {
      scope,
      comp,
      bal: scope - comp
    });
  });

  // Step 2: Pre-aggregate Manpower Data (filtered by block)
  const mpAggMap = new Map<string, { scope: number; comp: number; bal: number }>();
  manpowerDetailsData.forEach(entry => {
    if (entry.isCategoryRow || !matchesBlock(entry, selectedBlock)) return;
    const cleanName = stripBlockPrefix(entry.description || '');
    if (!cleanName) return;
    const key = cleanName.toLowerCase();
    const existing = mpAggMap.get(key) || { scope: 0, comp: 0, bal: 0 };
    const scope = existing.scope + parseFloat(entry.budgetedUnits || '0');
    const comp = existing.comp + parseFloat(entry.actualUnits || '0');
    mpAggMap.set(key, {
      scope,
      comp,
      bal: scope - comp
    });
  });

  // Step 3: Filter P6 master list by CC and Block
  const filteredP6 = p6Activities.filter(a => isCCActivity(a) && matchesBlock(a, selectedBlock));

  // Applied local maps to avoid double-counting block capacity for aggregated activity names
  const activityBlockMap = new Map<string, Set<string>>(); // key -> Set of block names/plot
  const blockCapacityMap = new Map<string, number>(); // block name -> capacity

  // Apply universal filter (on clean name or activityId)
  const filters = (universalFilter || '').trim().toLowerCase().split(/\s+/).filter(f => f);
  const finalFilteredP6 = filters.length === 0
    ? filteredP6
    : filteredP6.filter(a => {
      const id = (a.activityId || '').toLowerCase();
      const name = (a.name || '').toLowerCase();
      return filters.every(f => id.includes(f) || name.includes(f));
    });

  // Step 4: Final Aggregation — Grouping by Unique Clean Name
  const activityAggMap = new Map<string, AggregatedActivity>();

  finalFilteredP6.forEach(activity => {
    const cleanName = stripBlockPrefix(activity.name || '');
    if (!cleanName) return;
    const key = cleanName.toLowerCase();

    // Tracking blocks for MW calculation
    const blockRef = activity.block || activity.newBlockNom || activity.plot || 'UNKNOWN';
    if (!activityBlockMap.has(key)) activityBlockMap.set(key, new Set());
    activityBlockMap.get(key)!.add(blockRef);

    // Extract MW capacity from name if blockCapacity (UDF) is missing
    let capacity = activity.blockCapacity || 0;
    if (capacity === 0) {
      // Regex to find number before MW - handle both Int and Float (e.g. 25, 2.5, 25.5, 25 MW)
      const mwRegex = /(\d+(?:\.\d+)?)\s*MW/i;

      const nameMatch = (activity.name || '').match(mwRegex);
      const wbsMatch = (activity.wbsName || '').match(mwRegex);
      const prjMatch = (projectName || '').match(mwRegex);

      if (nameMatch) capacity = parseFloat(nameMatch[1]);
      else if (wbsMatch) capacity = parseFloat(wbsMatch[1]);
      else if (prjMatch) capacity = parseFloat(prjMatch[1]);
    }

    // Ensure we only set it if it's > 0, and if it's UNKNOWN, we don't accidentally overwrite a valid capacity with 0
    if (capacity > 0) {
      blockCapacityMap.set(blockRef, capacity);
    }

    const existing = activityAggMap.get(key);

    const baseStart = activity.baselineStartDate || '';
    const baseFinish = activity.baselineFinishDate || '';
    const actStart = activity.actualStartDate || '';
    const actFinish = activity.actualFinishDate || '';
    const fcstStart = activity.forecastStartDate || '';
    const fcstFinish = activity.forecastFinishDate || '';

    if (existing) {
      // Update dates only
      if (baseStart && (!existing.basePlanStart || baseStart < existing.basePlanStart)) existing.basePlanStart = baseStart;
      if (baseFinish && (!existing.basePlanFinish || baseFinish > existing.basePlanFinish)) existing.basePlanFinish = baseFinish;
      if (actStart && (!existing.actualStart || actStart < existing.actualStart)) existing.actualStart = actStart;
      if (actFinish && (!existing.actualFinish || actFinish > existing.actualFinish)) existing.actualFinish = actFinish;
      if (fcstStart && (!existing.forecastStart || fcstStart < existing.forecastStart)) existing.forecastStart = fcstStart;
      if (fcstFinish && (!existing.forecastFinish || fcstFinish > existing.forecastFinish)) existing.forecastFinish = fcstFinish;

      // NO FALLBACK: Only aggregate from supervisor entries (dpQtyData)
      // Removed the P6-only summary fallback logic to ensure field entries are the source of truth
    } else {
      // First time seeing this Clean Name
      const dpStats = dpQtyAggMap.get(key);
      const mpStats = mpAggMap.get(key);

      activityAggMap.set(key, {
        name: cleanName,
        uom: activity.unitOfMeasure || '',
        totalScope: dpStats ? dpStats.scope : 0,
        completed: dpStats ? dpStats.comp : 0,
        balance: dpStats ? dpStats.bal : 0,
        percentStatus: 0,
        mpScope: mpStats ? mpStats.scope : 0,
        mpActual: mpStats ? mpStats.comp : 0,
        mpBalance: mpStats ? mpStats.bal : 0,
        mwScope: 0,
        mwCompleted: 0,
        mwBalance: 0,
        basePlanStart: baseStart || '',
        basePlanFinish: baseFinish || '',
        actualStart: actStart || '',
        actualFinish: actFinish || '',
        forecastStart: fcstStart || '',
        forecastFinish: fcstFinish || '',
      });
    }
  });

  // Step 5: Recalculate percent and MW for aggregated values
  activityAggMap.forEach((agg, key) => {
    agg.percentStatus = agg.totalScope > 0
      ? Math.round((agg.completed / agg.totalScope) * 100)
      : 0;

    // Calculate MW Scope based on unique blocks covered by this activity across the project/block selection
    const relevantBlocks = activityBlockMap.get(key);
    let scopeMW = 0;
    relevantBlocks?.forEach(bn => {
      scopeMW += blockCapacityMap.get(bn) || 0;
    });

    agg.mwScope = scopeMW;
    // MW Completed = MW Scope * (% Completion / 100)
    agg.mwCompleted = (agg.mwScope * agg.percentStatus) / 100;
    agg.mwBalance = agg.mwScope - agg.mwCompleted;
  });

  // Step 6: Build Rows by Category
  const rows: string[][] = [];
  const categoryRowIndices: number[] = [];
  const usedKeys = new Set<string>();
  const cellTextColors: Record<number, Record<string, string>> = {};

  const getDates = (agg: AggregatedActivity) => {
    const s = agg.actualStart || agg.forecastStart;
    const f = agg.actualFinish || agg.forecastFinish;
    let actS = '', fcstS = '', actF = '', fcstF = '';
    const parsedYesterdayStr = yesterday ? new Date(yesterday).toISOString().split('T')[0] : null;

    if (s) {
      const sStr = String(s).split('T')[0];
      if (parsedYesterdayStr && parseDateToIso(sStr) <= parsedYesterdayStr) {
        actS = formatDt(sStr);
      } else {
        fcstS = formatDt(sStr);
      }
    }
    if (f) {
      const fStr = String(f).split('T')[0];
      if (parsedYesterdayStr && parseDateToIso(fStr) <= parsedYesterdayStr) {
        actF = formatDt(fStr);
      } else {
        fcstF = formatDt(fStr);
      }
    }
    return { actS, fcstS, actF, fcstF };
  };

  const eps = (
    projectDetails?.parentEps ||
    projectDetails?.parent_eps ||
    projectDetails?.ParentEPSName ||
    projectDetails?.eps ||
    projectDetails?.EPS ||
    ''
  ).toLowerCase();

  const isRajasthan = eps.includes('rajasthan') ||
    eps.includes('rj') ||
    projectName.toUpperCase().includes('BAIYA') ||
    projectName.toUpperCase().includes('BANDHA') ||
    projectName.toUpperCase().includes('RAJASTHAN');
  const activeCategories = isRajasthan ? RAJASTHAN_SUMMARY_CATEGORIES : SOLAR_SUMMARY_CATEGORIES;

  activeCategories.forEach(category => {
    const matchedActivities: AggregatedActivity[] = [];
    category.activities.forEach(pattern => {
      const patternLower = pattern.toLowerCase().trim();
      activityAggMap.forEach((agg, key) => {
        if (usedKeys.has(key)) return;
        if (key.includes(patternLower) || patternLower.includes(key)) {
          matchedActivities.push(agg);
          usedKeys.add(key);
        }
      });
    });

    if (matchedActivities.length > 0) {
      // Calculate category-level sums and date ranges
      const catScope = matchedActivities.reduce((acc, a) => acc + a.totalScope, 0);
      const catComp = matchedActivities.reduce((acc, a) => acc + a.completed, 0);
      const catBal = matchedActivities.reduce((acc, a) => acc + a.balance, 0);
      const catMPTotal = matchedActivities.reduce((acc, a) => acc + a.mpScope, 0);
      const catMPActual = matchedActivities.reduce((acc, a) => acc + a.mpActual, 0);
      const catMPBal = matchedActivities.reduce((acc, a) => acc + a.mpBalance, 0);
      const catPercent = catScope > 0 ? Math.round((catComp / catScope) * 100) : 0;

      const catMWScope = matchedActivities.reduce((acc, a) => acc + a.mwScope, 0);
      const catMWComp = catScope > 0 ? (catComp / catScope) * catMWScope : 0;
      const catMWBal = catMWScope - catMWComp;

      const catBaseStart = matchedActivities.map(a => a.basePlanStart).filter(Boolean).sort()[0] || '';
      const catBaseFinish = matchedActivities.map(a => a.basePlanFinish).filter(Boolean).sort().reverse()[0] || '';
      const catActStart = matchedActivities.map(a => a.actualStart).filter(Boolean).sort()[0] || '';
      const catActFinish = matchedActivities.map(a => a.actualFinish).filter(Boolean).sort().reverse()[0] || '';
      const catFcstStart = matchedActivities.map(a => a.forecastStart).filter(Boolean).sort()[0] || '';
      const catFcstFinish = matchedActivities.map(a => a.forecastFinish).filter(Boolean).sort().reverse()[0] || '';

      const actFcstStart = catActStart || catFcstStart;
      const actFcstFinish = catActFinish || catFcstFinish;

      const catForecastSummary = formatDt(actFcstFinish) || '-';

      // Category Row (Cleaned up: only name, no totals/dates)
      categoryRowIndices.push(rows.length);
      rows.push([
        '', category.name, '',
        '', '', '', '',
        '', '', '', '',
        '', // Spacer
        '', // Units
        '', '', '',
        '', '', '', ''
      ]);

      matchedActivities.forEach((agg, idx) => {
        const d = getDates(agg);
        const actFcstS = d.actS || d.fcstS || '-';
        const actFcstF = d.actF || d.fcstF || '-';

        if (d.actS) {
          if (!cellTextColors[rows.length]) cellTextColors[rows.length] = {};
          cellTextColors[rows.length]["Actual Start"] = "#16a34a"; // Green
        } else if (d.fcstS) {
          if (!cellTextColors[rows.length]) cellTextColors[rows.length] = {};
          cellTextColors[rows.length]["Actual Start"] = "#2563eb"; // Blue
        }

        if (d.actF) {
          if (!cellTextColors[rows.length]) cellTextColors[rows.length] = {};
          cellTextColors[rows.length]["Actual Finish"] = "#16a34a"; // Green
        } else if (d.fcstF) {
          if (!cellTextColors[rows.length]) cellTextColors[rows.length] = {};
          cellTextColors[rows.length]["Actual Finish"] = "#2563eb"; // Blue
        }

        const mpPercent = agg.mpScope > 0 ? Math.round((agg.mpActual / agg.mpScope) * 100) : 0;
        rows.push([
          String(idx + 1),
          agg.name,
          agg.uom,
          formatNum(agg.totalScope),
          formatNum(agg.completed),
          formatNum(agg.balance),
          `${agg.percentStatus}%`,
          formatNum(agg.mpScope),
          formatNum(agg.mpActual),
          formatNum(agg.mpBalance),
          `${mpPercent}%`,
          '', // Spacer
          'MWac', // Charging Plan UOM
          formatMW(agg.mwScope),
          formatMW(agg.mwCompleted),
          formatMW(agg.mwBalance),
          formatDt(agg.basePlanStart) || '-',
          formatDt(agg.basePlanFinish) || '-',
          actFcstS,
          actFcstF,
        ]);
      });
    }
  });

  // Step 7: "OTHER" Section
  const remainingActivities: AggregatedActivity[] = [];
  activityAggMap.forEach((agg, key) => {
    if (!usedKeys.has(key)) remainingActivities.push(agg);
  });

  if (remainingActivities.length > 0) {
    const catScope = remainingActivities.reduce((acc, a) => acc + a.totalScope, 0);
    const catComp = remainingActivities.reduce((acc, a) => acc + a.completed, 0);
    const catBal = remainingActivities.reduce((acc, a) => acc + a.balance, 0);
    const catMPTotal = remainingActivities.reduce((acc, a) => acc + a.mpScope, 0);
    const catMPActual = remainingActivities.reduce((acc, a) => acc + a.mpActual, 0);
    const catMPBal = remainingActivities.reduce((acc, a) => acc + a.mpBalance, 0);
    const catPercent = catScope > 0 ? Math.round((catComp / catScope) * 100) : 0;

    const catMWScope = remainingActivities.reduce((acc, a) => acc + a.mwScope, 0);
    const catMWComp = catScope > 0 ? (catComp / catScope) * catMWScope : 0;
    const catMWBal = catMWScope - catMWComp;

    const catBaseStart = remainingActivities.map(a => a.basePlanStart).filter(Boolean).sort()[0] || '';
    const catBaseFinish = remainingActivities.map(a => a.basePlanFinish).filter(Boolean).sort().reverse()[0] || '';
    const catActStart = remainingActivities.map(a => a.actualStart).filter(Boolean).sort()[0] || '';
    const catActFinish = remainingActivities.map(a => a.actualFinish).filter(Boolean).sort().reverse()[0] || '';
    const catFcstStart = remainingActivities.map(a => a.forecastStart).filter(Boolean).sort()[0] || '';
    const catFcstFinish = remainingActivities.map(a => a.forecastFinish).filter(Boolean).sort().reverse()[0] || '';

    const actFcstStart = catActStart || catFcstStart;
    const actFcstFinish = catActFinish || catFcstFinish;

    const catForecastSummary = formatDt(actFcstFinish) || '-';

    categoryRowIndices.push(rows.length);
    rows.push([
      '', 'OTHER', '',
      '', '', '', '',
      '', '', '', '',
      '', // Spacer
      '', // Units
      '', '', '',
      '', '', '', ''
    ]);

    remainingActivities.forEach((agg, idx) => {
      const d = getDates(agg);
      const actFcstS = d.actS || d.fcstS || '-';
      const actFcstF = d.actF || d.fcstF || '-';

      if (d.actS) {
        if (!cellTextColors[rows.length]) cellTextColors[rows.length] = {};
        cellTextColors[rows.length]["Actual Start"] = "#16a34a"; // Green
      } else if (d.fcstS) {
        if (!cellTextColors[rows.length]) cellTextColors[rows.length] = {};
        cellTextColors[rows.length]["Actual Start"] = "#2563eb"; // Blue
      }

      if (d.actF) {
        if (!cellTextColors[rows.length]) cellTextColors[rows.length] = {};
        cellTextColors[rows.length]["Actual Finish"] = "#16a34a"; // Green
      } else if (d.fcstF) {
        if (!cellTextColors[rows.length]) cellTextColors[rows.length] = {};
        cellTextColors[rows.length]["Actual Finish"] = "#2563eb"; // Blue
      }

      const mpPercent = agg.mpScope > 0 ? Math.round((agg.mpActual / agg.mpScope) * 100) : 0;
      rows.push([
        String(idx + 1),
        agg.name,
        agg.uom,
        formatNum(agg.totalScope),
        formatNum(agg.completed),
        formatNum(agg.balance),
        `${agg.percentStatus}%`,
        formatNum(agg.mpScope),
        formatNum(agg.mpActual),
        formatNum(agg.mpBalance),
        `${mpPercent}%`,
        '', // Spacer
        'MWac', // Charging Plan UOM
        formatMW(agg.mwScope),
        formatMW(agg.mwCompleted),
        formatMW(agg.mwBalance),
        formatDt(agg.basePlanStart) || '-',
        formatDt(agg.basePlanFinish) || '-',
        actFcstS,
        actFcstF,
      ]);
    });
  }

  return { rows, categoryRowIndices, cellTextColors };
};

// ============================================================================
// COMPONENT
// ============================================================================

const EMPTY_ARRAY: any[] = [];

export const DPRSummarySection: React.FC<DPRSummarySectionProps> = ({
  p6Activities = EMPTY_ARRAY,
  dpQtyData = EMPTY_ARRAY,
  ACSheetData = EMPTY_ARRAY,
  DCSheetData = EMPTY_ARRAY,
  manpowerDetailsData = EMPTY_ARRAY,
  resourceData = EMPTY_ARRAY,
  onExportAll,
  onReachEnd,
  selectedBlock = "ALL",
  universalFilter = "",
  projectName = "",
  projectDetails = null,
  yesterday
}) => {
  const [themeMode, setThemeMode] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    const updateTheme = () => {
      const isDark = document.documentElement.classList.contains('dark');
      setThemeMode(isDark ? 'dark' : 'light');
    };
    updateTheme();
    const observer = new MutationObserver(updateTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  // Aggregate and group CC activities
  const { mainActivityData, rowStyles, cellTextColors } = useMemo(() => {
    const { rows, categoryRowIndices, cellTextColors } = aggregateAndGroupCCActivities(
      p6Activities,
      dpQtyData,
      manpowerDetailsData,
      selectedBlock,
      universalFilter,
      projectName,
      projectDetails,
      yesterday,
      DCSheetData,
      ACSheetData
    );

    const styles: Record<number, any> = {};
    categoryRowIndices.forEach(index => {
      styles[index] = {
        isCategoryRow: true,
        backgroundColor: '#FADFAD', // Matching Vendor Block/IDT orange theme
        fontWeight: 'bold',
        color: '#0f172a',
        fontSize: '13px'
      };
    });

    return { mainActivityData: rows, rowStyles: styles, cellTextColors };
  }, [p6Activities, dpQtyData, manpowerDetailsData, selectedBlock, universalFilter, yesterday, DCSheetData, ACSheetData]);

  const getContainerBgClass = () => themeMode === 'light' ? 'bg-white' : 'bg-gray-900';

  // Column definitions
  const columns = useMemo(() => [
    "S.No", "Description", "UOM",
    "Mat. Scope", "Mat. Completed", "Mat. Balance", "% Comp",
    "Mnp. Required", "Mnp. Available", "Mnp. Gap", "Mnp. %",
    "Spacer", "MW Units", // Extra space to differentiate repeated column
    "MW Required", "MW Available", "MW Gap",
    "Baseline Start", "Baseline End", "Actual Start", "Actual Finish"
  ], []);

  const columnTypes = useMemo(() => ({
    "S.No": "text", "Description": "text", "UOM": "text",
    "Mat. Scope": "number", "Mat. Completed": "number", "Mat. Balance": "number", "% Comp": "text",
    "Mnp. Required": "number", "Mnp. Available": "number", "Mnp. Gap": "number", "Mnp. %": "text",
    "Spacer": "text", "MW Units": "text",
    "MW Required": "number", "MW Available": "number", "MW Gap": "number",
    "Baseline Start": "text", "Baseline End": "text", "Actual Start": "text", "Actual Finish": "text"
  }), []);

  const columnWidths = useMemo(() => ({
    "S.No": 45, "Description": 320, "UOM": 55,
    "Mat. Scope": 95, "Mat. Completed": 110, "Mat. Balance": 95, "% Comp": 75,
    "Mnp. Required": 95, "Mnp. Available": 110, "Mnp. Gap": 95, "Mnp. %": 75,
    "Spacer": 30, "MW Units": 65,
    "MW Required": 95, "MW Available": 110, "MW Gap": 95,
    "Baseline Start": 110, "Baseline End": 110, "Actual Start": 110, "Actual Finish": 110
  }), []);

  const headerStructure = useMemo(() => [
    [
      { label: "S.No", column: "S.No", rowSpan: 2, colSpan: 1 },
      { label: "Description", column: "Description", rowSpan: 2, colSpan: 1 },
      { label: "UOM", column: "UOM", rowSpan: 2, colSpan: 1 },
      { label: "Construction Quantities", colSpan: 4, rowSpan: 1 },
      { label: "Labour Days", colSpan: 4, rowSpan: 1 },
      { label: "", column: "Spacer", rowSpan: 2, colSpan: 1 },
      { label: "Summary in MW", colSpan: 4, rowSpan: 1 },
      { label: "Schedule & Actuals", colSpan: 4, rowSpan: 1 },
    ],
    [
      { label: "Scope", column: "Mat. Scope", colSpan: 1, rowSpan: 1 },
      { label: "Completed", column: "Mat. Completed", colSpan: 1, rowSpan: 1 },
      { label: "Balance", column: "Mat. Balance", colSpan: 1, rowSpan: 1 },
      { label: "% Comp", column: "% Comp", colSpan: 1, rowSpan: 1 },
      { label: "Required", column: "Mnp. Required", colSpan: 1, rowSpan: 1 },
      { label: "Available", column: "Mnp. Available", colSpan: 1, rowSpan: 1 },
      { label: "Gap", column: "Mnp. Gap", colSpan: 1, rowSpan: 1 },
      { label: "% Comp", column: "Mnp. %", colSpan: 1, rowSpan: 1 },
      { label: "Units", column: "MW Units", colSpan: 1, rowSpan: 1 },
      { label: "MW Required", column: "MW Required", colSpan: 1, rowSpan: 1 },
      { label: "MW Available", column: "MW Available", colSpan: 1, rowSpan: 1 },
      { label: "MW Gap", column: "MW Gap", colSpan: 1, rowSpan: 1 },
      { label: "Baseline Start", column: "Baseline Start", colSpan: 1, rowSpan: 1 },
      { label: "Baseline End", column: "Baseline End", colSpan: 1, rowSpan: 1 },
      { label: "Actual Start", column: "Actual Start", colSpan: 1, rowSpan: 1 },
      { label: "Actual Finish", column: "Actual Finish", colSpan: 1, rowSpan: 1 },
    ]
  ], []);

  const commonNoOp = useCallback(() => { }, []);

  return (
    <div className={`flex-1 w-full flex flex-col min-h-0 rounded-lg shadow-md ${getContainerBgClass()}`}>
      <div className="flex-1 min-h-0 w-full flex flex-col">
        {mainActivityData.length > 0 ? (
          <StyledExcelTable
            title="Solar Summary — CC Activities"
            columns={columns}
            data={mainActivityData}
            onDataChange={commonNoOp}
            onSave={undefined}
            onSubmit={undefined}
            columnTypes={columnTypes}
            columnWidths={columnWidths}
            headerStructure={headerStructure}
            rowStyles={rowStyles}
            cellTextColors={cellTextColors}
            isReadOnly={true}
            hideAddRow={true}
            onExportAll={onExportAll}
            onReachEnd={onReachEnd}
            totalRows={undefined}
          />
        ) : (
          <div className="text-center py-20 bg-gray-50 rounded-lg border-2 border-dashed border-gray-200">
            <p className="text-gray-500 font-medium">No matching CC activities found for this project/block.</p>
            <p className="text-gray-400 text-sm mt-1">Please verify if the activities are correctly coded as "CC".</p>
          </div>
        )}
      </div>
    </div>
  );
};
