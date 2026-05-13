import React, { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { motion } from "framer-motion";
import { Hammer, Truck, Search, Download, Loader2, ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { getEDDeliveryData, getEDEngineeringData, getEDOrderingData } from "@/services/p6ActivityService";

interface EDSheetsModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId?: string | number;
  projectName?: string;
}

const formatDate = (d: any): string => {
  if (!d) return "-";
  try {
    const date = new Date(d);
    if (isNaN(date.getTime())) return "-";
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
  projectName
}) => {
  const [activeTab, setActiveTab] = useState<"engineering" | "ordering" | "delivery">("engineering");
  const [engineeringData, setEngineeringData] = useState<{ data: any[]; groups: any[] }>({ data: [], groups: [] });
  const [orderingData, setOrderingData] = useState<{ data: any[]; groups: any[] }>({ data: [], groups: [] });
  const [deliveryData, setDeliveryData] = useState<{ data: any[]; groups: any[] }>({ data: [], groups: [] });
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    if (isOpen && projectId) {
      setLoading(true);
      Promise.all([
        getEDEngineeringData(projectId),
        getEDOrderingData(projectId),
        getEDDeliveryData(projectId)
      ]).then(([eng, ord, del]) => {
        setEngineeringData(eng);
        setOrderingData(ord);
        setDeliveryData(del);
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
        const ordData = ordList.length > 0 ? ordList.map((row: any, idx: number) => ({
          "S.No": idx + 1,
          "Plot": row.plot || "-",
          "Packages": row.packages || "-",
          "UOM": row.uom || "-",
          "Scope": Number(row.scope) || 0,
          "Supplier/OEM": row.supplierOem || "-",
          "Plan (R2)": formatDate(row.baselineStart),
          "Actual": formatDate(row.actualStart) !== "-" ? formatDate(row.actualStart) : formatDate(row.forecastStart)
        })) : [{
          "S.No": 1, "Plot": "-", "Packages": "No ordering data mapped yet", "UOM": "-", "Scope": 0, "Supplier/OEM": "-", "Plan (R2)": "-", "Actual": "-"
        }];
        return XLSX.utils.json_to_sheet(ordData);
      };

      const getDelSheet = () => {
        const delList = deliveryData.data && deliveryData.data.length > 0 ? deliveryData.data : [];
        const delData = delList.length > 0 ? delList.map((row: any, idx: number) => ({
          "S.No": idx + 1,
          "Description": row.description || "-",
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
          "S.No": 1, "Description": "No delivery data available", "Vendor": "-", "UOM": "-", "Scope": 0, "Actual": 0, "Balance": 0, "At Completion": 0,
          "Baseline Start": "-", "Baseline Finish": "-", "Actual / Forecast Start": "-", "Actual / Forecast Finish": "-"
        }];
        return XLSX.utils.json_to_sheet(delData);
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
        } else {
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
                <Download className="w-3.5 h-3.5 mr-1.5"/> Export Current Sheet
              </Button>
              <Button 
                size="sm" 
                className="flex h-9 rounded-full px-4 text-xs font-semibold shadow-sm bg-white text-blue-900 hover:bg-slate-100"
                onClick={() => handleExport("all")}
                disabled={loading}
              >
                <Download className="w-3.5 h-3.5 mr-1.5"/> Export All Sheets
              </Button>
            </div>
          </div>
          
          {/* Premium Segmented Toggle */}
          <div className="flex justify-center mt-6 -mb-5">
            <div className="flex p-1.5 space-x-2 bg-slate-100 dark:bg-slate-800 rounded-full border border-slate-200/50 dark:border-slate-700/50 shadow-inner">
              <button
                onClick={() => setActiveTab("engineering")}
                className={`relative flex items-center justify-center gap-2 px-6 py-2.5 text-sm font-bold rounded-full transition-all duration-300 w-44 ${
                  activeTab === "engineering"
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
                className={`relative flex items-center justify-center gap-2 px-6 py-2.5 text-sm font-bold rounded-full transition-all duration-300 w-44 ${
                  activeTab === "ordering"
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
                className={`relative flex items-center justify-center gap-2 px-6 py-2.5 text-sm font-bold rounded-full transition-all duration-300 w-44 ${
                  activeTab === "delivery"
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
              {activeTab === "engineering" ? (
                <EngineeringTable data={engineeringData.data} groups={engineeringData.groups} searchTerm={searchTerm} setSearchTerm={setSearchTerm} />
              ) : activeTab === "ordering" ? (
                <OrderingTable data={orderingData.data} groups={orderingData.groups} searchTerm={searchTerm} setSearchTerm={setSearchTerm} />
              ) : (
                <DeliveryTable data={deliveryData.data} groups={deliveryData.groups} searchTerm={searchTerm} setSearchTerm={setSearchTerm} />
              )}
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

const EngineeringTable = ({ data, groups, searchTerm, setSearchTerm }: { data: any[]; groups: any[]; searchTerm: string; setSearchTerm: (s: string) => void }) => {
  const filteredData = useMemo(() => {
    if (!searchTerm) return data;
    const term = searchTerm.toLowerCase();
    return data.filter((row: any) =>
      (row.description || "").toLowerCase().includes(term) ||
      (row.activityId || "").toLowerCase().includes(term) ||
      (row.mainHeading || "").toLowerCase().includes(term) ||
      (row.subHeading || "").toLowerCase().includes(term)
    );
  }, [data, searchTerm]);

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
          <Hammer className="w-4 h-4 text-[#00609C]"/> Engineering Progress
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
              const pct = parseFloat(row.percent_complete) || 0;
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

const DeliveryTable = ({ data, groups, searchTerm, setSearchTerm }: { data: any[]; groups: any[]; searchTerm: string; setSearchTerm: (s: string) => void }) => {
  const filteredData = useMemo(() => {
    if (!searchTerm) return data;
    const term = searchTerm.toLowerCase();
    return data.filter((row: any) =>
      (row.description || "").toLowerCase().includes(term) ||
      (row.vendorName || "").toLowerCase().includes(term) ||
      (row.subWbs || "").toLowerCase().includes(term)
    );
  }, [data, searchTerm]);

  // Build rows with sub-WBS headers only when there are multiple activities
  const tableRows = useMemo(() => {
    const rows: any[] = [];
    let currentSubWbs = "";
    
    // Count activities per subWbs
    const subWbsCounts: Record<string, number> = {};
    filteredData.forEach((act: any) => {
      const sw = act.subWbs || "";
      subWbsCounts[sw] = (subWbsCounts[sw] || 0) + 1;
    });

    filteredData.forEach((act: any) => {
      const sw = act.subWbs || "";
      if (sw !== currentSubWbs) {
        currentSubWbs = sw;
        // Only show header if > 1 activity in that sub-WBS group
        if (subWbsCounts[sw] > 1) {
          rows.push({ _type: "subWbsHeader", label: sw, count: subWbsCounts[sw] });
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
          <Truck className="w-4 h-4 text-[#72216e]"/> Delivery Status
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

const OrderingTable = ({ data, groups, searchTerm, setSearchTerm }: { data: any[]; groups: any[]; searchTerm: string; setSearchTerm: (s: string) => void }) => {
  const filteredData = useMemo(() => {
    if (!searchTerm) return data;
    const term = searchTerm.toLowerCase();
    return data.filter((row: any) =>
      (row.description || "").toLowerCase().includes(term) ||
      (row.supplierOem || "").toLowerCase().includes(term) ||
      (row.packages || "").toLowerCase().includes(term) ||
      (row.plot || "").toLowerCase().includes(term) ||
      (row.blockNom || "").toLowerCase().includes(term)
    );
  }, [data, searchTerm]);

  // Build rows with package section headers
  const tableRows = useMemo(() => {
    const rows: any[] = [];
    let currentPackage = "";
    
    // Count activities per package
    const pkgCounts: Record<string, number> = {};
    filteredData.forEach((act: any) => {
      const p = act.packages || "";
      pkgCounts[p] = (pkgCounts[p] || 0) + 1;
    });

    filteredData.forEach((act: any) => {
      const p = act.packages || "";
      if (p !== currentPackage) {
        currentPackage = p;
        if (pkgCounts[p] > 1) {
          rows.push({ _type: "packageHeader", label: p, count: pkgCounts[p] });
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
          <ShoppingCart className="w-4 h-4 text-[#d97706]"/> Ordering (Supply) Status
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
              <th rowSpan={2} className="px-4 py-3 font-semibold tracking-wider w-12 text-center border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900">S.No</th>
              <th rowSpan={2} className="px-4 py-3 font-semibold tracking-wider border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900">Plot</th>
              <th rowSpan={2} className="px-4 py-3 font-semibold tracking-wider border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900">Packages</th>
              <th rowSpan={2} className="px-4 py-3 font-semibold tracking-wider border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900">UOM</th>
              <th rowSpan={2} className="px-4 py-3 font-semibold tracking-wider text-right border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900">Scope</th>
              <th rowSpan={2} className="px-4 py-3 font-semibold tracking-wider border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900">Supplier/OEM</th>
              <th colSpan={2} className="px-4 py-2 font-semibold tracking-wider text-center border-b border-slate-200 dark:border-slate-800 bg-amber-50/40 dark:bg-amber-950/20 text-[#d97706]">PO Agel to Supplier</th>
            </tr>
            <tr>
              <th className="px-4 py-2 font-semibold tracking-wider text-center border-b border-slate-200 dark:border-slate-800 text-[11px] bg-amber-50/40 dark:bg-amber-950/20">Plan (R2)</th>
              <th className="px-4 py-2 font-semibold tracking-wider text-center border-b border-slate-200 dark:border-slate-800 text-[11px] bg-amber-50/40 dark:bg-amber-950/20">Actual</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {tableRows.length === 0 && (
              <tr><td colSpan={8} className="px-6 py-16 text-center"><p className="text-sm font-medium text-slate-500 dark:text-slate-400">Ordering (Supply) structure established.</p><p className="text-xs text-muted-foreground mt-1">Data mapping to Oracle P6 activities will be configured later.</p></td></tr>
            )}
            {(() => {
              let sNo = 0;
              return tableRows.map((row: any, i: number) => {
                if (row._type === "packageHeader") {
                  return (
                    <tr key={`pkgh-${i}`} className="bg-slate-100/60 dark:bg-slate-800/40">
                      <td colSpan={8} className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-1.5 h-4 bg-[#d97706] rounded-full"></div>
                          <span className="font-bold text-sm text-slate-800 dark:text-slate-200 tracking-wide uppercase">{row.label}</span>
                          <span className="font-normal text-xs text-slate-500 dark:text-slate-400 normal-case ml-2">({row.count} items)</span>
                        </div>
                      </td>
                    </tr>
                  );
                }
                sNo++;
                const scope = Number(row.scope) || 0;
                const plotName = row.plot || row.blockNom || "-";
                return (
                  <tr key={`ord-${i}`} className="hover:bg-amber-50/30 dark:hover:bg-slate-800/60 transition-colors group">
                    <td className="px-4 py-3 font-medium text-slate-400 text-xs text-center">{sNo}</td>
                    <td className="px-4 py-3 font-semibold text-slate-800 dark:text-slate-200 text-xs">{plotName}</td>
                    <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100 min-w-[180px] whitespace-normal text-xs group-hover:text-[#d97706] transition-colors">
                      {row.packages || "-"}
                      {row.description && row.description !== row.packages && (
                        <div className="text-[11px] text-slate-500 font-normal mt-0.5">{row.description}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-500 dark:text-slate-400 text-xs">{row.uom || "-"}</td>
                    <td className="px-4 py-3 text-right font-semibold text-xs">{scope || "-"}</td>
                    <td className="px-4 py-3 text-slate-700 dark:text-slate-300 text-xs">
                      {row.supplierOem ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-100 border border-slate-200 dark:bg-slate-800 dark:border-slate-700 text-slate-700 dark:text-slate-300">
                          {row.supplierOem}
                        </span>
                      ) : "-"}
                    </td>
                    <td className="px-4 py-3 text-slate-500 dark:text-slate-400 text-xs text-center bg-amber-50/10 dark:bg-amber-950/5">{formatDate(row.baselineStart)}</td>
                    <td className="px-4 py-3 text-xs bg-amber-50/10 dark:bg-amber-950/5 text-center"><DateCell actual={row.actualStart} forecast={row.forecastStart} /></td>
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
