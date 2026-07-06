const fs = require('fs');
const files = [
  'd:/DPR/Digitalized_DPR_Prod/frontend/src/modules/supervisor/components/wind/WindProgressTable.tsx',
  'd:/DPR/Digitalized_DPR_Prod/frontend/src/modules/supervisor/components/DPQtyTable.tsx',
  'd:/DPR/Digitalized_DPR_Prod/frontend/src/modules/supervisor/components/DCSheetTable.tsx',
  'd:/DPR/Digitalized_DPR_Prod/frontend/src/modules/supervisor/components/ACSheetTable.tsx'
];

files.forEach(f => {
  let data = fs.readFileSync(f, 'utf8');
  data = data.replace(/readonlyCells:\s*\["Actual Start",\s*"Actual Finish",\s*"Forecast Start",\s*"Forecast Finish"\]/g, 'readonlyCells: []');
  fs.writeFileSync(f, data);
  console.log('Replaced in ' + f);
});
