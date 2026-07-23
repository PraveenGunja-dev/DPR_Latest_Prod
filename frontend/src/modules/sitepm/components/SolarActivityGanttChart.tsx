import React, { useMemo, useState } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { GanttChartSquare, X } from 'lucide-react';
import { axisProps, ChartCard } from '@/components/charts';
import { formatNum } from '@/utils/formatters';

const GANTT_COLORS = {
  baseline: '#000000',
  actual: '#22c55e',
  forecast: '#3b82f6',
};

export interface GanttActivityStat {
  scope?: number;
  completed?: number;
  baselineStart?: string;
  baselineFinishDate?: string;
  actualStart?: string;
  actualFinish?: string;
  forecastStart?: string;
  forecastFinishDate?: string;
}

type SeriesKey = 'baseline' | 'actual' | 'forecast';

interface SelectedDetail {
  activity: string;
  series: SeriesKey;
  label: string;
  color: string;
  start?: string;
  finish?: string;
  pct: number;
}

const SERIES_LABELS: Record<SeriesKey, string> = {
  baseline: 'Baseline',
  actual: 'Actual',
  forecast: 'Forecast',
};

interface SolarActivityGanttChartProps {
  activities: string[];
  getStat: (name: string) => GanttActivityStat;
}

const MS_PER_DAY = 1000 * 60 * 60 * 24;

const toDate = (value?: string): Date | null => {
  if (!value) return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
};

const formatDate = (value?: string): string => {
  const d = toDate(value);
  if (!d) return 'N/A';
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' }).replace(/ /g, '-');
};

const DURATION_KEY_TO_SERIES: Record<string, SeriesKey> = {
  baselineDuration: 'baseline',
  progressActualDuration: 'actual',
  progressForecastDuration: 'forecast',
};

const GanttTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload || !payload.length) return null;
  const item = payload[0];
  const dataKey = String(item?.dataKey || '');
  // Ignore the invisible offset bars (the padding segment before a bar starts) -
  // only show a tooltip when hovering an actual visible segment.
  const seriesKey = DURATION_KEY_TO_SERIES[dataKey];
  if (!seriesKey) return null;

  const row = item.payload;
  if (!row) return null;

  const start = row[`${seriesKey}Start`];
  const finish = row[`${seriesKey}Finish`];
  const color = GANTT_COLORS[seriesKey];
  const seriesLabel = SERIES_LABELS[seriesKey];

  return (
    <div className="rounded-lg border border-border bg-popover p-3 shadow-lg text-xs space-y-1 max-w-xs">
      <p className="font-medium text-foreground mb-1">{label}</p>
      <p style={{ color }}>{seriesLabel} % Completed: {formatNum(row.pct)}%</p>
      <p style={{ color }}>{seriesLabel} Start Date: {formatDate(start)}</p>
      <p style={{ color }}>{seriesLabel} Finish Date: {formatDate(finish)}</p>
    </div>
  );
};

export const SolarActivityGanttChart: React.FC<SolarActivityGanttChartProps> = ({ activities, getStat }) => {
  const [selected, setSelected] = useState<SelectedDetail | null>(null);

  const { chartData, epoch, maxOffset } = useMemo(() => {
    const rows = activities.map((name) => {
      const stat = getStat(name);
      const scope = stat.scope || 0;
      const completed = stat.completed || 0;
      const pct = scope > 0 ? (completed / scope) * 100 : 0;
      return {
        name,
        pct,
        baselineStart: stat.baselineStart,
        baselineFinish: stat.baselineFinishDate,
        actualStart: stat.actualStart,
        actualFinish: stat.actualFinish,
        forecastStart: stat.forecastStart,
        forecastFinish: stat.forecastFinishDate,
      };
    });

    const allDates = rows
      .flatMap((r) => [r.baselineStart, r.baselineFinish, r.actualStart, r.actualFinish, r.forecastStart, r.forecastFinish])
      .map(toDate)
      .filter((d): d is Date => d !== null);

    if (allDates.length === 0) {
      return { chartData: [], epoch: new Date(), maxOffset: 0 };
    }

    const minTime = Math.min(...allDates.map((d) => d.getTime()));
    const epochDate = new Date(minTime);
    epochDate.setHours(0, 0, 0, 0);

    const dayOffset = (value?: string): number | undefined => {
      const d = toDate(value);
      if (!d) return undefined;
      return Math.round((d.getTime() - epochDate.getTime()) / MS_PER_DAY);
    };

    const buildSeries = (startVal?: string, finishVal?: string) => {
      const start = dayOffset(startVal);
      const finish = dayOffset(finishVal);
      if (start === undefined && finish === undefined) return { offset: undefined, duration: undefined };
      const s = start ?? finish!;
      const f = finish ?? start!;
      return { offset: s, duration: Math.max(f - s, 1) };
    };

    // Actual + Forecast are rendered as a single continuous bar: green from
    // actualStart -> actualFinish, then blue continuing from there -> forecastFinish.
    const buildProgressSeries = (r: typeof rows[number]) => {
      const aStart = dayOffset(r.actualStart);
      const aFinish = dayOffset(r.actualFinish);
      const fStart = dayOffset(r.forecastStart);
      const fFinish = dayOffset(r.forecastFinish);

      if (aStart === undefined && aFinish === undefined && fStart === undefined && fFinish === undefined) {
        return { offset: undefined, actualDuration: undefined, forecastDuration: undefined };
      }

      const start = aStart ?? aFinish ?? fStart ?? fFinish!;
      const greenEnd = aFinish !== undefined ? aFinish : start;
      const actualDuration = Math.max(greenEnd - start, 0);
      const blueEnd = fFinish !== undefined ? fFinish : greenEnd;
      // Milestones (e.g. COD) often have forecastStart === forecastFinish - keep at least a
      // 1-day sliver so a forecast-only entry is still visible instead of a 0-width bar.
      const forecastDuration = fFinish !== undefined ? Math.max(blueEnd - greenEnd, 1) : 0;

      return { offset: start, actualDuration, forecastDuration };
    };

    let maxOff = 0;
    const data = rows.map((r) => {
      const baseline = buildSeries(r.baselineStart, r.baselineFinish);
      const progress = buildProgressSeries(r);

      if (baseline.offset !== undefined && baseline.duration !== undefined) {
        maxOff = Math.max(maxOff, baseline.offset + baseline.duration);
      }
      if (progress.offset !== undefined) {
        maxOff = Math.max(maxOff, progress.offset + (progress.actualDuration || 0) + (progress.forecastDuration || 0));
      }

      return {
        ...r,
        baselineOffset: baseline.offset,
        baselineDuration: baseline.duration,
        progressOffset: progress.offset,
        progressActualDuration: progress.actualDuration,
        progressForecastDuration: progress.forecastDuration,
      };
    });

    return { chartData: data, epoch: epochDate, maxOffset: maxOff };
  }, [activities, getStat]);

  const tickFormatter = (value: number) => {
    const d = new Date(epoch.getTime() + value * MS_PER_DAY);
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
  };

  const isEmpty = chartData.every(
    (d) => d.baselineDuration === undefined && d.progressActualDuration === undefined && d.progressForecastDuration === undefined
  );

  const selectDetail = (series: SeriesKey) => (data: any) => {
    if (!data) return;
    const startKey = series === 'baseline' ? 'baselineStart' : series === 'actual' ? 'actualStart' : 'forecastStart';
    const finishKey = series === 'baseline' ? 'baselineFinish' : series === 'actual' ? 'actualFinish' : 'forecastFinish';
    setSelected({
      activity: data.name,
      series,
      label: SERIES_LABELS[series],
      color: GANTT_COLORS[series],
      start: data[startKey],
      finish: data[finishKey],
      pct: data.pct,
    });
  };

  return (
    <ChartCard
      title="Activity Schedule (Baseline vs Actual vs Forecast)"
      description="Start & finish dates per activity, sourced from the DP Qty sheet"
      icon={<GanttChartSquare className="w-4 h-4 text-primary" />}
      isEmpty={isEmpty}
    >
      {selected && (
        <div
          className="mb-3 rounded-lg bg-slate-900 text-white text-xs p-3 flex items-start justify-between gap-3"
          style={{ borderLeft: `3px solid ${selected.color}` }}
        >
          <div className="space-y-1">
            <p className="font-semibold" style={{ color: selected.color }}>{selected.activity}</p>
            <p>{selected.label} % Completed: {formatNum(selected.pct)}%</p>
            <p>{selected.label} Start Date: {formatDate(selected.start)}</p>
            <p>{selected.label} Finish Date: {formatDate(selected.finish)}</p>
          </div>
          <button
            type="button"
            onClick={() => setSelected(null)}
            className="text-slate-400 hover:text-white shrink-0"
            aria-label="Close"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
      <ResponsiveContainer width="100%" height={Math.max(500, chartData.length * 60)}>
        <BarChart data={chartData} layout="vertical" margin={{ top: 10, right: 20, left: 0, bottom: 10 }} barCategoryGap="25%">
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
          <XAxis
            type="number"
            domain={[0, Math.max(maxOffset, 1)]}
            tickFormatter={tickFormatter}
            {...axisProps}
          />
          <YAxis dataKey="name" type="category" width={190} {...axisProps} />
          <Tooltip content={<GanttTooltip />} cursor={false} shared={false} />
          <Legend
            wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
            payload={[
              { value: 'Baseline', type: 'square', color: GANTT_COLORS.baseline },
              { value: 'Actual', type: 'square', color: GANTT_COLORS.actual },
              { value: 'Forecast', type: 'square', color: GANTT_COLORS.forecast },
            ]}
          />
          <Bar dataKey="baselineOffset" stackId="baseline" fill="transparent" legendType="none" isAnimationActive={false} />
          <Bar
            dataKey="baselineDuration"
            stackId="baseline"
            fill={GANTT_COLORS.baseline}
            style={{ fill: GANTT_COLORS.baseline }}
            name="Baseline"
            radius={[3, 3, 3, 3]}
            isAnimationActive={false}
            onClick={selectDetail('baseline')}
            cursor="pointer"
          />
          <Bar dataKey="progressOffset" stackId="progress" fill="transparent" legendType="none" isAnimationActive={false} />
          <Bar
            dataKey="progressActualDuration"
            stackId="progress"
            fill={GANTT_COLORS.actual}
            style={{ fill: GANTT_COLORS.actual }}
            name="Actual"
            radius={[3, 3, 3, 3]}
            isAnimationActive={false}
            onClick={selectDetail('actual')}
            cursor="pointer"
          />
          <Bar
            dataKey="progressForecastDuration"
            stackId="progress"
            fill={GANTT_COLORS.forecast}
            style={{ fill: GANTT_COLORS.forecast }}
            name="Forecast"
            radius={[3, 3, 3, 3]}
            isAnimationActive={false}
            onClick={selectDetail('forecast')}
            cursor="pointer"
          />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
};
