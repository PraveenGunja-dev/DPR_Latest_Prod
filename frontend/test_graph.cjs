const fs = require('fs');

const entry = {
  sheet_type: 'manpower_details_2',
  created_at: '2026-07-21T20:50:02.591Z',
  data_json: {
    rows: [
      {
        "block": "BLOCK-01",
        "activityId": "9712-CC-1000",
        "resourceId": "Solar-MP01-1",
        "actualUnits": 28,
        "description": "Block-01 - Piling - MMS (Marking, Auguring & Concreting)",
        "hoursPerDay": 8,
        "assignmentId": "5718155",
        "_cellStatuses": {
          "22-Jul-26 - Required": "edited_supervisor"
        },
        "budgetedUnits": 67,
        "contractorName": "Piling Manpower",
        "remainingUnits": 0,
        "percentComplete": "1%",
        "actual_2026-07-10": 5,
        "actual_2026-07-22": 7,
        "atCompletionUnits": 27.62,
        "required_2026-07-22": "10"
      }
    ]
  }
};

const allEntries = [entry];
const manpower1Totals = {};
const manpower2Totals = {};

const sortedEntries = [...allEntries].sort((a, b) => {
  const dA = new Date(a.submission_date || a.created_at || a.entry_date).getTime();
  const dB = new Date(b.submission_date || b.created_at || b.entry_date).getTime();
  return dA - dB;
});

sortedEntries.forEach(entry => {
  const dateStr = String(entry.submission_date || entry.created_at || entry.entry_date).split('T')[0];
  if (!dateStr) return;

  let rows = [];
  try {
    const data = typeof entry.data_json === 'string' ? JSON.parse(entry.data_json) : entry.data_json;
    rows = data.rows || (Array.isArray(data) ? data : []);
  } catch (e) {
    return;
  }

  const dateSums = {};
  rows.forEach(row => {
    if (!row.isCategoryRow) {
      Object.keys(row).forEach(key => {
        if (key.startsWith('actual_')) {
          const rowDateStr = key.replace('actual_', '');
          const val = parseFloat(row[key] || '0');
          if (!isNaN(val)) {
            dateSums[rowDateStr] = (dateSums[rowDateStr] || 0) + val;
          }
        }
      });
      
      if (entry.sheet_type === 'manpower_details' && !Object.keys(row).some(k => k.startsWith('actual_'))) {
          const val = parseFloat(row.todayValue || '0');
          if (!isNaN(val)) {
            dateSums[dateStr] = (dateSums[dateStr] || 0) + val;
          }
      }
    }
  });
  
  Object.keys(dateSums).forEach(d => {
    if (entry.sheet_type === 'manpower_details_2') {
      manpower2Totals[d] = dateSums[d];
    } else {
      manpower1Totals[d] = dateSums[d];
    }
  });
});

const dailyTotals = {};
const allDates = new Set([...Object.keys(manpower1Totals), ...Object.keys(manpower2Totals)]);
allDates.forEach(d => {
  dailyTotals[d] = (manpower1Totals[d] || 0) + (manpower2Totals[d] || 0);
});

console.log("dailyTotals:", dailyTotals);

const result = [];
const today = new Date('2026-07-22T02:00:00+05:30'); // simulate local time
today.setHours(0, 0, 0, 0);

for (let i = 7 - 1; i >= 0; i--) {
  const d = new Date(today);
  d.setDate(d.getDate() - i);
  
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const localIso = `${year}-${month}-${day}`;
  
  result.push({
    date: d.toLocaleDateString("en-IN", { day: '2-digit', month: 'short' }),
    manpower: dailyTotals[localIso] || 0,
    localIso
  });
}

console.log("result:", result);
