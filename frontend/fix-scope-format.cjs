const fs = require('fs');
const cp = require('child_process');
const files = cp.execSync('dir /s /b d:\\DPR\\Digitalized_DPR_Prod\\frontend\\src\\*.tsx', {encoding: 'utf8'}).split('\r\n').filter(Boolean);

let changed = 0;
files.forEach(f => {
  let d = fs.readFileSync(f, 'utf8');
  let originalD = d;

  // Add formatNum import if not exists
  if (!d.includes('formatNum(') && d.includes('row.scope')) {
     if (!d.includes('import { formatNum }')) {
        d = d.replace(/import \{.*?\} from "@\/services\/dprService";/, (match) => match.replace('}', ', formatNum }'));
        if (!d.includes('formatNum')) {
           d = d.replace(/import \{.*?\} from "@\/utils\/formatters";/, (match) => match.replace('}', ', formatNum }'));
        }
     }
  }

  // regex to replace row.scope !== undefined ? String(row.scope) : "0"
  // Actually there's many variations.
  // Let's just find and replace String(row.scope), String(row.actual), String(row.balance), String(row.cumulative), String(row.totalQuantity)
  d = d.replace(/String\(row\.scope\)/g, 'formatNum(row.scope)');
  d = d.replace(/String\(row\.actual\)/g, 'formatNum(row.actual)');
  d = d.replace(/String\(row\.balance\)/g, 'formatNum(row.balance)');
  d = d.replace(/String\(row\.cumulative\)/g, 'formatNum(row.cumulative)');
  d = d.replace(/String\(row\.totalQuantity\)/g, 'formatNum(row.totalQuantity)');
  
  // and also check if formatNum is imported. If not, import it.
  if (d !== originalD && !d.includes('import { formatNum }')) {
     d = `import { formatNum } from "@/utils/formatters";\n` + d;
  }

  if(d !== originalD) {
    fs.writeFileSync(f, d);
    console.log('Updated ' + f);
    changed++;
  }
});
console.log('Done, updated ' + changed + ' files.');
