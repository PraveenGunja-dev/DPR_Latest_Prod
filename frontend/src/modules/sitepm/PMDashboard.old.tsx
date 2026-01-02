import { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  FileText,
  Check,
  X,
  Edit,
  Clock,
  AlertCircle,
  CheckCircle,
  FileCheck,
  Calendar,
  User,
  Maximize,
  Minimize,
  FileSpreadsheet,
  Grid3X3,
  Wrench,
  Building,
  Package,
  RefreshCw,
  ChevronDown,
  ChevronRight
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, AreaChart, Area } from "recharts";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/modules/auth/contexts/AuthContext";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Navbar } from "@/components/Navbar";
import { StatsCard } from "@/components/StatsCard";
import { StyledExcelTable } from "@/components/StyledExcelTable";
import {
  getEntriesForPMReview,
  approveEntryByPM,
  rejectEntryByPM,
  updateEntryByPM,
  getTodayAndYesterday
} from "@/modules/auth/services/dprSupervisorService";
import { getUserProjects, assignProjectToSupervisor, assignProjectToMultipleSupervisors, assignProjectsToMultipleSupervisors } from "@/modules/auth/services/projectService";
import {
  DPQtyTable,
  DPVendorBlockTable,
  ManpowerDetailsTable,
  DPBlockTable,
  DPVendorIdtTable,
  MmsModuleRfiTable
} from "@/modules/supervisor/components";
import { ChartsSection } from "@/modules/charts";
import { toast } from "sonner";
import { useNotification } from "@/modules/auth/contexts/NotificationContext";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { registerUser } from "@/modules/auth/services/authService";

// Function to format date as YYYY-MM-DD
const formatDate = (dateString: string | null | undefined): string => {
  if (!dateString) return "Not set";
  const date = new Date(dateString);
  return date.toISOString().split('T')[0];
};

const PMDashboard = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { addNotification } = useNotification();

  // Extract project data from location state
  const locationState = location.state || {};
  const projectName = locationState.projectName || "Project";
  const projectId = locationState.projectId || null;
  const projectDetails = locationState.projectDetails || null;

  const [submittedEntries, setSubmittedEntries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('dp_qty');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showCreateSupervisorModal, setShowCreateSupervisorModal] = useState(false);
  const [editingEntry, setEditingEntry] = useState<any>(null);
  const [editData, setEditData] = useState<any>(null);
  const [projects, setProjects] = useState<any[]>([]);
  const [supervisorForm, setSupervisorForm] = useState({
    Name: "",
    Email: "",
    password: "",
    assignProject: false,
    ProjectId: "" as string | number
  });

  // State for multiple supervisor assignment
  const [assignForm, setAssignForm] = useState({
    projectIds: [] as string[],  // Changed to array for multiple projects
    supervisorIds: [] as string[]
  });
  const [showAssignProjectModal, setShowAssignProjectModal] = useState(false);
  const [supervisors, setSupervisors] = useState<any[]>([]);
  const [projectSearchTerm, setProjectSearchTerm] = useState('');
  const [supervisorSearchTerm, setSupervisorSearchTerm] = useState('');

  // State for collapsible entries
  const [expandedEntries, setExpandedEntries] = useState<Record<number, boolean>>({});

  // Note: Site PM can only create supervisors, not other roles
  // This is a business rule enforced in both frontend and backend
  const [supervisorLoading, setSupervisorLoading] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [registeredUser, setRegisteredUser] = useState({
    email: "",
    password: "",
    role: "supervisor", // Site PM can only create supervisors
    projectId: "" as string | number | null,
    projectName: "" as string | null
  });

  // Filter entries by sheet type - ONLY SHOW SUBMITTED ENTRIES
  const getEntriesBySheetType = (sheetType: string) => {
    // Filter by sheet type and status (only submitted_to_pm)
    if (projectId) {
      return submittedEntries.filter(entry =>
        entry.sheet_type === sheetType &&
        entry.project_id === projectId &&
        entry.status === 'submitted_to_pm'  // Only show submitted entries
      );
    } else {
      // If no project specified, show all submitted entries for this sheet type
      return submittedEntries.filter(entry =>
        entry.sheet_type === sheetType &&
        entry.status === 'submitted_to_pm'  // Only show submitted entries
      );
    }
  };

  // Get sheet types with counts
  const sheetTypes = [
    { value: 'dp_qty', label: 'DP Qty', icon: FileSpreadsheet },
    { value: 'dp_block', label: 'DP Block', icon: Grid3X3 },
    { value: 'dp_vendor_idt', label: 'DP Vendor IDT', icon: Wrench },
    { value: 'mms_module_rfi', label: 'MMS & Module RFI', icon: Building },
    { value: 'dp_vendor_block', label: 'DP Vendor Block', icon: Package },
    { value: 'manpower_details', label: 'Manpower Details', icon: User },
  ];

  // Function to fetch entries
  const fetchEntries = async () => {
    try {
      setLoading(true);
      console.log('PM Dashboard: Fetching entries for project:', projectId);
      console.log('PM Dashboard: User info:', user);
      console.log('PM Dashboard: projectId type:', typeof projectId, 'projectId value:', projectId);
      const entries = await getEntriesForPMReview(projectId);
      console.log('PM Dashboard: Received entries:', entries.length, entries);
      setSubmittedEntries(entries);
    } catch (error: any) {
      console.error('Error fetching entries:', error);
      console.error('Error details:', error.response?.data || error.message);
      toast.error(error.response?.data?.message || "Failed to load submitted sheets");
    } finally {
      setLoading(false);
    }
  };

  // Handle approve entry
  const handleApprove = async (entryId: number) => {
    try {
      await approveEntryByPM(entryId);

      // Find the entry that was approved to get details for notification
      const entry = submittedEntries.find(e => e.id === entryId);
      if (entry) {
        // Add notification for successful approval
        addNotification({
          title: "Sheet Approved",
          message: `The ${entry.sheet_type.replace(/_/g, ' ')} sheet from ${entry.supervisor_name || 'a supervisor'} has been approved and sent to PMAG for final review.`,
          type: "success",
          userId: user?.ObjectId,
          projectId: entry.project_id,
          entryId: entry.id,
          sheetType: entry.sheet_type // Add sheetType for navigation
        });
      }

      toast.success("Entry approved successfully!");
      // Refresh entries
      await fetchEntries();
    } catch (error) {
      console.error(`Failed to approve entry ${entryId}:`, error);
      toast.error(`Failed to approve entry: ${(error as Error).message || 'Unknown error'}`);
    }
  };

  // Handle edit entry
  const handleEditEntry = (entry: any) => {
    const entryData = typeof entry.data_json === 'string' ? JSON.parse(entry.data_json) : entry.data_json;
    setEditingEntry(entry);
    setEditData(entryData);
  };

  // Handle save edited entry
  const handleSaveEdit = async () => {
    if (!editingEntry || !editData) return;

    try {
      await updateEntryByPM(editingEntry.id, editData);
      toast.success("Entry updated successfully");
      setEditingEntry(null);
      setEditData(null);
      await fetchEntries();
    } catch (error) {
      console.error(`Failed to update entry ${editingEntry?.id}:`, error);
      toast.error(`Failed to update entry: ${(error as Error).message || 'Unknown error'}`);
    }
  };

  // Handle reject entry
  const handleReject = async (entryId: number) => {
    try {
      await rejectEntryByPM(entryId);

      // Find the entry that was rejected to get details for notification
      const entry = submittedEntries.find(e => e.id === entryId);
      if (entry) {
        // Add notification for rejection
        addNotification({
          title: "Sheet Rejected",
          message: `The ${entry.sheet_type.replace(/_/g, ' ')} sheet from ${entry.supervisor_name || 'a supervisor'} has been rejected and sent back for revision.`,
          type: "warning",
          userId: user?.ObjectId,
          projectId: entry.project_id,
          entryId: entry.id,
          sheetType: entry.sheet_type // Add sheetType for navigation
        });
      }

      toast.success("Entry rejected and sent back to supervisor");
      // Refresh entries
      await fetchEntries();
    } catch (error) {
      console.error(`Failed to reject entry ${entryId}:`, error);
      toast.error(`Failed to reject entry: ${(error as Error).message || 'Unknown error'}`);
    }
  };

  // Fetch submitted entries from supervisors
  useEffect(() => {
    console.log('PM Dashboard useEffect triggered - projectId:', projectId, 'user:', user);
    if (user && user.Role === 'Site PM') {
      // Always fetch entries - if no projectId, get all entries
      fetchEntries();
    } else {
      console.log('Not fetching - user not PM or not logged in');
    }
  }, [projectId, user]);

  // Fetch projects and supervisors for the PM
  useEffect(() => {
    const fetchData = async () => {
      try {
        const projectsData = await getUserProjects();
        setProjects(projectsData);

        // Fetch all supervisors for assignment
        try {
          const response = await fetch('/api/users/supervisors');
          if (response.ok) {
            const supervisorsData = await response.json();
            console.log('Supervisors fetched:', supervisorsData);
            setSupervisors(supervisorsData);
          } else {
            console.error('Failed to fetch supervisors:', response.status);
            toast.error('Failed to fetch supervisors');
          }
        } catch (error) {
          console.error('Error fetching supervisors:', error);
          toast.error('Error fetching supervisors');
        }
      } catch (error) {
        console.error("Failed to fetch data:", error);
        toast.error("Failed to fetch data");
      }
    };

    if (user && user.Role === 'Site PM') {
      fetchData();
    }
  }, [user]);

  // Handle tab change with auto-refresh
  const handleTabChange = (value: string) => {
    setActiveTab(value);
    // Auto-refresh when switching tabs
    fetchEntries();
  };

  // Handle update entry
  const handleUpdateEntry = async (entryId: number, data: any) => {
    try {
      await updateEntryByPM(entryId, data);
      toast.success("Entry updated successfully");
      await fetchEntries();
    } catch (error) {
      console.error(`Failed to update entry ${entryId}:`, error);
      toast.error(`Failed to update entry: ${(error as Error).message || 'Unknown error'}`);
    }
  };

  // Handle save entry
  const handleSaveEntry = async (entryId: number, data: any) => {
    try {
      await updateEntryByPM(entryId, data);
      toast.success("Entry saved successfully");
      await fetchEntries();
    } catch (error) {
      console.error(`Failed to save entry ${entryId}:`, error);
      toast.error(`Failed to save entry: ${(error as Error).message || 'Unknown error'}`);
    }
  };

  // Toggle fullscreen mode
  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
  };

  // Close fullscreen mode
  const closeFullscreen = () => {
    setIsFullscreen(false);
  };

  // Render sheet entries for a specific sheet type
  const renderSheetEntries = (sheetType: string) => {
    const entries = getEntriesBySheetType(sheetType);

    if (entries.length === 0) {
      return (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3 }}
          className="text-center py-8 text-muted-foreground"
        >
          <FileText className="mx-auto h-12 w-12 opacity-50" />
          <p className="mt-2">No {sheetType.replace(/_/g, ' ')} sheets submitted yet</p>
        </motion.div>
      );
    }

    // Get selected entries for this sheet type
    // Removed bulk selection state and related functions

    // Toggle entry expansion
    const toggleEntryExpansion = (entryId: number) => {
      setExpandedEntries(prev => ({
        ...prev,
        [entryId]: !prev[entryId]
      }));
    };

    return (
      <div className="space-y-4">
        {/* Removed Bulk Actions Toolbar */}

        {entries.map((entry, entryIndex) => {
          const entryData = typeof entry.data_json === 'string' ? JSON.parse(entry.data_json) : entry.data_json;
          const { today, yesterday } = getTodayAndYesterday();

          // Determine if entry is locked (submitted or approved)
          const isLocked = entry.status !== 'submitted_to_pm';

          // Check if entry is expanded
          const isExpanded = expandedEntries[entry.id] || false;

          return (
            <motion.div
              key={entry.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: entryIndex * 0.1 }}
              className="border rounded-lg shadow-sm hover:shadow-md transition-shadow duration-200 bg-white dark:bg-gray-800"
            >
              {/* Collapsible Entry Header */}
              <motion.div
                className="flex flex-col md:flex-row md:items-center justify-between p-3 cursor-pointer"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: entryIndex * 0.1 + 0.1 }}
                onClick={() => toggleEntryExpansion(entry.id)}
              >
                <div className="flex items-start space-x-3 w-full">
                  {/* Removed checkbox input */}
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between">
                      <div className="flex items-center space-x-2">
                        <span className="font-semibold">Entry #{entry.id}</span>
                        <Badge
                          variant={
                            entry.status === "submitted_to_pm" ? "secondary" :
                              entry.status === "approved_by_pm" ? "default" :
                                "destructive"
                          }
                          className="px-2 py-0.5 text-xs font-medium"
                        >
                          {entry.status === "submitted_to_pm" ? "Pending" :
                            entry.status === "approved_by_pm" ? "Approved" :
                              "Rejected"}
                        </Badge>
                      </div>
                      <span className="text-xs text-muted-foreground mt-1 md:mt-0">
                        {new Date(entry.submitted_at).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="flex flex-col md:flex-row md:items-center md:space-x-4 mt-1">
                      <span className="text-sm text-muted-foreground truncate">
                        {entry.supervisor_name || 'Supervisor'} ({entry.supervisor_email})
                      </span>
                      <span className="text-xs font-medium text-primary hidden md:block">
                        Project ID: {entry.project_id}
                      </span>
                      <span className="text-xs text-muted-foreground mt-1 md:mt-0">
                        {sheetType.replace(/_/g, ' ')}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2 flex-shrink-0">
                    {entry.status === "submitted_to_pm" && (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleEditEntry(entry);
                          }}
                          className="transition-colors duration-200 px-2 py-1 h-7"
                        >
                          <Edit className="w-3 h-3" />
                        </Button>
                        <Button
                          size="sm"
                          variant="default"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleApprove(entry.id);
                          }}
                          className="bg-green-600 hover:bg-green-700 transition-colors duration-200 px-2 py-1 h-7"
                        >
                          <Check className="w-3 h-3" />
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleReject(entry.id);
                          }}
                          className="transition-colors duration-200 px-2 py-1 h-7"
                        >
                          <X className="w-3 h-3" />
                        </Button>
                      </>
                    )}
                    {entry.status === "approved_by_pm" && (
                      <Badge variant="outline" className="text-green-600 border-green-600 px-2 py-0.5 text-xs font-medium">
                        <CheckCircle className="w-3 h-3 mr-1" />
                        Sent to PMAG
                      </Badge>
                    )}
                    {isExpanded ? (
                      <ChevronDown className="w-5 h-5 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="w-5 h-5 text-muted-foreground" />
                    )}
                  </div>
                </div>
              </motion.div>

              {/* Expanded Content */}
              <AnimatePresence>
                {isExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.3 }}
                    className="overflow-hidden border-t border-gray-200 dark:border-gray-700"
                  >
                    <div className="p-3 bg-gray-50 dark:bg-gray-700">
                      {/* Sheet Information */}
                      {entryData?.staticHeader && (
                        <div className="bg-blue-50 dark:bg-blue-900/30 p-3 rounded mb-3 border border-blue-100 dark:border-blue-800">
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                            <p className="text-sm"><strong>Project:</strong> {entryData.staticHeader.projectInfo}</p>
                            <p className="text-sm"><strong>Reporting Date:</strong> {entryData.staticHeader.reportingDate}</p>
                            <p className="text-sm"><strong>Progress Date:</strong> {entryData.staticHeader.progressDate}</p>
                          </div>
                        </div>
                      )}

                      {/* Data Table - Using the same components as Supervisor Dashboard */}
                      {entryData?.rows && entryData.rows.length > 0 && (
                        <div className="mb-3">
                          <div className={isFullscreen ? 'overflow-auto max-h-[calc(100vh-120px)]' : ''}>
                            {/* Render the appropriate table component based on sheet type */}
                            {sheetType === 'dp_qty' && (
                              <DPQtyTable
                                data={entryData.rows}
                                setData={(data) => handleUpdateEntry(entry.id, { ...entryData, rows: data })}
                                onSave={() => handleSaveEntry(entry.id, entryData)}
                                onSubmit={() => handleSaveEntry(entry.id, entryData)}
                                yesterday={entryData.staticHeader?.progressDate || yesterday}
                                today={entryData.staticHeader?.reportingDate || today}
                                isLocked={isLocked}
                                status={entry.status}
                                useMockData={false}
                              />
                            )}

                            {sheetType === 'dp_block' && (
                              <DPBlockTable
                                data={entryData.rows}
                                setData={(data) => handleUpdateEntry(entry.id, { ...entryData, rows: data })}
                                onSave={() => handleSaveEntry(entry.id, entryData)}
                                onSubmit={() => handleSaveEntry(entry.id, entryData)}
                                yesterday={entryData.staticHeader?.progressDate || yesterday}
                                today={entryData.staticHeader?.reportingDate || today}
                                isLocked={isLocked}
                                status={entry.status}
                                useMockData={false}
                              />
                            )}

                            {sheetType === 'dp_vendor_idt' && (
                              <DPVendorIdtTable
                                data={entryData.rows}
                                setData={(data) => handleUpdateEntry(entry.id, { ...entryData, rows: data })}
                                onSave={() => handleSaveEntry(entry.id, entryData)}
                                onSubmit={() => handleSaveEntry(entry.id, entryData)}
                                yesterday={entryData.staticHeader?.progressDate || yesterday}
                                today={entryData.staticHeader?.reportingDate || today}
                                isLocked={isLocked}
                                status={entry.status}
                                useMockData={false}
                              />
                            )}

                            {sheetType === 'dp_vendor_block' && (
                              <DPVendorBlockTable
                                data={entryData.rows}
                                setData={(data) => handleUpdateEntry(entry.id, { ...entryData, rows: data })}
                                onSave={() => handleSaveEntry(entry.id, entryData)}
                                onSubmit={() => handleSaveEntry(entry.id, entryData)}
                                yesterday={entryData.staticHeader?.progressDate || yesterday}
                                today={entryData.staticHeader?.reportingDate || today}
                                isLocked={isLocked}
                                status={entry.status}
                                useMockData={false}
                              />
                            )}

                            {sheetType === 'manpower_details' && (
                              <ManpowerDetailsTable
                                data={entryData.rows}
                                setData={(data) => handleUpdateEntry(entry.id, { ...entryData, rows: data })}
                                totalManpower={entryData.totalManpower || 0}
                                setTotalManpower={(total) => handleUpdateEntry(entry.id, { ...entryData, totalManpower: total })}
                                onSave={() => handleSaveEntry(entry.id, entryData)}
                                onSubmit={() => handleSaveEntry(entry.id, entryData)}
                                yesterday={entryData.staticHeader?.progressDate || yesterday}
                                today={entryData.staticHeader?.reportingDate || today}
                                isLocked={isLocked}
                                status={entry.status}
                                useMockData={false}
                              />
                            )}

                            {sheetType === 'mms_module_rfi' && (
                              <MmsModuleRfiTable
                                data={entryData.rows}
                                setData={(data) => handleUpdateEntry(entry.id, { ...entryData, rows: data })}
                                onSave={() => handleSaveEntry(entry.id, entryData)}
                                onSubmit={() => handleSaveEntry(entry.id, entryData)}
                                yesterday={entryData.staticHeader?.progressDate || yesterday}
                                today={entryData.staticHeader?.reportingDate || today}
                                isLocked={isLocked}
                                status={entry.status}
                                useMockData={false}
                              />
                            )}

                            {/* Fallback for unknown sheet types */}
                            {!['dp_qty', 'dp_block', 'dp_vendor_idt', 'dp_vendor_block', 'manpower_details', 'mms_module_rfi'].includes(sheetType) && (
                              <div className="overflow-x-auto">
                                <table className="w-full border-collapse min-w-full">
                                  <thead>
                                    <tr className="bg-gray-100 sticky top-0 z-10">
                                      {Object.keys(entryData.rows[0]).map((key) => (
                                        <th key={key} className="border border-gray-300 p-2 text-left text-xs font-semibold whitespace-nowrap bg-gray-50">
                                          {key.replace(/([A-Z])/g, ' $1').trim().toUpperCase()}
                                        </th>
                                      ))}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {entryData.rows.map((row: any, rowIndex: number) => (
                                      <motion.tr
                                        key={rowIndex}
                                        className="hover:bg-gray-50 transition-colors duration-150 border-b border-gray-100"
                                        initial={{ opacity: 0, x: -5 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ delay: entryIndex * 0.1 + 0.4 + rowIndex * 0.05 }}
                                        whileHover={{ backgroundColor: '#f9fafb' }}
                                      >
                                        {Object.values(row).map((value: any, colIndex: number) => (
                                          <td key={`${rowIndex}-${colIndex}`} className="border border-gray-300 p-2 text-sm align-top">
                                            {value || '-'}
                                          </td>
                                        ))}
                                      </motion.tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>

                          {entryData.rows.length > 50 && (
                            <div className="mt-2 text-right">
                              <Button
                                onClick={toggleFullscreen}
                                variant="outline"
                                size="sm"
                                className="text-xs"
                              >
                                <Maximize className="w-3 h-3 mr-1" />
                                View Fullscreen ({entryData.rows.length} rows)
                              </Button>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Total Manpower (if applicable) */}
                      {entryData?.totalManpower !== undefined && (
                        <div className="p-3 bg-green-50 rounded border border-green-200">
                          <p className="text-sm font-semibold">Total Manpower: {entryData.totalManpower}</p>
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          );
        })}
      </div>
    );
  };

  // Render fullscreen overlay
  const renderFullscreenOverlay = () => {
    if (!isFullscreen) return null;

    // Find the currently expanded entry
    const expandedEntryId = Object.keys(expandedEntries).find(id => expandedEntries[Number(id)]);
    if (!expandedEntryId) return null;

    const entry = submittedEntries.find(e => e.id === Number(expandedEntryId));
    if (!entry) return null;

    const entryData = typeof entry.data_json === 'string' ? JSON.parse(entry.data_json) : entry.data_json;
    const { today, yesterday } = getTodayAndYesterday();
    const isLocked = entry.status !== 'submitted_to_pm';

    return (
      <div className="fixed inset-0 z-50 bg-white dark:bg-gray-900 p-4 md:p-6 overflow-auto">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 p-2 border-b dark:border-gray-700">
          <h3 className="text-lg font-semibold">Fullscreen View - Entry #{entry.id}</h3>
          <Button
            onClick={closeFullscreen}
            variant="outline"
            size="sm"
          >
            <Minimize className="w-4 h-4 mr-1" />
            Exit Fullscreen
          </Button>
        </div>

        <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg mb-4 border dark:border-gray-700">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-sm font-medium">Entry ID</p>
              <p className="text-sm">#{entry.id}</p>
            </div>
            <div>
              <p className="text-sm font-medium">Submitted By</p>
              <p className="text-sm">{entry.supervisor_name || 'Supervisor'} ({entry.supervisor_email})</p>
            </div>
            <div>
              <p className="text-sm font-medium">Submitted At</p>
              <p className="text-sm">{new Date(entry.submitted_at).toLocaleString()}</p>
            </div>
            <div>
              <p className="text-sm font-medium">Sheet Type</p>
              <p className="text-sm">{entry.sheet_type.replace(/_/g, ' ')}</p>
            </div>
          </div>
        </div>

        {entryData?.staticHeader && (
          <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg mb-4 border border-blue-100 dark:border-blue-800">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              <div>
                <p className="text-sm font-medium">Project</p>
                <p className="text-sm">{entryData.staticHeader.projectInfo}</p>
              </div>
              <div>
                <p className="text-sm font-medium">Reporting Date</p>
                <p className="text-sm">{entryData.staticHeader.reportingDate}</p>
              </div>
              <div>
                <p className="text-sm font-medium">Progress Date</p>
                <p className="text-sm">{entryData.staticHeader.progressDate}</p>
              </div>
            </div>
          </div>
        )}

        {entryData?.rows && entryData.rows.length > 0 && (
          <div className="overflow-auto max-h-[calc(100vh-300px)]">
            {activeTab === 'dp_qty' && (
              <DPQtyTable
                data={entryData.rows}
                setData={(data) => handleUpdateEntry(entry.id, { ...entryData, rows: data })}
                onSave={() => handleSaveEntry(entry.id, entryData)}
                onSubmit={() => handleSaveEntry(entry.id, entryData)}
                yesterday={entryData.staticHeader?.progressDate || yesterday}
                today={entryData.staticHeader?.reportingDate || today}
                isLocked={isLocked}
                status={entry.status}
                useMockData={false}
              />
            )}

            {activeTab === 'dp_block' && (
              <DPBlockTable
                data={entryData.rows}
                setData={(data) => handleUpdateEntry(entry.id, { ...entryData, rows: data })}
                onSave={() => handleSaveEntry(entry.id, entryData)}
                onSubmit={() => handleSaveEntry(entry.id, entryData)}
                yesterday={entryData.staticHeader?.progressDate || yesterday}
                today={entryData.staticHeader?.reportingDate || today}
                isLocked={isLocked}
                status={entry.status}
                useMockData={false}
              />
            )}

            {activeTab === 'dp_vendor_idt' && (
              <DPVendorIdtTable
                data={entryData.rows}
                setData={(data) => handleUpdateEntry(entry.id, { ...entryData, rows: data })}
                onSave={() => handleSaveEntry(entry.id, entryData)}
                onSubmit={() => handleSaveEntry(entry.id, entryData)}
                yesterday={entryData.staticHeader?.progressDate || yesterday}
                today={entryData.staticHeader?.reportingDate || today}
                isLocked={isLocked}
                status={entry.status}
                useMockData={false}
              />
            )}

            {activeTab === 'dp_vendor_block' && (
              <DPVendorBlockTable
                data={entryData.rows}
                setData={(data) => handleUpdateEntry(entry.id, { ...entryData, rows: data })}
                onSave={() => handleSaveEntry(entry.id, entryData)}
                onSubmit={() => handleSaveEntry(entry.id, entryData)}
                yesterday={entryData.staticHeader?.progressDate || yesterday}
                today={entryData.staticHeader?.reportingDate || today}
                isLocked={isLocked}
                status={entry.status}
                useMockData={false}
              />
            )}

            {activeTab === 'manpower_details' && (
              <ManpowerDetailsTable
                data={entryData.rows}
                setData={(data) => handleUpdateEntry(entry.id, { ...entryData, rows: data })}
                totalManpower={entryData.totalManpower || 0}
                setTotalManpower={(total) => handleUpdateEntry(entry.id, { ...entryData, totalManpower: total })}
                onSave={() => handleSaveEntry(entry.id, entryData)}
                onSubmit={() => handleSaveEntry(entry.id, entryData)}
                yesterday={entryData.staticHeader?.progressDate || yesterday}
                today={entryData.staticHeader?.reportingDate || today}
                isLocked={isLocked}
                status={entry.status}
                useMockData={false}
              />
            )}

            {activeTab === 'mms_module_rfi' && (
              <MmsModuleRfiTable
                data={entryData.rows}
                setData={(data) => handleUpdateEntry(entry.id, { ...entryData, rows: data })}
                onSave={() => handleSaveEntry(entry.id, entryData)}
                onSubmit={() => handleSaveEntry(entry.id, entryData)}
                yesterday={entryData.staticHeader?.progressDate || yesterday}
                today={entryData.staticHeader?.reportingDate || today}
                isLocked={isLocked}
                status={entry.status}
                useMockData={false}
              />
            )}
          </div>
        )}
      </div>
    );
  };

  const statsData = [
    { title: "Total Sheets", value: submittedEntries.length, icon: FileText, trend: { value: 12, isPositive: true } },
    { title: "Reviewed", value: submittedEntries.filter(e => e.status === 'approved_by_pm').length, icon: CheckCircle, trend: { value: 8, isPositive: true } },
    { title: "Pending", value: submittedEntries.filter(e => e.status === 'submitted_to_pm').length, icon: Clock, trend: { value: 3, isPositive: false } },
    { title: "Revisions", value: submittedEntries.filter(e => e.status === 'rejected_by_pm').length, icon: AlertCircle, trend: { value: 2, isPositive: true } },
  ];

  const weeklyData = [
    { week: "Week 1", sheets: 32 },
    { week: "Week 2", sheets: 45 },
    { week: "Week 3", sheets: 38 },
    { week: "Week 4", sheets: 41 },
  ];

  const categoryData = [
    { name: "Labor", value: 35 },
    { name: "Materials", value: 28 },
    { name: "Equipment", value: 22 },
    { name: "Others", value: 15 },
  ];

  // Project progress data
  const projectProgressData = [
    { name: "Project A", progress: 75 },
    { name: "Project B", progress: 45 },
    { name: "Project C", progress: 90 },
    { name: "Project D", progress: 30 },
    { name: "Project E", progress: 65 },
  ];

  // Submission trend data
  const submissionTrendData = [
    { date: "2024-01", submissions: 12 },
    { date: "2024-02", submissions: 19 },
    { date: "2024-03", submissions: 15 },
    { date: "2024-04", submissions: 22 },
    { date: "2024-05", submissions: 18 },
    { date: "2024-06", submissions: 25 },
  ];

  const COLORS = ["hsl(var(--primary))", "hsl(var(--secondary))", "hsl(var(--accent))", "hsl(var(--muted))"];

  const handleCreateSupervisor = () => {
    setShowCreateSupervisorModal(true);
  };

  const handleSupervisorFormChange = (field: string, value: string | boolean) => {
    setSupervisorForm(prev => ({
      ...prev,
      [field]: value
    }));
  };

  // Handle assign form change
  const handleAssignFormChange = (field: string, value: string | string[]) => {
    setAssignForm(prev => ({
      ...prev,
      [field]: value
    }));
  };

  // Handle supervisor selection toggle
  const toggleSupervisorSelection = (supervisorId: string) => {
    setAssignForm(prev => {
      const currentIds = [...prev.supervisorIds];
      const index = currentIds.indexOf(supervisorId);

      if (index >= 0) {
        // Remove if already selected
        currentIds.splice(index, 1);
      } else {
        // Add if not selected
        currentIds.push(supervisorId);
      }

      return {
        ...prev,
        supervisorIds: currentIds
      };
    });
  };

  // Handle project selection toggle
  const toggleProjectSelection = (projectId: string) => {
    setAssignForm(prev => {
      const currentIds = [...prev.projectIds];
      const index = currentIds.indexOf(projectId);

      if (index >= 0) {
        // Remove if already selected
        currentIds.splice(index, 1);
      } else {
        // Add if not selected
        currentIds.push(projectId);
      }

      return {
        ...prev,
        projectIds: currentIds
      };
    });
  };

  const handleSupervisorSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSupervisorLoading(true);

    try {
      // First create the supervisor - Site PM can only create supervisors
      const userData: Omit<import('@/modules/auth/services/authService').User, 'ObjectId'> = {
        Name: supervisorForm.Name,
        Email: supervisorForm.Email,
        password: supervisorForm.password,
        Role: "supervisor"  // Hardcoded - Site PM can only create supervisors
      };

      const registeredUserResponse = await registerUser(userData);

      // If assignProject is checked and a project is selected, assign the project
      // This is the project assignment functionality for Site PM when creating supervisors
      let assignedProjectId = null;
      let assignedProjectName = null;
      if (supervisorForm.assignProject && supervisorForm.ProjectId) {
        try {
          // Ensure we're passing numbers to the API
          const projectId = parseInt(supervisorForm.ProjectId.toString());
          const supervisorId = registeredUserResponse.user.ObjectId;

          console.log('Assigning project:', { projectId, supervisorId });

          await assignProjectToSupervisor(projectId, supervisorId);

          // Store the project ID and name for display
          assignedProjectId = supervisorForm.ProjectId;
          assignedProjectName = projects.find(p => p.ObjectId == supervisorForm.ProjectId || p.id == supervisorForm.ProjectId)?.Name || "Unknown Project";

          toast.success(`Supervisor created and project assigned successfully!`);
        } catch (assignError) {
          console.error('Project assignment error:', assignError);
          toast.warning(`Supervisor created but project assignment failed: ${(assignError as Error).message}`);
        }
      } else {
        toast.success("Supervisor created successfully!");
      }

      // Show success modal with user details
      setRegisteredUser({
        email: supervisorForm.Email,
        password: supervisorForm.password,
        role: "supervisor",
        projectId: assignedProjectId,
        projectName: assignedProjectName
      });
      setShowSuccessModal(true);
      setShowCreateSupervisorModal(false);

      // Reset form
      setSupervisorForm({
        Name: "",
        Email: "",
        password: "",
        assignProject: false,
        ProjectId: ""
      });
    } catch (err) {
      console.error('Supervisor creation error:', err);
      toast.error(err instanceof Error ? err.message : 'Supervisor creation failed');
    } finally {
      setSupervisorLoading(false);
    }
  };

  const handleAssignSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      // Assign project to multiple supervisors using the new API endpoint
      await assignProjectsToMultipleSupervisors(
        assignForm.projectIds.map(id => parseInt(id)),
        assignForm.supervisorIds.map(id => parseInt(id))
      );

      toast.success("Project assigned to selected users successfully!");
      setShowAssignProjectModal(false);

      // Reset form and search terms
      setAssignForm({
        projectIds: [],
        supervisorIds: []
      });
      setProjectSearchTerm('');
      setSupervisorSearchTerm('');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Project assignment failed');
    }
  };

  // Reset registered user state when closing the success modal
  const handleSuccessModalClose = () => {
    setShowSuccessModal(false);
    setRegisteredUser({
      email: '',
      password: '',
      role: 'supervisor',
      projectId: null,
      projectName: null
    });
  };

  // Function to handle assignment form reset
  const handleAssignFormReset = () => {
    setAssignForm({
      projectIds: [],
      supervisorIds: []
    });
    // Reset search terms
    setProjectSearchTerm('');
    setSupervisorSearchTerm('');
  };

  return (
    <motion.div
      className="min-h-screen bg-background"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      <Navbar
        userName={user?.Name || "User"}
        userRole={user?.Role || "Site PM"}
        projectName={projectName}
        onAddUser={handleCreateSupervisor}
        onAssignProject={() => setShowAssignProjectModal(true)}
      />

      <div className="container mx-auto px-4 py-8">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-8"
        >
          <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
            <div>
              <motion.h1
                className="text-3xl md:text-4xl font-bold mb-2 bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.1 }}
              >
                Site PM Dashboard
              </motion.h1>
              <motion.p
                className="text-muted-foreground"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.2 }}
              >
                {projectName ? `Project: ${projectName}` : "Project dashboard for project management"}
              </motion.p>
              {projectDetails && (
                <motion.div
                  className="mt-2 text-sm text-muted-foreground"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.3 }}
                >
                  <p>Plan: {formatDate(projectDetails.PlannedStartDate)} to {formatDate(projectDetails.PlannedFinishDate)}</p>
                  <p>Actual: {formatDate(projectDetails.ActualStartDate) || "Not started"} to {formatDate(projectDetails.ActualFinishDate) || "Not completed"}</p>
                </motion.div>
              )}
            </div>
            <motion.div
              className="flex items-center space-x-4"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2 }}
            >
            </motion.div>
          </div>
        </motion.div>

        {/* Stats Cards */}
        <motion.div
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5 }}
        >
          {statsData.map((stat, index) => (
            <motion.div
              key={stat.title}
              initial={{ opacity: 0, y: 20, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ delay: 0.1 * index, type: "spring", stiffness: 100 }}
              whileHover={{ y: -5, transition: { duration: 0.2 } }}
            >
              <StatsCard {...stat} />
            </motion.div>
          ))}
        </motion.div>

        {/* Review Queue - Submitted Sheets with Tabs */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="mb-8"
          whileHover={{ y: -2 }}
        >
          <Card className="p-6 shadow-md hover:shadow-lg transition-shadow duration-300 rounded-xl">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-xl font-bold">Submitted Sheets - Review Queue</h3>
                {projectId ? (
                  <p className="text-sm text-muted-foreground mt-1">
                    Viewing submissions for Project ID: {projectId}
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground mt-1">
                    Viewing all submissions from all projects
                  </p>
                )}
              </div>
              <div className="flex items-center space-x-2">
                <motion.div
                  whileTap={{ scale: 0.95 }}
                  whileHover={{ scale: 1.05 }}
                >
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={fetchEntries}
                    disabled={loading}
                    className="transition-all duration-200 px-3 py-1 h-8"
                  >
                    <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                    Refresh
                  </Button>
                </motion.div>
                <Badge variant="secondary">{submittedEntries.filter(e => e.status === 'submitted_to_pm').length} Pending</Badge>
                <Badge variant="outline">{submittedEntries.length} Total</Badge>
              </div>
            </div>

            {loading ? (
              <motion.div
                className="text-center py-8 text-muted-foreground"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <motion.div
                  className="flex justify-center"
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                >
                  <Clock className="h-12 w-12 opacity-50" />
                </motion.div>
                <p className="mt-2">Loading submitted sheets...</p>
              </motion.div>
            ) : submittedEntries.length === 0 ? (
              <motion.div
                className="text-center py-8 text-muted-foreground"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.3 }}
              >
                <FileText className="mx-auto h-12 w-12 opacity-50" />
                <p className="mt-2 font-semibold">No sheets submitted yet</p>
                {projectId ? (
                  <>
                    <p className="text-sm mt-1">No submissions found for Project ID: {projectId}</p>
                    <p className="text-xs">Try viewing all projects or check if supervisors have submitted for this project.</p>
                  </>
                ) : (
                  <p className="text-sm mt-1">No submissions from any supervisors yet</p>
                )}
                <div className="mt-4 flex flex-col items-center gap-2">
                  <motion.div
                    whileTap={{ scale: 0.95 }}
                    whileHover={{ scale: 1.05 }}
                  >
                    <Button
                      onClick={fetchEntries}
                      size="sm"
                      variant="outline"
                      className="transition-all duration-200 px-3 py-1 h-8"
                    >
                      <RefreshCw className="w-4 h-4 mr-2" />
                      Refresh
                    </Button>
                  </motion.div>
                  <p className="text-xs text-muted-foreground">Debug: User Role: {user?.Role || 'Not set'}</p>
                </div>
              </motion.div>
            ) : (
              <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                >
                  <TabsList className="grid w-full grid-cols-2 sm:grid-cols-3 md:grid-cols-6 mb-6 gap-0">
                    {sheetTypes.map((sheet, index) => {
                      const Icon = sheet.icon;
                      const count = getEntriesBySheetType(sheet.value).length;
                      return (
                        <motion.div
                          key={sheet.value}
                          initial={{ opacity: 0, y: -10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: index * 0.05, duration: 0.2 }}
                        >
                          <TabsTrigger
                            value={sheet.value}
                            className="flex items-center justify-center w-full data-[state=active]:bg-primary data-[state=active]:text-primary-foreground py-2 px-1 border border-transparent data-[state=active]:border-primary data-[state=active]:shadow"
                          >
                            <Icon className="w-4 h-4 mr-2" />
                            <span className="hidden sm:inline">{sheet.label}</span>
                            <span className="sm:hidden">{sheet.label.split(' ')[0]}</span>
                            {count > 0 && (
                              <Badge variant="secondary" className="ml-2">{count}</Badge>
                            )}
                          </TabsTrigger>
                        </motion.div>
                      );
                    })}
                  </TabsList>
                </motion.div>

                <AnimatePresence mode="wait">
                  {sheetTypes.map((sheet, index) => (
                    sheet.value === activeTab && (
                      <TabsContent key={sheet.value} value={sheet.value}>
                        <motion.div
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{
                            duration: 0.3,
                            delay: 0.1
                          }}
                          className="w-full"
                          key={activeTab}
                          exit={{ opacity: 0, y: -20 }}
                        >
                          {renderSheetEntries(sheet.value)}
                        </motion.div>
                      </TabsContent>
                    )
                  ))}
                </AnimatePresence>
              </Tabs>
            )}
          </Card>
        </motion.div>

        {/* Charts Section */}
        <div className="mb-8">
          <ChartsSection context="PM_DASHBOARD" />
        </div>

        {/* Charts Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* Weekly Sheet Submissions */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.4, duration: 0.5 }}
            whileHover={{ y: -5 }}
            className="transition-all duration-300"
          >
            <Card className="p-6 h-full">
              <h3 className="text-xl font-bold mb-4">Weekly Sheet Submissions</h3>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={weeklyData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="week" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="sheets" fill="hsl(var(--primary))" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </motion.div>

          {/* Resource Allocation */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.5, duration: 0.5 }}
            whileHover={{ y: -5 }}
            className="transition-all duration-300"
          >
            <Card className="p-6 h-full">
              <h3 className="text-xl font-bold mb-4">Resource Allocation</h3>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={categoryData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                      label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                    >
                      {categoryData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </motion.div>

          {/* Project Progress Overview */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.6, duration: 0.5 }}
            whileHover={{ y: -5 }}
            className="transition-all duration-300"
          >
            <Card className="p-6 h-full">
              <h3 className="text-xl font-bold mb-4">Project Progress Overview</h3>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={projectProgressData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis domain={[0, 100]} />
                    <Tooltip />
                    <Bar dataKey="progress" fill="hsl(var(--primary))" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </motion.div>

          {/* Submission Trend */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.7, duration: 0.5 }}
            whileHover={{ y: -5 }}
            className="transition-all duration-300"
          >
            <Card className="p-6 h-full">
              <h3 className="text-xl font-bold mb-4">Submission Trend</h3>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={submissionTrendData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis />
                    <Tooltip />
                    <Line type="monotone" dataKey="submissions" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </motion.div>
        </div>      </div>

      {/* Fullscreen Overlay */}
      {renderFullscreenOverlay()}

      {/* Create Supervisor Modal */}
      <Dialog open={showCreateSupervisorModal} onOpenChange={setShowCreateSupervisorModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create New Supervisor (Site PM can only create supervisors)</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSupervisorSubmit} className="space-y-4">
            <div>
              <Label htmlFor="name">Full Name</Label>
              <Input
                id="name"
                value={supervisorForm.Name}
                onChange={(e) => handleSupervisorFormChange("Name", e.target.value)}
                placeholder="Enter full name"
                required
              />
            </div>
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={supervisorForm.Email}
                onChange={(e) => handleSupervisorFormChange("Email", e.target.value)}
                placeholder="Enter email"
                required
              />
            </div>
            <div>
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={supervisorForm.password}
                onChange={(e) => handleSupervisorFormChange("password", e.target.value)}
                placeholder="Enter password"
                required
              />
            </div>
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="assignProject"
                checked={supervisorForm.assignProject}
                onChange={(e) => handleSupervisorFormChange("assignProject", e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
              />
              <Label htmlFor="assignProject">Assign project to this supervisor (cannot be changed later)</Label>
            </div>
            {/* Project assignment functionality for Site PM when creating supervisors */}
            {supervisorForm.assignProject && (
              <div>
                <Label htmlFor="project">Project</Label>
                <Select
                  value={supervisorForm.ProjectId.toString()}
                  onValueChange={(value) => handleSupervisorFormChange("ProjectId", value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select project to assign" />
                  </SelectTrigger>
                  <SelectContent>
                    {projects.map((project) => {
                      // Ensure we have a valid value for the SelectItem
                      const value = (project.ObjectId || project.id || '').toString();

                      // Skip items with empty values
                      if (!value) return null;

                      return (
                        <SelectItem
                          key={project.ObjectId || project.id || project.Name}
                          value={value}
                        >
                          {project.Name}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="flex justify-end space-x-2">
              <Button type="button" variant="outline" onClick={() => setShowCreateSupervisorModal(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={supervisorLoading}>
                {supervisorLoading ? "Creating..." : "Create Supervisor"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Success Modal */}
      <Dialog open={showSuccessModal} onOpenChange={handleSuccessModalClose}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Supervisor Created Successfully</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p>Supervisor has been created with the following credentials:</p>
            <div className="bg-muted p-4 rounded-lg">
              <p><strong>Email:</strong> {registeredUser.email}</p>
              <p><strong>Password:</strong> {registeredUser.password}</p>
              <p><strong>Role:</strong> {registeredUser.role} (Site PM can only create supervisors)</p>
              {registeredUser.projectId && (
                <p className="mt-2 p-2 bg-green-100 rounded">
                  <strong>✅ Project Assigned:</strong>{" "}
                  {registeredUser.projectName || projects.find(p => p.ObjectId == registeredUser.projectId || p.id == registeredUser.projectId)?.Name || "Unknown Project"}
                </p>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              Please share these credentials with the supervisor. They can now log in to the system.
              {registeredUser.projectId && " The supervisor will only have access to the assigned project."}
            </p>
            <div className="flex justify-end">
              <Button onClick={handleSuccessModalClose}>Close</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Entry Modal */}
      <Dialog open={!!editingEntry} onOpenChange={(open) => !open && setEditingEntry(null)}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>Edit Entry - {editingEntry?.sheet_type?.replace(/_/g, ' ').toUpperCase()}</DialogTitle>
          </DialogHeader>
          {editingEntry && editData && (
            <div className="space-y-4">
              <div className="bg-muted p-3 rounded-lg dark:bg-gray-800">
                <p className="text-sm"><strong>Supervisor:</strong> {editingEntry.supervisor_name || 'Unknown'}</p>
                <p className="text-sm"><strong>Submitted:</strong> {new Date(editingEntry.submitted_at).toLocaleString()}</p>
                <p className="text-sm"><strong>Status:</strong> {editingEntry.status}</p>
              </div>

              {editData.rows && editData.rows.length > 0 && (
                <div>
                  {editData.staticHeader && (
                    <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded mb-4 border border-blue-100 dark:border-blue-800">
                      <p className="text-sm"><strong>Project:</strong> {editData.staticHeader.projectInfo}</p>
                      <p className="text-sm"><strong>Reporting Date:</strong> {editData.staticHeader.reportingDate}</p>
                      <p className="text-sm"><strong>Progress Date:</strong> {editData.staticHeader.progressDate}</p>
                    </div>
                  )}
                  {editData.totalManpower !== undefined && (
                    <div className="bg-muted p-3 rounded mb-4 dark:bg-gray-800">
                      <p className="text-sm"><strong>Total Manpower:</strong> {editData.totalManpower}</p>
                    </div>
                  )}
                  <StyledExcelTable
                    title={`Edit ${editingEntry.sheet_type.replace(/_/g, ' ')}`}
                    columns={Object.keys(editData.rows[0])}
                    data={editData.rows.map((row: any) => Object.values(row))}
                    onDataChange={(newData) => {
                      const updatedRows = newData.map((row: any[]) => {
                        const rowObj: any = {};
                        Object.keys(editData.rows[0]).forEach((key, index) => {
                          rowObj[key] = row[index] || '';
                        });
                        return rowObj;
                      });
                      setEditData({ ...editData, rows: updatedRows });
                    }}
                    onSave={handleSaveEdit}
                    onSubmit={() => {
                      const confirmed = window.confirm("Are you sure you want to submit these changes? This action cannot be undone.");
                      if (confirmed) {
                        handleSaveEdit();
                      }
                    }}
                    isReadOnly={false}
                    status={editingEntry?.status || 'draft'}
                  />
                </div>)}

              <div className="flex justify-end space-x-2">
                <Button variant="outline" onClick={() => setEditingEntry(null)}>
                  Cancel
                </Button>
                <Button onClick={handleSaveEdit}>
                  Save Changes
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Assign Project Modal */}
      <Dialog open={showAssignProjectModal} onOpenChange={(open) => {
        setShowAssignProjectModal(open);
        // Reset form when closing
        if (!open) {
          handleAssignFormReset();
        }
      }}>
        <DialogContent className="">
          <DialogHeader>
            <DialogTitle>Assign Projects to Users</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAssignSubmit} className="space-y-4">
            <div>
              <Label>Projects</Label>
              {/* Search input for projects */}
              <div className="mb-2">
                <Input
                  type="text"
                  placeholder="Search projects..."
                  value={projectSearchTerm}
                  onChange={(e) => setProjectSearchTerm(e.target.value)}
                  className="mb-2"
                />
              </div>
              <div className="border rounded-md max-h-40 overflow-y-auto">
                {projects.length > 0 ? (
                  // Filter projects based on search term
                  projects
                    .filter(project =>
                      project.Name.toLowerCase().includes(projectSearchTerm.toLowerCase())
                    )
                    .map((project) => {
                      const value = (project.ObjectId || project.id || '').toString();

                      // Skip items with empty values
                      if (!value) return null;

                      return (
                        <div
                          key={project.ObjectId || project.id || project.Name}
                          className={`flex items-center p-2 hover:bg-muted cursor-pointer ${assignForm.projectIds.includes(value) ? 'bg-muted' : ''
                            }`}
                          onClick={() => toggleProjectSelection(value)}
                        >
                          <input
                            type="checkbox"
                            checked={assignForm.projectIds.includes(value)}
                            onChange={() => toggleProjectSelection(value)}
                            className="mr-2 h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                          />
                          <div className="font-medium">{project.Name}</div>
                        </div>
                      );
                    })
                ) : (
                  <div className="p-4 text-center text-muted-foreground">
                    No projects available
                  </div>
                )}
              </div>
              {assignForm.projectIds.length > 0 && (
                <div className="mt-2 text-sm text-muted-foreground">
                  Selected {assignForm.projectIds.length} project(s)
                </div>
              )}
            </div>
            <div>
              <Label>Users</Label>
              {/* Search input for supervisors */}
              <div className="mb-2">
                <Input
                  type="text"
                  placeholder="Search users..."
                  value={supervisorSearchTerm}
                  onChange={(e) => setSupervisorSearchTerm(e.target.value)}
                  className="mb-2"
                />
              </div>
              <div className="border rounded-md max-h-40 overflow-y-auto">
                {supervisors && supervisors.length > 0 ? (
                  // Filter supervisors based on search term
                  supervisors
                    .filter(supervisor =>
                      supervisor.Name.toLowerCase().includes(supervisorSearchTerm.toLowerCase()) ||
                      supervisor.Email.toLowerCase().includes(supervisorSearchTerm.toLowerCase())
                    )
                    .map((supervisor) => {
                      const value = (supervisor.ObjectId || supervisor.id || '').toString();

                      // Skip items with empty values
                      if (!value) return null;

                      return (
                        <div
                          key={supervisor.ObjectId || supervisor.id || supervisor.Name}
                          className={`flex items-center p-2 hover:bg-muted cursor-pointer ${assignForm.supervisorIds.includes(value) ? 'bg-muted' : ''
                            }`}
                          onClick={() => toggleSupervisorSelection(value)}
                        >
                          <input
                            type="checkbox"
                            checked={assignForm.supervisorIds.includes(value)}
                            onChange={() => toggleSupervisorSelection(value)}
                            className="mr-2 h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                          />
                          <div>
                            <div className="font-medium">{supervisor.Name}</div>
                            <div className="text-sm text-muted-foreground">{supervisor.Email}</div>
                          </div>
                        </div>
                      );
                    })
                ) : (
                  <div className="p-4 text-center text-muted-foreground">
                    No users available
                  </div>
                )}
              </div>
              {assignForm.supervisorIds.length > 0 && (
                <div className="mt-2 text-sm text-muted-foreground">
                  Selected {assignForm.supervisorIds.length} user(s)
                </div>
              )}
            </div>
            <div className="flex justify-end space-x-2">
              <Button type="button" variant="outline" onClick={() => setShowAssignProjectModal(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={assignForm.projectIds.length === 0 || assignForm.supervisorIds.length === 0}
              >
                {assignForm.projectIds.length > 0 && assignForm.supervisorIds.length > 0
                  ? `Assign ${assignForm.projectIds.length} Project(s) to ${assignForm.supervisorIds.length} User(s)`
                  : 'Assign Projects to Users'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
};

export default PMDashboard;