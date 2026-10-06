import React, { useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Trash2, Upload } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer,
  ComposedChart, Line
} from "recharts";
import {
  CPAG_COLORS, WindCpagReportData, ConstructionRow, ProcurementRow, CriticalIssueRow,
  nextNMonths, formatMonthLabel,
} from "@/utils/windCpagReport";

interface WindCPAGDeckViewProps {
  projectName: string;
  p6ConstructionRows: Pick<ConstructionRow, "activity" | "uom" | "scope" | "completed" | "balance" | "fromP6">[];
  p6ProcurementRows: Pick<ProcurementRow, "package" | "uom" | "scope" | "orderingCompleted" | "delivered" | "balance" | "fromP6">[];
  gapAnalysisPct: { engineering: number | null; procurement: number | null; construction: number | null };
  sCurveData: any[];
  manpowerActual: Record<string, string>;
  reportData: WindCpagReportData;
  onChange: (updater: (prev: WindCpagReportData) => WindCpagReportData) => void;
}

// ---------------------------------------------------------------------------
// Small editable building blocks - every cell in the deck is one of these so
// the whole report can be typed into directly, the same way the source PPT
// table is hand-edited every month.
// ---------------------------------------------------------------------------

const EditText: React.FC<{ value: string; onChange: (v: string) => void; className?: string; placeholder?: string; align?: "left" | "center" }> = ({ value, onChange, className = "", placeholder, align = "center" }) => (
  <input
    type="text"
    value={value}
    onChange={(e) => onChange(e.target.value)}
    placeholder={placeholder}
    className={`w-full bg-transparent outline-none focus:bg-blue-50 rounded px-1 py-0.5 ${align === "center" ? "text-center" : "text-left"} ${className}`}
  />
);

const EditArea: React.FC<{ value: string; onChange: (v: string) => void; className?: string; placeholder?: string; rows?: number }> = ({ value, onChange, className = "", placeholder, rows = 2 }) => (
  <textarea
    value={value}
    onChange={(e) => onChange(e.target.value)}
    placeholder={placeholder}
    rows={rows}
    className={`w-full bg-transparent outline-none focus:bg-blue-50 rounded px-1 py-0.5 resize-none text-left ${className}`}
  />
);

const Slide: React.FC<{ title: string; slideNumber: string; children: React.ReactNode }> = ({ title, slideNumber, children }) => (
  <Card className="w-full max-w-[1400px] mx-auto mb-10 shadow-lg border-2 border-slate-200 min-h-[600px] flex flex-col">
    <CardHeader className="bg-slate-50 border-b pb-4 shrink-0">
      <div className="flex justify-between items-center">
        <CardTitle className="text-2xl font-bold text-slate-800">{title}</CardTitle>
        <span className="text-base font-semibold text-slate-400">Slide {slideNumber}</span>
      </div>
    </CardHeader>
    <CardContent className="p-8 flex-1 flex flex-col bg-white overflow-x-auto">{children}</CardContent>
  </Card>
);

const th = (bg: string, extra = "") => `p-2 border border-slate-400 font-semibold text-center text-white text-xs ${extra}`;
const td = "p-1.5 border border-slate-300 text-xs";

export const WindCPAGDeckView: React.FC<WindCPAGDeckViewProps> = ({
  projectName,
  p6ConstructionRows,
  p6ProcurementRows,
  gapAnalysisPct,
  sCurveData,
  manpowerActual,
  reportData,
  onChange,
}) => {
  let slideNum = 1;

  // Fill construction rows with live P6 figures the first time they arrive (or whenever the
  // computed scope changes), without clobbering plan/rolling/target text the user already typed.
  const constructionSeeded = useRef(false);
  useEffect(() => {
    if (!p6ConstructionRows.some((r) => r.fromP6)) return;
    onChange((prev) => {
      const next = prev.construction.map((row) => {
        const p6 = p6ConstructionRows.find((r) => r.activity === row.activity) as any;
        if (!p6 || !p6.fromP6) return row;
        
        let changed = false;
        const nextRow = { ...row };
        
        if (p6.scope !== undefined && p6.scope !== row.scope) { nextRow.scope = p6.scope; changed = true; }
        if (p6.completed !== undefined && p6.completed !== row.completed) { nextRow.completed = p6.completed; changed = true; }
        if (p6.balance !== undefined && p6.balance !== row.balance) { nextRow.balance = p6.balance; changed = true; }
        
        if (p6.precedingPlan !== undefined && p6.precedingPlan !== "" && p6.precedingPlan !== row.precedingPlan) { nextRow.precedingPlan = p6.precedingPlan; changed = true; }
        if (p6.precedingActual !== undefined && p6.precedingActual !== "" && p6.precedingActual !== row.precedingActual) { nextRow.precedingActual = p6.precedingActual; changed = true; }
        if (p6.completionTarget !== undefined && p6.completionTarget !== "" && p6.completionTarget !== row.completionTarget) { nextRow.completionTarget = p6.completionTarget; changed = true; }

        if (p6.rolling) {
          Object.keys(p6.rolling).forEach((m) => {
             if (p6.rolling[m] !== undefined && p6.rolling[m] !== "" && p6.rolling[m] !== row.rolling[m]) {
                 nextRow.rolling = { ...nextRow.rolling, [m]: p6.rolling[m] };
                 changed = true;
             }
          });
        }
        
        if (!changed) return row;
        return { ...nextRow, fromP6: true };
      });
      return { ...prev, construction: next };
    });
    constructionSeeded.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(p6ConstructionRows)]);

  // The procurement package list is fixed (see WIND_PROCUREMENT_PACKAGES) - always exactly these
  // 6 rows, matching the source deck. Rebuild it fresh from P6 on every update instead of merging
  // into whatever was already saved: a merge only ever adds/updates rows it finds in the new list
  // and never removes ones that aren't in it, so a package that no longer belongs (e.g. one
  // discovered dynamically before the list was fixed to these 6) would linger in localStorage
  // forever, showing up alongside the correct 6. Only the user's own rolling-plan edits are
  // carried over, matched by package name - everything else comes straight from P6.
  useEffect(() => {
    if (p6ProcurementRows.length === 0) return;
    onChange((prev) => {
      const rollingMonths = nextNMonths(3);
      const blankRolling = () => Object.fromEntries(rollingMonths.map((m) => [m, ""] as const));
      const prevByName = new Map(prev.procurement.map((r) => [r.package, r]));
      const rebuilt = p6ProcurementRows.map((p6, i) => {
        const existing = prevByName.get(p6.package);
        return {
          srNo: String(i + 1),
          package: p6.package,
          uom: p6.uom,
          scope: p6.scope,
          orderingCompleted: p6.orderingCompleted,
          delivered: p6.delivered,
          balance: p6.balance,
          rolling: existing?.rolling || blankRolling(),
          fromP6: true,
        };
      });
      if (JSON.stringify(rebuilt) === JSON.stringify(prev.procurement)) return prev;
      return { ...prev, procurement: rebuilt };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(p6ProcurementRows)]);

  const sCurveChartData = (sCurveData || []).map((d: any, i: number, arr: any[]) => {
    const prevPlanned = i > 0 ? (arr[i - 1].planned ?? 0) : 0;
    const prevActual = i > 0 ? (arr[i - 1].actual ?? 0) : 0;
    return {
      ...d,
      monthlyPlan: Math.max(0, parseFloat(((d.planned ?? 0) - prevPlanned).toFixed(2))),
      monthlyActual: d.actual != null ? Math.max(0, parseFloat(((d.actual ?? 0) - prevActual).toFixed(2))) : null,
    };
  });

  // Seed gap-analysis "Cumm. Actual" from live engineering/ordering % complete + construction
  // achievement. Also seed Total plan/actual from the S-curve data, and auto-calculate variances.
  useEffect(() => {
    onChange((prev) => {
      const fill = (key: "engineering" | "procurement" | "construction", pct: number | null) => {
        const current = { ...prev.gapAnalysis[key] };
        if (pct != null && !current.cummActual) {
          current.cummActual = `${pct.toFixed(0)}%`;
        }
        return current;
      };

      const next = {
        engineering: fill("engineering", gapAnalysisPct.engineering),
        procurement: fill("procurement", gapAnalysisPct.procurement),
        construction: fill("construction", gapAnalysisPct.construction),
        total: { ...prev.gapAnalysis.total },
      };

      // Seed Total row from the curve for the current report month
      const currentMonthData = [...sCurveChartData].reverse().find(d => d.actual != null) || sCurveChartData[sCurveChartData.length - 1];
      if (currentMonthData) {
        if (currentMonthData.planned != null && !next.total.cummPlan) {
           next.total.cummPlan = `${currentMonthData.planned.toFixed(0)}%`;
        }
        if (currentMonthData.actual != null && !next.total.cummActual) {
           next.total.cummActual = `${currentMonthData.actual.toFixed(0)}%`;
        }
      }

      // Auto-calculate variances if they are empty
      (["engineering", "procurement", "construction", "total"] as const).forEach(k => {
         if (!next[k].variance && next[k].cummPlan && next[k].cummActual) {
            const p = parseFloat(next[k].cummPlan);
            const a = parseFloat(next[k].cummActual);
            if (!isNaN(p) && !isNaN(a)) {
               const v = a - p;
               next[k].variance = `${v > 0 ? '+' : ''}${v.toFixed(0)}%`;
            }
         }
      });

      if (JSON.stringify(next) === JSON.stringify(prev.gapAnalysis)) return prev;
      return { ...prev, gapAnalysis: next };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gapAnalysisPct.engineering, gapAnalysisPct.procurement, gapAnalysisPct.construction, JSON.stringify(sCurveChartData)]);

  useEffect(() => {
    const entries = Object.entries(manpowerActual).filter(([, v]) => v);
    if (entries.length === 0) return;
    onChange((prev) => {
      const merged = { ...prev.manpower.actual };
      let changed = false;
      entries.forEach(([m, v]) => {
        if (!merged[m]) { merged[m] = v; changed = true; }
      });
      if (!changed) return prev;
      return { ...prev, manpower: { ...prev.manpower, actual: merged } };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(manpowerActual)]);

  const setField = <K extends keyof WindCpagReportData>(key: K, value: WindCpagReportData[K]) =>
    onChange((prev) => ({ ...prev, [key]: value }));

  const chartData = reportData.manpower.months.map((m) => ({
    name: m,
    plan: parseFloat(reportData.manpower.plan[m]) || 0,
    actual: reportData.manpower.actual[m] ? parseFloat(reportData.manpower.actual[m]) : undefined,
  }));

  const addCriticalIssue = () => {
    const row: CriticalIssueRow = {
      id: Date.now().toString(36), sn: String(reportData.criticalIssues.length + 1),
      issue: "", impact: "", rootCause: "", correctiveAction: "", actionByWhom: "", actionByDate: "",
      currentStatus: "", supportRequired: "",
    };
    setField("criticalIssues", [...reportData.criticalIssues, row]);
  };
  const removeCriticalIssue = (id: string) => {
    setField("criticalIssues", reportData.criticalIssues.filter((r) => r.id !== id).map((r, i) => ({ ...r, sn: String(i + 1) })));
  };

  const handleImageUpload = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => setField("siteLayout", { ...reportData.siteLayout, imageDataUrl: String(reader.result || "") });
    reader.readAsDataURL(file);
  };

  return (
    <div className="p-4 md:p-8 bg-slate-100 min-h-screen overflow-y-auto font-sans">
      {/* Cover - the date here is always "today" at view/download time, deliberately not the
          editable reportMonth field used elsewhere in the report (see Executive Summary etc.),
          so this slide never goes stale even if the report itself covers an earlier month. */}
      <Card className="w-full max-w-[1400px] mx-auto mb-10 shadow-lg border-2 border-slate-200 aspect-[16/9] flex flex-col relative overflow-hidden bg-white">
        {/* Illustrated artwork, cropped to its lower portion - the source image has its own Adani
            wordmark baked into the top, which would clash with the logo placed below. */}
        <div className="absolute inset-x-0 bottom-0 h-[55%] overflow-hidden">
          <img src={`${import.meta.env.BASE_URL}coverPhoto.png`} alt="" className="w-full h-full object-cover object-bottom" />
        </div>

        <img src={`${import.meta.env.BASE_URL}logo.png`} alt="Adani" className="absolute top-8 left-10 h-10 object-contain z-10" />

        <div className="absolute top-8 right-10 left-[52%] z-10">
          <h2 className="text-2xl font-bold text-slate-900">CPAG – Energy Cluster</h2>
          <div className="h-[3px] w-full mt-1.5 rounded-full bg-gradient-to-r from-emerald-500 via-blue-500 via-fuchsia-500 to-red-500" />
          <div className="flex items-center justify-between mt-2">
            <span className="font-bold text-slate-900">Adani Green Energy Ltd</span>
            <span className="font-bold text-slate-900">{formatMonthLabel(new Date())}</span>
          </div>
        </div>
      </Card>

      {/* Agenda */}
      <Slide title="Agenda" slideNumber={String(slideNum++)}>
        <ul className="list-disc pl-8 space-y-3 text-lg text-slate-700 mt-4">
          <li>Executive Summary</li>
          <li>Project Information &amp; Salient Features</li>
          <li>Progress Update</li>
          <li>Major Critical Issues</li>
        </ul>
      </Slide>

      {/* Executive Summary */}
      <Slide title="Executive Summary" slideNumber={String(slideNum++)}>
        <table className="w-full border-collapse border border-slate-400">
          <thead>
            <tr style={{ backgroundColor: `#${CPAG_COLORS.purple}` }}>
              <th className={th(CPAG_COLORS.purple)} rowSpan={2}>Location</th>
              <th className={th(CPAG_COLORS.purple)} rowSpan={2}>Project Name</th>
              <th className={th(CPAG_COLORS.purple)} rowSpan={2}>FY 27 Plan (MW)</th>
              <th className={th(CPAG_COLORS.purple)} rowSpan={2}>FY 27 Actual till {reportData.meta.reportMonth} (MW)</th>
              <th className={th(CPAG_COLORS.purple)} colSpan={2}>COD</th>
              <th className={th(CPAG_COLORS.purple)} colSpan={2}>Overall Progress</th>
              <th className={th(CPAG_COLORS.purple)} rowSpan={2}>Remarks</th>
            </tr>
            <tr style={{ backgroundColor: `#${CPAG_COLORS.purple}` }}>
              <th className={th(CPAG_COLORS.purple)}>Revised AOP Plan</th>
              <th className={th(CPAG_COLORS.purple)}>Achieved / Expected</th>
              <th className={th(CPAG_COLORS.purple)}>Plan</th>
              <th className={th(CPAG_COLORS.purple)}>Actual</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className={td}><EditText value={reportData.meta.location} onChange={(v) => setField("meta", { ...reportData.meta, location: v })} /></td>
              <td className={`${td} text-left`}><EditText align="left" value={reportData.meta.projectFullName} onChange={(v) => setField("meta", { ...reportData.meta, projectFullName: v })} /></td>
              <td className={td}><EditText value={reportData.execSummary.fy27Plan} onChange={(v) => setField("execSummary", { ...reportData.execSummary, fy27Plan: v })} /></td>
              <td className={td}><EditText value={reportData.execSummary.fy27Actual} onChange={(v) => setField("execSummary", { ...reportData.execSummary, fy27Actual: v })} /></td>
              <td className={td}><EditText value={reportData.execSummary.codPlan} onChange={(v) => setField("execSummary", { ...reportData.execSummary, codPlan: v })} /></td>
              <td className={td}><EditText value={reportData.execSummary.codAchieved} onChange={(v) => setField("execSummary", { ...reportData.execSummary, codAchieved: v })} /></td>
              <td className={td}><EditText value={reportData.execSummary.progressPlan} onChange={(v) => setField("execSummary", { ...reportData.execSummary, progressPlan: v })} /></td>
              <td className={td}><EditText value={reportData.execSummary.progressActual} onChange={(v) => setField("execSummary", { ...reportData.execSummary, progressActual: v })} /></td>
              <td className={`${td} text-left`}><EditText align="left" value={reportData.execSummary.remarks} onChange={(v) => setField("execSummary", { ...reportData.execSummary, remarks: v })} /></td>
            </tr>
          </tbody>
        </table>
      </Slide>

      {/* Commissioning: Plan vs Forecast */}
      <Slide title={`Commissioning: Plan vs. Forecast – ${projectName}`} slideNumber={String(slideNum++)}>
        {(["budget", "actualForecast"] as const).map((key) => {
          const headerColor = key === "budget" ? CPAG_COLORS.magenta : CPAG_COLORS.navy;
          const headerLabel = key === "budget" ? "Budget" : "Actual / Forecast";
          return (
            <div key={key} className="mb-6 overflow-x-auto">
              <table className="border-collapse border border-slate-400 min-w-[1400px]">
                <thead>
                  <tr>
                    <th className={th(headerColor, "sticky left-0 bg-inherit")} style={{ backgroundColor: `#${headerColor}` }} rowSpan={2}>Details</th>
                    <th className={th(headerColor)} style={{ backgroundColor: `#${headerColor}` }} colSpan={reportData.commissioning.months.length}>{headerLabel}</th>
                  </tr>
                  <tr>
                    {reportData.commissioning.months.map((m) => (
                      <th key={m} className="p-1 border border-slate-300 bg-slate-100 text-[10px] font-semibold text-center whitespace-nowrap">{m}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className={`${td} font-semibold text-left whitespace-nowrap`}>{reportData.meta.projectFullName || projectName}</td>
                    {reportData.commissioning.months.map((m) => (
                      <td key={m} className="p-1 border border-slate-300 text-xs w-16">
                        <EditText value={reportData.commissioning[key].values[m] || ""} onChange={(v) => setField("commissioning", { ...reportData.commissioning, [key]: { ...reportData.commissioning[key], values: { ...reportData.commissioning[key].values, [m]: v } } })} />
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          );
        })}
      </Slide>

      {/* Salient Features */}
      <Slide title="Salient Features" slideNumber={String(slideNum++)}>
        <table className="w-full border-collapse border border-slate-400">
          <tbody>
            <tr style={{ backgroundColor: `#${CPAG_COLORS.lightPurple}` }}>
              <td className={`${td} font-bold`}>Project</td>
              <td className={`${td} text-left`} colSpan={5}><EditText align="left" value={reportData.meta.projectFullName} onChange={(v) => setField("meta", { ...reportData.meta, projectFullName: v })} /></td>
            </tr>
            <tr>
              <td className={`${td} font-bold`}>Project Scope / Capacity</td>
              <td className={`${td} text-left`} colSpan={5}><EditText align="left" value={reportData.salient.scopeCapacity} onChange={(v) => setField("salient", { ...reportData.salient, scopeCapacity: v })} placeholder="e.g. 323.4 MW" /></td>
            </tr>
            <tr style={{ backgroundColor: `#${CPAG_COLORS.paleLavender}` }}>
              <td className={`${td} font-bold`}>Owner / Developer</td>
              <td className={`${td} text-left`} colSpan={5}><EditText align="left" value={reportData.salient.owner} onChange={(v) => setField("salient", { ...reportData.salient, owner: v })} /></td>
            </tr>
            <tr>
              <td className={`${td} font-bold`}>Location</td>
              <td className={`${td} text-left`} colSpan={5}><EditText align="left" value={reportData.salient.location} onChange={(v) => setField("salient", { ...reportData.salient, location: v })} /></td>
            </tr>
            <tr style={{ backgroundColor: `#${CPAG_COLORS.paleLavender}` }}>
              <td className={`${td} font-bold`}>Land Area</td>
              <td className={`${td} text-left`} colSpan={5}><EditText align="left" value={reportData.salient.landArea} onChange={(v) => setField("salient", { ...reportData.salient, landArea: v })} /></td>
            </tr>
            <tr><td className="p-1 border-0" colSpan={6}>&nbsp;</td></tr>
            <tr style={{ backgroundColor: `#${CPAG_COLORS.paleLavender}` }}>
              <td className={`${td} font-bold`}>Project Configuration</td>
              <td className={`${td} font-bold`} colSpan={5}>Wind Turbine</td>
            </tr>
            <tr>
              <td className={`${td} font-bold`}>Parameters</td>
              <td className={`${td} text-left`} colSpan={5}><EditText align="left" value={reportData.salient.turbineModel} onChange={(v) => setField("salient", { ...reportData.salient, turbineModel: v })} placeholder="e.g. ANIL 3.3MW" /></td>
            </tr>
            <tr><td className="p-1 border-0" colSpan={6}>&nbsp;</td></tr>
            <tr style={{ backgroundColor: `#${CPAG_COLORS.paleLavender}` }}>
              <td className={`${td} font-bold`}>Commissioning (FY 26-27)</td>
              <td className={`${td} font-bold`}>Q1</td>
              <td className={`${td} font-bold`}>Q2</td>
              <td className={`${td} font-bold`}>Q3</td>
              <td className={`${td} font-bold`}>Q4</td>
              <td className={`${td} font-bold`}>Total</td>
            </tr>
            <tr>
              <td className={`${td} font-bold`}>Budget Plan (MW)</td>
              {(["q1", "q2", "q3", "q4", "total"] as const).map((q) => (
                <td key={q} className={td}><EditText value={reportData.salient.quarters[q].plan} onChange={(v) => setField("salient", { ...reportData.salient, quarters: { ...reportData.salient.quarters, [q]: { ...reportData.salient.quarters[q], plan: v } } })} /></td>
              ))}
            </tr>
            <tr>
              <td className={`${td} font-bold`}>Actual / Expected (MW)</td>
              {(["q1", "q2", "q3", "q4", "total"] as const).map((q) => (
                <td key={q} className={td}><EditText value={reportData.salient.quarters[q].actual} onChange={(v) => setField("salient", { ...reportData.salient, quarters: { ...reportData.salient.quarters, [q]: { ...reportData.salient.quarters[q], actual: v } } })} /></td>
              ))}
            </tr>
          </tbody>
        </table>
      </Slide>

      {/* Site Layout */}
      <Slide title={`${projectName}: Site Layout`} slideNumber={String(slideNum++)}>
        <div className="flex gap-6 h-full">
          <div className="flex-1 border-2 border-dashed border-slate-300 rounded-lg flex items-center justify-center relative overflow-hidden min-h-[320px]">
            {reportData.siteLayout.imageDataUrl ? (
              <img src={reportData.siteLayout.imageDataUrl} alt="Site Layout" className="max-h-full max-w-full object-contain" />
            ) : (
              <label className="flex flex-col items-center gap-2 text-slate-400 cursor-pointer">
                <Upload className="w-8 h-8" />
                <span className="text-sm">Upload Site Layout Image</span>
                <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && handleImageUpload(e.target.files[0])} />
              </label>
            )}
          </div>
          <div className="w-72 shrink-0">
            <table className="w-full border-collapse border border-slate-400">
              <tbody>
                <tr>
                  <td className={`${td} font-semibold text-left`} colSpan={2}>No. of Private Locations</td>
                  <td className={td}><EditText value={reportData.siteLayout.privateLocations} onChange={(v) => setField("siteLayout", { ...reportData.siteLayout, privateLocations: v })} /></td>
                </tr>
                <tr>
                  <td className={`${td} text-left`} colSpan={2}>Acquired Locations (Registry Done)</td>
                  <td className={td}><EditText value={reportData.siteLayout.acquiredLocations} onChange={(v) => setField("siteLayout", { ...reportData.siteLayout, acquiredLocations: v })} /></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </Slide>

      {/* Overall S-Curve */}
      <Slide title="Overall S Curve" slideNumber={String(slideNum++)}>
        <div className="h-[260px] mb-4">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={sCurveChartData} barGap={0} barCategoryGap="20%">
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis dataKey="name" fontSize={9} tickLine={false} axisLine={{ stroke: '#cbd5e1' }} tick={{ fill: '#64748b' }} />
              <YAxis yAxisId="left" fontSize={9} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}%`} tick={{ fill: '#64748b' }} domain={[0, 120]} />
              <YAxis yAxisId="right" orientation="right" fontSize={9} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}%`} tick={{ fill: '#64748b' }} domain={[0, 25]} />
              <RechartsTooltip
                wrapperStyle={{ zIndex: 9999, outline: 'none' }}
                contentStyle={{ backgroundColor: '#fff', borderColor: '#e2e8f0', borderRadius: 6, fontSize: 11 }}
                itemStyle={{ color: '#0f172a' }}
                labelStyle={{ color: '#0f172a', fontWeight: 600, marginBottom: 4 }}
                formatter={(value: any, name: string) => name ? [`${value}%`, name] : [`${value}%`]}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {/* Monthly bars */}
              <Bar yAxisId="right" dataKey="monthlyPlan" name="Monthly Plan" fill="#0ea5e9" radius={[2, 2, 0, 0]} />
              <Bar yAxisId="right" dataKey="monthlyActual" name="Monthly Actual" fill="#76bc21" radius={[2, 2, 0, 0]} />
              {/* Cumulative lines */}
              <Line yAxisId="left" type="monotone" dataKey="planned" name="Cumulative Plan" stroke="#002060" strokeWidth={2.5} dot={{ r: 3, fill: "#002060" }} activeDot={{ r: 5 }} />
              <Line yAxisId="left" type="monotone" dataKey="actual" name="Cumulative Actual" stroke="#92d050" strokeWidth={2.5} dot={{ r: 3, fill: "#92d050" }} activeDot={{ r: 5 }} />
              <Line yAxisId="left" type="monotone" dataKey="forecast" name="Cumulative Forecast" stroke="#0ea5e9" strokeWidth={2.5} strokeDasharray="4 4" dot={{ r: 3, fill: "#0ea5e9" }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <table className="w-full border-collapse border border-slate-400">
          <thead>
            <tr style={{ backgroundColor: `#${CPAG_COLORS.blue}` }}>
              <th className={th(CPAG_COLORS.blue)}>Progress Parameter</th>
              <th className={th(CPAG_COLORS.blue)}>Weightage</th>
              <th className={th(CPAG_COLORS.blue)}>Cumm. Plan</th>
              <th className={th(CPAG_COLORS.blue)}>Cumm. Actual</th>
              <th className={th(CPAG_COLORS.blue)}>Variance</th>
              <th className={th(CPAG_COLORS.blue)}>Remarks for Variance</th>
            </tr>
          </thead>
          <tbody>
            {(["engineering", "procurement", "construction", "total"] as const).map((k) => (
              <tr key={k}>
                <td className={`${td} font-semibold capitalize`}>{k}</td>
                <td className={td}><EditText value={reportData.gapAnalysis[k].weightage} onChange={(v) => setField("gapAnalysis", { ...reportData.gapAnalysis, [k]: { ...reportData.gapAnalysis[k], weightage: v } })} /></td>
                <td className={td}><EditText value={reportData.gapAnalysis[k].cummPlan} onChange={(v) => setField("gapAnalysis", { ...reportData.gapAnalysis, [k]: { ...reportData.gapAnalysis[k], cummPlan: v } })} /></td>
                <td className={td}><EditText value={reportData.gapAnalysis[k].cummActual} onChange={(v) => setField("gapAnalysis", { ...reportData.gapAnalysis, [k]: { ...reportData.gapAnalysis[k], cummActual: v } })} /></td>
                <td className={td}><EditText value={reportData.gapAnalysis[k].variance} onChange={(v) => setField("gapAnalysis", { ...reportData.gapAnalysis, [k]: { ...reportData.gapAnalysis[k], variance: v } })} /></td>
                <td className={`${td} text-left`}><EditText align="left" value={reportData.gapAnalysis[k].remarks} onChange={(v) => setField("gapAnalysis", { ...reportData.gapAnalysis, [k]: { ...reportData.gapAnalysis[k], remarks: v } })} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Slide>

      {/* Procurement & 3 month rolling plan */}
      <Slide title="Procurement &amp; 3 Month Rolling Plan for Supply Status" slideNumber={String(slideNum++)}>
        <div className="overflow-x-auto">
          <table className="border-collapse border border-slate-400 min-w-[1100px]">
            <thead>
              <tr style={{ backgroundColor: `#${CPAG_COLORS.purple}` }}>
                <th className={th(CPAG_COLORS.purple)} rowSpan={2}>Sr No.</th>
                <th className={th(CPAG_COLORS.purple)} rowSpan={2}>Packages</th>
                <th className={th(CPAG_COLORS.purple)} rowSpan={2}>UOM</th>
                <th className={th(CPAG_COLORS.purple)} rowSpan={2}>Scope</th>
                <th className={th(CPAG_COLORS.purple)} rowSpan={2}>Ordering Completed</th>
                <th className={th(CPAG_COLORS.purple)} rowSpan={2}>Delivered at Site up to {reportData.meta.reportMonth}</th>
                <th className={th(CPAG_COLORS.purple)} rowSpan={2}>Balance to Deliver</th>
                <th className={th(CPAG_COLORS.purple)} colSpan={3}>Next 3 Month Rolling Plan</th>
              </tr>
              <tr style={{ backgroundColor: `#${CPAG_COLORS.purple}` }}>
                {nextNMonths(3).map((m) => (
                  <th key={m} className={th(CPAG_COLORS.purple)}>{m}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {reportData.procurement.length === 0 && (
                <tr><td colSpan={10} className="p-6 text-center text-slate-400 italic border border-slate-300">No packages found from Engineering &amp; Delivery data yet. Rows will appear automatically once P6 ordering/delivery data syncs.</td></tr>
              )}
              {reportData.procurement.map((row, i) => (
                <tr key={row.package}>
                  <td className={td}>{row.srNo}</td>
                  <td className={`${td} text-left font-medium`}>{row.package}</td>
                  <td className={td}>{row.uom}</td>
                  <td className={td}>{row.scope || "-"}</td>
                  <td className={td}>{row.orderingCompleted || "-"}</td>
                  <td className={td}>{row.delivered || "-"}</td>
                  <td className={td}>{row.balance || "-"}</td>
                  {nextNMonths(3).map((m) => (
                    <td key={m} className={td}>
                      <EditText value={row.rolling[m] || ""} onChange={(v) => {
                        const next = [...reportData.procurement];
                        next[i] = { ...row, rolling: { ...row.rolling, [m]: v } };
                        setField("procurement", next);
                      }} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Slide>

      {/* Construction Progress Update */}
      <Slide title="Construction Progress Update" slideNumber={String(slideNum++)}>
        <div className="overflow-x-auto">
          <table className="border-collapse border border-slate-400 min-w-[1200px]">
            <thead>
              <tr style={{ backgroundColor: `#${CPAG_COLORS.purple}` }}>
                <th className={th(CPAG_COLORS.purple)} rowSpan={2}>Activity</th>
                <th className={th(CPAG_COLORS.purple)} rowSpan={2}>UOM</th>
                <th className={th(CPAG_COLORS.purple)} rowSpan={2}>Scope</th>
                <th className={th(CPAG_COLORS.purple)} rowSpan={2}>Completed</th>
                <th className={th(CPAG_COLORS.purple)} rowSpan={2}>Balance</th>
                <th className={th(CPAG_COLORS.purple)} colSpan={2}>Preceding Month</th>
                <th className={th(CPAG_COLORS.purple)} colSpan={3}>Next 3 Month Rolling Plan</th>
                <th className={th(CPAG_COLORS.purple)} rowSpan={2}>Completion Target</th>
              </tr>
              <tr style={{ backgroundColor: `#${CPAG_COLORS.purple}` }}>
                <th className={th(CPAG_COLORS.purple)}>Plan</th>
                <th className={th(CPAG_COLORS.purple)}>Actual</th>
                {nextNMonths(3).map((m) => (
                  <th key={m} className={th(CPAG_COLORS.purple)}>{m}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {reportData.construction.map((row, i) => (
                <tr key={row.activity}>
                  <td className={`${td} text-left font-medium`}>{row.activity}</td>
                  <td className={td}>{row.uom}</td>
                  <td className={td} title={row.fromP6 ? "From P6" : undefined}>
                    <EditText value={row.scope} onChange={(v) => { const n = [...reportData.construction]; n[i] = { ...row, scope: v }; setField("construction", n); }} className={row.fromP6 ? "text-emerald-700 font-semibold" : ""} />
                  </td>
                  <td className={td}>
                    <EditText value={row.completed} onChange={(v) => { const n = [...reportData.construction]; n[i] = { ...row, completed: v }; setField("construction", n); }} className={row.fromP6 ? "text-emerald-700 font-semibold" : ""} />
                  </td>
                  <td className={td}>
                    <EditText value={row.balance} onChange={(v) => { const n = [...reportData.construction]; n[i] = { ...row, balance: v }; setField("construction", n); }} className={row.fromP6 ? "text-emerald-700 font-semibold" : ""} />
                  </td>
                  <td className={td}><EditText value={row.precedingPlan} onChange={(v) => { const n = [...reportData.construction]; n[i] = { ...row, precedingPlan: v }; setField("construction", n); }} /></td>
                  <td className={td}><EditText value={row.precedingActual} onChange={(v) => { const n = [...reportData.construction]; n[i] = { ...row, precedingActual: v }; setField("construction", n); }} /></td>
                  {nextNMonths(3).map((m) => (
                    <td key={m} className={td}>
                      <EditText value={row.rolling[m] || ""} onChange={(v) => { const n = [...reportData.construction]; n[i] = { ...row, rolling: { ...row.rolling, [m]: v } }; setField("construction", n); }} />
                    </td>
                  ))}
                  <td className={td}><EditText value={row.completionTarget} onChange={(v) => { const n = [...reportData.construction]; n[i] = { ...row, completionTarget: v }; setField("construction", n); }} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Slide>

      {/* Major Milestone - Next 3 months */}
      <Slide title="Major Milestone – Next 3 Months" slideNumber={String(slideNum++)}>
        <table className="w-full border-collapse border border-slate-400">
          <thead>
            <tr style={{ backgroundColor: `#${CPAG_COLORS.purple}` }}>
              {reportData.milestones.map((m) => (
                <th key={m.month} className={th(CPAG_COLORS.purple)}>{m.month}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              {reportData.milestones.map((m, i) => (
                <td key={m.month} className={`${td} align-top`}>
                  <EditArea rows={3} value={m.text} onChange={(v) => {
                    const n = [...reportData.milestones];
                    n[i] = { ...m, text: v };
                    setField("milestones", n);
                  }} placeholder="Milestone description..." />
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </Slide>

      {/* Manpower Deployment */}
      <Slide title={`${projectName}: Manpower Deployment Plan vs Actual`} slideNumber={String(slideNum++)}>
        <div className="h-[280px] mb-4">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis dataKey="name" fontSize={9} tick={{ fill: "#64748b" }} />
              <YAxis fontSize={10} tick={{ fill: "#64748b" }} />
              <RechartsTooltip />
              <Legend />
              <Bar dataKey="plan" name="Plan Manpower" fill="#11375c" radius={[2, 2, 0, 0]} />
              <Bar dataKey="actual" name="Actual Manpower" fill="#d4c426" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="overflow-x-auto">
          <table className="border-collapse border border-slate-300 min-w-[1200px] text-[10px]">
            <thead>
              <tr>
                <th className="p-1 border border-slate-300 bg-slate-50 text-left">Month</th>
                {reportData.manpower.months.map((m) => (
                  <th key={m} className="p-1 border border-slate-300 bg-slate-50 whitespace-nowrap">{m}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="p-1 border border-slate-300 font-semibold text-left">Plan</td>
                {reportData.manpower.months.map((m) => (
                  <td key={m} className="p-1 border border-slate-300 w-14">
                    <EditText value={reportData.manpower.plan[m] || ""} onChange={(v) => setField("manpower", { ...reportData.manpower, plan: { ...reportData.manpower.plan, [m]: v } })} />
                  </td>
                ))}
              </tr>
              <tr>
                <td className="p-1 border border-slate-300 font-semibold text-left">Actual</td>
                {reportData.manpower.months.map((m) => (
                  <td key={m} className="p-1 border border-slate-300 w-14">
                    <EditText value={reportData.manpower.actual[m] || ""} onChange={(v) => setField("manpower", { ...reportData.manpower, actual: { ...reportData.manpower.actual, [m]: v } })} />
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </Slide>

      {/* Major Critical Issues */}
      <Slide title={`Major Critical Issues / Support Desired – ${projectName}`} slideNumber={String(slideNum++)}>
        <div className="overflow-x-auto">
          <table className="border-collapse border border-slate-400 min-w-[1300px]">
            <thead>
              <tr style={{ backgroundColor: `#${CPAG_COLORS.purple}` }}>
                <th className={th(CPAG_COLORS.purple)} rowSpan={2}>S.N.</th>
                <th className={th(CPAG_COLORS.purple)} rowSpan={2}>Issues</th>
                <th className={th(CPAG_COLORS.purple)} rowSpan={2}>Potential Impact</th>
                <th className={th(CPAG_COLORS.purple)} rowSpan={2}>Root Cause of the Issue</th>
                <th className={th(CPAG_COLORS.purple)} rowSpan={2}>Corrective Action</th>
                <th className={th(CPAG_COLORS.purple)} colSpan={2}>Action By</th>
                <th className={th(CPAG_COLORS.purple)} rowSpan={2}>Current Status</th>
                <th className={th(CPAG_COLORS.purple)} rowSpan={2}>Support Required</th>
                <th className={th(CPAG_COLORS.purple)} rowSpan={2}></th>
              </tr>
              <tr style={{ backgroundColor: `#${CPAG_COLORS.purple}` }}>
                <th className={th(CPAG_COLORS.purple)}>Whom</th>
                <th className={th(CPAG_COLORS.purple)}>Date</th>
              </tr>
            </thead>
            <tbody>
              {reportData.criticalIssues.length === 0 && (
                <tr><td colSpan={10} className="p-6 text-center text-slate-400 italic border border-slate-300">No issues added yet.</td></tr>
              )}
              {reportData.criticalIssues.map((row, i) => (
                <tr key={row.id}>
                  <td className={td}>{row.sn}</td>
                  <td className={`${td} text-left`}><EditArea rows={2} value={row.issue} onChange={(v) => { const n = [...reportData.criticalIssues]; n[i] = { ...row, issue: v }; setField("criticalIssues", n); }} /></td>
                  <td className={`${td} text-left`}><EditArea rows={2} value={row.impact} onChange={(v) => { const n = [...reportData.criticalIssues]; n[i] = { ...row, impact: v }; setField("criticalIssues", n); }} /></td>
                  <td className={`${td} text-left`}><EditArea rows={2} value={row.rootCause} onChange={(v) => { const n = [...reportData.criticalIssues]; n[i] = { ...row, rootCause: v }; setField("criticalIssues", n); }} /></td>
                  <td className={`${td} text-left`}><EditArea rows={2} value={row.correctiveAction} onChange={(v) => { const n = [...reportData.criticalIssues]; n[i] = { ...row, correctiveAction: v }; setField("criticalIssues", n); }} /></td>
                  <td className={td}><EditText value={row.actionByWhom} onChange={(v) => { const n = [...reportData.criticalIssues]; n[i] = { ...row, actionByWhom: v }; setField("criticalIssues", n); }} /></td>
                  <td className={td}><EditText value={row.actionByDate} onChange={(v) => { const n = [...reportData.criticalIssues]; n[i] = { ...row, actionByDate: v }; setField("criticalIssues", n); }} /></td>
                  <td className={`${td} text-left`}><EditArea rows={2} value={row.currentStatus} onChange={(v) => { const n = [...reportData.criticalIssues]; n[i] = { ...row, currentStatus: v }; setField("criticalIssues", n); }} /></td>
                  <td className={`${td} text-left`}><EditArea rows={2} value={row.supportRequired} onChange={(v) => { const n = [...reportData.criticalIssues]; n[i] = { ...row, supportRequired: v }; setField("criticalIssues", n); }} /></td>
                  <td className={td}>
                    <button onClick={() => removeCriticalIssue(row.id)} className="text-red-400 hover:text-red-600">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button onClick={addCriticalIssue} className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-[#7030a0] hover:text-[#5e2887]">
          <Plus className="w-3.5 h-3.5" /> Add Issue
        </button>
      </Slide>

      {/* Thank You */}
      <Card className="w-full max-w-[1400px] mx-auto mb-4 shadow-lg border-2 border-slate-200 aspect-[16/9] flex items-center justify-center bg-white">
        <h2 className="text-4xl font-extrabold text-slate-800">Thank You</h2>
      </Card>
    </div>
  );
};
