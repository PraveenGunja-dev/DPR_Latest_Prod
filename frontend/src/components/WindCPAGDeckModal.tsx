import React, { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose } from "@/components/ui/dialog";
import { Loader2, X, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { WindCPAGDeckView } from "@/modules/supervisor/components/wind/WindCPAGDeckView";
import { getWindProgressActivities, getEDEngineeringData, getEDOrderingData, getEDDeliveryData } from "@/services/p6ActivityService";
import { getProjectById } from "@/services/projectService";
import {
  WindCpagReportData, getDefaultReportData, loadStoredReportData, saveStoredReportData,
  aggregateConstructionFromP6, aggregateProcurementFromP6,
} from "@/utils/windCpagReport";
import { exportWindCpagToPpt } from "@/utils/windCpagPptExport";

interface WindCPAGDeckModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId?: string | number;
  projectName?: string;
}

const avgPercent = (rows: any[]): number | null => {
  if (!rows || rows.length === 0) return null;
  const values = rows.map((r) => parseFloat(r.percent_complete ?? r.percentComplete) || 0);
  const scale = Math.max(0, ...values) <= 1 ? 100 : 1;
  const avg = values.reduce((s, v) => s + v, 0) / values.length;
  return avg * scale;
};

export const WindCPAGDeckModal: React.FC<WindCPAGDeckModalProps> = ({ isOpen, onClose, projectId, projectName }) => {
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [windActivities, setWindActivities] = useState<any[]>([]);
  const [engineeringData, setEngineeringData] = useState<any[]>([]);
  const [orderingData, setOrderingData] = useState<any[]>([]);
  const [deliveryData, setDeliveryData] = useState<any[]>([]);
  const [resolvedName, setResolvedName] = useState<string>(projectName || "");
  const [reportData, setReportData] = useState<WindCpagReportData | null>(null);

  useEffect(() => {
    if (!isOpen || !projectId) return;

    window.history.pushState({ modal: "wind-cpag" }, "");
    const handlePopState = () => onClose();
    window.addEventListener("popstate", handlePopState);

    setLoading(true);
    const fetchAll = async () => {
      try {
        const [progress, eng, ord, del, proj] = await Promise.all([
          getWindProgressActivities(projectId).catch(() => ({ data: [] } as any)),
          getEDEngineeringData(projectId).catch(() => ({ data: [] } as any)),
          getEDOrderingData(projectId).catch(() => ({ data: [] } as any)),
          getEDDeliveryData(projectId).catch(() => ({ data: [] } as any)),
          getProjectById(projectId as any).catch(() => null),
        ]);
        setWindActivities(progress?.data || []);
        setEngineeringData(eng?.data || []);
        setOrderingData(ord?.data || []);
        setDeliveryData(del?.data || []);

        const name = (proj as any)?.name || (proj as any)?.Name || projectName || "";
        const location = (proj as any)?.location || (proj as any)?.Location || "";
        setResolvedName(name);

        const stored = loadStoredReportData(projectId);
        const base = getDefaultReportData(name, location);
        // siteLayout.imageDataUrl needs the same care as meta: a session from before the default
        // site layout map existed would have saved an empty string for it, and spreading that
        // straight over base would permanently hide the new default behind stale localStorage -
        // same class of bug as the procurement package list. Only let a real saved image win.
        const mergedSiteLayout = stored?.siteLayout
          ? { ...base.siteLayout, ...stored.siteLayout, imageDataUrl: stored.siteLayout.imageDataUrl || base.siteLayout.imageDataUrl }
          : base.siteLayout;
        setReportData(stored
          ? ({ ...base, ...stored, meta: { ...base.meta, ...stored.meta }, siteLayout: mergedSiteLayout } as WindCpagReportData)
          : base);
      } catch (err) {
        console.error("Error fetching Wind CPAG report data", err);
      } finally {
        setLoading(false);
      }
    };
    fetchAll();

    return () => window.removeEventListener("popstate", handlePopState);
  }, [isOpen, projectId, projectName, onClose]);

  const p6ConstructionRows = useMemo(() => aggregateConstructionFromP6(windActivities), [windActivities]);
  const p6ProcurementRows = useMemo(() => aggregateProcurementFromP6(orderingData, deliveryData), [orderingData, deliveryData]);
  const gapAnalysisPct = useMemo(() => {
    const constructionRows = aggregateConstructionFromP6(windActivities);
    const scopeSum = constructionRows.reduce((s, r) => s + (Number(r.scope) || 0), 0);
    const completedSum = constructionRows.reduce((s, r) => s + (Number(r.completed) || 0), 0);
    return {
      engineering: avgPercent(engineeringData),
      procurement: avgPercent(orderingData),
      construction: scopeSum > 0 ? (completedSum / scopeSum) * 100 : null,
    };
  }, [windActivities, engineeringData, orderingData]);

  const handleReportChange = (updater: (prev: WindCpagReportData) => WindCpagReportData) => {
    setReportData((prev) => {
      if (!prev) return prev;
      const next = updater(prev);
      if (projectId) saveStoredReportData(projectId, next);
      return next;
    });
  };

  const handleDownload = async () => {
    if (!reportData) return;
    setDownloading(true);
    try {
      await exportWindCpagToPpt(reportData, resolvedName || projectName || "Wind Project");
    } catch (err) {
      console.error("Failed to export Wind CPAG PPT", err);
      toast.error("Failed to generate PPT. Please try again.");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-[100vw] w-screen h-screen max-h-screen flex flex-col p-0 gap-0 overflow-hidden bg-slate-50 border-0 rounded-none sm:rounded-none">
        <DialogHeader className="px-6 py-4 border-b bg-white flex flex-row items-center justify-between shadow-sm shrink-0">
          <div className="flex items-center gap-3">
            <DialogTitle className="text-xl text-[#7030a0] font-bold">CPAG Energy Report{resolvedName ? ` - ${resolvedName}` : ""}</DialogTitle>
            <Button
              variant="ghost"
              size="icon"
              className="rounded-full text-[#7030a0] hover:bg-[#7030a0]/10"
              onClick={handleDownload}
              disabled={downloading || loading || !reportData}
              title="Download as PPT"
            >
              {downloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            </Button>
          </div>
          <DialogClose className="rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground">
            <X className="h-5 w-5 text-slate-500" />
            <span className="sr-only">Close</span>
          </DialogClose>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto bg-slate-100/50">
          {loading || !reportData ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="w-8 h-8 animate-spin text-[#7030a0]" />
              <span className="ml-2 text-slate-500 font-medium">Loading report data...</span>
            </div>
          ) : (
            <WindCPAGDeckView
              projectName={resolvedName || projectName || ""}
              p6ConstructionRows={p6ConstructionRows}
              p6ProcurementRows={p6ProcurementRows}
              gapAnalysisPct={gapAnalysisPct}
              manpowerActual={{}}
              reportData={reportData}
              onChange={handleReportChange}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
