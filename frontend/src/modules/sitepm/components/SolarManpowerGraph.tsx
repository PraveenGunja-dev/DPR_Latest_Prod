import React, { useEffect, useMemo, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer } from 'recharts';
import { Users } from 'lucide-react';
import apiClient from '@/services/apiClient';

interface SolarManpowerGraphProps {
  /** The project to plot. When given, the graph reads the Manpower (Contractor) sheet directly. */
  projectId?: number | string;
  /** Legacy inputs - only used when no projectId is available. */
  submittedEntries?: any[];
  historyEntries?: any[];
}

interface Point { date: string; iso: string; required: number; available: number; gap: number }

const fmtDay = (iso: string) => {
  const d = new Date(iso + 'T00:00:00');
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
};

/**
 * Manpower Graph - Required, Available and Gap per day, the same three figures the Summary sheet
 * prints, plotted over time.
 *
 * Reads /oracle-p6/manpower-graph, which is built from the Manpower (Contractor) sheet's saved
 * rows across every report date (drafts included). It used to sum "Available" out of the
 * data_json of *submitted* entries only, so nothing typed on the contractor sheet showed up until
 * it had gone through the whole approval flow - and there was never a Required or Gap line at all.
 */
export const SolarManpowerGraph: React.FC<SolarManpowerGraphProps> = ({ projectId, submittedEntries = [], historyEntries = [] }) => {
  const [range, setRange] = useState<7 | 15 | 30>(7);
  const [series, setSeries] = useState<Point[] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!projectId) { setSeries(null); return; }
    let cancelled = false;
    setLoading(true);
    apiClient.get('/oracle-p6/manpower-graph', { params: { projectId, days: range } })
      .then(res => {
        if (cancelled) return;
        const pts: Point[] = (res.data?.series || []).map((p: any) => ({
          iso: p.date, date: fmtDay(p.date),
          required: Number(p.required) || 0, available: Number(p.available) || 0, gap: Number(p.gap) || 0,
        }));
        setSeries(pts);
      })
      .catch(err => { console.error('[ManpowerGraph] load failed:', err); if (!cancelled) setSeries([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [projectId, range]);

  // Fallback for callers that have no project in hand: the old Available-only derivation.
  const legacyData = useMemo<Point[]>(() => {
    if (projectId) return [];
    const totals: Record<string, number> = {};
    [...submittedEntries, ...historyEntries]
      .filter(e => e.sheet_type === 'manpower_details' || e.sheet_type === 'manpower_details_2')
      .forEach(entry => {
        let rows: any[] = [];
        try { const d = typeof entry.data_json === 'string' ? JSON.parse(entry.data_json) : entry.data_json; rows = d?.rows || []; } catch { return; }
        rows.forEach(row => {
          if (row.isCategoryRow) return;
          Object.keys(row).forEach(k => {
            if (k.startsWith('actual_')) { const v = parseFloat(row[k]); if (!isNaN(v)) totals[k.slice(7)] = (totals[k.slice(7)] || 0) + v; }
          });
          (row.history || []).forEach((h: any) => { const v = parseFloat(h?.actual); if (h?.date && !isNaN(v)) totals[h.date] = (totals[h.date] || 0) + v; });
        });
      });
    const out: Point[] = [];
    const today = new Date(); today.setHours(0, 0, 0, 0);
    for (let i = range - 1; i >= 0; i--) {
      const d = new Date(today); d.setDate(d.getDate() - i);
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      out.push({ iso, date: fmtDay(iso), required: 0, available: totals[iso] || 0, gap: 0 });
    }
    return out;
  }, [projectId, submittedEntries, historyEntries, range]);

  const chartData = series ?? legacyData;
  const hasRequired = chartData.some(p => p.required > 0);

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
              <p className="text-[11px] text-muted-foreground">Required · Available · Gap, from the Manpower (Contractor) sheet</p>
            </div>
          </div>
          <div className="flex gap-2">
            {[7, 15, 30].map(days => (
              <button
                key={days}
                onClick={() => setRange(days as any)}
                className={`text-xs px-3 py-1.5 rounded-full font-medium transition-all ${range === days
                    ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300 shadow-sm'
                    : 'text-muted-foreground hover:bg-muted'
                  }`}
              >
                {days} Days
              </button>
            ))}
          </div>
        </div>

        <div className="p-4 h-[350px] relative">
          {loading && <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">Loading…</div>}
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" opacity={0.5} />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} dy={10} />
              <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} dx={-10} allowDecimals={false} />
              <RechartsTooltip
                contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px', fontSize: '12px', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                itemStyle={{ fontWeight: 600 }}
                labelFormatter={(_, payload) => payload?.[0]?.payload?.iso ? fmtDay(payload[0].payload.iso) : ''}
              />
              <Legend iconType="plainline" wrapperStyle={{ fontSize: 12, paddingTop: 6 }} />
              {(hasRequired || !!projectId) && (
                <Line type="monotone" name="Required" dataKey="required" stroke="#2563eb" strokeWidth={2.5} dot={false} activeDot={{ r: 5 }} />
              )}
              <Line type="monotone" name="Available" dataKey="available" stroke="#16a34a" strokeWidth={2.5} dot={false} activeDot={{ r: 5 }} />
              {(hasRequired || !!projectId) && (
                <Line type="monotone" name="Gap" dataKey="gap" stroke="#dc2626" strokeWidth={2} strokeDasharray="5 3" dot={false} activeDot={{ r: 5 }} />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};
