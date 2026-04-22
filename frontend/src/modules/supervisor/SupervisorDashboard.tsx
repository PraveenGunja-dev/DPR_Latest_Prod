import { useState, useEffect, useCallback, useMemo } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { useAuth } from "@/modules/auth/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { RefreshCw, FileSpreadsheet, AlertCircle, Filter, Layers, CheckCircle2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { getAssignedProjects } from "@/services/projectService";
import { getDraftEntry, getTodayAndYesterday } from "@/services/dprService";
import { getIssues, Issue as BackendIssue } from "@/services/issuesService";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useFilter } from "@/modules/auth/contexts/FilterContext";
import { DashboardLayout } from "@/components/shared/DashboardLayout";
import { IssueFormModal, IssuesTable } from "./components";
import { getProjectTypeConfig } from "@/config/sheetConfig";
import { detectProjectType } from "@/utils/projectUtils";
import { SolarDashboard, WindDashboard, PSSDashboard } from "./components/project-dashboards";
import { 
  getP6ActivitiesForProject, 
  syncP6Data, 
  extractActivityName, 
  extractBlockName, 
  getWindProgressActivities,
  getWbsTree,
  SWITCHYARD_WBS_PATTERNS,
  TRANS_LINE_WBS_PATTERNS,
  INFRA_WORKS_WBS_PATTERNS
} from "@/services/p6ActivityService";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// Define the Issue interface for UI use
interface Issue {
  id: string;
  description: string;
  startDate: string;
  finishedDate: string | null;
  delayedDays: number;
  status: "Open" | "In Progress" | "Resolved" | "Closed";
  priority: "Low" | "Medium" | "High" | "Critical";
  actionRequired: string;
  remarks: string;
  attachment: File | null;
  attachmentName: string | null;
  projectName?: string;
}

const SupervisorDashboard = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { projectId: projectIdFromUrl } = useParams<{ projectId?: string }>();
  const { user, token } = useAuth();
  const { universalFilter, setUniversalFilter, loadProjectFilter } = useFilter();

  // Extract project data from location state
  const locationState = location.state || {};
  const projectName = locationState.projectName || "Project";
  const projectIdFromLocation = locationState.projectId || null;
  const projectDetails = locationState.projectDetails || null;
  const initialActiveTab = locationState.activeTab || "summary";

  // Extract and normalize project ID to number
  const initialProjectId = useMemo(() => {
    const id = projectIdFromUrl || projectIdFromLocation;
    return id ? Number(id) : null;
  }, [projectIdFromUrl, projectIdFromLocation]);

  // Core States
  const [currentProjectId, setCurrentProjectId] = useState<number | null>(initialProjectId);
  const [activeTab, setActiveTab] = useState(initialActiveTab);
  const [assignedProjects, setAssignedProjects] = useState<any[]>([]);
  const [currentDraftEntry, setCurrentDraftEntry] = useState<any>(null);
  const [isAddIssueModalOpen, setIsAddIssueModalOpen] = useState(false);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [loading, setLoading] = useState(false);
  const [p6Activities, setP6Activities] = useState<any[]>([]);
  const [selectedBlock, setSelectedBlock] = useState("ALL");
  const [selectedSubstation, setSelectedSubstation] = useState("ALL");
  const [selectedLocation, setSelectedLocation] = useState("ALL");
  const [selectedActivityGroup, setSelectedActivityGroup] = useState("ALL");
  const [availableWindFilters, setAvailableWindFilters] = useState<{
    locations: string[];
    substations: string[];
    activityGroups: string[];
  }>({ locations: ["ALL"], substations: ["ALL"], activityGroups: ["ALL"] });
  const [isSyncing, setIsSyncing] = useState(false);
  const [availableRajasthanSheets, setAvailableRajasthanSheets] = useState({
    switchyard: false,
    transmission_line: false,
    infra_works: false
  });
  
  const { today, yesterday } = useMemo(() => getTodayAndYesterday(), []);
  const [targetDate, setTargetDate] = useState<string>(today);

  // Sync with URL params
  useEffect(() => {
    if (projectIdFromUrl && Number(projectIdFromUrl) !== currentProjectId) {
      setCurrentProjectId(Number(projectIdFromUrl));
    }
  }, [projectIdFromUrl, currentProjectId]);

  // Target yesterday calculation
  const targetYesterday = useMemo(() => {
    try {
      const date = new Date(targetDate);
      if (isNaN(date.getTime())) return yesterday;
      date.setDate(date.getDate() - 1);
      return date.toISOString().split('T')[0];
    } catch {
      return yesterday;
    }
  }, [targetDate, yesterday]);

  // Derive current project object
  const currentProject = assignedProjects.find(p =>
    String(p.ObjectId) === String(currentProjectId) ||
    String(p.id) === String(currentProjectId)
  ) || projectDetails;

  const effectiveProjectName = useMemo(() => 
    currentProject?.name || currentProject?.Name || projectName, 
    [currentProject, projectName]
  );

  // Final project type detection
  const currentProjectType = useMemo(() => 
    detectProjectType(currentProject, effectiveProjectName), 
    [currentProject, effectiveProjectName]
  );

  const projectTypeConfig = useMemo(() => getProjectTypeConfig(currentProjectType, currentProject, effectiveProjectName), [currentProjectType, currentProject, effectiveProjectName]);
  
  // Update activeTab if it's generic 'summary' but needs to be type-specific
  useEffect(() => {
    if (activeTab === 'summary') {
      if (currentProjectType === 'wind') setActiveTab('wind_summary');
      else if (currentProjectType === 'pss') setActiveTab('pss_summary');
    }
  }, [currentProjectType, activeTab]);

  // Fetch projects on load
  useEffect(() => {
    const fetchProjects = async () => {
      if (!token) return;
      setLoading(true);
      try {
        const projects = await getAssignedProjects();
        setAssignedProjects(projects);
      } catch (err) {
        console.error("Failed to load projects");
      } finally {
        setLoading(false);
      }
    };
    fetchProjects();
  }, [token]);

  // Fetch draft whenever project or date changes
  useEffect(() => {
    const fetchDraft = async () => {
      if (!currentProjectId || !targetDate) return;
      try {
        const draft = await getDraftEntry(currentProjectId, activeTab, targetDate);
        setCurrentDraftEntry(draft);
      } catch (error) {
        console.error("Error fetching draft:", error);
      }
    };
    fetchDraft();
  }, [currentProjectId, activeTab, targetDate, projectTypeConfig]);

  // Tab management logic based on project type
  useEffect(() => {
    if (currentProjectId) {
      loadProjectFilter(currentProjectId);
    }
    if (projectTypeConfig?.sheets?.length > 0) {
      const validTabIds = projectTypeConfig.sheets.filter(s => hasAccessToSheet(s.id)).map(s => s.id);
      if (!validTabIds.includes(activeTab) && activeTab !== 'issues' && activeTab !== 'summary') {
        setActiveTab('summary');
      }
    }
  }, [currentProjectId, projectTypeConfig, availableRajasthanSheets]);

  // Fetch P6 Activities if Project is Solar or Wind (for filters)
  useEffect(() => {
    const fetchActivities = async () => {
      if (!currentProjectId) return;
      
      // Fetch WBS tree to check for Rajasthan optional sheets
      if (currentProjectType === 'solar') {
        try {
          const wbsNodes = await getWbsTree(currentProjectId);
          const hasSwitchyard = wbsNodes.some(n => 
            SWITCHYARD_WBS_PATTERNS.some(p => (n.name || '').toUpperCase().includes(p.toUpperCase()))
          );
          const hasTransLine = wbsNodes.some(n => 
            TRANS_LINE_WBS_PATTERNS.some(p => (n.name || '').toUpperCase().includes(p.toUpperCase()))
          );
          const hasInfra = wbsNodes.some(n => 
            INFRA_WORKS_WBS_PATTERNS.some(p => (n.name || '').toUpperCase().includes(p.toUpperCase()))
          );
          
          setAvailableRajasthanSheets({
            switchyard: hasSwitchyard,
            transmission_line: hasTransLine,
            infra_works: hasInfra
          });
        } catch (error) {
          console.error("Error checking WBS tree for Rajasthan sheets:", error);
        }
      }

      if (currentProjectType === 'solar') {
        try {
          const acts = await getP6ActivitiesForProject(currentProjectId);
          setP6Activities(Array.isArray(acts) ? acts : []);
        } catch (error) {
          console.error("Error fetching solar activities for filter:", error);
        }
      } else if (currentProjectType === 'wind') {
        try {
          const response = await getWindProgressActivities(currentProjectId, targetDate);
          setP6Activities(Array.isArray(response.data) ? response.data : []);
        } catch (error) {
          console.error("Error fetching wind activities for filter:", error);
        }
      }
    };
    fetchActivities();
  }, [currentProjectId, currentProjectType, targetDate]);

  const handleSyncP6 = async () => {
    if (!currentProjectId) return;
    setIsSyncing(true);
    try {
      await syncP6Data(currentProjectId);
      toast.success("Sync started. Data will be updated shortly.");
      const acts = currentProjectType === 'solar' 
        ? await getP6ActivitiesForProject(currentProjectId)
        : (await getWindProgressActivities(currentProjectId, targetDate)).data;
      setP6Activities(Array.isArray(acts) ? acts : []);
    } catch (error) {
      toast.error("Sync failed");
    } finally {
      setIsSyncing(false);
    }
  };

  // Derived filter options for Solar
  const uniqueBlocks = useMemo(() => {
    const blocks = new Set<string>();
    blocks.add("ALL");
    if (Array.isArray(p6Activities) && currentProjectType === 'solar') {
      p6Activities.forEach(a => {
        const b = (a.block || a.newBlockNom || a.plot || extractBlockName(a.name || "") || "").toUpperCase();
        if (b) blocks.add(b);
      });
    }
    return Array.from(blocks).sort();
  }, [p6Activities, currentProjectType]);

  const uniquePackages = useMemo(() => {
    const packages = new Set<string>();
    packages.add("ALL");
    if (Array.isArray(p6Activities) && currentProjectType === 'solar') {
      p6Activities.forEach(a => {
        const actId = String(a.activityId || a.activity_id || "");
        if (actId) {
          const prefixMatch = actId.match(/^[A-Z0-9]+-([A-Z]+)-/);
          if (prefixMatch && prefixMatch[1]) {
            packages.add(prefixMatch[1].toUpperCase());
          } else {
            const parts = actId.split("-");
            if (parts.length >= 2) {
              packages.add(parts[1].toUpperCase());
            }
          }
        }
      });
    }
    return Array.from(packages).sort();
  }, [p6Activities, currentProjectType]);

  // Derived filter options for Wind
  const uniqueWindLocations = useMemo(() => {
    const locs = new Set<string>();
    locs.add("ALL");
    if (Array.isArray(p6Activities) && currentProjectType === 'wind') {
      p6Activities.forEach(a => {
        const match = a.description?.match(/(WTG\d+)/i);
        if (match) locs.add(match[1].toUpperCase());
        if (a.locations) locs.add(a.locations.toUpperCase());
      });
    }
    return Array.from(locs).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }, [p6Activities, currentProjectType]);

  const uniqueSubstations = useMemo(() => {
    const subs = new Set<string>();
    subs.add("ALL");
    if (Array.isArray(p6Activities) && currentProjectType === 'wind') {
      p6Activities.forEach(a => {
        const match = (a.description + " " + a.activityId + " " + (a.wbsName || "")).match(/(PSS-?\d+)/i);
        if (match) subs.add(match[1].toUpperCase());
        if (a.substation) subs.add(a.substation.toUpperCase());
      });
    }
    return Array.from(subs).sort();
  }, [p6Activities, currentProjectType]);

  const uniqueActivityGroups = useMemo(() => {
    const grps = new Set<string>();
    grps.add("ALL");
    if (Array.isArray(p6Activities) && currentProjectType === 'wind') {
      p6Activities.forEach(a => {
        if (a.activityGroup) grps.add(a.activityGroup.toUpperCase());
      });
    }
    return Array.from(grps).sort();
  }, [p6Activities, currentProjectType]);

  // Access control
  const hasAccessToSheet = (sheetType: string) => {
    const role = (user?.role || user?.Role || "").toString().toLowerCase();
    if (role !== 'supervisor') return true;
    if (sheetType === 'summary' || sheetType === 'issues') return true;
    
    let permittedSheets = currentProject?.sheetTypes || currentProject?.SheetTypes || currentProject?.sheet_types || [];
    if (typeof permittedSheets === 'string') {
      try { permittedSheets = JSON.parse(permittedSheets) } catch (e) { permittedSheets = [] }
    }
    if (!permittedSheets || permittedSheets.length === 0) {
      // If no explicit permissions set, still enforce dynamic Rajasthan WBS visibility
      if (sheetType === 'switchyard') return availableRajasthanSheets.switchyard;
      if (sheetType === 'transmission_line') return availableRajasthanSheets.transmission_line;
      if (sheetType === 'infra_works') return availableRajasthanSheets.infra_works;
      return true;
    }
    
    // Check both explicit permissions AND dynamic WBS existence
    if (sheetType === 'switchyard' && !availableRajasthanSheets.switchyard) return false;
    if (sheetType === 'transmission_line' && !availableRajasthanSheets.transmission_line) return false;
    if (sheetType === 'infra_works' && !availableRajasthanSheets.infra_works) return false;
    
    return permittedSheets.includes(sheetType);
  };

  // Read-only logic: only lock if approved or if user role is unauthorized
  const isEntryReadOnly = useMemo(() => {
    if (!currentDraftEntry) return false;
    const userRoleLower = (user?.role || user?.Role || '').toLowerCase();
    
    // Roles that can always edit if not approved
    const isAuthorizedRole = userRoleLower.includes('supervisor') || userRoleLower === 'site pm' || userRoleLower === 'pmag' || userRoleLower === 'super admin';
    
    // Statuses that represent a hard lock (Approved)
    // Submitted entries are NOT locked so multiple submits/edits are possible
    const isLocked = ['approved_by_pm', 'final_approved', 'approved_by_pmag'].includes(currentDraftEntry.status);
    
    if (!isAuthorizedRole) return true;
    if (isLocked) return true;
    
    // In all other cases (draft, submitted, rejected), it's editable
    return false;
  }, [currentDraftEntry, user]);

  const renderActiveDashboard = () => {
    // If it's the issues tab, we handle it here as it's common
    if (activeTab === 'issues') {
      return (
        <>
          <IssueFormModal
             open={isAddIssueModalOpen}
             onOpenChange={setIsAddIssueModalOpen}
             onSubmit={() => {}} // Implementation in issues context
          />
          <IssuesTable issues={issues} onAddIssue={() => setIsAddIssueModalOpen(true)} />
        </>
      );
    }

    // Otherwise, delegate to project-specific dashboard
    switch (currentProjectType) {
      case 'solar':
        return (
          <SolarDashboard
            projectId={currentProjectId}
            projectName={projectName}
            targetDate={targetDate}
            targetYesterday={targetYesterday}
            activeTab={activeTab}
            user={user}
            currentDraftEntry={currentDraftEntry}
            onDraftUpdate={setCurrentDraftEntry}
            isEntryReadOnly={isEntryReadOnly}
            universalFilter={universalFilter}
            setUniversalFilter={setUniversalFilter}
            selectedBlock={selectedBlock}
            p6Activities={p6Activities}
          />
        );
      case 'wind':
        return (
          <WindDashboard
            projectId={currentProjectId!}
            projectName={projectName}
            targetDate={targetDate}
            targetYesterday={targetYesterday}
            activeTab={activeTab}
            currentDraftEntry={currentDraftEntry}
            onDraftUpdate={setCurrentDraftEntry}
            isEntryReadOnly={isEntryReadOnly}
            selectedSubstation={selectedSubstation}
            selectedLocation={selectedLocation}
            selectedActivityGroup={selectedActivityGroup}
            onFiltersLoaded={setAvailableWindFilters}
          />
        );
      case 'pss':
        return (
          <PSSDashboard
            projectId={currentProjectId}
            targetDate={targetDate}
            targetYesterday={targetYesterday}
            activeTab={activeTab}
            currentDraftEntry={currentDraftEntry}
            onDraftUpdate={setCurrentDraftEntry}
            isEntryReadOnly={isEntryReadOnly}
          />
        );
      default:
        return (
          <div className="text-center py-12">
            <AlertCircle className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-xl font-semibold">Unknown Project Type</h3>
            <p className="text-muted-foreground">This project type is not currently supported.</p>
          </div>
        );
    }
  };

  return (
    <DashboardLayout
      userName={user?.name || user?.Name || "User"}
      userRole={user?.role || user?.Role || "supervisor"}
      projectName={effectiveProjectName}
      projectId={currentProjectId}
      projectDetails={currentProject}
      projectP6Id={currentProject?.P6Id || (projectDetails as any)?.P6Id}
    >
      <div className="w-full flex-1 min-h-0 flex flex-col">
        {!currentProjectId && !loading ? (
          <div className="flex-1 flex items-center justify-center p-4">
            <Card className="max-w-md w-full p-8 text-center shadow-lg border-dashed border-2">
              <AlertCircle className="w-16 h-16 mx-auto mb-4 text-orange-500 opacity-80" />
              <h3 className="text-xl font-bold mb-2">Unable to load project</h3>
              <p className="text-muted-foreground mb-6">
                Unable to load entry. Please try refreshing the page or selecting a different project.
              </p>
              <div className="flex flex-col gap-3">
                <Button onClick={() => navigate("/projects")} className="w-full">
                  <FileSpreadsheet className="w-4 h-4 mr-2" />
                  Select Project
                </Button>
              </div>
            </Card>
          </div>
        ) : (
          <>
            <div className="mb-4 sm:mb-6 flex-shrink-0">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-3">
              <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold">Daily Progress Report</h1>
              <div className="flex items-center gap-2 bg-background border border-border rounded-md px-2 py-1 shadow-sm">
                <span className="text-xs font-medium text-muted-foreground">Report Date:</span>
                <input
                  type="date"
                  value={targetDate}
                  onChange={(e) => setTargetDate(e.target.value)}
                  max={today}
                  className="bg-transparent text-xs border-none outline-none cursor-pointer font-medium"
                />
              </div>
            </div>
            
            <div className="flex items-center space-x-2 sm:space-x-3">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" className="h-8 text-[11px] font-medium" onClick={handleSyncP6} disabled={isSyncing}>
                <RefreshCw className={`w-3 h-3 mr-1 ${isSyncing ? 'animate-spin' : ''}`} />
                Sync Project
              </Button>
              
              {/* Push P6 Button - Restricted to PMAG only at the top level */}
              {(user?.role?.toLowerCase() === 'pmag' || user?.Role?.toLowerCase() === 'pmag') && currentDraftEntry && (
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="h-8 text-[11px] font-bold border-blue-400 bg-blue-50 hover:bg-blue-100 text-blue-700" 
                  onClick={async () => {
                    if (!currentDraftEntry) return;
                    setIsSyncing(true);
                    try {
                      const { pushEntryToP6 } = await import("@/services/dprService");
                      const resp = await pushEntryToP6(currentDraftEntry.id);
                      toast.success(resp.message || "Push successful");
                    } catch (error) {
                      toast.error("P6 Push failed");
                    } finally {
                      setIsSyncing(false);
                    }
                  }} 
                  disabled={isSyncing}
                >
                  <RefreshCw className={`w-3 h-3 mr-1 ${isSyncing ? 'animate-spin' : ''}`} />
                  Push P6
                </Button>
              )}

              <Button variant="outline" size="sm" className="h-8 text-[11px] font-medium" onClick={() => navigate("/projects")}>
                <FileSpreadsheet className="w-3 h-3 mr-1" />
                Change Project
              </Button>
            </div>

              <div className={`flex items-center gap-2 px-2 py-1 text-[12px] font-semibold rounded-md border capitalize ${
                currentProjectType === 'wind' ? 'bg-teal-100 text-teal-700 border-teal-200' :
                currentProjectType === 'pss' ? 'bg-purple-100 text-purple-700 border-purple-200' :
                'bg-orange-100 text-orange-700 border-orange-200'
              }`}>
                <span>{projectTypeConfig.label}</span>
                <span className="opacity-40">|</span>
                <span className="font-mono text-[11px]">ID: {currentProject?.P6Id || currentProjectId}</span>
              </div>
            </div>
          </div>
        </div>

          <Card className="border-0 shadow-sm p-4 flex-1 flex flex-col min-h-0">
            {/* Solar Specific Filters - Above Tabs */}
            {projectTypeConfig.label === 'Solar' && (
              <div className="flex justify-end items-center gap-6 mb-4">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-slate-600 uppercase tracking-tight">Activity Filter:</span>
                  <Select 
                    value={universalFilter || "ALL"} 
                    onValueChange={value => setUniversalFilter(value === "ALL" ? "" : value, currentProjectId)}
                  >
                    <SelectTrigger className="h-8 w-[140px] text-xs border-slate-200">
                      <SelectValue placeholder="All" />
                    </SelectTrigger>
                    <SelectContent>
                      {uniquePackages.map(pkg => (
                        <SelectItem key={pkg} value={pkg} className="text-xs">{pkg === "ALL" ? "All" : pkg}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-slate-600 uppercase tracking-tight">Block:</span>
                  <Select value={selectedBlock} onValueChange={setSelectedBlock}>
                    <SelectTrigger className="h-8 w-[120px] text-xs border-slate-200">
                      <SelectValue placeholder="All" />
                    </SelectTrigger>
                    <SelectContent>
                      {uniqueBlocks.map(block => (
                        <SelectItem key={block} value={block} className="text-xs">
                          {block === "ALL" ? "All" : block}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {/* Wind Specific Filters - Above Tabs */}
            {currentProjectType === 'wind' && (
              <div className="flex flex-wrap justify-end items-center gap-6 mb-4">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-slate-600 uppercase tracking-tight">Work Category:</span>
                  <Select value={selectedActivityGroup} onValueChange={setSelectedActivityGroup}>
                    <SelectTrigger className="h-8 w-[140px] text-xs border-slate-200">
                      <SelectValue placeholder="All" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableWindFilters.activityGroups.map(g => (
                        <SelectItem key={g} value={g} className="text-xs">{g === "ALL" ? "All" : g}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-slate-600 uppercase tracking-tight">PSS Location:</span>
                  <Select value={selectedSubstation} onValueChange={setSelectedSubstation}>
                    <SelectTrigger className="h-8 w-[140px] text-xs border-slate-200">
                      <SelectValue placeholder="All" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableWindFilters.substations.map(s => (
                        <SelectItem key={s} value={s} className="text-xs">{s === "ALL" ? "All" : s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-slate-600 uppercase tracking-tight">Location:</span>
                  <Select value={selectedLocation} onValueChange={setSelectedLocation}>
                    <SelectTrigger className="h-8 w-[140px] text-xs border-slate-200">
                      <SelectValue placeholder="All" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableWindFilters.locations.map(s => (
                        <SelectItem key={s} value={s} className="text-xs">{s === "ALL" ? "All" : s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full flex-1 flex flex-col min-h-0">

                <div className="overflow-x-auto pb-2 flex-shrink-0">
                  <TabsList className="inline-flex w-full min-w-max gap-1 p-1 rounded-lg bg-muted">
                    {projectTypeConfig.sheets.map(sheet => (
                      hasAccessToSheet(sheet.id) && (
                        <TabsTrigger
                          key={sheet.id}
                          value={sheet.id}
                          className="whitespace-nowrap px-3 py-2 text-xs sm:text-sm data-[state=active]:bg-background"
                        >
                          {sheet.label}
                        </TabsTrigger>
                      )
                    ))}
                    {!projectTypeConfig.sheets.some(s => s.id === 'issues') && (
                      <TabsTrigger value="issues" className="whitespace-nowrap px-3 py-2 text-xs sm:text-sm data-[state=active]:bg-background">Issues</TabsTrigger>
                    )}
                  </TabsList>
                </div>

              <div className="mt-0 border-0 p-0 pt-4 flex-1 min-h-0 flex-col w-full flex">
                <div className="flex-1 min-h-0 w-full flex flex-col relative">
                  {renderActiveDashboard()}
                </div>
              </div>
            </Tabs>
          </Card>
        </>
        )}
      </div>
    </DashboardLayout>
  );
};

export default SupervisorDashboard;