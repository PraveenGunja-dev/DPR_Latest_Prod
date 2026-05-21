import React, { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { X, History, ChevronRight, ChevronDown, Clock, User, FileText, CheckCircle, XCircle, AlertTriangle, Calendar, ArrowUpDown, TrendingUp, PieChart as PieIcon, BarChart3, Search } from "lucide-react";
import { getPushHistory, getPushAuditDetail, getPushComparison, getPushAnalytics } from "@/services/dprService";
import { getSheetTypeLabel } from "@/utils/formatters";
import { AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { CHART_COLORS, axisProps, CustomTooltip } from "@/components/charts";

interface Props {
    isOpen: boolean;
    onClose: () => void;
    projectId: string | number;
}

type TabId = "history" | "comparison" | "analytics";

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
    { id: "history", label: "Push History", icon: <History className="w-4 h-4" /> },
    { id: "comparison", label: "Date Comparison", icon: <ArrowUpDown className="w-4 h-4" /> },
    { id: "analytics", label: "Analytics", icon: <BarChart3 className="w-4 h-4" /> },
];

const PIE_COLORS = [CHART_COLORS.success, CHART_COLORS.danger, CHART_COLORS.warning, CHART_COLORS.primary, CHART_COLORS.secondary];

// ── History Tab ───────────────────────────────────────────────
const HistoryTab: React.FC<{ projectId: string | number }> = ({ projectId }) => {
    const [history, setHistory] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [expandedId, setExpandedId] = useState<number | null>(null);
    const [auditDetail, setAuditDetail] = useState<any[]>([]);
    const [auditLoading, setAuditLoading] = useState(false);

    useEffect(() => {
        setLoading(true);
        getPushHistory(projectId).then(d => { setHistory(Array.isArray(d) ? d : []); setLoading(false); });
    }, [projectId]);

    const toggleExpand = async (entryId: number) => {
        if (expandedId === entryId) { setExpandedId(null); return; }
        setExpandedId(entryId);
        setAuditLoading(true);
        const detail = await getPushAuditDetail(entryId);
        setAuditDetail(Array.isArray(detail) ? detail : []);
        setAuditLoading(false);
    };

    if (loading) return <div className="flex items-center justify-center py-20 text-muted-foreground"><Clock className="w-5 h-5 animate-spin mr-2" /> Loading history...</div>;
    if (history.length === 0) return <div className="flex flex-col items-center justify-center py-20 text-muted-foreground"><History className="w-12 h-12 mb-3 opacity-30" /><p className="text-lg font-medium">No pushes yet</p><p className="text-sm">Push entries to P6 to see history here.</p></div>;

    return (
        <div className="divide-y divide-slate-200 dark:divide-slate-700">
            {history.map((h: any) => (
                <div key={h.entry_id} className="group">
                    <div className="flex items-center gap-4 px-6 py-4 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors" onClick={() => toggleExpand(h.entry_id)}>
                        <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500/10 to-emerald-600/20 flex items-center justify-center text-emerald-600">
                            <CheckCircle className="w-5 h-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-0.5">
                                <span className="font-bold text-slate-800 dark:text-slate-100">Entry #{h.entry_id}</span>
                                <Badge className="text-[10px] px-1.5 py-0 bg-primary/10 text-primary border-primary/20">{getSheetTypeLabel(h.sheet_type)}</Badge>
                            </div>
                            <div className="flex items-center gap-3 text-xs text-slate-500">
                                <span className="flex items-center gap-1"><User className="w-3 h-3" />{h.supervisor_name || "—"}</span>
                                <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{h.entry_date ? new Date(h.entry_date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—"}</span>
                            </div>
                        </div>
                        <div className="flex items-center gap-3 text-xs">
                            <div className="flex items-center gap-1.5">
                                {h.activities_pushed > 0 && <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200">{h.activities_pushed} ✓</Badge>}
                                {h.activities_failed > 0 && <Badge variant="outline" className="text-[10px] bg-red-50 text-red-700 border-red-200">{h.activities_failed} ✗</Badge>}
                                {h.activities_skipped > 0 && <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 border-amber-200">{h.activities_skipped} ⊘</Badge>}
                            </div>
                            <div className="text-right">
                                <p className="text-[10px] text-slate-400 uppercase tracking-wider">Pushed by</p>
                                <p className="font-semibold text-slate-600 dark:text-slate-300">{h.pushed_by_name || "System"}</p>
                            </div>
                            <div className="text-right min-w-[80px]">
                                <p className="text-[10px] text-slate-400 uppercase tracking-wider">Pushed at</p>
                                <p className="font-semibold text-slate-600 dark:text-slate-300">{h.pushed_at ? new Date(h.pushed_at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—"}</p>
                            </div>
                            {expandedId === h.entry_id ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                        </div>
                    </div>
                    {expandedId === h.entry_id && (
                        <div className="bg-slate-50/80 dark:bg-slate-800/30 border-t border-slate-200 dark:border-slate-700 px-6 py-4">
                            {auditLoading ? <p className="text-sm text-muted-foreground py-4 text-center">Loading audit detail...</p> : auditDetail.length === 0 ? <p className="text-sm text-muted-foreground py-4 text-center">No audit records for this push.</p> : (
                                <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
                                    <table className="w-full text-sm">
                                        <thead><tr className="bg-slate-100 dark:bg-slate-800 text-[11px] uppercase tracking-wider text-slate-500">
                                            <th className="px-3 py-2 text-left font-semibold">Activity</th>
                                            <th className="px-3 py-2 text-left font-semibold">Field</th>
                                            <th className="px-3 py-2 text-right font-semibold">Old Value</th>
                                            <th className="px-3 py-2 text-right font-semibold">New Value</th>
                                            <th className="px-3 py-2 text-center font-semibold">Status</th>
                                        </tr></thead>
                                        <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                                            {auditDetail.map((a: any) => (
                                                <tr key={a.id} className="hover:bg-white dark:hover:bg-slate-800/50">
                                                    <td className="px-3 py-2"><span className="font-medium text-slate-700 dark:text-slate-200">{a.activity_id || "—"}</span><br /><span className="text-[10px] text-slate-400">{(a.activity_name || "").substring(0, 40)}</span></td>
                                                    <td className="px-3 py-2 text-slate-600 dark:text-slate-300">{a.field_name}</td>
                                                    <td className="px-3 py-2 text-right font-mono text-red-600/70">{a.old_value || "0"}</td>
                                                    <td className="px-3 py-2 text-right font-mono text-emerald-600 font-semibold">{a.new_value || "0"}</td>
                                                    <td className="px-3 py-2 text-center">
                                                        {a.push_status === "success" ? <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-[10px]">Success</Badge>
                                                         : a.push_status === "failed" ? <Badge className="bg-red-100 text-red-700 border-red-200 text-[10px]">Failed</Badge>
                                                         : <Badge className="bg-amber-100 text-amber-700 border-amber-200 text-[10px]">{a.push_status}</Badge>}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            ))}
        </div>
    );
};

// ── Comparison Tab ────────────────────────────────────────────
const ComparisonTab: React.FC<{ projectId: string | number }> = ({ projectId }) => {
    const today = new Date().toISOString().split("T")[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];
    const [dateFrom, setDateFrom] = useState(yesterday);
    const [dateTo, setDateTo] = useState(today);
    const [data, setData] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);

    const fetchComparison = async () => {
        setLoading(true);
        const result = await getPushComparison(projectId, dateFrom, dateTo);
        setData(Array.isArray(result) ? result : []);
        setLoading(false);
    };

    useEffect(() => { fetchComparison(); }, []);

    const top10 = useMemo(() => [...data].sort((a, b) => Math.abs(b.variance) - Math.abs(a.variance)).slice(0, 10), [data]);

    return (
        <div className="px-6 py-4 space-y-4 h-full overflow-auto">
            <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">From</label>
                    <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="h-9 w-40" />
                </div>
                <div className="flex items-center gap-2">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">To</label>
                    <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="h-9 w-40" />
                </div>
                <Button onClick={fetchComparison} size="sm" className="h-9 gradient-adani text-white shadow-md">Compare</Button>
            </div>

            {loading ? <div className="text-center text-muted-foreground py-10">Loading comparison...</div> : data.length === 0 ? <div className="text-center text-muted-foreground py-10">No progress data found for selected dates.</div> : (
                <>
                    <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
                        <table className="w-full text-sm">
                            <thead><tr className="bg-slate-100 dark:bg-slate-800 text-[11px] uppercase tracking-wider text-slate-500">
                                <th className="px-3 py-2 text-left font-semibold">Activity</th>
                                <th className="px-3 py-2 text-right font-semibold">Cumulative ({dateFrom.slice(5)})</th>
                                <th className="px-3 py-2 text-right font-semibold">Cumulative ({dateTo.slice(5)})</th>
                                <th className="px-3 py-2 text-right font-semibold">Δ Variance</th>
                                <th className="px-3 py-2 text-right font-semibold">Today ({dateFrom.slice(5)})</th>
                                <th className="px-3 py-2 text-right font-semibold">Today ({dateTo.slice(5)})</th>
                            </tr></thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                                {data.map((r: any) => (
                                    <tr key={r.activity_id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                                        <td className="px-3 py-2"><span className="font-medium text-slate-700 dark:text-slate-200">{r.activity_id}</span><br /><span className="text-[10px] text-slate-400 truncate block max-w-[200px]">{r.activity_name?.substring(0, 45)}</span></td>
                                        <td className="px-3 py-2 text-right font-mono">{r.from_cumulative || 0}</td>
                                        <td className="px-3 py-2 text-right font-mono">{r.to_cumulative || 0}</td>
                                        <td className={`px-3 py-2 text-right font-mono font-bold ${r.variance > 0 ? "text-emerald-600" : r.variance < 0 ? "text-red-600" : "text-slate-400"}`}>{r.variance > 0 ? "+" : ""}{r.variance}</td>
                                        <td className="px-3 py-2 text-right font-mono text-slate-500">{r.from_today || 0}</td>
                                        <td className="px-3 py-2 text-right font-mono text-slate-500">{r.to_today || 0}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    {top10.length > 0 && (
                        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
                            <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200 mb-3">Top Movers by Variance</h3>
                            <ResponsiveContainer width="100%" height={250}>
                                <BarChart data={top10} layout="vertical">
                                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                                    <XAxis type="number" {...axisProps} />
                                    <YAxis type="category" dataKey="activity_id" {...axisProps} width={90} />
                                    <Tooltip content={<CustomTooltip />} />
                                    <Bar dataKey="variance" name="Variance" radius={[0, 4, 4, 0]}>
                                        {top10.map((r: any, i: number) => <Cell key={i} fill={r.variance >= 0 ? CHART_COLORS.success : CHART_COLORS.danger} />)}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    )}
                </>
            )}
        </div>
    );
};

// ── Analytics Tab ─────────────────────────────────────────────
const AnalyticsTab: React.FC<{ projectId: string | number }> = ({ projectId }) => {
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        getPushAnalytics(projectId).then(d => { setData(d); setLoading(false); });
    }, [projectId]);

    if (loading) return <div className="flex items-center justify-center py-20 text-muted-foreground"><Clock className="w-5 h-5 animate-spin mr-2" /> Loading analytics...</div>;
    if (!data) return <div className="text-center py-20 text-muted-foreground">No analytics data available.</div>;

    const { push_timeline = [], sheet_breakdown = [], cumulative_progress = [], success_rate = { success: 0, failed: 0, skipped: 0 } } = data;
    const totalOps = success_rate.success + success_rate.failed + success_rate.skipped;
    const successPct = totalOps > 0 ? Math.round((success_rate.success / totalOps) * 100) : 0;
    const rateData = [
        { name: "Success", value: success_rate.success },
        { name: "Failed", value: success_rate.failed },
        { name: "Skipped", value: success_rate.skipped },
    ].filter(d => d.value > 0);

    return (
        <div className="px-6 py-4 space-y-6 h-full overflow-auto">
            {/* KPI Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Total Pushes</p>
                    <p className="text-2xl font-bold text-slate-800 dark:text-slate-100">{push_timeline.reduce((s: number, t: any) => s + t.count, 0)}</p>
                </div>
                <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Sheet Types</p>
                    <p className="text-2xl font-bold text-slate-800 dark:text-slate-100">{sheet_breakdown.length}</p>
                </div>
                <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Success Rate</p>
                    <p className="text-2xl font-bold text-emerald-600">{successPct}%</p>
                </div>
                <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Activities Tracked</p>
                    <p className="text-2xl font-bold text-slate-800 dark:text-slate-100">{cumulative_progress.length > 0 ? cumulative_progress[cumulative_progress.length - 1].activity_count : 0}</p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Push Frequency */}
                <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
                    <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200 mb-3 flex items-center gap-2"><TrendingUp className="w-4 h-4 text-primary" />Push Frequency (30 days)</h3>
                    {push_timeline.length > 0 ? (
                        <ResponsiveContainer width="100%" height={200}>
                            <AreaChart data={push_timeline}>
                                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                                <XAxis dataKey="date" {...axisProps} tickFormatter={(v: string) => v.slice(5)} />
                                <YAxis {...axisProps} />
                                <Tooltip content={<CustomTooltip />} />
                                <Area type="monotone" dataKey="count" name="Pushes" stroke={CHART_COLORS.primary} fill={CHART_COLORS.primary} fillOpacity={0.15} strokeWidth={2} />
                            </AreaChart>
                        </ResponsiveContainer>
                    ) : <p className="text-sm text-muted-foreground text-center py-8">No push data in last 30 days.</p>}
                </div>

                {/* Success Rate Donut */}
                <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
                    <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200 mb-3 flex items-center gap-2"><PieIcon className="w-4 h-4 text-secondary" />Push Success Rate</h3>
                    {totalOps > 0 ? (
                        <ResponsiveContainer width="100%" height={200}>
                            <PieChart>
                                <Pie data={rateData} cx="50%" cy="50%" innerRadius={55} outerRadius={80} paddingAngle={3} dataKey="value">
                                    {rateData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                                </Pie>
                                <Tooltip content={<CustomTooltip />} />
                                <Legend />
                            </PieChart>
                        </ResponsiveContainer>
                    ) : <p className="text-sm text-muted-foreground text-center py-8">No audit data available.</p>}
                </div>

                {/* Cumulative Progress Trend */}
                <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
                    <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200 mb-3 flex items-center gap-2"><TrendingUp className="w-4 h-4 text-success" />Cumulative Progress Trend</h3>
                    {cumulative_progress.length > 0 ? (
                        <ResponsiveContainer width="100%" height={200}>
                            <LineChart data={cumulative_progress}>
                                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                                <XAxis dataKey="date" {...axisProps} tickFormatter={(v: string) => v.slice(5)} />
                                <YAxis {...axisProps} />
                                <Tooltip content={<CustomTooltip />} />
                                <Line type="monotone" dataKey="total_cumulative" name="Cumulative" stroke={CHART_COLORS.success} strokeWidth={2} dot={false} />
                            </LineChart>
                        </ResponsiveContainer>
                    ) : <p className="text-sm text-muted-foreground text-center py-8">No progress data available.</p>}
                </div>

                {/* Sheet Type Breakdown */}
                <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
                    <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200 mb-3 flex items-center gap-2"><BarChart3 className="w-4 h-4 text-warning" />Sheet Type Breakdown</h3>
                    {sheet_breakdown.length > 0 ? (
                        <ResponsiveContainer width="100%" height={200}>
                            <BarChart data={sheet_breakdown.map((s: any) => ({ ...s, label: getSheetTypeLabel(s.sheet_type) }))}>
                                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                                <XAxis dataKey="label" {...axisProps} />
                                <YAxis {...axisProps} />
                                <Tooltip content={<CustomTooltip />} />
                                <Bar dataKey="total_pushed" name="Pushed" radius={[4, 4, 0, 0]}>
                                    {sheet_breakdown.map((_: any, i: number) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    ) : <p className="text-sm text-muted-foreground text-center py-8">No sheet breakdown data.</p>}
                </div>
            </div>
        </div>
    );
};

// ── Main Modal ────────────────────────────────────────────────
export const PMAGSnapshotModal: React.FC<Props> = ({ isOpen, onClose, projectId }) => {
    const [activeTab, setActiveTab] = useState<TabId>("history");

    useEffect(() => { if (!isOpen) setActiveTab("history"); }, [isOpen]);

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-w-[100vw] w-screen h-screen max-h-screen p-0 m-0 border-none rounded-none shadow-none flex flex-col bg-background">
                {/* Header */}
                <div className="px-6 py-4 gradient-adani text-white flex items-center justify-between shadow-lg z-10 border-b border-white/10 shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-white/10 rounded-xl backdrop-blur-md"><History className="w-5 h-5 text-white" /></div>
                        <div>
                            <h2 className="text-lg font-bold tracking-tight">P6 Push Snapshot</h2>
                            <p className="text-[10px] text-white/50 uppercase tracking-widest font-bold">HISTORY • COMPARISON • ANALYTICS</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        {TABS.map(t => (
                            <button key={t.id} onClick={() => setActiveTab(t.id)}
                                className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${activeTab === t.id ? "bg-white text-primary shadow-md" : "text-white/80 hover:bg-white/10"}`}>
                                {t.icon}{t.label}
                            </button>
                        ))}
                        <Button variant="ghost" size="icon" onClick={onClose} className="rounded-full hover:bg-white/10 text-white/70 hover:text-white ml-2">
                            <X className="w-5 h-5" />
                        </Button>
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-hidden bg-slate-50/50 dark:bg-slate-950">
                    <div className="h-full overflow-auto scrollbar-thin">
                        {activeTab === "history" && <HistoryTab projectId={projectId} />}
                        {activeTab === "comparison" && <ComparisonTab projectId={projectId} />}
                        {activeTab === "analytics" && <AnalyticsTab projectId={projectId} />}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
};
