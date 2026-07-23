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
    console.log('[Manpower Graph Debug] RAW submittedEntries total:', submittedEntries.length, 'sheet_types:', Array.from(new Set(submittedEntries.map((e: any) => e.sheet_type))));
    console.log('[Manpower Graph Debug] RAW historyEntries total:', historyEntries.length, 'sheet_types:', Array.from(new Set(historyEntries.map((e: any) => e.sheet_type))));

    const allEntries = [...submittedEntries, ...historyEntries].filter(e =>
      e.sheet_type === 'manpower_details' || e.sheet_type === 'manpower_details_2'
    );

    const manpower1Totals: Record<string, number> = {};
    const manpower2Totals: Record<string, number> = {};

    // Sort entries by date ascending so newer entries come last
    const sortedEntries = [...allEntries].sort((a, b) => {
      const dA = new Date(a.submission_date || a.submitted_at || a.created_at || a.entry_date).getTime();
      const dB = new Date(b.submission_date || b.submitted_at || b.created_at || b.entry_date).getTime();
      return dA - dB;
    });

    // Group by user_id and sheet_type to only process the absolute latest entry per supervisor per sheet
    // Since the data is timephased, the latest entry contains the full 7-day history.
    const latestEntriesMap: Record<string, any> = {};
    sortedEntries.forEach(entry => {
      const uid = entry.user_id || entry.submitted_by || 0;
      const key = `${uid}_${entry.sheet_type}`;
      latestEntriesMap[key] = entry;
    });

    Object.values(latestEntriesMap).forEach(entry => {
      const dateStr = String(entry.submission_date || entry.submitted_at || entry.created_at || entry.entry_date || '').split('T')[0];
      if (!dateStr || dateStr === 'undefined') return;

      let rows: any[] = [];
      try {
        const data = typeof entry.data_json === 'string' ? JSON.parse(entry.data_json) : entry.data_json;
        rows = data.rows || (Array.isArray(data) ? data : []);
      } catch (e) {
        return;
      }

       // Both manpower_details (Labour Days) and manpower_details_2 (Contractor) now use date-specific actual_YYYY-MM-DD keys.
      const dateSums: Record<string, number> = {};
      
      // Determine today and yesterday dates from entry_date
      const entryDateObj = new Date(entry.entry_date);
      const entryDateIso = entryDateObj.toISOString().split('T')[0];
      const yesterdayDateObj = new Date(entryDateObj);
      yesterdayDateObj.setDate(yesterdayDateObj.getDate() - 1);
      const yesterdayDateIso = yesterdayDateObj.toISOString().split('T')[0];
      
      rows.forEach(row => {
        if (!row.isCategoryRow) {
          // Track which dates have already been counted to avoid double-counting
          const countedDates = new Set<string>();
          
          // ── Format 1: history array (how backend stores after save-draft) ──
          // Backend converts flat fields to [{date: "YYYY-MM-DD", actual: "10"}, ...]
          if (Array.isArray(row.history)) {
            row.history.forEach((h: any) => {
              const val = parseFloat(h.actual || '0');
              if (!isNaN(val) && val > 0 && h.date) {
                dateSums[h.date] = (dateSums[h.date] || 0) + val;
                countedDates.add(h.date);
              }
            });
          }
          
          // ── Format 2: actual_YYYY-MM-DD flat keys ──
          Object.keys(row).forEach(key => {
            if (key.startsWith('actual_')) {
              const rowDateStr = key.replace('actual_', '');
              if (countedDates.has(rowDateStr)) return; // Already counted from history
              const val = parseFloat(row[key] || '0');
              if (!isNaN(val) && val > 0) {
                dateSums[rowDateStr] = (dateSums[rowDateStr] || 0) + val;
                countedDates.add(rowDateStr);
              }
            }
          });

          // ── Format 3: historyValues object ──
          if (row.historyValues && typeof row.historyValues === 'object') {
            Object.keys(row.historyValues).forEach(dateKey => {
              if (countedDates.has(dateKey)) return; // Already counted
              const val = parseFloat(row.historyValues[dateKey] || '0');
              if (!isNaN(val) && val > 0) {
                dateSums[dateKey] = (dateSums[dateKey] || 0) + val;
                countedDates.add(dateKey);
              }
            });
          }
          
          // ── Format 4: plain todayValue/yesterdayValue (fallback for any format) ──
          // Use entry_date to map todayValue to the correct date
          if (!countedDates.has(entryDateIso)) {
            const todayVal = parseFloat(row.todayValue || '0');
            if (!isNaN(todayVal) && todayVal > 0) {
              dateSums[entryDateIso] = (dateSums[entryDateIso] || 0) + todayVal;
              countedDates.add(entryDateIso);
            }
          }
          if (!countedDates.has(yesterdayDateIso)) {
            const yestVal = parseFloat(row.yesterdayValue || '0');
            if (!isNaN(yestVal) && yestVal > 0) {
              dateSums[yesterdayDateIso] = (dateSums[yesterdayDateIso] || 0) + yestVal;
              countedDates.add(yesterdayDateIso);
            }
          }
        }
      });

      
      Object.keys(dateSums).forEach(d => {
        if (entry.sheet_type === 'manpower_details_2') {
          manpower2Totals[d] = (manpower2Totals[d] || 0) + dateSums[d];
        } else {
          manpower1Totals[d] = (manpower1Totals[d] || 0) + dateSums[d];
        }
      });
    });

    const dailyTotals: Record<string, number> = {};
    const allDates = new Set([...Object.keys(manpower1Totals), ...Object.keys(manpower2Totals)]);
    allDates.forEach(d => {
      dailyTotals[d] = (manpower1Totals[d] || 0) + (manpower2Totals[d] || 0);
    });

    // TEMP DEBUG - remove once confirmed against real data
    console.log('[Manpower Graph Debug] manpower_details/manpower_details_2 entries found:', allEntries.length, allEntries.map(e => ({ sheet_type: e.sheet_type, status: e.status, user_id: e.user_id, submitted_by: e.submitted_by, submission_date: e.submission_date, created_at: e.created_at, entry_date: e.entry_date })));
    console.log('[Manpower Graph Debug] latest entry picked per supervisor+sheet:', Object.entries(latestEntriesMap).map(([k, e]: [string, any]) => ({ key: k, id: e.id, status: e.status })));
    console.log('[Manpower Graph Debug] manpower1Totals (Labour Days):', manpower1Totals);
    console.log('[Manpower Graph Debug] manpower2Totals (Contractor):', manpower2Totals);
    console.log('[Manpower Graph Debug] dailyTotals combined:', dailyTotals);

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
