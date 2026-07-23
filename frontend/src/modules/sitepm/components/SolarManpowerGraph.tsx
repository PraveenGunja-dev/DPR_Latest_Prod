import React, { useMemo, useState } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts';
import { Users } from 'lucide-react';

interface SolarManpowerGraphProps {
  submittedEntries: any[];
  historyEntries?: any[];
}

export const SolarManpowerGraph: React.FC<SolarManpowerGraphProps> = ({ submittedEntries = [], historyEntries = [] }) => {
  const [range, setRange] = useState<7 | 15 | 30>(7);

    const chartData = useMemo(() => {
    // TEMP DEBUG - remove once confirmed against real data
    console.log('[Manpower Graph Debug] RAW submittedEntries total:', submittedEntries.length);

    const allEntries = [...submittedEntries, ...historyEntries].filter(e =>
      e.sheet_type === 'manpower_details' || e.sheet_type === 'manpower_details_2'
    );

    // Sort entries by date ascending so newer entries come last
    const sortedEntries = [...allEntries].sort((a, b) => {
      const dA = new Date(a.submission_date || a.submitted_at || a.created_at || a.entry_date).getTime();
      const dB = new Date(b.submission_date || b.submitted_at || b.created_at || b.entry_date).getTime();
      return dA - dB;
    });

    const manpower1ByActivityAndDate: Record<string, Record<string, number>> = {};
    const manpower2ByActivityAndDate: Record<string, Record<string, number>> = {};

    sortedEntries.forEach(entry => {
      const dateStr = String(entry.submission_date || entry.submitted_at || entry.created_at || entry.entry_date || '').split('T')[0];
      if (!dateStr || dateStr === 'undefined') return;

      let rows: any[] = [];
      try {
        const data = typeof entry.data_json === 'string' ? JSON.parse(entry.data_json) : entry.data_json;
        rows = data.rows || (Array.isArray(data) ? data : []);
      } catch (e) {
        return;
      }

      // Determine today and yesterday dates from entry_date
      const entryDateObj = new Date(entry.entry_date || entry.submitted_at || entry.created_at || new Date());
      const entryDateIso = entryDateObj.toISOString().split('T')[0];
      const yesterdayDateObj = new Date(entryDateObj);
      yesterdayDateObj.setDate(yesterdayDateObj.getDate() - 1);
      const yesterdayDateIso = yesterdayDateObj.toISOString().split('T')[0];

      const targetMap = entry.sheet_type === 'manpower_details_2' ? manpower2ByActivityAndDate : manpower1ByActivityAndDate;

      rows.forEach(row => {
        if (!row.isCategoryRow) {
          const actKey = `${row.activityId || ''}_${row.description || ''}_${row.block || ''}_${row.slNo || Math.random()}`;
          if (!targetMap[actKey]) targetMap[actKey] = {};

          // Format 4: plain todayValue/yesterdayValue
          const todayVal = parseFloat(row.todayValue || '0');
          if (!isNaN(todayVal)) {
            targetMap[actKey][entryDateIso] = todayVal;
          }
          const yestVal = parseFloat(row.yesterdayValue || '0');
          if (!isNaN(yestVal)) {
            targetMap[actKey][yesterdayDateIso] = yestVal;
          }

          // Format 1: history array
          if (Array.isArray(row.history)) {
            row.history.forEach((h: any) => {
              const val = parseFloat(h.actual || '0');
              if (!isNaN(val) && h.date) {
                targetMap[actKey][h.date] = val;
              }
            });
          }

          // Format 2: actual_YYYY-MM-DD
          Object.keys(row).forEach(key => {
            if (key.startsWith('actual_')) {
              const rowDateStr = key.replace('actual_', '');
              const val = parseFloat(row[key] || '0');
              if (!isNaN(val)) {
                targetMap[actKey][rowDateStr] = val;
              }
            }
          });

          // Format 3: historyValues object
          if (row.historyValues && typeof row.historyValues === 'object') {
            Object.keys(row.historyValues).forEach(dateKey => {
              const val = parseFloat(row.historyValues[dateKey] || '0');
              if (!isNaN(val)) {
                targetMap[actKey][dateKey] = val;
              }
            });
          }
        }
      });
    });

    const dailyTotals: Record<string, number> = {};
    
    [manpower1ByActivityAndDate, manpower2ByActivityAndDate].forEach(map => {
        Object.values(map).forEach(dateMap => {
            Object.entries(dateMap).forEach(([date, val]) => {
                dailyTotals[date] = (dailyTotals[date] || 0) + val;
            });
        });
    });

    const sortedDates = Object.keys(dailyTotals).sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
    
    // Fill in missing dates for the selected range up to today
    const result: any[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let i = range - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      
      // Format as YYYY-MM-DD in local time to match how data is stored
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const localIso = `${year}-${month}-${day}`;
      
      result.push({
        date: d.toLocaleDateString("en-IN", { day: '2-digit', month: 'short' }),
        manpower: dailyTotals[localIso] || 0
      });
    }

    return result;
  }, [submittedEntries, historyEntries, range]);

  return (
    <div className="w-[calc(35%-1.5rem)] mt-6 mb-8 flex flex-col">
      <div className="w-full bg-card/95 backdrop-blur-sm rounded-xl shadow-lg border border-border overflow-hidden relative flex-1">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-purple-500 to-indigo-500" />
        
        <div className="px-6 py-5 flex justify-between items-center border-b border-border bg-muted/10">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-purple-500/10 rounded-lg text-purple-600 dark:text-purple-400 shadow-sm">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-foreground tracking-tight">Manpower Graph</h3>
            </div>
          </div>
          <div className="flex gap-2">
            {[7, 15, 30].map(days => (
              <button
                key={days}
                onClick={() => setRange(days as any)}
                className={`text-xs px-3 py-1.5 rounded-full font-medium transition-all ${
                  range === days 
                    ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300 shadow-sm' 
                    : 'text-muted-foreground hover:bg-muted'
                }`}
              >
                {days} Days
              </button>
            ))}
          </div>
        </div>

        <div className="p-4 h-[350px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="colorManpower" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" opacity={0.5} />
              <XAxis 
                dataKey="date" 
                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} 
                axisLine={false} 
                tickLine={false}
                dy={10}
              />
              <YAxis 
                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} 
                axisLine={false} 
                tickLine={false}
                dx={-10}
              />
              <RechartsTooltip 
                contentStyle={{ 
                  backgroundColor: 'hsl(var(--card))', 
                  borderColor: 'hsl(var(--border))',
                  borderRadius: '8px',
                  fontSize: '12px',
                  boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'
                }}
                itemStyle={{ color: 'hsl(var(--foreground))', fontWeight: 600 }}
              />
              <Area 
                type="monotone" 
                dataKey="manpower" 
                stroke="#8b5cf6" 
                strokeWidth={3}
                fillOpacity={1} 
                fill="url(#colorManpower)" 
                activeDot={{ r: 6, fill: "#8b5cf6", stroke: "#fff", strokeWidth: 2 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};
