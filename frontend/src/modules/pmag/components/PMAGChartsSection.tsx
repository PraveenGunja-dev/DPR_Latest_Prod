import React, { useState, useMemo } from "react";
import {
    DropdownMenu,
    DropdownMenuCheckboxItem,
    DropdownMenuContent,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
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
    ComposedChart
} from "recharts";
import { BarChart3, TrendingUp, PieChart as PieChartIcon, Activity, AlertCircle, Layers, Filter, Compass } from "lucide-react";
import AdvancedProjectAnalytics from "@/components/charts/AdvancedProjectAnalytics";
import { 
    CHART_COLORS, 
    axisProps, 
    CustomTooltip, 
    ChartCard 
} from "@/components/charts";
import { getSheetTypeLabel } from "@/utils/formatters";

const PALETTE = [
    CHART_COLORS.primary,
    CHART_COLORS.secondary,
    CHART_COLORS.success,
    CHART_COLORS.warning,
    CHART_COLORS.danger,
];

interface PMAGChartsSectionProps {
    projectId?: number | string;
    p6Activities: any[];
    approvedEntries?: any[];
    historyEntries?: any[];
    archivedEntries?: any[];
    advancedChartData?: any;
}

export const PMAGChartsSection: React.FC<PMAGChartsSectionProps> = ({
    projectId, p6Activities, approvedEntries = [], historyEntries = [], archivedEntries = [], advancedChartData
}) => {
    const [selectedCharts, setSelectedCharts] = useState<string[]>(["pipeline", "types", "progress", "trends", "delays"]);

    const chartOptions = [
        { id: "pipeline", label: "Approval Pipeline" },
        { id: "types", label: "Sheet Type Distribution" },
        { id: "progress", label: "Activity Progress" },
        { id: "trends", label: "Weekly Approval Trends" },
        { id: "delays", label: "Top Delayed Activities" }
    ];

    const chartData = useMemo(() => {
        const allEntries = [...approvedEntries, ...historyEntries, ...archivedEntries].filter(Boolean);
        const uniqueEntries = allEntries.filter((e, i, self) => e && e.id && i === self.findIndex(o => o.id === e.id));

        const pipelineData = [
            { name: "Submitted", count: uniqueEntries.filter(e => e.status === "submitted_to_pm").length },
            { name: "PM Approved", count: uniqueEntries.filter(e => e.status === "approved_by_pm").length },
            { name: "Final Approved", count: uniqueEntries.filter(e => e.status === "final_approved" || e.status === "approved_by_pmag").length },
            { name: "Archived", count: archivedEntries.length },
        ];

        const typeCounts: Record<string, number> = {};
        uniqueEntries.forEach(entry => {
            const type = getSheetTypeLabel(entry.sheet_type || "unknown");
            typeCounts[type] = (typeCounts[type] || 0) + 1;
        });
        const typeData = Object.entries(typeCounts).map(([name, value]) => ({ name, value }));

        const progressData = p6Activities.slice(0, 8).map(activity => ({
            name: activity.name?.substring(0, 15) || "Activity",
            planned: activity.planned_duration || 0,
            actual: activity.actual_duration || 0
        }));

        const last7Days: string[] = [];
        for (let i = 6; i >= 0; i--) {
            const d = new Date(); d.setDate(d.getDate() - i);
            last7Days.push(d.toISOString().split("T")[0]);
        }

        const trendsData = last7Days.map(dateStr => {
            const dayEntries = uniqueEntries.filter(e => new Date(e.updated_at || e.created_at).toISOString().split("T")[0] === dateStr);
            return {
                name: new Date(dateStr).toLocaleDateString("en-US", { weekday: "short" }),
                approved: dayEntries.filter(e => e.status === "final_approved" || e.status === "approved_by_pmag").length,
                pending: dayEntries.filter(e => e.status === "approved_by_pm").length,
            };
        });

        const delayData = p6Activities.filter(a => a.remaining_duration > 0)
            .sort((a, b) => b.remaining_duration - a.remaining_duration)
            .slice(0, 6).map(a => ({ name: a.name?.substring(0, 20) || "Activity", delay: a.remaining_duration || 0 }));

        return { pipelineData, typeData, progressData, trendsData, delayData };
    }, [approvedEntries, historyEntries, archivedEntries, p6Activities]);

    const shouldShowChart = (id: string) => selectedCharts.includes(id);

    return (
        <div className="mb-8 space-y-8">
            {/* New Advanced Analytics Hub */}
            <div className="space-y-4">
                <div className="flex items-center gap-2 bg-slate-800 text-white p-4 rounded-t-xl border-x border-t border-slate-700">
                    <Compass className="w-5 h-5 text-amber-400" />
                    <h2 className="text-xl font-bold">Master Project Performance (Advanced Analytics)</h2>
                </div>
                <div className="bg-slate-50 border border-slate-200 p-4 rounded-b-xl shadow-sm">
                    {advancedChartData && (
                        <AdvancedProjectAnalytics data={advancedChartData} />
                    )}
                </div>
            </div>

            {/* Existing Pipeline & Distribution Charts */}
            <div className="space-y-4">
                <div className="flex items-center justify-between bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                    <div className="flex items-center gap-2">
                        <BarChart3 className="w-5 h-5 text-indigo-600" />
                        <h2 className="text-xl font-bold text-slate-800">Operational Metadata</h2>
                    </div>
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="outline" className="h-9 w-[220px] justify-between">
                            <span className="flex items-center gap-2"><Filter className="w-4 h-4" /> {selectedCharts.length} Charts</span>
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-[240px]">
                        <DropdownMenuLabel>Visible Charts</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        {chartOptions.map(opt => (
                            <DropdownMenuCheckboxItem key={opt.id} checked={shouldShowChart(opt.id)}
                                onCheckedChange={() => setSelectedCharts(prev => prev.includes(opt.id) ? prev.filter(i => i !== opt.id) : [...prev, opt.id])}>
                                {opt.label}
                            </DropdownMenuCheckboxItem>
                        ))}
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {shouldShowChart("pipeline") && (
                    <ChartCard title="Approval Pipeline" icon={<Layers className="w-4 h-4 text-primary" />} isEmpty={chartData.pipelineData.every(d => d.count === 0)}>
                        <ResponsiveContainer width="100%" height={220}>
                            <BarChart data={chartData.pipelineData}>
                                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                                <XAxis dataKey="name" {...axisProps} />
                                <YAxis {...axisProps} />
                                <Tooltip content={<CustomTooltip />} />
                                <Bar dataKey="count" name="Sheets" radius={[4, 4, 0, 0]}>
                                    {chartData.pipelineData.map((_, i) => <Cell key={`c-${i}`} fill={PALETTE[i % PALETTE.length]} />)}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </ChartCard>
                )}

                {shouldShowChart("types") && (
                    <ChartCard title="Sheet Type Distribution" icon={<PieChartIcon className="w-4 h-4 text-secondary" />} isEmpty={chartData.typeData.length === 0}>
                        <ResponsiveContainer width="100%" height={220}>
                            <PieChart>
                                <Pie data={chartData.typeData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value">
                                    {chartData.typeData.map((_, i) => <Cell key={`c-${i}`} fill={PALETTE[i % PALETTE.length]} />)}
                                </Pie>
                                <Tooltip content={<CustomTooltip />} />
                            </PieChart>
                        </ResponsiveContainer>
                    </ChartCard>
                )}

                {shouldShowChart("progress") && (
                    <ChartCard title="Activity Progress" icon={<TrendingUp className="w-4 h-4 text-success" />} isEmpty={chartData.progressData.length === 0}>
                        <ResponsiveContainer width="100%" height={220}>
                            <ComposedChart data={chartData.progressData}>
                                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                                <XAxis dataKey="name" {...axisProps} />
                                <YAxis {...axisProps} />
                                <Tooltip content={<CustomTooltip />} />
                                <Bar dataKey="planned" name="Planned" fill={CHART_COLORS.primary} radius={[4, 4, 0, 0]} />
                                <Bar dataKey="actual" name="Actual" fill={CHART_COLORS.success} radius={[4, 4, 0, 0]} />
                            </ComposedChart>
                        </ResponsiveContainer>
                    </ChartCard>
                )}

                {shouldShowChart("trends") && (
                    <ChartCard title="Weekly Approval Trends" icon={<Activity className="w-4 h-4 text-warning" />} isEmpty={chartData.trendsData.every(d => d.approved === 0)}>
                        <ResponsiveContainer width="100%" height={220}>
                            <AreaChart data={chartData.trendsData}>
                                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                                <XAxis dataKey="name" {...axisProps} />
                                <YAxis {...axisProps} />
                                <Tooltip content={<CustomTooltip />} />
                                <Area type="monotone" dataKey="approved" name="Approved" stroke={CHART_COLORS.success} fill={CHART_COLORS.success} fillOpacity={0.2} strokeWidth={2} />
                                <Area type="monotone" dataKey="pending" name="Pending" stroke={CHART_COLORS.warning} fill={CHART_COLORS.warning} fillOpacity={0.1} strokeWidth={2} />
                            </AreaChart>
                        </ResponsiveContainer>
                    </ChartCard>
                )}

                {shouldShowChart("delays") && (
                    <ChartCard title="Top Delayed Activities" icon={<AlertCircle className="w-4 h-4 text-danger" />} isEmpty={chartData.delayData.length === 0}>
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
        </div>
    </div>
    );
};