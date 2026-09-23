import React, { useMemo } from 'react';

interface ManpowerFormatTableProps {
  block: string;
  manpowerData?: any[];
  dailyHistory?: Record<string, Record<string, number>>;
}

export const ManpowerFormatTable: React.FC<ManpowerFormatTableProps> = ({ block, manpowerData = [], dailyHistory = {} }) => {
  // We make every month have 5 weeks for consistency and to cover 31 days.
  const months = [
    { name: 'Dec-25', weeks: ['W1', 'W2', 'W3', 'W4', 'W5'] },
    { name: 'Jan-26', weeks: ['W1', 'W2', 'W3', 'W4', 'W5'] },
    { name: 'Feb-26', weeks: ['W1', 'W2', 'W3', 'W4', 'W5'] },
    { name: 'Mar-26', weeks: ['W1', 'W2', 'W3', 'W4', 'W5'] },
    { name: 'Apr-26', weeks: ['W1', 'W2', 'W3', 'W4', 'W5'] },
    { name: 'May-26', weeks: ['W1', 'W2', 'W3', 'W4', 'W5'] },
    { name: 'Jun-26', weeks: ['W1', 'W2', 'W3', 'W4', 'W5'] },
    { name: 'Jul-26', weeks: ['W1', 'W2', 'W3', 'W4', 'W5'] },
    { name: 'Aug-26', weeks: ['W1', 'W2', 'W3', 'W4', 'W5'] },
    { name: 'Sep-26', weeks: ['W1', 'W2', 'W3', 'W4', 'W5'] },
  ];

  const totalWeeks = months.reduce((acc, m) => acc + m.weeks.length, 0);
  const getEmptyCells = (count: number) => Array.from({ length: count }).map((_, i) => <td key={i} className="border border-slate-400"></td>);

  // Group activities by category
  const categories = useMemo(() => {
    const cats: Record<string, any[]> = { bop: [], acdc: [], structural: [], others: [] };
    
    manpowerData.forEach(act => {
      const name = String(act.name || act.activity_name || act.description || '').toLowerCase();
      const wbs = String(act.wbs_name || act.parent_wbs_name || '').toLowerCase();
      const combined = `${name} ${wbs}`;
      
      const isCivil = combined.match(/civil|bop|piling|pile|foundation|trench|excavation|concrete|building|road|drain|earthwork/i);
      const isElectrical = combined.match(/acdc|ac\/dc|electrical|cable|wiring|inverter|battery|transformer|testing|stringing|panel|switchyard/i);
      const isStructural = combined.match(/peb|structural|structure|mms|steel|erection|canopy/i);

      if (isCivil) {
        cats.bop.push(act);
      } else if (isElectrical) {
        cats.acdc.push(act);
      } else if (isStructural) {
        cats.structural.push(act);
      } else {
        cats.others.push(act);
      }
    });
    return cats;
  }, [manpowerData]);

  // Aggregate daily history for the last 7 days and map to weeks
  const weeklyData = useMemo(() => {
    const last7Dates: string[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      last7Dates.push(d.toISOString().split('T')[0]);
    }

    // Mapping: monthName -> weekName -> category -> dailyTotals array
    const dataByWeek: Record<string, Record<string, Record<string, number[]>>> = {};

    last7Dates.forEach(dateStr => {
      const d = new Date(dateStr);
      const monthStr = d.toLocaleString('en-US', { month: 'short' }) + '-' + d.getFullYear().toString().slice(-2);
      const weekStr = 'W' + Math.ceil(d.getDate() / 7);

      if (!dataByWeek[monthStr]) dataByWeek[monthStr] = {};
      if (!dataByWeek[monthStr][weekStr]) dataByWeek[monthStr][weekStr] = { bop: [], acdc: [], structural: [], others: [] };

      // Calculate total manpower for this day across categories
      const calculateTotalForCat = (catKey: keyof typeof categories) => {
        return categories[catKey].reduce((sum, act) => {
          const actId = String(act.activity_id || act.activityId || act.id || '');
          const val = Number(dailyHistory[actId]?.[dateStr] || 0);
          return sum + val;
        }, 0);
      };

      dataByWeek[monthStr][weekStr].bop.push(calculateTotalForCat('bop'));
      dataByWeek[monthStr][weekStr].acdc.push(calculateTotalForCat('acdc'));
      dataByWeek[monthStr][weekStr].structural.push(calculateTotalForCat('structural'));
      dataByWeek[monthStr][weekStr].others.push(calculateTotalForCat('others'));
    });

    // Flatten to a column-index based array for easy rendering
    const bopActuals: (string | null)[] = [];
    const acdcActuals: (string | null)[] = [];
    const structActuals: (string | null)[] = [];
    const othersActuals: (string | null)[] = [];

    months.forEach(m => {
      m.weeks.forEach(w => {
        const weekData = dataByWeek[m.name]?.[w];
        if (weekData) {
          // Peak manpower for the week
          bopActuals.push(Math.max(...weekData.bop) > 0 ? String(Math.max(...weekData.bop)) : '0');
          acdcActuals.push(Math.max(...weekData.acdc) > 0 ? String(Math.max(...weekData.acdc)) : '0');
          structActuals.push(Math.max(...weekData.structural) > 0 ? String(Math.max(...weekData.structural)) : '0');
          othersActuals.push(Math.max(...weekData.others) > 0 ? String(Math.max(...weekData.others)) : '0');
        } else {
          bopActuals.push(null);
          acdcActuals.push(null);
          structActuals.push(null);
          othersActuals.push(null);
        }
      });
    });

    return { bopActuals, acdcActuals, structActuals, othersActuals };
  }, [categories, dailyHistory]);

  const renderActualCells = (actuals: (string | null)[], isRed: boolean = false, isGreen: boolean = false) => {
    return actuals.map((val, i) => (
      <td key={i} className={`border border-slate-400 text-center font-medium ${isRed ? 'text-red-500' : isGreen ? 'text-green-600' : 'text-slate-700'}`}>
        {val !== null ? val : ''}
      </td>
    ));
  };

  // Helper to compute Total Actuals per week
  const totalActuals = weeklyData.bopActuals.map((bop, i) => {
    const acdc = weeklyData.acdcActuals[i];
    const struct = weeklyData.structActuals[i];
    const others = weeklyData.othersActuals[i];
    if (bop === null && acdc === null && struct === null && others === null) return null;
    return String(Number(bop || 0) + Number(acdc || 0) + Number(struct || 0) + Number(others || 0));
  });

  return (
    <div className="w-full flex flex-col p-4 bg-white h-full overflow-y-auto" style={{ fontSize: '10px' }}>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse border border-slate-400 min-w-max">
          <thead>
            {/* Months Header Row */}
            <tr className="bg-[#800040] text-white">
              <th className="border border-slate-400 p-1" rowSpan={2}>SN</th>
              <th className="border border-slate-400 p-1 w-24" rowSpan={2}>Description</th>
              <th className="border border-slate-400 p-1 w-20" rowSpan={2}>Contractor</th>
              <th className="border border-slate-400 p-1 w-20" rowSpan={2}>Forecast &<br/>Actual</th>
              {months.map(m => (
                <th key={m.name} className="border border-slate-400 p-1 text-center" colSpan={m.weeks.length}>{m.name}</th>
              ))}
            </tr>
            {/* Weeks Header Row */}
            <tr className="bg-[#800040] text-white">
              {months.flatMap(m => m.weeks.map((w, i) => (
                <th key={`${m.name}-${w}-${i}`} className="border border-slate-400 p-1 text-center font-normal min-w-[24px]">{w}</th>
              )))}
            </tr>
          </thead>
          <tbody>
            
            {/* Category 1: BOP Civil works */}
            <tr>
              <td className="border border-slate-400 p-1 text-center" rowSpan={3}>1</td>
              <td className="border border-slate-400 p-1 text-center" rowSpan={3}>BOP Civil<br/>works</td>
              <td className="border border-slate-400 p-1 text-center" rowSpan={3}>M SC</td>
              <td className="border border-slate-400 p-1 text-center text-slate-700 font-medium">Forecast</td>
              {getEmptyCells(totalWeeks)}
            </tr>
            <tr>
              <td className="border border-slate-400 p-1 text-center text-green-600 font-medium bg-green-50/50">Actual</td>
              {renderActualCells(weeklyData.bopActuals, false, true)}
            </tr>
            <tr>
              <td className="border border-slate-400 p-1 text-center text-red-600 font-medium bg-red-50/50">Shortfall</td>
              {getEmptyCells(totalWeeks)}
            </tr>

            {/* Category 2: ACDC works */}
            <tr>
              <td className="border border-slate-400 p-1 text-center" rowSpan={3}>2</td>
              <td className="border border-slate-400 p-1 text-center" rowSpan={3}>ACDC works</td>
              <td className="border border-slate-400 p-1 text-center" rowSpan={3}>PRATIBHA</td>
              <td className="border border-slate-400 p-1 text-center text-slate-700 font-medium">Forecast</td>
              {getEmptyCells(totalWeeks)}
            </tr>
            <tr>
              <td className="border border-slate-400 p-1 text-center text-green-600 font-medium bg-green-50/50">Actual</td>
              {renderActualCells(weeklyData.acdcActuals, false, true)}
            </tr>
            <tr>
              <td className="border border-slate-400 p-1 text-center text-red-600 font-medium bg-red-50/50">Shortfall</td>
              {getEmptyCells(totalWeeks)}
            </tr>

            {/* Category 3: Structural/ PEB works */}
            <tr>
              <td className="border border-slate-400 p-1 text-center" rowSpan={3}>3</td>
              <td className="border border-slate-400 p-1 text-center" rowSpan={3}>Structural/<br/>PEB works</td>
              <td className="border border-slate-400 p-1 text-center" rowSpan={3}>SYNERGY</td>
              <td className="border border-slate-400 p-1 text-center text-slate-700 font-medium">Forecast</td>
              {getEmptyCells(totalWeeks)}
            </tr>
            <tr>
              <td className="border border-slate-400 p-1 text-center text-green-600 font-medium bg-green-50/50">Actual</td>
              {renderActualCells(weeklyData.structActuals, false, true)}
            </tr>
            <tr>
              <td className="border border-slate-400 p-1 text-center text-red-600 font-medium bg-red-50/50">Shortfall</td>
              {getEmptyCells(totalWeeks)}
            </tr>

            {/* Total Row */}
            <tr className="font-bold bg-slate-50">
              <td className="border border-slate-400 p-1 text-center" colSpan={3} rowSpan={3}>Total</td>
              <td className="border border-slate-400 p-1 text-center text-slate-700">Forecast</td>
              {getEmptyCells(totalWeeks)}
            </tr>
            <tr className="font-bold bg-green-50/50">
              <td className="border border-slate-400 p-1 text-center text-green-700">Actual</td>
              {renderActualCells(totalActuals.map(t => t ? String(Number(t) - Number(weeklyData.othersActuals[totalActuals.indexOf(t)] || 0)) : null), false, true)}
            </tr>
            <tr className="font-bold bg-red-50/50">
              <td className="border border-slate-400 p-1 text-center text-red-600">Shortfall</td>
              {getEmptyCells(totalWeeks)}
            </tr>

            {/* Others */}
            <tr>
              <td className="border border-slate-400 p-1 text-center font-bold" colSpan={3}>Others (Cemindia)</td>
              <td className="border border-slate-400 p-1 text-center font-bold text-green-700 bg-green-50/50">Actual</td>
              {renderActualCells(weeklyData.othersActuals, false, true)}
            </tr>

            {/* Total Actual */}
            <tr className="bg-green-100 font-bold">
              <td className="border border-slate-400 p-1 text-center text-green-800" colSpan={3}>Total Actual</td>
              <td className="border border-slate-400 p-1 text-center text-green-800">-</td>
              {renderActualCells(totalActuals, false, true)}
            </tr>

          </tbody>
        </table>
      </div>
    </div>
  );
};
