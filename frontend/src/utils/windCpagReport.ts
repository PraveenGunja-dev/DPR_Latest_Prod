// Structure, colors and P6-data aggregation for the Wind "CPAG - Energy Cluster" monthly report.
// Mirrors the columns/coloring of the source deck (03. Mundra North_CPAG_Energy_Monthly Report.pptx)
// so the on-screen report and the exported PPT both keep the same slide-by-slide layout.

export const CPAG_COLORS = {
  purple: "7030A0",       // Executive Summary / Procurement / Construction headers
  magenta: "912A82",      // Commissioning Budget header
  navy: "002060",         // Commissioning Actual/Forecast header
  green: "92D050",        // Commissioning Actual/Forecast accent
  lightPurple: "C28DDF",  // Salient Features header row
  paleLavender: "F3E8F9", // Salient Features alternate rows
  blue: "4F81BD",         // Gap Analysis header
};

export interface CommissioningRow {
  label: string;
  values: Record<string, string>;
}

export interface GapAnalysisRow {
  weightage: string;
  cummPlan: string;
  cummActual: string;
  variance: string;
  remarks: string;
}

export interface ConstructionRow {
  activity: string;
  uom: string;
  scope: string;
  completed: string;
  balance: string;
  precedingPlan: string;
  precedingActual: string;
  rolling: Record<string, string>;
  completionTarget: string;
  /** true when scope/completed/balance were derived from live P6 data this load */
  fromP6: boolean;
}

export interface ProcurementRow {
  srNo: string;
  package: string;
  uom: string;
  scope: string;
  orderingCompleted: string;
  delivered: string;
  balance: string;
  rolling: Record<string, string>;
  fromP6: boolean;
}

export interface CriticalIssueRow {
  id: string;
  sn: string;
  issue: string;
  impact: string;
  rootCause: string;
  correctiveAction: string;
  actionByWhom: string;
  actionByDate: string;
  currentStatus: string;
  supportRequired: string;
}

export interface WindCpagReportData {
  meta: {
    projectFullName: string;
    reportMonth: string; // e.g. "Aug-26"
    location: string;
  };
  execSummary: {
    fy27Plan: string;
    fy27Actual: string;
    codPlan: string;
    codAchieved: string;
    progressPlan: string;
    progressActual: string;
    remarks: string;
  };
  commissioning: {
    months: string[];
    budget: CommissioningRow;
    actualForecast: CommissioningRow;
  };
  salient: {
    scopeCapacity: string;
    owner: string;
    location: string;
    landArea: string;
    turbineModel: string;
    quarters: {
      q1: { plan: string; actual: string };
      q2: { plan: string; actual: string };
      q3: { plan: string; actual: string };
      q4: { plan: string; actual: string };
      total: { plan: string; actual: string };
    };
  };
  siteLayout: {
    privateLocations: string;
    acquiredLocations: string;
    imageDataUrl: string;
  };
  gapAnalysis: {
    engineering: GapAnalysisRow;
    procurement: GapAnalysisRow;
    construction: GapAnalysisRow;
    total: GapAnalysisRow;
  };
  procurement: ProcurementRow[];
  construction: ConstructionRow[];
  milestones: { month: string; text: string }[];
  manpower: {
    months: string[];
    plan: Record<string, string>;
    actual: Record<string, string>;
  };
  criticalIssues: CriticalIssueRow[];
}

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export const formatMonthLabel = (d: Date) => `${MONTH_NAMES[d.getMonth()]}-${String(d.getFullYear()).slice(-2)}`;

/** 16 rolling months starting from April of the current fiscal year (Apr->Mar), matching the deck's window. */
export const generateFyMonths = (anchor: Date = new Date(), count = 16): string[] => {
  const fyStartYear = anchor.getMonth() >= 3 ? anchor.getFullYear() : anchor.getFullYear() - 1;
  const months: string[] = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(fyStartYear, 3 + i, 1); // April = month index 3
    months.push(formatMonthLabel(d));
  }
  return months;
};

/** Next 3 calendar months after today, for the "rolling plan" columns. */
export const nextNMonths = (n = 3, anchor: Date = new Date()): string[] => {
  const months: string[] = [];
  for (let i = 1; i <= n; i++) {
    const d = new Date(anchor.getFullYear(), anchor.getMonth() + i, 1);
    months.push(formatMonthLabel(d));
  }
  return months;
};

const CONSTRUCTION_DEFS: { activity: string; uom: string; match: (name: string) => boolean }[] = [
  { activity: "WTG Foundation", uom: "Nos", match: (n) => /raft\s*casting|wtg\s*foundation|foundation/.test(n) && !/uss/.test(n) },
  { activity: "USS Pre-cast Erection", uom: "Nos", match: (n) => /uss/.test(n) && /pre-?cast/.test(n) },
  { activity: "WTG Erection", uom: "Nos", match: (n) => /wtg\s*erection/.test(n) || (/erection/.test(n) && !/uss/.test(n) && !/pre-?cast/.test(n) && !/commission/.test(n)) },
  { activity: "USS Erection", uom: "Nos", match: (n) => /uss/.test(n) && /erection/.test(n) && !/pre-?cast/.test(n) },
  { activity: "33kV OH Line", uom: "Km", match: (n) => /33\s*kv/.test(n) && /(oh\s*line|overhead|line)/.test(n) },
  { activity: "WTG Commissioning (Trial Run)", uom: "Nos", match: (n) => /commission/.test(n) || /trial\s*run/.test(n) },
];

/**
 * Buckets raw wind-progress P6 activities (one row per WTG per work item, e.g. "WTG11-ER-Erection")
 * into the 6 standard construction-progress line items, deduping by WTG location so scope reflects
 * distinct turbines rather than raw activity count.
 */
export const aggregateConstructionFromP6 = (activities: any[]): Pick<ConstructionRow, "activity" | "uom" | "scope" | "completed" | "balance" | "fromP6">[] => {
  return CONSTRUCTION_DEFS.map((def) => {
    const locations = new Map<string, boolean>(); // location -> isDone
    activities.forEach((a) => {
      const name = `${a.fullName || a.description || ""}`.toLowerCase();
      if (!def.match(name)) return;
      const loc = a.locations || a.location || a.activityId || `${Math.random()}`;
      const done = a.status === "Completed" || !!a.actualFinish;
      if (!locations.has(loc) || done) {
        locations.set(loc, locations.get(loc) || done);
      }
    });
    const scope = locations.size;
    const completed = Array.from(locations.values()).filter(Boolean).length;
    return {
      activity: def.activity,
      uom: def.uom,
      scope: scope ? String(scope) : "",
      completed: completed ? String(completed) : "",
      balance: scope ? String(Math.max(0, scope - completed)) : "",
      fromP6: scope > 0,
    };
  });
};

// The exact packages tracked on the Mundra North Procurement slide - not every package the wider
// DPR / E&D tracker carries. A wind project's E&D tracker holds many more line items (civil,
// engineering services, etc.); this report only ever shows these six.
const WIND_PROCUREMENT_PACKAGES: { label: string; uom: string; match: (name: string) => boolean }[] = [
  { label: "WTG Set (N-H-DT)", uom: "Nos", match: (n) => /wtg\s*set/.test(n) || /nacelle/.test(n) || /\bhub\b/.test(n) || /drive\s*train/.test(n) || /n[\s-]*h[\s-]*dt/.test(n) },
  { label: "Blade", uom: "Nos", match: (n) => /blade/.test(n) },
  { label: "Tower", uom: "Nos", match: (n) => /\btower\b/.test(n) },
  { label: "Transformer", uom: "Nos", match: (n) => /transformer/.test(n) },
  { label: "HT Panel", uom: "Nos", match: (n) => /ht\s*panel/.test(n) },
  { label: "33kV Conductor", uom: "Km", match: (n) => /33\s*kv/.test(n) && /conductor/.test(n) },
];

/** Matches ED ordering + delivery rows against the fixed Mundra package list (Scope / Ordering Completed / Delivered / Balance). */
export const aggregateProcurementFromP6 = (orderingData: any[], deliveryData: any[]): Pick<ProcurementRow, "package" | "uom" | "scope" | "orderingCompleted" | "delivered" | "balance" | "fromP6">[] => {
  return WIND_PROCUREMENT_PACKAGES.map((def) => {
    let scope = 0;
    let ordered = 0;
    let delivered = 0;

    orderingData.forEach((row: any) => {
      const name = `${row.packages || row.plot || row.description || row.name || ""}`.toLowerCase();
      if (!def.match(name)) return;
      scope = Math.max(scope, Number(row.scope) || 0);
      ordered = Math.max(ordered, Number(row.completed) || (row.status === "Completed" ? Number(row.scope) || 0 : 0));
    });

    deliveryData.forEach((row: any) => {
      const name = `${row.description || row.subWbs || row.wbsName || ""}`.toLowerCase();
      if (!def.match(name)) return;
      scope = Math.max(scope, Number(row.scope) || 0);
      delivered = Math.max(delivered, Number(row.completed) || 0);
    });

    return {
      package: def.label,
      uom: def.uom,
      scope: scope ? String(scope) : "",
      orderingCompleted: ordered ? String(ordered) : "",
      delivered: delivered ? String(delivered) : "",
      balance: scope ? String(Math.max(0, scope - delivered)) : "",
      fromP6: scope > 0 || ordered > 0 || delivered > 0,
    };
  });
};

export const getDefaultReportData = (projectName: string, projectLocation: string): WindCpagReportData => {
  const months = generateFyMonths();
  const rollingMonths = nextNMonths(3);
  const blankRolling = () => Object.fromEntries(rollingMonths.map((m) => [m, ""] as const));

  return {
    meta: {
      projectFullName: projectName || "",
      reportMonth: formatMonthLabel(new Date()),
      location: projectLocation || "",
    },
    execSummary: {
      fy27Plan: "",
      fy27Actual: "",
      codPlan: "",
      codAchieved: "",
      progressPlan: "",
      progressActual: "",
      remarks: "",
    },
    commissioning: {
      months,
      budget: { label: projectName || "", values: Object.fromEntries(months.map((m) => [m, ""] as const)) },
      actualForecast: { label: projectName || "", values: Object.fromEntries(months.map((m) => [m, ""] as const)) },
    },
    salient: {
      scopeCapacity: "",
      owner: "",
      location: projectLocation || "",
      landArea: "",
      turbineModel: "",
      quarters: {
        q1: { plan: "", actual: "" },
        q2: { plan: "", actual: "" },
        q3: { plan: "", actual: "" },
        q4: { plan: "", actual: "" },
        total: { plan: "", actual: "" },
      },
    },
    siteLayout: {
      privateLocations: "",
      acquiredLocations: "",
      // This report is only ever opened for Mundra North (see isMundraProject in Navbar.tsx), so
      // defaulting straight to its own site layout map - extracted from the source deck - is safe
      // here. Still fully replaceable via the upload control if the layout is ever updated.
      imageDataUrl: `${import.meta.env.BASE_URL}mundra-north-site-layout.jpg`,
    },
    gapAnalysis: {
      engineering: { weightage: "05%", cummPlan: "", cummActual: "", variance: "", remarks: "" },
      procurement: { weightage: "35%", cummPlan: "", cummActual: "", variance: "", remarks: "" },
      construction: { weightage: "60%", cummPlan: "", cummActual: "", variance: "", remarks: "" },
      total: { weightage: "100%", cummPlan: "", cummActual: "", variance: "", remarks: "" },
    },
    procurement: [],
    construction: CONSTRUCTION_DEFS.map((d) => ({
      activity: d.activity,
      uom: d.uom,
      scope: "",
      completed: "",
      balance: "",
      precedingPlan: "",
      precedingActual: "",
      rolling: blankRolling(),
      completionTarget: "",
      fromP6: false,
    })),
    milestones: rollingMonths.map((m) => ({ month: m, text: "" })),
    manpower: {
      months,
      plan: Object.fromEntries(months.map((m) => [m, ""] as const)),
      actual: Object.fromEntries(months.map((m) => [m, ""] as const)),
    },
    criticalIssues: [],
  };
};

const STORAGE_PREFIX = "wind_cpag_report_v1_";

export const loadStoredReportData = (projectId: string | number): Partial<WindCpagReportData> | null => {
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${projectId}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

export const saveStoredReportData = (projectId: string | number, data: WindCpagReportData) => {
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${projectId}`, JSON.stringify(data));
  } catch {
    // Local storage may be unavailable (private browsing, quota) - editing still works for the session.
  }
};
