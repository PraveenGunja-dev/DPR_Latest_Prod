const fs = require('fs');
const cp = require('child_process');
const files = cp.execSync('dir /s /b d:\\DPR\\Digitalized_DPR_Prod\\frontend\\src\\*.tsx', {encoding: 'utf8'}).split('\r\n').filter(Boolean);

let changed = 0;
files.forEach(f => {
  let d = fs.readFileSync(f, 'utf8');
  let originalD = d;
  
  // change the threshold check
  d = d.replace(/const calDateStr = new Date\(yesterday\)\.toISOString\(\)\.split\('T'\)\[0\];/g, "const calDateStr = new Date(today || yesterday || '').toISOString().split('T')[0];");

  // ensure today prop is available in all table interfaces where yesterday is present
  if (d.includes('yesterday?: string;') && !d.includes('today?: string;')) {
    d = d.replace('yesterday?: string;', 'yesterday?: string;\n  today?: string;');
  }
  
  // ensure today is destructured from props
  if (d.includes('yesterday,') && !d.includes('today,')) {
    d = d.replace('yesterday,', 'yesterday,\n  today,');
  }

  if (d !== originalD) {
    fs.writeFileSync(f, d);
    console.log('Updated ' + f);
    changed++;
  }
});
console.log('Done, updated ' + changed + ' files.');
