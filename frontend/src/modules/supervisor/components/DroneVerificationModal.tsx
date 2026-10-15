import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertCircle, CheckCircle2, AlertTriangle, Loader2, Search, CalendarIcon, ChevronDown, ChevronRight, Download, Info, Mail } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import apiClient from "@/services/apiClient";
import { getP6ActivitiesForProject, mapActivitiesToDPBlock } from "@/services/p6ActivityService";
import { showAlert } from "@/components/AppDialog";

interface DroneVerificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: number;
  reportDate: string;
  dprRows?: any[];
  /** BESS PSS 13 / 14: show the drone survey data on its own - no DPR comparison, no P6 fetch. */
  droneOnly?: boolean;
}

// Spectra bess_progress: block -> structure -> stage, each with a scope and a work_done count.
interface DroneStage { name: string; scope: number | null; work_done: number | null; }
interface DroneStructure { name: string; stages: DroneStage[]; }
interface DroneBlock { block_name: string; status?: string; structures: DroneStructure[]; }

interface BlockBreakdown {
  block: string;
  dpr_scope?: number;
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
  bess_progress: "BESS Progress",
};

export const DroneVerificationModal: React.FC<DroneVerificationModalProps> = ({ isOpen, onClose, projectId, reportDate, dprRows, droneOnly = false }) => {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ComparisonResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState({ totalActivities: 0, discrepancies: 0, verified: 0, spectraProject: '' });
  const [syncInfo, setSyncInfo] = useState<Record<string, any>>({});
  const [selectedDate, setSelectedDate] = useState(reportDate);
  const [hasFetched, setHasFetched] = useState(false);
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  const [liveDprRows, setLiveDprRows] = useState<any[]>([]);
  const [loadingP6, setLoadingP6] = useState(false);
  const [emailSending, setEmailSending] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [droneBlocks, setDroneBlocks] = useState<DroneBlock[]>([]);

  // Available dates state
  const [availableDates, setAvailableDates] = useState<string[]>([]);
  const [loadingDates, setLoadingDates] = useState(false);
  const [lastFlightDate, setLastFlightDate] = useState<string | null>(null);

  // Fetch available dates + live P6 data when modal opens
  useEffect(() => {
    if (isOpen && projectId) {
      setData([]);
      setError(null);
      setHasFetched(false);
      setSyncInfo({});
      setSummary({ totalActivities: 0, discrepancies: 0, verified: 0, spectraProject: '' });
      setExpandedRows(new Set());
      setDroneBlocks([]);

      // Fetch available drone flight dates
      setLoadingDates(true);
      apiClient.get(`drone/available-dates/${projectId}`)
        .then(res => {
          const dates = res.data.dates || [];
          const lastDate = res.data.last_flight_date || null;
          setAvailableDates(dates);
          setLastFlightDate(lastDate);
          // Default to last flight date
          if (lastDate) {
            setSelectedDate(lastDate);
          }
        })
        .catch(err => {
          console.error('Failed to load available dates:', err);
          setAvailableDates([]);
          setLastFlightDate(null);
          setSelectedDate(reportDate);
        })
        .finally(() => setLoadingDates(false));

      // Always fetch live P6 data for per-block completed values (not needed when only the drone data is shown)
      if (droneOnly) return;
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
      const response = await apiClient.post(`drone/compare/${projectId}`, droneOnly ? { report_date: fetchDate, dpr_rows: [] } : payload);
      if (response.data.status === "success" && response.data.mode === "drone_only") {
        setDroneBlocks(response.data.blocks || []);
        const spectra = response.data.spectra_project;
        setSummary({ totalActivities: 0, discrepancies: 0, verified: 0, spectraProject: spectra ? `${spectra.name} (ID: ${spectra.id})` : "" });
        setSyncInfo(response.data.sync_info || {});
      } else if (response.data.status === "success") {
        setData(response.data.data);
        const spectra = response.data.spectra_project;
        const overReported = response.data.data.filter((r: ComparisonResult) => r.status === "Over-Reported" && !(r.drone_actual === 0 && r.spectra_api !== 'robot_progress')).length;
        const verified = response.data.data.filter((r: ComparisonResult) => r.status === "Verified").length;
        setSummary({
          totalActivities: response.data.total_activities_compared || 0,
          discrepancies: overReported,
          verified: verified,
          spectraProject: spectra ? `${spectra.name} (ID: ${spectra.id})` : "",
        });
        setSyncInfo(response.data.sync_info || {});
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

  const handleDownloadReport = async () => {
    if (!data || data.length === 0) return;

    try {
      const response = await apiClient.post(
        "drone/export-excel",
        {
          report_date: selectedDate,
          data: data,
        },
        {
          responseType: "blob",
        }
      );

      const blob = new Blob([response.data], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `Drone_Report_${selectedDate}.xlsx`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Failed to export Excel report:", err);
      showAlert("Failed to download the Excel report. Please try again.");
    }
  };

  // BESS drone-only: the server builds the block-wise report from Spectra for the selected date.
  const handleDownloadBessReport = async () => {
    try {
      const response = await apiClient.get(`drone/bess-excel/${projectId}`, {
        params: { report_date: selectedDate },
        responseType: "blob",
      });
      const blob = new Blob([response.data], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `Drone_Progress_${summary.spectraProject.split(' (')[0].replace(/ /g, '_') || 'BESS'}_${selectedDate}.xlsx`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Failed to export BESS drone report:", err);
      showAlert("Failed to download the Excel report. Please try again.");
    }
  };

  const handleEmailReport = async () => {
    if (!data || data.length === 0) return;

    setEmailSending(true);
    setEmailSent(false);
    try {
      const response = await apiClient.post("drone/send-email", {
        report_date: selectedDate,
        data: data,
        email: "joel.cordeiro@adani.com",
        project_name: summary.spectraProject || `Project ${projectId}`,
      });

      if (response.data.success) {
        setEmailSent(true);
        setTimeout(() => setEmailSent(false), 5000);
      } else {
        showAlert("Failed to send email. Please try again.");
      }
    } catch (err) {
      console.error("Failed to send email report:", err);
      showAlert("Failed to send the email report. Please try again.");
    } finally {
      setEmailSending(false);
    }
  };

  // Format date for display
  const formatDateLabel = (dateStr: string) => {
    try {
      const d = new Date(dateStr + 'T00:00:00');
      return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch {
      return dateStr;
    }
  };

  // Build a Set for fast lookup and Date objects for the calendar
  const availableDateSet = useMemo(() => new Set(availableDates), [availableDates]);
  const availableDateObjects = useMemo(() => availableDates.map(d => new Date(d + 'T00:00:00')), [availableDates]);
  const selectedDateObj = useMemo(() => selectedDate ? new Date(selectedDate + 'T00:00:00') : undefined, [selectedDate]);

  // Calendar: disable all days that are NOT in available dates
  const calendarDisabledMatcher = useCallback((day: Date) => {
    const dateStr = day.toLocaleDateString('en-CA'); // YYYY-MM-DD format
    return !availableDateSet.has(dateStr);
  }, [availableDateSet]);

  const [calendarOpen, setCalendarOpen] = useState(false);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-[85vw] w-[85vw] max-h-[90vh] p-0 flex flex-col overflow-hidden border-none shadow-2xl">
        <DialogHeader className="gradient-adani px-6 py-4 border-b flex-shrink-0 relative">
          <div>
            <DialogTitle className="flex items-center text-2xl text-white">
              Drone Progress Verification
            </DialogTitle>
            <DialogDescription className="text-white/80 mt-1">
              {droneOnly
                ? "Progress captured by the aerial drone survey, by block, structure and stage."
                : "Activity-level comparison of contractor DPR entries against AI-processed aerial drone surveys."}
            </DialogDescription>
          </div>

          <div className="absolute top-6 right-6 flex items-center gap-4">
            <div className="bg-emerald-500/20 text-emerald-100 border border-emerald-400/40 px-3 py-1.5 rounded-full text-xs font-semibold shadow-sm flex items-center gap-1.5 mr-2">
              <span className="bg-emerald-500 text-white px-1.5 py-0.5 rounded text-[10px] font-bold tracking-wider">ND</span>
              <span>Non Detected</span>
            </div>
            {!droneOnly && <Popover modal={true}>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="sm" className="text-white hover:bg-white/20 gap-2">
                  <Info className="w-4 h-4" />
                  Mapping Logic
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[500px] p-0 shadow-2xl" align="end" sideOffset={8}>
                <div className="bg-slate-50 border-b px-4 py-3 font-semibold text-slate-700 flex items-center justify-between">
                  <span>DPR to Drone Activity Mapping</span>
                </div>
                <div className="max-h-[400px] overflow-y-auto p-4 overscroll-contain">
                  {data.length === 0 ? (
                    <p className="text-sm text-slate-500 text-center py-4">No mapped activities loaded yet. Fetch data to see mappings.</p>
                  ) : (
                    <div className="space-y-3">
                      {data.map((row, idx) => (
                        <div key={idx} className="bg-white border rounded-md p-3 text-xs shadow-sm">
                          <div className="font-semibold text-primary mb-2 border-b pb-1">{row.activity}</div>
                          <div className="grid grid-cols-2 gap-2 text-slate-600">
                            <div><span className="text-slate-400 block text-[10px] uppercase tracking-wider">Drone API</span> {API_LABELS[row.spectra_api] || row.spectra_api}</div>
                            <div><span className="text-slate-400 block text-[10px] uppercase tracking-wider">Drone Field</span> {row.spectra_field}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </PopoverContent>
            </Popover>}
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 pb-6 pt-2">
          {/* Date Picker Bar */}
          <div className="flex items-center justify-between mt-2 p-3 bg-slate-50 rounded-lg border border-slate-200">
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-slate-600 flex-shrink-0">Drone Flight Date:</span>
              {loadingDates ? (
                <div className="flex items-center gap-2 text-sm text-slate-400">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading dates...
                </div>
              ) : availableDates.length > 0 ? (
                <Popover modal={true} open={calendarOpen} onOpenChange={setCalendarOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-9 px-3 gap-2 font-medium justify-start min-w-[180px]"
                    >
                      <CalendarIcon className="h-4 w-4 text-primary" />
                      {selectedDate ? (
                        <span>{formatDateLabel(selectedDate)}</span>
                      ) : (
                        <span className="text-muted-foreground">Pick a date</span>
                      )}
                      {selectedDate === lastFlightDate && (
                        <span className="ml-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200">
                          Latest
                        </span>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0 z-[10050] pointer-events-auto" align="start" sideOffset={8}>
                    <Calendar
                      mode="single"
                      selected={selectedDateObj}
                      onSelect={(day) => {
                        if (day) {
                          const dateStr = day.toLocaleDateString('en-CA');
                          setSelectedDate(dateStr);
                          setCalendarOpen(false);
                        }
                      }}
                      disabled={calendarDisabledMatcher}
                      modifiers={{ flight: availableDateObjects }}
                      modifiersStyles={{
                        // BESS: every flight date is a solid blue day, so earlier surveys are easy to spot and pick.
                        // The picked day is drawn darker with a ring. Solar keeps its original bold text.
                        flight: droneOnly
                          ? { backgroundColor: '#3b82f6', color: '#ffffff', fontWeight: 700, borderRadius: '6px' }
                          : { fontWeight: 700, color: 'var(--primary)' },
                        ...(droneOnly ? { selected: { backgroundColor: '#1d4ed8', color: '#ffffff', fontWeight: 700, borderRadius: '6px', boxShadow: '0 0 0 2px #93c5fd' } } : {}),
                      }}
                      defaultMonth={selectedDateObj}
                      className="rounded-md border-0"
                      classNames={{
                        day_disabled: "text-muted-foreground opacity-30",
                      }}
                    />
                    <div className="px-3 pb-3 pt-1 border-t border-slate-100">
                      <p className="text-[11px] text-slate-400 text-center">
                        <span className={`inline-block w-2 h-2 rounded-full mr-1 align-middle ${droneOnly ? 'bg-blue-500' : 'bg-primary'}`}></span>
                        {availableDates.length} flight date{availableDates.length !== 1 ? 's' : ''} available
                      </p>
                    </div>
                  </PopoverContent>
                </Popover>
              ) : (
                <span className="text-sm text-amber-600 font-medium">No drone flight dates available for this project</span>
              )}
              <Button
                onClick={handleSearch}
                disabled={loading || (!droneOnly && loadingP6) || loadingDates || !selectedDate || availableDates.length === 0}
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

            {hasFetched && droneOnly && droneBlocks.some(b => (b.structures || []).length > 0) && (
              <div className="flex items-center gap-2">
                <Button
                  onClick={handleDownloadBessReport}
                  size="sm"
                  variant="outline"
                  className="h-9 gap-2 text-primary border-primary hover:bg-primary hover:text-white"
                >
                  <Download className="w-4 h-4" /> Export Excel
                </Button>
              </div>
            )}

            {hasFetched && !droneOnly && data.length > 0 && (
              <div className="flex items-center gap-2">
                <Button
                  onClick={handleDownloadReport}
                  size="sm"
                  variant="outline"
                  className="h-9 gap-2 text-primary border-primary hover:bg-primary hover:text-white"
                >
                  <Download className="w-4 h-4" /> Export Excel
                </Button>
                <Button
                  onClick={handleEmailReport}
                  size="sm"
                  variant="outline"
                  disabled={emailSending}
                  className={`h-9 gap-2 border-emerald-600 hover:bg-emerald-600 hover:text-white ${emailSent ? 'bg-emerald-50 text-emerald-700 border-emerald-300' : 'text-emerald-600'
                    }`}
                >
                  {emailSending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : emailSent ? (
                    <CheckCircle2 className="w-4 h-4" />
                  ) : (
                    <Mail className="w-4 h-4" />
                  )}
                  {emailSending ? 'Sending...' : emailSent ? 'Email Sent!' : 'Email Report'}
                </Button>
              </div>
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
              <p className="text-sm mt-1">{droneOnly ? "Choose the date of the drone survey flight to view." : "Choose the date of the drone survey flight to compare against DPR entries."}</p>
            </div>
          ) : (
            <div className="space-y-6 mt-2">
              {droneOnly && <DroneOnlyView blocks={droneBlocks} reportDate={selectedDate} spectraProject={summary.spectraProject} />}
              {!droneOnly && Object.keys(syncInfo).length > 0 && Object.values(syncInfo).some(info => info !== null) && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 shadow-sm">
                  <div className="flex items-center gap-2 mb-3">
                    <Info className="w-5 h-5 text-blue-600" />
                    <h4 className="font-semibold text-blue-800">Drone Sync Context</h4>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    {Object.entries(syncInfo).map(([api, info]) => {
                      if (!info) return null;
                      return (
                        <div key={api} className="bg-white rounded p-3 shadow-sm border border-blue-100 text-sm">
                          <p className="font-medium text-blue-700 mb-1">{API_LABELS[api] || api}</p>
                          {typeof info === 'object' ? (
                            <div className="space-y-1">
                              {Object.entries(info).map(([k, v]) => (
                                <div key={k} className="flex justify-between items-center text-xs">
                                  <span className="text-slate-500 capitalize">{k.replace(/_/g, ' ')}:</span>
                                  <span className="font-medium text-slate-700">{v === null ? "N/A" : String(v)}</span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="text-xs text-slate-600">{info === null ? "N/A" : String(info)}</div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              {!droneOnly && <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                <Card className="p-3 bg-primary/5 border-primary/20 shadow-sm flex flex-col items-center justify-center text-center">
                  <p className="text-xs text-primary font-medium mb-0.5 opacity-70">Report Date</p>
                  <p className="text-lg font-bold text-primary">{selectedDate}</p>
                </Card>
                {summary.spectraProject && (
                  <Card className="p-3 bg-primary/5 border-primary/20 shadow-sm flex flex-col items-center justify-center text-center">
                    <p className="text-xs text-primary font-medium mb-0.5">Spectra Project</p>
                    <p className="text-sm font-bold text-primary truncate max-w-full" title={summary.spectraProject}>
                      {summary.spectraProject}
                    </p>
                  </Card>
                )}
                <Card className="p-3 bg-primary/10 border-primary/20 shadow-sm flex flex-col items-center justify-center text-center">
                  <p className="text-xs text-primary font-medium mb-0.5">Activities Compared</p>
                  <p className="text-lg font-bold text-primary">{summary.totalActivities}</p>
                </Card>
                <Card className="p-3 bg-green-50 border-green-200 shadow-sm flex flex-col items-center justify-center text-center">
                  <p className="text-xs text-green-600 font-medium mb-0.5">Verified</p>
                  <div className="flex items-center justify-center gap-1.5">
                    <p className="text-lg font-bold text-green-900">{summary.verified}</p>
                    <CheckCircle2 className="w-4 h-4 text-green-500" />
                  </div>
                </Card>
                <Card className={`p-3 shadow-sm flex flex-col items-center justify-center text-center ${summary.discrepancies > 0 ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'
                  }`}>
                  <p className={`text-xs font-medium mb-0.5 ${summary.discrepancies > 0 ? 'text-red-600' : 'text-green-600'}`}>
                    Over-Reported
                  </p>
                  <div className="flex items-center justify-center gap-1.5">
                    <p className={`text-lg font-bold ${summary.discrepancies > 0 ? 'text-red-900' : 'text-green-900'}`}>
                      {summary.discrepancies}
                    </p>
                    {summary.discrepancies > 0 ? (
                      <AlertTriangle className="w-4 h-4 text-red-500" />
                    ) : (
                      <CheckCircle2 className="w-4 h-4 text-green-500" />
                    )}
                  </div>
                </Card>
              </div>}

              {!droneOnly && <div className="border rounded-md shadow-sm bg-white max-h-[50vh] overflow-y-auto relative">
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
                              <TableCell className="text-right font-semibold text-primary">{row.drone_actual === 0 ? (row.spectra_api === 'robot_progress' ? 0 : "ND") : row.drone_actual}</TableCell>
                              <TableCell className={`text-right font-bold ${row.variance > 0 ? "text-red-600" : row.variance < 0 ? "text-orange-600" : "text-slate-600"
                                }`}>
                                {row.variance > 0 ? `+${row.variance}` : row.variance}
                              </TableCell>
                              <TableCell className="text-center">
                                {row.drone_actual === 0 && row.spectra_api !== 'robot_progress' ? null : row.status === "Verified" ? (
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
                                            <TableHead className="text-right">Scope (Plan)</TableHead>
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
                                              <TableCell className="text-right text-slate-500">{b.dpr_scope ?? '-'}</TableCell>
                                              <TableCell className="text-right">{b.dpr_actual}</TableCell>
                                              <TableCell className="text-right font-medium text-primary">{b.drone_actual === 0 ? (row.spectra_api === 'robot_progress' ? 0 : "ND") : b.drone_actual}</TableCell>
                                              <TableCell className={`text-right font-medium ${b.variance > 0 ? "text-red-600" : b.variance < 0 ? "text-orange-600" : "text-slate-600"
                                                }`}>
                                                {b.variance > 0 ? `+${b.variance}` : b.variance}
                                              </TableCell>
                                              <TableCell className="text-center">
                                                {b.drone_actual === 0 && row.spectra_api !== 'robot_progress' ? null : b.status === "Verified" ? (
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
              </div>}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

/**
 * Drone data on its own (BESS PSS 13 / 14): totals per stage across all blocks, then every block with
 * its structures and stages exactly as Spectra reports them. "ND" = not detected (null in the feed).
 */
const DroneOnlyView: React.FC<{ blocks: DroneBlock[]; reportDate: string; spectraProject: string }> = ({ blocks, reportDate, spectraProject }) => {
  // The block-wise table is long, so it starts collapsed; the Excel report carries it in full.
  const [showBlocks, setShowBlocks] = useState(false);
  const num = (v: number | null | undefined) => (v === null || v === undefined ? null : Number(v));
  const show = (v: number | null | undefined) => (v === null || v === undefined ? "ND" : String(v));
  const pct = (done: number | null, scope: number | null) =>
    done === null || !scope ? "-" : `${((done / scope) * 100).toFixed(1)}%`;

  // Totals per (structure, stage) over all blocks, in the order Spectra lists them.
  const totals = useMemo(() => {
    const map = new Map<string, { structure: string; stage: string; scope: number; done: number; blocks: number }>();
    blocks.forEach(b => b.structures?.forEach(st => st.stages?.forEach(sg => {
      const key = `${st.name}|${sg.name}`;
      const t = map.get(key) || { structure: st.name, stage: sg.name, scope: 0, done: 0, blocks: 0 };
      t.scope += num(sg.scope) || 0;
      t.done += num(sg.work_done) || 0;
      t.blocks += 1;
      map.set(key, t);
    })));
    return Array.from(map.values());
  }, [blocks]);

  // Spectra lists the blocks even for a date with no survey, just without any structures.
  if (blocks.length === 0 || !blocks.some(b => (b.structures || []).length > 0)) {
    return (
      <div className="bg-amber-50 text-amber-800 p-4 rounded-lg flex items-start">
        <AlertCircle className="w-5 h-5 mr-2 mt-0.5 text-amber-500" />
        <div>
          <p className="font-semibold">No drone survey data for {reportDate}</p>
          <p className="text-sm mt-1 text-amber-600">Pick one of the highlighted flight dates in the calendar.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Card className="p-3 bg-primary/5 border-primary/20 shadow-sm text-center">
          <p className="text-xs text-primary font-medium mb-0.5 opacity-70">Report Date</p>
          <p className="text-lg font-bold text-primary">{reportDate}</p>
        </Card>
        {spectraProject && (
          <Card className="p-3 bg-primary/5 border-primary/20 shadow-sm text-center">
            <p className="text-xs text-primary font-medium mb-0.5">Spectra Project</p>
            <p className="text-sm font-bold text-primary truncate" title={spectraProject}>{spectraProject}</p>
          </Card>
        )}
        <Card className="p-3 bg-primary/10 border-primary/20 shadow-sm text-center">
          <p className="text-xs text-primary font-medium mb-0.5">Blocks Surveyed</p>
          <p className="text-lg font-bold text-primary">{blocks.length}</p>
        </Card>
      </div>

      <div>
        <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">All blocks - total by stage</h4>
        <div className="border rounded-md shadow-sm bg-white overflow-hidden">
          <Table>
            <TableHeader className="bg-primary/5">
              <TableRow>
                <TableHead className="font-semibold">Structure</TableHead>
                <TableHead className="font-semibold">Stage</TableHead>
                <TableHead className="text-right font-semibold">Scope</TableHead>
                <TableHead className="text-right font-semibold">Work Done</TableHead>
                <TableHead className="text-right font-semibold">% Done</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {totals.map((t, i) => (
                <TableRow key={i}>
                  <TableCell className="font-medium">{t.structure}</TableCell>
                  <TableCell>{t.stage}</TableCell>
                  <TableCell className="text-right">{t.scope}</TableCell>
                  <TableCell className="text-right font-semibold text-primary">{t.done}</TableCell>
                  <TableCell className="text-right">{pct(t.done, t.scope)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Block-wise drone data</h4>
          <Button size="sm" variant="outline" className="h-8 gap-2" onClick={() => setShowBlocks(v => !v)}>
            {showBlocks ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            {showBlocks ? "Hide block-wise data" : `Show block-wise data (${blocks.length} blocks)`}
          </Button>
        </div>
        {showBlocks && <div className="border rounded-md shadow-sm bg-white max-h-[50vh] overflow-y-auto relative">
          <Table>
            <TableHeader className="bg-primary/5 sticky top-0 z-10 shadow-[0_1px_0_0_#e2e8f0]">
              <TableRow>
                <TableHead className="font-semibold">Block</TableHead>
                <TableHead className="font-semibold">Structure</TableHead>
                <TableHead className="font-semibold">Stage</TableHead>
                <TableHead className="text-right font-semibold">Scope</TableHead>
                <TableHead className="text-right font-semibold">Work Done</TableHead>
                <TableHead className="text-right font-semibold">% Done</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {blocks.map((b, bi) => {
                const lines = (b.structures || []).flatMap(st => (st.stages || []).map(sg => ({ st: st.name, sg })));
                return (
                  <React.Fragment key={bi}>
                    <TableRow className="bg-slate-100">
                      <TableCell colSpan={6} className="font-bold text-slate-700">
                        {b.block_name}
                        {b.status && <span className="ml-2 text-[10px] font-semibold uppercase text-slate-400">{b.status}</span>}
                      </TableCell>
                    </TableRow>
                    {lines.map((l, li) => (
                      <TableRow key={li}>
                        <TableCell />
                        <TableCell className="font-medium">{l.st}</TableCell>
                        <TableCell>{l.sg.name}</TableCell>
                        <TableCell className="text-right">{show(l.sg.scope)}</TableCell>
                        <TableCell className={`text-right font-semibold ${l.sg.work_done === null ? "text-slate-400" : "text-primary"}`}>{show(l.sg.work_done)}</TableCell>
                        <TableCell className="text-right">{pct(num(l.sg.work_done), num(l.sg.scope))}</TableCell>
                      </TableRow>
                    ))}
                  </React.Fragment>
                );
              })}
            </TableBody>
          </Table>
        </div>}
      </div>
    </div>
  );
};
