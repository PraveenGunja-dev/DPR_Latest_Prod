const fs = require('fs');

const files = ['ACSheetTable.tsx', 'DCSheetTable.tsx', 'DPQtyTable.tsx'];
const basePath = 'd:/DPR/Digitalized_DPR_Prod/frontend/src/modules/supervisor/components/';

files.forEach(f => {
  const data = fs.readFileSync(basePath + f, 'utf8');
  console.log(f + ':');
  console.log('  dash-dates: ' + data.includes("d.actS = '-'"));
  console.log('  readonlyCells with Actual: ' + data.includes('"Actual Start", "Actual Finish"'));
  console.log('  scope override (no guard): ' + (data.includes('scope = selectedRes.plannedUnits') && !data.includes('newSelectedResourceId !== String')));
  console.log('  scopeStr fix: ' + data.includes('scopeStr'));
});

// Also check WindProgressTable
const windData = fs.readFileSync(basePath + 'wind/WindProgressTable.tsx', 'utf8');
console.log('WindProgressTable.tsx:');
console.log('  dash-dates: ' + windData.includes("d.actS = '-'"));
console.log('  readonlyCells with Actual: ' + windData.includes('"Actual Start", "Actual Finish"'));
