import React, { useState, useMemo } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer,
    ComposedChart,
    Line,
    Radar,
    RadarChart,
    PolarGrid,
    PolarAngleAxis,
    PolarRadiusAxis,
    Area,
    PieChart,
    Pie,
    Cell
} from 'recharts';
import { P6Activity } from '@/services/p6ActivityService';

interface CategoryDef {
  name: string;
  activities: string[];
}

const SOLAR_SUMMARY_CATEGORIES: CategoryDef[] = [
  {
    name: 'PILING',
    activities: [
      'piling - mms (marking, auguring & concreting)',
      'pile capping',
      'piling - lt cable hanger system',
      'piling - inverters',
      'piling - robotic docking system',
    ],
  },
  {
    name: 'MMS & MODULE',
    activities: [
      'array earthing',
      'mms erection - torque tube/rafter',
      'mms erection - transmission shaft/bracing',
      'mms erection - purlin',
      'mms  - rfi completion',
      'module installation',
      'module - rfi completion',
    ],
  },
  {
    name: 'ROBOTIC WORKS',
    activities: [
      'robotic structure - docking station installation',
      'robotic structure - reverse station installation',
      'robotic structure - bridges installation',
      'robot installation',
    ],
  },
  {
    name: 'IDT',
    activities: [
      'idt foundation up to rail',
      'ht & lt station - slab',
      'ht lt station - slab',
      'ht & lt station - shed installation',
      'ht & lt station - sheeting installation',
      'nifps foundation',
      'bot foundation',
      'aux transformer foundation',
    ],
  },
  {
    name: 'AC / DC',
    activities: [
      'dc cable laying',
      'module interconnection & mc4 termination',
      'voc testing',
      'lt cable laying',
      'ht cable laying',
      'fo cable laying',
      'ht panel erection',
      'lt panel erection',
      'idt erection',
      'inverter installation',
      'scada & sacu installation',
      'aux transformer - installation',
    ],
  },
  {
    name: 'TESTING',
    activities: [
      'idt filtration',
      'idt testing',
      'ht panel testing',
      'lt panel testing',
    ],
  },
  {
    name: 'COMMISSIONING & COD',
    activities: [
      'cea compliance & approval',
      'first time charging',
      'trial operation',
      'trial run certificate',
      'cod',
    ],
  },
];

interface SummaryChartsProps {
    p6Activities: P6Activity[];
    dpQtyData?: any[];
    manpowerDetailsData?: any[];
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

const getChartColors = (isDark: boolean) => ({
    adaniBlue: '#1b4e9b',     // Deep Adani Corporate Blue
    adaniGreen: '#76bc21',    // Vibrant Adani Green
    adaniRed: '#e41e26',      // Adani Statement Red
    adaniYellow: '#ffcb05',   // Adani Energy Yellow
    primary: '#1b4e9b',
    secondary: '#76bc21',
    accent: '#ffcb05',
    danger: '#e41e26',
    warning: '#ffcb05',
    info: '#00aad2',
    grid: isDark ? '#374151' : '#E2E8F0',
    text: isDark ? '#CBD5E1' : '#475569',
    tooltipBg: isDark ? 'rgba(15, 23, 42, 0.95)' : 'rgba(255, 255, 255, 0.98)',
    tooltipBorder: isDark ? '#334155' : '#E2E8F0',
    tooltipText: isDark ? '#F8FAFC' : '#1E293B',
});

const stripBlockPrefix = (name: string): string => {
    if (!name) return '';
    return name.replace(/^(Block|Blk|Plot)\s*[- ]?\s*\w+\s*-\s*/i, '').trim();
};

const getCategoryForActivity = (name: string) => {
    const nameLower = name.toLowerCase();
    const stripped = stripBlockPrefix(nameLower);
    return SOLAR_SUMMARY_CATEGORIES.find(c => 
        c.activities.some(act => stripped.includes(act.toLowerCase()) || nameLower.includes(act.toLowerCase()))
    )?.name || 'OTHER';
};

// Chart 1: Category Progress - Bar chart showing completion % by Category
const CategoryProgressChart: React.FC<{ dpQtyData?: any[]; colors: ReturnType<typeof getChartColors> }> = ({ dpQtyData, colors }) => {
    const chartData = useMemo(() => {
        if (!dpQtyData) return [];
        const stats = new Map<string, { scope: number; completed: number }>();
        
        SOLAR_SUMMARY_CATEGORIES.forEach(c => stats.set(c.name, { scope: 0, completed: 0 }));
        
        dpQtyData.forEach(entry => {
            if (entry.isCategoryRow) return;
            const cat = getCategoryForActivity(entry.description || entry.name || '');
            const current = stats.get(cat) || { scope: 0, completed: 0 };
            current.scope += parseFloat(entry.totalQuantity || '0');
            current.completed += parseFloat(entry.cumulative || '0');
            stats.set(cat, current);
        });

        return SOLAR_SUMMARY_CATEGORIES.map(c => {
            const data = stats.get(c.name)!;
            const percent = data.scope > 0 ? Math.round((data.completed / data.scope) * 100) : 0;
            return {
                name: c.name,
                percent,
                scope: data.scope,
                completed: data.completed
            };
        });
    }, [dpQtyData]);

    return (
        <ResponsiveContainer width="100%" height={350}>
            <ComposedChart data={chartData} syncId="summarySync" margin={{ top: 20, right: 30, left: 40, bottom: 20 }}>
                <defs>
                    <linearGradient id="colorPercent" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={colors.adaniGreen} stopOpacity={0.8}/>
                        <stop offset="95%" stopColor={colors.adaniGreen} stopOpacity={0.2}/>
                    </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={colors.grid} vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: colors.text, fontWeight: 600 }} />
                <YAxis unit="%" domain={[0, 100]} tick={{ fontSize: 11, fill: colors.text }} />
                <Tooltip 
                    cursor={{fill: colors.grid, opacity: 0.4}}
                    contentStyle={{ backgroundColor: colors.tooltipBg, borderRadius: '12px', border: `1px solid ${colors.tooltipBorder}`, boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', color: colors.tooltipText }} 
                />
                <Bar 
                    dataKey="percent" 
                    name="Completion %" 
                    fill="url(#colorPercent)" 
                    radius={[6, 6, 0, 0]} 
                    animationDuration={1500}
                    animationBegin={200}
                />
                <Line 
                    type="monotone" 
                    dataKey="percent" 
                    stroke={colors.adaniBlue} 
                    strokeWidth={3} 
                    dot={{ r: 5, fill: colors.adaniBlue, strokeWidth: 2, stroke: '#fff' }} 
                    activeDot={{ r: 8, strokeWidth: 0 }}
                    animationDuration={2000}
                />
            </ComposedChart>
        </ResponsiveContainer>
    );
};

// Chart 2: Resource Summary - Radar chart by category requirements
const ResourceSummaryChart: React.FC<{ manpowerDetailsData?: any[]; colors: ReturnType<typeof getChartColors> }> = ({ manpowerDetailsData, colors }) => {
    const resourceData = useMemo(() => {
        if (!manpowerDetailsData) return [];
        const stats = new Map<string, { required: number; available: number }>();
        
        // Define high-level resource buckets
        const buckets = ['Mechanical', 'Electrical', 'Civil', 'Others'];
        buckets.forEach(b => stats.set(b, { required: 0, available: 0 }));

        manpowerDetailsData.forEach(entry => {
            if (entry.isCategoryRow) return;
            const name = (entry.description || entry.resourceName || '').toLowerCase();
            let bucket = 'Others';
            if (name.includes('mechanical') || name.includes('fitter') || name.includes('rigger')) bucket = 'Mechanical';
            else if (name.includes('electrical') || name.includes('electrician') || name.includes('cable')) bucket = 'Electrical';
            else if (name.includes('civil') || name.includes('mason') || name.includes('carpenter')) bucket = 'Civil';
            
            const current = stats.get(bucket)!;
            current.required += parseFloat(entry.budgetedUnits || '0');
            current.available += parseFloat(entry.actualUnits || '0');
        });

        return Array.from(stats.entries()).map(([name, data]) => ({
            subject: name,
            A: data.required,
            B: data.available,
            fullMark: Math.max(data.required, data.available, 1)
        }));
    }, [manpowerDetailsData]);

    return (
        <ResponsiveContainer width="100%" height={350}>
            <RadarChart cx="50%" cy="50%" outerRadius="70%" data={resourceData}>
                <PolarGrid stroke={colors.grid} />
                <PolarAngleAxis dataKey="subject" tick={{ fill: colors.text, fontSize: 11, fontWeight: 500 }} />
                <Radar 
                    name="Required" 
                    dataKey="A" 
                    stroke={colors.adaniBlue} 
                    fill={colors.adaniBlue} 
                    fillOpacity={0.2} 
                    animationDuration={1500}
                />
                <Radar 
                    name="Available" 
                    dataKey="B" 
                    stroke={colors.adaniGreen} 
                    fill={colors.adaniGreen} 
                    fillOpacity={0.6}
                    animationDuration={2000}
                />
                <Tooltip 
                    contentStyle={{ backgroundColor: colors.tooltipBg, borderRadius: '12px', border: `1px solid ${colors.tooltipBorder}`, boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', color: colors.tooltipText }} 
                />
                <Legend iconType="circle" wrapperStyle={{ paddingTop: '10px' }} />
            </RadarChart>
        </ResponsiveContainer>
    );
};

// Chart 3: Grouped Gantt Progress - Shows category-wise timeline and progress
const GanttProgressChart: React.FC<{ activities: P6Activity[]; colors: ReturnType<typeof getChartColors> }> = ({ activities, colors }) => {
    const ganttData = useMemo(() => {
        const catStats = new Map<string, { start: number; end: number; progress: number; count: number }>();
        
        activities.forEach(a => {
            const cat = getCategoryForActivity(a.name || '');
            const startStr = a.actualStartDate || a.plannedStartDate;
            const endStr = a.actualFinishDate || a.plannedFinishDate || a.forecastFinishDate;
            if (!startStr || !endStr) return;

            const s = new Date(startStr).getTime();
            const e = new Date(endStr).getTime();
            const p = a.percentComplete || 0;

            const existing = catStats.get(cat) || { start: s, end: e, progress: 0, count: 0 };
            existing.start = Math.min(existing.start, s);
            existing.end = Math.max(existing.end, e);
            existing.progress += p;
            existing.count += 1;
            catStats.set(cat, existing);
        });

        return SOLAR_SUMMARY_CATEGORIES.map(c => {
            const stats = catStats.get(c.name);
            if (!stats) return null;
            return {
                name: c.name,
                start: stats.start,
                end: stats.end,
                duration: stats.end - stats.start,
                progress: Math.round(stats.progress / stats.count),
                timeRange: [stats.start, stats.end]
            };
        }).filter(Boolean);
    }, [activities]);

    if (ganttData.length === 0) return <div className="flex items-center justify-center h-64 text-muted-foreground">No timeline data</div>;

    const minDate = Math.min(...ganttData.map((d: any) => d.start));

    return (
        <ResponsiveContainer width="100%" height={400}>
            <BarChart 
                data={ganttData} 
                layout="vertical" 
                syncId="summarySync"
                margin={{ top: 20, right: 30, left: 100, bottom: 20 }}
            >
                <CartesianGrid strokeDasharray="3 3" stroke={colors.grid} horizontal={false} />
                <XAxis 
                    type="number" 
                    domain={[minDate - 86400000 * 7, 'dataMax']} 
                    tickFormatter={(val) => new Date(val).toLocaleDateString('en-US', { month: 'short', year: '2-digit' })}
                    tick={{ fontSize: 10, fill: colors.text }}
                />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: colors.text, fontWeight: 600 }} />
                <Tooltip 
                    cursor={{fill: colors.grid, opacity: 0.3}}
                    content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                            const data = payload[0].payload;
                            return (
                                <div style={{ backgroundColor: colors.tooltipBg, border: `1px solid ${colors.tooltipBorder}` }} className="p-3 rounded-xl shadow-xl border text-xs">
                                    <p style={{ color: colors.adaniBlue }} className="font-black text-sm mb-2 uppercase tracking-tight">{data.name}</p>
                                    <div className="space-y-1">
                                        <div className="flex justify-between gap-4">
                                            <span className="text-slate-400 font-medium">Completion:</span>
                                            <span style={{ color: colors.adaniGreen }} className="font-bold">{data.progress}%</span>
                                        </div>
                                        <div className="flex justify-between gap-4">
                                            <span className="text-slate-400 font-medium">Start:</span>
                                            <span className="font-mono">{new Date(data.start).toLocaleDateString()}</span>
                                        </div>
                                        <div className="flex justify-between gap-4">
                                            <span className="text-slate-400 font-medium">Finish:</span>
                                            <span className="font-mono">{new Date(data.end).toLocaleDateString()}</span>
                                        </div>
                                    </div>
                                    <div className="mt-2 h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                                        <div style={{ width: `${data.progress}%`, backgroundColor: colors.adaniGreen }} className="h-full rounded-full" />
                                    </div>
                                </div>
                            );
                        }
                        return null;
                    }}
                />
                <Bar 
                    dataKey="timeRange" 
                    radius={6} 
                    barSize={24}
                    animationDuration={1500}
                >
                    {ganttData.map((entry: any, index: number) => (
                        <Cell 
                            key={`cell-${index}`} 
                            fill={entry.progress >= 100 ? colors.adaniGreen : colors.adaniBlue} 
                            fillOpacity={0.7 + (entry.progress / 333.3)} 
                        />
                    ))}
                </Bar>
            </BarChart>
        </ResponsiveContainer>
    );
};

// Chart 4: Milestone Progress Distribution
const MilestoneTimelineChart: React.FC<{ activities: P6Activity[]; colors: ReturnType<typeof getChartColors> }> = ({ activities, colors }) => {
    const milestoneData = useMemo(() => {
        const stats = SOLAR_SUMMARY_CATEGORIES.map(c => {
            const catActivities = activities.filter(a => getCategoryForActivity(a.name || '') === c.name);
            const total = catActivities.length;
            const completed = catActivities.filter(a => (a.percentComplete || 0) >= 100).length;
            const inProgress = catActivities.filter(a => (a.percentComplete || 0) > 0 && (a.percentComplete || 0) < 100).length;
            
            return {
                name: c.name,
                Completed: completed,
                InProgress: inProgress,
                Planned: total - completed - inProgress
            };
        });
        return stats;
    }, [activities]);

    return (
        <ResponsiveContainer width="100%" height={350}>
            <BarChart data={milestoneData} syncId="summarySync" margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={colors.grid} vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: colors.text, fontWeight: 600 }} />
                <YAxis tick={{ fontSize: 11, fill: colors.text }} />
                <Tooltip 
                    cursor={{fill: colors.grid, opacity: 0.3}}
                    contentStyle={{ backgroundColor: colors.tooltipBg, borderRadius: '12px', border: `1px solid ${colors.tooltipBorder}`, color: colors.tooltipText }} 
                />
                <Legend iconType="rect" verticalAlign="top" align="right" />
                <Bar dataKey="Completed" stackId="a" fill={colors.adaniGreen} radius={[0, 0, 0, 0]} animationDuration={1000} />
                <Bar dataKey="InProgress" name="In Progress" stackId="a" fill={colors.adaniBlue} radius={[0, 0, 0, 0]} animationDuration={1500} />
                <Bar dataKey="Planned" stackId="a" fill={colors.grid} radius={[4, 4, 0, 0]} animationDuration={2000} />
            </BarChart>
        </ResponsiveContainer>
    );
};

export const SummaryCharts: React.FC<SummaryChartsProps> = ({ p6Activities, dpQtyData, manpowerDetailsData }) => {
    const isDark = useIsDarkMode();
    const colors = getChartColors(isDark);

    return (
        <div className="grid gap-5 grid-cols-1 lg:grid-cols-2">
            <Card className="shadow-md border-slate-200">
                <CardHeader className="pb-2 bg-slate-50/50">
                    <CardTitle className="text-sm font-bold uppercase tracking-wider text-slate-600">Category Completion %</CardTitle>
                </CardHeader>
                <CardContent className="pt-4">
                    <CategoryProgressChart dpQtyData={dpQtyData} colors={colors} />
                </CardContent>
            </Card>

            <Card className="shadow-md border-slate-200">
                <CardHeader className="pb-2 bg-slate-50/50">
                    <CardTitle className="text-sm font-bold uppercase tracking-wider text-slate-600">Resource Distribution</CardTitle>
                </CardHeader>
                <CardContent className="pt-4">
                    <ResourceSummaryChart manpowerDetailsData={manpowerDetailsData} colors={colors} />
                </CardContent>
            </Card>

            <Card className="shadow-md border-slate-200 col-span-1 lg:col-span-2">
                <CardHeader className="pb-2 bg-slate-50/50">
                    <CardTitle className="text-sm font-bold uppercase tracking-wider text-slate-600">Project Category Timeline</CardTitle>
                </CardHeader>
                <CardContent className="pt-4">
                    <GanttProgressChart activities={p6Activities} colors={colors} />
                </CardContent>
            </Card>

            <Card className="shadow-md border-slate-200 col-span-1 lg:col-span-2">
                <CardHeader className="pb-2 bg-slate-50/50">
                    <CardTitle className="text-sm font-bold uppercase tracking-wider text-slate-600">Activity Status by Category</CardTitle>
                </CardHeader>
                <CardContent className="pt-4">
                    <MilestoneTimelineChart activities={p6Activities} colors={colors} />
                </CardContent>
            </Card>
        </div>
    );
};
