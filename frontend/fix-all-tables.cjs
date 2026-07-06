const fs = require('fs');

// Fix 1: Remove the dash-date block in all table files
// This block sets dates to '-' when there are no resources
// User wants activity-level dates to show instead

const files = [
  {
    path: 'd:/DPR/Digitalized_DPR_Prod/frontend/src/modules/supervisor/components/ACSheetTable.tsx',
    // Pattern: if (!row.isCustom && (!resources || resources.length === 0)) { d.actS = '-'; ... }
    search: `        if (!row.isCustom && (!resources || resources.length === 0)) {\n          d.actS = '-';\n          d.actF = '-';\n          d.fcstS = '-';\n          d.fcstF = '-';\n        }`,
    replace: `        // Activities without resources still show activity-level dates`
  },
  {
    path: 'd:/DPR/Digitalized_DPR_Prod/frontend/src/modules/supervisor/components/DCSheetTable.tsx',
    search: `        if (!row.isCustom && (!resources || resources.length === 0)) {\n          d.actS = '-';\n          d.actF = '-';\n          d.fcstS = '-';\n          d.fcstF = '-';\n        }`,
    replace: `        // Activities without resources still show activity-level dates`
  },
  {
    path: 'd:/DPR/Digitalized_DPR_Prod/frontend/src/modules/supervisor/components/DPQtyTable.tsx',
    search: `      if (!row.isCustom && (!resources || resources.length === 0)) {\n        d.actS = '-';\n        d.actF = '-';\n        d.fcstS = '-';\n        d.fcstF = '-';\n      }`,
    replace: `      // Activities without resources still show activity-level dates`
  },
  {
    path: 'd:/DPR/Digitalized_DPR_Prod/frontend/src/modules/supervisor/components/wind/WindProgressTable.tsx',
    search: `      if (!row.isCustom && (!resources || resources.length === 0)) {\n        d.actS = '-';\n        d.actF = '-';\n        d.fcstS = '-';\n        d.fcstF = '-';\n      }`,
    replace: `      // Activities without resources still show activity-level dates`
  }
];

// Fix 2: Also re-apply the scope override fix (in case git checkout reverted it)
const scopeFixFiles = [
  'd:/DPR/Digitalized_DPR_Prod/frontend/src/modules/supervisor/components/ACSheetTable.tsx',
  'd:/DPR/Digitalized_DPR_Prod/frontend/src/modules/supervisor/components/DCSheetTable.tsx'
];

files.forEach(({ path, search, replace }) => {
  let data = fs.readFileSync(path, 'utf8');
  // Normalize line endings for matching
  const searchNorm = search.replace(/\n/g, '\r\n');
  if (data.includes(searchNorm)) {
    data = data.replace(searchNorm, replace);
    fs.writeFileSync(path, data);
    console.log('Fixed dash-dates in ' + path.split('/').pop());
  } else if (data.includes(search)) {
    data = data.replace(search, replace);
    fs.writeFileSync(path, data);
    console.log('Fixed dash-dates in ' + path.split('/').pop());
  } else {
    console.log('Pattern not found in ' + path.split('/').pop());
  }
});

// Fix 2: Scope override fix - only update scope from resource when resource actually changes
scopeFixFiles.forEach(path => {
  let data = fs.readFileSync(path, 'utf8');
  
  // Fix: let scope = Number(row[X]) || 0; -> preserve string for decimals
  const scopeRegex = /let scope = Number\(row\[(\d+)\]\) \|\| 0;/;
  const match = data.match(scopeRegex);
  if (match) {
    data = data.replace(scopeRegex, 
      `let scopeStr = row[${match[1]}] !== undefined ? String(row[${match[1]}]) : '0';\n      let scope = Number(scopeStr) || 0;`);
  }
  
  // Fix: scope: String(scope) -> scope: scopeStr (preserve decimal string)
  data = data.replace(/scope:\s*String\(scope\),/g, 'scope: scopeStr,');

  // Fix: Only update scope from selectedRes when resource ID actually changed
  const oldPattern = `if (!originalRow.isCustom && selectedRes) {\r\n        scope = selectedRes.plannedUnits || 0;`;
  const newPattern = `if (!originalRow.isCustom && selectedRes) {\r\n        if (newSelectedResourceId !== String(originalRow.selectedResourceId || '')) {\r\n          scope = selectedRes.plannedUnits || 0;\r\n          scopeStr = String(scope);\r\n        }`;
  
  if (data.includes(oldPattern)) {
    data = data.replace(oldPattern, newPattern);
    console.log('Fixed scope override in ' + path.split('/').pop());
  }
  
  fs.writeFileSync(path, data);
});

console.log('All fixes applied!');
