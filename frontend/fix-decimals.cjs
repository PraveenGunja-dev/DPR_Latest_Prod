const fs = require('fs');
const cp = require('child_process');

const files = cp.execSync('dir /s /b d:\\DPR\\Digitalized_DPR_Prod\\frontend\\src\\*Table.tsx', {encoding: 'utf8'})
  .split('\r\n').filter(Boolean);

files.forEach(f => {
  let data = fs.readFileSync(f, 'utf8');
  let replaced = false;

  // Replace let scope = Number(row[X]) || 0;
  // with let scopeStr = row[X] !== undefined ? String(row[X]) : '0'; let scope = Number(scopeStr) || 0;
  const regex1 = /let scope = Number\(row\[(\d+)\]\) \|\| 0;/g;
  data = data.replace(regex1, "let scopeStr = row[$1] !== undefined ? String(row[$1]) : '0';\n      let scope = Number(scopeStr) || 0;");

  // In the updatedRow construction, replace scope: String(scope), with scope: scopeStr,
  const regex2 = /scope:\s*String\(scope\)/g;
  data = data.replace(regex2, "scope: scopeStr");

  if (data.includes('scopeStr')) {
    fs.writeFileSync(f, data);
    console.log('Fixed decimal stringification in ' + f);
  }
});
