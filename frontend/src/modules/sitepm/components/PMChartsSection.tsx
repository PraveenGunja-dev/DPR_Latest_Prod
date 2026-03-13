import React, { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { motion, AnimatePresence } from "framer-motion";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
  Legend,
  ComposedChart,
  Line
} from "recharts";
import { BarChart3, TrendingUp, Users, PieChart as PieChartIcon, Activity, AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import ReactECharts from 'echarts-for-react';

// Strictly using project theme colors
const CHART_COLORS = {
  primary: "hsl(200, 90%, 37%)",      // Adani Blue
  secondary: "hsl(270, 36%, 44%)",    // Adani Purple
  success: "hsl(142, 76%, 36%)",      // Green
  warning: "hsl(38, 92%, 50%)",       // Orange
  danger: "hsl(0, 84%, 60%)",         // Red
  muted: "hsl(220, 10%, 60%)",        // Gray
};

const PIE_COLORS = [
  CHART_COLORS.warning,  // Pending
  CHART_COLORS.success,  // Approved
  CHART_COLORS.danger,   // Rejected
  CHART_COLORS.primary,  // Other
];

const BAR_COLORS = [
  CHART_COLORS.primary,
  CHART_COLORS.secondary,
  CHART_COLORS.success,
  CHART_COLORS.warning,
  CHART_COLORS.danger,
];

// Custom Tooltip
const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="rounded-lg border border-border bg-popover p-3 shadow-lg">
        <p className="font-medium text-foreground mb-1">{label}</p>
        {payload.map((entry: any, index: number) => (
          <p key={index} className="text-sm" style={{ color: entry.color }}>
            {entry.name}: {entry.value}
          </p>
        ))}
      </div>
    );
  }
  return null;
};

// Axis props for theming
const axisProps = {
  tick: { fill: "hsl(var(--muted-foreground))", fontSize: 11 },
  tickLine: { stroke: "hsl(var(--muted-foreground))" },
  axisLine: { stroke: "hsl(var(--border))" },
};

interface ChartCardProps {
  title: string;
  description?: string;
  children: React.ReactNode;
  icon?: React.ReactNode;
  isEmpty?: boolean;
}

const ChartCard: React.FC<ChartCardProps> = ({ title, description, children, icon, isEmpty }) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.3 }}
  >
    <Card className="shadow-sm border-border bg-card h-full hover:shadow-md transition-shadow">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          {icon}
          <div>
            <CardTitle className="text-base font-medium text-foreground">{title}</CardTitle>
            {description && (
              <CardDescription className="text-xs text-muted-foreground">{description}</CardDescription>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isEmpty ? (
          <div className="h-[220px] flex flex-col items-center justify-center text-muted-foreground">
            <BarChart3 className="w-10 h-10 mb-2 opacity-30" />
            <p className="text-sm">No data available</p>
          </div>
        ) : (
          children
        )}
      </CardContent>
    </Card>
  </motion.div>
);

// Sheet type label mapping
const getSheetTypeLabel = (sheetType: string) => {
  const labels: Record<string, string> = {
    dp_qty: "DP Qty",
    dp_block: "DP Block",
    dp_vendor_idt: "Vendor IDT",
    dp_vendor_block: "Vendor Block",
    mms_module_rfi: "MMS/RFI",
    manpower_details: "Manpower",
  };
  return labels[sheetType] || sheetType;
};

interface PMChartsSectionProps {
  submittedEntries: any[];
  onStatClick?: (filterType: string, entries: any[], title: string) => void;
}

export const PMChartsSection: React.FC<PMChartsSectionProps> = ({ submittedEntries, onStatClick }) => {
  const [timeRange, setTimeRange] = useState<"today" | "7d" | "30d" | "all">("all");

  // Compute chart data from real entries
  const chartData = useMemo(() => {
    // 1. Precise Date Filtering
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const filteredEntries = (submittedEntries || []).filter(entry => {
      if (timeRange === "all") return true;

      const dateVal = entry.entry_date || entry.submitted_at || entry.created_at;
      if (!dateVal) return false;

      const entryDate = new Date(dateVal);
      if (isNaN(entryDate.getTime())) return false;

      const compareDate = new Date(entryDate);
      compareDate.setHours(0, 0, 0, 0);

      const diffTime = today.getTime() - compareDate.getTime();
      const diffDays = Math.floor(diffTime / (1000 * 3600 * 24));

      if (timeRange === "today") {
        return compareDate.toDateString() === today.toDateString();
      } else if (timeRange === "7d") {
        return diffDays >= -1 && diffDays < 7; // -1 to handle slight future skews
      } else if (timeRange === "30d") {
        return diffDays >= -1 && diffDays < 30;
      }
      return true;
    });
    // 2. Status Normalization (Inclusive map)
    const getNormalizedStatus = (s: string): 'Approved' | 'Rejected' | 'Pending' => {
      const status = (s || "").toLowerCase();
      if (status.includes('approved')) return 'Approved';
      if (status.includes('rejected')) return 'Rejected';
      return 'Pending';
    };

    // 3. Aggregate Data for Charts
    const statusCounts = { Approved: 0, Pending: 0, Rejected: 0 };
    const typeCounts: Record<string, number> = {};
    const supervisorStats: Record<string, { approved: number; rejected: number; pending: number }> = {};

    filteredEntries.forEach(entry => {
      const status = getNormalizedStatus(entry.status);
      statusCounts[status]++;

      const type = getSheetTypeLabel(entry.sheet_type || "unknown");
      typeCounts[type] = (typeCounts[type] || 0) + 1;

      const sup = entry.supervisor_name || entry.supervisor_email || "Unknown";
      if (!supervisorStats[sup]) supervisorStats[sup] = { approved: 0, rejected: 0, pending: 0 };
      if (status === 'Approved') supervisorStats[sup].approved++;
      else if (status === 'Rejected') supervisorStats[sup].rejected++;
      else supervisorStats[sup].pending++;
    });

    // Transform aggregates for specific charts
    const statusData = Object.entries(statusCounts)
      .filter(([_, value]) => value > 0)
      .map(([name, value]) => ({ name, value }));

    const typeData = Object.entries(typeCounts).map(([name, count]) => ({ name, count }));

    const supervisorData = Object.entries(supervisorStats)
      .map(([name, stats]) => ({
        name: name.length > 12 ? name.substring(0, 12) + "..." : name,
        ...stats,
      })).slice(0, 6);

    // 4. Trend Dataset Generation (Dynamic Timeframe)
    const entriesWithDates = filteredEntries.map(e => {
      const dVal = e.entry_date || e.submitted_at || e.created_at;
      return { ...e, normDate: new Date(dVal) };
    }).filter(e => !isNaN(e.normDate.getTime()));

    let lookback = 30;
    if (timeRange === "today") lookback = 1;
    else if (timeRange === "7d") lookback = 7;
    else if (timeRange === "all" && entriesWithDates.length > 0) {
      const minTime = Math.min(...entriesWithDates.map(e => e.normDate.getTime()));
      const diffDays = Math.ceil((today.getTime() - minTime) / (1000 * 3600 * 24));
      lookback = Math.min(Math.max(30, diffDays + 1), 180); // Cap at 6 months for performance
    } else {
      lookback = 30;
    }

    const rawDataset: any[] = [['Date', 'Status', 'Count']];
    const dateMap = new Map<string, Map<string, number>>();
    const statusList: ('Approved' | 'Pending' | 'Rejected')[] = ['Approved', 'Pending', 'Rejected'];
    const getDateKey = (d: Date) => d.toLocaleDateString("en-US", { day: 'numeric', month: 'short' });

    // Initialize dateMap chronologically
    for (let i = lookback - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateStr = getDateKey(d);
      const counts = new Map<string, number>();
      statusList.forEach(s => counts.set(s, 0));
      dateMap.set(dateStr, counts);
    }

    // Populate counts
    entriesWithDates.forEach(entry => {
      const dateStr = getDateKey(entry.normDate);
      const normStatus = getNormalizedStatus(entry.status);
      if (dateMap.has(dateStr)) {
        const counts = dateMap.get(dateStr)!;
        counts.set(normStatus, (counts.get(normStatus) || 0) + 1);
      }
    });

    dateMap.forEach((counts, dateStr) => {
      counts.forEach((count, status) => {
        rawDataset.push([dateStr, status, count]);
      });
    });

    const weeklyTrendsOption = {
      animationDuration: 1500,
      dataset: [{ id: 'dataset_raw', source: rawDataset },
      ...statusList.map(s => ({
        id: 'dataset_' + s,
        fromDatasetId: 'dataset_raw',
        transform: { type: 'filter', config: { dimension: 'Status', '=': s } }
      }))
      ],
      tooltip: { trigger: 'axis', order: 'valueDesc' },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        axisLabel: {
          color: '#64748b',
          fontSize: 10,
          interval: lookback > 30 ? (lookback > 90 ? 14 : 6) : (lookback > 10 ? 1 : 0),
          rotate: lookback > 14 ? 30 : 0
        }
      },
      yAxis: { type: 'value', splitLine: { lineStyle: { type: 'dashed' } } },
      grid: { right: 100, left: 40, top: 30, bottom: 40 },
      series: statusList.map(status => {
        const color = status === 'Approved' ? CHART_COLORS.success : status === 'Pending' ? CHART_COLORS.warning : CHART_COLORS.danger;
        return {
          name: status,
          type: 'line',
          datasetId: 'dataset_' + status,
          smooth: true,
          showSymbol: lookback < 40,
          itemStyle: { color },
          areaStyle: { opacity: 0.1, color },
          endLabel: {
            show: lookback < 100,
            formatter: (params: any) => params.value[2] > 0 ? (params.value[1] + ': ' + params.value[2]) : '',
            fontSize: 9
          },
          labelLayout: { moveOverlap: 'shiftY' },
          encode: { x: 'Date', y: 'Count', tooltip: ['Count'] }
        };
      })
    };

    return { statusData, typeData, supervisorData, weeklyTrendsOption, bottleneckData: [], healthData: [] };
  }, [submittedEntries, timeRange]);

  const hasData = (submittedEntries || []).length > 0;
  const hasFilteredData = chartData.statusData.length > 0;

  return (
    <div className="mb-8 space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-primary" />
          <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-100">Dashboard Analytics</h2>
        </div>

        <Tabs
          value={timeRange}
          onValueChange={(val: any) => setTimeRange(val)}
          className="w-full sm:w-auto"
        >
          <TabsList className="grid grid-cols-4 w-[340px] h-9 bg-slate-100 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
            <TabsTrigger value="today" className="text-xs">Today</TabsTrigger>
            <TabsTrigger value="7d" className="text-xs">7D</TabsTrigger>
            <TabsTrigger value="30d" className="text-xs">30D</TabsTrigger>
            <TabsTrigger value="all" className="text-xs">All Time</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={timeRange}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.2 }}
          className="grid gap-4 md:grid-cols-2 lg:grid-cols-3"
        >
          {/* Sheet Status Distribution - ECharts Line Chart (Dataset Filter) */}
          <ChartCard
            title="Sheet Status Trend"
            description={timeRange === "all" ? "Historical submission trends" : `Submissions by status over ${timeRange === 'today' ? 'today' : (timeRange === '7d' ? 'last 7 days' : 'last 30 days')} (Click lines to view details)`}
            icon={<PieChartIcon className="w-4 h-4 text-primary" />}
            isEmpty={!hasFilteredData}
          >
            <div className="w-full h-[220px]">
              <ReactECharts
                option={chartData.weeklyTrendsOption}
                style={{ height: '100%', width: '100%' }}
                opts={{ renderer: 'svg' }}
                onEvents={{
                  'click': (params: any) => {
                    if (onStatClick && params.seriesName && (params.name || params.value)) {
                      const status = params.seriesName;
                      const clickedDateStr = params.name; // The X-axis category label (e.g. "Feb 26")

                      let filterStatus = 'submitted_to_pm';
                      if (status === 'Approved') filterStatus = 'approved_by_pm';
                      if (status === 'Rejected') filterStatus = 'rejected_by_pm';

                      const getDateKey = (d: Date) => d.toLocaleDateString("en-US", { day: 'numeric', month: 'short' });

                      const filtered = (submittedEntries || []).filter(e => {
                        const sMatch = e.status === filterStatus;
                        const dVal = e.entry_date || e.submitted_at || e.created_at;
                        const dMatch = dVal ? getDateKey(new Date(dVal)) === clickedDateStr : false;
                        return sMatch && dMatch;
                      });

                      onStatClick(filterStatus, filtered, `${status} Sheets on ${clickedDateStr}`);
                    }
                  }
                }}
              />
            </div>
          </ChartCard>

          {/* Sheets by Type - Bar Chart */}
          <ChartCard
            title="Sheets by Type"
            description="Count of submissions per sheet type"
            icon={<BarChart3 className="w-4 h-4 text-secondary" />}
            isEmpty={chartData.typeData.length === 0}
          >
            <div className="w-full h-[220px]">
              <ReactECharts
                option={{
                  tooltip: {
                    trigger: 'axis',
                    axisPointer: { type: 'shadow' },
                    backgroundColor: 'rgba(255, 255, 255, 0.9)',
                    borderColor: '#e2e8f0',
                    textStyle: { color: '#0f172a' }
                  },
                  grid: {
                    left: '3%',
                    right: '4%',
                    bottom: '3%',
                    top: '10%',
                    containLabel: true
                  },
                  xAxis: [
                    {
                      type: 'category',
                      data: chartData.typeData.map(d => d.name),
                      axisTick: { alignWithLabel: true },
                      axisLabel: { color: '#64748b', fontSize: 11, interval: 0, rotate: 30 }
                    }
                  ],
                  yAxis: [
                    {
                      type: 'value',
                      splitLine: { lineStyle: { type: 'dashed', color: '#e2e8f0' } },
                      axisLabel: { color: '#64748b', fontSize: 11 }
                    }
                  ],
                  series: [
                    {
                      name: 'Sheets',
                      type: 'bar',
                      barWidth: '60%',
                      itemStyle: {
                        borderRadius: [4, 4, 0, 0]
                      },
                      data: chartData.typeData.map((d, i) => ({
                        value: d.count,
                        itemStyle: { color: BAR_COLORS[i % BAR_COLORS.length] }
                      }))
                    }
                  ]
                }}
                style={{ height: '100%', width: '100%' }}
                opts={{ renderer: 'svg' }}
              />
            </div>
          </ChartCard>

          {/* Status Distribution Summary - Donut Chart (Previously Sheet Status) */}
          <ChartCard
            title="Overall Distribution"
            description="Current status breakdown"
            icon={<Activity className="w-4 h-4 text-primary" />}
            isEmpty={!hasFilteredData}
          >
            <div className="w-full h-[220px]">
              <ReactECharts
                option={{
                  tooltip: {
                    trigger: 'item',
                    formatter: '{a} <br/>{b}: {c} ({d}%)',
                    backgroundColor: 'rgba(255, 255, 255, 0.9)',
                    borderColor: '#e2e8f0',
                    textStyle: { color: '#0f172a' }
                  },
                  legend: {
                    bottom: -5,
                    left: 'center',
                    textStyle: { fontSize: 11, color: '#64748b' },
                    itemWidth: 10,
                    itemHeight: 10,
                  },
                  series: [
                    {
                      name: 'Total Status',
                      type: 'pie',
                      radius: ['50%', '80%'],
                      center: ['50%', '45%'],
                      avoidLabelOverlap: false,
                      itemStyle: {
                        borderRadius: 10,
                        borderColor: '#ffffff',
                        borderWidth: 5
                      },
                      label: {
                        show: false,
                        position: 'center'
                      },
                      emphasis: {
                        label: {
                          show: true,
                          fontSize: 16,
                          fontWeight: 'bold',
                          color: '#64748b'
                        }
                      },
                      labelLine: {
                        show: false
                      },
                      data: chartData.statusData.map((d) => ({
                        value: d.value,
                        name: d.name,
                        itemStyle: {
                          color: d.name === 'Approved' ? CHART_COLORS.success :
                            d.name === 'Pending' ? CHART_COLORS.warning :
                              CHART_COLORS.danger
                        }
                      }))
                    }
                  ]
                }}
                style={{ height: '100%', width: '100%' }}
                opts={{ renderer: 'svg' }}
              />
            </div>
          </ChartCard>

          {/* Supervisor Performance - Stacked Bar (Span 2 cols on large) */}
          <div className="lg:col-span-2">
            <ChartCard
              title="Supervisor Performance"
              description="Submissions by supervisor (Approved vs Rejected)"
              icon={<Users className="w-4 h-4 text-success" />}
              isEmpty={chartData.supervisorData.length === 0}
            >
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={chartData.supervisorData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" {...axisProps} />
                  <YAxis {...axisProps} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend wrapperStyle={{ fontSize: "11px" }} />
                  <Bar dataKey="approved" name="Approved" stackId="a" fill={CHART_COLORS.success} />
                  <Bar dataKey="pending" name="Pending" stackId="a" fill={CHART_COLORS.warning} />
                  <Bar dataKey="rejected" name="Rejected" stackId="a" fill={CHART_COLORS.danger} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>


        </motion.div>
      </AnimatePresence>
    </div>
  );
};