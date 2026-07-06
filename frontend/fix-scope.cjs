const fs = require('fs');
const cp = require('child_process');

const files = cp.execSync('dir /s /b d:\\DPR\\Digitalized_DPR_Prod\\frontend\\src\\*Table.tsx', {encoding: 'utf8'})
  .split('\r\n').filter(Boolean);

files.forEach(f => {
  let data = fs.readFileSync(f, 'utf8');
  if (data.includes('handleDataChange = useCallback')) {
    let replaced = false;
    
    // Replace:
    // if (!originalRow.isCustom && selectedRes) {
    //   scope = selectedRes.plannedUnits || 0;
    //   baseActual = selectedRes.actualUnits || 0;
    // }
    // WITH:
    // if (!originalRow.isCustom && selectedRes) {
    //   if (newSelectedResourceId !== String(originalRow.selectedResourceId || '')) {
    //     scope = selectedRes.plannedUnits || 0;
    //   }
    //   baseActual = selectedRes.actualUnits || 0;
    // }
    
    // Some files might use selectedRes.planned_units, so use regex
    const regex1 = /if\s*\(!originalRow\.isCustom\s*&&\s*selectedRes\)\s*\{\s*scope\s*=\s*selectedRes\.(plannedUnits|planned_units)\s*\|\|\s*0;\s*baseActual\s*=\s*selectedRes\.(actualUnits|actual_units)\s*\|\|\s*0;\s*\}/g;
    
    data = data.replace(regex1, (match, p1, p2) => {
      replaced = true;
      return `if (!originalRow.isCustom && selectedRes) {\n        if (newSelectedResourceId !== String(originalRow.selectedResourceId || '')) {\n          scope = selectedRes.${p1} || 0;\n        }\n        baseActual = selectedRes.${p2} || 0;\n      }`;
    });
    
    // Also, another variation: 
    // if (!originalRow.isCustom) { ... if (selectedRes) { scope = ... } }
    
    if (replaced) {
      fs.writeFileSync(f, data);
      console.log('Fixed scope override in ' + f);
    }
  }
});
