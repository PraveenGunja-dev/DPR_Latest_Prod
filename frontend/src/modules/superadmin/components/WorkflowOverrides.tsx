import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { RefreshCw, Search, RotateCcw, CheckCircle2, ShieldCheck, XCircle } from 'lucide-react';
import api from '@/services/apiClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface WorkflowEntry {
  id: number;
  projectId: number;
  projectName: string | null;
  p6Id: string | null;
  sheetType: string;
  entryDate: string;
  status: string;
  submittedAt: string | null;
  updatedAt: string | null;
  reviewedAt: string | null;
  reviewedBy: string | null;
  rejectionReason: string | null;
  supervisorId: number | null;
  submittedBy: string | null;
  submittedByEmail: string | null;
}

type OverrideAction = 'reopen' | 'approve_pm' | 'final_approve' | 'reject';

const STATUS_LABEL: Record<string, string> = {
  submitted_to_pm: 'Submitted to PM',
  approved_by_pm: 'Approved by PM',
  rejected_by_pm: 'Rejected by PM',
  rejected_by_pmag: 'Rejected by PMAG',
  final_approved: 'Final Approved',
  draft: 'Draft',
};

const STATUS_CLASS: Record<string, string> = {
  submitted_to_pm: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  approved_by_pm: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
  rejected_by_pm: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
  rejected_by_pmag: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
  final_approved: 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300',
};

// Which overrides make sense from each status. The Super Admin can always send an entry back;
// pushing it forward is offered only for the stage it is actually waiting at.
const ACTIONS_FOR_STATUS: Record<string, OverrideAction[]> = {
  submitted_to_pm: ['approve_pm', 'final_approve', 'reject', 'reopen'],
  approved_by_pm: ['final_approve', 'reject', 'reopen'],
  rejected_by_pm: ['approve_pm', 'final_approve', 'reopen'],
  rejected_by_pmag: ['approve_pm', 'final_approve', 'reopen'],
  final_approved: ['reject', 'reopen'],
};

const ACTION_META: Record<OverrideAction, { label: string; icon: React.ReactNode; needsReason: boolean; tone: string }> = {
  approve_pm: { label: 'Approve (as PM)', icon: <CheckCircle2 className="w-4 h-4" />, needsReason: false, tone: 'text-emerald-700 hover:bg-emerald-50 dark:text-emerald-300 dark:hover:bg-emerald-900/30' },
  final_approve: { label: 'Final Approve', icon: <ShieldCheck className="w-4 h-4" />, needsReason: false, tone: 'text-purple-700 hover:bg-purple-50 dark:text-purple-300 dark:hover:bg-purple-900/30' },
  reject: { label: 'Reject', icon: <XCircle className="w-4 h-4" />, needsReason: true, tone: 'text-red-700 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-900/30' },
  reopen: { label: 'Reopen', icon: <RotateCcw className="w-4 h-4" />, needsReason: true, tone: 'text-amber-700 hover:bg-amber-50 dark:text-amber-300 dark:hover:bg-amber-900/30' },
};

const fmtDate = (v: string | null | undefined, withTime = false) => {
  if (!v) return '—';
  const d = new Date(v);
  if (isNaN(d.getTime())) return String(v);
  return withTime
    ? d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

const sheetLabel = (t: string) => (t || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

/**
 * Super Admin › Workflow Overrides. Lists every entry inside the review workflow and lets the
 * administrator force it forward, send it back, or reopen it - each override is snapshotted,
 * written to the system log and notified to the supervisor by the backend.
 */
export const WorkflowOverrides: React.FC = () => {
  const [entries, setEntries] = useState<WorkflowEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('all');
  const [days, setDays] = useState('60');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [pending, setPending] = useState<{ entry: WorkflowEntry; action: OverrideAction } | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params: Record<string, any> = { days, limit: 300 };
      if (status !== 'all') params.status = status;
      if (debouncedSearch) params.search = debouncedSearch;
      const res = await api.get('/super-admin/workflow/entries', { params });
      setEntries(Array.isArray(res.data) ? res.data : []);
    } catch (e: any) {
      setError(e?.response?.data?.detail?.message || e?.response?.data?.message || 'Failed to load workflow entries');
    } finally {
      setLoading(false);
    }
  }, [status, days, debouncedSearch]);

  useEffect(() => { load(); }, [load]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    entries.forEach(e => { c[e.status] = (c[e.status] || 0) + 1; });
    return c;
  }, [entries]);

  const runOverride = async () => {
    if (!pending) return;
    const meta = ACTION_META[pending.action];
    if (meta.needsReason && !reason.trim()) {
      toast.error('Please give a reason - the supervisor will see it.');
      return;
    }
    setBusy(true);
    try {
      const res = await api.post(`/super-admin/workflow/entries/${pending.entry.id}/override`, {
        action: pending.action,
        reason: reason.trim(),
      });
      toast.success(res.data?.message || 'Override applied');
      setPending(null);
      setReason('');
      await load();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail?.message || e?.response?.data?.message || 'Override failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <CardTitle>Workflow Overrides</CardTitle>
          <CardDescription>
            Entries in the review workflow. Force one forward, send it back, or reopen it for the supervisor — every override is logged and the supervisor is notified.
          </CardDescription>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Project, supervisor, sheet or entry #" className="pl-8 w-64" />
          </div>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-44"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {Object.entries(STATUS_LABEL).filter(([k]) => k !== 'draft').map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}{counts[k] ? ` (${counts[k]})` : ''}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={days} onValueChange={setDays}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="60">Last 60 days</SelectItem>
              <SelectItem value="180">Last 6 months</SelectItem>
              <SelectItem value="0">All time</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-1 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Entry</TableHead>
                <TableHead>Project</TableHead>
                <TableHead>Sheet</TableHead>
                <TableHead>Report date</TableHead>
                <TableHead>Submitted by</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last change</TableHead>
                <TableHead className="text-right">Override</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && entries.length === 0 && (
                <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">Loading…</TableCell></TableRow>
              )}
              {!loading && entries.length === 0 && (
                <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">No entries in the workflow for this filter.</TableCell></TableRow>
              )}
              {entries.map(e => (
                <TableRow key={e.id}>
                  <TableCell className="font-mono text-xs">#{e.id}</TableCell>
                  <TableCell>
                    <div className="font-medium leading-tight">{e.projectName || e.projectId}</div>
                    {e.p6Id && <div className="text-[11px] text-muted-foreground">{e.p6Id}</div>}
                  </TableCell>
                  <TableCell>{sheetLabel(e.sheetType)}</TableCell>
                  <TableCell>{fmtDate(e.entryDate)}</TableCell>
                  <TableCell>
                    <div className="leading-tight">{e.submittedBy || '—'}</div>
                    {e.submittedByEmail && <div className="text-[11px] text-muted-foreground">{e.submittedByEmail}</div>}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className={STATUS_CLASS[e.status] || ''}>{STATUS_LABEL[e.status] || e.status}</Badge>
                    {e.rejectionReason && (
                      <div className="text-[11px] text-muted-foreground mt-1 max-w-[220px] truncate" title={e.rejectionReason}>{e.rejectionReason}</div>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="text-xs">{fmtDate(e.updatedAt, true)}</div>
                    {e.reviewedBy && <div className="text-[11px] text-muted-foreground">by {e.reviewedBy}</div>}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1 flex-wrap">
                      {(ACTIONS_FOR_STATUS[e.status] || []).map(a => (
                        <Button
                          key={a}
                          variant="ghost"
                          size="sm"
                          className={`h-8 px-2 ${ACTION_META[a].tone}`}
                          title={ACTION_META[a].label}
                          onClick={() => { setPending({ entry: e, action: a }); setReason(''); }}
                        >
                          {ACTION_META[a].icon}
                          <span className="ml-1 text-xs">{ACTION_META[a].label}</span>
                        </Button>
                      ))}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>

      {pending && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => !busy && setPending(null)}>
          <div className="bg-card text-card-foreground border border-border rounded-lg p-6 w-full max-w-md shadow-xl" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold mb-1">{ACTION_META[pending.action].label}</h2>
            <p className="text-sm text-muted-foreground mb-4">
              Entry <span className="font-mono">#{pending.entry.id}</span> · {sheetLabel(pending.entry.sheetType)} · {fmtDate(pending.entry.entryDate)} · {pending.entry.projectName}
              <br />
              Current status: <strong>{STATUS_LABEL[pending.entry.status] || pending.entry.status}</strong>
            </p>
            <label className="block text-sm font-medium mb-1">
              Reason {ACTION_META[pending.action].needsReason ? <span className="text-red-500">*</span> : <span className="text-muted-foreground">(optional)</span>}
            </label>
            <textarea
              className="w-full p-2 border rounded bg-background"
              rows={3}
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="Shown to the supervisor in their notification and kept in the audit log"
              autoFocus
            />
            <div className="flex justify-end gap-2 mt-4">
              <Button variant="outline" onClick={() => setPending(null)} disabled={busy}>Cancel</Button>
              <Button onClick={runOverride} disabled={busy}>
                {busy ? 'Applying…' : `Confirm ${ACTION_META[pending.action].label}`}
              </Button>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
};
