const fs = require('fs');
const cp = require('child_process');

const files = cp.execSync('dir /s /b d:\\DPR\\Digitalized_DPR_Prod\\frontend\\src\\*Table.tsx', {encoding: 'utf8'})
  .split('\r\n').filter(Boolean);

files.forEach(f => {
  let data = fs.readFileSync(f, 'utf8');
  if (data.includes('const editableColumns')) {
    const lines = data.split('\n');
    const start = lines.findIndex(l => l.includes('const editableColumns'));
    if (start !== -1) {
      const end = lines.findIndex((l, i) => i > start && l.includes('];'));
      if (end !== -1) {
        const block = lines.slice(start, end + 1).join('\n');
        let newBlock = block;
        newBlock = newBlock.replace(/\s*"Forecast Start"\s*,?/g, '');
        newBlock = newBlock.replace(/\s*"Forecast Finish"\s*,?/g, '');
        newBlock = newBlock.replace(/\s*"Baseline Start"\s*,?/g, '');
        newBlock = newBlock.replace(/\s*"Baseline Finish"\s*,?/g, '');
        
        if (block !== newBlock) {
          data = data.replace(block, newBlock);
          fs.writeFileSync(f, data);
          console.log('Fixed editableColumns in ' + f);
        }
      }
    }
  }
});
