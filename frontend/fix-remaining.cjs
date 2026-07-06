const fs = require('fs');

// Fix 1: WindProgressTable - remove readonlyCells with Actual Start/Finish
let windPath = 'd:/DPR/Digitalized_DPR_Prod/frontend/src/modules/supervisor/components/wind/WindProgressTable.tsx';
let windData = fs.readFileSync(windPath, 'utf8');
// Remove "Actual Start", "Actual Finish", "Forecast Start", "Forecast Finish" from readonlyCells arrays
windData = windData.replace(
  /readonlyCells:\s*\[([^\]]*"Actual Start"[^\]]*)\]/g,
  'readonlyCells: []'
);
fs.writeFileSync(windPath, windData);
console.log('Fixed WindProgressTable readonlyCells');

// Fix 2: DPQtyTable - apply scopeStr fix (decimal preservation)
let dpqPath = 'd:/DPR/Digitalized_DPR_Prod/frontend/src/modules/supervisor/components/DPQtyTable.tsx';
let dpqData = fs.readFileSync(dpqPath, 'utf8');
const scopeRegex = /let scope = Number\(row\[(\d+)\]\) \|\| 0;/;
const match = dpqData.match(scopeRegex);
if (match) {
  dpqData = dpqData.replace(scopeRegex,
    `let scopeStr = row[${match[1]}] !== undefined ? String(row[${match[1]}]) : '0';\n      let scope = Number(scopeStr) || 0;`);
  dpqData = dpqData.replace(/scope:\s*String\(scope\),/g, 'scope: scopeStr,');
  fs.writeFileSync(dpqPath, dpqData);
  console.log('Fixed DPQtyTable decimal preservation');
} else {
  console.log('DPQtyTable scope pattern not found (may already be fixed)');
}

console.log('Done!');
