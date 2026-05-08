import React, { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { motion } from "framer-motion";
import { Hammer, Truck, Search, Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { getEDDeliveryData, getEDEngineeringData } from "@/services/p6ActivityService";

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
  } catch { return "-"; }
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
  const [activeTab, setActiveTab] = useState<"engineering" | "delivery">("engineering");
  const [engineeringData, setEngineeringData] = useState<{ data: any[]; groups: any[] }>({ data: [], groups: [] });
  const [deliveryData, setDeliveryData] = useState<{ data: any[]; groups: any[] }>({ data: [], groups: [] });
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    if (isOpen && projectId) {
      setLoading(true);
      Promise.all([
        getEDEngineeringData(projectId),
        getEDDeliveryData(projectId)
      ]).then(([eng, del]) => {
        setEngineeringData(eng);
        setDeliveryData(del);
      }).catch(console.error)
        .finally(() => setLoading(false));
    }
  }, [isOpen, projectId]);

  // Reset search on tab switch
  useEffect(() => setSearchTerm(""), [activeTab]);

  const handleExport = () => {
    const dataToExport = activeTab === "engineering" ? engineeringData.data : deliveryData.data;
    
    if (!dataToExport || dataToExport.length === 0) {
      toast.error(`No ${activeTab} data available to export`);
      return;
    }

    const exportToast = toast.loading(`Preparing ${activeTab} export...`);

    import("xlsx").then((XLSX) => {
      let worksheetData = [];
      let filename = "";

      if (activeTab === "engineering") {
        filename = `${projectName || "Project"}_Engineering_Tracker_${new Date().toISOString().split('T')[0]}.xlsx`;
        worksheetData = dataToExport.map((row: any) => ({
          "Activity ID": row.activityId || "-",
          "Description": row.description || "-",
          "Main Heading": row.mainHeading || "-",
          "Sub Heading": row.subHeading || "-",
          "Baseline Start": formatDate(row.baselineStart),
          "Baseline Finish": formatDate(row.baselineFinish),
          "Actual Start": formatDate(row.actualStart),
          "Actual Finish": formatDate(row.actualFinish),
          "% Completion": row.percent_complete ? `${parseFloat(row.percent_complete).toFixed(2)}%` : "0%"
        }));
      } else {
        filename = `${projectName || "Project"}_Delivery_Tracker_${new Date().toISOString().split('T')[0]}.xlsx`;
        worksheetData = dataToExport.map((row: any, idx: number) => ({
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
          "Actual Start": formatDate(row.actualStart),
          "Actual Finish": formatDate(row.actualFinish)
        }));
      }

      const worksheet = XLSX.utils.json_to_sheet(worksheetData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, activeTab === "engineering" ? "Engineering" : "Delivery");
      XLSX.writeFile(workbook, filename);
      toast.success("Export completed successfully", { id: exportToast });
    }).catch(err => {
      console.error("Export failed:", err);
      toast.error("Export failed. Please check console for details.", { id: exportToast });
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-[90vw] w-[90vw] h-[90vh] max-h-[90vh] flex flex-col p-0 overflow-hidden bg-slate-50 dark:bg-slate-950 border-0 shadow-2xl rounded-2xl">
        <DialogHeader className="px-8 py-5 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 z-10 shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">
                {projectName || "Project"} <span className="text-muted-foreground font-normal">|</span> <span className="text-primary">E&D Tracker</span>
              </DialogTitle>
              <p className="text-sm text-slate-500 mt-1">Manage Engineering workflows and Material Delivery schedules</p>
            </div>
            
            <div className="flex items-center gap-3">
              <Button 
                variant="outline" 
                size="sm" 
                className="flex h-9 rounded-full px-4"
                onClick={handleExport}
                disabled={loading}
              >
                <Download className="w-4 h-4 mr-2"/> Export
              </Button>
            </div>
          </div>
          
          {/* Premium Segmented Toggle */}
          <div className="flex justify-center mt-6 -mb-5">
            <div className="flex p-1.5 space-x-2 bg-slate-100 dark:bg-slate-800 rounded-full border border-slate-200/50 dark:border-slate-700/50 shadow-inner">
              <button
                onClick={() => setActiveTab("engineering")}
                className={`relative flex items-center justify-center gap-2 px-8 py-2.5 text-sm font-bold rounded-full transition-all duration-300 w-48 ${
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
                onClick={() => setActiveTab("delivery")}
                className={`relative flex items-center justify-center gap-2 px-8 py-2.5 text-sm font-bold rounded-full transition-all duration-300 w-48 ${
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
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search activities..."
            className="h-9 w-64 pl-9 pr-4 text-sm rounded-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-[#00609C]/50 transition-all"
          />
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
              <th className="px-5 py-3 font-semibold tracking-wider">Actual Start</th>
              <th className="px-5 py-3 font-semibold tracking-wider">Actual Finish</th>
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
                  <td className="px-5 py-3 text-slate-800 dark:text-slate-200 font-medium text-xs bg-slate-50/30 dark:bg-slate-800/10">{formatDate(row.actualStart)}</td>
                  <td className="px-5 py-3 text-slate-800 dark:text-slate-200 font-medium text-xs bg-slate-50/30 dark:bg-slate-800/10">{formatDate(row.actualFinish)}</td>
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
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search deliveries..."
            className="h-9 w-64 pl-9 pr-4 text-sm rounded-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-[#72216e]/50 transition-all"
          />
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
              <th className="px-4 py-3 font-semibold tracking-wider">Actual Start</th>
              <th className="px-4 py-3 font-semibold tracking-wider">Actual Finish</th>
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
                    <td className="px-4 py-3 text-slate-800 dark:text-slate-200 font-medium text-xs bg-slate-50/30 dark:bg-slate-800/10">{formatDate(row.actualStart)}</td>
                    <td className="px-4 py-3 text-slate-800 dark:text-slate-200 font-medium text-xs bg-slate-50/30 dark:bg-slate-800/10">{formatDate(row.actualFinish)}</td>
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
