const fs = require('fs');
const { Pool } = require('pg');

const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'DPR',
  password: 'Nikitha',
  port: 5432,
});

async function simulate() {
  const pid = 2530;
  
  const extractNum = (val) => {
      const num = parseFloat(val);
      return isNaN(num) ? 0 : num;
  };
  
  const stripBlockPrefix = (name) => {
    if (!name) return '';
    return name.replace(/^(Block|Blk|Plot)\s*[- ]?\s*\w+\s*-\s*/i, '').trim();
  };

  const sheetTypes = ['summary', 'solar_construction', 'dp_qty', 'ac_sheet', 'dc_sheet'];
  const newStats = {};
  
  // DRAFTS
  for (const st of sheetTypes) {
      const res = await pool.query(`SELECT data_json FROM dpr_supervisor_entries WHERE project_id=$1 AND sheet_type=$2 AND status='draft' ORDER BY updated_at DESC`, [pid, st]);
      const combined_rows = [];
      for (const row of res.rows) {
          let data = row.data_json;
          if (typeof data === 'string') data = JSON.parse(data);
          let r_rows = data.rows || (Array.isArray(data) ? data : []);
          combined_rows.push(...r_rows);
      }
      
      for (const row of combined_rows) {
          if (!row.isCategoryRow) {
              const rawName = row.description || row.name || row.activities || row.activity || '';
              const cleanName = stripBlockPrefix(rawName).toLowerCase();
              if (!cleanName) continue;
              
              if (!newStats[cleanName]) newStats[cleanName] = { scope: 0, completed: 0 };
              
              const scopeVal = extractNum(row.totalQuantity) || extractNum(row.scope) || 0;
              const compVal = extractNum(row.cumulative) || extractNum(row.actual) || extractNum(row.completed) || 0;
              
              if (scopeVal > 0) newStats[cleanName].scope += scopeVal;
              if (compVal > 0) newStats[cleanName].completed += compVal;
          }
      }
  }
  
  console.log("Draft Stats:");
  for (const k of Object.keys(newStats)) {
      if (k.includes('piling') || k.includes('idt')) {
          console.log(`  ${k}: scope=${newStats[k].scope}, completed=${newStats[k].completed}`);
      }
  }
  pool.end();
}

simulate().catch(console.error);
