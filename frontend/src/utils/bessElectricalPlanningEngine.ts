import { addDays, parseISO, format, isValid, differenceInDays } from 'date-fns';

export type ExecutionMode = 'Parallel' | 'Sequence';

export interface PlanningRule {
  activity: string;
  defaultRate: number;
  allowedModes: ExecutionMode[];
  defaultMode: ExecutionMode;
  dependencies: string[];
  lagDays?: number;
  lagRelativeActivity?: string;
}

export const BESS_PLANNING_RULES: PlanningRule[] = [
  { activity: 'CT Erection', defaultRate: 2, allowedModes: ['Sequence', 'Parallel'], defaultMode: 'Sequence', dependencies: [] },
  { activity: 'PCS Erection', defaultRate: 10, allowedModes: ['Sequence', 'Parallel'], defaultMode: 'Sequence', dependencies: [] },
  { activity: 'ACDB Erection', defaultRate: 5, allowedModes: ['Sequence', 'Parallel'], defaultMode: 'Parallel', dependencies: [] },
  { activity: 'ECP Panel Erection (Communication Panel)', defaultRate: 6, allowedModes: ['Parallel'], defaultMode: 'Parallel', dependencies: [] },
  { activity: 'HT Panel Erection', defaultRate: 2, allowedModes: ['Parallel'], defaultMode: 'Parallel', dependencies: [] },
  { activity: 'EMS Panel Erection', defaultRate: 1, allowedModes: ['Parallel'], defaultMode: 'Parallel', dependencies: [] },
  { activity: 'CSS Erection', defaultRate: 1, allowedModes: ['Parallel'], defaultMode: 'Parallel', dependencies: [] },
  { activity: 'NIFPS Panel Erection', defaultRate: 6, allowedModes: ['Parallel'], defaultMode: 'Parallel', dependencies: [] },
  { activity: 'NIFPS Fabrication', defaultRate: 3, allowedModes: ['Sequence'], defaultMode: 'Sequence', dependencies: ['NIFPS Panel Erection'] },
  { activity: 'Battery Container Erection', defaultRate: 10, allowedModes: ['Parallel'], defaultMode: 'Parallel', dependencies: [] },
  { activity: 'HT cable laying', defaultRate: 1500, allowedModes: ['Parallel'], defaultMode: 'Parallel', dependencies: [] },
  { activity: 'HT cable termination', defaultRate: 8, allowedModes: ['Sequence'], defaultMode: 'Sequence', dependencies: ['HT Panel Erection', 'HT cable laying', 'HT Cable VLF Test'] },
  { activity: 'DC Cable laying', defaultRate: 600, allowedModes: ['Parallel'], defaultMode: 'Parallel', dependencies: [] },
  { activity: 'LT Cable laying', defaultRate: 600, allowedModes: ['Parallel'], defaultMode: 'Parallel', dependencies: [] },
  { activity: 'DC Cable termination', defaultRate: 30, allowedModes: ['Sequence'], defaultMode: 'Sequence', dependencies: ['DC Cable laying', 'Battery Container Erection', 'PCS Erection'] },
  { activity: 'LT Cable termination', defaultRate: 30, allowedModes: ['Sequence'], defaultMode: 'Sequence', dependencies: ['LT Cable laying', 'PCS Erection', 'CT Erection'] },
  { activity: 'Aux Cable laying', defaultRate: 1000, allowedModes: ['Parallel'], defaultMode: 'Parallel', dependencies: [] },
  { activity: 'Control Cable laying', defaultRate: 1000, allowedModes: ['Parallel'], defaultMode: 'Parallel', dependencies: [] },
  { activity: 'Communication Cable laying', defaultRate: 500, allowedModes: ['Parallel'], defaultMode: 'Parallel', dependencies: [] },
  { activity: 'Aux Cable Termination', defaultRate: 30, allowedModes: ['Sequence'], defaultMode: 'Sequence', dependencies: ['Aux Cable laying', 'Battery Container Erection', 'PCS Erection', 'ACDB Erection', 'HT Panel Erection', 'EMS Panel Erection', 'CSS Erection'] },
  { activity: 'Control Cable Termination', defaultRate: 30, allowedModes: ['Sequence'], defaultMode: 'Sequence', dependencies: ['Control Cable laying', 'Battery Container Erection', 'PCS Erection', 'CT Erection', 'HT Panel Erection', 'EMS Panel Erection'] },
  { activity: 'Communication Cable Termination', defaultRate: 20, allowedModes: ['Sequence'], defaultMode: 'Sequence', dependencies: ['Communication Cable laying', 'Battery Container Erection', 'PCS Erection', 'HT Panel Erection', 'EMS Panel Erection', 'ECP Panel Erection (Communication Panel)'] },
  { activity: 'CT SFRA & Tan delta Test', defaultRate: 2, allowedModes: ['Sequence'], defaultMode: 'Sequence', dependencies: ['CT Erection'] },
  { activity: 'CT Routine Test', defaultRate: 2, allowedModes: ['Sequence'], defaultMode: 'Sequence', dependencies: ['CT SFRA & Tan delta Test'] },
  { activity: 'CT Control scheme & Stability Test', defaultRate: 2, allowedModes: ['Sequence'], defaultMode: 'Sequence', dependencies: ['NIFPS Fabrication', 'EMS Panel Erection', 'CT Routine Test', 'LT Cable termination', 'Aux Cable Termination', 'Communication Cable Termination', 'Grid Earthing'] },
  { activity: 'HT Panel Routine (CT & PT, Breaker & Meter) Test', defaultRate: 1, allowedModes: ['Sequence'], defaultMode: 'Sequence', dependencies: ['HT Panel Erection'] },
  { activity: 'HT Panel relay test', defaultRate: 6, allowedModes: ['Sequence'], defaultMode: 'Sequence', dependencies: ['Control Cable Termination', 'Communication Cable Termination', 'EMS Panel Erection'] },
  { activity: 'HT Cable VLF Test', defaultRate: 6, allowedModes: ['Sequence'], defaultMode: 'Sequence', dependencies: ['HT cable laying'] },
  { activity: 'CSS routine test', defaultRate: 1, allowedModes: ['Sequence'], defaultMode: 'Sequence', dependencies: ['CSS Erection'] },
  { activity: 'ACDB routine test', defaultRate: 3, allowedModes: ['Sequence'], defaultMode: 'Sequence', dependencies: ['ACDB Erection'] },
  { activity: 'Grid Earthing', defaultRate: 150, allowedModes: ['Sequence'], defaultMode: 'Sequence', dependencies: ['CT Erection', 'PCS Erection', 'ACDB Erection', 'ECP Panel Erection (Communication Panel)', 'HT Panel Erection', 'EMS Panel Erection', 'CSS Erection', 'NIFPS Panel Erection', 'Battery Container Erection'] },
  { activity: 'Lighting Arestor', defaultRate: 5, allowedModes: ['Sequence'], defaultMode: 'Sequence', dependencies: [], lagRelativeActivity: 'CT Control scheme & Stability Test', lagDays: -3 },
];

export const BESS_PLANNING_RULES_MAP = new Map(BESS_PLANNING_RULES.map(r => [r.activity, r]));

const parseSafeDate = (d: string) => {
  if (!d) return null;
  const nativeDate = new Date(d);
  if (!isNaN(nativeDate.getTime())) return nativeDate;
  const parsed = parseISO(d);
  return isValid(parsed) ? parsed : null;
};

const formatDate = (d: Date) => {
  const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const day = String(d.getDate()).padStart(2, '0');
  const month = monthNames[d.getMonth()];
  const year = String(d.getFullYear()).slice(-2);
  return `${day}-${month}-${year}`;
};

export function recalculatePlanningDates(
  rows: any[], 
  blockNo: string, 
  globalMode: ExecutionMode, 
  getScope?: (activity: string, block: string) => number
) {
  const blockRows = rows.filter(r => r.blockNo === blockNo && !r.isCategoryRow);
  if (blockRows.length === 0) return rows;

  const rowMap = new Map<string, any>();
  blockRows.forEach(r => rowMap.set(r.activity, r));

  let anchorDate: Date | null = null;
  const ctRow = rowMap.get('CT Erection');
  if (ctRow && ctRow.newStartDate) {
    const d = parseSafeDate(ctRow.newStartDate);
    if (d) anchorDate = d;
  } else {
    const firstWithDate = blockRows.find(r => r.newStartDate);
    if (firstWithDate) {
      const d = parseSafeDate(firstWithDate.newStartDate);
      if (d) anchorDate = d;
    }
  }

  // If no manual date has been selected anywhere in the block, do not auto-calculate.
  // The table should remain blank (manual) until an initial date is provided.
  if (!anchorDate) {
    return rows;
  }

  const stateMap = new Map<string, { start: Date | null, finish: Date | null, days: number }>();
  
  blockRows.forEach(r => {
    let scope = Number(r.progressScope || 0);
    if (getScope && (!r.progressScope || String(r.progressScope).trim() === '')) {
      const p6Scope = getScope(r.activity, r.blockNo);
      if (p6Scope > 0) {
        scope = p6Scope;
      }
    }
    const prod = Number(r.productivity || 0);
    let days = 0;
    if (scope > 0 && prod > 0) {
      days = Math.ceil(scope / prod);
    }
    stateMap.set(r.activity, { start: null, finish: null, days });
  });

  let changed = true;
  let loops = 0;

  while (changed && loops < 10) {
    changed = false;
    loops++;
    let lastSequentialFinish: Date = addDays(new Date(anchorDate), -1);
    
    BESS_PLANNING_RULES.forEach(rule => {
      const state = stateMap.get(rule.activity);
      if (!state) return;
      
      const row = rowMap.get(rule.activity);
      const mode = rule.allowedModes.includes(globalMode) ? globalMode : rule.defaultMode;
      
      if (state.days === 0) {
        if (state.start !== null || state.finish !== null) {
          state.start = null;
          state.finish = null;
          changed = true;
        }
        return;
      }

      if (rule.lagRelativeActivity && rule.lagDays !== undefined) {
        const relativeState = stateMap.get(rule.lagRelativeActivity);
        if (relativeState && relativeState.start) {
          const expectedFinish = addDays(relativeState.start, rule.lagDays);
          const expectedStart = addDays(expectedFinish, -(state.days - 1));
          
          if (!state.start || state.start.getTime() !== expectedStart.getTime()) {
            state.start = expectedStart;
            state.finish = expectedFinish;
            changed = true;
          }
        }
        return;
      }

      let maxDepFinish: Date = new Date(anchorDate);
      maxDepFinish = addDays(maxDepFinish, -1); 

      rule.dependencies.forEach(dep => {
        const depState = stateMap.get(dep);
        if (depState && depState.finish) {
          if (depState.finish > maxDepFinish) {
            maxDepFinish = depState.finish;
          }
        }
      });

      let calcStart = addDays(maxDepFinish, 1);

      if (mode === 'Sequence') {
        if (lastSequentialFinish > maxDepFinish) {
          calcStart = addDays(lastSequentialFinish, 1);
        }
      }
      
      const calcFinish = addDays(calcStart, Math.max(0, state.days - 1));

      if (!state.start || state.start.getTime() !== calcStart.getTime() || !state.finish || state.finish.getTime() !== calcFinish.getTime()) {
        state.start = calcStart;
        state.finish = calcFinish;
        changed = true;
      }

      if (mode === 'Sequence' && state.finish) {
        if (state.finish > lastSequentialFinish) {
          lastSequentialFinish = state.finish;
        }
      }
    });
  }

  let arrayChanged = false;

  rows.forEach(r => {
    if (r.blockNo === blockNo && !r.isCategoryRow) {
      const state = stateMap.get(r.activity);
      if (state) {
        const newStartStr = state.start ? formatDate(state.start) : '';
        const newEndStr = state.finish ? formatDate(state.finish) : '';
        
        if (r.newStartDate !== newStartStr || r.newEndDate !== newEndStr) {
          r.newStartDate = newStartStr;
          r.newEndDate = newEndStr;
          if (!r._cellStatuses) r._cellStatuses = {};
          if (newStartStr) r._cellStatuses.newStartDate = 'edited';
          if (newEndStr) r._cellStatuses.newEndDate = 'edited';
          arrayChanged = true;
        }
      }
    }
  });

  return arrayChanged ? [...rows] : rows;
}
