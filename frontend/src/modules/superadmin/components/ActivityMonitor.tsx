import React, { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
    Activity, AlertTriangle, Clock, LogIn, LogOut, RefreshCw, Search, Users, XCircle,
} from "lucide-react";
import { toast } from "sonner";
import api from "@/services/apiClient";

type Tab = "online" | "sessions" | "audit";

/** Short device label from a raw User-Agent string. */
const describeDevice = (ua?: string | null): string => {
    if (!ua) return "-";
    const browser =
        /Edg\//.test(ua) ? "Edge" :
        /Chrome\//.test(ua) ? "Chrome" :
        /Firefox\//.test(ua) ? "Firefox" :
        /Safari\//.test(ua) ? "Safari" : "Browser";
    const os =
        /Windows/.test(ua) ? "Windows" :
        /Macintosh|Mac OS/.test(ua) ? "macOS" :
        /Android/.test(ua) ? "Android" :
        /iPhone|iPad/.test(ua) ? "iOS" :
        /Linux/.test(ua) ? "Linux" : "";
    return os ? `${browser} · ${os}` : browser;
};

const formatDateTime = (value?: string | null) =>
    value ? new Date(value).toLocaleString("en-GB", {
        day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
    }) : "-";

/** "5m ago", "2h ago" - easier to scan than an absolute time for presence. */
const timeAgo = (value?: string | null): string => {
    if (!value) return "-";
    const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
    if (seconds < 60) return "just now";
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
};

const formatDuration = (seconds?: number): string => {
    if (!seconds || seconds < 0) return "-";
    if (seconds < 60) return `${Math.round(seconds)}s`;
    const m = Math.floor(seconds / 60);
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    return `${h}h ${m % 60}m`;
};

const LOGOUT_REASONS: Record<string, { label: string; className: string }> = {
    USER_LOGOUT: { label: "Signed out", className: "bg-slate-500 hover:bg-slate-500" },
    REVOKED: { label: "Revoked", className: "bg-amber-600 hover:bg-amber-600" },
    EXPIRED: { label: "Expired", className: "bg-slate-400 hover:bg-slate-400" },
    IDLE_TIMEOUT: { label: "Timed out", className: "bg-slate-400 hover:bg-slate-400" },
    ADMIN_TERMINATED: { label: "Terminated by admin", className: "bg-red-600 hover:bg-red-600" },
};

const FAILURE_ACTIONS = new Set(["LOGIN_FAILED", "OTP_FAILED", "ACCOUNT_LOCKED", "PASSWORD_EXPIRED"]);

/**
 * Super Admin > Activity.
 *
 * Three views over the same access data:
 *   Online Now     - who is signed in and active at this moment
 *   Login History  - when each person signed in and out, from where
 *   Audit Log      - who did what, to whom, and whether it succeeded
 *
 * Covers SSO and email users alike: this is access tracking, not part of the
 * email password lifecycle.
 */
export const ActivityMonitor: React.FC = () => {
    const [tab, setTab] = useState<Tab>("online");
    const [summary, setSummary] = useState<any>(null);
    const [loading, setLoading] = useState(false);

    const [online, setOnline] = useState<any[]>([]);
    const [sessions, setSessions] = useState<any[]>([]);
    const [audit, setAudit] = useState<any[]>([]);

    const [days, setDays] = useState("7");
    const [auditAction, setAuditAction] = useState("all");
    const [auditResult, setAuditResult] = useState("all");
    const [search, setSearch] = useState("");
    const [autoRefresh, setAutoRefresh] = useState(true);

    const loadSummary = useCallback(async () => {
        try {
            const { data } = await api.get("/super-admin/activity/summary");
            setSummary(data);
        } catch {
            /* the tiles are informational; a failure just leaves them blank */
        }
    }, []);

    const loadTab = useCallback(async () => {
        setLoading(true);
        try {
            if (tab === "online") {
                const { data } = await api.get("/super-admin/activity/online");
                setOnline(data.users || []);
            } else if (tab === "sessions") {
                const { data } = await api.get("/super-admin/activity/sessions", {
                    params: { days: Number(days), limit: 200 },
                });
                setSessions(data.items || []);
            } else {
                const { data } = await api.get("/super-admin/activity/audit", {
                    params: {
                        days: Number(days), limit: 200,
                        action: auditAction !== "all" ? auditAction : undefined,
                        result: auditResult !== "all" ? auditResult : undefined,
                        q: search || undefined,
                    },
                });
                setAudit(data.items || []);
            }
        } catch (err) {
            toast.error("Could not load activity data");
        } finally {
            setLoading(false);
        }
    }, [tab, days, auditAction, auditResult, search]);

    useEffect(() => { void loadSummary(); }, [loadSummary]);

    useEffect(() => {
        const timer = setTimeout(loadTab, search ? 350 : 0);
        return () => clearTimeout(timer);
    }, [loadTab, search]);

    // Presence goes stale quickly, so the Online tab polls while it is open.
    useEffect(() => {
        if (!autoRefresh || tab !== "online") return;
        const interval = setInterval(() => { void loadTab(); void loadSummary(); }, 30000);
        return () => clearInterval(interval);
    }, [autoRefresh, tab, loadTab, loadSummary]);

    const handleTerminate = async (sessionId: string, name: string) => {
        try {
            await api.post(`/super-admin/activity/sessions/${sessionId}/terminate`);
            toast.success(`Session for ${name} terminated`);
            void loadTab();
            void loadSummary();
        } catch {
            toast.error("Could not terminate the session");
        }
    };

    const tiles = [
        { label: "Online Now", value: summary?.onlineNow ?? "-", icon: Users,
          hint: `active in the last ${summary?.onlineWindowMinutes ?? 5} min`, accent: "text-green-600" },
        { label: "Logins (24h)", value: summary?.loginsLast24h ?? "-", icon: LogIn,
          hint: `${summary?.distinctUsersLast24h ?? 0} distinct users`, accent: "text-blue-600" },
        { label: "Active Users (7d)", value: summary?.distinctUsersLast7d ?? "-", icon: Activity,
          hint: "signed in this week", accent: "text-purple-600" },
        { label: "Failed Logins (24h)", value: summary?.failedLoginsLast24h ?? "-", icon: AlertTriangle,
          hint: `${summary?.neverLoggedIn ?? 0} never signed in`, accent: "text-amber-600" },
    ];

    return (
        <div className="space-y-4">
            {/* ── Headline tiles ────────────────────────────────── */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {tiles.map(({ label, value, icon: Icon, hint, accent }) => (
                    <Card key={label}>
                        <CardContent className="flex items-center gap-3 p-4">
                            <Icon className={`h-8 w-8 shrink-0 ${accent}`} aria-hidden />
                            <div className="min-w-0">
                                <p className="text-2xl font-semibold leading-none">{value}</p>
                                <p className="mt-1 text-xs font-medium">{label}</p>
                                <p className="text-[11px] text-muted-foreground">{hint}</p>
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>

            <Card>
                <CardHeader className="pb-3">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                            <CardTitle>Activity &amp; Access</CardTitle>
                            <CardDescription>
                                Who is online, when people signed in and out, and who did what.
                            </CardDescription>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            {tab !== "online" && (
                                <Select value={days} onValueChange={setDays}>
                                    <SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="1">Last 24 hours</SelectItem>
                                        <SelectItem value="7">Last 7 days</SelectItem>
                                        <SelectItem value="30">Last 30 days</SelectItem>
                                        <SelectItem value="90">Last 90 days</SelectItem>
                                    </SelectContent>
                                </Select>
                            )}
                            {tab === "online" && (
                                <Button
                                    variant={autoRefresh ? "default" : "outline"}
                                    size="sm"
                                    onClick={() => setAutoRefresh((v) => !v)}
                                    title="Refresh the online list every 30 seconds"
                                >
                                    <Clock className="mr-1.5 h-3.5 w-3.5" />
                                    Auto {autoRefresh ? "on" : "off"}
                                </Button>
                            )}
                            <Button variant="outline" size="sm" onClick={() => { void loadTab(); void loadSummary(); }}>
                                <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
                                Refresh
                            </Button>
                        </div>
                    </div>

                    {/* ── View switcher ─────────────────────────────── */}
                    <div className="mt-3 flex gap-1 rounded-lg bg-muted/50 p-1">
                        {([
                            ["online", "Online Now", Users],
                            ["sessions", "Login History", LogIn],
                            ["audit", "Audit Log", Activity],
                        ] as [Tab, string, any][]).map(([key, label, Icon]) => (
                            <button
                                key={key}
                                type="button"
                                onClick={() => setTab(key)}
                                className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                                    tab === key ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"
                                }`}
                            >
                                <Icon className="h-3.5 w-3.5" />
                                {label}
                                {key === "online" && summary?.onlineNow > 0 && (
                                    <span className="ml-1 rounded-full bg-green-600 px-1.5 text-[10px] font-bold text-white">
                                        {summary.onlineNow}
                                    </span>
                                )}
                            </button>
                        ))}
                    </div>

                    {tab === "audit" && (
                        <div className="mt-3 flex flex-wrap gap-2">
                            <div className="relative min-w-[200px] flex-1">
                                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                                <Input
                                    placeholder="Search user, action or details..."
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    className="pl-8"
                                />
                            </div>
                            <Select value={auditAction} onValueChange={setAuditAction}>
                                <SelectTrigger className="w-[190px]"><SelectValue placeholder="Action" /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All actions</SelectItem>
                                    <SelectItem value="LOGIN_SUCCESS">Login success</SelectItem>
                                    <SelectItem value="LOGIN_FAILED">Login failed</SelectItem>
                                    <SelectItem value="LOGOUT">Logout</SelectItem>
                                    <SelectItem value="PASSWORD_CHANGED">Password changed</SelectItem>
                                    <SelectItem value="PASSWORD_RESET">Password reset</SelectItem>
                                    <SelectItem value="ACCOUNT_LOCKED">Account locked</SelectItem>
                                    <SelectItem value="ACCOUNT_UNLOCKED">Account unlocked</SelectItem>
                                    <SelectItem value="USER_CREATED">User created</SelectItem>
                                    <SelectItem value="ROLE_CHANGED">Role changed</SelectItem>
                                    <SelectItem value="USER_ACTIVATED">User activated</SelectItem>
                                    <SelectItem value="USER_DEACTIVATED">User deactivated</SelectItem>
                                    <SelectItem value="SESSION_TERMINATED">Session terminated</SelectItem>
                                </SelectContent>
                            </Select>
                            <Select value={auditResult} onValueChange={setAuditResult}>
                                <SelectTrigger className="w-[130px]"><SelectValue placeholder="Result" /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All results</SelectItem>
                                    <SelectItem value="SUCCESS">Success</SelectItem>
                                    <SelectItem value="FAILURE">Failure</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    )}
                </CardHeader>

                <CardContent>
                    {loading ? (
                        <div className="flex h-40 items-center justify-center text-muted-foreground">
                            <RefreshCw className="mr-2 h-5 w-5 animate-spin" /> Loading...
                        </div>
                    ) : tab === "online" ? (
                        online.length === 0 ? (
                            <div className="flex h-40 flex-col items-center justify-center gap-1 text-muted-foreground">
                                <Users className="h-8 w-8 opacity-40" />
                                <span>Nobody is signed in right now.</span>
                            </div>
                        ) : (
                            <div className="overflow-x-auto rounded-md border">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>User</TableHead>
                                            <TableHead>Role</TableHead>
                                            <TableHead>Auth Type</TableHead>
                                            <TableHead>Online Since</TableHead>
                                            <TableHead>Last Activity</TableHead>
                                            <TableHead>Sessions</TableHead>
                                            <TableHead>IP Address</TableHead>
                                            <TableHead>Device</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {online.map((u) => (
                                            <TableRow key={u.ObjectId}>
                                                <TableCell>
                                                    <div className="flex items-center gap-2">
                                                        <span className="relative flex h-2 w-2">
                                                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-500 opacity-75" />
                                                            <span className="relative inline-flex h-2 w-2 rounded-full bg-green-600" />
                                                        </span>
                                                        <div>
                                                            <p className="font-medium leading-tight">{u.Name}</p>
                                                            <p className="text-xs text-muted-foreground">{u.Email}</p>
                                                        </div>
                                                    </div>
                                                </TableCell>
                                                <TableCell><Badge variant="outline">{u.Role}</Badge></TableCell>
                                                <TableCell>
                                                    <Badge className={u.AuthenticationType === "SSO"
                                                        ? "bg-[#0B74B0] hover:bg-[#0B74B0]" : "bg-slate-600 hover:bg-slate-600"}>
                                                        {u.AuthenticationType}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className="whitespace-nowrap text-xs">{formatDateTime(u.OnlineSince)}</TableCell>
                                                <TableCell className="whitespace-nowrap text-xs text-green-600 dark:text-green-400">
                                                    {timeAgo(u.LastSeenAt)}
                                                </TableCell>
                                                <TableCell className="text-xs">{u.Sessions}</TableCell>
                                                <TableCell className="font-mono text-xs text-muted-foreground">{u.IpAddress || "-"}</TableCell>
                                                <TableCell className="text-xs text-muted-foreground">{describeDevice(u.Device)}</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                        )
                    ) : tab === "sessions" ? (
                        sessions.length === 0 ? (
                            <div className="flex h-40 items-center justify-center text-muted-foreground">
                                No logins in this period.
                            </div>
                        ) : (
                            <div className="overflow-x-auto rounded-md border">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>User</TableHead>
                                            <TableHead>Auth Type</TableHead>
                                            <TableHead>Logged In</TableHead>
                                            <TableHead>Logged Out</TableHead>
                                            <TableHead>Duration</TableHead>
                                            <TableHead>Status</TableHead>
                                            <TableHead>IP Address</TableHead>
                                            <TableHead>Device</TableHead>
                                            <TableHead className="text-right">Actions</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {sessions.map((s) => {
                                            const reason = s.LogoutReason ? LOGOUT_REASONS[s.LogoutReason] : null;
                                            return (
                                                <TableRow key={s.SessionId}>
                                                    <TableCell>
                                                        <p className="font-medium leading-tight">{s.Name}</p>
                                                        <p className="text-xs text-muted-foreground">{s.Email}</p>
                                                    </TableCell>
                                                    <TableCell>
                                                        <Badge className={s.AuthenticationType === "SSO"
                                                            ? "bg-[#0B74B0] hover:bg-[#0B74B0]" : "bg-slate-600 hover:bg-slate-600"}>
                                                            {s.AuthenticationType || "EMAIL"}
                                                        </Badge>
                                                    </TableCell>
                                                    <TableCell className="whitespace-nowrap text-xs">
                                                        <span className="flex items-center gap-1">
                                                            <LogIn className="h-3 w-3 text-green-600" />
                                                            {formatDateTime(s.LoginAt)}
                                                        </span>
                                                    </TableCell>
                                                    <TableCell className="whitespace-nowrap text-xs">
                                                        {s.LogoutAt ? (
                                                            <span className="flex items-center gap-1">
                                                                <LogOut className="h-3 w-3 text-slate-500" />
                                                                {formatDateTime(s.LogoutAt)}
                                                            </span>
                                                        ) : (
                                                            <span className="text-muted-foreground">Still signed in</span>
                                                        )}
                                                    </TableCell>
                                                    <TableCell className="text-xs">{formatDuration(s.DurationSeconds)}</TableCell>
                                                    <TableCell>
                                                        {s.IsOnline ? (
                                                            <Badge className="bg-green-600 hover:bg-green-600">Active</Badge>
                                                        ) : (
                                                            <Badge className={reason?.className || "bg-slate-400 hover:bg-slate-400"}>
                                                                {reason?.label || "Ended"}
                                                            </Badge>
                                                        )}
                                                    </TableCell>
                                                    <TableCell className="font-mono text-xs text-muted-foreground">{s.IpAddress || "-"}</TableCell>
                                                    <TableCell className="text-xs text-muted-foreground">{describeDevice(s.Device)}</TableCell>
                                                    <TableCell className="text-right">
                                                        {s.IsOnline && (
                                                            <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                className="text-red-600 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-900/20"
                                                                title="Sign this session out"
                                                                onClick={() => handleTerminate(s.SessionId, s.Name)}
                                                            >
                                                                <XCircle className="h-4 w-4" />
                                                            </Button>
                                                        )}
                                                    </TableCell>
                                                </TableRow>
                                            );
                                        })}
                                    </TableBody>
                                </Table>
                            </div>
                        )
                    ) : audit.length === 0 ? (
                        <div className="flex h-40 items-center justify-center text-muted-foreground">
                            No matching activity in this period.
                        </div>
                    ) : (
                        <div className="overflow-x-auto rounded-md border">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>When</TableHead>
                                        <TableHead>Action</TableHead>
                                        <TableHead>Performed By</TableHead>
                                        <TableHead>Target</TableHead>
                                        <TableHead>Result</TableHead>
                                        <TableHead>IP Address</TableHead>
                                        <TableHead>Device</TableHead>
                                        <TableHead>Details</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {audit.map((e) => (
                                        <TableRow key={e.id}>
                                            <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                                                {formatDateTime(e.timestamp)}
                                            </TableCell>
                                            <TableCell>
                                                <span className="font-mono text-xs font-medium">{e.action}</span>
                                            </TableCell>
                                            <TableCell className="text-xs">
                                                <p className="font-medium">{e.performedBy}</p>
                                                {e.performedByEmail && (
                                                    <p className="text-muted-foreground">{e.performedByEmail}</p>
                                                )}
                                            </TableCell>
                                            <TableCell className="text-xs">{e.target || "-"}</TableCell>
                                            <TableCell>
                                                <Badge
                                                    variant={e.result === "FAILURE" || FAILURE_ACTIONS.has(e.action)
                                                        ? "destructive" : "secondary"}
                                                    className="text-[10px]"
                                                >
                                                    {e.result}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="font-mono text-xs text-muted-foreground">{e.ipAddress || "-"}</TableCell>
                                            <TableCell className="text-xs text-muted-foreground">{describeDevice(e.device)}</TableCell>
                                            <TableCell className="max-w-[280px] text-xs text-muted-foreground">{e.remarks || "-"}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    )}

                    <p className="mt-3 text-xs text-muted-foreground">
                        Audit records never contain passwords, one-time codes or reset secrets.
                        Terminating a session revokes its refresh token; deactivate the user as well
                        for an immediate cut-off.
                    </p>
                </CardContent>
            </Card>
        </div>
    );
};

export default ActivityMonitor;
