const fs = require('fs');
const cp = require('child_process');

const files = cp.execSync('dir /s /b d:\\DPR\\Digitalized_DPR_Prod\\frontend\\src\\*Table.tsx', {encoding: 'utf8'})
  .split('\r\n').filter(Boolean);

files.forEach(f => {
  let data = fs.readFileSync(f, 'utf8');
  let replaced = false;
  
  if (data.includes('"Forecast Start"')) {
    data = data.replace(/"Forecast Start"\s*,?\s*/g, '');
    replaced = true;
  }
  if (data.includes('"Forecast Finish"')) {
    data = data.replace(/"Forecast Finish"\s*,?\s*/g, '');
    replaced = true;
  }
  if (data.includes('"Baseline Start"')) {
    data = data.replace(/"Baseline Start"\s*,?\s*/g, '');
    replaced = true;
  }
  if (data.includes('"Baseline Finish"')) {
    data = data.replace(/"Baseline Finish"\s*,?\s*/g, '');
    replaced = true;
  }
  
  if (replaced) {
    fs.writeFileSync(f, data);
    console.log('Removed Forecast/Baseline from editableColumns in ' + f);
  }
});
