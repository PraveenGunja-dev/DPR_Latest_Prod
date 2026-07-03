const HISTORY_COLS = 5;
const arr = [
  '', '', '', '', '', '', 
  '0', '0', '0', 
  '', '', '', '', '', '', '', 
  '', '', '', '', '', '', ''
];
arr.isCategoryRow = true;

const childArr = [
  '', '', '', '', '', '', 
  '124050', '241', '123809', 
  '', '', '', '', '', '', '', 
  '11', '', '', '', '', '', ''
];

const rows = [arr, childArr];

let currentSums = {
  scope: 0,
  actual: 0,
  balance: 0,
  history: Array(HISTORY_COLS).fill(0),
  yesterday: 0,
  today: 0
};

for (let i = rows.length - 1; i >= 0; i--) {
  const row = rows[i];
  if (row.isCategoryRow) {
     row[6] = currentSums.scope === 0 ? "0" : String(Number(currentSums.scope.toFixed(2)));
     row[7] = currentSums.actual === 0 ? "0" : String(Number(currentSums.actual.toFixed(2)));
     row[8] = currentSums.balance === 0 ? "0" : String(Number(currentSums.balance.toFixed(2)));
     
     for (let j = 0; j < HISTORY_COLS; j++) {
        const val = currentSums.history[j];
        row[16 + j] = val === 0 ? "" : String(Number(val.toFixed(2)));
     }
     row[16 + HISTORY_COLS] = currentSums.yesterday === 0 ? "" : String(Number(currentSums.yesterday.toFixed(2)));
     row[16 + HISTORY_COLS + 1] = currentSums.today === 0 ? "" : String(Number(currentSums.today.toFixed(2)));
  } else {
     currentSums.scope += Number(row[6]) || 0;
     currentSums.actual += Number(row[7]) || 0;
     currentSums.balance += Number(row[8]) || 0;
     for (let j = 0; j < HISTORY_COLS; j++) {
        currentSums.history[j] += Number(row[16 + j]) || 0;
     }
     currentSums.yesterday += Number(row[16 + HISTORY_COLS]) || 0;
     currentSums.today += Number(row[16 + HISTORY_COLS + 1]) || 0;
  }
}

console.log(rows[0]);
