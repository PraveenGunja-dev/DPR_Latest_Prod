// src/components/charts/AdvancedProjectAnalytics.tsx
import React, { useMemo } from 'react';
import {
    AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    BarChart, Bar, LineChart, Line, ComposedChart, Cell, Legend,
    ScatterChart, Scatter
} from 'recharts';
import ProgressHeatmap from './ProgressHeatmap';
import { AlertCircle } from 'lucide-react';

interface AdvancedChartsProps {
    data: {
        sCurve: any[];
        dailyProductivity: any[];
        activityHeatmap: any[];
        manpowerEfficiency: any[];
        issuePareto: any[];
        detailedHeatmapData?: any;
    };
    projectName?: string;
}

const useIsDarkMode = () => {
    const [isDark, setIsDark] = React.useState(false);
    React.useEffect(() => {
        const checkDarkMode = () => setIsDark(document.documentElement.classList.contains('dark'));
        checkDarkMode();
        const observer = new MutationObserver(checkDarkMode);
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
        return () => observer.disconnect();
    }, []);
    return isDark;
};

const AdvancedProjectAnalytics: React.FC<AdvancedChartsProps> = ({ data, projectName }) => {
    const isDark = useIsDarkMode();
    
    const colors = useMemo(() => ({
        primary: '#11375c', // Deep Adani Navy
        secondary: '#76bc21', // Adani Green
        accent: '#ffcb05', // Adani Yellow
        text: isDark ? '#e2e8f0' : '#1e293b',
        subtext: isDark ? '#94a3b8' : '#64748b',
        grid: isDark ? '#0f172a' : '#f1f5f9',
        tooltipBg: isDark ? '#020617' : '#ffffff',
        tooltipBorder: isDark ? '#1e293b' : '#e2e8f0',
        cardBg: isDark ? 'bg-[#0b0e14]' : 'bg-white',
        cardBorder: isDark ? 'border-[#1e293b]' : 'border-slate-200'
    }), [isDark]);

    const CustomTooltip = ({ active, payload, label }: any) => {
        if (active && payload && payload.length) {
            return (
                <div className="p-3 border shadow-lg rounded-md" style={{ backgroundColor: colors.tooltipBg, borderColor: colors.tooltipBorder }}>
                    <p className="text-sm font-bold mb-1" style={{ color: colors.text }}>{label}</p>
                    {payload.map((entry: any, index: number) => (
                        <p key={index} className="text-xs" style={{ color: entry.color || entry.fill }}>
                            {entry.name}: <span className="font-semibold">{entry.value}%</span>
                        </p>
                    ))}
                </div>
            );
        }
        return null;
    };

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 p-1">
            
            {/* 1. S-Curve Progress */}
            <div className={`col-span-1 md:col-span-2 border rounded-xl shadow-sm p-6 overflow-hidden ${colors.cardBg} ${colors.cardBorder}`}>
                <div className="flex justify-between items-center mb-6">
                    <div>
                        <h3 className="text-lg font-bold" style={{ color: colors.text }}>S-Curve: Progress Tracking</h3>
                        <p className="text-xs" style={{ color: colors.subtext }}>Cumulative Planned vs Actual % Complete</p>
                    </div>
                    <div className="flex gap-4">
                        <div className="flex items-center gap-1">
                            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: colors.primary }}></div>
                            <span className="text-xs" style={{ color: colors.subtext }}>Planned</span>
                        </div>
                        <div className="flex items-center gap-1">
                            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: colors.secondary }}></div>
                            <span className="text-xs" style={{ color: colors.subtext }}>Actual</span>
                        </div>
                    </div>
                </div>
                <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={data.sCurve}>
                            <defs>
                                <linearGradient id="colorPlanned" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor={colors.primary} stopOpacity={0.1}/>
                                    <stop offset="95%" stopColor={colors.primary} stopOpacity={0}/>
                                </linearGradient>
                                <linearGradient id="colorActual" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor={colors.secondary} stopOpacity={0.2}/>
                                    <stop offset="95%" stopColor={colors.secondary} stopOpacity={0}/>
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={colors.grid} />
                            <XAxis dataKey="name" fontSize={10} tickLine={false} axisLine={false} tick={{ fill: colors.subtext }} />
                            <YAxis fontSize={10} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}%`} tick={{ fill: colors.subtext }} />
                            <Tooltip content={<CustomTooltip />} />
                            <Area type="monotone" dataKey="planned" name="Planned" stroke={colors.primary} strokeWidth={2} fillOpacity={1} fill="url(#colorPlanned)" />
                            <Area type="monotone" dataKey="actual" name="Actual" stroke={colors.secondary} strokeWidth={3} fillOpacity={1} fill="url(#colorActual)" />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* 2. Pareto Chart: Delay Root Causes */}
            <div className={`col-span-1 border rounded-xl shadow-sm p-6 ${colors.cardBg} ${colors.cardBorder}`}>
                <h3 className="text-lg font-bold mb-1" style={{ color: colors.text }}>Issue Impact Pareto</h3>
                <p className="text-xs mb-6" style={{ color: colors.subtext }}>Root Cause Frequency & Cumulative %</p>
                <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={data.issuePareto}>
                            <XAxis dataKey="name" fontSize={10} tickLine={false} hide />
                            <YAxis yAxisId="left" fontSize={10} tickLine={false} axisLine={false} tick={{ fill: colors.subtext }} />
                            <YAxis yAxisId="right" orientation="right" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}%`} tick={{ fill: colors.subtext }} />
                            <Tooltip contentStyle={{ backgroundColor: colors.tooltipBg, borderColor: colors.tooltipBorder, color: colors.text }} />
                            <Bar yAxisId="left" dataKey="value" name="Frequency" fill={colors.primary} radius={[4, 4, 0, 0]} />
                            <Line yAxisId="right" type="monotone" dataKey="cumulative" name="Cumulative %" stroke={colors.accent} strokeWidth={2} />
                        </ComposedChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* 3. Daily Productivity Trend */}
            <div className={`col-span-1 md:col-span-1 border rounded-xl shadow-sm p-6 ${colors.cardBg} ${colors.cardBorder}`}>
                <h3 className="text-lg font-bold mb-1" style={{ color: colors.text }}>Productivity Burn-up</h3>
                <p className="text-xs mb-6" style={{ color: colors.subtext }}>Daily Actuals vs Required Pace</p>
                <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={data.dailyProductivity}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={colors.grid} />
                            <XAxis dataKey="name" fontSize={10} tickLine={false} tick={{ fill: colors.subtext }} />
                            <YAxis fontSize={10} tickLine={false} tick={{ fill: colors.subtext }} />
                            <Tooltip contentStyle={{ backgroundColor: colors.tooltipBg, borderColor: colors.tooltipBorder, color: colors.text }} />
                            <Bar dataKey="actual" name="Daily Production" fill={colors.secondary} radius={[4, 4, 0, 0]} />
                            <Line type="monotone" dataKey="target" name="Target Rate" stroke="#ef4444" strokeWidth={2} strokeDasharray="5 5" dot={false} />
                        </ComposedChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* 4. Efficiency correlation */}
            <div className={`col-span-1 md:col-span-1 border rounded-xl shadow-sm p-6 ${colors.cardBg} ${colors.cardBorder}`}>
                <h3 className="text-lg font-bold mb-1" style={{ color: colors.text }}>Manpower Efficiency</h3>
                <p className="text-xs mb-6" style={{ color: colors.subtext }}>Output Quantity vs Total Man-Hours</p>
                <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                        <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke={colors.grid} />
                            <XAxis type="number" dataKey="manpower" name="Manpower" unit=" hrs" fontSize={10} tick={{ fill: colors.subtext }} />
                            <YAxis type="number" dataKey="output" name="Quantity" fontSize={10} tick={{ fill: colors.subtext }} />
                            <Tooltip cursor={{ strokeDasharray: '3 3' }} />
                            <Scatter name="Efficiency" data={data.manpowerEfficiency} fill={colors.primary} />
                        </ScatterChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* 5. Health Heatmap */}
            <div className={`col-span-1 md:col-span-1 border rounded-xl shadow-sm p-4 h-full flex flex-col ${colors.cardBg} ${colors.cardBorder} min-h-[400px]`}>
                <div className="mb-4">
                    <h3 className="text-lg font-bold mb-1" style={{ color: colors.text }}>Execution Health</h3>
                    <p className="text-xs" style={{ color: colors.subtext }}>Block-wise Critical Milestone Status</p>
                </div>
                
                {(() => {
                    // Priority 1: Detailed Heatmap Data from DPR Entries
                    if (data.detailedHeatmapData && data.detailedHeatmapData.blocks.length > 0) {
                        return (
                            <div className="flex-1 min-h-[300px]">
                                <ProgressHeatmap 
                                    title="" 
                                    data={data.detailedHeatmapData} 
                                    height={350}
                                />
                            </div>
                        );
                    }

                    // Priority 2: Basic Activity Heatmap from API
                    const blockSet = new Set<string>();
                    const activitySet = new Set<string>();
                    const dataMap: Record<string, Record<string, number>> = {};

                    if (!data.activityHeatmap || data.activityHeatmap.length === 0) {
                      return (
                        <div className="flex-1 flex flex-col items-center justify-center bg-slate-50/50 dark:bg-slate-900/20 rounded-lg border border-dashed border-slate-300 dark:border-slate-800">
                          <AlertCircle className="w-8 h-8 text-slate-400 dark:text-slate-600 mb-3" />
                          <p className="text-sm font-medium text-slate-400 dark:text-slate-500">Awaiting approved DPR data</p>
                          <p className="text-[10px] text-slate-500 dark:text-slate-600 mt-1">Heatmap will populate once sheets are approved</p>
                        </div>
                      );
                    }

                    data.activityHeatmap.forEach(item => {
                        const b = item.block || 'Other';
                        const a = item.activity || 'Misc';
                        blockSet.add(b);
                        activitySet.add(a);
                        if (!dataMap[b]) dataMap[b] = {};
                        dataMap[b][a] = item.health || 0;
                    });

                    const sortedBlocks = Array.from(blockSet).sort();
                    const sortedActivities = Array.from(activitySet).sort();
                    const matrix: [number, number, number, number][] = [];

                    sortedBlocks.forEach((b, bIdx) => {
                        sortedActivities.forEach((a, aIdx) => {
                            matrix.push([bIdx, aIdx, dataMap[b][a] || 0, 0]);
                        });
                    });

                    return (
                        <div className="flex-1 min-h-[300px]">
                            <ProgressHeatmap 
                                title="" 
                                data={{ blocks: sortedBlocks, activities: sortedActivities, matrix }} 
                                height={350}
                            />
                        </div>
                    );
                })()}
            </div>

        </div>
    );
};

export default AdvancedProjectAnalytics;
