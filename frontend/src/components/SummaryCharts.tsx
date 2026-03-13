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
    ResponsiveContainer
} from 'recharts';
import { P6Activity } from '@/services/p6ActivityService';

interface SummaryChartsProps {
    p6Activities: P6Activity[];
}

// Hook to detect dark mode
const useIsDarkMode = () => {
    const [isDark, setIsDark] = React.useState(false);

    React.useEffect(() => {
        const checkDarkMode = () => {
            setIsDark(document.documentElement.classList.contains('dark'));
        };
        checkDarkMode();

        // Watch for class changes
        const observer = new MutationObserver(checkDarkMode);
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

        return () => observer.disconnect();
    }, []);

    return isDark;
};

// Get theme-aware colors
const getChartColors = (isDark: boolean) => ({
    primary: '#3B82F6',      // Blue
    secondary: '#10B981',    // Green
    accent: '#F59E0B',       // Orange/Amber
    danger: '#EF4444',       // Red
    warning: '#F59E0B',      // Yellow
    info: '#06B6D4',         // Cyan
    grid: isDark ? '#374151' : '#E5E7EB',
    text: isDark ? '#D1D5DB' : '#374151',
    tooltipBg: isDark ? 'rgba(31, 41, 55, 0.95)' : 'rgba(255, 255, 255, 0.95)',
    tooltipBorder: isDark ? '#4B5563' : '#E5E7EB',
    tooltipText: isDark ? '#F3F4F6' : '#111827',
});

// Chart 1: Quantity Status - Uses real P6 activity data
const QuantityStatusChart: React.FC<{ activities: P6Activity[]; colors: ReturnType<typeof getChartColors> }> = ({ activities, colors }) => {
    const chartData = useMemo(() => {
        return activities.slice(0, 12).map((activity, index) => {
            const scope = activity.targetQty ?? 0; // Fixed: was 'totalQuantity'
            const actual = activity.actualQty ?? 0; // Fixed: was 'actualQuantity'
            const cumulative = activity.cumulative ? parseFloat(activity.cumulative) : actual;
            const remainingQty = activity.remainingQty ?? (scope - cumulative); // Fixed: was 'remainingQuantity'
            const percentComplete = activity.percentComplete ?? 0;

            return {
                name: activity.name?.substring(0, 18) || `Activity ${index + 1}`, // Fixed: was 'description'
                scope: scope,
                balance: Math.max(0, remainingQty),
                completed: cumulative,
                uom: activity.unitOfMeasure || 'Units', // Fixed: was 'uom'
                percentComplete: percentComplete,
            };
        });
    }, [activities]);

    if (chartData.length === 0) {
        return (
            <div className="flex items-center justify-center h-64 text-muted-foreground">
                No activity data available
            </div>
        );
    }

    return (
        <ResponsiveContainer width="100%" height={400}>
            <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={colors.grid} />
                <XAxis
                    dataKey="name"
                    angle={-45}
                    textAnchor="end"
                    height={80}
                    tick={{ fontSize: 10, fill: colors.text }}
                />
                <YAxis tick={{ fontSize: 11, fill: colors.text }} />
                <Tooltip
                    contentStyle={{
                        backgroundColor: colors.tooltipBg,
                        borderRadius: '8px',
                        border: `1px solid ${colors.tooltipBorder}`,
                        color: colors.tooltipText
                    }}
                    labelStyle={{ color: colors.tooltipText }}
                />
                <Legend wrapperStyle={{ paddingTop: '20px' }} />
                <Bar dataKey="scope" name="Scope" fill={colors.primary} radius={[4, 4, 0, 0]} />
                <Bar dataKey="completed" name="Completed" fill={colors.secondary} radius={[4, 4, 0, 0]} />
                <Bar dataKey="balance" name="Balance" fill={colors.accent} radius={[4, 4, 0, 0]} />
            </BarChart>
        </ResponsiveContainer>
    );
};

// Chart 2: Resource Status - Extracts resource data from P6 activities
const ResourceStatusChart: React.FC<{ activities: P6Activity[]; colors: ReturnType<typeof getChartColors> }> = ({ activities, colors }) => {
    const resourceData = useMemo(() => {
        // Aggregate resources from activities based on contractor/vendor data
        const resourceMap = new Map<string, { required: number; available: number }>;

        // Extract resource information from activities
        activities.forEach(activity => {
            // Use front as resource type if available (contractorName not in interface)
            const resourceType = activity.front || 'General';
            if (resourceType && resourceType !== 'General') {
                const current = resourceMap.get(resourceType) || { required: 0, available: 0 };
                const scope = activity.targetQty ?? 0; // Fixed: was 'totalQuantity'
                const completed = activity.actualQty ?? 0; // Fixed: was 'actualQuantity'
                current.required += Math.ceil(scope / 100) || 1;
                current.available += Math.ceil(completed / 100) || 0;
                resourceMap.set(resourceType, current);
            }
        });

        // If no resource data, create summary based on activity status
        if (resourceMap.size === 0) {
            const totalActivities = activities.length;
            const completedActivities = activities.filter(a =>
                (a.percentComplete ?? 0) >= 100
            ).length;
            const inProgressActivities = activities.filter(a => {
                const pct = a.percentComplete ?? 0;
                return pct > 0 && pct < 100;
            }).length;
            const pendingActivities = totalActivities - completedActivities - inProgressActivities;

            return [
                { name: 'Total Activities', required: totalActivities, available: completedActivities, gap: pendingActivities + inProgressActivities },
                { name: 'Completed', required: completedActivities, available: completedActivities, gap: 0 },
                { name: 'In Progress', required: inProgressActivities, available: Math.floor(inProgressActivities * 0.5), gap: Math.ceil(inProgressActivities * 0.5) },
                { name: 'Pending', required: pendingActivities, available: 0, gap: pendingActivities },
            ];
        }

        // Convert map to array
        return Array.from(resourceMap.entries()).slice(0, 8).map(([name, data]) => ({
            name: name.substring(0, 20),
            required: data.required,
            available: data.available,
            gap: Math.max(0, data.required - data.available),
        }));
    }, [activities]);

    return (
        <ResponsiveContainer width="100%" height={400}>
            <BarChart
                data={resourceData}
                layout="vertical"
                margin={{ top: 20, right: 30, left: 100, bottom: 20 }}
            >
                <CartesianGrid strokeDasharray="3 3" stroke={colors.grid} />
                <XAxis type="number" tick={{ fontSize: 11, fill: colors.text }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fill: colors.text }} width={90} />
                <Tooltip
                    contentStyle={{
                        backgroundColor: colors.tooltipBg,
                        borderRadius: '8px',
                        border: `1px solid ${colors.tooltipBorder}`,
                        color: colors.tooltipText
                    }}
                    labelStyle={{ color: colors.tooltipText }}
                />
                <Legend wrapperStyle={{ paddingTop: '10px' }} />
                <Bar dataKey="required" name="Required" fill={colors.primary} radius={[0, 4, 4, 0]} />
                <Bar dataKey="available" name="Available" fill={colors.secondary} radius={[0, 4, 4, 0]} />
                <Bar dataKey="gap" name="Gap" fill={colors.danger} radius={[0, 4, 4, 0]} />
            </BarChart>
        </ResponsiveContainer>
    );
};

// Chart 3: Critical Path (Gantt Chart)
const CriticalPathChart: React.FC<{ activities: P6Activity[] }> = ({ activities }) => {
    const ganttData = useMemo(() => {
        // Get all activities with valid dates
        const validActivities = activities.filter(a =>
            a.plannedStartDate || a.actualStartDate // Fixed: was 'basePlanStart' and 'actualStart'
        ).slice(0, 12);

        if (validActivities.length === 0) {
            // Use activities even without dates for display
            return activities.slice(0, 12).map((activity, index) => ({
                name: activity.name?.substring(0, 25) || `Activity ${index + 1}`, // Fixed: was 'description'
                startDate: new Date(),
                endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
                progress: activity.percentComplete ?? 0,
                isCritical: activity.priority === 'High' || activity.status === 'Critical',
            }));
        }

        return validActivities.map((activity, index) => {
            const startDate = new Date(activity.actualStartDate || activity.plannedStartDate || new Date()); // Fixed
            const endDate = new Date(activity.plannedFinishDate || activity.forecastFinishDate || activity.actualFinishDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)); // Fixed
            const progress = activity.percentComplete ?? 0;
            const isCritical = activity.priority === 'High' || activity.status === 'Critical';

            return {
                name: activity.name?.substring(0, 25) || `Activity ${index + 1}`, // Fixed: was 'description'
                startDate,
                endDate,
                progress: Math.min(100, progress),
                isCritical,
            };
        });
    }, [activities]);

    if (ganttData.length === 0) {
        return (
            <div className="flex items-center justify-center h-64 text-muted-foreground">
                No activity data available for Gantt chart
            </div>
        );
    }

    // Calculate timeline bounds
    const allDates = ganttData.flatMap(d => [d.startDate, d.endDate]);
    const minDate = new Date(Math.min(...allDates.map(d => d.getTime())));
    const maxDate = new Date(Math.max(...allDates.map(d => d.getTime())));
    const totalDays = Math.max(1, (maxDate.getTime() - minDate.getTime()) / (1000 * 60 * 60 * 24));
    const today = new Date();

    // Generate months for header
    const months: { name: string; startPercent: number; widthPercent: number }[] = [];
    const monthStart = new Date(minDate.getFullYear(), minDate.getMonth(), 1);
    while (monthStart <= maxDate) {
        const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0);
        const startDays = Math.max(0, (monthStart.getTime() - minDate.getTime()) / (1000 * 60 * 60 * 24));
        const endDays = Math.min(totalDays, (monthEnd.getTime() - minDate.getTime()) / (1000 * 60 * 60 * 24));
        months.push({
            name: monthStart.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
            startPercent: (startDays / totalDays) * 100,
            widthPercent: ((endDays - startDays) / totalDays) * 100,
        });
        monthStart.setMonth(monthStart.getMonth() + 1);
    }

    // Today line position
    const todayPercent = ((today.getTime() - minDate.getTime()) / (1000 * 60 * 60 * 24)) / totalDays * 100;

    return (
        <div className="w-full overflow-x-auto">
            <div className="min-w-[800px]">
                {/* Header row with months */}
                <div className="flex border-b border-border">
                    <div className="w-64 flex-shrink-0 px-2 py-2 font-semibold bg-muted/50">Task Name</div>
                    <div className="w-24 flex-shrink-0 px-2 py-2 font-semibold bg-muted/50 text-center">Start</div>
                    <div className="w-24 flex-shrink-0 px-2 py-2 font-semibold bg-muted/50 text-center">End</div>
                    <div className="flex-1 relative bg-muted/30">
                        <div className="flex h-full">
                            {months.map((month, i) => (
                                <div
                                    key={i}
                                    className="border-l border-border text-xs text-center py-2"
                                    style={{ width: `${month.widthPercent}%` }}
                                >
                                    {month.name}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Task rows */}
                {ganttData.map((task, index) => {
                    const startPercent = ((task.startDate.getTime() - minDate.getTime()) / (1000 * 60 * 60 * 24)) / totalDays * 100;
                    const durationPercent = ((task.endDate.getTime() - task.startDate.getTime()) / (1000 * 60 * 60 * 24)) / totalDays * 100;

                    return (
                        <div key={index} className="flex border-b border-border hover:bg-muted/20">
                            <div className="w-64 flex-shrink-0 px-2 py-2 text-sm truncate">{task.name}</div>
                            <div className="w-24 flex-shrink-0 px-2 py-2 text-xs text-center text-muted-foreground">
                                {task.startDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                            </div>
                            <div className="w-24 flex-shrink-0 px-2 py-2 text-xs text-center text-muted-foreground">
                                {task.endDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                            </div>
                            <div className="flex-1 relative py-2 px-1">
                                {/* Task bar */}
                                <div
                                    className={`absolute h-6 rounded ${task.isCritical ? 'bg-red-500/30' : 'bg-blue-500/30'}`}
                                    style={{
                                        left: `${startPercent}%`,
                                        width: `${Math.max(2, durationPercent)}%`,
                                        top: '50%',
                                        transform: 'translateY(-50%)',
                                    }}
                                >
                                    {/* Progress fill */}
                                    <div
                                        className={`h-full rounded ${task.isCritical ? 'bg-red-500' : 'bg-blue-600'}`}
                                        style={{ width: `${task.progress}%` }}
                                    />
                                    {/* Progress text */}
                                    <span className="absolute right-1 top-1/2 -translate-y-1/2 text-xs font-medium text-white">
                                        {task.progress}%
                                    </span>
                                </div>
                            </div>
                        </div>
                    );
                })}

                {/* Today line overlay */}
                {todayPercent >= 0 && todayPercent <= 100 && (
                    <div
                        className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-10"
                        style={{ left: `calc(${64 + 24 + 24}px + ${todayPercent}%)` }}
                    >
                        <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-xs text-red-500 font-medium">TODAY</span>
                    </div>
                )}
            </div>

            {/* Legend */}
            <div className="flex gap-6 mt-4 text-sm">
                <div className="flex items-center gap-2">
                    <div className="w-4 h-4 bg-blue-500 rounded" />
                    <span className="text-muted-foreground">Normal Task</span>
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-4 h-4 bg-red-500 rounded" />
                    <span className="text-muted-foreground">Critical Path</span>
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-4 h-1 bg-red-500" />
                    <span className="text-muted-foreground">Today Line</span>
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-4 h-4 bg-blue-700 rounded" />
                    <span className="text-muted-foreground">Progress</span>
                </div>
            </div>
        </div>
    );
};

// Chart 4: Milestones - Uses real P6 activity data
const MilestonesChart: React.FC<{ activities: P6Activity[] }> = ({ activities }) => {
    const milestoneData = useMemo(() => {
        if (activities.length === 0) {
            return [];
        }

        // First, try to find actual milestone activities
        let milestones = activities
            .filter(a =>
                a.name?.toLowerCase().includes('milestone') || // Fixed: was 'description'
                a.status?.toLowerCase().includes('milestone')
            )
            .slice(0, 8);

        // If no milestones found, use key activities (every nth activity or those with significant progress)
        if (milestones.length === 0) {
            // Get activities sorted by date and pick key ones
            const sortedActivities = [...activities]
                .filter(a => a.plannedFinishDate || a.forecastFinishDate || a.actualFinishDate) // Fixed
                .sort((a, b) => {
                    const dateA = new Date(a.plannedFinishDate || a.forecastFinishDate || a.actualFinishDate || '').getTime(); // Fixed
                    const dateB = new Date(b.plannedFinishDate || b.forecastFinishDate || b.actualFinishDate || '').getTime(); // Fixed
                    return dateA - dateB;
                });

            // Pick activities at key intervals
            const step = Math.max(1, Math.floor(sortedActivities.length / 6));
            milestones = sortedActivities
                .filter((_, index) => index % step === 0)
                .slice(0, 8);
        }

        return milestones.map(m => {
            const progress = m.percentComplete ?? 0;
            const finishDate = m.plannedFinishDate || m.forecastFinishDate || m.actualFinishDate || ''; // Fixed

            return {
                name: m.name?.substring(0, 30) || 'Activity', // Fixed: was 'description'
                date: finishDate ? new Date(finishDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : 'TBD',
                status: progress >= 100 ? 'Completed'
                    : progress > 0 ? 'In Progress'
                        : 'Planned',
                progress: Math.min(100, Math.round(progress)),
            };
        });
    }, [activities]);

    if (milestoneData.length === 0) {
        return (
            <div className="flex items-center justify-center h-64 text-muted-foreground">
                No milestone data available
            </div>
        );
    }

    return (
        <div className="space-y-4 p-4">
            <div className="relative">
                {/* Timeline line */}
                <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-gradient-to-b from-primary via-secondary to-muted" />

                {milestoneData.map((milestone, index) => (
                    <div key={index} className="relative flex items-start mb-8 last:mb-0">
                        {/* Milestone marker */}
                        <div
                            className={`relative z-10 w-12 h-12 rounded-full flex items-center justify-center border-4 ${milestone.status === 'Completed'
                                ? 'bg-green-500 border-green-300'
                                : milestone.status === 'In Progress'
                                    ? 'bg-blue-500 border-blue-300 animate-pulse'
                                    : 'bg-gray-300 border-gray-200'
                                }`}
                        >
                            <span className="text-white text-xs font-bold">{index + 1}</span>
                        </div>

                        {/* Milestone content */}
                        <div className="ml-6 flex-1">
                            <Card className="p-4">
                                <div className="flex justify-between items-start">
                                    <div>
                                        <h4 className="font-semibold text-sm">{milestone.name}</h4>
                                        <p className="text-xs text-muted-foreground mt-1">Target: {milestone.date}</p>
                                    </div>
                                    <span className={`px-2 py-1 text-xs rounded-full ${milestone.status === 'Completed' ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' :
                                        milestone.status === 'In Progress' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300' :
                                            'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
                                        }`}>
                                        {milestone.status}
                                    </span>
                                </div>
                                {/* Progress bar */}
                                <div className="mt-3">
                                    <div className="flex justify-between text-xs text-muted-foreground mb-1">
                                        <span>Progress</span>
                                        <span>{milestone.progress}%</span>
                                    </div>
                                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                                        <div
                                            className={`h-full rounded-full transition-all ${milestone.status === 'Completed' ? 'bg-green-500' :
                                                milestone.status === 'In Progress' ? 'bg-blue-500' :
                                                    'bg-gray-400'
                                                }`}
                                            style={{ width: `${milestone.progress}%` }}
                                        />
                                    </div>
                                </div>
                            </Card>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

// Main SummaryCharts component
export const SummaryCharts: React.FC<SummaryChartsProps> = ({ p6Activities }) => {
    const isDark = useIsDarkMode();
    const colors = getChartColors(isDark);

    return (
        <div className="grid gap-5 md:grid-cols-1 lg:grid-cols-2">
            <Card className="shadow-sm border-border bg-card h-full">
                <CardHeader className="pb-2">
                    <CardTitle className="text-base font-medium text-foreground">Quantity Status</CardTitle>
                    <p className="text-sm text-muted-foreground">
                        Activity scope, completion, and balance overview
                    </p>
                </CardHeader>
                <CardContent>
                    <QuantityStatusChart activities={p6Activities} colors={colors} />
                </CardContent>
            </Card>

            <Card className="shadow-sm border-border bg-card h-full">
                <CardHeader className="pb-2">
                    <CardTitle className="text-base font-medium text-foreground">Resource Status</CardTitle>
                    <p className="text-sm text-muted-foreground">
                        Required vs Available resources and gaps
                    </p>
                </CardHeader>
                <CardContent>
                    <ResourceStatusChart activities={p6Activities} colors={colors} />
                </CardContent>
            </Card>

            <Card className="shadow-sm border-border bg-card h-full col-span-1 lg:col-span-2">
                <CardHeader className="pb-2">
                    <CardTitle className="text-base font-medium text-foreground">Critical Path - Gantt Chart</CardTitle>
                    <p className="text-sm text-muted-foreground">
                        Project timeline with task progress and critical path highlighting
                    </p>
                </CardHeader>
                <CardContent>
                    <CriticalPathChart activities={p6Activities} />
                </CardContent>
            </Card>

            <Card className="shadow-sm border-border bg-card h-full col-span-1 lg:col-span-2">
                <CardHeader className="pb-2">
                    <CardTitle className="text-base font-medium text-foreground">Project Milestones</CardTitle>
                    <p className="text-sm text-muted-foreground">
                        Key project milestones and their completion status
                    </p>
                </CardHeader>
                <CardContent>
                    <MilestonesChart activities={p6Activities} />
                </CardContent>
            </Card>
        </div>
    );
};
