import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ShieldAlert, Loader2, Trash2, AlertTriangle, Search } from "lucide-react";
import {
    previewDailyProgressPurge,
    applyDailyProgressPurge,
    type DailyProgressPurgePreview,
} from "@/services/dprService";
import { toast } from "sonner";

interface Props {
    isOpen: boolean;
    onClose: () => void;
}

const PROJECT_TYPES = ["solar", "wind", "pss", "bess"] as const;
type Scope = "type" | "project";

/**
 * Clears the recorded daily-progress history, either for a whole project type or for one project.
 *
 * This deletes work people entered, so the dialog is built to make that hard to do by accident:
 * nothing is offered until a preview has been fetched, the preview names the project it resolved
 * (an object id on its own is unreadable, and clearing the wrong site is the mistake worth
 * designing against), the figure that actually moves on screen is stated plainly, and the operator
 * has to type back exactly what is being cleared. The server enforces all of it again - this
 * dialog is the explanation, not the guard.
 */
export const ResetHistoryModal = ({ isOpen, onClose }: Props) => {
    const [scope, setScope] = useState<Scope>("type");
    const [projectType, setProjectType] = useState<string>("solar");
    const [projectIdInput, setProjectIdInput] = useState("");
    const [lookedUpId, setLookedUpId] = useState<string | null>(null);

    const [preview, setPreview] = useState<DailyProgressPurgePreview | null>(null);
    const [loading, setLoading] = useState(false);
    const [applying, setApplying] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [confirmText, setConfirmText] = useState("");

    const reset = () => { setPreview(null); setConfirmText(""); setError(null); };

    // Changing the target invalidates the preview immediately. A count left over from the
    // previously selected target is the most dangerous thing this dialog could show.
    useEffect(() => { reset(); setLookedUpId(null); }, [scope, projectType, projectIdInput]);

    // A project type previews on its own; a project waits for the operator to look it up, so a
    // half-typed object id never fires a request.
    useEffect(() => {
        if (!isOpen || scope !== "type") return;
        let cancelled = false;
        setLoading(true);
        previewDailyProgressPurge({ projectType })
            .then((p) => { if (!cancelled) setPreview(p); })
            .catch(() => { if (!cancelled) setError("Could not read the current history"); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [isOpen, scope, projectType]);

    useEffect(() => { if (!isOpen) { setScope("type"); setProjectIdInput(""); reset(); } }, [isOpen]);

    const lookUpProject = async () => {
        const id = projectIdInput.trim();
        if (!id) return;
        setLoading(true); setError(null);
        try {
            const p = await previewDailyProgressPurge({ projectId: id });
            setPreview(p);
            setLookedUpId(String(p.projectId ?? id));
        } catch (e: any) {
            setPreview(null);
            setError(e?.response?.data?.detail?.message || "Could not find that project");
        } finally {
            setLoading(false);
        }
    };

    const handleApply = async () => {
        setApplying(true);
        try {
            const target = scope === "project" ? { projectId: projectIdInput.trim() } : { projectType };
            const res = await applyDailyProgressPurge(target, confirmText.trim().toLowerCase());
            toast.success(
                `Cleared ${res.rowsDeleted ?? 0} rows` +
                (scope === "project" ? ` for ${res.projectName ?? "that project"}` : ` of ${projectType} history`)
            );
            onClose();
        } catch (e: any) {
            toast.error(e?.response?.data?.detail?.message || "Failed to clear history");
        } finally {
            setApplying(false);
        }
    };

    // What has to be typed back: the object id for one project, the type for a whole type.
    const expected = scope === "project" ? (lookedUpId ?? "") : projectType;
    const nothingToDo = !!preview && preview.rowsSelected === 0;
    const canApply =
        !!preview && !nothingToDo && !!expected &&
        confirmText.trim().toLowerCase() === expected.toLowerCase();

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <ShieldAlert className="w-5 h-5 text-destructive" />
                        Reset Recorded History
                    </DialogTitle>
                </DialogHeader>

                <div className="space-y-4 py-1">
                    <p className="text-sm text-muted-foreground">
                        Deletes recorded daily-progress values so tracking restarts from P6's figure.
                        Completed stays as P6 reports it; only progress entered on site and not yet
                        pushed is lost.
                    </p>

                    <div className="flex gap-2">
                        <Button
                            type="button" size="sm"
                            variant={scope === "type" ? "default" : "outline"}
                            onClick={() => setScope("type")}
                        >
                            Whole project type
                        </Button>
                        <Button
                            type="button" size="sm"
                            variant={scope === "project" ? "default" : "outline"}
                            onClick={() => setScope("project")}
                        >
                            One project
                        </Button>
                    </div>

                    {scope === "type" ? (
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                                Project type
                            </label>
                            <Select value={projectType} onValueChange={setProjectType}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    {PROJECT_TYPES.map(t => (
                                        <SelectItem key={t} value={t}>{t.toUpperCase()}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    ) : (
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                                Project object ID
                            </label>
                            <div className="flex gap-2">
                                <Input
                                    value={projectIdInput}
                                    onChange={(e) => setProjectIdInput(e.target.value)}
                                    placeholder="e.g. 3105"
                                    inputMode="numeric"
                                    autoComplete="off"
                                    onKeyDown={(e) => { if (e.key === "Enter") lookUpProject(); }}
                                />
                                <Button type="button" variant="outline" onClick={lookUpProject}
                                        disabled={!projectIdInput.trim() || loading} className="gap-1 shrink-0">
                                    <Search className="w-4 h-4" /> Look up
                                </Button>
                            </div>
                            <p className="text-[11px] text-muted-foreground mt-1">
                                Check the project name below before clearing anything.
                            </p>
                        </div>
                    )}

                    {error && <p className="text-sm text-destructive">{error}</p>}

                    {loading ? (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground py-6">
                            <Loader2 className="w-4 h-4 animate-spin" /> Reading current history...
                        </div>
                    ) : preview ? (
                        <div className="rounded-lg border border-slate-200 dark:border-slate-700 divide-y text-sm">
                            {preview.projectName && (
                                <Row label="Project" value={`${preview.projectName} (${preview.projectType})`} emphasis />
                            )}
                            <Row label="Rows to delete" value={preview.rowsSelected.toLocaleString()} />
                            <Row label="Activities affected" value={preview.activities.toLocaleString()} />
                            <Row label="Date range"
                                 value={preview.earliest ? `${preview.earliest} to ${preview.latest}` : "—"} />
                            <Row label="Activities whose Completed drops"
                                 value={preview.activitiesWhoseCompletedDrops.toLocaleString()}
                                 emphasis={preview.activitiesWhoseCompletedDrops > 0} />
                            <Row label="Units removed from Completed"
                                 value={preview.unitsRemovedFromCompleted.toLocaleString()}
                                 emphasis={preview.unitsRemovedFromCompleted > 0} />
                        </div>
                    ) : null}

                    {nothingToDo && (
                        <p className="text-sm text-emerald-700 dark:text-emerald-400">
                            No recorded history here — nothing to clear.
                        </p>
                    )}

                    {preview && !nothingToDo && (
                        <>
                            <div className="flex items-start gap-2 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 p-3">
                                <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
                                <p className="text-xs text-amber-800 dark:text-amber-300">
                                    Deleted rows are copied to <code>dpr_daily_progress_purge_backup</code> first,
                                    so this can be undone from the database — but not from this screen.
                                </p>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                                    Type <span className="font-mono text-destructive">{expected}</span> to confirm
                                </label>
                                <Input
                                    value={confirmText}
                                    onChange={(e) => setConfirmText(e.target.value)}
                                    placeholder={expected}
                                    autoComplete="off"
                                />
                            </div>
                        </>
                    )}
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={onClose} disabled={applying}>Cancel</Button>
                    <Button variant="destructive" onClick={handleApply} disabled={!canApply || applying} className="gap-2">
                        {applying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                        Clear history
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

const Row = ({ label, value, emphasis }: { label: string; value: string; emphasis?: boolean }) => (
    <div className="flex items-center justify-between px-3 py-2 gap-4">
        <span className="text-muted-foreground shrink-0">{label}</span>
        <span className={`text-right ${emphasis ? "font-bold text-destructive" : "font-semibold"}`}>{value}</span>
    </div>
);
