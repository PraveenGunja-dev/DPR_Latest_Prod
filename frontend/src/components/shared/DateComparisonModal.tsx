import React, { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { ArrowRight, ArrowUpRight, ArrowDownRight, Minus, AlertCircle, BarChart3, ListFilter, X } from "lucide-react";
import ReactECharts from 'echarts-for-react';

interface DateComparisonModalProps {
    isOpen: boolean;
    onClose: () => void;
    entries: any[]; // Must contain entry_date, sheet_type, data_json
    projectName: string;
}

export const DateComparisonModal: React.FC<DateComparisonModalProps> = ({ isOpen, onClose, entries, projectName }) => {
    const [selectedSheet, setSelectedSheet] = useState<string>('');
    const [date1, setDate1] = useState<string>('');
    const [date2, setDate2] = useState<string>('');
    const [viewMode, setViewMode] = useState<'chart' | 'table'>('chart');

    // Extract unique sheet types from available entries
    const availableSheets = useMemo(() => {
        if (!Array.isArray(entries)) return [];
        const sheets = new Set(entries.filter(Boolean).map(e => e?.sheet_type));
        return Array.from(sheets).filter(Boolean);
    }, [entries]);

    // Helper to get the best available date from an entry
    const getBestDate = (entry: any) => {
        if (!entry) return null;
        return entry.entry_date || entry.updated_at || entry.created_at;
    };

    // Normalize date to YYYY-MM-DD using Indian Standard Time
    const normalizeDate = (dateStr: string) => {
        if (!dateStr) return '';
        if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
        try {
            const d = new Date(dateStr);
            if (isNaN(d.getTime())) return '';

            // Format to YYYY-MM-DD in IST
            return d.toLocaleDateString('en-CA', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                timeZone: 'Asia/Kolkata'
            });
        } catch {
            return '';
        }
    };

    // Extract available dates for the selected sheet
    const dateGroups = useMemo(() => {
        if (!selectedSheet || !Array.isArray(entries)) return { recent: [], older: [], all: [] };

        // Get current date in IST
        const indiaNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
        indiaNow.setHours(0, 0, 0, 0);

        const thirtyDaysAgo = new Date(indiaNow);
        thirtyDaysAgo.setDate(indiaNow.getDate() - 30);

        // Format cutoff for comparison
        const thirtyDaysAgoStr = thirtyDaysAgo.toLocaleDateString('en-CA', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            timeZone: 'Asia/Kolkata'
        });

        const datesSet = new Set(
            entries
                .filter(e => e && e.sheet_type === selectedSheet && getBestDate(e))
                .map(e => normalizeDate(getBestDate(e)))
                .filter(d => d !== '') // Remove any invalid dates
        );
        const sortedDates = Array.from(datesSet).sort((a, b) => b.localeCompare(a));

        const recent = sortedDates.filter(d => d >= thirtyDaysAgoStr);
        const older = sortedDates.filter(d => d < thirtyDaysAgoStr);

        return { recent, older, all: sortedDates };
    }, [entries, selectedSheet]);

    const availableDates = dateGroups.all || [];

    // Auto-select sheet and dates if possible
    React.useEffect(() => {
        if (availableSheets.length > 0 && !selectedSheet) {
            setSelectedSheet(availableSheets[0]);
        }
    }, [availableSheets, selectedSheet]);

    React.useEffect(() => {
        if (availableDates.length >= 2 && (!date1 || !date2)) {
            setDate1(availableDates[1]); // Older date
            setDate2(availableDates[0]); // Newer date
        } else if (availableDates.length === 1 && !date1 && !date2) {
            setDate1(availableDates[0]);
        }
    }, [availableDates, date1, date2]);

    // Find the exact entries for the selected dates
    const entry1 = useMemo(() => Array.isArray(entries) ? entries.find(e => e && e.sheet_type === selectedSheet && normalizeDate(getBestDate(e)) === date1) : null, [entries, selectedSheet, date1]);
    const entry2 = useMemo(() => Array.isArray(entries) ? entries.find(e => e && e.sheet_type === selectedSheet && normalizeDate(getBestDate(e)) === date2) : null, [entries, selectedSheet, date2]);

    // Compute Comparison Data
    const comparisonData = useMemo(() => {
        if (!entry1 || !entry2) return [];

        const data1 = typeof entry1.data_json === 'string' ? JSON.parse(entry1.data_json) : entry1.data_json;
        const data2 = typeof entry2.data_json === 'string' ? JSON.parse(entry2.data_json) : entry2.data_json;

        const rows1 = data1?.rows || [];
        const rows2 = data2?.rows || [];

        // Use a composite key or a strong identifier to match rows between days
        const filteredRows1 = (rows1 || []).filter(Boolean);
        const filteredRows2 = (rows2 || []).filter(Boolean);

        const map1 = new Map<string, any>(filteredRows1.map((r: any) => [String(r.activityId || r.slNo || r.description || r.rfiNo || JSON.stringify(r)), r]));

        return filteredRows2.map((r2: any) => {
            const id = String(r2.activityId || r2.slNo || r2.description || r2.rfiNo || JSON.stringify(r2));
            const r1: any = map1.get(id) || {};

            // Determine what to compare based on common field names for today's values
            let val1 = parseFloat(r1.todayValue || r1.today || r1.actual || r1.totalQuantity || r1.completionPercentage || 0);
            let val2 = parseFloat(r2.todayValue || r2.today || r2.actual || r2.totalQuantity || r2.completionPercentage || 0);

            if (isNaN(val1)) val1 = 0;
            if (isNaN(val2)) val2 = 0;

            let name = r2.activities || r2.description || r2.activity || r2.subject || id;
            if (name && typeof name === 'string' && name.length > 25) {
                name = name.substring(0, 25) + '...';
            }

            return {
                id,
                fullName: r2.activities || r2.description || r2.activity || r2.subject || id,
                name: String(name || 'Unnamed Item'),
                val1,
                val2,
                diff: val2 - val1,
                isPositive: (val2 - val1) > 0,
                isNegative: (val2 - val1) < 0
            };
        }).filter(d => d.val1 !== 0 || d.val2 !== 0 || d.diff !== 0);
    }, [entry1, entry2]);

    const formatSheetType = (sheet: string) => {
        if (!sheet) return '';
        return sheet.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    };

    const formatDateStr = (dateStr: string) => {
        if (!dateStr) return '';
        // Create a date object that represents midnight on that date in IST
        // We append T00:00:00 to ensure it's treated as a local date, then format for Display
        const [year, month, day] = dateStr.split('-').map(Number);
        const d = new Date(year, month - 1, day);
        return d.toLocaleDateString('en-GB', {
            day: '2-digit',
            month: 'short',
            timeZone: 'Asia/Kolkata'
        });
    };

    const getEchartsOption = () => {
        const d1Name = formatDateStr(date1);
        const d2Name = formatDateStr(date2);

        return {
            tooltip: {
                trigger: 'axis',
                axisPointer: { type: 'shadow' },
                formatter: function (params: any) {
                    let res = `<div style="font-weight:bold;margin-bottom:5px;">${params[0].axisValue}</div>`;
                    params.forEach((param: any) => {
                        let val = param.value;
                        let marker = param.marker;
                        if (param.seriesName === 'Variance' && val > 0) val = '+' + val;
                        res += `<div style="display:flex;justify-content:space-between;min-width:120px;">
                                  <span>${marker} ${param.seriesName}:</span>
                                  <span style="font-weight:bold">${val}</span>
                                </div>`;
                    });
                    return res;
                }
            },
            legend: {
                data: [d1Name, d2Name, 'Variance'],
                top: 0
            },
            grid: {
                left: '2%',
                right: '2%',
                bottom: 140, // Increase bottom padding fixed value to allow labels to fit without crushing the chart
                top: 60,
                containLabel: true
            },
            xAxis: {
                type: 'category',
                data: comparisonData.map(d => d.name),
                axisLabel: {
                    interval: 'auto',
                    rotate: 45,
                    hideOverlap: true,
                    width: 120,
                    overflow: 'truncate',
                    color: '#64748b',
                    fontSize: 10
                },
                axisTick: { alignWithLabel: true }
            },
            yAxis: [
                {
                    type: 'value',
                    name: 'Value',
                    position: 'left',
                    splitLine: { lineStyle: { type: 'dashed', color: '#e2e8f0' } },
                    nameTextStyle: { color: '#64748b', fontWeight: 'bold' }
                },
                {
                    type: 'value',
                    name: 'Variance',
                    position: 'right',
                    splitLine: { show: false },
                    nameTextStyle: { color: '#64748b', fontWeight: 'bold' }
                }
            ],
            dataZoom: [
                {
                    type: 'inside',
                    start: 0,
                    end: comparisonData.length > 20 ? (20 / comparisonData.length) * 100 : 100
                },
                {
                    type: 'slider',
                    start: 0,
                    end: comparisonData.length > 20 ? (20 / comparisonData.length) * 100 : 100,
                    height: 24,
                    bottom: 10,
                    borderColor: 'transparent',
                    backgroundColor: '#f1f5f9',
                    fillerColor: 'rgba(59, 130, 246, 0.2)',
                    handleSize: '100%',
                    showDetail: false
                }
            ],
            series: [
                {
                    name: d1Name,
                    type: 'bar',
                    data: comparisonData.map(d => d.val1),
                    itemStyle: { color: '#94a3b8', borderRadius: [4, 4, 0, 0] },
                    barMaxWidth: 35,
                    barGap: '10%',
                    barCategoryGap: '20%'
                },
                {
                    name: d2Name,
                    type: 'bar',
                    data: comparisonData.map(d => d.val2),
                    itemStyle: { color: '#3b82f6', borderRadius: [4, 4, 0, 0] },
                    barMaxWidth: 35,
                    barGap: '10%',
                    barCategoryGap: '20%'
                },
                {
                    name: 'Variance',
                    type: 'line',
                    yAxisIndex: 1,
                    data: comparisonData.map(d => ({
                        value: d.diff,
                        itemStyle: {
                            color: d.diff > 0 ? '#10b981' : d.diff < 0 ? '#ef4444' : '#64748b'
                        }
                    })),
                    symbolSize: 8,
                    lineStyle: {
                        color: '#cbd5e1',
                        width: 2,
                        type: 'dashed'
                    },
                    z: 10
                }
            ]
        };
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="!max-w-[98vw] !w-[98vw] !max-h-[98vh] !h-[98vh] flex flex-col overflow-hidden bg-slate-50 dark:bg-slate-900 border-none shadow-2xl p-0">
                <DialogHeader className="px-6 py-4 border-b border-border bg-white dark:bg-slate-950 flex flex-row items-center justify-between shrink-0">
                    <div>
                        <DialogTitle className="text-xl flex items-center gap-2">
                            <ArrowRight className="text-primary w-5 h-5" />
                            Progress Comparison Dashboard
                        </DialogTitle>
                        <DialogDescription className="mt-1">
                            Compare submission values between two different dates for <strong className="text-primary">{projectName || 'the project'}</strong>.
                        </DialogDescription>
                    </div>
                    <div className="flex items-center gap-4">
                        {/* View Toggle */}
                        {comparisonData.length > 0 && (
                            <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-lg border border-slate-200 dark:border-slate-700">
                                <button
                                    onClick={() => setViewMode('chart')}
                                    className={`flex items-center gap-2 px-4 py-1.5 text-sm font-medium rounded-md transition-all ${viewMode === 'chart'
                                        ? 'bg-white dark:bg-slate-950 text-primary shadow-sm'
                                        : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
                                        }`}
                                >
                                    <BarChart3 className="w-4 h-4" />
                                    Chart
                                </button>
                                <button
                                    onClick={() => setViewMode('table')}
                                    className={`flex items-center gap-2 px-4 py-1.5 text-sm font-medium rounded-md transition-all ${viewMode === 'table'
                                        ? 'bg-white dark:bg-slate-950 text-primary shadow-sm'
                                        : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
                                        }`}
                                >
                                    <ListFilter className="w-4 h-4" />
                                    Table
                                </button>
                            </div>
                        )}
                        <div className="flex ml-2 border-l border-slate-200 dark:border-slate-700 pl-4">
                            <Button variant="ghost" size="icon" onClick={onClose} className="rounded-full hover:bg-slate-100 dark:hover:bg-slate-800">
                                <X className="w-5 h-5 text-slate-500" />
                            </Button>
                        </div>
                    </div>
                </DialogHeader>

                <div className="flex-1 overflow-auto p-6 flex flex-col gap-6">
                    {availableSheets.length === 0 ? (
                        <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
                            <AlertCircle className="w-12 h-12 mb-4 animate-pulse opacity-50" />
                            <p className="text-lg">No entries found to compare for this project.</p>
                        </div>
                    ) : (
                        <>
                            {/* Controls */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 bg-white dark:bg-slate-950 p-5 rounded-xl border border-border/50 shadow-sm shrink-0">
                                <div className="space-y-2">
                                    <label className="text-sm font-semibold text-slate-600 dark:text-slate-400">Sheet Type</label>
                                    <Select value={selectedSheet} onValueChange={setSelectedSheet}>
                                        <SelectTrigger className="bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800">
                                            <SelectValue placeholder="Select Sheet" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {availableSheets.map(s => (
                                                <SelectItem key={s} value={s}>{formatSheetType(s)}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-sm font-semibold text-slate-600 dark:text-slate-400">Date 1 (Base Date)</label>
                                    <Select value={date1} onValueChange={setDate1}>
                                        <SelectTrigger className="bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800">
                                            <SelectValue placeholder="Select Date 1" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {dateGroups.recent.length > 0 && (
                                                <div className="px-2 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest bg-slate-50 dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800">Recent (Last 30 Days)</div>
                                            )}
                                            {dateGroups.recent.map(d => (
                                                <SelectItem key={d} value={d} className="focus:bg-blue-50 dark:focus:bg-blue-900/30">
                                                    <div className="flex items-center justify-between w-full gap-2">
                                                        <span>{new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                                                    </div>
                                                </SelectItem>
                                            ))}

                                            {dateGroups.older.length > 0 && (
                                                <>
                                                    <div className="px-2 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest bg-slate-50 dark:bg-slate-900 border-y border-slate-100 dark:border-slate-800 mt-2">Older Entries</div>
                                                    {dateGroups.older.map(d => (
                                                        <SelectItem key={d} value={d}>
                                                            {new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                                                        </SelectItem>
                                                    ))}
                                                </>
                                            )}
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-sm font-semibold text-slate-600 dark:text-slate-400">Date 2 (Target Date)</label>
                                    <Select value={date2} onValueChange={setDate2}>
                                        <SelectTrigger className="bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800">
                                            <SelectValue placeholder="Select Date 2" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {dateGroups.recent.length > 0 && (
                                                <div className="px-2 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest bg-slate-50 dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800">Recent (Last 30 Days)</div>
                                            )}
                                            {dateGroups.recent.map(d => (
                                                <SelectItem key={d} value={d} className="focus:bg-blue-50 dark:focus:bg-blue-900/30">
                                                    <div className="flex items-center justify-between w-full gap-2">
                                                        <span>{new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                                                    </div>
                                                </SelectItem>
                                            ))}

                                            {dateGroups.older.length > 0 && (
                                                <>
                                                    <div className="px-2 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest bg-slate-50 dark:bg-slate-900 border-y border-slate-100 dark:border-slate-800 mt-2">Older Entries</div>
                                                    {dateGroups.older.map(d => (
                                                        <SelectItem key={d} value={d}>
                                                            {new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                                                        </SelectItem>
                                                    ))}
                                                </>
                                            )}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>

                            {/* Main Content Area */}
                            {(!entry1 || !entry2) ? (
                                <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground bg-white/50 dark:bg-slate-950/50 rounded-xl border border-dashed border-slate-300 dark:border-slate-700">
                                    <AlertCircle className="w-10 h-10 mb-3 opacity-40" />
                                    <p>Please select two valid dates to see the comparison.</p>
                                </div>
                            ) : comparisonData.length === 0 ? (
                                <div className="flex-1 flex flex-col items-center justify-center py-20 text-muted-foreground bg-white/50 dark:bg-slate-950/50 rounded-xl border border-dashed border-slate-300 dark:border-slate-700">
                                    <BarChart3 className="w-10 h-10 mb-3 opacity-40" />
                                    <p>No scorable rows with values were found for these dates.</p>
                                </div>
                            ) : (
                                <Card className="flex-1 min-h-0 relative overflow-hidden flex flex-col border border-slate-200 dark:border-slate-800 shadow-md bg-white dark:bg-slate-950 p-4 rounded-xl">
                                    {viewMode === 'chart' ? (
                                        <div className="w-full flex-1 flex flex-col" style={{ minHeight: '650px', height: '100%' }}>
                                            <ReactECharts
                                                option={getEchartsOption()}
                                                style={{ height: '100%', minHeight: '650px', width: '100%' }}
                                                opts={{ renderer: 'svg' }}
                                                notMerge={true}
                                            />
                                        </div>
                                    ) : (
                                        <div className="flex-1 overflow-auto rounded-lg border border-slate-200 dark:border-slate-800">
                                            <Table>
                                                <TableHeader className="bg-slate-50 dark:bg-slate-900 sticky top-0 z-10 shadow-sm">
                                                    <TableRow className="hover:bg-transparent">
                                                        <TableHead className="font-bold text-slate-700 dark:text-slate-300 py-4 px-6">Activity / Item</TableHead>
                                                        <TableHead className="font-bold text-slate-700 dark:text-slate-300 py-4 text-right">
                                                            <span className="bg-slate-200 dark:bg-slate-800 px-3 py-1 rounded-md text-xs border border-slate-300 dark:border-slate-700">
                                                                {formatDateStr(date1)}
                                                            </span>
                                                        </TableHead>
                                                        <TableHead className="font-bold text-slate-700 dark:text-slate-300 py-4 text-right">
                                                            <span className="bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-300 px-3 py-1 rounded-md text-xs border border-blue-200 dark:border-blue-800">
                                                                {formatDateStr(date2)}
                                                            </span>
                                                        </TableHead>
                                                        <TableHead className="font-bold text-slate-700 dark:text-slate-300 py-4 px-6 text-right w-[150px]">Variance</TableHead>
                                                    </TableRow>
                                                </TableHeader>
                                                <TableBody>
                                                    {comparisonData.map((row, idx) => (
                                                        <TableRow key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors group">
                                                            <TableCell className="font-medium text-slate-700 dark:text-slate-300 px-6 max-w-[400px] truncate" title={row.fullName}>
                                                                {row.fullName}
                                                            </TableCell>
                                                            <TableCell className="text-right tabular-nums text-slate-600 dark:text-slate-400 group-hover:text-slate-900 dark:group-hover:text-slate-100">{row.val1}</TableCell>
                                                            <TableCell className="text-right tabular-nums font-semibold text-slate-800 dark:text-slate-200">{row.val2}</TableCell>
                                                            <TableCell className="text-right px-6">
                                                                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold tabular-nums min-w-[70px] justify-end ${row.isPositive ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800' :
                                                                    row.isNegative ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-400 border border-rose-200 dark:border-rose-800' :
                                                                        'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 border border-slate-200 dark:border-slate-700'
                                                                    }`}>
                                                                    {row.isPositive && <ArrowUpRight className="w-3.5 h-3.5 -ml-1" />}
                                                                    {row.isNegative && <ArrowDownRight className="w-3.5 h-3.5 -ml-1" />}
                                                                    {!row.isPositive && !row.isNegative && <Minus className="w-3.5 h-3.5 text-slate-400 -ml-1" />}
                                                                    {row.diff > 0 ? '+' : ''}{row.diff}
                                                                </span>
                                                            </TableCell>
                                                        </TableRow>
                                                    ))}
                                                </TableBody>
                                            </Table>
                                        </div>
                                    )}
                                </Card>
                            )}
                        </>
                    )}
                </div>
            </DialogContent>
        </Dialog >
    );
};
