const fs = require('fs');
const cp = require('child_process');
const files = cp.execSync('dir /s /b d:\\DPR\\Digitalized_DPR_Prod\\frontend\\src\\*.tsx', {encoding: 'utf8'}).split('\r\n').filter(Boolean);

let changed = 0;
files.forEach(f => {
  let d = fs.readFileSync(f, 'utf8');
  let originalD = d;
  
  // change const newForecastStart to let newForecastStart
  d = d.replace(/const newForecastStart = /g, 'let newForecastStart = ');
  d = d.replace(/const newForecastFinish = /g, 'let newForecastFinish = ');

  // Positive confirm block (Actual Start)
  let regexStartPos = /if \(window\.confirm\("You selected a future date for an Actual Start\.\\nP6 only accepts past\/present dates for Actuals\.\\n\\nClick OK to automatically save it as a Forecast date instead\.\\nClick Cancel to undo your change\."\)\) \{\s*finalActualStart = newActualStart;\s*\}/g;
  d = d.replace(regexStartPos, `if (window.confirm("You selected a future date for an Actual Start.\\nP6 only accepts past/present dates for Actuals.\\n\\nClick OK to automatically save it as a Forecast date instead.\\nClick Cancel to undo your change.")) {\n            newForecastStart = newActualStart;\n            finalActualStart = original.actualStart || '';\n          }`);

  // Positive confirm block (Actual Finish)
  let regexFinishPos = /if \(window\.confirm\("You selected a future date for an Actual Finish\.\\nP6 only accepts past\/present dates for Actuals\.\\n\\nClick OK to automatically save it as a Forecast date instead\.\\nClick Cancel to undo your change\."\)\) \{\s*finalActualFinish = newActualFinish;\s*\}/g;
  d = d.replace(regexFinishPos, `if (window.confirm("You selected a future date for an Actual Finish.\\nP6 only accepts past/present dates for Actuals.\\n\\nClick OK to automatically save it as a Forecast date instead.\\nClick Cancel to undo your change.")) {\n            newForecastFinish = newActualFinish;\n            finalActualFinish = original.actualFinish || '';\n          }`);

  // Negative confirm block (Actual Start)
  let regexStartNeg = /if \(\!window\.confirm\("You selected a future date for an Actual Start\.\\nP6 only accepts past\/present dates for Actuals\.\\n\\nClick OK to automatically save it as a Forecast date instead\.\\nClick Cancel to undo your change\."\)\) \{([\s\S]*?)\} else \{\s*finalActualStart = newActualStart;\s*\}/g;
  d = d.replace(regexStartNeg, `if (!window.confirm("You selected a future date for an Actual Start.\\nP6 only accepts past/present dates for Actuals.\\n\\nClick OK to automatically save it as a Forecast date instead.\\nClick Cancel to undo your change.")) {$1} else {\n            newForecastStart = newActualStart;\n            finalActualStart = original.actualStart || '';\n          }`);

  // Negative confirm block (Actual Finish)
  let regexFinishNeg = /if \(\!window\.confirm\("You selected a future date for an Actual Finish\.\\nP6 only accepts past\/present dates for Actuals\.\\n\\nClick OK to automatically save it as a Forecast date instead\.\\nClick Cancel to undo your change\."\)\) \{([\s\S]*?)\} else \{\s*finalActualFinish = newActualFinish;\s*\}/g;
  d = d.replace(regexFinishNeg, `if (!window.confirm("You selected a future date for an Actual Finish.\\nP6 only accepts past/present dates for Actuals.\\n\\nClick OK to automatically save it as a Forecast date instead.\\nClick Cancel to undo your change.")) {$1} else {\n            newForecastFinish = newActualFinish;\n            finalActualFinish = original.actualFinish || '';\n          }`);

  if(d !== originalD) {
    fs.writeFileSync(f, d);
    console.log('Updated ' + f);
    changed++;
  }
});
console.log('Done, updated ' + changed + ' files.');
