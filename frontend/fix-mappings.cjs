const fs = require('fs');
const file = 'd:/DPR/Digitalized_DPR_Prod/frontend/src/services/p6ActivityService.ts';
let code = fs.readFileSync(file, 'utf8');

const r1 = /forecastStart: a\.forecastStartDate \? a\.forecastStartDate\.split\('T'\)\[0\] : "",/g;
const n1 = `forecastStart: (a as any).forecastStart ? String((a as any).forecastStart).split('T')[0] : (a.forecastStartDate ? String(a.forecastStartDate).split('T')[0] : ""),`;

const r2 = /forecastFinish: a\.forecastFinishDate \? a\.forecastFinishDate\.split\('T'\)\[0\] : "",/g;
const n2 = `forecastFinish: (a as any).forecastFinish ? String((a as any).forecastFinish).split('T')[0] : (a.forecastFinishDate ? String(a.forecastFinishDate).split('T')[0] : ""),`;

const r3 = /actualStart: a\.actualStartDate \? a\.actualStartDate\.split\('T'\)\[0\] : "",/g;
const n3 = `actualStart: (a as any).actualStart ? String((a as any).actualStart).split('T')[0] : (a.actualStartDate ? String(a.actualStartDate).split('T')[0] : ""),`;

const r4 = /actualFinish: a\.actualFinishDate \? a\.actualFinishDate\.split\('T'\)\[0\] : "",/g;
const n4 = `actualFinish: (a as any).actualFinish ? String((a as any).actualFinish).split('T')[0] : (a.actualFinishDate ? String(a.actualFinishDate).split('T')[0] : ""),`;

const r5 = /yesterdayValue: a\.yesterday \|\| "",/g;
const n5 = `yesterdayValue: (a as any).yesterdayValue || a.yesterday || "",`;

const r6 = /todayValue: a\.today \|\| "",/g;
const n6 = `todayValue: (a as any).todayValue || a.today || "",`;

code = code.replace(r1, n1).replace(r2, n2).replace(r3, n3).replace(r4, n4).replace(r5, n5).replace(r6, n6);
fs.writeFileSync(file, code);
console.log('Replaced dates and values successfully!');
