// src/components/charts/AdvancedProjectAnalytics.tsx
import React from 'react';
import {
    AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    BarChart, Bar, LineChart, Line, ComposedChart, Cell, Legend,
    ScatterChart, Scatter, ZAxis
} from 'recharts';

interface AdvancedChartsProps {
    data: {
        sCurve: any[];
        dailyProductivity: any[];
        activityHeatmap: any[];
        manpowerEfficiency: any[];
        issuePareto: any[];
    };
    projectName?: string;
}

const COLORS = {
    primary: '#003366', // Adani Navy
    secondary: '#008844', // Adani Green
    accent: '#FF8800', // Adani Orange
    background: '#F8FAFC',
    border: '#E2E8F0',
    text: '#1E293B',
    grid: '#EDF2F7',
    danger: '#EF4444',
    warning: '#F59E0B',
    success: '#10B981'
};

const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
        return (
            <div className="bg-white p-3 border border-slate-200 shadow-lg rounded-md">
                <p className="text-sm font-bold text-slate-800 mb-1">{label}</p>
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

const HeatmapCell = ({ x, y, width, height, value }: any) => {
    let color = COLORS.border;
    if (value >= 100) color = COLORS.success;
    else if (value >= 50) color = COLORS.warning;
    else if (value > 0) color = COLORS.danger;

    return (
        <rect
            x={x}
            y={y}
            width={width - 2}
            height={height - 2}
            fill={color}
            rx={2}
        />
    );
};

const AdvancedProjectAnalytics: React.FC<AdvancedChartsProps> = ({ data, projectName }) => {
    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 p-1">
            
            {/* 1. S-Curve Progress */}
            <div className="col-span-1 md:col-span-2 bg-white border border-slate-200 rounded-xl shadow-sm p-6 overflow-hidden">
                <div className="flex justify-between items-center mb-6">
                    <div>
                        <h3 className="text-lg font-bold text-slate-800">S-Curve: Progress Tracking</h3>
                        <p className="text-xs text-slate-500">Cumulative Planned vs Actual % Complete</p>
                    </div>
                    <div className="flex gap-4">
                        <div className="flex items-center gap-1">
                            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS.primary }}></div>
                            <span className="text-xs text-slate-600">Planned</span>
                        </div>
                        <div className="flex items-center gap-1">
                            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS.secondary }}></div>
                            <span className="text-xs text-slate-600">Actual</span>
                        </div>
                    </div>
                </div>
                <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={data.sCurve}>
                            <defs>
                                <linearGradient id="colorPlanned" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor={COLORS.primary} stopOpacity={0.1}/>
                                    <stop offset="95%" stopColor={COLORS.primary} stopOpacity={0}/>
                                </linearGradient>
                                <linearGradient id="colorActual" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor={COLORS.secondary} stopOpacity={0.2}/>
                                    <stop offset="95%" stopColor={COLORS.secondary} stopOpacity={0}/>
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={COLORS.grid} />
                            <XAxis dataKey="name" fontSize={10} tickLine={false} axisLine={false} />
                            <YAxis fontSize={10} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}%`} />
                            <Tooltip content={<CustomTooltip />} />
                            <Area type="monotone" dataKey="planned" name="Planned" stroke={COLORS.primary} strokeWidth={2} fillOpacity={1} fill="url(#colorPlanned)" />
                            <Area type="monotone" dataKey="actual" name="Actual" stroke={COLORS.secondary} strokeWidth={3} fillOpacity={1} fill="url(#colorActual)" />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* 2. Pareto Chart: Delay Root Causes */}
            <div className="col-span-1 bg-white border border-slate-200 rounded-xl shadow-sm p-6">
                <h3 className="text-lg font-bold text-slate-800 mb-1">Issue Impact Pareto</h3>
                <p className="text-xs text-slate-500 mb-6">Root Cause Frequency & Cumulative %</p>
                <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={data.issuePareto}>
                            <XAxis dataKey="name" fontSize={10} tickLine={false} hide />
                            <YAxis yAxisId="left" fontSize={10} tickLine={false} axisLine={false} />
                            <YAxis yAxisId="right" orientation="right" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}%`} />
                            <Tooltip />
                            <Bar yAxisId="left" dataKey="value" name="Frequency" fill={COLORS.primary} radius={[4, 4, 0, 0]} />
                            <Line yAxisId="right" type="monotone" dataKey="cumulative" name="Cumulative %" stroke={COLORS.accent} strokeWidth={2} />
                        </ComposedChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* 3. Daily Productivity Trend */}
            <div className="col-span-1 md:col-span-1 bg-white border border-slate-200 rounded-xl shadow-sm p-6">
                <h3 className="text-lg font-bold text-slate-800 mb-1">Productivity Burn-up</h3>
                <p className="text-xs text-slate-500 mb-6">Daily Actuals vs Required Pace</p>
                <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={data.dailyProductivity}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={COLORS.grid} />
                            <XAxis dataKey="name" fontSize={10} tickLine={false} />
                            <YAxis fontSize={10} tickLine={false} />
                            <Tooltip />
                            <Bar dataKey="actual" name="Daily Production" fill={COLORS.secondary} radius={[4, 4, 0, 0]} />
                            <Line type="monotone" dataKey="target" name="Target Rate" stroke={COLORS.danger} strokeWidth={2} strokeDasharray="5 5" dot={false} />
                        </ComposedChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* 4. Efficiency correlation */}
            <div className="col-span-1 md:col-span-1 bg-white border border-slate-200 rounded-xl shadow-sm p-6">
                <h3 className="text-lg font-bold text-slate-800 mb-1">Manpower Efficiency</h3>
                <p className="text-xs text-slate-500 mb-6">Output Quantity vs Total Man-Hours</p>
                <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                        <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grid} />
                            <XAxis type="number" dataKey="manpower" name="Manpower" unit=" hrs" fontSize={10} />
                            <YAxis type="number" dataKey="output" name="Quantity" fontSize={10} />
                            <Tooltip cursor={{ strokeDasharray: '3 3' }} />
                            <Scatter name="Efficiency" data={data.manpowerEfficiency} fill={COLORS.primary} />
                        </ScatterChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* 5. Health Heatmap */}
            <div className="col-span-1 md:col-span-1 bg-white border border-slate-200 rounded-xl shadow-sm p-6">
                <h3 className="text-lg font-bold text-slate-800 mb-1">Execution Health</h3>
                <p className="text-xs text-slate-500 mb-4">Block-wise Critical Milestone Status</p>
                <div className="grid grid-cols-4 gap-1 overflow-y-auto max-h-56 p-2 bg-slate-50 rounded-lg">
                    {data.activityHeatmap.slice(0, 40).map((item, idx) => (
                        <div key={idx} className="flex flex-col items-center">
                            <div 
                                className={`w-full h-8 rounded-sm mb-1 ${
                                    item.health >= 100 ? 'bg-emerald-500' : 
                                    item.health >= 50 ? 'bg-amber-400' : 
                                    item.health > 0 ? 'bg-rose-500' : 'bg-slate-300'
                                }`}
                                title={`${item.block} - ${item.activity}: ${item.health}%`}
                            ></div>
                            <span className="text-[8px] text-slate-500 truncate w-full text-center">{item.block}</span>
                        </div>
                    ))}
                </div>
                <div className="mt-4 flex justify-between text-[10px] text-slate-500">
                    <div className="flex items-center gap-1"><div className="w-2 h-2 bg-emerald-500 rounded-full"></div> 100%</div>
                    <div className="flex items-center gap-1"><div className="w-2 h-2 bg-amber-400 rounded-full"></div> 50-99%</div>
                    <div className="flex items-center gap-1"><div className="w-2 h-2 bg-rose-500 rounded-full"></div> &#60;50%</div>
                </div>
            </div>

        </div>
    );
};

export default AdvancedProjectAnalytics;
