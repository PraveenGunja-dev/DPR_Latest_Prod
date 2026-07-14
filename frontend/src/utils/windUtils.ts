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
  
  // If backend provided the enriched parent WBS block (e.g., "WTG 1 - MP710")
  if (row.block && row.block.toUpperCase().includes('WTG')) {
    return row.block;
  }

  const wtgMatch = row.description?.match(/(WTG[-_]?\s*\d+)/i);
  if (wtgMatch) {
    return wtgMatch[1].toUpperCase().replace(/[-_]\s*/g, '');
  }
  return row.block || '';
};
