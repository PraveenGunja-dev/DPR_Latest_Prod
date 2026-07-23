import { useState, useEffect, useCallback, useMemo } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { useAuth } from "@/modules/auth/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { RefreshCw, FileSpreadsheet, AlertCircle, Filter, Layers, CheckCircle2 } from "lucide-react";
import { WorkflowStepper } from "@/components/WorkflowStepper";
import { Input } from "@/components/ui/input";
import { getAssignedProjects } from "@/services/projectService";
import { getDraftEntry, saveDraftEntry, getTodayAndYesterday, submitAllEntries } from "@/services/dprService";
import { getIssues, Issue as BackendIssue } from "@/services/issuesService";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useFilter } from "@/modules/auth/contexts/FilterContext";
import { DashboardLayout } from "@/components/shared/DashboardLayout";
import { IssueFormModal, IssuesTable, DroneVerificationModal } from "./components";
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
import { SyncProgressModal } from "@/components/shared/SyncProgressModal";

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
  attachmentName?: string | null;
  projectName?: string;
  location?: string;
  wbs?: string;
  activity?: string;
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
  const { activityDateFilter } = useFilter();

  const initialProjectId = useMemo(() => {
    const id = projectIdFromUrl || projectIdFromLocation;
    if (!id) return null;
    return /^\d+$/.test(String(id)) ? Number(id) : id;
  }, [projectIdFromUrl, projectIdFromLocation]);

  // Core States
  const [currentProjectId, setCurrentProjectId] = useState<number | null>(initialProjectId as any);
  const [activeTab, setActiveTab] = useState(initialActiveTab);

  // Listen for navigation state changes (e.g. from notifications)
  useEffect(() => {
    if (location.state?.activeTab && location.state.activeTab !== activeTab) {
      setActiveTab(location.state.activeTab);
    }
    if (location.state?.projectId && Number(location.state.projectId) !== currentProjectId) {
      setCurrentProjectId(Number(location.state.projectId));
    }
  }, [location.state?.activeTab, location.state?.projectId]);

  const [assignedProjects, setAssignedProjects] = useState<any[]>([]);
  const [currentDraftEntry, setCurrentDraftEntry] = useState<any>(null);
  const [isAddIssueModalOpen, setIsAddIssueModalOpen] = useState(false);
  const [editingIssue, setEditingIssue] = useState<Issue | null>(null);
  const [isDroneModalOpen, setIsDroneModalOpen] = useState(false);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [loading, setLoading] = useState(false);
  const [p6Activities, setP6Activities] = useState<any[]>([]);
  const [projectDataDate, setProjectDataDate] = useState<string | null>(null);
  const [selectedBlock, setSelectedBlock] = useState("ALL");
  const [selectedSubstation, setSelectedSubstation] = useState("ALL");
  const [selectedLocation, setSelectedLocation] = useState("ALL");
  const [showNotificationModal, setShowNotificationModal] = useState(false);
  const [fetchedProject, setFetchedProject] = useState<any | null>(null);
  const [selectedActivityGroup, setSelectedActivityGroup] = useState("ALL");
  const [selectedActivity, setSelectedActivity] = useState("ALL");
  const [availableWindFilters, setAvailableWindFilters] = useState<{
    locations: string[];
    substations: string[];
    activityGroups: string[];
    activities: string[];
  }>({ locations: ["ALL"], substations: ["ALL"], activityGroups: ["ALL"], activities: ["ALL"] });
  const [isSyncing, setIsSyncing] = useState<string | number | null>(null);
  const [syncingProjectName, setSyncingProjectName] = useState<string>("");
  const [availableRajasthanSheets, setAvailableRajasthanSheets] = useState({
    switchyard: false,
    transmission_line: false,
    infra_works: false
  });
  const [projectConfig, setProjectConfig] = useState<any>(null);

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
      const targetDateObj = new Date(targetDate);
      if (isNaN(targetDateObj.getTime())) return yesterday;
      targetDateObj.setDate(targetDateObj.getDate() - 1);
      return targetDateObj.toISOString().split("T")[0];
    } catch {
      return yesterday;
    }
  }, [targetDate, yesterday]);

  const handleGlobalSubmit = async () => {
    if (!currentProjectId || !targetDate) return;

    if (!window.confirm("Are you sure you want to submit all changed sheets for this date to the PM?")) {
      return;
    }

    setIsSyncing("global-submit");
    toast.info("Saving recent changes before submitting...");
    
    // Wait for the 2000ms auto-save debouncer to complete and save to backend
    await new Promise(resolve => setTimeout(resolve, 2500));

    try {
      const response = await submitAllEntries(currentProjectId, targetDate, "Global submit from Supervisor Dashboard");

      if (response && response.submittedCount > 0) {
        toast.success(`Successfully submitted ${response.submittedCount} sheet(s) to PM!`);
        // Refresh draft entry
        const updatedDraft = await getDraftEntry(currentProjectId, activeTab, targetDate);
        setCurrentDraftEntry(updatedDraft);
      } else {
        toast.info("No changed draft sheets found to submit for this date.");
      }
    } catch (err: any) {
      console.error("Global submit failed:", err);
      toast.error(err.message || "Failed to submit sheets.");
    } finally {
      setIsSyncing(null);
    }
  };

  useEffect(() => {
    // If we have a projectId but no project object, fetch it directly
    if (currentProjectId && !assignedProjects.find(p => String(p.ObjectId) === String(currentProjectId) || String(p.id) === String(currentProjectId)) && !projectDetails) {
      import("@/services/projectService").then(({ getProjectById }) => {
        // Need to pass string if it's string, else number
        getProjectById(currentProjectId as any).then(p => {
          if (p) {
            setFetchedProject(p);
          }
        }).catch(err => console.error("Failed to fetch project by ID:", err));
      });
    }
  }, [currentProjectId, assignedProjects, projectDetails]);

  // Derive current project object
  const currentProject = useMemo(() => {
    return assignedProjects.find(p =>
      String(p.ObjectId) === String(currentProjectId) ||
      String(p.id) === String(currentProjectId) ||
      String(p.P6Id) === String(currentProjectId)
    ) || projectDetails || fetchedProject;
  }, [assignedProjects, currentProjectId, projectDetails, fetchedProject]);

  // Fetch dynamic project config
  useEffect(() => {
    const p6Id = currentProject?.P6Id || currentProject?.p6Id || currentProject?.id || "";
    if (p6Id) {
      import("@/services/configService").then(({ getProjectConfig, fetchAllMasterLists }) => {
        getProjectConfig(p6Id).then(config => setProjectConfig(config));
        
        // Also fetch and inject the dynamic activity ordering
        fetchAllMasterLists().then(lists => {
            import("@/services/p6ActivityService").then(({ setDynamicMasterLists }) => {
                setDynamicMasterLists(lists);
            });
        });
      });
    }
  }, [currentProject]);

  const effectiveProjectName = useMemo(() =>
    currentProject?.name || currentProject?.Name || projectName,
    [currentProject, projectName]
  );

  // Final project type detection
  const currentProjectType = useMemo(() =>
    detectProjectType(currentProject, effectiveProjectName),
    [currentProject, effectiveProjectName]
  );

  const isDroneEligible = useMemo(() => {
    if (projectConfig && projectConfig.enable_drone_integration !== undefined) {
      return projectConfig.enable_drone_integration;
    }
    const name = (effectiveProjectName || "").toLowerCase();
    const p6Id = (currentProject?.P6Id || currentProject?.p6Id || "").toUpperCase();
    const droneIds = ["FY25-P10", "FY25-P11", "FY25-P12", "FY25-P13"];
    return name.includes("khavda") || name.includes("baiya") || droneIds.includes(p6Id);
  }, [effectiveProjectName, currentProject, projectConfig]);

  const projectTypeConfig = useMemo(() => getProjectTypeConfig(currentProjectType, currentProject, effectiveProjectName, projectConfig), [currentProjectType, currentProject, effectiveProjectName, projectConfig]);

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

  // Fetch issues from global issue_logs table when Issues tab is active
  useEffect(() => {
    const fetchIssues = async () => {
      if (activeTab === 'issues' && currentProjectId) {
        try {
          const result = await getIssues({ project_id: currentProjectId });
          const apiIssues = (result.issues || []).map((issue: any) => {
            // Parse the description JSON if it's a stringified object
            let parsed: any = {};
            try {
              parsed = typeof issue.description === 'string' ? JSON.parse(issue.description) : (issue.description || {});
            } catch {
              parsed = { description: issue.description || '' };
            }
            return {
              id: String(issue.id),
              description: parsed.description || issue.title || '',
              activity: parsed.activity || '',
              startDate: parsed.startDate || issue.created_at || '',
              finishedDate: parsed.finishedDate || null,
              delayedDays: parsed.delayedDays || 0,
              status: (parsed.status || issue.status || 'Open').replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()),
              priority: (issue.priority || parsed.priority || 'Medium').replace(/\b\w/g, (c: string) => c.toUpperCase()),
              actionRequired: parsed.actionRequired || '',
              remarks: parsed.remarks || issue.resolution_notes || '',
              attachment: parsed.attachmentUrl || null,
              attachmentName: parsed.attachmentName || null,
              projectName: issue.project_name || '',
              location: parsed.location || '',
              wbs: parsed.wbs || '',
            };
          });

          // Also merge any draft-only issues that haven't been synced to the global table
          const draftIssues = currentDraftEntry?.data_json?.issues || [];
          const mergedIds = new Set(apiIssues.map((i: any) => i.id));
          const draftOnlyIssues = draftIssues.filter((di: any) => !mergedIds.has(String(di.id)));

          setIssues([...apiIssues, ...draftOnlyIssues]);
        } catch (error) {
          console.error("Error fetching issues from API:", error);
          // Fallback to draft issues
          if (currentDraftEntry?.data_json?.issues) {
            setIssues(currentDraftEntry.data_json.issues);
          } else {
            setIssues([]);
          }
        }
      }
    };
    fetchIssues();
  }, [currentProjectId, activeTab, currentDraftEntry]);

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
          setProjectDataDate(response.dataDate || null);
        } catch (error) {
          console.error("Error fetching wind activities for filter:", error);
        }
      }
    };
    fetchActivities();
  }, [currentProjectId, currentProjectType, targetDate]);

  const handleSyncP6 = async () => {
    if (!currentProjectId) return;
    setIsSyncing(currentProjectId);
    setSyncingProjectName(effectiveProjectName);
    try {
      await syncP6Data(currentProjectId);
    } catch (error: any) {
      console.error("Failed to trigger P6 sync", error);
      toast.error(error?.response?.data?.detail || error?.message || "Failed to trigger sync");
      setIsSyncing(null);
    }
  };

  const handleSyncComplete = async () => {
    if (!currentProjectId) return;
    try {
      const acts = currentProjectType === 'solar'
        ? await getP6ActivitiesForProject(currentProjectId)
        : (await getWindProgressActivities(currentProjectId, targetDate)).data;
      setP6Activities(Array.isArray(acts) ? acts : []);
    } catch (error) {
      console.error("Failed to refresh activities after sync", error);
    }
  };

  const handleWindFiltersLoaded = useCallback((filters: any) => {
    setAvailableWindFilters(prev => {
      if (JSON.stringify(prev) === JSON.stringify(filters)) return prev;
      return filters;
    });
  }, []);

  // Derived filter options for Solar
  const uniqueBlocks = useMemo(() => {
    const blocks = new Set<string>();
    
    if (Array.isArray(p6Activities) && currentProjectType === 'solar') {
      p6Activities.forEach(a => {
        const b = (a.block || a.newBlockNom || a.plot || extractBlockName(a.name || "") || "").toUpperCase();
        if (b) blocks.add(b);
      });
    }

    const blockArray = Array.from(blocks);
    const shortNames = blockArray.filter(b => /^(BLOCK|PLOT)[\s\-_]?\d+$/i.test(b));
    
    const normalizeBlock = (str: string) => {
      let s = str.replace(/[\s\-_]+/g, '');
      s = s.replace(/^(BLOCK|PLOT)0+/i, '$1');
      return s.toUpperCase();
    };

    shortNames.forEach(shortName => {
      const normalizedShort = normalizeBlock(shortName);
      const hasLonger = blockArray.some(b => {
        if (b === shortName) return false;
        const normalizedB = normalizeBlock(b);
        if (normalizedB.startsWith(normalizedShort)) {
          const nextChar = normalizedB.charAt(normalizedShort.length);
          return nextChar && !/^\d$/.test(nextChar);
        }
        return false;
      });
      if (hasLonger) blocks.delete(shortName);
    });

    blocks.add("ALL");
    return Array.from(blocks).sort((a, b) => {
      if (a === "ALL") return -1;
      if (b === "ALL") return 1;
      return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
    });
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
    return Array.from(packages).sort((a, b) => {
      if (a === "ALL") return -1;
      if (b === "ALL") return 1;
      return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
    });
  }, [p6Activities, currentProjectType]);

  const filteredP6Activities = useMemo(() => {
    if (!activityDateFilter) return p6Activities;
    const now = new Date();
    const days = activityDateFilter === "Last 7 days" ? 7 : activityDateFilter === "Last 30 days" ? 30 : 0;

    if (days === 0 && activityDateFilter !== "Delayed Activities") {
      // "All Time" acts as a reset, showing everything
      return p6Activities;
    }

    if (activityDateFilter === "Delayed Activities") {
      return p6Activities.filter((row: any) => {
        if (row.status === "Completed") return false;

        const planDateStr = row.plannedFinish || row.basePlanFinish || row.baselineFinish || row.plannedFinishDate || row.baselineFinishDate || row.forecastFinish;
        if (!planDateStr || planDateStr === "-") return false;

        const planFinish = parseDateRobustly(planDateStr);
        if (!planFinish) return false;

        const referenceDate = projectDataDate ? parseDateRobustly(projectDataDate) : new Date();
        if (!referenceDate) return false;

        return planFinish < referenceDate;
      });
    }

    const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    return p6Activities.filter((row: any) => {
      if (row.status === 'Not Started') return false;
      if (row.actualStart && row.actualStart !== "-") {
        const start = parseDateRobustly(row.actualStart);
        return start !== null && start >= cutoff && start <= now;
      }
      return false;
    });
  }, [p6Activities, activityDateFilter]);

  // Derived filter options for Wind
  const uniqueWindLocations = useMemo(() => {
    const locs = new Set<string>();
    
    if (Array.isArray(filteredP6Activities) && currentProjectType === 'wind') {
      filteredP6Activities.forEach(a => {
        if (a.locations) {
          locs.add(a.locations.toUpperCase().trim());
        }
        
        // Also extract from description just in case, to catch WTGs that don't have locations set yet
        const match = a.description?.match(/(WTG[\s\-_.]*\d+[a-zA-Z]?)/i);
        if (match) {
          locs.add(match[1].toUpperCase().trim());
        }
      });
    }

    // Clean up duplicates where a short name (e.g., WTG 1 or WTG 1A) exists alongside a long name
    const locArray = Array.from(locs);
    const shortNames = locArray.filter(l => /^WTG[\s\-_.]*\d+[a-zA-Z]?$/i.test(l));
    
    const extractWtg = (str: string) => {
      const match = str.match(/WTG[\s\-_.]*0*(\d+[a-zA-Z]?)/i);
      return match ? match[1].toUpperCase() : null;
    };

    shortNames.forEach(shortName => {
      const shortNum = extractWtg(shortName);
      
      const hasLonger = locArray.some(l => {
        if (l === shortName) return false;
        const lNum = extractWtg(l);
        return shortNum !== null && shortNum === lNum;
      });
      
      if (hasLonger) {
        locs.delete(shortName);
      }
    });

    locs.add("ALL");
    
    return Array.from(locs).sort((a, b) => {
      if (a === "ALL") return -1;
      if (b === "ALL") return 1;
      return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
    });
  }, [filteredP6Activities, currentProjectType]);

  const uniqueSubstations = useMemo(() => {
    const subs = new Set<string>();
    subs.add("ALL");
    if (Array.isArray(filteredP6Activities) && currentProjectType === 'wind') {
      filteredP6Activities.forEach(a => {
        const match = (a.description + " " + a.activityId + " " + (a.wbsName || "")).match(/(PSS-?\d+)/i);
        if (match) subs.add(match[1].toUpperCase());
        if (a.substation) subs.add(a.substation.toUpperCase());
      });
    }
    return Array.from(subs).sort((a, b) => {
      if (a === "ALL") return -1;
      if (b === "ALL") return 1;
      return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
    });
  }, [filteredP6Activities, currentProjectType]);

  const uniqueActivityGroups = useMemo(() => {
    const grps = new Set<string>();
    grps.add("ALL");
    if (Array.isArray(filteredP6Activities) && currentProjectType === 'wind') {
      filteredP6Activities.forEach(a => {
        if (a.activityGroup) grps.add(a.activityGroup.toUpperCase());
      });
    }
    return Array.from(grps).sort((a, b) => {
      if (a === "ALL") return -1;
      if (b === "ALL") return 1;
      return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
    });
  }, [filteredP6Activities, currentProjectType]);

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
    // Relaxed per user request to allow multiple submissions/edits even after approval
    const isLocked = false;

    if (!isAuthorizedRole) return true;
    if (isLocked) return true;

    // In all other cases (draft, submitted, rejected, approved), it's editable
    return false;
  }, [currentDraftEntry, user]);

  const renderActiveDashboard = () => {
    // If it's the issues tab, we handle it here as it's common
    if (activeTab === 'issues') {
      return (
        <>
          <DroneVerificationModal
            isOpen={isDroneModalOpen}
            onClose={() => setIsDroneModalOpen(false)}
            projectId={currentProjectId!}
            reportDate={targetDate}
          />
          <IssueFormModal
            open={isAddIssueModalOpen}
            onOpenChange={(open) => {
              setIsAddIssueModalOpen(open);
              if (!open) setEditingIssue(null);
            }}
            onSubmit={async (data: any) => {
              const isEdit = !!data.id;
              let newIssue = { ...data };

              if (!isEdit) {
                newIssue.id = Date.now().toString();
              }

              // Save to global issue_logs table so it appears in IssuesViewModal
              try {
                const issueDetailsPayload = JSON.stringify({
                  description: data.description || "",
                  activity: data.activity || "",
                  startDate: data.startDate || "",
                  finishedDate: data.finishedDate || "",
                  delayedDays: data.delayedDays || 0,
                  status: data.status || "Open",
                  actionRequired: data.actionRequired || "",
                  remarks: data.remarks || "",
                  attachmentName: data.attachmentName || (data.attachment instanceof File ? data.attachment.name : null),
                  attachmentUrl: typeof data.attachment === 'string' ? data.attachment : null,
                  location: data.location || "",
                  wbs: data.wbs || ""
                });

                if (!isEdit && currentProjectId) {
                  const apiRes = await import('@/services/issuesService').then(m => m.createIssue({
                    project_id: currentProjectId,
                    title: data.description?.substring(0, 50) || "New Issue",
                    description: issueDetailsPayload,
                    priority: data.priority?.toLowerCase() || "medium",
                  }));
                  // If API returns an ID, use it so draft and API don't duplicate
                  if (apiRes && apiRes.id) {
                     newIssue.id = String(apiRes.id);
                  }
                } else if (isEdit && currentProjectId && data.id && !data.id.toString().match(/^\d{13}$/)) {
                   await import('@/services/issuesService').then(m => m.updateIssue(Number(data.id), {
                     title: data.description?.substring(0, 50) || "New Issue",
                     description: issueDetailsPayload,
                     priority: data.priority?.toLowerCase() || "medium",
                     status: data.status || "Open"
                   }));
                }
              } catch (error) {
                console.error("Failed to sync issue with global issue_logs table:", error);
              }

              let updatedIssues;
              if (isEdit) {
                updatedIssues = issues.map(issue => issue.id === data.id ? data : issue);
              } else {
                updatedIssues = [...issues, newIssue];
              }

              setIssues(updatedIssues);

              if (currentDraftEntry?.id) {
                try {
                  await saveDraftEntry(currentDraftEntry.id, { issues: updatedIssues });
                  setCurrentDraftEntry({
                    ...currentDraftEntry,
                    data_json: { ...(currentDraftEntry.data_json || {}), issues: updatedIssues }
                  });
                } catch (error) {
                  console.error("Failed to save issues to draft:", error);
                  toast.error("Failed to save issue. Please try again.");
                }
              } else {
                toast.error("Could not find draft to save issues.");
              }

              if (isEdit) {
                toast.success("Issue updated successfully!");
              } else {
                toast.success("Issue added successfully!");
              }

              setIsAddIssueModalOpen(false);
              setEditingIssue(null);
            }}
            initialData={editingIssue || {}}
            activities={p6Activities}
            projectType={currentProjectType}
          />
          <IssuesTable
            issues={issues}
            isReadOnly={isEntryReadOnly}
            projectName={effectiveProjectName}
            onAddIssue={() => { setEditingIssue(null); setIsAddIssueModalOpen(true); }}
            onEditIssue={(issue) => { setEditingIssue(issue); setIsAddIssueModalOpen(true); }}
            onDeleteIssue={async (id) => {
              if (window.confirm("Are you sure you want to delete this issue log?")) {
                const updatedIssues = issues.filter(issue => issue.id !== id);
                setIssues(updatedIssues);

                // Attempt to delete from global issue_logs table if it's an API issue
                try {
                  if (id && !id.toString().match(/^\d{13}$/)) {
                    await import('@/services/issuesService').then(m => m.deleteIssue(Number(id)));
                  }
                } catch (error) {
                  console.error("Failed to delete issue from backend issue_logs:", error);
                }

                if (currentDraftEntry?.id) {
                  try {
                    await saveDraftEntry(currentDraftEntry.id, { issues: updatedIssues });
                    setCurrentDraftEntry({
                      ...currentDraftEntry,
                      data_json: { ...(currentDraftEntry.data_json || {}), issues: updatedIssues }
                    });
                  } catch (error) {
                    console.error("Failed to save issues to draft after delete:", error);
                    toast.error("Failed to save changes. Please try again.");
                  }
                }

                toast.success("Issue log deleted successfully!");
              }
            }}
          />
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
            isDroneModalOpen={isDroneModalOpen}
            onCloseDroneModal={() => setIsDroneModalOpen(false)}
            projectDetails={currentProject}
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
            selectedActivity={selectedActivity}
            onFiltersLoaded={handleWindFiltersLoaded}
            onDateChange={(date) => setTargetDate(date)}
            projectDetails={currentProject}
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
                    <Button variant="outline" size="sm" className="h-8 text-[11px] font-medium" onClick={handleSyncP6} disabled={isSyncing !== null}>
                      <RefreshCw className={`w-3 h-3 mr-1 ${isSyncing !== null ? 'animate-spin' : ''}`} />
                      Sync Project
                    </Button>

                    <Button
                      variant="default"
                      size="sm"
                      className="h-8 text-[11px] font-bold bg-primary text-primary-foreground hover:bg-primary/90"
                      onClick={handleGlobalSubmit}
                      disabled={isSyncing !== null || !currentProjectId}
                    >
                      <CheckCircle2 className="w-3 h-3 mr-1" />
                      Global Submit
                    </Button>

                    {isDroneEligible && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 text-[11px] font-bold border-primary bg-primary/5 text-primary hover:bg-primary hover:text-white shadow-sm transition-colors"
                        onClick={() => setIsDroneModalOpen(true)}
                      >
                        Compare with Drone
                      </Button>
                    )}

                    <Button variant="outline" size="sm" className="h-8 text-[11px] font-medium" onClick={() => navigate("/projects")}>
                      <FileSpreadsheet className="w-3 h-3 mr-1" />
                      Change Project
                    </Button>
                  </div>

                  <div className={`flex items-center gap-2 px-2 py-1 text-[12px] font-semibold rounded-md border capitalize ${currentProjectType === 'wind' ? 'bg-teal-100 text-teal-700 border-teal-200' :
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
                <div className="flex items-center w-full mb-4">
                  {/* Left Spacer */}
                  <div className="flex-1" />

                  {/* Workflow Progress Stepper - Centered */}
                  <div className="flex-1 flex justify-center">
                    <WorkflowStepper status={currentDraftEntry?.status || 'draft'} />
                  </div>

                  {/* Filters - Right Aligned */}
                  <div className="flex-1 flex items-center justify-end gap-6">
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

                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-slate-600 uppercase tracking-tight">Activity:</span>
                    <Select value={selectedActivity} onValueChange={setSelectedActivity}>
                      <SelectTrigger className="h-8 w-[160px] text-xs border-slate-200">
                        <SelectValue placeholder="All" />
                      </SelectTrigger>
                      <SelectContent>
                        {availableWindFilters.activities.map(a => (
                          <SelectItem key={a} value={a} className="text-xs">{a === "ALL" ? "All" : a}</SelectItem>
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

      <SyncProgressModal
        isOpen={isSyncing !== null}
        projectId={isSyncing}
        projectName={syncingProjectName}
        onClose={() => setIsSyncing(null)}
        onSyncComplete={handleSyncComplete}
      />
    </DashboardLayout>
  );
};

export default SupervisorDashboard;