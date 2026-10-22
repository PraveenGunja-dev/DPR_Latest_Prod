import { addDays, parseISO, isValid, differenceInCalendarDays } from 'date-fns';

export type ExecutionMode = 'Parallel' | 'Sequence';
/**
 * What the sheet's Mode switch can be set to. 'Both' runs the activities together the way the rules define
 * them: each one in its own default mode (some in Parallel, some in Sequence) rather than forcing them all
 * one way.
 */
export type PlanningMode = ExecutionMode | 'Both';

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

/**
 * The rules in an order where every activity comes after the ones it depends on. The list above is
 * in display order, which is not always dependency order (HT cable termination is listed before the
 * HT Cable VLF Test it waits for); in Sequence mode that made the two push each other a day later on
 * every pass and the dates never settled.
 */
const DEPENDENCY_ORDERED_RULES: PlanningRule[] = (() => {
  const visited = new Set<string>();
  const ordered: PlanningRule[] = [];
  const visit = (rule: PlanningRule) => {
    if (visited.has(rule.activity)) return;
    visited.add(rule.activity);
    rule.dependencies.forEach(dep => {
      const depRule = BESS_PLANNING_RULES_MAP.get(dep);
      if (depRule) visit(depRule);
    });
    ordered.push(rule);
  };
  BESS_PLANNING_RULES.forEach(visit);
  return ordered;
})();

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

/** One activity's computed schedule inside a block. */
export interface PlanState {
  start: Date | null;
  finish: Date | null;
  days: number;
  scope: number;
  prod: number;
  /** What pushed this activity's start later than the project start, if anything. */
  blockedBy: { name: string; finish: Date; kind: 'dependency' | 'sequence' } | null;
}

/**
 * The block's project window: a Start Date and End Date typed on the block's light-green header row
 * (stored on that row as windowStart / windowEnd). Every activity's dates - the first one included -
 * are calculated from the start date; the end date is the deadline each activity is judged against.
 */
const findBlockHeader = (rows: any[], blockNo: string): any | undefined =>
  rows.find(r => r && r.isCategoryRow && r.blockNo === blockNo);

const getBlockAnchor = (rows: any[], blockNo: string, blockRows: any[]): Date | null => {
  const header = findBlockHeader(rows, blockNo);
  // windowStart is undefined only on sheets saved before the header row held the date, when it was
  // typed on the first activity; once the header owns it (even as an empty string) it is the only
  // source, so clearing it really clears the block instead of resurrecting a calculated date.
  if (header && header.windowStart !== undefined) return header.windowStart ? parseSafeDate(header.windowStart) : null;
  const first = blockRows[0];
  return first && first.newStartDate ? parseSafeDate(first.newStartDate) : null;
};

const getBlockDeadline = (rows: any[], blockNo: string, blockRows: any[]): Date | null => {
  const header = findBlockHeader(rows, blockNo);
  if (header && header.windowEnd !== undefined) return header.windowEnd ? parseSafeDate(header.windowEnd) : null;
  const first = blockRows[0];
  return first && first._endTyped && first.newEndDate ? parseSafeDate(first.newEndDate) : null;
};

const resolveScope = (r: any, getScope?: (activity: string, block: string) => number): number => {
  let scope = Number(r.progressScope || 0);
  if (getScope && (!r.progressScope || String(r.progressScope).trim() === '')) {
    const p6Scope = getScope(r.activity, r.blockNo);
    if (p6Scope > 0) scope = p6Scope;
  }
  return scope;
};

/**
 * Works out every activity's start / finish for one block from the anchor date, the scope and
 * productivity of each activity (days = ceil(scope / productivity)), the dependency rules and the
 * Parallel / Sequence mode. Also records which predecessor, if any, held each activity back.
 */
function computeSchedule(
  blockRows: any[],
  anchorDate: Date,
  globalMode: PlanningMode,
  getScope?: (activity: string, block: string) => number
): Map<string, PlanState> {
  const stateMap = new Map<string, PlanState>();

  blockRows.forEach(r => {
    const scope = resolveScope(r, getScope);
    const prod = Number(r.productivity || 0);
    const days = scope > 0 && prod > 0 ? Math.ceil(scope / prod) : 0;
    stateMap.set(r.activity, { start: null, finish: null, days, scope, prod, blockedBy: null });
  });

  let changed = true;
  let loops = 0;

  while (changed && loops < 10) {
    changed = false;
    loops++;
    let lastSequentialFinish: Date = addDays(new Date(anchorDate), -1);
    let lastSequentialName = '';

    DEPENDENCY_ORDERED_RULES.forEach(rule => {
      const state = stateMap.get(rule.activity);
      if (!state) return;

      const mode: ExecutionMode = globalMode === 'Both'
        ? rule.defaultMode
        : (rule.allowedModes.includes(globalMode) ? globalMode : rule.defaultMode);

      if (state.days === 0) {
        if (state.start !== null || state.finish !== null) {
          state.start = null;
          state.finish = null;
          changed = true;
        }
        state.blockedBy = null;
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

      let maxDepFinish: Date = addDays(new Date(anchorDate), -1);
      let driver: PlanState['blockedBy'] = null;

      rule.dependencies.forEach(dep => {
        const depState = stateMap.get(dep);
        if (depState && depState.finish && depState.finish > maxDepFinish) {
          maxDepFinish = depState.finish;
          driver = { name: dep, finish: depState.finish, kind: 'dependency' };
        }
      });

      let calcStart = addDays(maxDepFinish, 1);

      if (mode === 'Sequence' && lastSequentialFinish > maxDepFinish) {
        calcStart = addDays(lastSequentialFinish, 1);
        driver = { name: lastSequentialName, finish: lastSequentialFinish, kind: 'sequence' };
      }

      const calcFinish = addDays(calcStart, Math.max(0, state.days - 1));
      state.blockedBy = driver;

      if (!state.start || state.start.getTime() !== calcStart.getTime() || !state.finish || state.finish.getTime() !== calcFinish.getTime()) {
        state.start = calcStart;
        state.finish = calcFinish;
        changed = true;
      }

      if (mode === 'Sequence' && state.finish && state.finish > lastSequentialFinish) {
        lastSequentialFinish = state.finish;
        lastSequentialName = rule.activity;
      }
    });
  }

  return stateMap;
}

export function recalculatePlanningDates(
  rows: any[],
  blockNo: string,
  globalMode: PlanningMode,
  getScope?: (activity: string, block: string) => number
) {
  const blockRows = rows.filter(r => r.blockNo === blockNo && !r.isCategoryRow);
  if (blockRows.length === 0) return rows;

  const anchorDate = getBlockAnchor(rows, blockNo, blockRows);

  // No project start date: nothing to plan from. Take back the dates this engine had calculated, so
  // clearing the Start Date really empties the block.
  if (!anchorDate) {
    let cleared = false;
    rows.forEach(r => {
      if (r.blockNo === blockNo && !r.isCategoryRow && (r._autoPlanned || r.newStartDate || r.newEndDate)) {
        r.newStartDate = '';
        r.newEndDate = '';
        r._autoPlanned = false;
        cleared = true;
      }
    });
    return cleared ? [...rows] : rows;
  }

  const stateMap = computeSchedule(blockRows, anchorDate, globalMode, getScope);

  let arrayChanged = false;

  // Sheets saved before the header row held the window: move the dates over once, so they survive
  // the first activity's own dates now being calculated like everyone else's.
  const header = findBlockHeader(rows, blockNo);
  if (header) {
    if (header.windowStart === undefined) { header.windowStart = formatDate(anchorDate); arrayChanged = true; }
    if (header.windowEnd === undefined) {
      const legacyEnd = blockRows[0]?._endTyped && blockRows[0]?.newEndDate ? blockRows[0].newEndDate : '';
      header.windowEnd = legacyEnd;
      arrayChanged = true;
    }
  }

  rows.forEach(r => {
    if (r.blockNo === blockNo && !r.isCategoryRow) {
      const state = stateMap.get(r.activity);
      if (state) {
        const newStartStr = state.start ? formatDate(state.start) : '';
        const newEndStr = state.finish ? formatDate(state.finish) : '';

        if (r.newStartDate !== newStartStr || r.newEndDate !== newEndStr || !!r._autoPlanned !== !!state.start) {
          r.newStartDate = newStartStr;
          r.newEndDate = newEndStr;
          r._autoPlanned = !!state.start;
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

// ---------------------------------------------------------------------------------------------
// Delay analysis - why an activity misses the project end date and what would fix it
// ---------------------------------------------------------------------------------------------

export type DelayStatus = 'no-window' | 'no-plan' | 'on-time' | 'late';

export interface DelayInfo {
  activity: string;
  blockNo: string;
  status: DelayStatus;
  windowStart: string;
  deadline: string;
  start: string;
  finish: string;
  scope: number;
  productivity: number;
  days: number;
  /** Calendar days past the deadline (late) or before it (on time, as a negative number). */
  delayDays: number;
  /** Per-day rate that would let the activity finish by the deadline, when that is possible at all. */
  requiredRate: number | null;
  reasons: string[];
  actions: string[];
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
const calDays = (a: Date, b: Date) => differenceInCalendarDays(a, b);

/**
 * Analyses every activity of one block against the project window typed on its first activity.
 * Returns a map keyed by activity name.
 */
export function analyzeBlock(
  rows: any[],
  blockNo: string,
  globalMode: PlanningMode,
  getScope?: (activity: string, block: string) => number
): Map<string, DelayInfo> {
  const result = new Map<string, DelayInfo>();
  const blockRows = rows.filter(r => r.blockNo === blockNo && !r.isCategoryRow);
  if (blockRows.length === 0) return result;

  const anchor = getBlockAnchor(rows, blockNo, blockRows);
  const deadline = getBlockDeadline(rows, blockNo, blockRows);
  const states = anchor ? computeSchedule(blockRows, anchor, globalMode, getScope) : null;

  blockRows.forEach(r => {
    const state = states?.get(r.activity);
    const rule = BESS_PLANNING_RULES_MAP.get(r.activity);
    const info: DelayInfo = {
      activity: r.activity,
      blockNo,
      status: 'no-window',
      windowStart: anchor ? formatDate(anchor) : '',
      deadline: deadline ? formatDate(deadline) : '',
      start: state?.start ? formatDate(state.start) : '',
      finish: state?.finish ? formatDate(state.finish) : '',
      scope: state?.scope ?? resolveScope(r, getScope),
      productivity: state?.prod ?? Number(r.productivity || 0),
      days: state?.days ?? 0,
      delayDays: 0,
      requiredRate: null,
      reasons: [],
      actions: [],
    };
    result.set(r.activity, info);

    if (!anchor) {
      info.reasons.push('No project start date yet.');
      info.actions.push('Pick the project Start Date and End Date on the light-green block header row. Every activity is planned from them.');
      return;
    }
    if (!deadline) {
      info.reasons.push('No project end date yet, so there is nothing to compare this activity against.');
      info.actions.push('Pick the project End Date on the light-green block header row.');
      return;
    }
    if (!state || state.days === 0 || !state.start || !state.finish) {
      info.status = 'no-plan';
      info.reasons.push(
        state && state.scope > 0
          ? 'Productivity is empty, so the number of days cannot be worked out.'
          : state && state.prod > 0
            ? 'Scope is empty, so the number of days cannot be worked out.'
            : 'Scope and Productivity are both empty, so this activity has no planned dates.'
      );
      info.actions.push('Enter the Scope and the Productivity (quantity per day) for this activity.');
      return;
    }

    info.delayDays = calDays(state.finish, deadline);
    if (info.delayDays <= 0) {
      info.status = 'on-time';
      info.reasons.push(
        `Finishes on ${info.finish}, ${info.delayDays === 0 ? 'the same day as' : `${plural(-info.delayDays, 'day')} before`} the project end date (${info.deadline}).`
      );
      return;
    }

    // ---- late ----
    info.status = 'late';
    const windowDays = calDays(deadline, anchor) + 1;
    const waitDays = calDays(state.start, anchor);

    info.reasons.push(
      `Planned to finish on ${info.finish}, ${plural(info.delayDays, 'day')} after the project end date (${info.deadline}).`
    );
    info.reasons.push(
      `It needs ${plural(state.days, 'day')}: scope ${state.scope} at ${state.prod} per day.`
    );
    if (waitDays > 0 && state.blockedBy) {
      info.reasons.push(
        state.blockedBy.kind === 'dependency'
          ? `It cannot start until "${state.blockedBy.name}" is finished on ${formatDate(state.blockedBy.finish)}, so it starts ${plural(waitDays, 'day')} after the project start (${info.windowStart}).`
          : `Activities in Sequence run one after another: it starts ${plural(waitDays, 'day')} after the project start because "${state.blockedBy.name}" is still running until ${formatDate(state.blockedBy.finish)}.`
      );
    } else if (waitDays > 0) {
      info.reasons.push(`It starts ${plural(waitDays, 'day')} after the project start (${info.windowStart}).`);
    }
    if (state.days > windowDays) {
      info.reasons.push(
        `The whole window is only ${plural(windowDays, 'day')} (${info.windowStart} to ${info.deadline}), shorter than the ${plural(state.days, 'day')} this activity needs even if it started on day one.`
      );
    }

    // ---- what to do ----
    if (state.start <= deadline) {
      const availableDays = calDays(deadline, state.start) + 1;
      const rate = Math.ceil(state.scope / availableDays);
      info.requiredRate = rate;
      if (rate > state.prod) {
        info.actions.push(
          `Raise Productivity from ${state.prod} to at least ${rate} per day (${(rate / state.prod).toFixed(1)}x the current rate). It then needs ${plural(availableDays, 'day')} and finishes by ${info.deadline}.`
        );
      }
    } else {
      info.actions.push(
        `Even finishing in a single day this activity could not start before ${info.start}, which is after the project end date. Productivity on this activity alone cannot fix it - the activities before it must finish sooner.`
      );
    }
    if (state.blockedBy && states) {
      // Walk back through whatever is holding each activity up until we reach the one that is not
      // waiting on anything: that is where the delay really starts.
      const chain: string[] = [];
      const seen = new Set<string>([r.activity]);
      let cur: PlanState['blockedBy'] = state.blockedBy;
      while (cur && !seen.has(cur.name)) {
        chain.push(cur.name);
        seen.add(cur.name);
        cur = states.get(cur.name)?.blockedBy ?? null;
      }
      const rootName = chain[chain.length - 1];
      const rootState = states.get(rootName);
      if (chain.length > 1) {
        info.reasons.push(`Delay chain: ${[...chain].reverse().concat(r.activity).join('  ->  ')}.`);
      }
      if (rootState && rootState.days > 0 && rootState.start) {
        // The root must finish early enough for everything queued behind it to still fit.
        const downstreamDays = chain.slice(0, -1).reduce((sum, n) => sum + (states.get(n)?.days || 0), 0) + state.days;
        const availableDays = calDays(deadline, rootState.start) + 1 - downstreamDays;
        const rootRate = availableDays >= 1 ? Math.ceil(rootState.scope / availableDays) : null;
        info.actions.push(
          rootRate !== null && rootRate > rootState.prod
            ? `Raise "${rootName}" Productivity from ${rootState.prod} to at least ${rootRate} per day (it now needs ${plural(rootState.days, 'day')}): it starts the chain, so finishing it sooner moves every activity waiting behind it forward.`
            : `Finish "${rootName}" sooner (it now needs ${plural(rootState.days, 'day')}): it starts the chain, so every day saved there moves every activity waiting behind it forward.`
        );
      } else {
        info.actions.push(`Finish "${rootName}" sooner: every day saved there moves this activity forward by a day.`);
      }
    }
    if (rule && globalMode === 'Sequence' && rule.allowedModes.includes('Parallel')) {
      info.actions.push('Run it in Parallel instead of Sequence (the mode switch at the top of the sheet) so it does not wait for other activities.');
    }
    if (info.actions.length === 0) {
      info.actions.push('Increase Productivity (more crews or machines) or move the project end date.');
    }
  });

  return result;
}
