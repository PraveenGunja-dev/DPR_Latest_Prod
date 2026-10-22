import React, { useCallback, useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { RefreshCw, FileSpreadsheet } from "lucide-react";
import { getLiveWindSheets, getTodayAndYesterday } from "@/services/dprService";
import { WindEHVTable } from "@/modules/supervisor/components/wind/WindEHVTable";
import { WindContractorManpowerTable } from "@/modules/supervisor/components/wind/WindContractorManpowerTable";
import { WindMachineryTable } from "@/modules/supervisor/components/wind/WindMachineryTable";

/**
 * Wind's EHV tracker, Manpower (Contractor) and Machinery sheets have no review workflow: the supervisor
 * never submits them and nobody approves them. This card is how Site PM and PMAG read them - each button
 * opens the latest saved version, read-only, with who saved it and when.
 */
const SHEETS: { type: string; label: string }[] = [
  { type: "wind_ehv", label: "EHV" },
  { type: "manpower_details_2", label: "Manpower (Contractor)" },
  { type: "wind_machinery", label: "Machinery" },
];

interface Props {
  projectId?: number | string | null;
}

const parseData = (entry: any) => {
  const raw = entry?.data_json;
  const data = typeof raw === "string" ? JSON.parse(raw) : raw;
  return data && !Array.isArray(data) ? data : { rows: Array.isArray(data) ? data : [] };
};

const formatWhen = (value?: string) => {
  if (!value) return "";
  const d = new Date(value);
  return isNaN(d.getTime())
    ? ""
    : d.toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
};

export const LiveWindSheets: React.FC<Props> = ({ projectId }) => {
  const [entries, setEntries] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const list = await getLiveWindSheets(projectId);
      const map: Record<string, any> = {};
      (list || []).forEach((e: any) => { map[e.sheet_type] = e; });
      setEntries(map);
    } catch (err) {
      console.error("Failed to load live Wind sheets:", err);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  const openEntry = open ? entries[open] : null;
  const data = openEntry ? parseData(openEntry) : null;
  const { today } = getTodayAndYesterday();

  return (
    <>
      <Card className="p-4 my-4 border border-slate-200 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-sm font-bold text-slate-800">Live Wind sheets</h3>
            <p className="text-xs text-slate-500">No submit or approval - you see what the supervisor last saved.</p>
          </div>
          <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-1.5 h-8">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {SHEETS.map(s => {
            const e = entries[s.type];
            return (
              <button
                key={s.type}
                disabled={!e}
                onClick={() => setOpen(s.type)}
                className="text-left rounded-lg border border-slate-200 p-3 hover:bg-slate-50 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
              >
                <div className="flex items-center gap-2 font-semibold text-sm text-slate-800">
                  <FileSpreadsheet className="w-4 h-4 text-primary" />
                  {s.label}
                </div>
                <div className="mt-1 text-[11px] text-slate-500">
                  {e
                    ? `Updated ${formatWhen(e.updated_at)}${e.supervisor_name ? ` by ${e.supervisor_name}` : ""}`
                    : loading ? "Loading..." : "Nothing entered yet"}
                </div>
              </button>
            );
          })}
        </div>
      </Card>

      <Dialog open={!!open} onOpenChange={(v) => { if (!v) setOpen(null); }}>
        <DialogContent className="max-w-[95vw] w-[95vw] max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {SHEETS.find(s => s.type === open)?.label} - live view
              {openEntry?.supervisor_name ? ` (last saved by ${openEntry.supervisor_name}, ${formatWhen(openEntry.updated_at)})` : ""}
            </DialogTitle>
          </DialogHeader>
          {open === "wind_ehv" && data && (
            <WindEHVTable data={[]} manualData={data.rows} setData={() => { }} onSave={() => { }} onSubmit={() => { }} isLocked={true} status="draft" />
          )}
          {open === "manpower_details_2" && data && (
            <WindContractorManpowerTable
              data={data.rows}
              setData={() => { }}
              isLocked={true}
              status="draft"
              today={data.staticHeader?.reportingDate || today}
            />
          )}
          {open === "wind_machinery" && data && (
            <WindMachineryTable data={data.rows} setData={() => { }} onSave={() => { }} onSubmit={() => { }} isLocked={true} status="draft" />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};
