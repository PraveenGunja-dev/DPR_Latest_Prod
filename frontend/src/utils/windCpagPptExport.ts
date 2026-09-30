import { CPAG_COLORS, WindCpagReportData, nextNMonths, formatMonthLabel } from "./windCpagReport";

// Builds a .pptx that mirrors the on-screen Wind CPAG report - same slide order, same table
// columns, same header colors - out of whatever the user has typed in so far.

type TableRow = { text: string; options?: any }[];

const HEADER_TEXT_OPTS = { color: "FFFFFF", bold: true, fontSize: 9, align: "center", valign: "middle", fill: { color: CPAG_COLORS.purple } };

const headerRow = (labels: string[], color = CPAG_COLORS.purple): TableRow =>
  labels.map((text) => ({ text, options: { ...HEADER_TEXT_OPTS, fill: { color } } }));

const dataRow = (values: string[], opts: any = {}): TableRow =>
  values.map((text) => ({ text: text || "-", options: { fontSize: 8, align: "center", valign: "middle", color: "1e293b", ...opts } }));

// Row heights that stretch a table down to fill a target height instead of leaving a large blank
// gap below it on the slide (pptxgenjs otherwise sizes each row to its own content only). Header
// row(s) stay compact; the remaining height is split evenly across the data rows. pptxgenjs
// treats a given rowH as a floor, not a cap, so a data row with more text than fits still grows -
// this only removes the empty space, it never clips content.
const fillRowHeights = (totalRows: number, headerRows: number, totalHeight: number, headerRowH = 0.45): number[] => {
  const dataRows = Math.max(0, totalRows - headerRows);
  const remaining = Math.max(0.3, totalHeight - headerRowH * headerRows);
  const dataRowH = dataRows > 0 ? remaining / dataRows : 0;
  return [...Array(headerRows).fill(headerRowH), ...Array(dataRows).fill(dataRowH)];
};

export const exportWindCpagToPpt = async (reportData: WindCpagReportData, projectName: string) => {
  const pptxgen = (await import("pptxgenjs")).default;
  const pres = new pptxgen();
  pres.layout = "LAYOUT_WIDE"; // 13.3" x 7.5"

  // Every slide gets a bottom-right page number by routing all slide creation through here,
  // rather than adding it individually in each of the 13 add*Slide functions below.
  let slideCount = 0;
  const newSlide = () => {
    slideCount += 1;
    const slide = pres.addSlide();
    slide.addText(String(slideCount), { x: 12.6, y: 7.12, w: 0.55, h: 0.3, fontSize: 10, color: "94a3b8", align: "right", valign: "middle", isTextBox: true });
    return slide;
  };

  const addTitleSlide = () => {
    const slide = newSlide();
    slide.background = { color: "FFFFFF" };

    // Illustrated artwork along the bottom, matching the on-screen cover and the source deck.
    slide.addImage({
      path: `${import.meta.env.BASE_URL}coverPhoto.png`,
      x: 0, y: 3.4, w: 13.33, h: 4.1,
      sizing: { type: "cover", w: 13.33, h: 4.1 },
    });

    slide.addImage({
      path: `${import.meta.env.BASE_URL}logo.png`,
      x: 0.5, y: 0.45, w: 1.8, h: 0.62,
      sizing: { type: "contain", w: 1.8, h: 0.62 },
    });

    const titleX = 6.6;
    const titleW = 6.2;
    slide.addText("CPAG - Energy Cluster", { x: titleX, y: 0.55, w: titleW, h: 0.5, fontSize: 22, bold: true, color: "1e293b", isTextBox: true });

    // pptxgenjs has no native gradient fill - approximate the source deck's rainbow underline
    // with a row of adjacent solid-color bars instead of a single flat color.
    const barColors = ["10b981", "0ea5e9", "6366f1", "a855f7", "ef4444"];
    const barY = 1.08, barH = 0.035;
    const segW = titleW / barColors.length;
    barColors.forEach((color, i) => {
      slide.addShape(pres.ShapeType.rect, { x: titleX + i * segW, y: barY, w: segW, h: barH, fill: { color }, line: { type: "none" } });
    });

    slide.addText("Adani Green Energy Ltd", { x: titleX, y: 1.25, w: titleW * 0.6, h: 0.4, fontSize: 16, bold: true, color: "1e293b", isTextBox: true });
    // Always "today" at download time - deliberately not reportData.meta.reportMonth (the
    // editable reporting-period field used elsewhere), so this slide never goes stale.
    slide.addText(formatMonthLabel(new Date()), { x: titleX + titleW * 0.6, y: 1.25, w: titleW * 0.4, h: 0.4, fontSize: 16, bold: true, color: "1e293b", align: "right", isTextBox: true });
  };

  const addAgendaSlide = () => {
    const slide = newSlide();
    slide.addText("Agenda", { x: 0.4, y: 0.2, w: 12, h: 0.6, fontSize: 28, bold: true, color: "1e293b", isTextBox: true });
    slide.addText(
      ["Executive Summary", "Project Information & Salient Features", "Progress Update", "Major Critical Issues"].map((t) => ({ text: t, options: { bullet: true, breakLine: true } })),
      { x: 1, y: 1.2, w: 10, h: 3, fontSize: 18, color: "334155", isTextBox: true }
    );
  };

  const addTitle = (slide: any, title: string) => {
    slide.addText(title, { x: 0.4, y: 0.15, w: 12.5, h: 0.5, fontSize: 22, bold: true, color: "1e293b", isTextBox: true });
  };

  const addExecSummarySlide = () => {
    const slide = newSlide();
    addTitle(slide, "Executive Summary");
    const e = reportData.execSummary;
    const rows: TableRow[] = [
      headerRow(["Location", "Project Name", "FY 27 Plan (MW)", `FY 27 Actual till ${reportData.meta.reportMonth} (MW)`, "COD\nRevised AOP Plan", "COD\nAchieved/Expected", "Progress\nPlan", "Progress\nActual", "Remarks"]),
      dataRow([reportData.meta.location, reportData.meta.projectFullName, e.fy27Plan, e.fy27Actual, e.codPlan, e.codAchieved, e.progressPlan, e.progressActual, e.remarks]),
    ];
    slide.addTable(rows, { x: 0.4, y: 0.9, w: 12.5, colW: [1.1, 2.6, 1.3, 1.7, 1.3, 1.3, 1, 1, 1.4], rowH: fillRowHeights(rows.length, 1, 2.3, 0.6), border: { type: "solid", color: "94a3b8", pt: 0.5 }, autoPage: false });
  };

  const addCommissioningSlide = () => {
    const slide = newSlide();
    addTitle(slide, `Commissioning: Plan vs. Forecast - ${projectName}`);
    const months = reportData.commissioning.months;
    // colW must sum to exactly the table's w (12.5) - it previously summed to 13.4 (1.4 + 16*0.75),
    // which pushed the table past the slide's own 13.33" width and clipped the rightmost columns.
    const colW = [1.4, ...months.map(() => (12.5 - 1.4) / months.length)];

    const budgetRows: TableRow[] = [
      headerRow(["Details", ...months], CPAG_COLORS.magenta),
      dataRow([reportData.meta.projectFullName || projectName, ...months.map((m) => reportData.commissioning.budget.values[m] || "")]),
    ];
    slide.addTable(budgetRows, { x: 0.4, y: 0.9, w: 12.5, colW, rowH: fillRowHeights(budgetRows.length, 1, 2.6, 0.5), border: { type: "solid", color: "94a3b8", pt: 0.5 }, autoPage: false, fontSize: 7 });

    const actualRows: TableRow[] = [
      headerRow(["Details", ...months], CPAG_COLORS.navy),
      dataRow([reportData.meta.projectFullName || projectName, ...months.map((m) => reportData.commissioning.actualForecast.values[m] || "")]),
    ];
    slide.addTable(actualRows, { x: 0.4, y: 4.0, w: 12.5, colW, rowH: fillRowHeights(actualRows.length, 1, 2.6, 0.5), border: { type: "solid", color: "94a3b8", pt: 0.5 }, autoPage: false, fontSize: 7 });
  };

  const addSalientFeaturesSlide = () => {
    const slide = newSlide();
    addTitle(slide, "Salient Features");
    const s = reportData.salient;
    const labelOpts = { bold: true, fontSize: 11, valign: "middle" as const };
    const valueOpts = { fontSize: 11, colspan: 5, align: "left" as const, valign: "middle" as const };
    const lav = { color: CPAG_COLORS.paleLavender };
    const rows: TableRow[] = [
      [{ text: "Project", options: { ...labelOpts, fill: { color: CPAG_COLORS.lightPurple } } }, { text: reportData.meta.projectFullName, options: { ...valueOpts, fill: { color: CPAG_COLORS.lightPurple } } }],
      [{ text: "Project Scope / Capacity", options: labelOpts }, { text: s.scopeCapacity || "-", options: valueOpts }],
      [{ text: "Owner / Developer", options: { ...labelOpts, fill: lav } }, { text: s.owner || "-", options: { ...valueOpts, fill: lav } }],
      [{ text: "Location", options: labelOpts }, { text: s.location || "-", options: valueOpts }],
      [{ text: "Land Area", options: { ...labelOpts, fill: lav } }, { text: s.landArea || "-", options: { ...valueOpts, fill: lav } }],
      [{ text: "Project Configuration", options: { ...labelOpts, fill: lav } }, { text: "Wind Turbine", options: { ...labelOpts, fill: lav, colspan: 5 } }],
      [{ text: "Parameters", options: labelOpts }, { text: s.turbineModel || "-", options: valueOpts }],
      headerRow(["Commissioning (FY 26-27)", "Q1", "Q2", "Q3", "Q4", "Total"], CPAG_COLORS.lightPurple).map((c) => ({ ...c, options: { ...c.options, fontSize: 11 } })),
      dataRow(["Budget Plan (MW)", s.quarters.q1.plan, s.quarters.q2.plan, s.quarters.q3.plan, s.quarters.q4.plan, s.quarters.total.plan], { align: "center", fontSize: 11 }),
      dataRow(["Actual / Expected (MW)", s.quarters.q1.actual, s.quarters.q2.actual, s.quarters.q3.actual, s.quarters.q4.actual, s.quarters.total.actual], { align: "center", fontSize: 11 }),
    ];
    // Fixed row heights so the table fills the slide down to near the bottom edge instead of
    // leaving a large blank gap below a handful of default-height rows.
    slide.addTable(rows, { x: 0.4, y: 0.9, w: 12.5, colW: [2.3, 2.04, 2.04, 2.04, 2.04, 2.04], rowH: 0.58, border: { type: "solid", color: "94a3b8", pt: 0.5 }, autoPage: false });
  };

  const addSiteLayoutSlide = () => {
    const slide = newSlide();
    addTitle(slide, `${projectName}: Site Layout`);
    if (reportData.siteLayout.imageDataUrl) {
      // A user-uploaded image comes in as a base64 data: URI (pptxgenjs wants that under `data`);
      // the default site layout map is a plain bundled asset path instead (wants `path`).
      const isDataUri = reportData.siteLayout.imageDataUrl.startsWith("data:");
      const imageProp = isDataUri ? { data: reportData.siteLayout.imageDataUrl } : { path: reportData.siteLayout.imageDataUrl };
      // Sized to the map's own 1468x882 aspect ratio, as large as fits beside the stats table
      // without the two overlapping (table starts at x=9).
      slide.addImage({ ...imageProp, x: 0.4, y: 0.9, w: 8.3, h: 4.99 });
    }
    const rows: TableRow[] = [
      dataRow(["No. of Private Locations", reportData.siteLayout.privateLocations], { align: "left" }),
      dataRow(["Acquired Locations (Registry Done)", reportData.siteLayout.acquiredLocations], { align: "left" }),
    ];
    slide.addTable(rows, { x: 9, y: 0.9, w: 3.8, colW: [2.6, 1.2], rowH: fillRowHeights(rows.length, 0, 5.0), border: { type: "solid", color: "94a3b8", pt: 0.5 }, autoPage: false });
  };

  const addSCurveSlide = () => {
    const slide = newSlide();
    addTitle(slide, "Overall S Curve");
    const months = reportData.manpower.months;
    slide.addChart(pres.ChartType.bar, [
      { name: "Monthly Plan", labels: months, values: months.map((m) => parseFloat(reportData.manpower.plan[m]) || 0) },
      { name: "Monthly Actual", labels: months, values: months.map((m) => parseFloat(reportData.manpower.actual[m]) || 0) },
    ], { x: 0.4, y: 0.8, w: 12.5, h: 3, barDir: "col", showLegend: true, legendPos: "b", showTitle: false, catAxisLabelFontSize: 6 });

    const g = reportData.gapAnalysis;
    const rows: TableRow[] = [
      headerRow(["Progress Parameter", "Weightage", "Cumm. Plan", "Cumm. Actual", "Variance", "Remarks for Variance"], CPAG_COLORS.blue),
      dataRow(["Engineering", g.engineering.weightage, g.engineering.cummPlan, g.engineering.cummActual, g.engineering.variance, g.engineering.remarks]),
      dataRow(["Procurement", g.procurement.weightage, g.procurement.cummPlan, g.procurement.cummActual, g.procurement.variance, g.procurement.remarks]),
      dataRow(["Construction", g.construction.weightage, g.construction.cummPlan, g.construction.cummActual, g.construction.variance, g.construction.remarks]),
      dataRow(["Total", g.total.weightage, g.total.cummPlan, g.total.cummActual, g.total.variance, g.total.remarks]),
    ];
    slide.addTable(rows, { x: 0.4, y: 4, w: 12.5, colW: [2.2, 1.6, 1.6, 1.6, 1.6, 3.9], rowH: fillRowHeights(rows.length, 1, 2.9, 0.4), border: { type: "solid", color: "94a3b8", pt: 0.5 }, autoPage: false, fontSize: 8 });
  };

  const addProcurementSlide = () => {
    const slide = newSlide();
    addTitle(slide, "Procurement & 3 Month Rolling Plan for Supply Status");
    const rollingMonths = nextNMonths(3);
    const rows: TableRow[] = [
      headerRow(["Sr No.", "Packages", "UOM", "Scope", "Ordering Completed", `Delivered up to ${reportData.meta.reportMonth}`, "Balance to Deliver", ...rollingMonths]),
      ...reportData.procurement.map((r) => dataRow([r.srNo, r.package, r.uom, r.scope, r.orderingCompleted, r.delivered, r.balance, ...rollingMonths.map((m) => r.rolling[m] || "")])),
    ];
    if (reportData.procurement.length === 0) rows.push(dataRow(["-", "No packages yet", "-", "-", "-", "-", "-", "-", "-", "-"]));
    // colW must sum to exactly `w` (12.7) - it previously summed to 12.5, leaving a thin blank strip.
    slide.addTable(rows, { x: 0.3, y: 0.9, w: 12.7, colW: [0.7, 2.8, 0.7, 0.8, 1.3, 1.5, 1.3, 1.2, 1.2, 1.2], rowH: fillRowHeights(rows.length, 1, 5.9, 0.6), border: { type: "solid", color: "94a3b8", pt: 0.5 }, autoPage: false, fontSize: 7 });
  };

  const addConstructionSlide = () => {
    const slide = newSlide();
    addTitle(slide, "Construction Progress Update");
    const rollingMonths = nextNMonths(3);
    const rows: TableRow[] = [
      headerRow(["Activity", "UOM", "Scope", "Completed", "Balance", "Preceding Plan", "Preceding Actual", ...rollingMonths, "Completion Target"]),
      ...reportData.construction.map((r) => dataRow([r.activity, r.uom, r.scope, r.completed, r.balance, r.precedingPlan, r.precedingActual, ...rollingMonths.map((m) => r.rolling[m] || ""), r.completionTarget])),
    ];
    // colW must sum to exactly `w` (12.9) - pptxgenjs sizes the table to the colW total, not the
    // declared w, so a short sum (this one summed to 10.8) left a blank strip on the right.
    slide.addTable(rows, { x: 0.2, y: 0.9, w: 12.9, colW: [2.4, 0.72, 0.84, 0.96, 0.84, 1.08, 1.08, 1.2, 1.2, 1.2, 1.44], rowH: fillRowHeights(rows.length, 1, 5.9, 0.6), border: { type: "solid", color: "94a3b8", pt: 0.5 }, autoPage: false, fontSize: 7 });
  };

  const addMilestonesSlide = () => {
    const slide = newSlide();
    addTitle(slide, "Major Milestone - Next 3 Months");
    const rows: TableRow[] = [
      headerRow(reportData.milestones.map((m) => m.month)),
      dataRow(reportData.milestones.map((m) => m.text), { align: "left", valign: "top" }),
    ];
    slide.addTable(rows, { x: 0.4, y: 0.9, w: 12.5, border: { type: "solid", color: "94a3b8", pt: 0.5 }, autoPage: false, fontSize: 10, rowH: fillRowHeights(rows.length, 1, 5.9, 0.5) });
  };

  const addManpowerSlide = () => {
    const slide = newSlide();
    addTitle(slide, `${projectName}: Manpower Deployment Plan vs Actual`);
    const months = reportData.manpower.months;
    slide.addChart(pres.ChartType.bar, [
      { name: "Plan Manpower", labels: months, values: months.map((m) => parseFloat(reportData.manpower.plan[m]) || 0) },
      { name: "Actual Manpower", labels: months, values: months.map((m) => parseFloat(reportData.manpower.actual[m]) || 0) },
    ], { x: 0.4, y: 0.8, w: 12.5, h: 5.8, barDir: "col", showLegend: true, legendPos: "b", showTitle: false, catAxisLabelFontSize: 6 });
  };

  const addCriticalIssuesSlide = () => {
    const slide = newSlide();
    addTitle(slide, `Major Critical Issues / Support Desired - ${projectName}`);
    const rows: TableRow[] = [
      headerRow(["S.N.", "Issues", "Potential Impact", "Root Cause", "Corrective Action", "Whom", "Date", "Current Status", "Support Required"]),
      ...reportData.criticalIssues.map((r) => dataRow([r.sn, r.issue, r.impact, r.rootCause, r.correctiveAction, r.actionByWhom, r.actionByDate, r.currentStatus, r.supportRequired], { align: "left" })),
    ];
    if (reportData.criticalIssues.length === 0) rows.push(dataRow(["-", "No issues added", "-", "-", "-", "-", "-", "-", "-"], { align: "left" }));
    // colW must sum to exactly `w` (12.9) - it previously summed to 12.0, leaving a blank strip.
    slide.addTable(rows, { x: 0.2, y: 0.9, w: 12.9, colW: [0.55, 1.95, 1.72, 1.72, 1.72, 0.86, 0.97, 1.72, 1.68], rowH: fillRowHeights(rows.length, 1, 5.9, 0.5), border: { type: "solid", color: "94a3b8", pt: 0.5 }, autoPage: false, fontSize: 7 });
  };

  const addThankYouSlide = () => {
    const slide = newSlide();
    slide.addText("Thank You", { x: 0, y: 3.2, w: 13.3, h: 1, fontSize: 36, bold: true, align: "center", color: "1e293b", isTextBox: true });
  };

  addTitleSlide();
  addAgendaSlide();
  addExecSummarySlide();
  addCommissioningSlide();
  addSalientFeaturesSlide();
  addSiteLayoutSlide();
  addSCurveSlide();
  addProcurementSlide();
  addConstructionSlide();
  addMilestonesSlide();
  addManpowerSlide();
  addCriticalIssuesSlide();
  addThankYouSlide();

  const safeName = (reportData.meta.projectFullName || projectName || "Wind_Project").replace(/[^a-z0-9]+/gi, "_");
  await pres.writeFile({ fileName: `${safeName}_CPAG_Energy_Monthly_Report_${reportData.meta.reportMonth}.pptx` });
};
