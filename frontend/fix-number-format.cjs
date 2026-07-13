const fs = require('fs');
const cp = require('child_process');
const files = cp.execSync('dir /s /b d:\\DPR\\Digitalized_DPR_Prod\\frontend\\src\\*.tsx', {encoding: 'utf8'}).split('\r\n').filter(Boolean);

let changed = 0;
files.forEach(f => {
  let d = fs.readFileSync(f, 'utf8');
  let originalD = d;

  d = d.replace(/String\(row\.yesterdayValue\)/g, 'formatNum(row.yesterdayValue)');
  d = d.replace(/String\(row\.todayValue\)/g, 'formatNum(row.todayValue)');
  
  // For history arrays, usually looks like:
  // return (!val || Number(val) === 0) ? "" : val;
  // Let's replace return (!val || Number(val) === 0) ? "" : val; with return (!val || Number(val) === 0) ? "" : formatNum(val);
  d = d.replace(/return \(\!val \|\| Number\(val\) === 0\) \? "" : val;/g, 'return (!val || Number(val) === 0) ? "" : formatNum(val);');
  // also handle `return (!valStr || Number(valStr) === 0) ? "" : valStr;`
  d = d.replace(/return \(\!valStr \|\| Number\(valStr\) === 0\) \? "" : valStr;/g, 'return (!valStr || Number(valStr) === 0) ? "" : formatNum(valStr);');

  // For wind tables:
  // return (!val || Number(val) === 0) ? "" : String(val);
  d = d.replace(/return \(\!val \|\| Number\(val\) === 0\) \? "" : String\(val\);/g, 'return (!val || Number(val) === 0) ? "" : formatNum(val);');

  if(d !== originalD) {
    fs.writeFileSync(f, d);
    console.log('Updated ' + f);
    changed++;
  }
});
console.log('Done, updated ' + changed + ' files.');
