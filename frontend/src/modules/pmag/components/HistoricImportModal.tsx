// src/modules/pmag/components/HistoricImportModal.tsx
//
// PMAG dashboard "Import History" - upload a legacy tracking workbook, preview exactly what it
// would write, and only then commit it. See historicImportService.ts and the backend's
// app/services/excel_historic_import_service.py for what "DP Vendor PV Area", "DP Vendor IDT" and
// "Manpower Details" are matched against and written - this component is purely the upload ->
// preview -> confirm -> result flow around that.
import React, { useCallback, useRef, useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { showConfirm } from "@/components/AppDialog";
import {
  UploadCloud,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Loader2,
  X,
  ArrowLeft,
} from "lucide-react";
import { toast } from "sonner";
import {
  previewHistoricImport,
  commitHistoricImport,
  HistoricImportReport,
  HistoricImportCommitResult,
  HistoricImportIssueLogReport,
} from "@/services/historicImportService";

interface HistoricImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string | number;
  projectName?: string;
}

type Stage = "select" | "previewing" | "report" | "committing" | "done" | "error";

const PREVIEW_MESSAGES = [
  "Reading workbook sheets...",
  "Matching activities against this project...",
  "Checking DP Vendor PV Area...",
  "Checking DP Vendor IDT...",
  "Checking Manpower Details...",
  "Building the report...",
];
const COMMIT_MESSAGES = [
  "Writing daily progress records...",
  "Updating vendor / block / priority...",
  "Almost done...",
];

const FIELD_LABELS: Record<string, string> = {
  block: "Block",
  priority: "Priority",
  baselinePriority: "Baseline Priority",
  contractorName: "Contractor / Vendor",
  holdDueToWtg: "Hold Due to WTG",
  front: "Front",
  remarks: "Remarks",
  scope: "Scope",
};

/** Cycles through a list of messages every ~1.6s while `active` is true - an honest stand-in for
 * real progress on a single request/response call that has no intermediate status to poll. */
function useCyclingMessage(messages: string[], active: boolean): string {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    if (!active) {
      setIdx(0);
      return;
    }
    const t = setInterval(() => setIdx((i) => (i + 1) % messages.length), 1600);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, messages.length]);
  return messages[idx];
}

export const HistoricImportModal: React.FC<HistoricImportModalProps> = ({
  isOpen,
  onClose,
  projectId,
  projectName,
}) => {
  const [stage, setStage] = useState<Stage>("select");
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [report, setReport] = useState<HistoricImportReport | null>(null);
  const [result, setResult] = useState<HistoricImportCommitResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>("");
  const inputRef = useRef<HTMLInputElement>(null);

  const previewMsg = useCyclingMessage(PREVIEW_MESSAGES, stage === "previewing");
  const commitMsg = useCyclingMessage(COMMIT_MESSAGES, stage === "committing");

  const reset = useCallback(() => {
    setStage("select");
    setFile(null);
    setReport(null);
    setResult(null);
    setErrorMessage("");
  }, []);

  const handleClose = useCallback(() => {
    // A running preview/commit is a live request in flight - closing the dialog does not cancel
    // it, so block the close rather than let the user lose track of an import that is still
    // happening.
    if (stage === "previewing" || stage === "committing") return;
    reset();
    onClose();
  }, [stage, reset, onClose]);

  const pickFile = useCallback((f: File | null) => {
    if (!f) return;
    if (!/\.(xlsx|xlsm)$/i.test(f.name)) {
      toast.error("Only .xlsx / .xlsm workbooks are supported.");
      return;
    }
    setFile(f);
  }, []);

  const runPreview = useCallback(async () => {
    if (!file) return;
    setStage("previewing");
    setErrorMessage("");
    try {
      const r = await previewHistoricImport(projectId, file);
      setReport(r);
      setStage("report");
    } catch (e: any) {
      setErrorMessage(e?.response?.data?.detail?.message || e?.message || "Could not read this workbook.");
      setStage("error");
    }
  }, [file, projectId]);

  const runCommit = useCallback(async () => {
    if (!report) return;
    const totalWrites =
      report.totals.dailyProgressRowsToWrite +
      report.totals.metadataUpdatesToWrite +
      report.totals.issuesToCreate;
    const ok = await showConfirm(
      `This will write ${report.totals.dailyProgressRowsToWrite.toLocaleString()} daily progress ` +
        `record(s), update ${report.totals.metadataUpdatesToWrite.toLocaleString()} activit${report.totals.metadataUpdatesToWrite === 1 ? "y" : "ies"}' ` +
        `Block / Priority / Vendor / Scope details, and create ${report.totals.issuesToCreate.toLocaleString()} ` +
        `issue log entr${report.totals.issuesToCreate === 1 ? "y" : "ies"} for ${report.projectName}.\n\n` +
        `Schedule fields (dates, status, % complete) are never touched. This action writes to the ` +
        `live database and cannot be undone from here.`,
      { title: "Confirm historic data import", tone: "warning", confirmLabel: "Import now", cancelLabel: "Cancel" },
    );
    if (!ok || totalWrites === 0) return;

    setStage("committing");
    try {
      const r = await commitHistoricImport(report.importId);
      setResult(r);
      setStage("done");
    } catch (e: any) {
      setErrorMessage(
        e?.response?.data?.detail?.message || e?.message || "Import failed while writing to the database.",
      );
      setStage("error");
    }
  }, [report]);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      if (stage !== "select") return;
      pickFile(e.dataTransfer.files?.[0] || null);
    },
    [stage, pickFile],
  );

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-2xl p-0 flex flex-col overflow-hidden max-h-[85vh]">
        <DialogHeader className="gradient-adani px-6 py-4 flex-shrink-0 border-b border-white/10 relative">
          <DialogTitle className="text-white pr-8 flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5" />
            Import History
          </DialogTitle>
          <DialogDescription className="text-white/80 pr-8">
            {projectName ? `Backfill historic daily progress for ${projectName}` : "Backfill historic daily progress from a legacy tracking workbook"}
          </DialogDescription>
          {stage !== "previewing" && stage !== "committing" && (
            <button
              onClick={handleClose}
              className="absolute right-4 top-4 text-white hover:bg-white/20 p-1 rounded-sm opacity-70 hover:opacity-100 transition-all outline-none"
              title="Close"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </DialogHeader>

        <div className="p-6 overflow-y-auto">
          {stage === "select" && (
            <div className="space-y-4">
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={onDrop}
                onClick={() => inputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-10 flex flex-col items-center justify-center gap-3 cursor-pointer transition-colors ${
                  dragOver ? "border-primary bg-primary/5" : "border-gray-300 dark:border-gray-700 hover:border-primary/60"
                }`}
              >
                <UploadCloud className="w-10 h-10 text-muted-foreground" />
                {file ? (
                  <div className="text-center">
                    <p className="font-medium">{file.name}</p>
                    <p className="text-xs text-muted-foreground">{(file.size / 1024 / 1024).toFixed(1)} MB</p>
                  </div>
                ) : (
                  <div className="text-center">
                    <p className="font-medium">Drop the workbook here, or click to browse</p>
                    <p className="text-xs text-muted-foreground mt-1">.xlsx / .xlsm - looks for "DP Vendor PV Area", "DP Vendor IDT", "Manpower Details" and "Issue log Register" sheets</p>
                  </div>
                )}
                <input
                  ref={inputRef}
                  type="file"
                  accept=".xlsx,.xlsm"
                  className="hidden"
                  onChange={(e) => pickFile(e.target.files?.[0] || null)}
                />
              </div>

              <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 rounded-lg p-3 text-sm text-blue-800 dark:text-blue-300 flex gap-2">
                <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>
                  Nothing is written yet. You'll see the full match report - counts, duplicates, gaps - and have to
                  confirm before anything is saved.
                </span>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={handleClose}>Cancel</Button>
                <Button disabled={!file} onClick={runPreview} className="gradient-adani text-white">
                  Preview Import
                </Button>
              </div>
            </div>
          )}

          {stage === "previewing" && (
            <div className="flex flex-col items-center justify-center py-14 gap-4">
              <Loader2 className="w-10 h-10 text-primary animate-spin" />
              <p className="text-sm text-muted-foreground">{previewMsg}</p>
              <Progress value={100} className="w-full max-w-xs h-1.5 animate-pulse" />
            </div>
          )}

          {stage === "report" && report && <ReportView report={report} />}

          {stage === "committing" && (
            <div className="flex flex-col items-center justify-center py-14 gap-4">
              <Loader2 className="w-10 h-10 text-primary animate-spin" />
              <p className="text-sm text-muted-foreground">{commitMsg}</p>
              <Progress value={100} className="w-full max-w-xs h-1.5 animate-pulse" />
            </div>
          )}

          {stage === "done" && result && report && <DoneView result={result} report={report} />}

          {stage === "error" && (
            <div className="flex flex-col items-center justify-center py-10 gap-3 text-center">
              <XCircle className="w-10 h-10 text-red-500" />
              <p className="font-medium">Something went wrong</p>
              <p className="text-sm text-muted-foreground max-w-md">{errorMessage}</p>
            </div>
          )}
        </div>

        {(stage === "report" || stage === "error" || stage === "done") && (
          <div className="border-t px-6 py-4 flex justify-between items-center flex-shrink-0 bg-gray-50 dark:bg-zinc-900/50">
            {stage === "report" ? (
              <>
                <Button variant="ghost" onClick={reset} className="flex items-center gap-1.5">
                  <ArrowLeft className="w-4 h-4" /> Choose a different file
                </Button>
                <Button
                  onClick={runCommit}
                  disabled={
                    report.projectMismatch ||
                    report.totals.dailyProgressRowsToWrite +
                      report.totals.metadataUpdatesToWrite +
                      report.totals.issuesToCreate === 0
                  }
                  title={report.projectMismatch ? "Wrong file for this project - nothing to import" : undefined}
                  className="gradient-adani text-white"
                >
                  Confirm & Import
                </Button>
              </>
            ) : stage === "error" ? (
              <>
                <Button variant="outline" onClick={reset}>Try again</Button>
                <Button variant="ghost" onClick={handleClose}>Close</Button>
              </>
            ) : (
              <div className="w-full flex justify-end">
                <Button onClick={handleClose} className="gradient-adani text-white">Done</Button>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

// ── Report (preview) view ───────────────────────────────────────────────────

const StatChip: React.FC<{ label: string; value: React.ReactNode; tone?: "default" | "amber" | "green" | "red" }> = ({
  label,
  value,
  tone = "default",
}) => {
  const toneClass =
    tone === "amber"
      ? "text-amber-700 dark:text-amber-400"
      : tone === "green"
      ? "text-green-700 dark:text-green-400"
      : tone === "red"
      ? "text-red-700 dark:text-red-400"
      : "text-foreground";
  return (
    <div className="flex flex-col">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={`text-lg font-semibold ${toneClass}`}>{value}</span>
    </div>
  );
};

const SheetCard: React.FC<{ sheet: HistoricImportReport["sheets"][number] }> = ({ sheet }) => {
  if (!sheet.found || sheet.note) {
    return (
      <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground flex items-start gap-2">
        <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5 text-amber-500" />
        <div>
          <p className="font-medium text-foreground">{sheet.sheetName}</p>
          <p>{sheet.note || "Not found in this workbook."}</p>
        </div>
      </div>
    );
  }
  const noMatches = (sheet.uniqueActivityIds ?? 0) > 0 && (sheet.matchedInDb ?? 0) === 0;
  return (
    <div className={`rounded-lg border p-4 space-y-3 ${noMatches ? "border-red-300 bg-red-50/50 dark:bg-red-950/20" : ""}`}>
      <div className="flex items-center justify-between">
        <p className="font-semibold flex items-center gap-2">
          {noMatches ? (
            <XCircle className="w-4 h-4 text-red-600" />
          ) : (
            <CheckCircle2 className="w-4 h-4 text-green-600" />
          )}
          {sheet.sheetName}
        </p>
        <span className="text-xs text-muted-foreground">
          {sheet.dailyDateRange?.from && sheet.dailyDateRange?.to
            ? `${sheet.dailyDateRange.from} → ${sheet.dailyDateRange.to}`
            : "no daily data"}
        </span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatChip label="Activities matched" value={`${sheet.matchedInDb ?? 0} / ${sheet.uniqueActivityIds ?? 0}`} tone={noMatches ? "red" : "green"} />
        <StatChip label="Daily rows to import" value={(sheet.dailyRowsToImport ?? 0).toLocaleString()} tone={noMatches ? "red" : "green"} />
        <StatChip label="Duplicates skipped" value={sheet.duplicatesSkipped ?? 0} tone={sheet.duplicatesSkipped ? "amber" : "default"} />
        <StatChip label="Blank vendor" value={sheet.blankVendorCount ?? 0} tone={sheet.blankVendorCount ? "amber" : "default"} />
      </div>
      {!!(sheet.unmatchedCount || 0) && (
        <p className="text-xs text-red-600">
          {sheet.unmatchedCount} activity ID(s) in this sheet don't exist in the project (e.g. {sheet.unmatchedSample?.join(", ")}) - skipped.
        </p>
      )}
      {!!(sheet.dailyRowsExcludedLiveOverlap || 0) && (
        <p className="text-xs text-amber-600">
          {sheet.dailyRowsExcludedLiveOverlap} day(s) skipped because the app already has a real entry on or after that date.
        </p>
      )}
    </div>
  );
};

const IssueLogCard: React.FC<{ issueLog: HistoricImportIssueLogReport }> = ({ issueLog }) => {
  if (!issueLog.found || issueLog.note) {
    return (
      <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground flex items-start gap-2">
        <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5 text-amber-500" />
        <div>
          <p className="font-medium text-foreground">{issueLog.sheetName}</p>
          <p>{issueLog.note || "Not found in this workbook."}</p>
        </div>
      </div>
    );
  }
  return (
    <div className="rounded-lg border p-4 space-y-3">
      <p className="font-semibold flex items-center gap-2">
        <CheckCircle2 className="w-4 h-4 text-green-600" />
        {issueLog.sheetName}
      </p>
      <div className="grid grid-cols-3 gap-3">
        <StatChip label="Hindrances found" value={issueLog.issuesFound ?? 0} tone="green" />
        <StatChip label="New to create" value={issueLog.issuesToImport ?? 0} tone="green" />
        <StatChip
          label="Already imported"
          value={issueLog.issuesAlreadyImported ?? 0}
          tone={issueLog.issuesAlreadyImported ? "amber" : "default"}
        />
      </div>
    </div>
  );
};

const ReportView: React.FC<{ report: HistoricImportReport }> = ({ report }) => {
  const fieldEntries = Object.entries(report.metadata.fieldsFilled || {});
  return (
    <div className="space-y-5">
      {report.projectMismatch && (
        <div className="rounded-xl border-2 border-red-400 bg-red-50 dark:bg-red-950/40 p-4 flex gap-3">
          <XCircle className="w-6 h-6 text-red-600 flex-shrink-0" />
          <div>
            <p className="font-semibold text-red-800 dark:text-red-300">This file doesn't match {report.projectName}</p>
            <p className="text-sm text-red-700 dark:text-red-400 mt-1">
              {report.mismatchMessage || "None of this workbook's activity IDs exist in the open project."}
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-3 gap-4 bg-primary/5 rounded-xl p-4 border border-primary/10">
        <StatChip label="Daily progress rows to write" value={report.totals.dailyProgressRowsToWrite.toLocaleString()} tone={report.projectMismatch ? "red" : "green"} />
        <StatChip label="Activities to update (Block/Priority/Vendor/Scope)" value={report.totals.metadataUpdatesToWrite.toLocaleString()} tone={report.projectMismatch ? "red" : "green"} />
        <StatChip label="Issue log entries to create" value={report.totals.issuesToCreate.toLocaleString()} tone={report.projectMismatch ? "red" : "green"} />
      </div>

      <div className="space-y-3">
        <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Sheets found</p>
        {report.sheets.map((s) => (
          <SheetCard key={s.sheetName} sheet={s} />
        ))}
        <IssueLogCard issueLog={report.issueLog} />
      </div>

      {fieldEntries.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Metadata fields being filled</p>
          <div className="flex flex-wrap gap-2">
            {fieldEntries.map(([field, count]) => (
              <span
                key={field}
                className="text-xs px-2.5 py-1 rounded-full bg-gray-100 dark:bg-zinc-800 border text-foreground/80"
              >
                {FIELD_LABELS[field] || field}: <span className="font-semibold">{count}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {report.warnings?.length > 0 && (
        <div className="space-y-2">
          {report.warnings.map((w, i) => (
            <div
              key={i}
              className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-lg p-3 text-sm text-amber-800 dark:text-amber-300 flex gap-2"
            >
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{w}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ── Done (result) view ──────────────────────────────────────────────────────

const DoneView: React.FC<{ result: HistoricImportCommitResult; report: HistoricImportReport }> = ({ result, report }) => (
  <div className="flex flex-col items-center text-center py-6 gap-5">
    <CheckCircle2 className="w-14 h-14 text-green-600" />
    <div>
      <p className="text-lg font-semibold">Import complete</p>
      <p className="text-sm text-muted-foreground">{report.projectName}</p>
    </div>
    <div className="grid grid-cols-3 gap-6">
      <StatChip label="Daily progress rows written" value={result.written.dailyProgressRows.toLocaleString()} tone="green" />
      <StatChip label="Activities updated" value={result.written.metadataUpdates.toLocaleString()} tone="green" />
      <StatChip label="Issues created" value={result.written.issuesCreated.toLocaleString()} tone="green" />
    </div>
    <p className="text-xs text-muted-foreground">Committed at {new Date(result.committedAt).toLocaleString()}</p>
  </div>
);

export default HistoricImportModal;
