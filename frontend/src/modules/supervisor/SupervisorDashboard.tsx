import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useInView } from "react-intersection-observer";
import { useLocation, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useAuth } from "@/modules/auth/contexts/AuthContext";
import { useNotification } from "@/modules/auth/contexts/NotificationContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AlertCircle, FileSpreadsheet, Package, User, Save, Send, Plus, Grid3X3, Building, Wrench, RefreshCw, CheckCircle2 } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { getAssignedProjects, getUserProjects } from "@/services/projectService";
import { getDraftEntry, saveDraftEntry, submitEntry, getTodayAndYesterday } from "@/services/dprService";
import {
  getP6ActivitiesForProject,
  getP6ActivitiesPaginated,
  mapActivitiesToDPQty,
  aggregateDPQtyByActivityName,
  mapActivitiesToDPBlock,
  mapActivitiesToDPVendorBlock,
  getManpowerDetailsData,
  aggregateManpowerByActivityName,
  mapActivitiesToDPVendorIdt,
  aggregateVendorIdtByActivityName,
  aggregateVendorBlockByActivityName,
  mapActivitiesToTestingComm,
  mapResourcesToTable,
  P6Activity,
  P6Resource,
  getResources,
  PaginationInfo,
  syncP6Data,
  syncGlobalResources,
  getYesterdayValues,
  extractActivityName
} from "@/services/p6ActivityService";
import { createIssue, getIssues, Issue as BackendIssue } from "@/services/issuesService";
import { toast } from "sonner";
import { Navbar } from "@/components/Navbar";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DPQtyTable,
  DPVendorBlockTable,
  ManpowerDetailsTable,
  DPBlockTable,
  DPVendorIdtTable,
  TestingCommTable,
  IssueFormModal,
  IssuesTable,
  DPRSummarySection,
  // Wind components
  WindSummaryTable,
  WindProgressTable,
  WindManpowerTable,
  // PSS components
  PSSSummaryTable,
  PSSProgressTable,
  PSSManpowerTable,
} from "./components";
import { getProjectTypeConfig } from "@/config/sheetConfig";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { useFilter } from "@/modules/auth/contexts/FilterContext";
import { ResourceTable } from "./components/ResourceTable";
import { DashboardLayout } from "@/components/shared/DashboardLayout";

// Define the Issue interface
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
  const { user, token } = useAuth();

  // Extract project data from location state
  const locationState = location.state || {};
  const projectName = locationState.projectName || "Project";
  // Note: We use currentProjectId state instead of this static value
  const projectIdFromLocation = locationState.projectId || null;
  const projectDetails = locationState.projectDetails || null;
  const openAddIssueModal = locationState.openAddIssueModal || false;
  const initialActiveTab = locationState.activeTab || "summary";

  const [activeTab, setActiveTab] = useState(initialActiveTab);
  const [assignedProjects, setAssignedProjects] = useState<any[]>([]);
  const [currentDraftEntry, setCurrentDraftEntry] = useState<any>(null);
  const [isAddIssueModalOpen, setIsAddIssueModalOpen] = useState(false);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [loadingIssues, setLoadingIssues] = useState(false);
  const { today: todayString, yesterday: yesterdayString } = useMemo(() => getTodayAndYesterday(), []);
  const today = todayString;
  const yesterday = yesterdayString;

  // State for reactive project ID
  const [currentProjectId, setCurrentProjectId] = useState(projectIdFromLocation);

  // Sync with location state if user navigates via Navbar dropdown
  useEffect(() => {
    if (projectIdFromLocation && projectIdFromLocation !== currentProjectId) {
      setCurrentProjectId(projectIdFromLocation);
    }
  }, [projectIdFromLocation, currentProjectId]);

  // State for target date (last 7 days view)
  const [targetDate, setTargetDate] = useState<string>(today);

  // Calculate target yesterday based on the selected targetDate
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

  const [showEditReasonModal, setShowEditReasonModal] = useState(false);
  const [editReason, setEditReason] = useState("");
  const { universalFilter, setUniversalFilter, loadProjectFilter } = useFilter();
  const [pendingSubmitAction, setPendingSubmitAction] = useState<(() => void) | null>(null);
  
  // Raw data states for reactive filtering
  const [rawQtyData, setRawQtyData] = useState<any[]>([]);
  const [rawBlockData, setRawBlockData] = useState<any[]>([]);
  const [rawVendorBlockData, setRawVendorBlockData] = useState<any[]>([]);
  const [rawVendorIdtData, setRawVendorIdtData] = useState<any[]>([]);
  const [rawManpowerData, setRawManpowerData] = useState<any[]>([]);
  const [rawTestingCommData, setRawTestingCommData] = useState<any[]>([]);
  const [yesterdayMapState, setYesterdayMapState] = useState<Map<string, any>>(new Map());

  const currentProject = assignedProjects.find(p =>
    String(p.ObjectId) === String(currentProjectId) ||
    String(p.id) === String(currentProjectId)
  ) || projectDetails;

  const hasAccessToSheet = (sheetType: string) => {
    if (user?.Role !== 'supervisor') return true;

    // Get the project type from the current project
    const pt = (currentProject?.projectType || currentProject?.ProjectType || currentProject?.project_type || 'solar').toString().toLowerCase();

    // For non-solar projects (wind/pss), check if the sheet belongs to that project type's config
    // If it does, allow access (all sheets for the project type are accessible by default)
    if (pt !== 'solar') {
      const typeConfig = getProjectTypeConfig(pt);
      return typeConfig.sheets.some(s => s.id === sheetType);
    }

    // Solar: use the existing per-supervisor sheet permissions
    let permittedSheets = currentProject?.sheetTypes || currentProject?.SheetTypes || currentProject?.sheet_types || [];

    // Ensure it's an array (in case it comes through stringified somehow)
    if (typeof permittedSheets === 'string') {
      try { permittedSheets = JSON.parse(permittedSheets) } catch (e) { permittedSheets = [] }
    }

    // Support legacy empty array as full access OR strictly enforce sheet array
    if (!permittedSheets || permittedSheets.length === 0) return true;

    return permittedSheets.includes(sheetType);
  };

  // Derive project type from current project
  const currentProjectType = useMemo(() => {
    const pt = currentProject?.projectType || currentProject?.ProjectType || currentProject?.project_type || 'solar';
    return (pt as string).toLowerCase();
  }, [currentProject]);

  // Get config for current project type
  const projectTypeConfig = useMemo(() => getProjectTypeConfig(currentProjectType), [currentProjectType]);

  const formatSheetType = (sheetId: string) => {
    const sheetMap: Record<string, string> = {
      'dp_qty': 'DP Qty',
      'manpower_details': 'Manpower',
      'dp_vendor_block': 'AC Side',
      'dp_block': 'DP Block',
      'dp_vendor_idt': 'DC Side',
      'testing_commissioning': 'Testing & Commissioning',
      'wind_summary': 'Summary',
      'wind_progress': 'Progress',
      'wind_manpower': 'Manpower',
      'pss_summary': 'Summary',
      'pss_progress': 'Progress',
      'pss_manpower': 'Manpower',
    };
    return sheetMap[sheetId] || sheetId;
  };


  // P6 Activities state
  const [p6Activities, setP6Activities] = useState<P6Activity[]>([]);
  const [loadingActivities, setLoadingActivities] = useState(false);
  const [isP6DataFetched, setIsP6DataFetched] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  // Pagination state for infinite scroll
  const [currentPage, setCurrentPage] = useState(1);
  const [paginationInfo, setPaginationInfo] = useState<PaginationInfo | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const [selectedBlock, setSelectedBlock] = useState<string>("ALL");

  // Get unique blocks for filtering (from raw P6 data)
  const uniqueBlocks = useMemo(() => {
    const blocks = new Set<string>();
    if (Array.isArray(p6Activities)) {
      p6Activities.forEach(a => {
        // Broaden search to include block, newBlockNom, and plot
        const b = a.block || a.newBlockNom || a.plot;
        if (b && typeof b === 'string') {
          const normalized = b.trim().toUpperCase();
          if (normalized) blocks.add(normalized);
        }
      });
    }
    const result = ["ALL", ...Array.from(blocks).sort()];
    return result;
  }, [p6Activities]);

  // Derived unique activity filter options (Packages) from Activity ID prefixes
  // e.g. "PPRO-CC-001" -> "CC"
  const uniquePackages = useMemo(() => {
    const packages = new Set<string>();
    if (Array.isArray(p6Activities)) {
      p6Activities.forEach(a => {
        if (a.activityId && typeof a.activityId === 'string') {
          const parts = a.activityId.split('-');
          // Heuristic for package identification: PROJECT-PACKAGE-ID or PACKAGE-ID
          let pkg = "";
          if (parts.length >= 3) {
            pkg = parts[1].trim().toUpperCase();
          } else if (parts.length === 2 && !/^\d+$/.test(parts[0])) {
            pkg = parts[0].trim().toUpperCase();
          }

          if (pkg && pkg.length >= 2 && pkg.length <= 8) {
            packages.add(pkg);
          }
        }
      });
    }
    return ["ALL", ...Array.from(packages).sort()];
  }, [p6Activities]);

  // Reset filter and active tab when project changes
  useEffect(() => {
    setSelectedBlock("ALL");
    setSelectedSubstation("ALL");
    setSelectedSPV("ALL");
    setSelectedLocation("ALL");
    if (currentProjectId) {
      loadProjectFilter(currentProjectId);
    }
    // Reset active tab to first sheet of the new project type config
    // Only reset if the current activeTab is NOT valid for the new project type
    if (projectTypeConfig?.sheets?.length > 0) {
      const validTabIds = projectTypeConfig.sheets.map(s => s.id);
      if (!validTabIds.includes(activeTab)) {
        setActiveTab(projectTypeConfig.sheets[0].id);
      }
    }
  }, [currentProjectId, projectTypeConfig]);



  // Effect to update state when location changes
  useEffect(() => {
    const locationState = location.state || {};
    const newActiveTab = locationState.activeTab || null; // Don't fallback to 'summary' — let project type config decide
    const newProjectId = locationState.projectId || null;

    // Only set activeTab from location state if one was explicitly provided
    if (newActiveTab) {
      setActiveTab(newActiveTab);
    }
    setCurrentProjectId(newProjectId);
  }, [location]);

  // DP Qty state
  const [dpQtyData, setDpQtyData] = useState<any[]>([
    {
      yesterdayIsApproved: true,
      slNo: '',
      description: '',
      totalQuantity: '',
      uom: '',
      basePlanStart: '',
      basePlanFinish: '',
      forecastStart: '',
      forecastFinish: '',
      actualStart: '',
      actualFinish: '',
      remarks: '',
      balance: '',
      cumulative: '',
      yesterday: '', // Number value, not editable
      today: '' // Number value, editable
    }
  ]);

  // DP Vendor Block state
  interface DPVendorBlockData {
    activityId: string;
    activities: string;
    plot: string;
    block?: string;
    newBlockNom: string;
    priority: string;
    baselinePriority: string;
    contractorName: string;
    uom?: string;
    scope: string;
    holdDueToWtg: string;
    front: string;
    actual: string;
    balance?: string;
    completionPercentage: string;
    remarks: string;
    basePlanStart?: string;
    basePlanFinish?: string;
    forecastStart?: string;
    forecastFinish?: string;
    actualStart?: string;
    actualFinish?: string;
    yesterdayValue: string;
    todayValue: string;
    category?: string;
    isCategoryRow?: boolean;
    _cellStatuses?: Record<string, any>;
  }

  const [dpVendorBlockData, setDpVendorBlockData] = useState<DPVendorBlockData[]>([
    { activityId: '', activities: '', plot: '', newBlockNom: '', priority: '', baselinePriority: '', contractorName: '', scope: '', holdDueToWtg: '', front: '', actual: '', completionPercentage: '', remarks: '', yesterdayValue: '', todayValue: '' }
  ]);

  // Manpower Details state
  const [manpowerDetailsData, setManpowerDetailsData] = useState<any[]>([
    { activityId: '', description: '', block: '', budgetedUnits: '', actualUnits: '', remainingUnits: '', percentComplete: '', yesterdayValue: '', todayValue: '' }
  ]);
  const [totalManpower, setTotalManpower] = useState(0);

  // DP Block state - matches new 18-column schema
  interface DPBlockData {
    activityId: string;
    activities: string;
    block: string;
    blockCapacity: string;
    phase: string;
    spvNumber: string;
    priority: string;
    scope: string;
    hold: string;
    front: string;
    completed: string;
    balance: string;
    baselineStartDate: string;
    baselineEndDate: string;
    actualStartDate: string;
    actualFinishDate: string;
    forecastStartDate: string;
    forecastFinishDate: string;
    remarks?: string;
    yesterdayIsApproved?: boolean;
    _cellStatuses?: Record<string, any>;
  }

  const [dpBlockData, setDpBlockData] = useState<DPBlockData[]>([
    {
      activityId: '',
      activities: '',
      blockCapacity: '',
      phase: '',
      block: '',
      spvNumber: '',
      priority: '',
      scope: '',
      hold: '',
      front: '',
      completed: '',
      balance: '',
      baselineStartDate: '',
      baselineEndDate: '',
      actualStartDate: '',
      actualFinishDate: '',
      forecastStartDate: '',
      forecastFinishDate: '',
      remarks: '',
      yesterdayIsApproved: true
    }
  ]);

  const [dpVendorIdtData, setDpVendorIdtData] = useState<any[]>([]);
  // Testing & Commissioning state
  const [testingCommData, setTestingCommData] = useState<any[]>([]);

  // Resource Table state
  const [resourceData, setResourceData] = useState<any[]>([]);
  const [isResourcesFetched, setIsResourcesFetched] = useState(false);

  // ============================================================================
  // WIND DATA STATES
  // ============================================================================
  const [windSummaryData, setWindSummaryData] = useState<any[]>([]);
  const [windProgressData, setWindProgressData] = useState<any[]>([]);
  const [windManpowerData, setWindManpowerData] = useState<any[]>([]);

  // Wind-specific filter states
  const [selectedSubstation, setSelectedSubstation] = useState<string>('ALL');
  const [selectedSPV, setSelectedSPV] = useState<string>('ALL');
  const [selectedLocation, setSelectedLocation] = useState<string>('ALL');

  // Unique substations/SPVs/locations for wind filters
  const uniqueSubstations = useMemo(() => {
    if (currentProjectType !== 'wind') return ['ALL'];
    const set = new Set<string>();
    windProgressData.forEach(r => { if (r.substation) set.add(r.substation); });
    return ['ALL', ...Array.from(set).sort()];
  }, [currentProjectType, windProgressData]);

  const uniqueSPVs = useMemo(() => {
    if (currentProjectType !== 'wind') return ['ALL'];
    const set = new Set<string>();
    windProgressData.forEach(r => { if (r.spv) set.add(r.spv); });
    return ['ALL', ...Array.from(set).sort()];
  }, [currentProjectType, windProgressData]);

  const uniqueLocations = useMemo(() => {
    if (currentProjectType !== 'wind') return ['ALL'];
    const set = new Set<string>();
    windProgressData.forEach(r => { if (r.locations) set.add(r.locations); });
    return ['ALL', ...Array.from(set).sort()];
  }, [currentProjectType, windProgressData]);

  // ============================================================================
  // PSS DATA STATES
  // ============================================================================
  const [pssSummaryData, setPssSummaryData] = useState<any[]>([]);
  const [pssProgressData, setPssProgressData] = useState<any[]>([]);
  const [pssManpowerData, setPssManpowerData] = useState<any[]>([]);

  // Fetch P6 Resources
  const fetchP6Resources = useCallback(async () => {
    if (!currentProjectId) return;

    try {
      console.log(`SupervisorDashboard: Fetching P6 resources for project ${currentProjectId}`);
      const resources = await getResources(currentProjectId);
      const mappedResources = mapResourcesToTable(resources);
      setResourceData(mappedResources);
      setIsResourcesFetched(true);
    } catch (error) {
      console.error("Error fetching P6 resources:", error);
      toast.error("Failed to load P6 resources");
    }
  }, [currentProjectId]);

  // Track if entry is read-only (submitted)
  const [isEntryReadOnly, setIsEntryReadOnly] = useState(false);

  // ============================================================================
  // MERGE UTILITIES: Combine P6 base data with saved user edits
  // ============================================================================

  /**
   * Recalculate category row totals after draft merge.
   * Category rows (isCategoryRow=true) aggregate todayValue/yesterdayValue/actual
   * from their child rows (the rows between this category and the next).
   */
  const recalcCategoryTotals = <T extends Record<string, any>>(rows: T[]): T[] => {
    if (!rows || rows.length === 0) return rows;
    
    const result = [...rows];
    let categoryIdx = -1;
    
    for (let i = 0; i < result.length; i++) {
      if (result[i].isCategoryRow) {
        // If there was a previous category, recalculate its totals now
        if (categoryIdx >= 0) {
          recalcCategory(result, categoryIdx, i);
        }
        categoryIdx = i;
      }
    }
    // Recalculate the last category group
    if (categoryIdx >= 0) {
      recalcCategory(result, categoryIdx, result.length);
    }
    
    return result;
  };
  
  const recalcCategory = (rows: any[], catIdx: number, endIdx: number) => {
    const children = rows.slice(catIdx + 1, endIdx);
    if (children.length === 0) return;
    
    const sumField = (field: string) => children.reduce((s, r) => s + (Number(r[field]) || 0), 0);
    rows[catIdx] = {
      ...rows[catIdx],
      todayValue: String(sumField('todayValue') || ''),
      yesterdayValue: String(sumField('yesterdayValue') || ''),
      actual: String(sumField('actual') || ''),
      scope: String(sumField('scope') || ''),
      balance: String((sumField('scope') || 0) - (sumField('actual') || 0) || ''),
    };
  };

  /**
   * Merges saved draft rows with P6-mapped rows
   * - P6 data provides base structure (activity info, non-editable fields)
   * - Draft data provides user edits (today, yesterday, remarks, etc.)
   * - Matches by activityId and overlays editable fields
   */
  const mergeDraftWithP6Data = <T extends { activityId?: string; description?: string; _cellStatuses?: any }>(
    p6Rows: T[],
    draftRows: T[],
    editableFields: (keyof T)[]
  ): T[] => {
    if (!draftRows || draftRows.length === 0) {
      return p6Rows;
    }

    console.log(`[Merge] Merging ${draftRows.length} draft rows with ${p6Rows.length} P6 rows`);

    // Create maps for matching by activityId AND description
    const draftMapById = new Map<string, T>();
    const draftMapByDescription = new Map<string, T>();

    draftRows.forEach((row, index) => {
      if (row.activityId) {
        draftMapById.set(row.activityId, row);
      }
      if (row.description) {
        draftMapByDescription.set(row.description, row);
      }
    });

    console.log(`[Merge] Draft map: ${draftMapById.size} by ID, ${draftMapByDescription.size} by description`);

    // Merge: overlay editable fields from draft onto P6 rows
    let matchCount = 0;
    const result = p6Rows.map((p6Row, index) => {
      // Try to find matching draft row: first by activityId, then by description, then by index
      let draftRow: T | undefined;

      if (p6Row.activityId) {
        draftRow = draftMapById.get(p6Row.activityId);
      }

      if (!draftRow && p6Row.description) {
        draftRow = draftMapByDescription.get(p6Row.description);
      }

      // Fallback: match by index if other methods fail
      // This handles legacy drafts where activityId is missing
      if (!draftRow && index < draftRows.length) {
        draftRow = draftRows[index];
      }

      if (!draftRow) {
        return p6Row;
      }

      matchCount++;

      // Create merged row: start with P6 data, overlay editable fields from draft
      const merged = { ...p6Row };
      
      // Explicitly preserve metadata status (highlights)
      if (draftRow!._cellStatuses) {
        merged._cellStatuses = draftRow!._cellStatuses;
      }

      editableFields.forEach(field => {
        if (draftRow![field] !== undefined && draftRow![field] !== '') {
          merged[field] = draftRow![field];
        }
      });

      return merged;
    });

    console.log(`[Merge] Successfully merged ${matchCount} out of ${p6Rows.length} rows`);
    return result;
  };


  // Track if entry is read-only (submitted)


  // Initialize data based on sheet type
  // Track which draft entries have already been merged to avoid re-merging on tab switch
  const mergedDraftIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    // Skip if P6 data hasn't loaded yet (prevents merging with empty data)
    if (!isP6DataFetched) return;

    if (currentDraftEntry && currentDraftEntry.data_json) {
      // CRITICAL: Only merge if the draft belongs to the current active tab.
      // Without this check, switching tabs causes a race condition where the old
      // tab's draft gets merged into the new tab's data before the new draft loads.
      if (currentDraftEntry.sheet_type !== activeTab) {
        console.log(`[Merge] Skipping — draft sheet_type '${currentDraftEntry.sheet_type}' !== activeTab '${activeTab}'`);
        return;
      }

      // Build a unique key for this draft entry + tab to avoid re-merging
      const mergeKey = `${currentDraftEntry.id}_${activeTab}`;
      if (mergedDraftIds.current.has(mergeKey)) {
        // Already merged this draft for this tab — skip to preserve user edits
        return;
      }

      const data = typeof currentDraftEntry.data_json === 'string'
        ? JSON.parse(currentDraftEntry.data_json)
        : currentDraftEntry.data_json;

      // Check if entry is read-only (submitted or approved)
      // Enforce read-only mode if the user is not a supervisor
      const isReadOnly = (user?.Role && user.Role !== 'supervisor') || false;
      setIsEntryReadOnly(isReadOnly);

      // Apply draft data by merging with current state
      // This allows saved edits to persist even when using P6 API data
      if (data.rows && data.rows.length > 0) {
        console.log('Applying draft merge after P6 data loaded for tab:', activeTab, 'Draft rows:', data.rows.length);

        // ALWAYS merge saved edits onto P6 data - P6 data is the source of truth for row count
        // Only editable fields (today, yesterday, remarks, etc.) are preserved from saved draft
        switch (activeTab) {
          case 'dp_qty':
            console.log('Merging draft edits onto P6 data for dp_qty. P6 rows:', dpQtyData.length);
            setDpQtyData(prev =>
              recalcCategoryTotals(mergeDraftWithP6Data(prev, data.rows, ['todayValue', 'yesterdayValue', 'cumulative', 'balance', 'weightage', 'uom', 'actualStart', 'actualFinish']))
            );
            break;
          case 'dp_vendor_block':
            console.log('Merging draft edits onto P6 data for dp_vendor_block. P6 rows:', dpVendorBlockData.length);
            setDpVendorBlockData(prev =>
              recalcCategoryTotals(mergeDraftWithP6Data(prev, data.rows, ['todayValue', 'yesterdayValue', 'actual', 'completionPercentage']))
            );
            if (data.totalManpower) setTotalManpower(data.totalManpower);
            break;
          case 'manpower_details':
            console.log('Merging draft edits onto P6 data for manpower_details. P6 rows:', manpowerDetailsData.length);
            setManpowerDetailsData(prev =>
              mergeDraftWithP6Data(prev, data.rows, ['todayValue', 'yesterdayValue', 'budgetedUnits', 'actualUnits', 'remainingUnits', 'percentComplete'])
            );
            if (data.totalManpower) setTotalManpower(data.totalManpower);
            break;
          case 'dp_block':
            console.log('Merging draft edits onto P6 data for dp_block. P6 rows:', dpBlockData.length);
            setDpBlockData(prev =>
              mergeDraftWithP6Data(prev, data.rows, ['actualStartDate', 'actualFinishDate', 'forecastStartDate', 'forecastFinishDate', 'priority'])
            );
            break;
          case 'dp_vendor_idt':
            console.log('Merging draft edits onto P6 data for dp_vendor_idt. P6 rows:', dpVendorIdtData.length);
            setDpVendorIdtData(prev =>
              recalcCategoryTotals(mergeDraftWithP6Data(prev, data.rows, ['todayValue', 'yesterdayValue', 'actual', 'completionPercentage']))
            );
            break;
          case 'testing_commissioning':
            console.log('Merging draft edits onto P6 data for testing_commissioning. P6 rows:', testingCommData.length);
            setTestingCommData(prev =>
              recalcCategoryTotals(mergeDraftWithP6Data(prev, data.rows, ['todayValue', 'yesterdayValue', 'actual', 'completionPercentage']))
            );
            break;

          // Wind sheets — manual data entry, apply draft directly
          case 'wind_summary':
            if (data.rows) setWindSummaryData(data.rows);
            break;
          case 'wind_progress':
            if (data.rows) setWindProgressData(data.rows);
            break;
          case 'wind_manpower':
            if (data.rows) setWindManpowerData(data.rows);
            break;

          // PSS sheets — manual data entry, apply draft directly
          case 'pss_summary':
            if (data.rows) setPssSummaryData(data.rows);
            break;
          case 'pss_progress':
            if (data.rows) setPssProgressData(data.rows);
            break;
          case 'pss_manpower':
            if (data.rows) setPssManpowerData(data.rows);
            break;
        }

        // Mark this draft+tab as merged
        mergedDraftIds.current.add(mergeKey);
      }
    } else {
      setIsEntryReadOnly((user?.Role && user.Role !== 'supervisor') || false);
    }
  }, [currentDraftEntry, activeTab, isP6DataFetched]);


  // Fetch data when token, projectId, or activeTab changes
  // Draft entries are ALWAYS needed for the submit workflow, regardless of data source
  useEffect(() => {
    const fetchData = async () => {
      // First, fetch assigned projects
      let projects: any[] = [];
      try {
        const role = user?.role || user?.Role;
        projects = (role === "supervisor" || role === "Site PM") 
            ? await getAssignedProjects() 
            : await getUserProjects();
        setAssignedProjects(projects);
      } catch (error) {
        console.log('Projects will be fetched from P6 API');
      }

      // Determine which project ID to use
      let projectIdToUse = currentProjectId;

      // If no project is selected, auto-select the first assigned project
      if (!projectIdToUse && projects.length > 0) {
        const firstProject = projects[0];
        projectIdToUse = firstProject.id || firstProject.ObjectId || firstProject.project_id;
        console.log('Auto-selecting first project:', projectIdToUse);
        setCurrentProjectId(projectIdToUse);
      }

      // Determine sheet configuration to see if it supports data entry
      const projectConfig = getProjectTypeConfig(currentProjectType);
      const sheetDef = projectConfig.sheets.find(s => s.id === activeTab);
      const isDataEntrySheet = sheetDef?.dataEntry ?? false;

      if (projectIdToUse && isDataEntrySheet) {
        try {
          console.log('Loading draft entry for projectId:', projectIdToUse, 'activeTab:', activeTab, 'targetDate:', targetDate);
          const draft = await getDraftEntry(projectIdToUse, activeTab, targetDate);
          console.log('Draft entry loaded:', draft);
          setCurrentDraftEntry(draft);
        } catch (draftError) {
          console.log('Draft entry not available:', draftError);
          setCurrentDraftEntry(null);
        }
      } else {
        // Non-sheet tabs, summary tabs, or no project selected
        console.log('No draft entry needed. activeTab:', activeTab, 'isDataEntrySheet:', isDataEntrySheet);
        setCurrentDraftEntry(null);
      }
    };

    if (token) {
      fetchData();
    }
  }, [token, currentProjectId, activeTab, targetDate]);

  // Reset P6 data when project OR date changes
  useEffect(() => {
    setIsP6DataFetched(false);
    setP6Activities([]);
    setLoadingActivities(false);
    setCurrentPage(1);
    setPaginationInfo(null);
    mergedDraftIds.current.clear(); // Reset merge tracking for fresh load
  }, [currentProjectId, targetDate]);

  // Fetch P6 activities function with pagination (Lazy Load)
  const fetchP6Activities = useCallback(async (page: number = 1, append: boolean = false) => {
    if (!currentProjectId) {
      return;
    }

    try {
      if (page === 1) {
        setLoadingActivities(true);
      } else {
        setLoadingMore(true);
      }
      console.log(`SupervisorDashboard: Fetching P6 activities for project ${currentProjectId} (page ${page})`);

      // 2. Fetch P6 activities and yesterday values together
      const [response, yesterdayData, manpowerDataRaw] = await Promise.all([
        getP6ActivitiesPaginated(currentProjectId, page, 10000),
        getYesterdayValues(currentProjectId, targetYesterday, undefined), // Fetch ALL sheets to cache them correctly
        page === 1 ? getManpowerDetailsData(currentProjectId) : Promise.resolve([])
      ]);
      const baseActivities = response.activities;

      // Map yesterday values including sheet isolation
      const yesterdayMap = new Map<string, { yesterday: number; cumulative: number; is_approved: boolean }>();
      if (yesterdayData && yesterdayData.activities) {
        console.log(`[Yesterday Values] Received ${yesterdayData.activities.length} records for ${targetYesterday}`);
        yesterdayData.activities.forEach(item => {
          const val = { yesterday: item.yesterdayValue, cumulative: item.cumulativeValue, is_approved: item.is_approved };
          
          if (item.sheetType) {
            // Sheet-isolated composite keys (preferred)
            if (item.stringActivityId) yesterdayMap.set(`${item.stringActivityId}_${item.sheetType}`, val);
            if (item.activityId) yesterdayMap.set(`${item.activityId}_${item.sheetType}`, val);
            if (item.activityObjectId) yesterdayMap.set(`${item.activityObjectId}_${item.sheetType}`, val);
            if (item.name) yesterdayMap.set(`${item.name.trim()}_${item.sheetType}`, val);
          }
          // Also store with plain keys as fallback for legacy records with NULL sheet_type
          // The filter step prefers composite keys; these are only used when no composite match exists
          if (item.stringActivityId && !yesterdayMap.has(`${item.stringActivityId}_legacy`)) {
            yesterdayMap.set(`${item.stringActivityId}_legacy`, val);
          }
          if (item.activityId && !yesterdayMap.has(`${item.activityId}_legacy`)) {
            yesterdayMap.set(`${item.activityId}_legacy`, val);
          }
          if (item.activityObjectId && !yesterdayMap.has(`${item.activityObjectId}_legacy`)) {
            yesterdayMap.set(`${item.activityObjectId}_legacy`, val);
          }
          if (item.name && !yesterdayMap.has(`${item.name.trim()}_legacy`)) {
            yesterdayMap.set(`${item.name.trim()}_legacy`, val);
          }
        });
      }

      // Update pagination info
      if (response.pagination) {
        setPaginationInfo(response.pagination);
        setCurrentPage(page);
      }

      // Update main P6 activities state
      setP6Activities(prev => {
        if (append && page > 1) {
          return [...prev, ...baseActivities];
        } else {
          return baseActivities;
        }
      });

      // Update raw states for reactive filtering
      if (baseActivities.length > 0) {
        if (append && page > 1) {
          setRawQtyData(prev => [...prev, ...mapActivitiesToDPQty(baseActivities)]);
          setRawBlockData(prev => [...prev, ...mapActivitiesToDPBlock(baseActivities)]);
          setRawVendorBlockData(prev => [...prev, ...mapActivitiesToDPVendorBlock(baseActivities)]);
          setRawVendorIdtData(prev => [...prev, ...mapActivitiesToDPVendorIdt(baseActivities)]);
          setRawTestingCommData(prev => [...prev, ...mapActivitiesToTestingComm(baseActivities)]);
          // Manpower is usually only fetched on page 1, but we handle append just in case
          setRawManpowerData(prev => [...prev, ...manpowerDataRaw]);
        } else {
          setRawQtyData(mapActivitiesToDPQty(baseActivities));
          setRawBlockData(mapActivitiesToDPBlock(baseActivities));
          setRawVendorBlockData(mapActivitiesToDPVendorBlock(baseActivities));
          setRawVendorIdtData(mapActivitiesToDPVendorIdt(baseActivities));
          setRawTestingCommData(mapActivitiesToTestingComm(baseActivities));
          setRawManpowerData(manpowerDataRaw);
        }
        
        // Update yesterday map for re-filtering
        setYesterdayMapState(prev => {
          const newMap = new Map(prev);
          yesterdayMap.forEach((v, k) => newMap.set(k, v));
          return newMap;
        });
      }

      if (page === 1) {
        const totalMsg = response.pagination?.totalCount
          ? ` (${response.pagination.totalCount} total)`
          : '';
        const yesterdayMsg = yesterdayData.count > 0 ? " with historical values" : "";
        toast.success(`Loaded ${baseActivities.length} P6 activities${totalMsg}${yesterdayMsg}`);
      }
      
      setIsP6DataFetched(true);
    } catch (error) {
      console.error("Error fetching P6 activities:", error);
      toast.error("Failed to load P6 activities");
    } finally {
      setLoadingActivities(false);
      setLoadingMore(false);
    }
  }, [currentProjectId, targetYesterday, loadProjectFilter]);

  // LIVE FILTERING EFFECT: Re-process all sheet data when filters or raw data changes
  useEffect(() => {
    if (!isP6DataFetched) return;

    const filters = (universalFilter || "").trim().toLowerCase().split(/\s+/).filter(f => f);
    
    const applyFilter = (data: any[]) => {
      if (filters.length === 0) return data;
      return data.filter(row => {
        const id = (row.activityId || "").toLowerCase();
        const desc = (row.activities || row.description || "").toLowerCase();
        
        return filters.every(f => {
          const filterLower = f.toLowerCase();
          
          // 1. Strict Package segment matching for ID (Middle segment)
          const parts = id.split('-');
          let pkg = "";
          if (parts.length >= 3) {
            pkg = parts[1].trim().toLowerCase();
          } else if (parts.length === 2 && !/^\d+$/.test(parts[0])) {
            pkg = parts[0].trim().toLowerCase();
          }
          
          const idMatch = pkg === filterLower || id.includes(filterLower);
          const descMatch = desc.includes(filterLower);
          
          return idMatch || descMatch;
        });
      });
    };

    // 1. DP Qty — only overlay yesterday/cumulative from the isolated map, keep P6 base data
    const filteredQty = applyFilter(rawQtyData).map(row => {
      const yVal = yesterdayMapState.get(`${row.activityId}_dp_qty`) || 
                   (row.description ? yesterdayMapState.get(`${row.description.trim()}_dp_qty`) : undefined) ||
                   yesterdayMapState.get(`${row.activityId}_legacy`) ||
                   (row.description ? yesterdayMapState.get(`${row.description.trim()}_legacy`) : undefined);

      return {
        ...row,
        yesterdayValue: yVal?.yesterday?.toString() || row.yesterdayValue || "",
        cumulative: yVal?.cumulative?.toString() || row.cumulative || "",
        yesterdayIsApproved: yVal?.is_approved !== undefined ? yVal.is_approved : true
      };
    });
    setDpQtyData(aggregateDPQtyByActivityName(filteredQty));

    // 2. DP Block
    const filteredBlock = applyFilter(rawBlockData);
    setDpBlockData(filteredBlock);

    // 3. Vendor Block (AC Side) — overlay yesterday, keep P6 actual as base
    const filteredVendorBlock = applyFilter(rawVendorBlockData).map(row => {
      const yVal = yesterdayMapState.get(`${row.activityId}_dp_vendor_block`) || 
                   (row.description ? yesterdayMapState.get(`${row.description.trim()}_dp_vendor_block`) : undefined) ||
                   yesterdayMapState.get(`${row.activityId}_legacy`) ||
                   (row.description ? yesterdayMapState.get(`${row.description.trim()}_legacy`) : undefined);

      return {
        ...row,
        yesterdayValue: yVal?.yesterday?.toString() || row.yesterdayValue || "",
        actual: yVal?.cumulative?.toString() || row.actual || "",
        yesterdayIsApproved: yVal?.is_approved !== undefined ? yVal.is_approved : true
      };
    });
    setDpVendorBlockData(aggregateVendorBlockByActivityName(filteredVendorBlock));

    // 4. Vendor IDT (DC Side) — overlay yesterday, keep P6 actual as base
    const filteredVendorIdt = applyFilter(rawVendorIdtData).map(row => {
      const yVal = yesterdayMapState.get(`${row.activityId}_dp_vendor_idt`) || 
                   (row.description ? yesterdayMapState.get(`${row.description.trim()}_dp_vendor_idt`) : undefined) ||
                   yesterdayMapState.get(`${row.activityId}_legacy`) ||
                   (row.description ? yesterdayMapState.get(`${row.description.trim()}_legacy`) : undefined);

      return {
        ...row,
        yesterdayValue: yVal?.yesterday?.toString() || row.yesterdayValue || "",
        actual: yVal?.cumulative?.toString() || row.actual || "",
        yesterdayIsApproved: yVal?.is_approved !== undefined ? yVal.is_approved : true
      };
    });
    setDpVendorIdtData(aggregateVendorIdtByActivityName(filteredVendorIdt));

    // 5. Testing & Commissioning — overlay yesterday, keep P6 actual as base
    const filteredTestingComm = applyFilter(rawTestingCommData).map(row => {
      const yVal = yesterdayMapState.get(`${row.activityId}_testing_commissioning`) || 
                   (row.description ? yesterdayMapState.get(`${row.description.trim()}_testing_commissioning`) : undefined) ||
                   yesterdayMapState.get(`${row.activityId}_legacy`) ||
                   (row.description ? yesterdayMapState.get(`${row.description.trim()}_legacy`) : undefined);

      return {
        ...row,
        yesterdayValue: yVal?.yesterday?.toString() || row.yesterdayValue || "",
        actual: yVal?.cumulative?.toString() || row.actual || "",
        yesterdayIsApproved: yVal?.is_approved !== undefined ? yVal.is_approved : true
      };
    });
    setTestingCommData(aggregateVendorBlockByActivityName(filteredTestingComm));

    // 6. Manpower — overlay yesterday, keep base data
    const filteredManpower = applyFilter(rawManpowerData).map(row => {
      const yVal = yesterdayMapState.get(`${row.activityId}_manpower_details`) || 
                   (row.description ? yesterdayMapState.get(`${row.description.trim()}_manpower_details`) : undefined) ||
                   yesterdayMapState.get(`${row.activityId}_legacy`) ||
                   (row.description ? yesterdayMapState.get(`${row.description.trim()}_legacy`) : undefined);
      return {
        ...row,
        yesterdayValue: yVal?.yesterday?.toString() || row.yesterdayValue || "",
        yesterdayIsApproved: yVal?.is_approved !== undefined ? yVal.is_approved : true
      };
    });
    setManpowerDetailsData(aggregateManpowerByActivityName(filteredManpower) as any);

  }, [universalFilter, selectedBlock, rawQtyData, rawBlockData, rawVendorBlockData, rawVendorIdtData, rawTestingCommData, rawManpowerData, isP6DataFetched, yesterdayMapState]);

  // Load more activities for infinite scroll
  const loadMoreActivities = useCallback(() => {
    if (paginationInfo?.hasMore && !loadingMore && !loadingActivities) {
      fetchP6Activities(currentPage + 1, true);
    }
  }, [paginationInfo, loadingMore, loadingActivities, currentPage, fetchP6Activities]);



  // Override fetchP6Activities effect to also fetch resources (SOLAR ONLY)
  useEffect(() => {
    // P6 data fetching only applies to Solar projects
    if (currentProjectType !== 'solar') return;

    // Include 'summary' tab so data loads on initial page load (summary is the default tab)
    const dataTabs = ['summary', 'dp_qty', 'dp_block', 'dp_vendor_block', 'dp_vendor_idt', 'manpower_details', 'testing_commissioning'];

    if (token && currentProjectId) {
      if (dataTabs.includes(activeTab) && !isP6DataFetched && !loadingActivities) {
        fetchP6Activities(1, false);
      }

      // Fetch resources if on summary tab and not fetched yet
      if (activeTab === 'summary' && !isResourcesFetched) {
        fetchP6Resources();
      }
    }
  }, [activeTab, currentProjectId, token, isP6DataFetched, isResourcesFetched, loadingActivities, fetchP6Activities, fetchP6Resources, currentProjectType]);

  // Handle Manual Sync
  const handleSyncP6 = async () => {
    if (!currentProjectId) return;
    try {
      setIsSyncing(true);
      toast.info("Starting synchronization with Oracle P6... This may take a moment.");

      // Sync project data
      await syncP6Data(currentProjectId);

      // Also sync global resources
      await syncGlobalResources();

      toast.success("Synchronization successful! Reloading data...");

      // Force reload from first page
      setIsP6DataFetched(false);
      setIsResourcesFetched(false);
      setCurrentPage(1);
      fetchP6Activities(1, false);
      fetchP6Resources();
    } catch (error: any) {
      console.error("Sync failed", error);
      const errorMsg = error?.response?.data?.message || error.message || "Sync failed";
      toast.error(`Sync failed: ${errorMsg}`);
    } finally {
      setIsSyncing(false);
    }
  };


  // Helper to extract ONLY the rows that have been modified (Delta Submission)
  const getFullDataForSave = async () => {
    let currentData: any[] = [];
    
    // Get the currently loaded data for the active tab
    switch (activeTab) {
      case 'dp_qty': currentData = dpQtyData; break;
      case 'dp_vendor_block': currentData = dpVendorBlockData; break;
      case 'manpower_details': currentData = manpowerDetailsData; break;
      case 'dp_block': currentData = dpBlockData; break;
      case 'dp_vendor_idt': currentData = dpVendorIdtData; break;
      case 'testing_commissioning': currentData = testingCommData; break;
      case 'wind_summary': currentData = windSummaryData; break;
      case 'wind_progress': currentData = windProgressData; break;
      case 'wind_manpower': currentData = windManpowerData; break;
      case 'pss_summary': currentData = pssSummaryData; break;
      case 'pss_progress': currentData = pssProgressData; break;
      case 'pss_manpower': currentData = pssManpowerData; break;
      default: return [];
    }

    // Filter to ONLY include rows that have been modified in the current UI session
    // Specifically looking for the _cellStatuses flag set by StyledExcelTable
    const deltaRows = currentData.filter((row: any) => {
      // 1. PRIMARY: Check for the metadata flag signifying manual interaction in THIS session
      // This catches ALL user edits including typing 0, negatives, clearing values, etc.
      const hasMetadata = row._cellStatuses && Object.keys(row._cellStatuses).length > 0;
      if (hasMetadata) return true;

      // 2. Ignore category rows entirely (they don't need to be saved as deltas, backend recalculates sums anyway)
      if (row.isCategoryRow) return false;

      // 3. FALLBACK: For programmatic updates or data that bypasses _cellStatuses tracking
      // Conservative: exclude 0 to avoid false positives from draft merge carry-overs
      // User-typed 0 is already caught by _cellStatuses above
      const todayStr = String(row.todayValue ?? '').trim();
      const hasTodayValue = todayStr !== '' && todayStr !== '0' && !isNaN(Number(todayStr)) && Number(todayStr) !== 0;
      const hasRemarks = row.remarks !== undefined && row.remarks !== null && String(row.remarks).trim() !== '';
      
      return hasTodayValue || hasRemarks;
    });

    return deltaRows;
  };

  // Handle entry save
  const handleSaveEntry = async () => {
    if (!currentDraftEntry) return;

    // Wait for P6 data to load before allowing save (solar only)
    if (currentProjectType === 'solar' && !isP6DataFetched) {
      toast.warning("Please wait for data to load before saving");
      return;
    }

    try {
      const fullRows = await getFullDataForSave();

      if (fullRows.length === 0) {
        toast.warning("No new changes detected. Entry is up to date.");
        return;
      }

      let dataToSave: any = {};
      let rowCount = fullRows.length;

      switch (activeTab) {
        case 'dp_qty':
          dataToSave = {
            staticHeader: {
              projectInfo: projectName,
              reportingDate: targetDate,
              progressDate: targetYesterday
            },
            rows: fullRows
          };
          break;
        case 'dp_vendor_block':
        case 'dp_block':
        case 'dp_vendor_idt':
        case 'testing_commissioning':
          dataToSave = { rows: fullRows };
          break;
        case 'manpower_details':
          dataToSave = { totalManpower, rows: fullRows };
          break;
        // Wind/PSS sheets
        case 'wind_summary':
        case 'wind_progress':
        case 'wind_manpower':
        case 'pss_summary':
        case 'pss_progress':
        case 'pss_manpower':
          dataToSave = { rows: fullRows };
          break;
        default:
          dataToSave = { rows: [] };
      }

      console.log(`handleSaveEntry (OVERWRITE): Saving ${rowCount} modified rows for tab ${activeTab}`);
      
      // Perform a partial update to preserve edits from previous sessions
      await saveDraftEntry(currentDraftEntry.id, dataToSave, true);
      
      toast.success(`Updated ${rowCount} modified activities successfully!`);
    } catch (error) {
      console.error('handleSaveEntry error:', error);
      toast.error("Failed to save entry");
    }
  };


  // Handle entry submission
  const handleSubmitEntry = async () => {
    console.log('handleSubmitEntry called');
    console.log('currentDraftEntry:', currentDraftEntry);
    console.log('activeTab:', activeTab);
    console.log('currentProjectId:', currentProjectId);

    if (!currentDraftEntry) {
      // Provide more specific error based on why draft entry might be missing
      if (!currentProjectId) {
        toast.error("No project selected. Please select a project first by clicking 'Change Project'.");
      } else if (activeTab === 'summary' || activeTab === 'issues' || activeTab === 'supervisor_table') {
        toast.error("Cannot submit from this tab. Please switch to a sheet tab (like DP Qty, DP Block, etc.).");
      } else {
        toast.error("Unable to load entry. Please try refreshing the page or selecting a different project.");
      }
      console.error('No currentDraftEntry found. projectId:', currentProjectId, 'activeTab:', activeTab);
      return;
    }

    // RELAXED FOR TESTING: Allow multiple submits even if already submitted/approved
    if (isEntryReadOnly) {
      toast.error("Cannot submit: This entry is strictly read-only");
      return;
    }

    // For past edits, require a reason
    if (currentDraftEntry.isPastEdit && !editReason) {
      // Store the action and show modal
      setPendingSubmitAction(() => executeSubmitEntry);
      setShowEditReasonModal(true);
      return;
    }

    executeSubmitEntry();
  };

  const executeSubmitEntry = async () => {
    try {
      // First save the current data so we capture the newest UI state
      const fullRows = await getFullDataForSave();

      if (fullRows.length === 0) {
        toast.error("Cannot submit empty sheet. Please enter at least 1 value to submit.");
        return;
      }

      let dataToSave: any = {};
      let rowCount = fullRows.length;

      switch (activeTab) {
        case 'dp_qty':
          dataToSave = {
            staticHeader: {
              projectInfo: projectName,
              reportingDate: targetDate,
              progressDate: targetYesterday
            },
            rows: fullRows
          };
          break;
        case 'dp_vendor_block':
        case 'dp_block':
        case 'dp_vendor_idt':
        case 'testing_commissioning':
          dataToSave = { rows: fullRows };
          break;
        case 'manpower_details':
          dataToSave = { totalManpower, rows: fullRows };
          break;
        default:
          dataToSave = { rows: [] };
      }

      console.log('executeSubmitEntry: Saving strictly modified delta data before submit', dataToSave);
      // Pass true to accumulate strictly the modified delta rows
      await saveDraftEntry(currentDraftEntry.id, dataToSave, true);

      // Then submit the entry, passing the edit reason if it's a past edit
      console.log('executeSubmitEntry: Submitting entry', currentDraftEntry.id);
      await submitEntry(currentDraftEntry.id, currentDraftEntry.isPastEdit ? editReason : undefined);

      toast.success("Entry submitted successfully! Sent to PM for review.");

      // Reset reason and modal forms
      setEditReason("");
      setShowEditReasonModal(false);
      setPendingSubmitAction(null);

      // Reload the draft entry to get a fresh one for this sheet type
      try {
        const newDraft = await getDraftEntry(currentProjectId, activeTab, targetDate);
        setCurrentDraftEntry(newDraft);
        console.log('Loaded new draft entry after submission:', newDraft);
      } catch (error) {
        console.error('Error loading new draft after submission:', error);
      }

      toast.info("Entry submitted. A new draft has been created for this sheet.");
    } catch (error) {
      console.error('Submit error:', error);
      toast.error("Failed to submit entry");
    }
  };

  // Handle Export All Sheets
  const handleExportAllSheets = async () => {
    try {
      const XLSX = await import('xlsx');
      const wb = XLSX.utils.book_new();

      const appendSheet = (sheetName: string, data: any[]) => {
        if (!data || data.length === 0) return;
        const ws = XLSX.utils.json_to_sheet(data);
        XLSX.utils.book_append_sheet(wb, ws, sheetName);
      };

      appendSheet("DC Side", dpVendorIdtData);
      appendSheet("AC Side", dpVendorBlockData);
      appendSheet("Testing & Comm.", testingCommData);
      appendSheet("Resources", resourceData);

      const safeName = (projectName || 'Project').replace(/[^a-z0-9]/gi, '_');
      const dateStr = targetDate || new Date().toISOString().split('T')[0];
      XLSX.writeFile(wb, `${dateStr}_${safeName}_Full_Project.xlsx`);
      toast.success("Project export started");
    } catch (error) {
      console.error("Export all failed:", error);
      toast.error("Failed to export project data");
    }
  };

  // Open the add issue modal when navigated with openAddIssueModal flag
  useEffect(() => {
    if (openAddIssueModal) {
      setActiveTab("issues"); // Switch to issues tab
      setIsAddIssueModalOpen(true);
      // Clear the state to prevent reopening on refresh
      navigate(location.pathname, { replace: true, state: { ...locationState, openAddIssueModal: false } });
    }
  }, [openAddIssueModal, navigate, location.pathname, locationState]);

  // Load issues from backend
  const loadIssuesFromBackend = useCallback(async () => {
    try {
      setLoadingIssues(true);
      const response = await getIssues({
        project_id: currentProjectId || undefined,
        limit: 100
      });

      // Convert backend issues to local format
      const loadedIssues: Issue[] = response.issues.map((backendIssue: BackendIssue) => {
        let parsedData: any = {};
        let descText = backendIssue.description || '';

        // Try parsing description if it's JSON, handling potential double stringification
        try {
          let cleanStr = descText.trim();
          // Attempt to parse string if it looks like JSON
          let attempts = 0;
          let currentParsed: any = cleanStr;

          while (typeof currentParsed === 'string' && currentParsed.trim().startsWith('{') && currentParsed.trim().endsWith('}') && attempts < 2) {
            currentParsed = JSON.parse(currentParsed.trim());
            attempts++;
          }

          if (currentParsed && typeof currentParsed === 'object' && (currentParsed as any).description !== undefined) {
            parsedData = currentParsed;
            descText = parsedData.description || descText;
          }
        } catch (e) {
          // Ignore parsing error and use raw string
        }

        return {
          id: backendIssue.id.toString(),
          description: descText,
          startDate: parsedData.startDate || backendIssue.created_at?.split('T')[0] || today,
          finishedDate: parsedData.finishedDate || backendIssue.resolved_at?.split('T')[0] || null,
          delayedDays: parsedData.delayedDays || 0,
          priority: parsedData.priority || (backendIssue as any).priority || 'Medium',
          status: parsedData.status || (backendIssue.status === 'open' ? 'Open' :
            backendIssue.status === 'in_progress' ? 'In Progress' : 'Resolved'),
          actionRequired: parsedData.actionRequired || backendIssue.title || '',
          remarks: parsedData.remarks || backendIssue.resolution_notes || '',
          attachment: null,
          attachmentName: null,
          projectName: projectName || (projectDetails as any)?.Name || (projectDetails as any)?.name || `ID: ${backendIssue.project_id}`
        };
      });

      setIssues(loadedIssues);
    } catch (error) {
      console.error('Error loading issues:', error);
      // Don't show error toast - table just won't have backend issues
    } finally {
      setLoadingIssues(false);
    }
  }, [currentProjectId, today]);

  // Load issues when issues tab is active
  useEffect(() => {
    if (activeTab === 'issues' && token) {
      loadIssuesFromBackend();
    }
  }, [activeTab, token, loadIssuesFromBackend]);

  // Handle form submission - save to backend
  const handleSubmitIssue = async (formData: any) => {
    // Calculate delayed days
    const calculateDelayedDays = (startDate: string, finishedDate: string | null): number => {
      if (!finishedDate) return 0;
      const start = new Date(startDate);
      const finish = new Date(finishedDate);
      const diffTime = Math.abs(finish.getTime() - start.getTime());
      return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    };

    const delayedDays = calculateDelayedDays(formData.startDate, formData.finishedDate || null);

    try {
      // Save to backend - ensure project_id is a number
      const projectIdNum = currentProjectId ? (typeof currentProjectId === 'number' ? currentProjectId : parseInt(currentProjectId, 10)) : undefined;

      // Store all form details in a structured format
      const fullDescription = JSON.stringify({
        description: formData.description || '',
        startDate: formData.startDate || '',
        finishedDate: formData.finishedDate || '',
        delayedDays: delayedDays,
        status: formData.status || 'Open',
        actionRequired: formData.actionRequired || '',
        remarks: formData.remarks || ''
      });

      // Map status to backend format
      const statusMap: Record<string, string> = {
        'Open': 'open',
        'In Progress': 'in_progress',
        'Resolved': 'resolved',
        'Closed': 'closed'
      };

      await createIssue({
        project_id: projectIdNum && !isNaN(projectIdNum) ? projectIdNum : undefined,
        title: formData.actionRequired || formData.description?.substring(0, 100) || 'Issue',
        description: fullDescription,
        issue_type: 'general',
        priority: formData.priority?.toLowerCase() || 'medium',
      });

      // Also add to local state for immediate display
      const issue: Issue = {
        id: Math.random().toString(36).substr(2, 9),
        description: formData.description,
        startDate: formData.startDate,
        finishedDate: formData.finishedDate || null,
        delayedDays,
        priority: formData.priority || "Medium",
        status: formData.status,
        actionRequired: formData.actionRequired,
        remarks: formData.remarks,
        attachment: formData.attachment,
        attachmentName: formData.attachment ? formData.attachment.name : null,
        projectName: projectName,
      };

      setIssues([...issues, issue]);
      setIsAddIssueModalOpen(false);
      toast.success("Issue created and saved successfully!");

      // Reload issues from backend to get the proper ID
      loadIssuesFromBackend();
    } catch (error) {
      console.error('Error saving issue:', error);
      toast.error("Failed to save issue to server, but added locally");

      // Still add locally even if backend fails
      const issue: Issue = {
        id: Math.random().toString(36).substr(2, 9),
        description: formData.description,
        startDate: formData.startDate,
        finishedDate: formData.finishedDate || null,
        delayedDays,
        priority: formData.priority || "Medium",
        status: formData.status,
        actionRequired: formData.actionRequired,
        remarks: formData.remarks,
        attachment: formData.attachment,
        attachmentName: formData.attachment ? formData.attachment.name : null,
        projectName: projectName,
      };
      setIssues([...issues, issue]);
      setIsAddIssueModalOpen(false);
    }
  };

  // ============================================================================
  // CROSS-TABLE SYNC: When Vendor IDT data changes, update DP Qty totals
  // ============================================================================
  const handleVendorIdtDataChange = useCallback((newIdtData: any[]) => {
    // 1. Update the Vendor IDT state
    setDpVendorIdtData(newIdtData);

    // 2. Sync today/yesterday values to DP Qty
    // Build a map of activityId -> { todayValue, yesterdayValue } from non-category IDT rows
    const idtValueMap = new Map<string, { todayValue: string; yesterdayValue: string; actual: string; scope: string }>();
    newIdtData.forEach(row => {
      if (!row.isCategoryRow && row.activityId) {
        idtValueMap.set(row.activityId, {
          todayValue: row.todayValue || '0',
          yesterdayValue: row.yesterdayValue || '0',
          actual: row.actual || '0',
          scope: row.scope || '0'
        });
      }
    });

    // 3. Update DP Qty data - recalculate aggregated sums
    setDpQtyData(prevQty => {
      return prevQty.map(qtyRow => {
        if (!qtyRow.description) return qtyRow;

        // Find all IDT activities that match this DP Qty group
        const cleanQtyName = qtyRow.description;
        let totalToday = 0;
        let totalYesterday = 0;
        let totalActual = 0;
        let totalScope = 0;
        let matchCount = 0;

        idtValueMap.forEach((vals, actId) => {
          // Find the activity name for this activityId from IDT data
          const idtRow = newIdtData.find(r => !r.isCategoryRow && r.activityId === actId);
          if (idtRow) {
            const cleanIdtName = extractActivityName(idtRow.description || ''); // Updated to description
            if (cleanIdtName === cleanQtyName) {
              totalToday += Number(vals.todayValue) || 0;
              totalYesterday += Number(vals.yesterdayValue) || 0;
              totalActual += Number(vals.actual) || 0;
              totalScope += Number(vals.scope) || 0;
              matchCount++;
            }
          }
        });

        if (matchCount > 0) {
          return {
            ...qtyRow,
            todayValue: String(totalToday),
            yesterdayValue: String(totalYesterday),
            cumulative: String(totalActual),
            totalQuantity: String(totalScope),
            balance: String(totalScope - totalActual)
          };
        }
        return qtyRow;
      });
    });
  }, []);

  // Render table components based on active tab
  const renderActiveTable = () => {
    // Determine the status based on currentDraftEntry
    const entryStatus = currentDraftEntry?.status || 'draft';

    // Check if entry is rejected and has a rejection reason
    const isRejected = currentDraftEntry?.isRejected;
    const rejectionReason = currentDraftEntry?.rejectionReason;

    switch (activeTab) {
      case 'summary':
        return (
          <DPRSummarySection
            p6Activities={p6Activities}
            dpQtyData={dpQtyData}
            dpBlockData={dpBlockData}
            dpVendorBlockData={dpVendorBlockData}
            dpVendorIdtData={dpVendorIdtData}
            manpowerDetailsData={manpowerDetailsData}
            resourceData={resourceData}
            onExportAll={handleExportAllSheets}
            selectedBlock={selectedBlock}
            universalFilter={universalFilter}
          />
        );
      case 'dp_qty':
        return (
          <>
            {isRejected && rejectionReason && (
              <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
                <div className="flex items-start">
                  <AlertCircle className="h-5 w-5 text-red-500 mt-0.5 mr-2 flex-shrink-0" />
                  <div>
                    <h4 className="text-red-800 font-medium">Entry Rejected by PM</h4>
                    <p className="text-red-700 mt-1">Reason: {rejectionReason}</p>
                    <p className="text-red-600 text-sm mt-2">Please review the feedback and make necessary corrections. You can now edit and resubmit this entry.</p>
                  </div>
                </div>
              </div>
            )}
            <DPQtyTable
              data={dpQtyData}
              setData={setDpQtyData}
              onSave={undefined}
              onSubmit={undefined}
              yesterday={targetYesterday}
              today={targetDate}
              isLocked={isEntryReadOnly}
              status={entryStatus}

              onExportAll={handleExportAllSheets}
              totalRows={paginationInfo?.totalCount || p6Activities.length}
              universalFilter={universalFilter}
              projectId={currentProjectId}
              selectedBlock={selectedBlock}
            />
          </>
        );
      case 'dp_vendor_block':
        return (
          <>
            {isRejected && rejectionReason && (
              <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
                <div className="flex items-start">
                  <AlertCircle className="h-5 w-5 text-red-500 mt-0.5 mr-2 flex-shrink-0" />
                  <div>
                    <h4 className="text-red-800 font-medium">Entry Rejected by PM</h4>
                    <p className="text-red-700 mt-1">Reason: {rejectionReason}</p>
                    <p className="text-red-600 text-sm mt-2">Please review the feedback and make necessary corrections. You can now edit and resubmit this entry.</p>
                  </div>
                </div>
              </div>
            )}
            <DPVendorBlockTable
              data={dpVendorBlockData}
              setData={setDpVendorBlockData}
              onSave={isEntryReadOnly ? undefined : handleSaveEntry}
              onSubmit={isEntryReadOnly ? undefined : handleSubmitEntry}
              yesterday={targetYesterday}
              today={targetDate}
              isLocked={isEntryReadOnly}
              status={entryStatus}

              projectName={projectName}
              onExportAll={handleExportAllSheets}
              totalRows={paginationInfo?.totalCount || p6Activities.length}
              universalFilter={universalFilter}
              projectId={currentProjectId}
              selectedBlock={selectedBlock}
            />
          </>
        );
      case 'manpower_details':
        return (
          <>
            {isRejected && rejectionReason && (
              <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
                <div className="flex items-start">
                  <AlertCircle className="h-5 w-5 text-red-500 mt-0.5 mr-2 flex-shrink-0" />
                  <div>
                    <h4 className="text-red-800 font-medium">Entry Rejected by PM</h4>
                    <p className="text-red-700 mt-1">Reason: {rejectionReason}</p>
                    <p className="text-red-600 text-sm mt-2">Please review the feedback and make necessary corrections. You can now edit and resubmit this entry.</p>
                  </div>
                </div>
              </div>
            )}
            <ManpowerDetailsTable
              data={manpowerDetailsData}
              setData={setManpowerDetailsData}
              totalManpower={totalManpower}
              setTotalManpower={setTotalManpower}
              onSave={isEntryReadOnly ? undefined : handleSaveEntry}
              onSubmit={isEntryReadOnly ? undefined : handleSubmitEntry}
              yesterday={targetYesterday}
              today={targetDate}
              isLocked={isEntryReadOnly}
              status={entryStatus}

              onExportAll={handleExportAllSheets}
              totalRows={paginationInfo?.totalCount || p6Activities.length}
              universalFilter={universalFilter}
              projectId={currentProjectId}
              selectedBlock={selectedBlock}
            />
          </>
        );
      case 'dp_block':
        return (
          <>
            {isRejected && rejectionReason && (
              <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
                <div className="flex items-start">
                  <AlertCircle className="h-5 w-5 text-red-500 mt-0.5 mr-2 flex-shrink-0" />
                  <div>
                    <h4 className="text-red-800 font-medium">Entry Rejected by PM</h4>
                    <p className="text-red-700 mt-1">Reason: {rejectionReason}</p>
                    <p className="text-red-600 text-sm mt-2">Please review the feedback and make necessary corrections. You can now edit and resubmit this entry.</p>
                  </div>
                </div>
              </div>
            )}
            <DPBlockTable
              data={dpBlockData}
              setData={setDpBlockData}
              onSave={undefined}
              onSubmit={undefined}
              yesterday={targetYesterday}
              today={targetDate}
              isLocked={isEntryReadOnly}
              status={entryStatus}

              onExportAll={handleExportAllSheets}
              totalRows={paginationInfo?.totalCount || p6Activities.length}
              universalFilter={universalFilter}
              projectId={currentProjectId}
              selectedBlock={selectedBlock}
            />
          </>
        );
      case 'dp_vendor_idt':
        return (
          <>
            {isRejected && rejectionReason && (
              <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
                <div className="flex items-start">
                  <AlertCircle className="h-5 w-5 text-red-500 mt-0.5 mr-2 flex-shrink-0" />
                  <div>
                    <h4 className="text-red-800 font-medium">Entry Rejected by PM</h4>
                    <p className="text-red-700 mt-1">Reason: {rejectionReason}</p>
                    <p className="text-red-600 text-sm mt-2">Please review the feedback and make necessary corrections. You can now edit and resubmit this entry.</p>
                  </div>
                </div>
              </div>
            )}
            <DPVendorIdtTable
              data={dpVendorIdtData}
              setData={handleVendorIdtDataChange}
              onSave={isEntryReadOnly ? undefined : handleSaveEntry}
              onSubmit={isEntryReadOnly ? undefined : handleSubmitEntry}
              yesterday={targetYesterday}
              today={targetDate}
              isLocked={isEntryReadOnly}
              status={entryStatus}

              onExportAll={handleExportAllSheets}
              totalRows={paginationInfo?.totalCount || p6Activities.length}
              universalFilter={universalFilter}
              projectId={currentProjectId}
              selectedBlock={selectedBlock}
            />
          </>
        );
      case 'testing_commissioning':
        return (
          <>
            {isRejected && rejectionReason && (
              <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
                <div className="flex items-start">
                  <AlertCircle className="h-5 w-5 text-red-500 mt-0.5 mr-2 flex-shrink-0" />
                  <div>
                    <h4 className="text-red-800 font-medium">Entry Rejected by PM</h4>
                    <p className="text-red-700 mt-1">Reason: {rejectionReason}</p>
                    <p className="text-red-600 text-sm mt-2">Please review the feedback and make necessary corrections. You can now edit and resubmit this entry.</p>
                  </div>
                </div>
              </div>
            )}
            <TestingCommTable
              data={testingCommData}
              setData={setTestingCommData}
              onSave={isEntryReadOnly ? undefined : handleSaveEntry}
              onSubmit={isEntryReadOnly ? undefined : handleSubmitEntry}
              yesterday={targetYesterday}
              today={targetDate}
              isLocked={isEntryReadOnly}
              status={entryStatus}
              projectName={projectName}
              onExportAll={handleExportAllSheets}
              totalRows={paginationInfo?.totalCount || p6Activities.length}
              universalFilter={universalFilter}
              projectId={currentProjectId}
              selectedBlock={selectedBlock}
            />
          </>
        );
      case 'supervisor_table':
        return (
          <div className="text-center py-8 text-muted-foreground">
            <Package className="w-16 h-16 mx-auto mb-4" />
            <h3 className="text-xl font-semibold mb-2">Supervisor Table</h3>
            <p>Supervisor-specific data and controls will be shown here.</p>
          </div>
        );
      case 'resource':
        return (
          <ResourceTable
            data={resourceData}
            setData={setResourceData}
            onSave={undefined}
            onSubmit={undefined}
            yesterday={targetYesterday}
            today={targetDate}
            isLocked={isEntryReadOnly}
            status={entryStatus}
            onExportAll={handleExportAllSheets}
            universalFilter={universalFilter}
          />
        );
      case 'issues':
        return (
          <>
            <IssueFormModal
              open={isAddIssueModalOpen}
              onOpenChange={setIsAddIssueModalOpen}
              onSubmit={handleSubmitIssue}
            />
            <IssuesTable issues={issues} onAddIssue={() => setIsAddIssueModalOpen(true)} />
          </>
        );

      // ====================================================================
      // WIND PROJECT SHEETS
      // ====================================================================
      case 'wind_summary':
        return (
          <WindSummaryTable
            data={windSummaryData}
            setData={setWindSummaryData}
            onSave={undefined}
            onSubmit={undefined}
            isLocked={isEntryReadOnly}
            status={entryStatus}
            onExportAll={handleExportAllSheets}
            projectId={currentProjectId}
          />
        );
      case 'wind_progress':
        return (
          <>
            {isRejected && rejectionReason && (
              <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
                <div className="flex items-start">
                  <AlertCircle className="h-5 w-5 text-red-500 mt-0.5 mr-2 flex-shrink-0" />
                  <div>
                    <h4 className="text-red-800 font-medium">Entry Rejected by PM</h4>
                    <p className="text-red-700 mt-1">Reason: {rejectionReason}</p>
                    <p className="text-red-600 text-sm mt-2">Please review the feedback and make necessary corrections.</p>
                  </div>
                </div>
              </div>
            )}
            <WindProgressTable
              data={windProgressData}
              setData={setWindProgressData}
              onSave={undefined}
              onSubmit={undefined}
              yesterday={targetYesterday}
              today={targetDate}
              isLocked={isEntryReadOnly}
              status={entryStatus}
              onExportAll={handleExportAllSheets}
              projectId={currentProjectId}
              selectedSubstation={selectedSubstation}
              selectedSPV={selectedSPV}
              selectedLocation={selectedLocation}
            />
          </>
        );
      case 'wind_manpower':
        return (
          <>
            {isRejected && rejectionReason && (
              <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
                <div className="flex items-start">
                  <AlertCircle className="h-5 w-5 text-red-500 mt-0.5 mr-2 flex-shrink-0" />
                  <div>
                    <h4 className="text-red-800 font-medium">Entry Rejected by PM</h4>
                    <p className="text-red-700 mt-1">Reason: {rejectionReason}</p>
                    <p className="text-red-600 text-sm mt-2">Please review the feedback and make necessary corrections.</p>
                  </div>
                </div>
              </div>
            )}
            <WindManpowerTable
              data={windManpowerData}
              setData={setWindManpowerData}
              onSave={undefined}
              onSubmit={undefined}
              isLocked={isEntryReadOnly}
              status={entryStatus}
              onExportAll={handleExportAllSheets}
              projectId={currentProjectId}
            />
          </>
        );

      // ====================================================================
      // PSS PROJECT SHEETS
      // ====================================================================
      case 'pss_summary':
        return (
          <PSSSummaryTable
            data={pssSummaryData}
            setData={setPssSummaryData}
            onSave={undefined}
            onSubmit={undefined}
            isLocked={isEntryReadOnly}
            status={entryStatus}
            onExportAll={handleExportAllSheets}
            projectId={currentProjectId}
          />
        );
      case 'pss_progress':
        return (
          <>
            {isRejected && rejectionReason && (
              <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
                <div className="flex items-start">
                  <AlertCircle className="h-5 w-5 text-red-500 mt-0.5 mr-2 flex-shrink-0" />
                  <div>
                    <h4 className="text-red-800 font-medium">Entry Rejected by PM</h4>
                    <p className="text-red-700 mt-1">Reason: {rejectionReason}</p>
                    <p className="text-red-600 text-sm mt-2">Please review the feedback and make necessary corrections.</p>
                  </div>
                </div>
              </div>
            )}
            <PSSProgressTable
              data={pssProgressData}
              setData={setPssProgressData}
              onSave={undefined}
              onSubmit={undefined}
              yesterday={targetYesterday}
              today={targetDate}
              isLocked={isEntryReadOnly}
              status={entryStatus}
              onExportAll={handleExportAllSheets}
              projectId={currentProjectId}
            />
          </>
        );
      case 'pss_manpower':
        return (
          <>
            {isRejected && rejectionReason && (
              <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
                <div className="flex items-start">
                  <AlertCircle className="h-5 w-5 text-red-500 mt-0.5 mr-2 flex-shrink-0" />
                  <div>
                    <h4 className="text-red-800 font-medium">Entry Rejected by PM</h4>
                    <p className="text-red-700 mt-1">Reason: {rejectionReason}</p>
                    <p className="text-red-600 text-sm mt-2">Please review the feedback and make necessary corrections.</p>
                  </div>
                </div>
              </div>
            )}
            <PSSManpowerTable
              data={pssManpowerData}
              setData={setPssManpowerData}
              onSave={undefined}
              onSubmit={undefined}
              todayDate={targetDate}
              isLocked={isEntryReadOnly}
              status={entryStatus}
              onExportAll={handleExportAllSheets}
              projectId={currentProjectId}
            />
          </>
        );

      default:
        return (
          <div className="text-center py-8 text-muted-foreground">
            <AlertCircle className="w-16 h-16 mx-auto mb-4" />
            <h3 className="text-xl font-semibold mb-2">Sheet Not Found</h3>
            <p>The requested sheet could not be found.</p>
          </div>
        );
    }
  };


  return (
    <DashboardLayout
      userName={user?.Name || "User"}
      userRole={user?.Role || "supervisor"}
      projectName={projectName}
      projectId={currentProjectId}
      projectP6Id={currentProject?.P6Id || (projectDetails as any)?.P6Id}
    >
      <div className="w-full h-[calc(100vh-120px)] flex flex-col">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-4 sm:mb-6 flex-shrink-0"
        >
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold">Daily Progress Report</h1>
                {/* Date Selector — inline beside title */}
                  <div className="flex items-center gap-2 bg-background border border-border rounded-md px-2 py-1 shadow-sm">
                    <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">Report Date:</span>
                    <input
                      type="date"
                      value={targetDate}
                      onChange={(e) => setTargetDate(e.target.value)}
                      max={today}
                      min={new Date(new Date().setDate(new Date().getDate() - 7)).toISOString().split('T')[0]}
                      className="bg-transparent text-xs border-none outline-none cursor-pointer font-medium"
                    />
                  </div>
              </div>
            </div>
            <div className="flex items-center space-x-2 sm:space-x-3 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
              {/* Project Type & ID Badge */}
              <div className={`flex items-center gap-2 px-2 py-1 text-[12px] font-semibold rounded-md border capitalize shrink-0 ${
                currentProjectType === 'wind' ? 'bg-teal-100 text-teal-700 border-teal-200 dark:bg-teal-900/40 dark:text-teal-300 dark:border-teal-800'
                : currentProjectType === 'pss' ? 'bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-900/40 dark:text-purple-300 dark:border-purple-800'
                : 'bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/40 dark:text-orange-300 dark:border-orange-800'
              }`}>
                <span>{projectTypeConfig.label}</span>
                <span className="opacity-40">|</span>
                <span className="font-mono text-[11px] uppercase tracking-wider">ID: {currentProject?.P6Id || currentProjectId}</span>
              </div>

              {/* SOLAR FILTERS: Activity Filter + Block */}
              {currentProjectType === 'solar' && (
                <>
                  <div className="flex items-center shrink-0">
                    <span className="text-sm font-medium mr-2 whitespace-nowrap hidden lg:block">Activity Filter:</span>
                    <Select 
                      value={universalFilter} 
                      onValueChange={value => setUniversalFilter(value === "ALL" ? "" : value, currentProjectId || undefined)}
                    >
                      <SelectTrigger className="h-9 w-[120px] md:w-[150px] bg-background">
                        <SelectValue placeholder="All" />
                      </SelectTrigger>
                      <SelectContent>
                        {uniquePackages.map(pkg => (
                          <SelectItem key={pkg} value={pkg}>{pkg}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-center shrink-0">
                    <span className="text-sm font-medium mr-2 whitespace-nowrap hidden lg:block">Block:</span>
                    <Select value={selectedBlock} onValueChange={setSelectedBlock}>
                      <SelectTrigger className="h-9 w-[120px] md:w-[150px] bg-background">
                        <SelectValue placeholder="All Blocks" />
                      </SelectTrigger>
                      <SelectContent>
                        {uniqueBlocks.map(block => (
                          <SelectItem key={block} value={block}>
                            {block === "ALL" ? "All Blocks" : block}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}

              {/* WIND FILTERS: Substation + SPV + Location */}
              {currentProjectType === 'wind' && (
                <>
                  <div className="flex items-center shrink-0">
                    <span className="text-sm font-medium mr-2 whitespace-nowrap hidden lg:block">Substation:</span>
                    <Select value={selectedSubstation} onValueChange={setSelectedSubstation}>
                      <SelectTrigger className="h-9 w-[120px] md:w-[140px] bg-background">
                        <SelectValue placeholder="All" />
                      </SelectTrigger>
                      <SelectContent>
                        {uniqueSubstations.map(s => (
                          <SelectItem key={s} value={s}>{s === "ALL" ? "All" : s}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center shrink-0">
                    <span className="text-sm font-medium mr-2 whitespace-nowrap hidden lg:block">SPV:</span>
                    <Select value={selectedSPV} onValueChange={setSelectedSPV}>
                      <SelectTrigger className="h-9 w-[100px] md:w-[130px] bg-background">
                        <SelectValue placeholder="All" />
                      </SelectTrigger>
                      <SelectContent>
                        {uniqueSPVs.map(s => (
                          <SelectItem key={s} value={s}>{s === "ALL" ? "All" : s}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center shrink-0">
                    <span className="text-sm font-medium mr-2 whitespace-nowrap hidden lg:block">Location:</span>
                    <Select value={selectedLocation} onValueChange={setSelectedLocation}>
                      <SelectTrigger className="h-9 w-[120px] md:w-[140px] bg-background">
                        <SelectValue placeholder="All" />
                      </SelectTrigger>
                      <SelectContent>
                        {uniqueLocations.map(s => (
                          <SelectItem key={s} value={s}>{s === "ALL" ? "All" : s}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}

              {/* Project Sync Button — only for Solar */}
              {currentProjectType === 'solar' && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSyncP6}
                  disabled={isSyncing || loadingActivities}
                  className="flex items-center shrink-0"
                >
                  <RefreshCw className={`w-4 h-4 mr-2 ${isSyncing ? 'animate-spin' : ''}`} />
                  {isSyncing ? 'Syncing...' : 'Sync Project'}
                </Button>
              )}

              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate("/projects")}
                className="flex items-center shrink-0"
              >
                <FileSpreadsheet className="w-4 h-4 mr-2" />
                Change Project
              </Button>
            </div>
          </div>

          {/* Progress Bar for Activity Fetching */}
          {(loadingActivities || loadingMore) && (
            <div className="mt-3">
              <div className="flex justify-between items-center mb-1">
                <span className="text-[10px] font-medium text-blue-600 dark:text-blue-400">
                  {loadingActivities ? 'Loading activities...' : 'Fetching more...'}
                </span>
                <span className="text-[10px] font-medium text-blue-600 dark:text-blue-400">
                  {paginationInfo ? `${Math.round((p6Activities.length / (paginationInfo.totalCount || 1)) * 100)}%` : '...'}
                </span>
              </div>
              <div className="w-full bg-gray-200 dark:bg-gray-800 rounded-full h-1.5 overflow-hidden">
                <motion.div
                  className="bg-blue-600 h-full"
                  initial={{ width: 0 }}
                  animate={{
                    width: paginationInfo
                      ? `${Math.min(100, (p6Activities.length / (paginationInfo.totalCount || 1)) * 100)}%`
                      : '30%'
                  }}
                  transition={{ duration: 0.5 }}
                />
              </div>
            </div>
          )}
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="flex-1 min-h-0 flex flex-col"
        >
          <Card className="border-0 shadow-sm p-2 sm:p-4 flex-1 flex flex-col min-h-0">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full flex-1 flex flex-col min-h-0">
              <div className="overflow-x-auto pb-2 flex-shrink-0" style={{ WebkitOverflowScrolling: 'touch' }}>
                <TabsList className="inline-flex w-max min-w-full gap-1 p-1 rounded-lg bg-muted">
                  {/* Config-driven tab rendering */}
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
                </TabsList>
              </div>

              {/* Config-driven TabsContent */}
              {projectTypeConfig.sheets.map(sheet => (
                hasAccessToSheet(sheet.id) && (
                  <TabsContent key={sheet.id} value={sheet.id} className="mt-0 border-0 p-0 pt-4 flex-1 min-h-0 flex-col w-full data-[state=active]:flex">
                    <div className="flex-1 min-h-0 w-full flex flex-col relative">
                      {renderActiveTable()}
                    </div>
                  </TabsContent>
                )
              ))}
            </Tabs>
          </Card>
        </motion.div>
        {/* Edit Reason Modal */}
        {showEditReasonModal && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-background rounded-lg shadow-xl w-full max-w-md overflow-hidden relative"
            >
              <div className="p-4 sm:p-6 pb-2">
                <h2 className="text-lg font-semibold mb-2">Editing Past Entry</h2>
                <p className="text-sm text-muted-foreground mb-4">
                  Please provide a business reason for making modifications to this previously approved sheet.
                </p>
                <div className="mb-4">
                  <textarea
                    className="flex min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    placeholder="Enter reason for modifying past data..."
                    value={editReason}
                    onChange={(e) => setEditReason(e.target.value)}
                  ></textarea>
                </div>
              </div>
              <div className="p-4 sm:px-6 sm:py-4 bg-muted/50 border-t flex justify-end gap-2">
                <Button variant="outline" onClick={() => {
                  setShowEditReasonModal(false);
                  setPendingSubmitAction(null);
                  setEditReason("");
                }}>
                  Cancel
                </Button>
                <Button
                  onClick={() => {
                    if (editReason.trim() === "") {
                      toast.error("Reason is required");
                      return;
                    }
                    if (pendingSubmitAction) {
                      pendingSubmitAction();
                    }
                  }}
                  disabled={editReason.trim() === ""}
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                >
                  Submit Modification
                </Button>
              </div>
            </motion.div>
          </div>
        )}

      </div>
    </DashboardLayout>
  );
};

export default SupervisorDashboard;