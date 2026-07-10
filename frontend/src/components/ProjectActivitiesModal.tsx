import React, { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, Calendar, Search, Activity } from "lucide-react";
import { getWindProgressActivities } from "@/services/p6ActivityService";

interface ProjectActivitiesModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId?: string | number;
  projectName?: string;
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

export const ProjectActivitiesModal: React.FC<ProjectActivitiesModalProps> = ({
  isOpen,
  onClose,
  projectId,
  projectName,
  dateFilter
}) => {
  const isDelayFilter = dateFilter === "Delayed Activities";

  const [data, setData] = useState<any[]>([]);
  const [dataDate, setDataDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    if (isOpen && projectId) {
      setLoading(true);
      getWindProgressActivities(projectId as any)
        .then(res => {
          const arr = Array.isArray(res.data) ? res.data : [];
          console.log("MANDVI DATA:", arr.filter((x: any) => x.status === 'Not Started').slice(0, 5));
          setData(arr);
          setDataDate(res.dataDate || null);
        })
        .catch(console.error)
        .finally(() => setLoading(false));
    }
  }, [isOpen, projectId]);

  const filteredData = useMemo(() => {
    let result = data;
    if (dateFilter) {
      const now = new Date();
      const days = dateFilter === "Last 7 days" ? 7 : dateFilter === "Last 30 days" ? 30 : 0;
      if (days > 0) {
        const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
        result = result.filter((row: any) => {
          // If status is 'Not Started', it shouldn't be counted as started
          if (row.status === 'Not Started') return false;
          
          if (row.actualStart && row.actualStart !== "-") {
            const start = parseDateRobustly(row.actualStart);
            // Allow dates up to tomorrow to handle timezone discrepancies (e.g., IST vs UTC)
            const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
            return start !== null && start >= cutoff && start <= tomorrow;
          }
          return false;
        });
      } else if (dateFilter === "Delayed Activities") {
        console.log("=== DELAYED ACTIVITIES DEBUG ===");
        let countCompleted = 0, countGroup = 0, countDate = 0;
        result = result.filter((row: any) => {
          if (row.status === 'Completed' || row.completionPercentage === '100' || row.status === 'Complete') {
            countCompleted++;
            return false;
          }
          
          const actGroup = (row.activityGroup || "").toUpperCase();
          const allowedGroups = ["ENG", "PRC", "CON", "ENGINEERING", "PROCUREMENT", "CONSTRUCTION", "CIVIL", "ELECTRICAL", "WTG", "INSTALLATION", "CW", "EL", "TC", "ER", "ME", "LA", "LINE", "PSS", "-"];
          const isAllowedGroup = allowedGroups.some(g => actGroup === g || actGroup.includes(g));
          if (!isAllowedGroup && actGroup !== "") {
            countGroup++;
            return false;
          }
          
          const referenceDate = dataDate ? parseDateRobustly(dataDate) : new Date();
          if (!referenceDate) return false;
          
          const hasActualStart = row.actualStart && row.actualStart !== "-";
          const hasActualFinish = row.actualFinish && row.actualFinish !== "-";
          
          let isDelayed = false;
          if (hasActualStart && !hasActualFinish) {
            // Check planned finish for delays
            const fFinish = parseDateRobustly(row.plannedFinish || row.plannedFinishDate);
            if (fFinish && fFinish < referenceDate) isDelayed = true;
          } else if (!hasActualStart) {
            // Check planned start for delays
            const fStart = parseDateRobustly(row.plannedStart || row.plannedStartDate);
            if (fStart && fStart < referenceDate) isDelayed = true;
          }
          
          if (!isDelayed) {
            return false;
          }
          return true;
        }).map((row: any) => {
          const referenceDate = dataDate ? parseDateRobustly(dataDate) : new Date();
          const hasActualStart = row.actualStart && row.actualStart !== "-";
          
          let delayDays = 0;
          if (hasActualStart) {
            const fFinish = parseDateRobustly(row.plannedFinish || row.plannedFinishDate);
            if (fFinish && referenceDate && fFinish < referenceDate) {
              delayDays = Math.floor((referenceDate.getTime() - fFinish.getTime()) / (1000 * 3600 * 24));
            }
          } else {
            const fStart = parseDateRobustly(row.plannedStart || row.plannedStartDate);
            if (fStart && referenceDate && fStart < referenceDate) {
              delayDays = Math.floor((referenceDate.getTime() - fStart.getTime()) / (1000 * 3600 * 24));
            }
          }

          let displayStatus = row.status || "In Progress";
          if ((displayStatus === 'In Progress' || hasActualStart) && row.completionPercentage) {
            displayStatus = `In Progress (${Math.round(parseFloat(row.completionPercentage))}%)`;
          }

          return {
            ...row,
            status: displayStatus,
            noOfDaysDelay: delayDays
          };
        });
        console.log(`Filtered out: Completed=${countCompleted}, Group=${countGroup}, NotDelayed=${countDate}. Remaining=${result.length}`);
      } else {
        // "All Time" shows everything without filtering out Not Started or future dates
        result = result;
      }
    }
    
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(row => 
        (row.description || "").toLowerCase().includes(term) ||
        (row.activityId || "").toLowerCase().includes(term) ||
        (row.wbsName || "").toLowerCase().includes(term)
      );
    }
    return result;
  }, [data, dateFilter, searchTerm, dataDate]);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-[90vw] w-[90vw] h-[90vh] max-h-[90vh] flex flex-col p-0 overflow-hidden bg-slate-50 dark:bg-slate-950 border-0 shadow-2xl rounded-2xl">
        <DialogHeader className={`px-8 py-5 border-b border-white/10 z-10 shrink-0 ${isDelayFilter ? 'bg-red-500' : 'bg-[#0d9488]'}`}>
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="text-2xl font-extrabold tracking-tight text-white flex items-center gap-2">
                <Calendar className="w-6 h-6" />
                {projectName || "Project"} <span className="text-white/60 font-normal">|</span> <span className="text-white">{isDelayFilter ? "Delayed Activities" : "Started Activities"}</span>
              </DialogTitle>
              <p className="text-sm text-white/80 mt-1">
                Showing {filteredData.length} {isDelayFilter ? "delayed activities from" : "activities that started in"} {dateFilter || "All Time"}
              </p>
            </div>
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-white/70" />
              <input
                type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search activities..."
                className="h-9 w-64 pl-9 pr-4 text-sm rounded-full border-0 bg-white/20 text-white placeholder:text-white/70 focus:outline-none focus:ring-2 focus:ring-white/50 transition-all"
              />
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-auto p-6 md:p-8 bg-slate-50 dark:bg-slate-950">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <Loader2 className="w-10 h-10 mx-auto mb-4 animate-spin text-[#0d9488]" />
                <p className="text-muted-foreground text-sm">Loading activities...</p>
              </div>
            </div>
          ) : (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm overflow-hidden flex flex-col h-full">
              <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/50 shrink-0">
                <h3 className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                  <Activity className="w-4 h-4 text-[#0d9488]" /> Project Activities Tracker
                </h3>
                {dataDate && (
                  <div className="text-[10px] font-bold text-teal-600 dark:text-teal-400 uppercase tracking-widest bg-teal-50 dark:bg-teal-900/30 px-3 py-1.5 rounded-md border border-teal-100 dark:border-teal-800/50">
                    Data Date: {formatDate(dataDate)}
                  </div>
                )}
              </div>
              <div className="overflow-auto flex-1">
                <table className="w-full text-sm text-left whitespace-nowrap">
                  <thead className="text-xs text-slate-500 bg-slate-50 dark:bg-slate-900 uppercase sticky top-0 z-10 border-b border-slate-200 dark:border-slate-800">
                    <tr>
                      <th className="px-5 py-3 font-semibold tracking-wider">Activity ID</th>
                      <th className="px-5 py-3 font-semibold tracking-wider">Description</th>
                      <th className="px-5 py-3 font-semibold tracking-wider">Group</th>
                      <th className="px-5 py-3 font-semibold tracking-wider">Location / WBS</th>
                      {isDelayFilter ? (
                        <>
                          <th className="px-5 py-3 font-semibold tracking-wider">Planned Start</th>
                          <th className="px-5 py-3 font-semibold tracking-wider">Planned Finish</th>
                          <th className="px-5 py-3 font-semibold tracking-wider">Delay (Days)</th>
                        </>
                      ) : (
                        <th className="px-5 py-3 font-semibold tracking-wider">Actual Start</th>
                      )}
                      <th className="px-5 py-3 font-semibold tracking-wider text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {filteredData.length === 0 && (
                      <tr><td colSpan={isDelayFilter ? 8 : 6} className="px-6 py-12 text-center text-muted-foreground">No activities found.</td></tr>
                    )}
                    {filteredData.map((row: any, i: number) => (
                      <tr key={i} className="hover:bg-teal-50/30 dark:hover:bg-slate-800/60 transition-colors">
                        <td className="px-5 py-3 font-medium text-slate-500 dark:text-slate-400 text-xs">{row.activityId || "-"}</td>
                        <td className="px-5 py-3 text-slate-900 dark:text-slate-100 min-w-[250px] whitespace-normal text-xs font-medium group-hover:text-[#0d9488] transition-colors">{row.description || "-"}</td>
                        <td className="px-5 py-3 text-slate-500 dark:text-slate-400 text-xs">{row.activityGroup || "-"}</td>
                        <td className="px-5 py-3 text-slate-500 dark:text-slate-400 text-xs truncate max-w-[200px]">{row.wbsName || "-"}</td>
                        
                        {isDelayFilter ? (
                          <>
                            <td className="px-5 py-3 font-bold text-xs text-red-500 dark:text-red-400">
                              {formatDate(row.plannedStart || row.plannedStartDate)}
                            </td>
                            <td className="px-5 py-3 font-bold text-xs text-red-500 dark:text-red-400">
                              {formatDate(row.plannedFinish || row.plannedFinishDate)}
                            </td>
                            <td className="px-5 py-3 font-bold text-xs text-red-600 dark:text-red-400 text-center">
                              {row.noOfDaysDelay > 0 ? `${row.noOfDaysDelay} d` : "-"}
                            </td>
                          </>
                        ) : (
                          <td className="px-5 py-3 font-bold text-xs text-teal-600 dark:text-teal-500">
                            {formatDate(row.actualStart)}
                          </td>
                        )}
                        
                        <td className="px-5 py-3 text-xs text-center">
                          <span className={`px-2 py-1 rounded-md text-[10px] font-bold ${row.status === 'Completed' ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'}`}>
                            {row.status || "In Progress"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
