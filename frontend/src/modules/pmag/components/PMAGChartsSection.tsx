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
import { 
    BarChart3, Calendar, CheckCircle2, Clock, Filter, Search, 
    TrendingUp, AlertTriangle, MessageSquare, Plus, X,
    ChevronDown, Download, RefreshCw, Compass, AlertCircle, Layers,
    PieChart as PieChartIcon, Activity
} from 'lucide-react';
import AdvancedProjectAnalytics from "@/components/charts/AdvancedProjectAnalytics";
import ProgressHeatmap from "@/components/charts/ProgressHeatmap";
import { SOLAR_SUMMARY_CATEGORIES } from "@/components/SummaryCharts";
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
    detailedHeatmapData?: any;
}

export const PMAGChartsSection: React.FC<PMAGChartsSectionProps> = ({
    projectId, p6Activities, approvedEntries = [], historyEntries = [], archivedEntries = [], advancedChartData
}) => {
    const [selectedCharts, setSelectedCharts] = useState<string[]>(["pipeline", "types", "progress", "trends", "delays"]);

    const detailedHeatmapData = useMemo(() => {
        // Find the latest progress entry from all available pools
        const allEntries = [...(approvedEntries || []), ...(historyEntries || []), ...(archivedEntries || [])];
        const progressEntries = allEntries.filter(e => 
            ['dp_qty', 'wind_progress', 'solar_construction'].includes(e.sheet_type)
        ).sort((a, b) => new Date(b.submission_date).getTime() - new Date(a.submission_date).getTime());

        const latestEntry = progressEntries[0];
        if (!latestEntry) return null;

        try {
            const data = typeof latestEntry.data_json === 'string' ? JSON.parse(latestEntry.data_json) : latestEntry.data_json;
            const rows = data.rows || [];
            if (rows.length === 0) return null;

            const blockSet = new Set<string>();
            const activitySet = new Set<string>();
            const dataMap: Record<string, Record<string, { progress: number; delay: number }>> = {};
            
            // Handle different sheet types
            if (latestEntry.sheet_type === 'dp_qty' || latestEntry.sheet_type === 'solar_construction') {
                const targetActivities = SOLAR_SUMMARY_CATEGORIES.flatMap(c => c.activities);
                targetActivities.forEach(act => activitySet.add(act.toUpperCase()));

                rows.forEach((row: any) => {
                    if (row.isCategoryRow) return;
                    const block = (row.block || row.location || row.locations || "").toString().toUpperCase();
                    if (!block) return;

                    const desc = (row.description || row.activity || "").toString().toLowerCase();
                    const masterAct = targetActivities.find(ta => desc.includes(ta.toLowerCase()) || ta.toLowerCase().includes(desc));
                    if (!masterAct) return;

                    const actKey = masterAct.toUpperCase();
                    blockSet.add(block);
                    if (!dataMap[block]) dataMap[block] = {};

                    const scope = parseFloat(row.totalQuantity || row.scope || '0');
                    const actual = parseFloat(row.cumulative || row.actual || '0');
                    const progress = scope > 0 ? Math.min(100, Math.round((actual / scope) * 100)) : 0;
                    
                    let delay = 0;
                    if (progress < 100 && (row.basePlanFinish || row.planFinish)) {
                        const finish = new Date(row.basePlanFinish || row.planFinish);
                        if (finish < new Date()) delay = Math.floor((new Date().getTime() - finish.getTime()) / 86400000);
                    }
                    dataMap[block][actKey] = { progress, delay };
                });
            } else if (latestEntry.sheet_type === 'wind_progress') {
                const keyActivities = ["EXCAVATION", "PCC", "RAFT CASTING", "WTG ERECTION", "WTG COMMISSIONING"];
                keyActivities.forEach(a => activitySet.add(a));

                rows.forEach((row: any) => {
                    if (row.isCategoryRow) return;
                    const loc = (row.locations || row.location || row.wtg || "").toString().toUpperCase();
                    if (!loc) return;

                    const desc = (row.description || row.activity || "").toString().toUpperCase();
                    const masterAct = keyActivities.find(ka => desc.includes(ka));
                    if (!masterAct) return;

                    blockSet.add(loc);
                    if (!dataMap[loc]) dataMap[loc] = {};
                    
                    let progress = 0;
                    if (row.status === 'Completed') progress = 100;
                    else if (row.status === 'In Progress') progress = 50;
                    else if (row.progress) progress = parseFloat(row.progress);

                    dataMap[loc][masterAct] = { progress, delay: 0 };
                });
            }

            const sortedBlocks = Array.from(blockSet).sort((a,b) => a.localeCompare(b, undefined, {numeric:true}));
            const sortedActivities = Array.from(activitySet);
            if (sortedBlocks.length === 0) return null;

            const matrix: any[] = [];
            sortedBlocks.forEach((b, bIdx) => {
                sortedActivities.forEach((a, aIdx) => {
                    const val = dataMap[b]?.[a] || { progress: 0, delay: 0 };
                    matrix.push([bIdx, aIdx, val.progress, val.delay]);
                });
            });

            return { blocks: sortedBlocks, activities: sortedActivities, matrix };
        } catch(e) { 
            console.error("Heatmap transformation error:", e);
            return null; 
        }
    }, [approvedEntries]);

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
        <div className="mb-8 space-y-8 rounded-lg" >
            {/* Advanced Analytics Hub */}
            <div className="space-y-4 rounded-lg">
                {/* <div className="flex items-center gap-2 bg-[#003366] text-white p-4 rounded-t-xl border-x border-t border-[#11375c]">
                    <Compass className="w-5 h-5 text-amber-500" />
                    <h2 className="text-xl font-bold uppercase tracking-tight">Project Health Hub (Advanced Analytics)</h2>
                </div> */}
                <div className="bg-white dark:bg-[#020617] border border-slate-200 dark:border-slate-800 p-4 rounded-b-xl shadow-md">
                    <AdvancedProjectAnalytics data={{ ...advancedChartData, detailedHeatmapData }} />
                </div>
            </div>

            {/* Existing Pipeline & Distribution Charts */}
            <div className="space-y-4">
                <div className="flex items-center justify-between bg-white dark:bg-[#020617] p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
                    <div className="flex items-center gap-2">
                        <BarChart3 className="w-5 h-5 text-indigo-600" />
                        <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">Operational Metadata</h2>
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