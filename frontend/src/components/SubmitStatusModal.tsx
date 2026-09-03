import React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, Loader2, Circle, Send, Save, ListChecks, UploadCloud } from "lucide-react";

export type SubmitStepState = "pending" | "running" | "done" | "failed" | "skipped";

export interface SubmitStep {
  key: string;
  label: string;
  state: SubmitStepState;
  detail?: string;
}

export interface SubmitStatusRow {
  activityId: string;
  description: string;
  todayValue: string;
  cumulative: string;
  /** 'p6' for a P6-backed activity, 'dpr' for a DPR-level (custom) one. */
  source: "p6" | "dpr";
  /** Which cells the user changed, so the sheet can say what it is actually sending. */
  changedFields: string[];
}

/** Which operation the modal is narrating. Only affects wording and the header icon. */
export type SubmitStatusMode = "save" | "submit" | "push";

interface SubmitStatusModalProps {
  isOpen: boolean;
  onClose: () => void;
  mode?: SubmitStatusMode;
  sheetLabel: string;
  reportDate: string;
  entryId?: number | null;
  steps: SubmitStep[];
  rows: SubmitStatusRow[];
  error?: string | null;
  isFinished: boolean;
}

const StepIcon: React.FC<{ state: SubmitStepState }> = ({ state }) => {
  if (state === "running") return <Loader2 className="w-4 h-4 animate-spin text-blue-600 shrink-0" />;
  if (state === "done") return <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />;
  if (state === "failed") return <XCircle className="w-4 h-4 text-red-600 shrink-0" />;
  return <Circle className="w-4 h-4 text-slate-300 dark:text-slate-600 shrink-0" />;
};

/**
 * What a submit is actually doing, while it does it.
 *
 * Submitting used to report itself with a toast that appeared only once the whole thing had
 * finished: on a large sheet that is a long, silent wait with nothing on screen but the old
 * "Submitted" chip, and no way to tell whether the sheet had gone, which rows went with it, or
 * whether a row the user had just typed into was included at all. This lists the rows being sent -
 * by activity id, with the values and the fields that changed - and marks off each stage as it
 * completes, so a supervisor can see exactly what left their sheet and a failure says which stage
 * broke rather than just "Failed to submit entry".
 */
const MODE_COPY: Record<SubmitStatusMode, { verb: string; noun: string; Icon: any; tint: string }> = {
  save:   { verb: "Saving",     noun: "saved",     Icon: Save,        tint: "text-emerald-600" },
  submit: { verb: "Submitting", noun: "submitted", Icon: Send,        tint: "text-blue-600" },
  push:   { verb: "Pushing",    noun: "pushed",    Icon: UploadCloud, tint: "text-violet-600" },
};

export const SubmitStatusModal: React.FC<SubmitStatusModalProps> = ({
  isOpen,
  onClose,
  mode = "submit",
  sheetLabel,
  reportDate,
  entryId,
  steps,
  rows,
  error,
  isFinished,
}) => {
  const p6Count = rows.filter((r) => r.source === "p6").length;
  const dprCount = rows.length - p6Count;
  const copy = MODE_COPY[mode] ?? MODE_COPY.submit;
  const HeaderIcon = copy.Icon;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open && isFinished) onClose(); }}>
      <DialogContent className="max-w-3xl w-[95%] rounded-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <HeaderIcon className={`w-4 h-4 ${copy.tint}`} />
            {copy.verb} {sheetLabel}
          </DialogTitle>
          <DialogDescription>
            Report date {reportDate}
            {entryId ? ` · entry #${entryId}` : ""} · {rows.length} row{rows.length === 1 ? "" : "s"} being {copy.noun}
            {rows.length > 0 && (
              <> ({p6Count} P6{dprCount > 0 ? `, ${dprCount} DPR-level` : ""})</>
            )}
          </DialogDescription>
        </DialogHeader>

        {/* ── Stages ───────────────────────────────────────────── */}
        <div className="rounded-lg border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-800">
          {steps.map((s) => (
            <div key={s.key} className="flex items-center gap-3 px-3 py-2 text-sm">
              <StepIcon state={s.state} />
              <span
                className={
                  s.state === "done"
                    ? "text-slate-700 dark:text-slate-200"
                    : s.state === "failed"
                    ? "text-red-600 font-medium"
                    : s.state === "running"
                    ? "text-slate-900 dark:text-slate-50 font-medium"
                    : "text-slate-400 dark:text-slate-500"
                }
              >
                {s.label}
              </span>
              {s.detail && (
                <span className="ml-auto text-xs text-slate-500 dark:text-slate-400 truncate max-w-[45%]">
                  {s.detail}
                </span>
              )}
            </div>
          ))}
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/40 px-3 py-2 text-sm text-red-700 dark:text-red-300">
            {error}
          </div>
        )}

        {/* ── What is being sent ───────────────────────────────── */}
        <div className="min-h-0">
          <div className="flex items-center gap-2 mb-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wide">
            <ListChecks className="w-3.5 h-3.5" />
            Rows included
          </div>

          {rows.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-300 dark:border-slate-700 px-3 py-6 text-center text-sm text-slate-500">
              No changed rows detected — the sheet is being {copy.noun} as it already stands.
            </div>
          ) : (
            <div className="max-h-[38vh] overflow-auto rounded-lg border border-slate-200 dark:border-slate-700">
              <table className="w-full text-xs border-collapse">
                <thead className="sticky top-0 z-10 bg-slate-100 dark:bg-slate-800">
                  <tr className="text-left text-slate-600 dark:text-slate-300">
                    <th className="px-2 py-1.5 font-semibold whitespace-nowrap">Activity ID</th>
                    <th className="px-2 py-1.5 font-semibold">Description</th>
                    <th className="px-2 py-1.5 font-semibold text-right whitespace-nowrap">Today</th>
                    <th className="px-2 py-1.5 font-semibold text-right whitespace-nowrap">Cumulative</th>
                    <th className="px-2 py-1.5 font-semibold whitespace-nowrap">Changed</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr
                      key={`${r.activityId}-${i}`}
                      className={i % 2 ? "bg-slate-50/60 dark:bg-slate-900/40" : ""}
                    >
                      <td className="px-2 py-1.5 font-mono whitespace-nowrap align-top">
                        <span className="text-slate-800 dark:text-slate-100">{r.activityId || "—"}</span>
                        {r.source === "dpr" && (
                          <span className="ml-1.5 rounded px-1 py-0.5 text-[10px] font-sans font-semibold bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200">
                            DPR
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-1.5 align-top text-slate-700 dark:text-slate-300 max-w-[22rem] truncate" title={r.description}>
                        {r.description || "—"}
                      </td>
                      <td className="px-2 py-1.5 text-right align-top tabular-nums">{r.todayValue || "—"}</td>
                      <td className="px-2 py-1.5 text-right align-top tabular-nums">{r.cumulative || "—"}</td>
                      <td className="px-2 py-1.5 align-top text-slate-500 dark:text-slate-400 max-w-[14rem] truncate" title={r.changedFields.join(", ")}>
                        {r.changedFields.length ? r.changedFields.join(", ") : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={!isFinished}>
            {isFinished ? "Close" : (
              <span className="flex items-center gap-2">
                <Save className="w-3.5 h-3.5" /> Working…
              </span>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
