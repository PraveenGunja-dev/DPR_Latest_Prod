import React, { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { motion } from "framer-motion";
import { Hammer, Truck, Search, Download, Loader2, ShoppingCart, BarChart3, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { getEDDeliveryData, getEDEngineeringData, getEDOrderingData, getWindAchievements, saveWindAchievements } from "@/services/p6ActivityService";
import { getProjectById } from "@/services/projectService";
import { EDSummaryDashboard } from "./EDSummaryDashboard";
import { detectProjectType } from "@/utils/projectUtils";

interface EDSheetsModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId?: string | number;
  projectName?: string;
  projectType?: string;
  dateFilter?: string | null;
}

const parseDateRobustly = (d: any): Date | null => {
  if (!d || d === "-") return null;
  const date = new Date(d);
  if (!isNaN(date.getTime())) return date;

  if (typeof d === "string") {
    const parts = d.split(/[-/]/);
    if (parts.length === 3) {
      const try2 = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
      if (!isNaN(try2.getTime())) return try2;
    }
  }
  return null;
};

const formatDate = (d: any): string => {
  if (!d) return "-";
  try {
    const date = parseDateRobustly(d);
    if (!date) return "-";
    return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return "-";
  }
};

const DateCell = ({ actual, forecast }: { actual: any; forecast: any }) => {
  const actualStr = formatDate(actual);
  if (actualStr !== "-") {
    return <span className="text-emerald-600 dark:text-emerald-500 font-bold">{actualStr}</span>;
  }
  const forecastStr = formatDate(forecast);
  if (forecastStr !== "-") {
    return <span className="text-blue-600 dark:text-blue-500 font-semibold">{forecastStr}</span>;
  }
  return <span className="text-slate-400">-</span>;
};

// ============================================================================
// MAIN MODAL COMPONENT
// ============================================================================

export const EDSheetsModal: React.FC<EDSheetsModalProps> = ({
  isOpen,
  onClose,
  projectId,
  projectName,
  projectType,
  dateFilter
}) => {
  const [activeTab, setActiveTab] = useState<"summary" | "engineering" | "ordering" | "delivery">("summary");
  const [engineeringData, setEngineeringData] = useState<{ data: any[]; groups: any[] }>({ data: [], groups: [] });
  const [orderingData, setOrderingData] = useState<{ data: any[]; groups: any[] }>({ data: [], groups: [] });
  const [deliveryData, setDeliveryData] = useState<{ data: any[]; groups: any[] }>({ data: [], groups: [] });
  const [achievementData, setAchievementData] = useState<any>(null);
  const [dataDate, setDataDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const isWind = detectProjectType({ projectType }, projectName) === 'wind';

  useEffect(() => {
    if (isOpen && projectId) {
      setLoading(true);
      Promise.all([
        getEDEngineeringData(projectId),
        getEDOrderingData(projectId),
        getEDDeliveryData(projectId),
        getWindAchievements(projectId),
        getProjectById(projectId as any)
      ]).then(([eng, ord, del, ach, proj]) => {
        setEngineeringData(eng);
        setOrderingData(ord);
        setDeliveryData(del);
        setAchievementData(ach);
        setDataDate(proj?.data_date || null);
      }).catch(console.error)
        .finally(() => setLoading(false));
    }
  }, [isOpen, projectId]);

  // Reset search on tab switch
  useEffect(() => setSearchTerm(""), [activeTab]);

  const handleExport = (mode: "current" | "all") => {
    const modeLabel = mode === "all" ? "all sheets" : `${activeTab} sheet`;
    const exportToast = toast.loading(`Preparing export (${modeLabel})...`);

    import("xlsx").then((XLSX) => {
      const filename = mode === "all"
        ? `${projectName || "Project"}_ED_Tracker_Complete_${new Date().toISOString().split('T')[0]}.xlsx`
        : `${projectName || "Project"}_${activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}_Tracker_${new Date().toISOString().split('T')[0]}.xlsx`;

      const workbook = XLSX.utils.book_new();

      // Helper generators
      const getEngSheet = () => {
        const engList = engineeringData.data && engineeringData.data.length > 0 ? engineeringData.data : [];
        const engData = engList.length > 0 ? engList.map((row: any) => ({
          "Activity ID": row.activityId || "-",
          "Description": row.description || "-",
          "Main Heading": row.mainHeading || "-",
          "Sub Heading": row.subHeading || "-",
          "Baseline Start": formatDate(row.baselineStart),
          "Baseline Finish": formatDate(row.baselineFinish),
          "Actual / Forecast Start": formatDate(row.actualStart) !== "-" ? formatDate(row.actualStart) : formatDate(row.forecastStart),
          "Actual / Forecast Finish": formatDate(row.actualFinish) !== "-" ? formatDate(row.actualFinish) : formatDate(row.forecastFinish),
          "% Completion": row.percent_complete ? `${parseFloat(row.percent_complete).toFixed(2)}%` : "0%"
        })) : [{
          "Activity ID": "-", "Description": "No engineering data available", "Main Heading": "-", "Sub Heading": "-",
          "Baseline Start": "-", "Baseline Finish": "-", "Actual / Forecast Start": "-", "Actual / Forecast Finish": "-", "% Completion": "-"
        }];
        return XLSX.utils.json_to_sheet(engData);
      };

      const getOrdSheet = () => {
        const ordList = orderingData.data && orderingData.data.length > 0 ? orderingData.data : [];
        const ordData = ordList.length > 0 ? ordList.map((row: any, idx: number) => {
          const baseRow: any = {
            "Sr.": idx + 1,
            "Package": row.packages || row.plot || "-",
            "Scope": Number(row.scope) || 0,
            "UOM": row.uom || "-",
            "Vendor": row.supplierOem || "-",
            "Order Qty": Number(row.orderQty) || 0,
            "Complete": Number(row.completed) || 0,
            "Balance": Number(row.balance) || 0,
          };
          if (isWind) {
            return {
              ...baseRow,
              "BOQ BL Start": "-",
              "BOQ BL Finish": "-",
              "BOQ Actual Start": "-",
              "BOQ Actual Finish": "-",
              "PR BL Start": "-",
              "PR BL Finish": "-",
              "PR Actual Start": "-",
              "PR Actual Finish": "-",
              "TBER BL Start": "-",
              "TBER BL Finish": "-",
              "TBER Actual Start": "-",
              "TBER Actual Finish": "-",
              "NFA BL Start": "-",
              "NFA BL Finish": "-",
              "NFA Actual Start": "-",
              "NFA Actual Finish": "-",
              "PO/SO BL Start": formatDate(row.baselineStart),
              "PO/SO BL Finish": formatDate(row.baselineFinish),
              "PO/SO Actual Start": formatDate(row.actualStart) !== "-" ? formatDate(row.actualStart) : formatDate(row.forecastStart),
              "PO/SO Actual Finish": formatDate(row.actualFinish) !== "-" ? formatDate(row.actualFinish) : formatDate(row.forecastFinish)
            };
          } else {
            return {
              ...baseRow,
              "Baseline Start": formatDate(row.baselineStart),
              "Baseline Finish": formatDate(row.baselineFinish),
              "Actual / Forecast Start": formatDate(row.actualStart) !== "-" ? formatDate(row.actualStart) : formatDate(row.forecastStart),
              "Actual / Forecast Finish": formatDate(row.actualFinish) !== "-" ? formatDate(row.actualFinish) : formatDate(row.forecastFinish)
            };
          }
        }) : [{
          "Sr.": 1, "Package": "No ordering data mapped yet", "Scope": 0, "UOM": "-", "Vendor": "-", "Order Qty": 0, "Complete": 0, "Balance": 0,
          ...(isWind ? {
            "BOQ BL Start": "-", "BOQ BL Finish": "-", "BOQ Actual Start": "-", "BOQ Actual Finish": "-",
            "PR BL Start": "-", "PR BL Finish": "-", "PR Actual Start": "-", "PR Actual Finish": "-",
            "TBER BL Start": "-", "TBER BL Finish": "-", "TBER Actual Start": "-", "TBER Actual Finish": "-",
            "NFA BL Start": "-", "NFA BL Finish": "-", "NFA Actual Start": "-", "NFA Actual Finish": "-",
            "PO/SO BL Start": "-", "PO/SO BL Finish": "-", "PO/SO Actual Start": "-", "PO/SO Actual Finish": "-"
          } : {
            "Baseline Start": "-", "Baseline Finish": "-", "Actual / Forecast Start": "-", "Actual / Forecast Finish": "-"
          })
        }];
        return XLSX.utils.json_to_sheet(ordData);
      };

      const getDelSheet = () => {
        const delList = deliveryData.data && deliveryData.data.length > 0 ? deliveryData.data : [];
        const delData = delList.length > 0 ? delList.map((row: any, idx: number) => ({
          "S.No": idx + 1,
          "Description": row.description || "-",
          "Main Heading": row.subWbs || "-",
          "Sub Heading": row.wbsName !== row.subWbs ? (row.wbsName || "-") : "-",
          "Vendor": row.vendorName || "-",
          "UOM": row.uom || "-",
          "Scope": Number(row.scope) || 0,
          "Actual": Number(row.completed) || 0,
          "Balance": Number(row.balance) || ((Number(row.scope) || 0) - (Number(row.completed) || 0)),
          "At Completion": Number(row.scope) || 0,
          "Baseline Start": formatDate(row.baselineStart),
          "Baseline Finish": formatDate(row.baselineFinish),
          "Actual / Forecast Start": formatDate(row.actualStart) !== "-" ? formatDate(row.actualStart) : formatDate(row.forecastStart),
          "Actual / Forecast Finish": formatDate(row.actualFinish) !== "-" ? formatDate(row.actualFinish) : formatDate(row.forecastFinish)
        })) : [{
          "S.No": 1, "Description": "No delivery data available", "Main Heading": "-", "Sub Heading": "-", "Vendor": "-", "UOM": "-", "Scope": 0, "Actual": 0, "Balance": 0, "At Completion": 0,
          "Baseline Start": "-", "Baseline Finish": "-", "Actual / Forecast Start": "-", "Actual / Forecast Finish": "-"
        }];
        return XLSX.utils.json_to_sheet(delData);
      };

      const getAchSheet = () => {
        if (!achievementData || !achievementData.months || achievementData.months.length === 0) {
          return XLSX.utils.json_to_sheet([{ "Activity": "No productivity data available" }]);
        }

        const m = achievementData.months;
        const auto = achievementData;
        const e = achievementData; // editable/manual is also in achievementData object returned from api

        const getCol = (i: number) => XLSX.utils.encode_col(i + 3);
        const numVal = (v: any) => (v !== undefined && v !== null && v !== "") ? Number(v) : "";

        // Create flattened rows for Excel - populate with actual values so it doesn't show 0 on first open!
        const rows = [
          { "Sr No": 1, "Activity": "Stone Column", "Resources & Work Done": "Rigs", ...Object.fromEntries(m.map((month: string) => [month, numVal(e.rigs?.[month])])) },
          { "Sr No": "", "Activity": "", "Resources & Work Done": "No of Columns", ...Object.fromEntries(m.map((month: string, i: number) => [month, numVal(auto.stone_column?.no_of_columns?.[i])])) },
          { "Sr No": "", "Activity": "", "Resources & Work Done": "Cumm SC", ...Object.fromEntries(m.map((month: string, i: number) => [month, numVal(auto.stone_column?.cumm_sc?.[i])])) },
          { "Sr No": "", "Activity": "", "Resources & Work Done": "Productivity", ...Object.fromEntries(m.map((month: string, i: number) => [month, numVal(auto.stone_column?.productivity?.[i])])) },

          { "Sr No": 2, "Activity": "WTG Foundation", "Resources & Work Done": "Gangs", ...Object.fromEntries(m.map((month: string) => [month, numVal(e.gangs?.[month])])) },
          { "Sr No": "", "Activity": "", "Resources & Work Done": "No of Foundations", ...Object.fromEntries(m.map((month: string, i: number) => [month, numVal(auto.wtg_foundation?.no_of_foundations?.[i])])) },
          { "Sr No": "", "Activity": "", "Resources & Work Done": "Cumm Foundations", ...Object.fromEntries(m.map((month: string, i: number) => [month, numVal(auto.wtg_foundation?.cumm_foundations?.[i])])) },
          { "Sr No": "", "Activity": "", "Resources & Work Done": "Productivity", ...Object.fromEntries(m.map((month: string, i: number) => [month, numVal(auto.wtg_foundation?.productivity?.[i])])) },

          { "Sr No": 3, "Activity": "WTG Erection", "Resources & Work Done": "Cranes Packages", ...Object.fromEntries(m.map((month: string) => [month, numVal(e.cranes?.[month])])) },
          { "Sr No": "", "Activity": "", "Resources & Work Done": "No of Erections", ...Object.fromEntries(m.map((month: string, i: number) => [month, numVal(auto.wtg_erection?.no_of_erections?.[i])])) },
          { "Sr No": "", "Activity": "", "Resources & Work Done": "Cumm Erections", ...Object.fromEntries(m.map((month: string, i: number) => [month, numVal(auto.wtg_erection?.cumm_erections?.[i])])) },
          { "Sr No": "", "Activity": "", "Resources & Work Done": "Productivity", ...Object.fromEntries(m.map((month: string, i: number) => [month, numVal(auto.wtg_erection?.productivity?.[i])])) },

          { "Sr No": 4, "Activity": "WTG Commissioning", "Resources & Work Done": "Commissioning", ...Object.fromEntries(m.map((month: string) => [month, numVal(e.commissioning?.[month])])) },
          { "Sr No": "", "Activity": "", "Resources & Work Done": "No of Commissioning", ...Object.fromEntries(m.map((month: string, i: number) => [month, numVal(auto.wtg_commissioning?.no_of_commissioning?.[i])])) },
          { "Sr No": "", "Activity": "", "Resources & Work Done": "Cumm Commissioning", ...Object.fromEntries(m.map((month: string, i: number) => [month, numVal(auto.wtg_commissioning?.cumm_commissioning?.[i])])) },
        ];

        const ws = XLSX.utils.json_to_sheet(rows);

        // Post-process to map string "=..." to actual Excel formula cells
        // But since we are now providing ACTUAL VALUES, we map the formulas manually to the corresponding rows!
        const formulaRows = [
          { cummRow: 4, prodRow: 5, actualRow: 3, resRow: 2 },  // Stone Column (Excel row indices are 1-based, JSON starts from row 2 because header is row 1)
          { cummRow: 8, prodRow: 9, actualRow: 7, resRow: 6 },  // Foundation
          { cummRow: 12, prodRow: 13, actualRow: 11, resRow: 10 }, // Erection
          { cummRow: 16, prodRow: -1, actualRow: 15, resRow: 14 }  // Commissioning (No productivity row)
        ];

        formulaRows.forEach(cfg => {
          for (let i = 0; i < m.length; i++) {
            const col = getCol(i);
            const prevCol = i > 0 ? getCol(i - 1) : null;

            // Add Cumm formula
            const cummCellRef = `${col}${cfg.cummRow}`;
            if (ws[cummCellRef]) {
              ws[cummCellRef].f = i === 0 ? `SUM(${col}${cfg.actualRow})` : `SUM(${col}${cfg.actualRow},${prevCol}${cfg.cummRow})`;
            }

            // Add Productivity formula if it exists
            if (cfg.prodRow !== -1) {
              const prodCellRef = `${col}${cfg.prodRow}`;
              if (ws[prodCellRef]) {
                ws[prodCellRef].f = `IFERROR(${col}${cfg.actualRow}/${col}${cfg.resRow}, "")`;
              }
            }
          }
        });

        return ws;
      };

      if (mode === "all") {
        XLSX.utils.book_append_sheet(workbook, getEngSheet(), "Engineering");
        XLSX.utils.book_append_sheet(workbook, getOrdSheet(), "Ordering(Supply)");
        XLSX.utils.book_append_sheet(workbook, getDelSheet(), "Delivery");

      } else {
        if (activeTab === "engineering") {
          XLSX.utils.book_append_sheet(workbook, getEngSheet(), "Engineering");
        } else if (activeTab === "ordering") {
          XLSX.utils.book_append_sheet(workbook, getOrdSheet(), "Ordering(Supply)");
        } else if (activeTab === "delivery") {
          XLSX.utils.book_append_sheet(workbook, getDelSheet(), "Delivery");
        } else if (activeTab === "summary") {
          // Summary represents the whole project, so export all 3 sheets if clicked here
          XLSX.utils.book_append_sheet(workbook, getEngSheet(), "Engineering");
          XLSX.utils.book_append_sheet(workbook, getOrdSheet(), "Ordering(Supply)");
          XLSX.utils.book_append_sheet(workbook, getDelSheet(), "Delivery");
        }
      }

      XLSX.writeFile(workbook, filename);
      toast.success(`Export completed successfully!`, { id: exportToast });
    }).catch(err => {
      console.error("Export failed:", err);
      toast.error("Export failed. Please check console for details.", { id: exportToast });
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-[90vw] w-[90vw] h-[90vh] max-h-[90vh] flex flex-col p-0 overflow-hidden bg-slate-50 dark:bg-slate-950 border-0 shadow-2xl rounded-2xl">
        <DialogHeader className="px-8 py-5 border-b border-white/10 gradient-adani z-10 shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="text-2xl font-extrabold tracking-tight text-white">
                {projectName || "Project"} <span className="text-white/60 font-normal">|</span> <span className="text-white">E&D Tracker</span>
              </DialogTitle>
              <p className="text-sm text-white/80 mt-1">Manage Engineering workflows and Material Delivery schedules</p>
            </div>

            <div className="flex items-center gap-2.5">
              <Button
                variant="outline"
                size="sm"
                className="flex h-9 rounded-full px-4 text-xs font-semibold bg-white/10 text-white hover:bg-white/20 border-white/20"
                onClick={() => handleExport("current")}
                disabled={loading}
              >
                <Download className="w-3.5 h-3.5 mr-1.5" /> Export Current Sheet
              </Button>
              <Button
                size="sm"
                className="flex h-9 rounded-full px-4 text-xs font-semibold shadow-sm bg-white text-blue-900 hover:bg-slate-100"
                onClick={() => handleExport("all")}
                disabled={loading}
              >
                <Download className="w-3.5 h-3.5 mr-1.5" /> Export All Sheets
              </Button>
            </div>
          </div>

          {/* Premium Segmented Toggle */}
          <div className="flex justify-center mt-6 -mb-5">
            <div className="flex p-1.5 space-x-2 bg-slate-100 dark:bg-slate-800 rounded-full border border-slate-200/50 dark:border-slate-700/50 shadow-inner">
              <button
                onClick={() => setActiveTab("summary")}
                className={`relative flex items-center justify-center gap-2 px-6 py-2.5 text-sm font-bold rounded-full transition-all duration-300 w-44 ${activeTab === "summary"
                  ? "text-white shadow-md"
                  : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-200/50 dark:hover:bg-slate-700/50"
                  }`}
              >
                {activeTab === "summary" && (
                  <motion.div
                    layoutId="edModalTabIndicator"
                    className="absolute inset-0 bg-gradient-to-r from-[#6366f1] to-[#4f46e5] rounded-full"
                    initial={false}
                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                  />
                )}
                <BarChart3 className="w-4 h-4 relative z-10" />
                <span className="relative z-10 tracking-wide">SUMMARY</span>
              </button>

              <button
                onClick={() => setActiveTab("engineering")}
                className={`relative flex items-center justify-center gap-2 px-6 py-2.5 text-sm font-bold rounded-full transition-all duration-300 w-44 ${activeTab === "engineering"
                  ? "text-white shadow-md"
                  : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-200/50 dark:hover:bg-slate-700/50"
                  }`}
              >
                {activeTab === "engineering" && (
                  <motion.div
                    layoutId="edModalTabIndicator"
                    className="absolute inset-0 bg-gradient-to-r from-[#00609C] to-[#004f80] rounded-full"
                    initial={false}
                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                  />
                )}
                <Hammer className="w-4 h-4 relative z-10" />
                <span className="relative z-10 tracking-wide">ENGINEERING</span>
              </button>

              <button
                onClick={() => setActiveTab("ordering")}
                className={`relative flex items-center justify-center gap-2 px-6 py-2.5 text-sm font-bold rounded-full transition-all duration-300 w-44 ${activeTab === "ordering"
                  ? "text-white shadow-md"
                  : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-200/50 dark:hover:bg-slate-700/50"
                  }`}
              >
                {activeTab === "ordering" && (
                  <motion.div
                    layoutId="edModalTabIndicator"
                    className="absolute inset-0 bg-gradient-to-r from-[#d97706] to-[#b45309] rounded-full"
                    initial={false}
                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                  />
                )}
                <ShoppingCart className="w-4 h-4 relative z-10" />
                <span className="relative z-10 tracking-wide">ORDERING(SUPPLY)</span>
              </button>

              <button
                onClick={() => setActiveTab("delivery")}
                className={`relative flex items-center justify-center gap-2 px-6 py-2.5 text-sm font-bold rounded-full transition-all duration-300 w-44 ${activeTab === "delivery"
                  ? "text-white shadow-md"
                  : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-200/50 dark:hover:bg-slate-700/50"
                  }`}
              >
                {activeTab === "delivery" && (
                  <motion.div
                    layoutId="edModalTabIndicator"
                    className="absolute inset-0 bg-gradient-to-r from-[#72216e] to-[#8e2a89] rounded-full"
                    initial={false}
                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                  />
                )}
                <Truck className="w-4 h-4 relative z-10" />
                <span className="relative z-10 tracking-wide">DELIVERY</span>
              </button>


            </div>
          </div>
        </DialogHeader>

        {/* Content Area */}
        <div className="flex-1 overflow-hidden min-h-0 p-6 md:p-8 bg-slate-50 dark:bg-slate-950">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <Loader2 className="w-10 h-10 mx-auto mb-4 animate-spin text-primary" />
                <p className="text-muted-foreground text-sm">Loading P6 data...</p>
              </div>
            </div>
          ) : (
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="h-full min-h-0"
            >
              {activeTab === "summary" ? (
                <EDSummaryDashboard engineeringData={engineeringData.data} orderingData={orderingData.data} deliveryData={deliveryData.data} />
              ) : activeTab === "engineering" ? (
                <EngineeringTable data={engineeringData.data} groups={engineeringData.groups} searchTerm={searchTerm} setSearchTerm={setSearchTerm} dateFilter={dateFilter} dataDate={dataDate} />
              ) : activeTab === "ordering" ? (
                <OrderingTable data={orderingData.data} groups={orderingData.groups} searchTerm={searchTerm} setSearchTerm={setSearchTerm} dateFilter={dateFilter} dataDate={dataDate} isWind={isWind} />
              ) : activeTab === "delivery" ? (
                <DeliveryTable data={deliveryData.data} groups={deliveryData.groups} searchTerm={searchTerm} setSearchTerm={setSearchTerm} dateFilter={dateFilter} dataDate={dataDate} />
              ) : null}
            </motion.div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

// ============================================================================
// ENGINEERING TABLE - Grouped by main heading → sub-heading → activities
// ============================================================================

const EngineeringTable = ({ data, groups, searchTerm, setSearchTerm, dateFilter, dataDate }: { data: any[]; groups: any[]; searchTerm: string; setSearchTerm: (s: string) => void; dateFilter?: string | null; dataDate?: string | null }) => {
  const filteredData = useMemo(() => {
    let result = data;
    if (dateFilter) {
      const now = new Date();
      const days = dateFilter === "Last 7 days" ? 7 : dateFilter === "Last 30 days" ? 30 : 0;
      if (days > 0) {
        const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
        result = result.filter((row: any) => {
          if (row.status === 'Not Started') return false;
          if (row.actualStart && row.actualStart !== "-") {
            const start = parseDateRobustly(row.actualStart);
            return start !== null && start >= cutoff && start <= now;
          }
          return false;
        });
      } else if (dateFilter === "Delayed Activities") {
        result = result.filter((row: any) => {
          if (row.status !== 'In Progress') return false;

          const planDateStr = row.plannedFinish || row.basePlanFinish || row.baselineFinish || row.plannedFinishDate || row.baselineFinishDate || row.forecastFinish;
          if (!planDateStr || planDateStr === "-") return false;

          const planFinish = parseDateRobustly(planDateStr);
          if (!planFinish) return false;

          const referenceDate = dataDate ? parseDateRobustly(dataDate) : new Date();
          if (!referenceDate) return false;

          return planFinish < referenceDate;
        });
      } else {
        result = result;
      }
    }

    if (!searchTerm) return result;
    const term = searchTerm.toLowerCase();
    return result.filter((row: any) =>
      (row.description || "").toLowerCase().includes(term) ||
      (row.activityId || "").toLowerCase().includes(term) ||
      (row.mainHeading || "").toLowerCase().includes(term) ||
      (row.subHeading || "").toLowerCase().includes(term)
    );
  }, [data, searchTerm, dateFilter]);

  // Determine if percent_complete is on a 0-1 scale or 0-100 scale
  const pctScale = useMemo(() => {
    const maxPct = Math.max(0, ...filteredData.map((r: any) => parseFloat(r.percent_complete) || 0));
    return maxPct > 1 ? 1 : 100;
  }, [filteredData]);

  // Build ordered rows with heading/sub-heading rows interleaved
  const tableRows = useMemo(() => {
    const rows: any[] = [];
    let currentMain = "";
    let currentSub = "";

    filteredData.forEach((act: any) => {
      if (act.mainHeading && act.mainHeading !== currentMain) {
        currentMain = act.mainHeading;
        currentSub = ""; // reset
        rows.push({ _type: "mainHeading", label: currentMain });
      }
      if (act.subHeading && act.subHeading !== currentSub) {
        currentSub = act.subHeading;
        rows.push({ _type: "subHeading", label: currentSub });
      }
      rows.push(act);
    });
    return rows;
  }, [filteredData]);

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm overflow-hidden flex flex-col h-full">
      <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/50 shrink-0">
        <h3 className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
          <Hammer className="w-4 h-4 text-[#00609C]" /> Engineering Progress
          <span className="text-xs text-slate-400 font-normal ml-2">({data.length} activities)</span>
        </h3>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3 text-[11px] font-medium border border-slate-200 dark:border-slate-700 rounded-full px-3 py-1 bg-white dark:bg-slate-900 shadow-sm">
            <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-500"><div className="w-2 h-2 rounded-full bg-emerald-500"></div>Actual</span>
            <span className="text-slate-300 dark:text-slate-600">|</span>
            <span className="flex items-center gap-1.5 text-blue-600 dark:text-blue-500"><div className="w-2 h-2 rounded-full bg-blue-500"></div>Forecast</span>
          </div>
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search activities..."
              className="h-9 w-64 pl-9 pr-4 text-sm rounded-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-[#00609C]/50 transition-all"
            />
          </div>
        </div>
      </div>
      <div className="overflow-auto flex-1">
        <table className="w-full text-sm text-left whitespace-nowrap">
          <thead className="text-xs text-slate-500 bg-slate-50 dark:bg-slate-900 uppercase sticky top-0 z-10 border-b border-slate-200 dark:border-slate-800 shadow-sm">
            <tr>
              <th className="px-5 py-3 font-semibold tracking-wider">Activity ID</th>
              <th className="px-5 py-3 font-semibold tracking-wider">Description</th>
              <th className="px-5 py-3 font-semibold tracking-wider">Baseline Start</th>
              <th className="px-5 py-3 font-semibold tracking-wider">Baseline Finish</th>
              <th className="px-5 py-3 font-semibold tracking-wider text-center">Actual / Forecast Start</th>
              <th className="px-5 py-3 font-semibold tracking-wider text-center">Actual / Forecast Finish</th>
              <th className="px-5 py-3 font-semibold tracking-wider text-center">% Completion</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {tableRows.length === 0 && (
              <tr><td colSpan={7} className="px-6 py-12 text-center text-muted-foreground">No engineering data found for this project.</td></tr>
            )}
            {tableRows.map((row: any, i: number) => {
              if (row._type === "mainHeading") {
                return (
                  <tr key={`mh-${i}`} className="bg-slate-100/60 dark:bg-slate-800/40">
                    <td colSpan={7} className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-1.5 h-4 bg-[#00609C] rounded-full"></div>
                        <span className="font-bold text-sm text-slate-800 dark:text-slate-200 tracking-wide uppercase">{row.label}</span>
                      </div>
                    </td>
                  </tr>
                );
              }
              if (row._type === "subHeading") {
                return (
                  <tr key={`sh-${i}`} className="bg-slate-50/50 dark:bg-slate-800/20">
                    <td colSpan={7} className="px-8 py-2">
                      <div className="flex items-center gap-2">
                        <div className="w-1 h-3 bg-slate-300 dark:bg-slate-600 rounded-full"></div>
                        <span className="font-semibold text-xs text-slate-600 dark:text-slate-400 tracking-wider uppercase">{row.label}</span>
                      </div>
                    </td>
                  </tr>
                );
              }
              const pctRaw = parseFloat(row.percent_complete) || 0;
              const pct = pctRaw * pctScale;
              const hasData = row.activityId || row.description;
              return (
                <tr key={`act-${i}`} className="hover:bg-blue-50/30 dark:hover:bg-slate-800/60 transition-colors group">
                  <td className="px-5 py-3 font-medium text-slate-500 dark:text-slate-400 text-xs">{row.activityId || "-"}</td>
                  <td className="px-5 py-3 text-slate-900 dark:text-slate-100 min-w-[250px] whitespace-normal text-xs font-medium group-hover:text-[#00609C] transition-colors">{row.description || "-"}</td>
                  <td className="px-5 py-3 text-slate-500 dark:text-slate-400 text-xs">{formatDate(row.baselineStart)}</td>
                  <td className="px-5 py-3 text-slate-500 dark:text-slate-400 text-xs">{formatDate(row.baselineFinish)}</td>
                  <td className="px-5 py-3 text-xs bg-slate-50/30 dark:bg-slate-800/10 text-center"><DateCell actual={row.actualStart} forecast={row.forecastStart} /></td>
                  <td className="px-5 py-3 text-xs bg-slate-50/30 dark:bg-slate-800/10 text-center"><DateCell actual={row.actualFinish} forecast={row.forecastFinish} /></td>
                  <td className="px-5 py-3">
                    {hasData ? (
                      <div className="flex items-center justify-center gap-3">
                        <div className="w-24 h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden shadow-inner">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${pct >= 100 ? 'bg-emerald-500' : pct > 0 ? 'bg-gradient-to-r from-[#00609C] to-blue-400' : 'bg-transparent'}`}
                            style={{ width: `${Math.min(pct, 100)}%` }}
                          />
                        </div>
                        <span className={`text-xs font-bold w-10 text-right ${pct >= 100 ? 'text-emerald-600 dark:text-emerald-400' : pct > 0 ? 'text-[#00609C] dark:text-blue-400' : 'text-slate-400'}`}>
                          {pct > 0 ? `${pct.toFixed(0)}%` : "-"}
                        </span>
                      </div>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ============================================================================
// DELIVERY TABLE - Grouped by sub-WBS (Piling Stub - MMS, etc.)
// ============================================================================

const DeliveryTable = ({ data, groups, searchTerm, setSearchTerm, dateFilter, dataDate }: { data: any[]; groups: any[]; searchTerm: string; setSearchTerm: (s: string) => void; dateFilter?: string | null; dataDate?: string | null }) => {
  const filteredData = useMemo(() => {
    let result = data;
    if (dateFilter) {
      const now = new Date();
      const days = dateFilter === "Last 7 days" ? 7 : dateFilter === "Last 30 days" ? 30 : 0;
      if (days > 0) {
        const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
        result = result.filter((row: any) => {
          if (row.status === 'Not Started') return false;
          if (row.actualStart && row.actualStart !== "-") {
            const start = parseDateRobustly(row.actualStart);
            return start !== null && start >= cutoff && start <= now;
          }
          return false;
        });
      } else if (dateFilter === "Delayed Activities") {
        result = result.filter((row: any) => {
          if (row.status !== 'In Progress') return false;

          const planDateStr = row.plannedFinish || row.basePlanFinish || row.baselineFinish || row.plannedFinishDate || row.baselineFinishDate || row.forecastFinish;
          if (!planDateStr || planDateStr === "-") return false;

          const planFinish = parseDateRobustly(planDateStr);
          if (!planFinish) return false;

          const referenceDate = dataDate ? parseDateRobustly(dataDate) : new Date();
          if (!referenceDate) return false;

          return planFinish < referenceDate;
        });
      } else {
        result = result;
      }
    }

    if (!searchTerm) return result;
    const term = searchTerm.toLowerCase();
    return result.filter((row: any) =>
      (row.description || "").toLowerCase().includes(term) ||
      (row.vendorName || "").toLowerCase().includes(term) ||
      (row.subWbs || "").toLowerCase().includes(term)
    );
  }, [data, searchTerm, dateFilter]);



  // Build rows with sub-WBS headers and child wbsName subheaders
  const tableRows = useMemo(() => {
    const rows: any[] = [];
    let currentSubWbs = "";
    let currentWbsName = "";

    // Count activities per subWbs
    const subWbsCounts: Record<string, number> = {};
    filteredData.forEach((act: any) => {
      const sw = act.subWbs || "";
      subWbsCounts[sw] = (subWbsCounts[sw] || 0) + 1;
    });

    filteredData.forEach((act: any) => {
      const sw = act.subWbs || "";
      const wbs = act.wbsName || "";

      if (sw !== currentSubWbs) {
        currentSubWbs = sw;
        currentWbsName = ""; // reset subheading when main heading changes
        if (subWbsCounts[sw] > 0) {
          rows.push({ _type: "subWbsHeader", label: sw, count: subWbsCounts[sw] });
        }
      }

      if (wbs && wbs !== sw && wbs !== currentWbsName) {
        currentWbsName = wbs;
        rows.push({ _type: "subHeading", label: wbs });
      }

      rows.push(act);
    });
    return rows;
  }, [filteredData]);

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm overflow-hidden flex flex-col h-full">
      <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/50 shrink-0">
        <h3 className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
          <Truck className="w-4 h-4 text-[#72216e]" /> Delivery Status
          <span className="text-xs text-slate-400 font-normal ml-2">({data.length} items)</span>
        </h3>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3 text-[11px] font-medium border border-slate-200 dark:border-slate-700 rounded-full px-3 py-1 bg-white dark:bg-slate-900 shadow-sm">
            <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-500"><div className="w-2 h-2 rounded-full bg-emerald-500"></div>Actual</span>
            <span className="text-slate-300 dark:text-slate-600">|</span>
            <span className="flex items-center gap-1.5 text-blue-600 dark:text-blue-500"><div className="w-2 h-2 rounded-full bg-blue-500"></div>Forecast</span>
          </div>
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search deliveries..."
              className="h-9 w-64 pl-9 pr-4 text-sm rounded-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-[#72216e]/50 transition-all"
            />
          </div>
        </div>
      </div>
      <div className="overflow-auto flex-1">
        <table className="w-full text-sm text-left whitespace-nowrap">
          <thead className="text-xs text-slate-500 bg-slate-50 dark:bg-slate-900 uppercase sticky top-0 z-10 border-b border-slate-200 dark:border-slate-800 shadow-sm">
            <tr>
              <th className="px-4 py-3 font-semibold tracking-wider w-12 text-center">S.No</th>
              <th className="px-4 py-3 font-semibold tracking-wider">Description</th>
              <th className="px-4 py-3 font-semibold tracking-wider">Vendor</th>
              <th className="px-4 py-3 font-semibold tracking-wider">UOM</th>
              <th className="px-4 py-3 font-semibold tracking-wider text-right">Scope</th>
              <th className="px-4 py-3 font-semibold tracking-wider text-right text-blue-600 dark:text-blue-400">Actual</th>
              <th className="px-4 py-3 font-semibold tracking-wider text-right text-orange-600 dark:text-orange-400">Balance</th>
              <th className="px-4 py-3 font-semibold tracking-wider text-right">At Completion</th>
              <th className="px-4 py-3 font-semibold tracking-wider">Baseline Start</th>
              <th className="px-4 py-3 font-semibold tracking-wider">Baseline Finish</th>
              <th className="px-4 py-3 font-semibold tracking-wider text-center">Actual / Forecast Start</th>
              <th className="px-4 py-3 font-semibold tracking-wider text-center">Actual / Forecast Finish</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {tableRows.length === 0 && (
              <tr><td colSpan={12} className="px-6 py-12 text-center text-muted-foreground">No delivery data found for this project.</td></tr>
            )}
            {(() => {
              let sNo = 0;
              return tableRows.map((row: any, i: number) => {
                if (row._type === "subWbsHeader") {
                  return (
                    <tr key={`swh-${i}`} className="bg-slate-100/60 dark:bg-slate-800/40">
                      <td colSpan={12} className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-1.5 h-4 bg-[#72216e] rounded-full"></div>
                          <span className="font-bold text-sm text-slate-800 dark:text-slate-200 tracking-wide uppercase">{row.label}</span>
                          <span className="font-normal text-xs text-slate-500 dark:text-slate-400 normal-case ml-2">({row.count} items)</span>
                        </div>
                      </td>
                    </tr>
                  );
                }
                if (row._type === "subHeading") {
                  return (
                    <tr key={`del-sh-${i}`} className="bg-slate-50/50 dark:bg-slate-800/20">
                      <td colSpan={12} className="px-8 py-2">
                        <div className="flex items-center gap-2">
                          <div className="w-1 h-3 bg-slate-300 dark:bg-slate-600 rounded-full"></div>
                          <span className="font-semibold text-xs text-slate-600 dark:text-slate-400 tracking-wider uppercase">{row.label}</span>
                        </div>
                      </td>
                    </tr>
                  );
                }
                sNo++;
                const scope = Number(row.scope) || 0;
                const actual = Number(row.completed) || 0;
                const balance = Number(row.balance) || (scope - actual);
                const atCompletion = scope; // scope is the at-completion target
                return (
                  <tr key={`del-${i}`} className="hover:bg-purple-50/30 dark:hover:bg-slate-800/60 transition-colors group">
                    <td className="px-4 py-3 font-medium text-slate-400 text-xs text-center">{sNo}</td>
                    <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100 min-w-[200px] whitespace-normal text-xs group-hover:text-[#72216e] transition-colors">{row.description || "-"}</td>
                    <td className="px-4 py-3 text-slate-700 dark:text-slate-300 text-xs">
                      {row.vendorName ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-100 border border-slate-200 dark:bg-slate-800 dark:border-slate-700 text-slate-700 dark:text-slate-300">
                          {row.vendorName}
                        </span>
                      ) : "-"}
                    </td>
                    <td className="px-4 py-3 text-slate-500 dark:text-slate-400 text-xs">{row.uom || "-"}</td>
                    <td className="px-4 py-3 text-right font-semibold text-xs">{scope || "-"}</td>
                    <td className="px-4 py-3 text-right font-bold text-blue-600 dark:text-blue-400 text-xs bg-blue-50/30 dark:bg-blue-900/10">{actual || "-"}</td>
                    <td className="px-4 py-3 text-right font-bold text-orange-600 dark:text-orange-400 text-xs bg-orange-50/30 dark:bg-orange-900/10">{balance || "-"}</td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-700 dark:text-slate-300 text-xs">{atCompletion || "-"}</td>
                    <td className="px-4 py-3 text-slate-500 dark:text-slate-400 text-xs">{formatDate(row.baselineStart)}</td>
                    <td className="px-4 py-3 text-slate-500 dark:text-slate-400 text-xs">{formatDate(row.baselineFinish)}</td>
                    <td className="px-4 py-3 text-xs bg-slate-50/30 dark:bg-slate-800/10 text-center"><DateCell actual={row.actualStart} forecast={row.forecastStart} /></td>
                    <td className="px-4 py-3 text-xs bg-slate-50/30 dark:bg-slate-800/10 text-center"><DateCell actual={row.actualFinish} forecast={row.forecastFinish} /></td>
                  </tr>
                );
              });
            })()}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ============================================================================
// ORDERING (SUPPLY) TABLE
// ============================================================================

const OrderingTable = ({ data, groups, searchTerm, setSearchTerm, dateFilter, dataDate, isWind }: { data: any[]; groups: any[]; searchTerm: string; setSearchTerm: (s: string) => void; dateFilter?: string | null; dataDate?: string | null; isWind?: boolean }) => {
  const filteredData = useMemo(() => {
    let result = data;
    if (dateFilter) {
      const now = new Date();
      const days = dateFilter === "Last 7 days" ? 7 : dateFilter === "Last 30 days" ? 30 : 0;
      if (days > 0) {
        const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
        result = result.filter((row: any) => {
          if (row.status === 'Not Started') return false;
          if (row.actualStart && row.actualStart !== "-") {
            const start = parseDateRobustly(row.actualStart);
            return start !== null && start >= cutoff && start <= now;
          }
          return false;
        });
      } else if (dateFilter === "Delayed Activities") {
        result = result.filter((row: any) => {
          if (row.status !== 'In Progress') return false;

          const planDateStr = row.plannedFinish || row.basePlanFinish || row.baselineFinish || row.plannedFinishDate || row.baselineFinishDate || row.forecastFinish;
          if (!planDateStr || planDateStr === "-") return false;

          const planFinish = parseDateRobustly(planDateStr);
          if (!planFinish) return false;

          const referenceDate = dataDate ? parseDateRobustly(dataDate) : new Date();
          if (!referenceDate) return false;

          return planFinish < referenceDate;
        });
      } else {
        result = result;
      }
    }

    if (!searchTerm) return result;
    const term = searchTerm.toLowerCase();
    return result.filter((row: any) =>
      (row.description || "").toLowerCase().includes(term) ||
      (row.supplierOem || "").toLowerCase().includes(term) ||
      (row.packages || "").toLowerCase().includes(term) ||
      (row.plot || "").toLowerCase().includes(term) ||
      (row.blockNom || "").toLowerCase().includes(term)
    );
  }, [data, searchTerm, dateFilter]);



  // Build rows with package section headers
  const tableRows = useMemo(() => {
    const rows: any[] = [];
    let currentMain = "";
    let currentPackage = "";

    // Count activities per package
    const pkgCounts: Record<string, number> = {};
    filteredData.forEach((act: any) => {
      const p = act.packages || "";
      pkgCounts[p] = (pkgCounts[p] || 0) + 1;
    });

    filteredData.forEach((act: any) => {
      const main = act.mainHeading || "";
      if (main && main !== currentMain) {
        currentMain = main;
        currentPackage = ""; // reset
        rows.push({ _type: "mainHeading", label: currentMain });
      }

      const p = act.packages || "";
      if (p !== currentPackage) {
        currentPackage = p;
        if (pkgCounts[p] > 1 || main) {
          rows.push({ _type: "packageHeader", label: p, count: pkgCounts[p] || 1 });
        }
      }
      rows.push(act);
    });
    return rows;
  }, [filteredData]);

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm overflow-hidden flex flex-col h-full">
      <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/50 shrink-0">
        <h3 className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
          <ShoppingCart className="w-4 h-4 text-[#d97706]" /> Ordering (Supply) Status
          <span className="text-xs text-slate-400 font-normal ml-2">({data.length} items)</span>
        </h3>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3 text-[11px] font-medium border border-slate-200 dark:border-slate-700 rounded-full px-3 py-1 bg-white dark:bg-slate-900 shadow-sm">
            <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-500"><div className="w-2 h-2 rounded-full bg-emerald-500"></div>Actual</span>
            <span className="text-slate-300 dark:text-slate-600">|</span>
            <span className="flex items-center gap-1.5 text-blue-600 dark:text-blue-500"><div className="w-2 h-2 rounded-full bg-blue-500"></div>Forecast</span>
          </div>
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search ordering items..."
              className="h-9 w-64 pl-9 pr-4 text-sm rounded-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-[#d97706]/50 transition-all"
            />
          </div>
        </div>
      </div>
      <div className="overflow-auto flex-1">
        <table className="w-full text-sm text-left whitespace-nowrap">
          <thead className="text-xs text-slate-500 bg-slate-50 dark:bg-slate-900 uppercase sticky top-0 z-10 shadow-sm">
            <tr>
              <th rowSpan={2} className="px-4 py-3 font-semibold tracking-wider w-12 text-center border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900">Sr.</th>
              <th rowSpan={2} className="px-4 py-3 font-semibold tracking-wider border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900">Package</th>
              <th rowSpan={2} className="px-4 py-3 font-semibold tracking-wider text-right border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900">Scope</th>
              <th rowSpan={2} className="px-4 py-3 font-semibold tracking-wider border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900">UOM</th>
              <th rowSpan={2} className="px-4 py-3 font-semibold tracking-wider border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900">Vendor</th>
              <th rowSpan={2} className="px-4 py-3 font-semibold tracking-wider text-right border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900">Order Qty</th>
              <th rowSpan={2} className="px-4 py-3 font-semibold tracking-wider text-right border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900">Complete</th>
              <th rowSpan={2} className="px-4 py-3 font-semibold tracking-wider text-right border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900">Balance</th>
              {isWind ? (
                <>
                  <th colSpan={4} className="px-4 py-2 font-semibold tracking-wider text-center border-b border-l border-slate-200 dark:border-slate-800 bg-amber-50/40 dark:bg-amber-950/20 text-[#d97706]">BOQ</th>
                  <th colSpan={4} className="px-4 py-2 font-semibold tracking-wider text-center border-b border-l border-slate-200 dark:border-slate-800 bg-amber-50/40 dark:bg-amber-950/20 text-[#d97706]">PR</th>
                  <th colSpan={4} className="px-4 py-2 font-semibold tracking-wider text-center border-b border-l border-slate-200 dark:border-slate-800 bg-amber-50/40 dark:bg-amber-950/20 text-[#d97706]">TBER</th>
                  <th colSpan={4} className="px-4 py-2 font-semibold tracking-wider text-center border-b border-l border-slate-200 dark:border-slate-800 bg-amber-50/40 dark:bg-amber-950/20 text-[#d97706]">NFA</th>
                  <th colSpan={4} className="px-4 py-2 font-semibold tracking-wider text-center border-b border-l border-slate-200 dark:border-slate-800 bg-amber-50/40 dark:bg-amber-950/20 text-[#d97706]">PO/SO</th>
                </>
              ) : (
                <>
                  <th rowSpan={2} className="px-4 py-3 font-semibold tracking-wider text-center border-b border-l border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900">Baseline Start</th>
                  <th rowSpan={2} className="px-4 py-3 font-semibold tracking-wider text-center border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900">Baseline Finish</th>
                  <th rowSpan={2} className="px-4 py-3 font-semibold tracking-wider text-center border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900">Actual / Forecast Start</th>
                  <th rowSpan={2} className="px-4 py-3 font-semibold tracking-wider text-center border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900">Actual / Forecast Finish</th>
                </>
              )}
            </tr>
            <tr>
              {isWind && (
                <>
                  {/* BOQ */}
                  <th className="px-3 py-2 font-semibold tracking-wider text-center border-b border-l border-slate-200 dark:border-slate-800 text-[11px] bg-amber-50/40 dark:bg-amber-950/20">BL Start</th>
                  <th className="px-3 py-2 font-semibold tracking-wider text-center border-b border-slate-200 dark:border-slate-800 text-[11px] bg-amber-50/40 dark:bg-amber-950/20">BL Finish</th>
                  <th className="px-3 py-2 font-semibold tracking-wider text-center border-b border-slate-200 dark:border-slate-800 text-[11px] bg-amber-50/40 dark:bg-amber-950/20">Actual Start</th>
                  <th className="px-3 py-2 font-semibold tracking-wider text-center border-b border-slate-200 dark:border-slate-800 text-[11px] bg-amber-50/40 dark:bg-amber-950/20">Actual Finish</th>
                  {/* PR */}
                  <th className="px-3 py-2 font-semibold tracking-wider text-center border-b border-l border-slate-200 dark:border-slate-800 text-[11px] bg-amber-50/40 dark:bg-amber-950/20">BL Start</th>
                  <th className="px-3 py-2 font-semibold tracking-wider text-center border-b border-slate-200 dark:border-slate-800 text-[11px] bg-amber-50/40 dark:bg-amber-950/20">BL Finish</th>
                  <th className="px-3 py-2 font-semibold tracking-wider text-center border-b border-slate-200 dark:border-slate-800 text-[11px] bg-amber-50/40 dark:bg-amber-950/20">Actual Start</th>
                  <th className="px-3 py-2 font-semibold tracking-wider text-center border-b border-slate-200 dark:border-slate-800 text-[11px] bg-amber-50/40 dark:bg-amber-950/20">Actual Finish</th>
                  {/* TBER */}
                  <th className="px-3 py-2 font-semibold tracking-wider text-center border-b border-l border-slate-200 dark:border-slate-800 text-[11px] bg-amber-50/40 dark:bg-amber-950/20">BL Start</th>
                  <th className="px-3 py-2 font-semibold tracking-wider text-center border-b border-slate-200 dark:border-slate-800 text-[11px] bg-amber-50/40 dark:bg-amber-950/20">BL Finish</th>
                  <th className="px-3 py-2 font-semibold tracking-wider text-center border-b border-slate-200 dark:border-slate-800 text-[11px] bg-amber-50/40 dark:bg-amber-950/20">Actual Start</th>
                  <th className="px-3 py-2 font-semibold tracking-wider text-center border-b border-slate-200 dark:border-slate-800 text-[11px] bg-amber-50/40 dark:bg-amber-950/20">Actual Finish</th>
                  {/* NFA */}
                  <th className="px-3 py-2 font-semibold tracking-wider text-center border-b border-l border-slate-200 dark:border-slate-800 text-[11px] bg-amber-50/40 dark:bg-amber-950/20">BL Start</th>
                  <th className="px-3 py-2 font-semibold tracking-wider text-center border-b border-slate-200 dark:border-slate-800 text-[11px] bg-amber-50/40 dark:bg-amber-950/20">BL Finish</th>
                  <th className="px-3 py-2 font-semibold tracking-wider text-center border-b border-slate-200 dark:border-slate-800 text-[11px] bg-amber-50/40 dark:bg-amber-950/20">Actual Start</th>
                  <th className="px-3 py-2 font-semibold tracking-wider text-center border-b border-slate-200 dark:border-slate-800 text-[11px] bg-amber-50/40 dark:bg-amber-950/20">Actual Finish</th>
                  {/* PO/SO */}
                  <th className="px-3 py-2 font-semibold tracking-wider text-center border-b border-l border-slate-200 dark:border-slate-800 text-[11px] bg-amber-50/40 dark:bg-amber-950/20">BL Start</th>
                  <th className="px-3 py-2 font-semibold tracking-wider text-center border-b border-slate-200 dark:border-slate-800 text-[11px] bg-amber-50/40 dark:bg-amber-950/20">BL Finish</th>
                  <th className="px-3 py-2 font-semibold tracking-wider text-center border-b border-slate-200 dark:border-slate-800 text-[11px] bg-amber-50/40 dark:bg-amber-950/20">Actual Start</th>
                  <th className="px-3 py-2 font-semibold tracking-wider text-center border-b border-slate-200 dark:border-slate-800 text-[11px] bg-amber-50/40 dark:bg-amber-950/20">Actual Finish</th>
                </>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {tableRows.length === 0 && (
              <tr><td colSpan={28} className="px-6 py-16 text-center"><p className="text-sm font-medium text-slate-500 dark:text-slate-400">Ordering (Supply) structure established.</p><p className="text-xs text-muted-foreground mt-1">Data mapping to Oracle P6 activities will be configured later.</p></td></tr>
            )}
            {(() => {
              let sNo = 0;
              return tableRows.map((row: any, i: number) => {
                if (row._type === "mainHeading") {
                  return (
                    <tr key={`mh-${i}`} className="bg-slate-100/60 dark:bg-slate-800/40">
                      <td colSpan={28} className="px-5 py-3 border-b border-slate-200 dark:border-slate-800">
                        <div className="flex items-center gap-3">
                          <div className="w-1.5 h-4 bg-[#00609C] rounded-full"></div>
                          <span className="font-bold text-sm text-slate-800 dark:text-slate-200 tracking-wide uppercase">{row.label}</span>
                        </div>
                      </td>
                    </tr>
                  );
                }
                if (row._type === "packageHeader") {
                  return (
                    <tr key={`pkgh-${i}`} className="bg-slate-50/50 dark:bg-slate-800/20">
                      <td colSpan={28} className="px-5 py-3 border-b border-slate-100 dark:border-slate-800">
                        <div className="flex items-center gap-3 pl-4">
                          <div className="w-1.5 h-3.5 bg-[#d97706] rounded-full"></div>
                          <span className="font-bold text-sm text-slate-800 dark:text-slate-200 tracking-wide uppercase">{row.label}</span>
                          <span className="font-normal text-xs text-slate-500 dark:text-slate-400 normal-case ml-2">({row.count} items)</span>
                        </div>
                      </td>
                    </tr>
                  );
                }
                sNo++;
                const scope = Number(row.scope) || 0;
                const orderQty = Number(row.orderQty) || 0;
                const complete = Number(row.completed) || 0;
                const balance = Number(row.balance) || 0;
                return (
                  <tr key={`ord-${i}`} className="hover:bg-amber-50/30 dark:hover:bg-slate-800/60 transition-colors group">
                    <td className="px-4 py-3 font-medium text-slate-400 text-xs text-center">{sNo}</td>
                    <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100 min-w-[180px] whitespace-normal text-xs group-hover:text-[#d97706] transition-colors">
                      {row.packages || row.plot || "-"}
                      {row.description && row.description !== row.packages && (
                        <div className="text-[11px] text-slate-500 font-normal mt-0.5">{row.description}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-xs">{scope || "-"}</td>
                    <td className="px-4 py-3 text-slate-500 dark:text-slate-400 text-xs">{row.uom || "-"}</td>
                    <td className="px-4 py-3 text-slate-700 dark:text-slate-300 text-xs">
                      {row.supplierOem ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-100 border border-slate-200 dark:bg-slate-800 dark:border-slate-700 text-slate-700 dark:text-slate-300">
                          {row.supplierOem}
                        </span>
                      ) : "-"}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-xs">{orderQty || "-"}</td>
                    <td className="px-4 py-3 text-right font-bold text-blue-600 dark:text-blue-400 text-xs bg-blue-50/30 dark:bg-blue-900/10">{complete || "-"}</td>
                    <td className="px-4 py-3 text-right font-bold text-orange-600 dark:text-orange-400 text-xs bg-orange-50/30 dark:bg-orange-900/10">{balance || "-"}</td>

                    {isWind ? (
                      <>
                        {/* BOQ */}
                        <td className="px-4 py-3 text-slate-500 dark:text-slate-400 text-xs text-center border-l border-slate-200 dark:border-slate-800 bg-amber-50/5 dark:bg-amber-950/5">{formatDate(row.boqBaselineStart) || "-"}</td>
                        <td className="px-4 py-3 text-slate-500 dark:text-slate-400 text-xs text-center bg-amber-50/5 dark:bg-amber-950/5">{formatDate(row.boqBaselineFinish) || "-"}</td>
                        <td className="px-4 py-3 text-xs bg-amber-50/5 dark:bg-amber-950/5 text-center"><DateCell actual={row.boqActualStart} forecast={row.boqForecastStart} /></td>
                        <td className="px-4 py-3 text-xs bg-amber-50/5 dark:bg-amber-950/5 text-center"><DateCell actual={row.boqActualFinish} forecast={row.boqForecastFinish} /></td>

                        {/* PR */}
                        <td className="px-4 py-3 text-slate-500 dark:text-slate-400 text-xs text-center border-l border-slate-200 dark:border-slate-800 bg-amber-50/5 dark:bg-amber-950/5">{formatDate(row.prBaselineStart) || "-"}</td>
                        <td className="px-4 py-3 text-slate-500 dark:text-slate-400 text-xs text-center bg-amber-50/5 dark:bg-amber-950/5">{formatDate(row.prBaselineFinish) || "-"}</td>
                        <td className="px-4 py-3 text-xs bg-amber-50/5 dark:bg-amber-950/5 text-center"><DateCell actual={row.prActualStart} forecast={row.prForecastStart} /></td>
                        <td className="px-4 py-3 text-xs bg-amber-50/5 dark:bg-amber-950/5 text-center"><DateCell actual={row.prActualFinish} forecast={row.prForecastFinish} /></td>

                        {/* TBER */}
                        <td className="px-4 py-3 text-slate-500 dark:text-slate-400 text-xs text-center border-l border-slate-200 dark:border-slate-800">{formatDate(row.tberBaselineStart) || "-"}</td>
                        <td className="px-4 py-3 text-slate-500 dark:text-slate-400 text-xs text-center">{formatDate(row.tberBaselineFinish) || "-"}</td>
                        <td className="px-4 py-3 text-xs text-center"><DateCell actual={row.tberActualStart} forecast={row.tberForecastStart} /></td>
                        <td className="px-4 py-3 text-xs text-center"><DateCell actual={row.tberActualFinish} forecast={row.tberForecastFinish} /></td>

                        {/* NFA */}
                        <td className="px-4 py-3 text-slate-500 dark:text-slate-400 text-xs text-center border-l border-slate-200 dark:border-slate-800">{formatDate(row.nfaBaselineStart) || "-"}</td>
                        <td className="px-4 py-3 text-slate-500 dark:text-slate-400 text-xs text-center">{formatDate(row.nfaBaselineFinish) || "-"}</td>
                        <td className="px-4 py-3 text-xs text-center"><DateCell actual={row.nfaActualStart} forecast={row.nfaForecastStart} /></td>
                        <td className="px-4 py-3 text-xs text-center"><DateCell actual={row.nfaActualFinish} forecast={row.nfaForecastFinish} /></td>

                        {/* PO/SO */}
                        <td className="px-4 py-3 text-slate-500 dark:text-slate-400 text-xs text-center border-l border-slate-200 dark:border-slate-800 bg-amber-50/10 dark:bg-amber-950/5">{formatDate(row.posoBaselineStart) || "-"}</td>
                        <td className="px-4 py-3 text-slate-500 dark:text-slate-400 text-xs text-center bg-amber-50/10 dark:bg-amber-950/5">{formatDate(row.posoBaselineFinish) || "-"}</td>
                        <td className="px-4 py-3 text-xs bg-amber-50/10 dark:bg-amber-950/5 text-center"><DateCell actual={row.posoActualStart} forecast={row.posoForecastStart} /></td>
                        <td className="px-4 py-3 text-xs bg-amber-50/10 dark:bg-amber-950/5 text-center"><DateCell actual={row.posoActualFinish} forecast={row.posoForecastFinish} /></td>
                      </>
                    ) : (
                      <>
                        <td className="px-4 py-3 text-slate-500 dark:text-slate-400 text-xs text-center border-l border-slate-200 dark:border-slate-800">{formatDate(row.baselineStart)}</td>
                        <td className="px-4 py-3 text-slate-500 dark:text-slate-400 text-xs text-center">{formatDate(row.baselineFinish)}</td>
                        <td className="px-4 py-3 text-xs text-center"><DateCell actual={row.actualStart} forecast={row.forecastStart} /></td>
                        <td className="px-4 py-3 text-xs text-center"><DateCell actual={row.actualFinish} forecast={row.forecastFinish} /></td>
                      </>
                    )}
                  </tr>
                );
              });
            })()}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ============================================================================
// ACHIEVEMENT TABLE
// ============================================================================

const AchievementTable = ({ projectId, searchTerm, setSearchTerm }: { projectId?: string | number; searchTerm: string; setSearchTerm: (s: string) => void }) => {
  const [editableData, setEditableData] = useState<Record<string, Record<string, string>>>({
    rigs: {}, gangs: {}, cranes: {}, commissioning: {}
  });

  const [months, setMonths] = useState<string[]>([]);

  const [autoData, setAutoData] = useState<any>({
    stone_column: { no_of_columns: [], cumm_sc: [], productivity: [] },
    wtg_foundation: { no_of_foundations: [], cumm_foundations: [], productivity: [] },
    wtg_erection: { no_of_erections: [], cumm_erections: [], productivity: [] },
    wtg_commissioning: { no_of_commissioning: [], cumm_commissioning: [] }
  });

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const fetchAchievements = async () => {
      if (projectId) {
        setLoading(true);
        try {
          const data = await getWindAchievements(projectId);
          setMonths(data.months || []);
          setEditableData({
            rigs: data.rigs || {},
            gangs: data.gangs || {},
            cranes: data.cranes || {},
            commissioning: data.commissioning || {}
          });
          setAutoData({
            stone_column: data.stone_column || { no_of_columns: [], cumm_sc: [], productivity: [] },
            wtg_foundation: data.wtg_foundation || { no_of_foundations: [], cumm_foundations: [], productivity: [] },
            wtg_erection: data.wtg_erection || { no_of_erections: [], cumm_erections: [], productivity: [] },
            wtg_commissioning: data.wtg_commissioning || { no_of_commissioning: [], cumm_commissioning: [] }
          });
        } catch (error) {
          console.error("Failed to load achievements", error);
        } finally {
          setLoading(false);
        }
      }
    };
    fetchAchievements();
  }, [projectId]);

  const handleInputChange = (field: "rigs" | "gangs" | "cranes" | "commissioning", month: string, value: string) => {
    setEditableData(prev => {
      const newData = { ...prev };
      newData[field] = { ...newData[field], [month]: value };
      return newData;
    });
  };

  const handleSave = async () => {
    if (projectId) {
      setSaving(true);
      try {
        await saveWindAchievements(projectId, editableData);
        toast.success("Productivity data saved to database!");
      } catch (error) {
        toast.error("Failed to save productivity data.");
      } finally {
        setSaving(false);
      }
    }
  };

  const renderEditableCells = (field: "rigs" | "gangs" | "cranes" | "commissioning") => {
    return months.map((month) => (
      <td key={month} className="px-1 py-1 min-w-[70px]">
        <input
          type="text"
          className="w-full h-8 text-center font-medium border border-slate-200 dark:border-slate-700 rounded text-xs bg-white dark:bg-slate-900 focus:outline-none focus:ring-1 focus:ring-[#10b981] focus:border-[#10b981] transition-all shadow-inner"
          value={editableData[field][month] || ""}
          onChange={(e) => handleInputChange(field, month, e.target.value)}
          placeholder="-"
        />
      </td>
    ));
  };

  const renderReadOnlyCells = (arr: string[], colorClass: string = "text-slate-700 dark:text-slate-300") => {
    return months.map((month, i) => (
      <td key={month} className={`px-2 py-2 text-center text-sm font-medium ${arr && arr[i] ? colorClass : 'text-slate-400'}`}>
        {(arr && arr[i]) || "-"}
      </td>
    ));
  };

  const renderProductivityCells = (
    field: "rigs" | "gangs" | "cranes",
    counts: any[],
    colorClass: string = "text-blue-600 dark:text-blue-400"
  ) => {
    return months.map((month, i) => {
      const workDone = parseFloat(String(counts?.[i])) || 0;
      const resources = parseFloat(editableData[field]?.[month]) || 0;

      let productivity: string | number = "-";
      if (resources > 0) {
        productivity = (workDone / resources).toFixed(2);
        if (productivity.endsWith(".00")) productivity = productivity.replace(".00", "");
      }

      return (
        <td key={`prod-${month}`} className={`px-2 py-2 text-center text-sm font-medium ${productivity !== "-" ? colorClass : 'text-slate-400'}`}>
          {productivity}
        </td>
      );
    });
  };

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm overflow-hidden flex flex-col h-full">
      <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/50 shrink-0">
        <h3 className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-[#10b981]" /> Productivity Tracking
        </h3>
        <div className="flex items-center gap-4">
          <Button onClick={handleSave} size="sm" disabled={saving || loading} className="bg-[#10b981] hover:bg-[#047857] text-white gap-2 shadow-md">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? "Saving..." : "Save Data"}
          </Button>
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search productivity..."
              className="h-9 w-64 pl-9 pr-4 text-sm rounded-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-[#10b981]/50 transition-all"
            />
          </div>
        </div>
      </div>
      <div className="flex-1 overflow-auto relative custom-scrollbar">
        {loading ? (
          <div className="absolute inset-0 flex items-center justify-center bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm z-50">
            <Loader2 className="w-8 h-8 animate-spin text-[#10b981]" />
          </div>
        ) : null}
        <table className="w-full text-sm text-left">
          <thead className="text-xs text-slate-500 dark:text-slate-400 bg-slate-50/80 dark:bg-slate-900/80 uppercase sticky top-0 z-40 backdrop-blur-md shadow-sm">
            <tr>
              <th className="px-4 py-3 font-semibold tracking-wider w-[60px] min-w-[60px] sticky left-0 z-30 bg-slate-50 dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800">Sr No</th>
              <th className="px-4 py-3 font-semibold tracking-wider w-[200px] min-w-[200px] sticky left-16 z-30 bg-slate-50 dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800">Activity</th>
              <th className="px-4 py-3 font-semibold tracking-wider w-[180px] min-w-[180px] sticky left-[264px] z-30 bg-slate-50 dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">Resources & Work Done</th>
              {months.map(month => (
                <th key={month} className="px-4 py-3 font-semibold tracking-wider text-center">{month}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800 border-b-[3px] border-slate-300 dark:border-slate-600 shadow-sm">
            {/* Stone Column */}
            <tr className="group hover:bg-slate-50 dark:hover:bg-slate-800/50">
              <td className="px-4 py-2 font-medium text-center border-r border-slate-200 dark:border-slate-700 sticky left-0 z-20 bg-white dark:bg-slate-900 group-hover:bg-slate-50 dark:group-hover:bg-slate-800/50" rowSpan={4}>1</td>
              <td className="px-4 py-2 font-semibold text-slate-800 dark:text-slate-200 border-r border-slate-200 dark:border-slate-700 sticky left-16 z-20 bg-white dark:bg-slate-900 group-hover:bg-slate-50 dark:group-hover:bg-slate-800/50" rowSpan={4}>Stone Column</td>
              <td className="px-4 py-2 text-slate-600 dark:text-slate-300 sticky left-[264px] z-20 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] group-hover:bg-slate-50 dark:group-hover:bg-slate-800/50">Rigs</td>
              {renderEditableCells("rigs")}
            </tr>
            <tr className="group hover:bg-slate-50 dark:hover:bg-slate-800/50">
              <td className="px-4 py-2 font-medium text-[#10b981] sticky left-[264px] z-20 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] group-hover:bg-slate-50 dark:group-hover:bg-slate-800/50">No of Columns</td>
              {renderReadOnlyCells(autoData.stone_column.no_of_columns, "text-[#10b981]")}
            </tr>
            <tr className="group hover:bg-slate-50 dark:hover:bg-slate-800/50">
              <td className="px-4 py-2 font-medium text-slate-700 dark:text-slate-300 sticky left-[264px] z-20 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] group-hover:bg-slate-50 dark:group-hover:bg-slate-800/50">Cumm SC</td>
              {renderReadOnlyCells(autoData.stone_column.cumm_sc)}
            </tr>
            <tr className="group hover:bg-slate-50 dark:hover:bg-slate-800/50 bg-slate-50/50 dark:bg-slate-800/30">
              <td className="px-4 py-2 font-medium text-blue-600 dark:text-blue-400 sticky left-[264px] z-20 bg-slate-50/50 dark:bg-slate-800/30 border-r border-slate-200 dark:border-slate-800 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] group-hover:bg-slate-100 dark:group-hover:bg-slate-800/80">Productivity</td>
              {renderProductivityCells("rigs", autoData.stone_column.no_of_columns, "text-blue-600 dark:text-blue-400")}
            </tr>

            {/* WTG Foundation */}
            <tr className="group hover:bg-slate-50 dark:hover:bg-slate-800/50 border-t-2 border-slate-200 dark:border-slate-700">
              <td className="px-4 py-2 font-medium text-center border-r border-slate-200 dark:border-slate-700 sticky left-0 z-20 bg-white dark:bg-slate-900 group-hover:bg-slate-50 dark:group-hover:bg-slate-800/50" rowSpan={4}>2</td>
              <td className="px-4 py-2 font-semibold text-slate-800 dark:text-slate-200 border-r border-slate-200 dark:border-slate-700 sticky left-16 z-20 bg-white dark:bg-slate-900 group-hover:bg-slate-50 dark:group-hover:bg-slate-800/50" rowSpan={4}>WTG Foundation</td>
              <td className="px-4 py-2 text-slate-600 dark:text-slate-300 sticky left-[264px] z-20 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] group-hover:bg-slate-50 dark:group-hover:bg-slate-800/50">Gangs</td>
              {renderEditableCells("gangs")}
            </tr>
            <tr className="group hover:bg-slate-50 dark:hover:bg-slate-800/50">
              <td className="px-4 py-2 font-medium text-[#10b981] sticky left-[264px] z-20 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] group-hover:bg-slate-50 dark:group-hover:bg-slate-800/50">No of Foundations</td>
              {renderReadOnlyCells(autoData.wtg_foundation.no_of_foundations, "text-[#10b981]")}
            </tr>
            <tr className="group hover:bg-slate-50 dark:hover:bg-slate-800/50">
              <td className="px-4 py-2 font-medium text-slate-700 dark:text-slate-300 sticky left-[264px] z-20 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] group-hover:bg-slate-50 dark:group-hover:bg-slate-800/50">Cumm Foundations</td>
              {renderReadOnlyCells(autoData.wtg_foundation.cumm_foundations)}
            </tr>
            <tr className="group hover:bg-slate-50 dark:hover:bg-slate-800/50 bg-slate-50/50 dark:bg-slate-800/30">
              <td className="px-4 py-2 font-medium text-blue-600 dark:text-blue-400 sticky left-[264px] z-20 bg-slate-50/50 dark:bg-slate-800/30 border-r border-slate-200 dark:border-slate-800 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] group-hover:bg-slate-100 dark:group-hover:bg-slate-800/80">Productivity</td>
              {renderProductivityCells("gangs", autoData.wtg_foundation.no_of_foundations, "text-blue-600 dark:text-blue-400")}
            </tr>

            {/* WTG Erection */}
            <tr className="group hover:bg-slate-50 dark:hover:bg-slate-800/50 border-t-2 border-slate-200 dark:border-slate-700">
              <td className="px-4 py-2 font-medium text-center border-r border-slate-200 dark:border-slate-700 sticky left-0 z-20 bg-white dark:bg-slate-900 group-hover:bg-slate-50 dark:group-hover:bg-slate-800/50" rowSpan={4}>3</td>
              <td className="px-4 py-2 font-semibold text-slate-800 dark:text-slate-200 border-r border-slate-200 dark:border-slate-700 sticky left-16 z-20 bg-white dark:bg-slate-900 group-hover:bg-slate-50 dark:group-hover:bg-slate-800/50" rowSpan={4}>WTG Erection</td>
              <td className="px-4 py-2 text-slate-600 dark:text-slate-300 sticky left-[264px] z-20 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] group-hover:bg-slate-50 dark:group-hover:bg-slate-800/50">Cranes Packages</td>
              {renderEditableCells("cranes")}
            </tr>
            <tr className="group hover:bg-slate-50 dark:hover:bg-slate-800/50">
              <td className="px-4 py-2 font-medium text-[#10b981] sticky left-[264px] z-20 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] group-hover:bg-slate-50 dark:group-hover:bg-slate-800/50">No of Erections</td>
              {renderReadOnlyCells(autoData.wtg_erection.no_of_erections, "text-[#10b981]")}
            </tr>
            <tr className="group hover:bg-slate-50 dark:hover:bg-slate-800/50">
              <td className="px-4 py-2 font-medium text-slate-700 dark:text-slate-300 sticky left-[264px] z-20 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] group-hover:bg-slate-50 dark:group-hover:bg-slate-800/50">Cumm Erections</td>
              {renderReadOnlyCells(autoData.wtg_erection.cumm_erections)}
            </tr>
            <tr className="group hover:bg-slate-50 dark:hover:bg-slate-800/50 bg-slate-50/50 dark:bg-slate-800/30">
              <td className="px-4 py-2 font-medium text-blue-600 dark:text-blue-400 sticky left-[264px] z-20 bg-slate-50/50 dark:bg-slate-800/30 border-r border-slate-200 dark:border-slate-800 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] group-hover:bg-slate-100 dark:group-hover:bg-slate-800/80">Productivity</td>
              {renderProductivityCells("cranes", autoData.wtg_erection.no_of_erections, "text-blue-600 dark:text-blue-400")}
            </tr>

            {/* WTG Commissioning */}
            <tr className="group hover:bg-slate-50 dark:hover:bg-slate-800/50 border-t-2 border-slate-200 dark:border-slate-700">
              <td className="px-4 py-2 font-medium text-center border-r border-slate-200 dark:border-slate-700 sticky left-0 z-20 bg-white dark:bg-slate-900 group-hover:bg-slate-50 dark:group-hover:bg-slate-800/50" rowSpan={3}>4</td>
              <td className="px-4 py-2 font-semibold text-slate-800 dark:text-slate-200 border-r border-slate-200 dark:border-slate-700 sticky left-16 z-20 bg-white dark:bg-slate-900 group-hover:bg-slate-50 dark:group-hover:bg-slate-800/50" rowSpan={3}>WTG Commissioning</td>
              <td className="px-4 py-2 text-slate-600 dark:text-slate-300 sticky left-[264px] z-20 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] group-hover:bg-slate-50 dark:group-hover:bg-slate-800/50">Commissioning</td>
              {renderEditableCells("commissioning")}
            </tr>
            <tr className="group hover:bg-slate-50 dark:hover:bg-slate-800/50">
              <td className="px-4 py-2 font-medium text-[#10b981] sticky left-[264px] z-20 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] group-hover:bg-slate-50 dark:group-hover:bg-slate-800/50">No of Commissioning</td>
              {renderReadOnlyCells(autoData.wtg_commissioning.no_of_commissioning, "text-[#10b981]")}
            </tr>
            <tr className="group hover:bg-slate-50 dark:hover:bg-slate-800/50">
              <td className="px-4 py-2 font-medium text-slate-700 dark:text-slate-300 sticky left-[264px] z-20 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] group-hover:bg-slate-50 dark:group-hover:bg-slate-800/50">Cumm Commissioning</td>
              {renderReadOnlyCells(autoData.wtg_commissioning.cumm_commissioning)}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
};
