import { useState, useEffect, useCallback, useRef } from "react";
import { useInView } from "react-intersection-observer";
import { useLocation, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useAuth } from "@/modules/auth/contexts/AuthContext";
import { useNotification } from "@/modules/auth/contexts/NotificationContext";
import { Button } from "@/components/ui/button";
import { AlertCircle, FileSpreadsheet, Package, User, Save, Send, Plus, Grid3X3, Building, Wrench, RefreshCw } from "lucide-react";
import { getAssignedProjects, getUserProjects } from "@/modules/auth/services/projectService";
import { getDraftEntry, saveDraftEntry, submitEntry, getTodayAndYesterday } from "@/modules/auth/services/dprSupervisorService";
import {
  getP6ActivitiesForProject,
  getP6ActivitiesPaginated,
  mapActivitiesToDPQty,
  mapActivitiesToDPBlock,
  mapActivitiesToDPVendorBlock,
  mapActivitiesToManpowerDetails,
  mapActivitiesToDPVendorIdt,
  mapResourcesToTable,
  P6Activity,
  P6Resource,
  getResources,
  PaginationInfo,
  syncP6Data,
  syncGlobalResources
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
  MmsModuleRfiTable,
  MmsModuleRfiTableWithDynamicColumns,
  IssueFormModal,
  IssuesTable,
  DPRSummarySection
} from "./components";
import { ResourceTable } from "./components/ResourceTable";
import { DashboardLayout } from "@/components/shared/DashboardLayout";

// Define the Issue interface
interface Issue {
  id: string;
  description: string;
  startDate: string;
  finishedDate: string | null;
  delayedDays: number;
  status: "Open" | "In Progress" | "Resolved";
  actionRequired: string;
  remarks: string;
  attachment: File | null;
  attachmentName: string | null;
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
  const { today, yesterday } = getTodayAndYesterday();

  // State for reactive project ID
  const [currentProjectId, setCurrentProjectId] = useState(projectIdFromLocation);

  // P6 Activities state
  const [p6Activities, setP6Activities] = useState<P6Activity[]>([]);
  const [loadingActivities, setLoadingActivities] = useState(false);
  const [isP6DataFetched, setIsP6DataFetched] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  // Pagination state for infinite scroll
  const [currentPage, setCurrentPage] = useState(1);
  const [paginationInfo, setPaginationInfo] = useState<PaginationInfo | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  // Flag to use mock data (for development/testing)
  const useMockData = false; // Set to false to use P6 API data

  // Effect to update state when location changes
  useEffect(() => {
    const locationState = location.state || {};
    const newActiveTab = locationState.activeTab || "summary";
    const newProjectId = locationState.projectId || null;

    // Always update the state when location changes, regardless of current values
    // This ensures that even if the values are the same, we still process the new location state
    setActiveTab(newActiveTab);
    setCurrentProjectId(newProjectId);
  }, [location]);

  // DP Qty state
  const [dpQtyData, setDpQtyData] = useState([
    {
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
    newBlockNom: string;
    priority: string;
    baselinePriority: string;
    contractorName: string;
    scope: string;
    holdDueToWtg: string;
    front: string;
    actual: string;
    completionPercentage: string;
    remarks: string;
    yesterdayValue: string;
    todayValue: string;
    category?: string;
    isCategoryRow?: boolean;
  }

  const [dpVendorBlockData, setDpVendorBlockData] = useState<DPVendorBlockData[]>([
    { activityId: '', activities: '', plot: '', newBlockNom: '', priority: '', baselinePriority: '', contractorName: '', scope: '', holdDueToWtg: '', front: '', actual: '', completionPercentage: '', remarks: '', yesterdayValue: '', todayValue: '' }
  ]);

  // Manpower Details state
  const [manpowerDetailsData, setManpowerDetailsData] = useState([
    { activityId: '', slNo: '', block: '', contractorName: '', activity: '', section: '', yesterdayValue: '', todayValue: '' }
  ]);
  const [totalManpower, setTotalManpower] = useState(0);

  // DP Block state - matches new 18-column schema
  interface DPBlockData {
    activityId: string;
    activities: string;
    blockCapacity: string;
    phase: string;
    block: string;
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
      forecastFinishDate: ''
    }
  ]);


  // DP Vendor IDT state
  interface DPVendorIdtData {
    activityId: string;
    activities: string;
    plot: string;
    newBlockNom: string;
    baselinePriority: string;
    scope: string;
    front: string;
    priority: string;
    contractorName: string;
    remarks: string;
    actual: string;
    completionPercentage: string;
    yesterdayValue?: string; // Optional
    todayValue?: string; // Optional
    category?: string;
    isCategoryRow?: boolean;
  }

  const [dpVendorIdtData, setDpVendorIdtData] = useState<DPVendorIdtData[]>([
    {
      activityId: '',
      activities: '',
      plot: '',
      newBlockNom: '',
      baselinePriority: '',
      scope: '',
      front: '',
      priority: '',
      contractorName: '',
      remarks: '',
      actual: '',
      completionPercentage: '',
      yesterdayValue: undefined, // Number value, not editable (optional)
      todayValue: undefined // Number value, editable (optional)
    }
  ]);

  // MMS & Module RFI state
  const [mmsModuleRfiData, setMmsModuleRfiData] = useState([
    { rfiNo: '', subject: '', module: '', submittedDate: '', responseDate: '', status: '', remarks: '', yesterdayValue: '', todayValue: '' }
  ]);

  // Resource Table state
  const [resourceData, setResourceData] = useState<any[]>([]);
  const [isResourcesFetched, setIsResourcesFetched] = useState(false);

  // Fetch P6 Resources
  const fetchP6Resources = useCallback(async () => {
    if (useMockData || !currentProjectId) return;

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
  }, [currentProjectId, useMockData]);

  // Track if entry is read-only (submitted)
  const [isEntryReadOnly, setIsEntryReadOnly] = useState(false);

  // ============================================================================
  // MERGE UTILITIES: Combine P6 base data with saved user edits
  // ============================================================================

  /**
   * Merges saved draft rows with P6-mapped rows
   * - P6 data provides base structure (activity info, non-editable fields)
   * - Draft data provides user edits (today, yesterday, remarks, etc.)
   * - Matches by activityId and overlays editable fields
   */
  const mergeDraftWithP6Data = <T extends { activityId?: string }>(
    p6Rows: T[],
    draftRows: T[],
    editableFields: (keyof T)[]
  ): T[] => {
    if (!draftRows || draftRows.length === 0) {
      return p6Rows;
    }

    // Create a map of draft rows by activityId for fast lookup
    const draftMap = new Map<string, T>();
    draftRows.forEach(row => {
      if (row.activityId) {
        draftMap.set(row.activityId, row);
      }
    });

    // Merge: overlay editable fields from draft onto P6 rows
    return p6Rows.map(p6Row => {
      if (!p6Row.activityId) return p6Row;

      const draftRow = draftMap.get(p6Row.activityId);
      if (!draftRow) return p6Row;

      // Create merged row: start with P6 data, overlay editable fields from draft
      const merged = { ...p6Row };
      editableFields.forEach(field => {
        if (draftRow[field] !== undefined && draftRow[field] !== '') {
          merged[field] = draftRow[field];
        }
      });

      return merged;
    });
  };

  // Track if entry is read-only (submitted)


  // Initialize data based on sheet type
  // Apply saved draft data by merging with current P6 data
  // This preserves user edits while keeping P6 structure up-to-date
  // CRITICAL: Only merge AFTER P6 data has been loaded to avoid race condition
  useEffect(() => {
    // Skip if using mock data (different flow)
    if (useMockData) return;

    // Skip if P6 data hasn't loaded yet (prevents merging with empty data)
    if (!isP6DataFetched) return;

    if (currentDraftEntry && currentDraftEntry.data_json) {
      const data = typeof currentDraftEntry.data_json === 'string'
        ? JSON.parse(currentDraftEntry.data_json)
        : currentDraftEntry.data_json;

      // Check if entry is read-only (submitted or approved)
      // Rejected entries should be editable
      const isReadOnly = currentDraftEntry.isReadOnly ||
        currentDraftEntry.status === 'submitted_to_pm' ||
        currentDraftEntry.status === 'approved_by_pm';
      setIsEntryReadOnly(isReadOnly);

      // Apply draft data by merging with current state
      // This allows saved edits to persist even when using P6 API data
      if (data.rows && data.rows.length > 0) {
        console.log('Applying draft merge after P6 data loaded for tab:', activeTab);
        switch (activeTab) {
          case 'dp_qty':
            setDpQtyData(prev =>
              mergeDraftWithP6Data(prev, data.rows, ['today', 'yesterday', 'remarks', 'cumulative', 'balance'])
            );
            break;
          case 'dp_vendor_block':
            setDpVendorBlockData(prev =>
              mergeDraftWithP6Data(prev, data.rows, ['todayValue', 'yesterdayValue', 'remarks', 'actual', 'completionPercentage'])
            );
            if (data.totalManpower) setTotalManpower(data.totalManpower);
            break;
          case 'manpower_details':
            setManpowerDetailsData(prev =>
              mergeDraftWithP6Data(prev, data.rows, ['todayValue', 'yesterdayValue'])
            );
            if (data.totalManpower) setTotalManpower(data.totalManpower);
            break;
          case 'dp_block':
            setDpBlockData(prev =>
              mergeDraftWithP6Data(prev, data.rows, ['actualStartDate', 'actualFinishDate', 'forecastStartDate', 'forecastFinishDate'])
            );
            break;
          case 'dp_vendor_idt':
            setDpVendorIdtData(prev =>
              mergeDraftWithP6Data(prev, data.rows, ['todayValue', 'yesterdayValue', 'remarks', 'actual', 'completionPercentage'])
            );
            break;
          case 'mms_module_rfi':
            // For MMS/RFI, just apply draft data directly as it's not P6-based
            if (data.rows) setMmsModuleRfiData(data.rows);
            break;
        }
      }
    } else {
      setIsEntryReadOnly(false);
    }
  }, [currentDraftEntry, activeTab, isP6DataFetched, useMockData]);

  // Fetch data when token, projectId, or activeTab changes
  // Draft entries are ALWAYS needed for the submit workflow, regardless of data source
  useEffect(() => {
    const fetchData = async () => {
      // First, fetch assigned projects
      let projects: any[] = [];
      try {
        projects = await getAssignedProjects();
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

      // Always load/create draft entries for sheet tabs (needed for submit workflow)
      // The draft entry tracks the submission status, separate from where table data comes from
      if (projectIdToUse && activeTab !== 'issues' && activeTab !== 'supervisor_table' && activeTab !== 'summary') {
        try {
          console.log('Loading draft entry for projectId:', projectIdToUse, 'activeTab:', activeTab);
          const draft = await getDraftEntry(projectIdToUse, activeTab);
          console.log('Draft entry loaded:', draft);
          setCurrentDraftEntry(draft);
        } catch (draftError) {
          console.log('Draft entry not available:', draftError);
          setCurrentDraftEntry(null);
        }
      } else {
        // Non-sheet tabs or no project selected
        console.log('No draft entry needed. activeTab:', activeTab, 'projectId:', projectIdToUse);
        setCurrentDraftEntry(null);
      }
    };

    if (token) {
      fetchData();
    }
  }, [token, currentProjectId, activeTab]);

  // Fetch P6 activities when project changes (only when not using mock data)
  // Reset P6 data when project changes
  useEffect(() => {
    setIsP6DataFetched(false);
    setP6Activities([]);
    setLoadingActivities(false);
    setCurrentPage(1);
    setPaginationInfo(null);
  }, [currentProjectId]);

  // Fetch P6 activities function with pagination (Lazy Load)
  const fetchP6Activities = useCallback(async (page: number = 1, append: boolean = false) => {
    if (useMockData || !currentProjectId) {
      return;
    }

    try {
      if (page === 1) {
        setLoadingActivities(true);
      } else {
        setLoadingMore(true);
      }
      console.log(`SupervisorDashboard: Fetching P6 activities for project ${currentProjectId} (page ${page})`);

      // Fetch up to 500 activities per page (increased from 50 to ensure all entries are loaded for save/submit)
      const response = await getP6ActivitiesPaginated(currentProjectId, page, 500);
      const activities = response.activities;

      // Update pagination info
      if (response.pagination) {
        setPaginationInfo(response.pagination);
        setCurrentPage(page);
      }

      // Update main P6 activities state
      setP6Activities(prev => {
        if (append && page > 1) {
          return [...prev, ...activities];
        } else {
          return activities;
        }
      });

      // KEY OPTIMIZATION: Map ONLY the new activities and append to table states
      // This avoids O(N) re-mapping of the entire dataset on every load
      // AND preserves any user edits in existing rows

      if (activities.length > 0) {
        if (append && page > 1) {
          // APPEND MODE: optimize by only mapping new data
          setDpQtyData(prev => [...prev, ...mapActivitiesToDPQty(activities) as any]);
          setDpBlockData(prev => [...prev, ...mapActivitiesToDPBlock(activities) as any]);
          setDpVendorBlockData(prev => [...prev, ...mapActivitiesToDPVendorBlock(activities) as any]);
          setDpVendorIdtData(prev => [...prev, ...mapActivitiesToDPVendorIdt(activities) as any]);
          setManpowerDetailsData(prev => [...prev, ...mapActivitiesToManpowerDetails(activities) as any]);
        } else {
          // REPLACE MODE: fresh load (page 1)
          setDpQtyData(mapActivitiesToDPQty(activities) as any);
          setDpBlockData(mapActivitiesToDPBlock(activities) as any);
          setDpVendorBlockData(mapActivitiesToDPVendorBlock(activities) as any);
          setDpVendorIdtData(mapActivitiesToDPVendorIdt(activities) as any);
          setManpowerDetailsData(mapActivitiesToManpowerDetails(activities) as any);
        }

        if (page === 1) {
          const totalMsg = response.pagination?.totalCount
            ? ` (${response.pagination.totalCount} total)`
            : '';
          toast.success(`Loaded ${activities.length} P6 activities${totalMsg}`);
        }
      } else if (page === 1) {
        console.log('No P6 activities found for project', currentProjectId);
      }

      setIsP6DataFetched(true);
    } catch (error) {
      console.error("Error fetching P6 activities:", error);
      toast.error("Failed to load P6 activities");
    } finally {
      setLoadingActivities(false);
      setLoadingMore(false);
    }
  }, [currentProjectId, useMockData]);

  // Load more activities for infinite scroll
  const loadMoreActivities = useCallback(() => {
    if (paginationInfo?.hasMore && !loadingMore && !loadingActivities) {
      fetchP6Activities(currentPage + 1, true);
    }
  }, [paginationInfo, loadingMore, loadingActivities, currentPage, fetchP6Activities]);



  // Override fetchP6Activities effect to also fetch resources
  useEffect(() => {
    // Include 'summary' tab so data loads on initial page load (summary is the default tab)
    const dataTabs = ['summary', 'dp_qty', 'dp_block', 'dp_vendor_block', 'dp_vendor_idt', 'manpower'];

    if (token && !useMockData && currentProjectId) {
      if (dataTabs.includes(activeTab) && !isP6DataFetched && !loadingActivities) {
        fetchP6Activities(1, false);
      }

      // Fetch resources if on summary tab and not fetched yet
      if (activeTab === 'summary' && !isResourcesFetched) {
        fetchP6Resources();
      }
    }
  }, [activeTab, currentProjectId, token, useMockData, isP6DataFetched, isResourcesFetched, loadingActivities, fetchP6Activities, fetchP6Resources]);

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
    } catch (error) {
      console.error("Sync failed", error);
      toast.error("Sync failed. Check console for details.");
    } finally {
      setIsSyncing(false);
    }
  };


  // Handle entry save
  const handleSaveEntry = async () => {
    if (!currentDraftEntry) return;

    // Don't allow saving if entry is read-only (submitted or approved)
    // Rejected entries should be allowed to be saved
    if (isEntryReadOnly || (currentDraftEntry.status !== 'draft' && currentDraftEntry.status !== 'rejected_by_pm')) {
      toast.error("Cannot save: This entry has been submitted and is read-only");
      return;
    }

    try {
      let dataToSave: any = {};

      switch (activeTab) {
        case 'dp_qty':
          dataToSave = {
            staticHeader: {
              projectInfo: 'PLOT - A-06 135 MW - KHAVDA HYBRID SOLAR PHASE 3 (YEAR 2025-26)',
              reportingDate: today,
              progressDate: yesterday
            },
            rows: dpQtyData
          };
          break;
        case 'dp_vendor_block':
          dataToSave = { rows: dpVendorBlockData };
          break;
        case 'manpower_details':
          dataToSave = { totalManpower, rows: manpowerDetailsData };
          break;
        case 'dp_block':
          dataToSave = { rows: dpBlockData };
          break;
        case 'dp_vendor_idt':
          dataToSave = { rows: dpVendorIdtData };
          break;
        case 'mms_module_rfi':
          dataToSave = { rows: mmsModuleRfiData };
          break;
        default:
          dataToSave = { rows: [] };
      }

      await saveDraftEntry(currentDraftEntry.id, dataToSave);
      toast.success("Entry saved successfully!");
    } catch (error) {
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

    // Don't allow submission if entry is read-only (submitted or approved)
    // Rejected entries should be allowed to be resubmitted
    if (isEntryReadOnly || (currentDraftEntry.status !== 'draft' && currentDraftEntry.status !== 'rejected_by_pm')) {
      toast.error("Cannot submit: This entry has already been submitted");
      return;
    }

    // Save current data before submitting
    await handleSaveEntry();

    try {
      console.log('Submitting entry:', currentDraftEntry.id);
      await submitEntry(currentDraftEntry.id);
      toast.success("Entry submitted to PM successfully!");

      // Reload the draft entry to get a fresh one for this sheet type
      // This creates a new draft after submission
      try {
        const newDraft = await getDraftEntry(currentProjectId, activeTab);
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
      const loadedIssues: Issue[] = response.issues.map((backendIssue: BackendIssue) => ({
        id: backendIssue.id.toString(),
        description: backendIssue.description,
        startDate: backendIssue.created_at?.split('T')[0] || today,
        finishedDate: backendIssue.resolved_at?.split('T')[0] || null,
        delayedDays: 0,
        status: backendIssue.status === 'open' ? 'Open' :
          backendIssue.status === 'in_progress' ? 'In Progress' : 'Resolved',
        actionRequired: backendIssue.title || '',
        remarks: backendIssue.resolution_notes || '',
        attachment: null,
        attachmentName: null,
      }));

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
        'Resolved': 'resolved'
      };

      await createIssue({
        project_id: projectIdNum && !isNaN(projectIdNum) ? projectIdNum : undefined,
        title: formData.actionRequired || formData.description?.substring(0, 100) || 'Issue',
        description: fullDescription,
        issue_type: 'general',
        priority: formData.status === 'Open' ? 'high' : formData.status === 'In Progress' ? 'medium' : 'low',
      });

      // Also add to local state for immediate display
      const issue: Issue = {
        id: Math.random().toString(36).substr(2, 9),
        description: formData.description,
        startDate: formData.startDate,
        finishedDate: formData.finishedDate || null,
        delayedDays,
        status: formData.status,
        actionRequired: formData.actionRequired,
        remarks: formData.remarks,
        attachment: formData.attachment,
        attachmentName: formData.attachment ? formData.attachment.name : null,
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
        status: formData.status,
        actionRequired: formData.actionRequired,
        remarks: formData.remarks,
        attachment: formData.attachment,
        attachmentName: formData.attachment ? formData.attachment.name : null,
      };
      setIssues([...issues, issue]);
      setIsAddIssueModalOpen(false);
    }
  };

  // Load More Trigger component for infinite scroll - auto-triggers when scrolled into view
  const LoadMoreTrigger = () => {
    const { ref, inView } = useInView({
      threshold: 0,
      rootMargin: '100px', // Trigger 100px before element comes into view
    });

    // Auto-load when trigger comes into view
    useEffect(() => {
      if (inView && paginationInfo?.hasMore && !loadingMore && !loadingActivities) {
        loadMoreActivities();
      }
    }, [inView]);

    if (!paginationInfo) {
      return null;
    }

    // Show "All loaded" indicator when all data is loaded
    if (!paginationInfo.hasMore && paginationInfo.totalCount > 0) {
      return (
        <div className="mt-4 p-3 text-center bg-green-50 border border-green-200 rounded-lg">
          <span className="text-green-700 text-sm">
            ✓ All {paginationInfo.totalCount} activities loaded
          </span>
        </div>
      );
    }

    return (
      <div
        ref={ref}
        className="mt-4 p-3 text-center bg-blue-50 border border-blue-200 rounded-lg"
      >
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <span className="text-blue-700 text-sm">
            Showing {p6Activities.length} of {paginationInfo.totalCount} activities
          </span>
          {loadingMore ? (
            <div className="flex items-center text-blue-600">
              <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
              <span className="text-sm">Loading more...</span>
            </div>
          ) : (
            <span className="text-blue-500 text-sm">↓ Scroll to load more</span>
          )}
        </div>
      </div>
    );
  };

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
              onSave={isEntryReadOnly ? undefined : handleSaveEntry}
              onSubmit={isEntryReadOnly ? undefined : handleSubmitEntry}
              yesterday={yesterday}
              today={today}
              isLocked={isEntryReadOnly}
              status={entryStatus}
              useMockData={useMockData}
            />
            <LoadMoreTrigger />
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
              yesterday={yesterday}
              today={today}
              isLocked={isEntryReadOnly}
              status={entryStatus}
              useMockData={useMockData}
            />
            <LoadMoreTrigger />
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
              yesterday={yesterday}
              today={today}
              isLocked={isEntryReadOnly}
              status={entryStatus}
              useMockData={useMockData}
            />
            <LoadMoreTrigger />
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
              onSave={isEntryReadOnly ? undefined : handleSaveEntry}
              onSubmit={isEntryReadOnly ? undefined : handleSubmitEntry}
              yesterday={yesterday}
              today={today}
              isLocked={isEntryReadOnly}
              status={entryStatus}
              useMockData={useMockData}
            />
            <LoadMoreTrigger />
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
              setData={setDpVendorIdtData}
              onSave={isEntryReadOnly ? undefined : handleSaveEntry}
              onSubmit={isEntryReadOnly ? undefined : handleSubmitEntry}
              yesterday={yesterday}
              today={today}
              isLocked={isEntryReadOnly}
              status={entryStatus}
              useMockData={useMockData}
            />
            <LoadMoreTrigger />
          </>
        );
      case 'mms_module_rfi':
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
            {/* Use the new dynamic columns component if we have a project ID and user ID */}
            {currentProjectId && user?.ObjectId ? (
              <MmsModuleRfiTableWithDynamicColumns
                projectId={currentProjectId}
                userId={user.ObjectId}
                yesterday={yesterday}
                today={today}
                isLocked={isEntryReadOnly}
                status={entryStatus}
              />
            ) : (
              /* Fallback to the original component */
              <MmsModuleRfiTable
                data={mmsModuleRfiData}
                setData={setMmsModuleRfiData}
                onSave={isEntryReadOnly ? undefined : handleSaveEntry}
                onSubmit={isEntryReadOnly ? undefined : handleSubmitEntry}
                yesterday={yesterday}
                today={today}
                isLocked={isEntryReadOnly}
                status={entryStatus}
                useMockData={useMockData}
              />
            )}
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
            onSave={isEntryReadOnly ? undefined : handleSaveEntry}
            onSubmit={isEntryReadOnly ? undefined : handleSubmitEntry}
            yesterday={yesterday}
            today={today}
            isLocked={isEntryReadOnly}
            status={entryStatus}
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
    >
      <div className="w-full">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-4 sm:mb-6"
        >
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold">Daily Progress Report</h1>
              <p className="text-xs sm:text-sm text-muted-foreground mt-1">{projectName}</p>
            </div>
            <div className="flex items-center space-x-2">
              {!useMockData && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSyncP6}
                  disabled={isSyncing || loadingActivities}
                  className="flex items-center"
                >
                  <RefreshCw className={`w-4 h-4 mr-2 ${isSyncing ? 'animate-spin' : ''}`} />
                  {isSyncing ? 'Syncing...' : 'Sync P6 Data'}
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate("/projects")}
                className="flex items-center"
              >
                <FileSpreadsheet className="w-4 h-4 mr-2" />
                Change Project
              </Button>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Card className="border-0 shadow-sm p-2 sm:p-4">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <div className="overflow-x-auto pb-2" style={{ WebkitOverflowScrolling: 'touch' }}>
                <TabsList className="inline-flex w-max min-w-full gap-1 p-1 rounded-lg bg-muted">
                  <TabsTrigger value="summary" className="whitespace-nowrap px-3 py-2 text-xs sm:text-sm data-[state=active]:bg-background">
                    Summary
                  </TabsTrigger>
                  <TabsTrigger value="dp_qty" className="whitespace-nowrap px-3 py-2 text-xs sm:text-sm data-[state=active]:bg-background">
                    DP Qty
                  </TabsTrigger>
                  <TabsTrigger value="dp_block" className="whitespace-nowrap px-3 py-2 text-xs sm:text-sm data-[state=active]:bg-background">
                    DP Block
                  </TabsTrigger>
                  <TabsTrigger value="dp_vendor_idt" className="whitespace-nowrap px-3 py-2 text-xs sm:text-sm data-[state=active]:bg-background">
                    Vender IDT
                  </TabsTrigger>
                  <TabsTrigger value="dp_vendor_block" className="whitespace-nowrap px-3 py-2 text-xs sm:text-sm data-[state=active]:bg-background">
                    DP Vendor Block
                  </TabsTrigger>
                  <TabsTrigger value="manpower_details" className="whitespace-nowrap px-3 py-2 text-xs sm:text-sm data-[state=active]:bg-background">
                    Manpower
                  </TabsTrigger>
                  <TabsTrigger value="mms_module_rfi" className="whitespace-nowrap px-3 py-2 text-xs sm:text-sm data-[state=active]:bg-background">
                    MMS & RFI
                  </TabsTrigger>
                  <TabsTrigger value="resource" className="whitespace-nowrap px-3 py-2 text-xs sm:text-sm data-[state=active]:bg-background">
                    Resource
                  </TabsTrigger>
                  <TabsTrigger value="issues" className="whitespace-nowrap px-3 py-2 text-xs sm:text-sm data-[state=active]:bg-background">
                    Issue
                  </TabsTrigger>
                </TabsList>
              </div>

              <TabsContent value="summary" className="mt-0 border-0 p-0 pt-4">
                {renderActiveTable()}
              </TabsContent>
              <TabsContent value="dp_qty" className="mt-0 border-0 p-0 pt-4">
                {renderActiveTable()}
              </TabsContent>
              <TabsContent value="dp_block" className="mt-0 border-0 p-0 pt-4">
                {renderActiveTable()}
              </TabsContent>
              <TabsContent value="dp_vendor_idt" className="mt-0 border-0 p-0 pt-4">
                {renderActiveTable()}
              </TabsContent>
              <TabsContent value="dp_vendor_block" className="mt-0 border-0 p-0 pt-4">
                {renderActiveTable()}
              </TabsContent>
              <TabsContent value="manpower_details" className="mt-0 border-0 p-0 pt-4">
                {renderActiveTable()}
              </TabsContent>
              <TabsContent value="mms_module_rfi" className="mt-0 border-0 p-0 pt-4">
                {renderActiveTable()}
              </TabsContent>
              <TabsContent value="resource" className="mt-0 border-0 p-0 pt-4">
                {renderActiveTable()}
              </TabsContent>
              <TabsContent value="issues" className="mt-0 border-0 p-0 pt-4">
                {renderActiveTable()}
              </TabsContent>
            </Tabs>
          </Card>
        </motion.div>
      </div>
    </DashboardLayout>
  );
};

export default SupervisorDashboard;