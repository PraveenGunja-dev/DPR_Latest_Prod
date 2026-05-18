import React, { useMemo, useState } from "react";
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
    Legend
} from "recharts";
import { 
    BarChart3, TrendingUp, PieChart as PieChartIcon, 
    Activity, AlertCircle, Layers, Filter, Compass,
    Users
} from "lucide-react";
import AdvancedProjectAnalytics from "@/components/charts/AdvancedProjectAnalytics";
import ProgressHeatmap from "@/components/charts/ProgressHeatmap";
import { SOLAR_SUMMARY_CATEGORIES } from "@/components/SummaryCharts";
import ReactECharts from 'echarts-for-react';
import { 
    CHART_COLORS, 
    BAR_COLORS, 
    axisProps, 
    CustomTooltip, 
    ChartCard 
} from "@/components/charts";
import { getSheetTypeLabel } from "@/utils/formatters";

interface PMChartsSectionProps {
    submittedEntries: any[];
    historyEntries?: any[];
    advancedChartData?: any;
    onStatClick?: (filterType: string, entries: any[], title: string) => void;
}

export const PMChartsSection: React.FC<PMChartsSectionProps> = ({ submittedEntries, historyEntries = [], advancedChartData, onStatClick }) => {
    const [timeRange, setTimeRange] = useState<"today" | "7d" | "30d" | "all">("all");

    const detailedHeatmapData = useMemo(() => {
        // Find the latest progress entry from all available pools
        const allEntries = [...(submittedEntries || []), ...(historyEntries || [])];
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
    }, [submittedEntries]);

    // Compute chart data from real entries
    const chartData = useMemo(() => {
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
            if (timeRange === "today") return compareDate.toDateString() === today.toDateString();
            if (timeRange === "7d") return diffDays >= -1 && diffDays < 7;
            if (timeRange === "30d") return diffDays >= -1 && diffDays < 30;
            return true;
        });

        const getNormalizedStatus = (s: string): 'Approved' | 'Rejected' | 'Pending' => {
            const status = (s || "").toLowerCase();
            if (status.includes('approved')) return 'Approved';
            if (status.includes('rejected')) return 'Rejected';
            return 'Pending';
        };

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

        const statusData = Object.entries(statusCounts).filter(([_, v]) => v > 0).map(([name, value]) => ({ name, value }));
        const typeData = Object.entries(typeCounts).map(([name, count]) => ({ name, count }));
        const supervisorData = Object.entries(supervisorStats).map(([name, stats]) => ({
            name: name.length > 12 ? name.substring(0, 12) + "..." : name,
            ...stats,
        })).slice(0, 6);

        const entriesWithDates = filteredEntries.map(e => ({ ...e, normDate: new Date(e.entry_date || e.submitted_at || e.created_at) }))
            .filter(e => !isNaN(e.normDate.getTime()));

        let lookback = timeRange === "today" ? 1 : (timeRange === "7d" ? 7 : 30);
        if (timeRange === "all" && entriesWithDates.length > 0) {
            const minTime = Math.min(...entriesWithDates.map(e => e.normDate.getTime()));
            lookback = Math.min(Math.max(30, Math.ceil((today.getTime() - minTime) / (1000 * 3600 * 24)) + 1), 180);
        }

        const rawDataset: any[] = [['Date', 'Status', 'Count']];
        const dateMap = new Map<string, Map<string, number>>();
        const statusList: ('Approved' | 'Pending' | 'Rejected')[] = ['Approved', 'Pending', 'Rejected'];
        const getDateKey = (d: Date) => d.toLocaleDateString("en-US", { day: 'numeric', month: 'short' });

        for (let i = lookback - 1; i >= 0; i--) {
            const d = new Date(today);
            d.setDate(d.getDate() - i);
            const counts = new Map<string, number>();
            statusList.forEach(s => counts.set(s, 0));
            dateMap.set(getDateKey(d), counts);
        }

        entriesWithDates.forEach(entry => {
            const key = getDateKey(entry.normDate);
            if (dateMap.has(key)) {
                const s = getNormalizedStatus(entry.status);
                dateMap.get(key)!.set(s, (dateMap.get(key)!.get(s) || 0) + 1);
            }
        });

        dateMap.forEach((counts, dateStr) => counts.forEach((count, status) => rawDataset.push([dateStr, status, count])));

        const weeklyTrendsOption = {
            animationDuration: 1000,
            dataset: [{ id: 'dataset_raw', source: rawDataset }, ...statusList.map(s => ({
                id: 'dataset_' + s,
                fromDatasetId: 'dataset_raw',
                transform: { type: 'filter', config: { dimension: 'Status', '=': s } }
            }))],
            tooltip: { trigger: 'axis' },
            xAxis: { type: 'category', boundaryGap: false, axisLabel: { color: '#64748b', fontSize: 10, rotate: lookback > 14 ? 30 : 0 } },
            yAxis: { type: 'value', splitLine: { lineStyle: { type: 'dashed' } } },
            grid: { right: 80, left: 40, top: 30, bottom: 40 },
            series: statusList.map(status => {
                const color = status === 'Approved' ? CHART_COLORS.success : status === 'Pending' ? CHART_COLORS.warning : CHART_COLORS.danger;
                return {
                    name: status, type: 'line', datasetId: 'dataset_' + status, smooth: true, itemStyle: { color }, areaStyle: { opacity: 0.1, color },
                    encode: { x: 'Date', y: 'Count', tooltip: ['Count'] }
                };
            })
        };

        return { statusData, typeData, supervisorData, weeklyTrendsOption };
    }, [submittedEntries, timeRange]);

    const hasFilteredData = chartData.statusData.length > 0;

    return (
        <div className="mb-8 space-y-8">
            {/* Advanced Project Performance Hub */}
            {/* Advanced Analytics Hub */}
            <div className="space-y-4">
                <div className="flex items-center gap-2 bg-[#003366] text-white p-4 rounded-t-xl border-x border-t border-[#11375c]">
                    <Compass className="w-5 h-5 text-amber-500" />
                    <h2 className="text-xl font-bold uppercase tracking-tight">Project Health Hub (Advanced Analytics)</h2>
                </div>
                <div className="bg-white dark:bg-[#020617] border border-slate-200 dark:border-slate-800 p-4 rounded-b-xl shadow-md">
                    <AdvancedProjectAnalytics data={{ ...advancedChartData, detailedHeatmapData }} />
                </div>
            </div>

                <div className="flex items-center justify-between bg-white dark:bg-[#020617] p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
                    <div className="flex items-center gap-2">
                        <Activity className="w-5 h-5 text-indigo-600" />
                        <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100 italic">Operational Insights</h2>
                    </div>
                <Tabs value={timeRange} onValueChange={(val: any) => setTimeRange(val)} className="w-full sm:w-auto">
                    <TabsList className="grid grid-cols-4 w-[340px] bg-slate-100 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
                        <TabsTrigger value="today" className="text-xs">Today</TabsTrigger>
                        <TabsTrigger value="7d" className="text-xs">7D</TabsTrigger>
                        <TabsTrigger value="30d" className="text-xs">30D</TabsTrigger>
                        <TabsTrigger value="all" className="text-xs">All Time</TabsTrigger>
                    </TabsList>
                </Tabs>
            </div>

            <AnimatePresence mode="wait">
                <motion.div
                    key={timeRange} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                    className="grid gap-4 md:grid-cols-2 lg:grid-cols-3"
                >
                    <ChartCard title="Sheet Status Trend" icon={<PieChartIcon className="w-4 h-4 text-primary" />} isEmpty={!hasFilteredData}>
                        <div className="w-full h-[220px]">
                            <ReactECharts option={chartData.weeklyTrendsOption} style={{ height: '100%', width: '100%' }} opts={{ renderer: 'svg' }} />
                        </div>
                    </ChartCard>

                    <ChartCard title="Sheets by Type" icon={<BarChart3 className="w-4 h-4 text-secondary" />} isEmpty={chartData.typeData.length === 0}>
                        <div className="w-full h-[220px]">
                            <ReactECharts option={{
                                tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
                                grid: { left: '3%', right: '4%', bottom: '3%', top: '10%', containLabel: true },
                                xAxis: [{ type: 'category', data: chartData.typeData.map(d => d.name), axisLabel: { color: '#64748b', fontSize: 11, rotate: 30 } }],
                                yAxis: [{ type: 'value', splitLine: { lineStyle: { type: 'dashed' } } }],
                                series: [{ name: 'Sheets', type: 'bar', barWidth: '60%', data: chartData.typeData.map((d, i) => ({ value: d.count, itemStyle: { color: BAR_COLORS[i % BAR_COLORS.length] } })) }]
                            }} style={{ height: '100%', width: '100%' }} opts={{ renderer: 'svg' }} />
                        </div>
                    </ChartCard>

                    <ChartCard title="Overall Distribution" icon={<Activity className="w-4 h-4 text-primary" />} isEmpty={!hasFilteredData}>
                        <div className="w-full h-[220px]">
                            <ReactECharts option={{
                                tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
                                legend: { bottom: -5, left: 'center', textStyle: { fontSize: 11, color: '#64748b' } },
                                series: [{
                                    name: 'Status', type: 'pie', radius: ['50%', '80%'], center: ['50%', '45%'],
                                    itemStyle: { borderRadius: 10, borderColor: '#fff', borderWidth: 2 },
                                    data: chartData.statusData.map((d) => ({
                                        value: d.value, name: d.name,
                                        itemStyle: { color: d.name === 'Approved' ? CHART_COLORS.success : d.name === 'Pending' ? CHART_COLORS.warning : CHART_COLORS.danger }
                                    }))
                                }]
                            }} style={{ height: '100%', width: '100%' }} opts={{ renderer: 'svg' }} />
                        </div>
                    </ChartCard>

                    <div className="lg:col-span-2">
                        <ChartCard title="Supervisor Performance" icon={<Users className="w-4 h-4 text-success" />} isEmpty={chartData.supervisorData.length === 0}>
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