import React, { useState, useEffect, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertCircle, CheckCircle2, AlertTriangle, Loader2, Search, CalendarIcon, ChevronDown, ChevronRight, Download } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import apiClient from "@/services/apiClient";
import { getP6ActivitiesForProject, mapActivitiesToDPBlock } from "@/services/p6ActivityService";

interface DroneVerificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: number;
  reportDate: string;
  dprRows?: any[];
}

interface BlockBreakdown {
  block: string;
  dpr_actual: number;
  drone_actual: number;
  variance: number;
  status: string;
}

interface ComparisonResult {
  activity: string;
  spectra_api: string;
  spectra_field: string;
  dpr_actual: number;
  drone_actual: number;
  variance: number;
  status: string;
  block_breakdown?: BlockBreakdown[];
}

const API_LABELS: Record<string, string> = {
  block_progress: "Block Progress",
  inverter_progress: "Inverter Progress",
  robot_progress: "Robot Progress",
  ac_work_progress: "AC Work Progress",
};

export const DroneVerificationModal: React.FC<DroneVerificationModalProps> = ({ isOpen, onClose, projectId, reportDate, dprRows }) => {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ComparisonResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState({ totalActivities: 0, discrepancies: 0, verified: 0, spectraProject: '' });
  const [selectedDate, setSelectedDate] = useState(reportDate);
  const [hasFetched, setHasFetched] = useState(false);
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  const [liveDprRows, setLiveDprRows] = useState<any[]>([]);
  const [loadingP6, setLoadingP6] = useState(false);

  // Fetch live P6 block-level data when modal opens
  useEffect(() => {
    if (isOpen && projectId) {
      setSelectedDate(reportDate);
      setData([]);
      setError(null);
      setHasFetched(false);
      setSummary({ totalActivities: 0, discrepancies: 0, verified: 0, spectraProject: '' });
      setExpandedRows(new Set());

      // Always fetch live P6 data for per-block completed values
      setLoadingP6(true);
      getP6ActivitiesForProject(projectId)
        .then(activities => {
          const blockData = mapActivitiesToDPBlock(activities);
          setLiveDprRows(blockData);
          console.log(`Drone Modal: Loaded ${blockData.length} per-block P6 activities for project ${projectId}`);
        })
        .catch(err => {
          console.error('Failed to load P6 activities for drone comparison:', err);
          // Fall back to parent-passed dprRows if P6 fetch fails
          setLiveDprRows(dprRows || []);
        })
        .finally(() => setLoadingP6(false));
    }
  }, [isOpen, projectId, reportDate]);

  const toggleRow = (idx: number) => {
    const next = new Set(expandedRows);
    if (next.has(idx)) {
      next.delete(idx);
    } else {
      next.add(idx);
    }
    setExpandedRows(next);
  };

  // Use live P6 data if available, otherwise fall back to parent-passed dprRows
  const effectiveDprRows = liveDprRows.length > 0 ? liveDprRows : (dprRows || []);

  const fetchComparison = useCallback(async (dateToFetch?: string) => {
    const fetchDate = dateToFetch || selectedDate;
    setLoading(true);
    setError(null);
    setData([]);
    try {
      const payload = {
        report_date: fetchDate,
        dpr_rows: effectiveDprRows
      };
      const response = await apiClient.post(`drone/compare/${projectId}`, payload);
      if (response.data.status === "success") {
        setData(response.data.data);
        const spectra = response.data.spectra_project;
        const overReported = response.data.data.filter((r: ComparisonResult) => r.status === "Over-Reported").length;
        const verified = response.data.data.filter((r: ComparisonResult) => r.status === "Verified").length;
        setSummary({
          totalActivities: response.data.total_activities_compared || 0,
          discrepancies: overReported,
          verified: verified,
          spectraProject: spectra ? `${spectra.name} (ID: ${spectra.id})` : "",
        });
      } else {
        setError(response.data.message || "Failed to load drone data.");
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || "Error connecting to Drone Verification Service.");
    } finally {
      setLoading(false);
      setHasFetched(true);
    }
  }, [selectedDate, projectId, effectiveDprRows]);

  const handleSearch = () => {
    if (selectedDate) {
      fetchComparison(selectedDate);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSearch();
  };

  const handleDownloadReport = () => {
    if (!data || data.length === 0) return;

    let csvContent = "Activity,Source API,DPR Cumulative,Drone Total,Variance,Status\n";
    
    data.forEach(row => {
      // Main row
      csvContent += `"${row.activity}","${API_LABELS[row.spectra_api] || row.spectra_api}",${row.dpr_actual},${row.drone_actual},${row.variance},"${row.status}"\n`;
      
      // Block breakdown
      if (row.block_breakdown && row.block_breakdown.length > 0) {
        row.block_breakdown.forEach(b => {
           csvContent += `"  -> Block: ${b.block}","",${b.dpr_actual},${b.drone_actual},${b.variance},"${b.status}"\n`;
        });
      }
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `drone_comparison_${selectedDate}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-7xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center text-2xl">
           Drone Progress Verification
          </DialogTitle>
          <DialogDescription>
            Activity-level comparison of contractor DPR entries against AI-processed aerial drone surveys.
          </DialogDescription>
        </DialogHeader>

        {/* Date Picker Bar */}
        <div className="flex items-center justify-between mt-2 p-3 bg-slate-50 rounded-lg border border-slate-200">
          <div className="flex items-center gap-3">
            <CalendarIcon className="w-5 h-5 text-slate-500 flex-shrink-0" />
            <span className="text-sm font-medium text-slate-600 flex-shrink-0">Drone Flight Date:</span>
            <Input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              onKeyDown={handleKeyDown}
              className="w-44 h-9 text-sm focus-visible:ring-primary"
              max={new Date().toISOString().split("T")[0]}
            />
            <Button
              onClick={handleSearch}
              disabled={loading || loadingP6 || !selectedDate}
              size="sm"
              className="h-9 px-4 gap-2 bg-primary hover:bg-primary/90 text-white"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Search className="h-4 w-4" />
              )}
              Fetch Drone Data
            </Button>
          </div>
          
          {hasFetched && data.length > 0 && (
            <Button 
              onClick={handleDownloadReport} 
              size="sm" 
              variant="outline" 
              className="h-9 gap-2 text-primary border-primary hover:bg-primary hover:text-white"
            >
              <Download className="w-4 h-4" /> Export CSV
            </Button>
          )}
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
            <p className="text-muted-foreground">Fetching drone data from Spectra APIs for {selectedDate}...</p>
          </div>
        ) : error ? (
          <div className="bg-amber-50 text-amber-800 p-4 rounded-lg flex items-start mt-2">
            <AlertCircle className="w-5 h-5 mr-2 mt-0.5 text-amber-500" />
            <div>
              <p className="font-semibold">No data for this date</p>
              <p className="text-sm">{error}</p>
              <p className="text-sm mt-1 text-amber-600">Try selecting a different date when drone surveys were conducted.</p>
            </div>
          </div>
        ) : !hasFetched ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400">
            <Search className="w-12 h-12 mb-4" />
            <p className="text-lg font-medium text-slate-500">Select a date and click "Fetch Drone Data"</p>
            <p className="text-sm mt-1">Choose the date of the drone survey flight to compare against DPR entries.</p>
          </div>
        ) : (
          <div className="space-y-6 mt-2">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Card className="p-4 bg-primary/5 border-primary/20 shadow-sm">
                <p className="text-sm text-primary font-medium mb-1 opacity-70">Report Date</p>
                <p className="text-xl font-bold text-primary">{selectedDate}</p>
              </Card>
              {summary.spectraProject && (
                <Card className="p-4 bg-primary/5 border-primary/20 shadow-sm">
                  <p className="text-sm text-primary font-medium mb-1">Spectra Project</p>
                  <p className="text-lg font-bold text-primary">{summary.spectraProject}</p>
                </Card>
              )}
              <Card className="p-4 bg-primary/10 border-primary/20 shadow-sm">
                <p className="text-sm text-primary font-medium mb-1">Activities Compared</p>
                <p className="text-xl font-bold text-primary">{summary.totalActivities}</p>
              </Card>
              <Card className="p-4 bg-green-50 border-green-200 shadow-sm">
                <p className="text-sm text-green-600 font-medium mb-1">Verified</p>
                <div className="flex items-center">
                  <p className="text-xl font-bold text-green-900">{summary.verified}</p>
                  <CheckCircle2 className="w-5 h-5 text-green-500 ml-2" />
                </div>
              </Card>
              <Card className={`p-4 shadow-sm ${summary.discrepancies > 0 ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'}`}>
                <p className={`text-sm font-medium mb-1 ${summary.discrepancies > 0 ? 'text-red-600' : 'text-green-600'}`}>
                  Over-Reported
                </p>
                <div className="flex items-center">
                  <p className={`text-xl font-bold ${summary.discrepancies > 0 ? 'text-red-900' : 'text-green-900'}`}>
                    {summary.discrepancies}
                  </p>
                  {summary.discrepancies > 0 ? (
                    <AlertTriangle className="w-5 h-5 text-red-500 ml-2" />
                  ) : (
                    <CheckCircle2 className="w-5 h-5 text-green-500 ml-2" />
                  )}
                </div>
              </Card>
            </div>

            <div className="border rounded-md shadow-sm bg-white max-h-[50vh] overflow-y-auto relative">
              <Table>
                <TableHeader className="bg-primary/5 sticky top-0 z-10 shadow-[0_1px_0_0_#e2e8f0]">
                  <TableRow>
                    <TableHead className="w-[60px] font-semibold text-center">#</TableHead>
                    <TableHead className="font-semibold">Activity</TableHead>
                    <TableHead className="font-semibold text-center">Source API</TableHead>
                    <TableHead className="text-right font-semibold">DPR Cumulative</TableHead>
                    <TableHead className="text-right font-semibold">Drone Total</TableHead>
                    <TableHead className="text-right font-semibold">Variance</TableHead>
                    <TableHead className="text-center font-semibold">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-12 text-muted-foreground bg-slate-50">
                        <AlertCircle className="w-8 h-8 mx-auto text-slate-400 mb-3" />
                        <p className="text-base font-semibold text-slate-700">No matching activities found.</p>
                        <p className="text-sm mt-1 max-w-md mx-auto">
                          None of the DP Qty activities could be matched against the drone mapping for this date.
                        </p>
                      </TableCell>
                    </TableRow>
                  ) : (
                    data.map((row, idx) => {
                      const hasBreakdown = row.block_breakdown && row.block_breakdown.length > 0;
                      const isExpanded = expandedRows.has(idx);

                      return (
                        <React.Fragment key={idx}>
                          <TableRow className={`cursor-pointer hover:bg-slate-50 transition-colors ${row.status === "Over-Reported" ? "bg-red-50/50" : ""}`} onClick={() => hasBreakdown && toggleRow(idx)}>
                            <TableCell className="text-center text-slate-500 font-medium">
                              {hasBreakdown ? (
                                isExpanded ? <ChevronDown className="h-4 w-4 mx-auto text-slate-400" /> : <ChevronRight className="h-4 w-4 mx-auto text-slate-400" />
                              ) : (
                                idx + 1
                              )}
                            </TableCell>
                            <TableCell className="font-medium">{row.activity}</TableCell>
                            <TableCell className="text-center">
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-700">
                                {API_LABELS[row.spectra_api] || row.spectra_api}
                              </span>
                            </TableCell>
                            <TableCell className="text-right font-semibold">{row.dpr_actual}</TableCell>
                            <TableCell className="text-right font-semibold text-primary">{row.drone_actual}</TableCell>
                            <TableCell className={`text-right font-bold ${
                              row.variance > 0 ? "text-red-600" : row.variance < 0 ? "text-orange-600" : "text-slate-600"
                            }`}>
                              {row.variance > 0 ? `+${row.variance}` : row.variance}
                            </TableCell>
                            <TableCell className="text-center">
                              {row.status === "Verified" ? (
                                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-800">
                                  🟢 Verified
                                </span>
                              ) : row.status === "Over-Reported" ? (
                                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-800">
                                  🔴 Over-Reported
                                </span>
                              ) : (
                                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold bg-orange-100 text-orange-800">
                                  🟠 Under-Reported
                                </span>
                              )}
                            </TableCell>
                          </TableRow>
                          
                          {/* Expanded Breakdown */}
                          {isExpanded && hasBreakdown && (
                            <TableRow className="bg-slate-50/80">
                              <TableCell colSpan={7} className="p-0 border-b border-t border-slate-200">
                                <div className="px-8 py-4 bg-slate-50/80 shadow-inner">
                                  <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Block-Wise Breakdown</h4>
                                  <div className="border rounded-md shadow-sm overflow-hidden bg-white">
                                    <Table className="text-sm">
                                      <TableHeader className="bg-slate-100">
                                        <TableRow>
                                          <TableHead className="w-[120px]">Block</TableHead>
                                          <TableHead className="text-right">DPR Actual</TableHead>
                                          <TableHead className="text-right">Drone Actual</TableHead>
                                          <TableHead className="text-right">Variance</TableHead>
                                          <TableHead className="text-center w-[150px]">Status</TableHead>
                                        </TableRow>
                                      </TableHeader>
                                      <TableBody>
                                        {row.block_breakdown!.map((b, bIdx) => (
                                          <TableRow key={bIdx}>
                                            <TableCell className="font-medium text-slate-600">{b.block}</TableCell>
                                            <TableCell className="text-right">{b.dpr_actual}</TableCell>
                                            <TableCell className="text-right font-medium text-primary">{b.drone_actual}</TableCell>
                                            <TableCell className={`text-right font-medium ${
                                              b.variance > 0 ? "text-red-600" : b.variance < 0 ? "text-orange-600" : "text-slate-600"
                                            }`}>
                                              {b.variance > 0 ? `+${b.variance}` : b.variance}
                                            </TableCell>
                                            <TableCell className="text-center">
                                              {b.status === "Verified" ? (
                                                <span className="text-xs font-medium text-green-600 flex items-center justify-center gap-1">
                                                  <CheckCircle2 className="w-3 h-3" /> Verified
                                                </span>
                                              ) : b.status === "Over-Reported" ? (
                                                <span className="text-xs font-medium text-red-600 flex items-center justify-center gap-1">
                                                  <AlertTriangle className="w-3 h-3" /> Over
                                                </span>
                                              ) : (
                                                <span className="text-xs font-medium text-orange-600 flex items-center justify-center gap-1">
                                                  <AlertCircle className="w-3 h-3" /> Under
                                                </span>
                                              )}
                                            </TableCell>
                                          </TableRow>
                                        ))}
                                      </TableBody>
                                    </Table>
                                  </div>
                                </div>
                              </TableCell>
                            </TableRow>
                          )}
                        </React.Fragment>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
