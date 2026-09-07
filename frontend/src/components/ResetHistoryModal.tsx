import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ShieldAlert, Loader2, Trash2, AlertTriangle } from "lucide-react";
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

/**
 * Clears the recorded daily-progress history for one project type.
 *
 * This deletes work people entered, so the dialog is built to make that impossible to do by
 * accident: nothing happens until a preview has been fetched and read, the figure that actually
 * changes on screen is stated plainly, and the operator has to type the project type to proceed.
 * The server enforces the same rules again - this dialog is the explanation, not the guard.
 */
export const ResetHistoryModal = ({ isOpen, onClose }: Props) => {
    const [projectType, setProjectType] = useState<string>("solar");
    const [preview, setPreview] = useState<DailyProgressPurgePreview | null>(null);
    const [loading, setLoading] = useState(false);
    const [applying, setApplying] = useState(false);
    const [confirmText, setConfirmText] = useState("");

    // Re-preview whenever the target changes: a count from the previously selected type would be
    // the most dangerous thing this dialog could show.
    useEffect(() => {
        if (!isOpen) return;
        let cancelled = false;
        setPreview(null);
        setConfirmText("");
        setLoading(true);
        previewDailyProgressPurge(projectType)
            .then((p) => { if (!cancelled) setPreview(p); })
            .catch(() => { if (!cancelled) toast.error("Could not read the current history"); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [isOpen, projectType]);

    const handleApply = async () => {
        setApplying(true);
        try {
            const res = await applyDailyProgressPurge(projectType, confirmText.trim().toLowerCase());
            toast.success(`Cleared ${res.rowsDeleted ?? 0} rows of ${projectType} history`);
            onClose();
        } catch (e: any) {
            toast.error(e?.response?.data?.detail?.message || "Failed to clear history");
        } finally {
            setApplying(false);
        }
    };

    const nothingToDo = !!preview && preview.rowsSelected === 0;
    const canApply = !!preview && !nothingToDo && confirmText.trim().toLowerCase() === projectType;

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-w-lg">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <ShieldAlert className="w-5 h-5 text-destructive" />
                        Reset Recorded History
                    </DialogTitle>
                </DialogHeader>

                <div className="space-y-4 py-1">
                    <p className="text-sm text-muted-foreground">
                        Deletes every recorded daily-progress value for one project type, so tracking
                        restarts from P6's figure. Completed stays as P6 reports it; only progress
                        entered on site and not yet pushed is lost.
                    </p>

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

                    {loading ? (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground py-6">
                            <Loader2 className="w-4 h-4 animate-spin" /> Reading current history...
                        </div>
                    ) : preview ? (
                        <div className="rounded-lg border border-slate-200 dark:border-slate-700 divide-y text-sm">
                            <Row label="Rows to delete" value={preview.rowsSelected.toLocaleString()} />
                            <Row label="Activities affected" value={preview.activities.toLocaleString()} />
                            <Row
                                label="Date range"
                                value={preview.earliest ? `${preview.earliest} to ${preview.latest}` : "—"}
                            />
                            <Row
                                label="Activities whose Completed drops"
                                value={preview.activitiesWhoseCompletedDrops.toLocaleString()}
                                emphasis={preview.activitiesWhoseCompletedDrops > 0}
                            />
                            <Row
                                label="Units removed from Completed"
                                value={preview.unitsRemovedFromCompleted.toLocaleString()}
                                emphasis={preview.unitsRemovedFromCompleted > 0}
                            />
                        </div>
                    ) : null}

                    {nothingToDo && (
                        <p className="text-sm text-emerald-700 dark:text-emerald-400">
                            No recorded history for {projectType.toUpperCase()} — nothing to clear.
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
                                    Type <span className="font-mono text-destructive">{projectType}</span> to confirm
                                </label>
                                <Input
                                    value={confirmText}
                                    onChange={(e) => setConfirmText(e.target.value)}
                                    placeholder={projectType}
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
    <div className="flex items-center justify-between px-3 py-2">
        <span className="text-muted-foreground">{label}</span>
        <span className={emphasis ? "font-bold text-destructive" : "font-semibold"}>{value}</span>
    </div>
);
