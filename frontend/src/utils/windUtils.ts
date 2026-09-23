export const isOthersAct = (row: any) => {
  const group = (row.activityGroup || '').toUpperCase();
  const desc = (row.description || '').toUpperCase();
  const actId = (row.activityId || '').toUpperCase();

  const othersGroups = [
    'HOTO', 'MILESTONES', 'HSE', 'QA/QC', 'ENG', 'ORD', 
    'DEL', 'PRC', 'ENGINEERING', 'PROCUREMENT', 'LA', 'LAND ACQUISITION'
  ];
  if (othersGroups.includes(group)) return true;

  const keywords = ['HOTO', 'MILESTONE', 'HSE', 'QA/QC', 'LAND ACQUISITION', '-LA-'];
  if (keywords.some(k => actId.includes(k) || desc.includes(k))) return true;

  return false;
};

export const extractBase = (desc: string) => {
  if (!desc) return 'Other';
  const match = desc.match(/^(?:WTG\d+|[A-Z\d]+)-(?:CW|EL|TC|ER|PSS|USS|TC|ELE|ERE|ERECTION|COMM)[-_](.+)$/i) ||
    desc.match(/^(?:WTG\d+|[A-Z\d]+)[-_](.+)$/i);

  if (match && match[1]) {
    return match[1].replace(/_/g, ' ').trim();
  }
  return desc;
};

export const getNormalizedLocation = (row: any) => {
  if (row.locations) return row.locations;
  
  // Try extracting from description first, as it reliably contains WTG11-ERW-... etc.
  const wtgMatch = row.description?.match(/(WTG[-_]?\s*\d+)/i);
  if (wtgMatch) {
    // Return WTG11, WTG12 etc.
    return wtgMatch[1].toUpperCase().replace(/[-_\s]+/g, '');
  }

  // If backend provided the enriched parent WBS block (e.g., "WTG 1 - MP710")
  // Use regex to ensure it actually contains a WTG number, avoiding "WTG ERECTION WORKS"
  if (row.block && /WTG[-_]?\s*\d+/i.test(row.block)) {
    return row.block;
  }

  return row.block || '';
};

export const aggregateWindManpowerByLocation = (rows: any[], wtgLocationMap?: Map<string, string>) => {
  if (!rows || rows.length === 0) return rows;

  const rawGroupMap = new Map<string, any[]>();
  rows.forEach(row => {
      const groupKey = getNormalizedLocation(row) || 'OTHERS';
      if (!rawGroupMap.has(groupKey)) {
          rawGroupMap.set(groupKey, []);
      }
      rawGroupMap.get(groupKey)!.push(row);
  });

  const groupKeys = Array.from(rawGroupMap.keys()).sort((a, b) => {
      if (a === 'OTHERS' && b !== 'OTHERS') return 1;
      if (a !== 'OTHERS' && b === 'OTHERS') return -1;
      
      const aIsWtg = a.toUpperCase().startsWith('WTG');
      const bIsWtg = b.toUpperCase().startsWith('WTG');
      
      if (aIsWtg && !bIsWtg) return -1;
      if (!aIsWtg && bIsWtg) return 1;

      return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
  });

  const result: any[] = [];
  groupKeys.forEach(groupKey => {
      const groupRows = rawGroupMap.get(groupKey)!;
      
      const totalBudgeted = groupRows.reduce((sum, r) => sum + (Number(r.budgetedUnits) || 0), 0);
      const totalActual = groupRows.reduce((sum, r) => sum + (Number(r.actualUnits) || 0), 0);
      const totalRemaining = groupRows.reduce((sum, r) => sum + (Number(r.remainingUnits) || 0), 0);
      const totalYesterday = groupRows.reduce((sum, r) => sum + (Number(r.yesterdayValue) || 0), 0);
      const totalToday = groupRows.reduce((sum, r) => sum + (Number(r.todayValue) || 0), 0);
      const pctComplete = totalBudgeted > 0 ? Number(((totalActual / totalBudgeted) * 100).toFixed(2)) : 0;

      const dailyActuals: Record<string, string> = {};
      const dailyContractors: Record<string, string> = {};
      const dailyRequired: Record<string, string> = {};
      const allKeys = new Set<string>();
      groupRows.forEach(r => Object.keys(r).forEach(k => allKeys.add(k)));
      
      allKeys.forEach(k => {
          if (k.startsWith('actual_')) {
              const sum = groupRows.reduce((s, r) => s + (Number(r[k]) || 0), 0);
              dailyActuals[k] = String(sum);
          }
          if (k.startsWith('contractor_')) {
              dailyContractors[k] = '';
          }
          if (k.startsWith('required_')) {
              const hasValue = groupRows.some(r => r[k] !== undefined && r[k] !== '' && r[k] !== null);
              if (hasValue) {
                  const sum = groupRows.reduce((s, r) => s + (Number(r[k]) || 0), 0);
                  dailyRequired[k] = String(sum);
              } else {
                  dailyRequired[k] = '';
              }
          }
      });

      result.push({
          isCategoryRow: true,
          description: wtgLocationMap?.get(groupKey) || groupKey,
          activityId: '',
          block: '',
          budgetedUnits: String(totalBudgeted),
          actualUnits: String(totalActual),
          remainingUnits: String(totalRemaining),
          percentComplete: String(pctComplete),
          yesterdayValue: String(totalYesterday),
          todayValue: String(totalToday),
          ...dailyActuals,
          ...dailyContractors,
          ...dailyRequired,
      });

      groupRows.sort((a, b) => (a.activityId || '').localeCompare(b.activityId || '')).forEach(r => {
          result.push(r);
      });
  });

  return result;
};
