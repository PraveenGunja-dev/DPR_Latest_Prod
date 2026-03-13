import React, { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
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
import { BarChart3, TrendingUp, PieChart as PieChartIcon, Activity, AlertCircle, Layers, Filter } from "lucide-react";
import { P6Activity } from "@/services/p6ActivityService";

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
  CHART_COLORS.success,  // Final Approved
  CHART_COLORS.warning,  // Pending
  CHART_COLORS.primary,  // PM Approved
  CHART_COLORS.danger,   // Rejected
];

// Color palette for charts requiring more colors
const PALETTE = [
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
            {entry.name}: {typeof entry.value === 'number' ? entry.value.toLocaleString() : entry.value}
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

interface PMAGChartsSectionProps {
  projectId?: number | string;
  p6Activities: P6Activity[];
  approvedEntries?: any[];
  historyEntries?: any[];
  archivedEntries?: any[];
}

export const PMAGChartsSection: React.FC<PMAGChartsSectionProps> = ({
  projectId,
  p6Activities,
  approvedEntries = [],
  historyEntries = [],
  archivedEntries = []
}) => {
  // Allow multi-selection. Default to all selected.
  const [selectedCharts, setSelectedCharts] = useState<string[]>(["pipeline", "types", "progress", "trends", "delays"]);

  const toggleChart = (chartId: string) => {
    setSelectedCharts(prev =>
      prev.includes(chartId)
        ? prev.filter(id => id !== chartId)
        : [...prev, chartId]
    );
  };

  const chartOptions = [
    { id: "pipeline", label: "Approval Pipeline" },
    { id: "types", label: "Sheet Type Distribution" },
    { id: "progress", label: "Activity Progress" },
    { id: "trends", label: "Weekly Approval Trends" },
    { id: "delays", label: "Top Delayed Activities" }
  ];

  // Compute chart data from real entries
  const chartData = useMemo(() => {
    // Combine all entries for comprehensive analysis
    const allEntries = [
      ...(Array.isArray(approvedEntries) ? approvedEntries : []),
      ...(Array.isArray(historyEntries) ? historyEntries : []),
      ...(Array.isArray(archivedEntries) ? archivedEntries : [])
    ].filter(Boolean);

    // Remove duplicates by id
    const uniqueEntries = allEntries.filter((entry, index, self) =>
      entry && entry.id && index === self.findIndex(e => e && e.id === entry.id)
    );

    // 1. Approval Pipeline (Funnel/Area) - Status distribution over time
    const pipelineData = [
      { name: "Submitted", count: uniqueEntries.filter(e => e.status === "submitted_to_pm").length },
      { name: "PM Approved", count: uniqueEntries.filter(e => e.status === "approved_by_pm").length },
      { name: "Final Approved", count: uniqueEntries.filter(e => e.status === "final_approved" || e.status === "approved_by_pmag").length },
      { name: "Archived", count: Array.isArray(archivedEntries) ? archivedEntries.length : 0 },
    ];

    // 2. Sheet Type Distribution (Pie)
    const typeCounts: Record<string, number> = {};
    uniqueEntries.forEach(entry => {
      const type = entry.sheet_type || "unknown";
      typeCounts[type] = (typeCounts[type] || 0) + 1;
    });
    const typeData = Object.entries(typeCounts).map(([type, count]) => ({
      name: getSheetTypeLabel(type),
      value: count,
    }));

    // 3. Project Progress from P6 Activities (Grouped Bar)
    const progressData = (Array.isArray(p6Activities) ? p6Activities : []).slice(0, 8).map(activity => ({
      name: activity.name?.substring(0, 15) + (activity.name && activity.name.length > 15 ? "..." : "") || "Activity",
      planned: (activity as any).planned_duration || 0,
      actual: (activity as any).actual_duration || 0,
      remaining: (activity as any).remaining_duration || 0,
    }));

    // 4. Weekly Approval Trends (Area)
    const last7Days: string[] = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      last7Days.push(date.toISOString().split("T")[0]);
    }

    const trendsData = last7Days.map(dateStr => {
      const dayEntries = uniqueEntries.filter(entry => {
        const entryDate = new Date(entry.updated_at || entry.created_at);
        return entryDate.toISOString().split("T")[0] === dateStr;
      });
      const date = new Date(dateStr);
      return {
        name: date.toLocaleDateString("en-US", { weekday: "short" }),
        approved: dayEntries.filter(e => e.status === "final_approved" || e.status === "approved_by_pmag").length,
        pending: dayEntries.filter(e => e.status === "approved_by_pm").length,
        rejected: dayEntries.filter(e => e.status === "rejected_by_pm" || e.status === "rejected_by_pmag").length,
      };
    });

    // 5. Top Delayed Activities (Horizontal Bar) - From P6
    const delayData = (Array.isArray(p6Activities) ? p6Activities : [])
      .filter(a => (a as any).remaining_duration && (a as any).remaining_duration > 0)
      .sort((a, b) => ((b as any).remaining_duration || 0) - ((a as any).remaining_duration || 0))
      .slice(0, 6)
      .map(activity => ({
        name: activity.name?.substring(0, 20) + (activity.name && activity.name.length > 20 ? "..." : "") || "Activity",
        delay: (activity as any).remaining_duration || 0,
      }));

    return { pipelineData, typeData, progressData, trendsData, delayData };
  }, [approvedEntries, historyEntries, archivedEntries, p6Activities]);

  const hasData = (Array.isArray(approvedEntries) ? approvedEntries.length : 0) > 0 ||
    (Array.isArray(historyEntries) ? historyEntries.length : 0) > 0 ||
    (Array.isArray(archivedEntries) ? archivedEntries.length : 0) > 0 ||
    (Array.isArray(p6Activities) ? p6Activities.length : 0) > 0;

  // Filter charts based on category
  const shouldShowChart = (chartId: string) => {
    return selectedCharts.includes(chartId);
  };

  return (
    <div className="mb-8 space-y-4">
      <div className="flex items-center justify-between bg-card p-4 rounded-lg border shadow-sm">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-primary" />
          <h2 className="text-xl font-semibold">Project Analytics</h2>
        </div>
        <div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="flex items-center gap-2 h-9 w-[220px] justify-between">
                <span className="flex items-center gap-2">
                  <Filter className="w-4 h-4 text-muted-foreground" />
                  {selectedCharts.length === chartOptions.length
                    ? "All Charts Showing"
                    : `${selectedCharts.length} Charts Selected`}
                </span>
                <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                  {selectedCharts.length}/{chartOptions.length}
                </span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-[240px]">
              <DropdownMenuLabel>Visible Charts</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {chartOptions.map(option => (
                <DropdownMenuCheckboxItem
                  key={option.id}
                  checked={selectedCharts.includes(option.id)}
                  onCheckedChange={() => toggleChart(option.id)}
                >
                  {option.label}
                </DropdownMenuCheckboxItem>
              ))}
              <DropdownMenuSeparator />
              <div className="p-2 flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full text-xs"
                  onClick={() => setSelectedCharts(chartOptions.map(c => c.id))}
                >
                  Select All
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full text-xs"
                  onClick={() => setSelectedCharts([])}
                >
                  Clear
                </Button>
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {selectedCharts.length === 0 ? (
        <div className="bg-card border rounded-lg p-12 flex flex-col items-center justify-center text-muted-foreground">
          <BarChart3 className="w-12 h-12 mb-4 opacity-20" />
          <h3 className="text-lg font-medium text-foreground">No Charts Selected</h3>
          <p className="text-sm">Use the dropdown menu above to select which charts to view.</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {/* Approval Pipeline - Funnel Style Bar */}
          {shouldShowChart("pipeline") && (
            <ChartCard
              title="Approval Pipeline"
              description="Sheets flow through approval stages"
              icon={<Layers className="w-4 h-4 text-primary" />}
              isEmpty={chartData.pipelineData.every(d => d.count === 0)}
            >
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={chartData.pipelineData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" {...axisProps} />
                  <YAxis {...axisProps} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="count" name="Sheets" radius={[4, 4, 0, 0]}>
                    {chartData.pipelineData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={PALETTE[index % PALETTE.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          )}

          {/* Sheet Types Distribution - Donut */}
          {shouldShowChart("types") && (
            <ChartCard
              title="Sheet Type Distribution"
              description="Breakdown by sheet type"
              icon={<PieChartIcon className="w-4 h-4 text-secondary" />}
              isEmpty={chartData.typeData.length === 0}
            >
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={chartData.typeData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={3}
                    dataKey="value"
                    label={({ name, value }) => `${name}: ${value}`}
                    labelLine={{ stroke: "hsl(var(--muted-foreground))" }}
                  >
                    {chartData.typeData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={PALETTE[index % PALETTE.length]} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                </PieChart>
              </ResponsiveContainer>
            </ChartCard>
          )}

          {/* Activity Progress - Grouped Bar (from P6) */}
          {shouldShowChart("progress") && (
            <ChartCard
              title="Activity Progress"
              description="Planned vs Actual from P6"
              icon={<TrendingUp className="w-4 h-4 text-success" />}
              isEmpty={chartData.progressData.length === 0}
            >
              <ResponsiveContainer width="100%" height={220}>
                <ComposedChart data={chartData.progressData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" {...axisProps} angle={-25} textAnchor="end" height={60} />
                  <YAxis {...axisProps} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="planned" name="Planned" fill={CHART_COLORS.primary} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="actual" name="Actual" fill={CHART_COLORS.success} radius={[4, 4, 0, 0]} />
                </ComposedChart>
              </ResponsiveContainer>
            </ChartCard>
          )}

          {/* Weekly Approval Trends - Stacked Area */}
          {shouldShowChart("trends") && (
            <ChartCard
              title="Weekly Approval Trends"
              description="Approvals over last 7 days"
              icon={<Activity className="w-4 h-4 text-warning" />}
              isEmpty={!hasData}
            >
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={chartData.trendsData}>
                  <defs>
                    <linearGradient id="colorApproved" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={CHART_COLORS.success} stopOpacity={0.8} />
                      <stop offset="95%" stopColor={CHART_COLORS.success} stopOpacity={0.1} />
                    </linearGradient>
                    <linearGradient id="colorPending" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={CHART_COLORS.warning} stopOpacity={0.8} />
                      <stop offset="95%" stopColor={CHART_COLORS.warning} stopOpacity={0.1} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" {...axisProps} />
                  <YAxis {...axisProps} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend wrapperStyle={{ fontSize: "11px" }} />
                  <Area type="monotone" dataKey="approved" name="Final Approved" stroke={CHART_COLORS.success} fill="url(#colorApproved)" stackId="1" />
                  <Area type="monotone" dataKey="pending" name="PM Approved" stroke={CHART_COLORS.warning} fill="url(#colorPending)" stackId="1" />
                </AreaChart>
              </ResponsiveContainer>
            </ChartCard>
          )}

          {/* Top Delays - Horizontal Bar (from P6) */}
          {shouldShowChart("delays") && chartData.delayData.length > 0 && (
            <ChartCard
              title="Top Delayed Activities"
              description="Activities with remaining work"
              icon={<AlertCircle className="w-4 h-4 text-danger" />}
              isEmpty={chartData.delayData.length === 0}
            >
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={chartData.delayData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis type="number" {...axisProps} />
                  <YAxis type="category" dataKey="name" {...axisProps} width={100} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="delay" name="Remaining (days)" fill={CHART_COLORS.danger} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          )}
        </div>
      )}
    </div>
  );
};

// Sheet type label mapping
function getSheetTypeLabel(sheetType: string): string {
  const labels: Record<string, string> = {
    dp_qty: "DP Qty",
    dp_block: "DP Block",
    dp_vendor_idt: "Vendor IDT",
    dp_vendor_block: "Vendor Block",
    mms_module_rfi: "MMS/RFI",
    manpower_details: "Manpower",
  };
  return labels[sheetType] || sheetType.replace(/_/g, " ");
}