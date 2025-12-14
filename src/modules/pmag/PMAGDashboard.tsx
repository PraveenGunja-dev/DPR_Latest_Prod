import { motion, AnimatePresence } from "framer-motion";
import { useLocation } from "react-router-dom";
import { Navbar } from "@/components/Navbar";
import { StatsCard } from "@/components/StatsCard";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  FileCheck, 
  TrendingUp, 
  Users, 
  Award, 
  Activity, 
  Plus, 
  FolderPlus, 
  UserPlus, 
  X, 
  Check, 
  CheckCircle,
  Eye,
  FileSpreadsheet,
  Grid3X3,
  Wrench,
  Building,
  Package,
  User,
  Maximize,
  Minimize,
  ChevronDown,
  ChevronRight
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, Area, AreaChart, PieChart, Pie, Cell } from "recharts";
import { ChartsSection } from "@/modules/charts";
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RefreshCw } from "lucide-react";
import { useAuth } from "@/modules/auth/contexts/AuthContext";
import { useNotification } from "@/modules/auth/contexts/NotificationContext";
import { registerUser } from "@/modules/auth/services/authService";
import { createProject, assignProjectToSupervisor, assignProjectToMultipleSupervisors, assignProjectsToMultipleSupervisors, getUserProjects } from "@/modules/auth/services/projectService";
import { getAllSupervisors } from "@/modules/auth/services/authService";
import { getEntriesForPMAGReview, getEntriesHistoryForPMAG, getArchivedEntriesForPMAG, finalApproveByPMAG, rejectEntryByPMAG } from "@/modules/auth/services/dprSupervisorService";
import { toast } from "sonner";

// Import the specialized table components
import { 
  DPQtyTable,
  DPVendorBlockTable,
  ManpowerDetailsTable,
  DPBlockTable,
  DPVendorIdtTable,
  MmsModuleRfiTable
} from "@/modules/supervisor/components";
import { StyledExcelTable } from "@/components/StyledExcelTable";

// Function to format date as YYYY-MM-DD
const formatDate = (dateString: string | null | undefined): string => {
  if (!dateString) return "Not set";
  const date = new Date(dateString);
  return date.toISOString().split('T')[0];
};

// Define color palette for charts
const COLORS = ["hsl(var(--primary))", "hsl(var(--secondary))", "hsl(var(--accent))", "hsl(var(--muted))"];

const PMAGDashboard = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, token } = useAuth();
  const { addNotification } = useNotification();
  const { projectName, projectId } = location.state || { 
    projectName: "Project", 
    projectId: null 
  };

  const [showCreateUserModal, setShowCreateUserModal] = useState(false);
  const [showCreateProjectModal, setShowCreateProjectModal] = useState(false);
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [showAssignProjectModal, setShowAssignProjectModal] = useState(false);
  const [projects, setProjects] = useState<any[]>([]);
  const [supervisors, setSupervisors] = useState<any[]>([]);
  const [approvedEntries, setApprovedEntries] = useState<any[]>([]);
  const [historyEntries, setHistoryEntries] = useState<any[]>([]);
    const [historyFilter, setHistoryFilter] = useState<number | null>(7); // Default to 7 days
  const [archivedEntries, setArchivedEntries] = useState<any[]>([]);
  const [selectedArchivedEntry, setSelectedArchivedEntry] = useState<any>(null);
  const [showArchivedModal, setShowArchivedModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [showArchivedListModal, setShowArchivedListModal] = useState(false);
  const [loadingEntries, setLoadingEntries] = useState(false);
  const [activeTab, setActiveTab] = useState('dp_qty');
  const [projectForm, setProjectForm] = useState({
    Name: "",
    Location: "",
    Status: "planning",
    PercentComplete: 0,
    PlannedStartDate: "",
    PlannedFinishDate: ""
  });
  const [registerForm, setRegisterForm] = useState({
    Name: "",
    Email: "",
    password: "",
    Role: "Site PM" as "Site PM" | "PMAG", // PMAG can only create Site PMs and other PMAG users
    assignProject: false,
    ProjectId: "" as string | number
  });
  const [assignForm, setAssignForm] = useState({
    projectIds: [] as string[],  // Changed to array for multiple projects
    supervisorIds: [] as string[]
  });
  const [loading, setLoading] = useState(false);
  const [registerLoading, setRegisterLoading] = useState(false);
  const [assignLoading, setAssignLoading] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [registeredUser, setRegisteredUser] = useState({
    email: '',
    password: '',
    role: '',
    projectId: null as string | null
  });
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [projectSearchTerm, setProjectSearchTerm] = useState('');
  const [supervisorSearchTerm, setSupervisorSearchTerm] = useState('');
  const [expandedEntries, setExpandedEntries] = useState<Record<number, boolean>>({});

  // Sheet types for tabs
  const sheetTypes = [
    { value: 'dp_qty', label: 'DP Qty', icon: FileSpreadsheet },
    { value: 'dp_block', label: 'DP Block', icon: Grid3X3 },
    { value: 'dp_vendor_idt', label: 'DP Vendor IDT', icon: Wrench },
    { value: 'mms_module_rfi', label: 'MMS & Module RFI', icon: Building },
    { value: 'dp_vendor_block', label: 'DP Vendor Block', icon: Package },
    { value: 'manpower_details', label: 'Manpower Details', icon: User },
  ];

  // Filter entries by sheet type
  const getEntriesBySheetType = (sheetType: string) => {
    return approvedEntries.filter(entry => entry.sheet_type === sheetType);
  };

  // Fetch projects and supervisors
  const fetchData = async () => {
    try {
      // Fetch projects
      const projectsData = await getUserProjects();
      setProjects(projectsData);
      
      // Fetch supervisors from API
      console.log("About to fetch supervisors...");
      const supervisorsData = await getAllSupervisors();
      console.log("Supervisors fetched:", supervisorsData); // Debug log
      setSupervisors(supervisorsData);
      
      // Fetch approved entries for PMAG review
      await fetchApprovedEntries();
      
      // Fetch history entries with default 7-day filter
      await fetchHistoryEntries(7);
    } catch (error) {
      console.error("Failed to fetch data:", error); // Debug log
      toast.error("Failed to fetch data");
    }
  };

  // Fetch approved entries from PM
  const fetchApprovedEntries = async () => {
    try {
      setLoadingEntries(true);
      const entries = await getEntriesForPMAGReview();
      setApprovedEntries(entries);
    } catch (error) {
      console.error('Error fetching approved entries:', error);
      toast.error("Failed to load approved sheets");
    } finally {
      setLoadingEntries(false);
    }
  };

  // Fetch history entries with date filter
  const fetchHistoryEntries = async (days?: number | null) => {
    try {
      setLoadingEntries(true);
      const entries = await getEntriesHistoryForPMAG(undefined, days || undefined);
      setHistoryEntries(entries);
    } catch (error) {
      console.error('Error fetching history entries:', error);
      toast.error("Failed to load history");
    } finally {
      setLoadingEntries(false);
    }
  };

  // Fetch archived entries
  const fetchArchivedEntries = async () => {
    try {
      setLoadingEntries(true);
      const entries = await getArchivedEntriesForPMAG();
      setArchivedEntries(entries);
    } catch (error) {
      console.error('Error fetching archived entries:', error);
      toast.error("Failed to load archived sheets");
    } finally {
      setLoadingEntries(false);
    }
  };

  // Handle tab change with auto-refresh
  const handleTabChange = (value: string) => {
    setActiveTab(value);
    // Auto-refresh when switching tabs
    fetchApprovedEntries();
  };

  // Toggle fullscreen mode
  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
  };

  // Toggle entry expansion
  const toggleEntryExpansion = (entryId: number) => {
    setExpandedEntries(prev => ({
      ...prev,
      [entryId]: !prev[entryId]
    }));
  };

  // Handle update entry (dummy function for read-only PMAG dashboard)
  const handleUpdateEntry = async (entryId: number, data: any) => {
    // PMAG dashboard is read-only, so this function does nothing
    console.log('PMAG dashboard is read-only, ignoring update request');
  };

  // Handle save entry (dummy function for read-only PMAG dashboard)
  const handleSaveEntry = async (entryId: number, data: any) => {
    // PMAG dashboard is read-only, so this function does nothing
    console.log('PMAG dashboard is read-only, ignoring save request');
  };

  // Handle final approval by PMAG
  const handleFinalApprove = async (entryId: number) => {
    try {
      await finalApproveByPMAG(entryId);
      
      // Find the entry that was approved to get details for notification
      const entry = approvedEntries.find(e => e.id === entryId);
      if (entry) {
        // Add notification for successful final approval
        addNotification({
          title: "Sheet Final Approved",
          message: `The ${entry.sheet_type.replace(/_/g, ' ')} sheet from ${entry.supervisor_name || 'a supervisor'} has been given final approval.`,
          type: "success",
          userId: user?.ObjectId,
          projectId: entry.project_id,
          entryId: entry.id,
          sheetType: entry.sheet_type // Add sheetType for navigation
        });
      }
      
      toast.success("Entry given final approval successfully!");
      await fetchApprovedEntries();
    } catch (error) {
      toast.error("Failed to give final approval");
    }
  };

  // Handle reject by PMAG (send back to PM)
  const handleRejectToPM = async (entryId: number) => {
    try {
      await rejectEntryByPMAG(entryId);
      
      // Find the entry that was rejected to get details for notification
      const entry = approvedEntries.find(e => e.id === entryId);
      if (entry) {
        // Add notification for rejection back to PM
        addNotification({
          title: "Sheet Rejected to PM",
          message: `The ${entry.sheet_type.replace(/_/g, ' ')} sheet from ${entry.supervisor_name || 'a supervisor'} has been rejected and sent back to PM for review.`,
          type: "warning",
          userId: user?.ObjectId,
          projectId: entry.project_id,
          entryId: entry.id,
          sheetType: entry.sheet_type // Add sheetType for navigation
        });
      }
      
      toast.success("Entry rejected and sent back to PM");
      await fetchApprovedEntries();
    } catch (error) {
      toast.error("Failed to reject entry");
    }
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
          <FileCheck className="mx-auto h-12 w-12 opacity-50" />
          <p className="mt-2">No {sheetType.replace(/_/g, ' ')} sheets awaiting final approval</p>
        </motion.div>
      );
    }

    return (
      <div className="space-y-4">
        {entries.map((entry, entryIndex) => {
          const entryData = typeof entry.data_json === 'string' ? JSON.parse(entry.data_json) : entry.data_json;
          
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
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between">
                      <div className="flex items-center space-x-2">
                        <span className="font-semibold">Entry #{entry.id}</span>
                        <Badge 
                          variant="default"
                          className="bg-blue-500 px-2 py-0.5 text-xs font-medium dark:bg-blue-600"
                        >
                          PM Approved
                        </Badge>
                      </div>
                      <span className="text-xs text-muted-foreground mt-1 md:mt-0">
                        {new Date(entry.updated_at).toLocaleDateString()}
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
                        {entry.sheet_type.replace(/_/g, ' ')}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2 flex-shrink-0">
                    {isExpanded ? (
                      <ChevronDown className="w-5 h-5 text-muted-foreground dark:text-gray-400" />
                    ) : (
                      <ChevronRight className="w-5 h-5 text-muted-foreground dark:text-gray-400" />
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
                        <div className="bg-blue-50 dark:bg-blue-900/30 p-3 rounded mb-4 border border-blue-100 dark:border-blue-800">
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                            <p className="text-sm"><strong>Project:</strong> {entryData.staticHeader.projectInfo}</p>
                            <p className="text-sm"><strong>Reporting Date:</strong> {entryData.staticHeader.reportingDate}</p>
                            <p className="text-sm"><strong>Progress Date:</strong> {entryData.staticHeader.progressDate}</p>
                          </div>
                        </div>
                      )}

                      {/* Action Buttons */}
                      <div className="flex justify-end space-x-2 mb-4">
                        <motion.div
                          whileTap={{ scale: 0.95 }}
                          whileHover={{ scale: 1.05 }}
                        >
                          <Button 
                            size="sm" 
                            variant="default"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleFinalApprove(entry.id);
                            }}
                            className="bg-green-600 hover:bg-green-700 dark:bg-green-700 dark:hover:bg-green-800 transition-all duration-200 px-3 py-1 h-8"
                          >
                            <Check className="w-4 h-4 mr-1" />
                            Final Approve
                          </Button>
                        </motion.div>
                        <motion.div
                          whileTap={{ scale: 0.95 }}
                          whileHover={{ scale: 1.05 }}
                        >
                          <Button 
                            size="sm" 
                            variant="destructive"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRejectToPM(entry.id);
                            }}
                            className="transition-all duration-200 px-3 py-1 h-8 dark:bg-red-700 dark:hover:bg-red-800"
                          >
                            <X className="w-4 h-4 mr-1" />
                            Reject to PM
                          </Button>
                        </motion.div>
                      </div>

                      {/* Data Table - Using the same components as Site PM Dashboard */}
                      {entryData?.rows && entryData.rows.length > 0 && (
                        <div className="mb-4">
                          <div className={isFullscreen ? 'overflow-auto max-h-[calc(100vh-120px)]' : ''}>
                            {/* Render the appropriate table component based on sheet type */}
                            {sheetType === 'dp_qty' && (
                              <DPQtyTable 
                                data={entryData.rows} 
                                setData={(data) => handleUpdateEntry(entry.id, { ...entryData, rows: data })}
                                onSave={() => handleSaveEntry(entry.id, entryData)}
                                onSubmit={() => handleSaveEntry(entry.id, entryData)}
                                yesterday={entryData.staticHeader?.progressDate || ''}
                                today={entryData.staticHeader?.reportingDate || ''}
                                isLocked={true} // PMAG can only view, not edit
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
                                yesterday={entryData.staticHeader?.progressDate || ''}
                                today={entryData.staticHeader?.reportingDate || ''}
                                isLocked={true} // PMAG can only view, not edit
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
                                yesterday={entryData.staticHeader?.progressDate || ''}
                                today={entryData.staticHeader?.reportingDate || ''}
                                isLocked={true} // PMAG can only view, not edit
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
                                yesterday={entryData.staticHeader?.progressDate || ''}
                                today={entryData.staticHeader?.reportingDate || ''}
                                isLocked={true} // PMAG can only view, not edit
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
                                yesterday={entryData.staticHeader?.progressDate || ''}
                                today={entryData.staticHeader?.reportingDate || ''}
                                isLocked={true} // PMAG can only view, not edit
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
                                yesterday={entryData.staticHeader?.progressDate || ''}
                                today={entryData.staticHeader?.reportingDate || ''}
                                isLocked={true} // PMAG can only view, not edit
                                status={entry.status}
                                useMockData={false}
                              />
                            )}
                            
                            {/* Fallback for unknown sheet types */}
                            {!['dp_qty', 'dp_block', 'dp_vendor_idt', 'dp_vendor_block', 'manpower_details', 'mms_module_rfi'].includes(sheetType) && (
                              <div className="overflow-x-auto">
                                <table className="w-full border-collapse min-w-full">
                                  <thead>
                                    <tr className="bg-gray-100 dark:bg-gray-700 sticky top-0 z-10">
                                      {Object.keys(entryData.rows[0]).map((key) => (
                                        <th key={key} className="border border-gray-300 dark:border-gray-600 p-2 text-left text-xs font-semibold whitespace-nowrap bg-gray-50 dark:bg-gray-800">
                                          {key.replace(/([A-Z])/g, ' $1').trim().toUpperCase()}
                                        </th>
                                      ))}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {entryData.rows.map((row: any, rowIndex: number) => (
                                      <motion.tr 
                                        key={rowIndex} 
                                        className="hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors duration-150 border-b border-gray-100 dark:border-gray-700"
                                        initial={{ opacity: 0, x: -5 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ delay: entryIndex * 0.1 + 0.4 + rowIndex * 0.05 }}
                                        whileHover={{ backgroundColor: '#f9fafb' }}
                                      >
                                        {Object.values(row).map((value: any, colIndex: number) => (
                                          <td key={`${rowIndex}-${colIndex}`} className="border border-gray-300 dark:border-gray-600 p-2 text-sm align-top dark:text-gray-200">
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
                        <div className="p-3 bg-green-50 dark:bg-green-900/30 rounded border border-green-200 dark:border-green-800">
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

  const handleCreateUser = () => {
    setShowRegisterModal(true);
  };

  const handleCreateProject = () => {
    setShowCreateProjectModal(true);
  };

  const handleAssignProject = () => {
    console.log("Supervisors available for assignment:", supervisors); // Debug log
    console.log("Number of supervisors:", supervisors.length); // Debug log
    setShowAssignProjectModal(true);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleProjectFormChange = (field: string, value: string | number) => {
    setProjectForm(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleRegisterFormChange = (field: string, value: string | boolean) => {
    setRegisterForm(prev => ({
      ...prev,
      [field]: value
    }));
  };

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

  const handleProjectSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      const projectData = {
        Name: projectForm.Name,
        Location: projectForm.Location,
        Status: projectForm.Status,
        PercentComplete: projectForm.PercentComplete,
        PlannedStartDate: projectForm.PlannedStartDate,
        PlannedFinishDate: projectForm.PlannedFinishDate,
        ActualStartDate: null,
        ActualFinishDate: null
      };
      
      await createProject(projectData);
      
      toast.success("Project created successfully!");
      setShowCreateProjectModal(false);
      
      // Reset form
      setProjectForm({
        Name: "",
        Location: "",
        Status: "planning",
        PercentComplete: 0,
        PlannedStartDate: "",
        PlannedFinishDate: ""
      });
      
      // Refresh projects list
      fetchData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Project creation failed');
    } finally {
      setLoading(false);
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegisterLoading(true);
    
    try {
      // First create the user
      const userData: Omit<import('@/modules/auth/services/authService').User, 'ObjectId'> = {
        Name: registerForm.Name,
        Email: registerForm.Email,
        password: registerForm.password,
        Role: registerForm.Role as "Site PM" | "PMAG" // Type assertion for PMAG-created users
      };
      
      const registeredUserResponse = await registerUser(userData);
      
      // If assignProject is checked and a project is selected, assign the project
      let assignedProjectId = null;
      if (registerForm.assignProject && registerForm.ProjectId) {
        try {
          // Ensure we're passing numbers to the API
          const projectId = parseInt(registerForm.ProjectId.toString());
          const supervisorId = registeredUserResponse.user.ObjectId;
          
          console.log('Assigning project:', { projectId, supervisorId });
          
          await assignProjectToSupervisor(projectId, supervisorId);
          assignedProjectId = registerForm.ProjectId;
          toast.success(`User created and project assigned successfully!`);
        } catch (assignError) {
          console.error('Project assignment error:', assignError);
          toast.warning(`User created but project assignment failed: ${(assignError as Error).message}`);
        }
      } else {
        toast.success("User created successfully!");
      }
      
      // Show success modal with user details
      setRegisteredUser({
        email: registerForm.Email,
        password: registerForm.password,
        role: registerForm.Role,
        projectId: assignedProjectId
      });
      setShowSuccessModal(true);
      setShowRegisterModal(false);
      
      // Reset form
      setRegisterForm({
        Name: "",
        Email: "",
        password: "",
        Role: "Site PM",
        assignProject: false,
        ProjectId: ""
      });
      
      // Refresh supervisors list to include the newly created supervisor
      fetchData();
    } catch (err) {
      console.error('Registration error:', err);
      toast.error(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setRegisterLoading(false);
    }
  };

  const handleAssignSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAssignLoading(true);
    
    try {
      // Assign multiple projects to multiple supervisors using the new API endpoint
      await assignProjectsToMultipleSupervisors(
        assignForm.projectIds.map(id => parseInt(id)),
        assignForm.supervisorIds.map(id => parseInt(id))
      );
      
      toast.success("Projects assigned to selected users successfully!");
      setShowAssignProjectModal(false);
      
      // Reset form
      setAssignForm({
        projectIds: [],
        supervisorIds: []
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Project assignment failed');
    } finally {
      setAssignLoading(false);
    }
  };

  const statsData = [
    { title: "Total Projects", value: projects.length, icon: FolderPlus, trend: { value: 12, isPositive: true } },
    { title: "Active Projects", value: projects.filter(p => p.Status === "active").length, icon: Activity, trend: { value: 8, isPositive: true } },
    { title: "Total Supervisors", value: supervisors.length, icon: Users, trend: { value: 3, isPositive: true } },
    { title: "Completed Projects", value: projects.filter(p => p.Status === "completed").length, icon: Award, trend: { value: 2, isPositive: true } },
  ];

  const projectChartData = projects.slice(0, 5).map(project => ({
    name: project.Name,
    progress: project.PercentComplete
  }));

  const progressData = [
    { name: 'Jan', progress: 45 },
    { name: 'Feb', progress: 52 },
    { name: 'Mar', progress: 48 },
    { name: 'Apr', progress: 78 },
    { name: 'May', progress: 65 },
    { name: 'Jun', progress: 80 },
  ];

  // Approval statistics data
  const approvalData = [
    { name: 'Pending', value: approvedEntries.filter(e => e.status === 'submitted_to_pm').length },
    { name: 'Approved', value: approvedEntries.filter(e => e.status === 'approved_by_pm').length },
    { name: 'Rejected', value: approvedEntries.filter(e => e.status === 'rejected_by_pm').length },
    { name: 'Final Approved', value: approvedEntries.filter(e => e.status === 'final_approved').length },
  ];

  // Sheet type distribution data
  const sheetTypeData = sheetTypes.map(sheetType => ({
    name: sheetType.label,
    value: getEntriesBySheetType(sheetType.value).length
  })).filter(item => item.value > 0);

  // Monthly submission trend
  const monthlySubmissionData = [
    { month: 'Jan', submissions: 24 },
    { month: 'Feb', submissions: 32 },
    { month: 'Mar', submissions: 28 },
    { month: 'Apr', submissions: 45 },
    { month: 'May', submissions: 38 },
    { month: 'Jun', submissions: 52 },
  ];
  return (
    <motion.div 
      className="min-h-screen bg-background"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      <Navbar 
        userName={user?.Name || "User"} 
        userRole={user?.Role || "PMAG"} 
        projectName={projectName}
        onAddUser={handleCreateUser}
        onAddProject={handleCreateProject}
        onAssignProject={handleAssignProject}
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
                PMAG Dashboard
              </motion.h1>
              <motion.p 
                className="text-muted-foreground"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.2 }}
              >
                Manage projects, supervisors, and assignments
              </motion.p>
            </div>
            <motion.div 
              className="flex items-center space-x-4"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2 }}
            >
              <Button 
                variant="outline" 
                onClick={async () => {
                  await fetchHistoryEntries(7); // Default to 7 days
                  setShowHistoryModal(true);
                }}
                className="flex items-center"
              >
                <Activity className="w-4 h-4 mr-2" />
                History
              </Button>
              <Button 
                variant="outline" 
                onClick={async () => {
                  await fetchArchivedEntries();
                  setShowArchivedListModal(true);
                }}
                className="flex items-center"
              >
                <FolderPlus className="w-4 h-4 mr-2" />
                Archived
              </Button>
              <div className="bg-primary/10 px-4 py-2 rounded-lg">
                <div className="flex items-center">
                  <FileCheck className="w-5 h-5 text-primary mr-2" />
                  <span className="font-medium">Project Management</span>
                </div>
              </div>
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

        {/* PM Approved Sheets - Awaiting PMAG Review with Tabs */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="mb-8"
        >
          <Card className="p-6 bg-card dark:bg-gray-800">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold">PM Approved Sheets - Awaiting Final Review</h3>
              <Badge variant="secondary">{approvedEntries.length} Pending</Badge>
            </div>
            
            {loadingEntries ? (
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
                  <Activity className="h-12 w-12 opacity-50" />
                </motion.div>
                <p className="mt-2">Loading approved sheets...</p>
              </motion.div>
            ) : (
              <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
                <motion.div 
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                >
                  <div className="overflow-x-auto pb-2 scrollbar-hide">
                    <TabsList className="flex w-max min-w-full space-x-0 p-1 bg-muted rounded-lg">
                      {sheetTypes.map((sheetType, index) => {
                        const IconComponent = sheetType.icon;
                        const count = getEntriesBySheetType(sheetType.value).length;
                        return (
                          <motion.div
                            key={sheetType.value}
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: index * 0.05, duration: 0.2 }}
                          >
                            <TabsTrigger 
                              value={sheetType.value} 
                              className="flex items-center justify-center py-2 px-3 text-sm data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow rounded-md transition-all duration-200 whitespace-nowrap border border-transparent data-[state=active]:border-primary"
                            >
                              <IconComponent className="w-4 h-4 mr-2" />
                              <span>{sheetType.label}</span>
                              {count > 0 && (
                                <Badge variant="secondary" className="ml-2">
                                  {count}
                                </Badge>
                              )}
                            </TabsTrigger>
                          </motion.div>
                        );
                      })}
                    </TabsList>
                  </div>
                </motion.div>
                
                <AnimatePresence mode="wait">
                  {sheetTypes.map((sheetType) => (
                    sheetType.value === activeTab && (
                      <TabsContent key={sheetType.value} value={sheetType.value}>
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
                          {renderSheetEntries(sheetType.value)}
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
          <ChartsSection context="PMRG_DASHBOARD" />
        </div>

        {/* Charts Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* Project Progress */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3, duration: 0.5 }}
            whileHover={{ y: -5 }}
            className="transition-all duration-300"
          >
            <Card className="p-6 h-full shadow-md hover:shadow-lg transition-shadow duration-300 rounded-xl">
              <h3 className="text-xl font-bold mb-4">Project Progress Overview</h3>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={projectChartData}>
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

          {/* Progress Trend */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.4, duration: 0.5 }}
            whileHover={{ y: -5 }}
            className="transition-all duration-300"
          >
            <Card className="p-6 h-full shadow-md hover:shadow-lg transition-shadow duration-300 rounded-xl">
              <h3 className="text-xl font-bold mb-4">Progress Trend</h3>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={progressData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip />
                    <Area type="monotone" dataKey="progress" stroke="hsl(var(--primary))" fill="hsl(var(--primary) / 0.2)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </motion.div>

          {/* Approval Statistics */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.5, duration: 0.5 }}
            whileHover={{ y: -5 }}
            className="transition-all duration-300"
          >
            <Card className="p-6 h-full shadow-md hover:shadow-lg transition-shadow duration-300 rounded-xl">
              <h3 className="text-xl font-bold mb-4">Approval Statistics</h3>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={approvalData}
                      cx="50%"
                      cy="50%"
                      labelLine={true}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                      label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                    >
                      {approvalData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </motion.div>

          {/* Sheet Type Distribution */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.6, duration: 0.5 }}
            whileHover={{ y: -5 }}
            className="transition-all duration-300"
          >
            <Card className="p-6 h-full shadow-md hover:shadow-lg transition-shadow duration-300 rounded-xl">
              <h3 className="text-xl font-bold mb-4">Sheet Type Distribution</h3>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={sheetTypeData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="value" fill="hsl(var(--primary))" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </motion.div>
        </div>
        {/* Projects Table */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          whileHover={{ y: -2 }}
        >
          <Card className="p-6 shadow-md hover:shadow-lg transition-shadow duration-300 rounded-xl">
            <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
              <h3 className="text-xl font-bold">Recent Projects</h3>
              <motion.div
                whileTap={{ scale: 0.95 }}
                whileHover={{ scale: 1.05 }}
              >
                <Button onClick={handleCreateProject} className="transition-all duration-200 px-3 py-1 h-8">
                  <Plus className="w-4 h-4 mr-2" />
                  Add Project
                </Button>
              </motion.div>
            </div>
            <div className="overflow-x-auto rounded-lg border border-gray-200">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-gray-50">
                    <th className="text-left py-3 px-4 font-semibold text-gray-700">Project</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-700">Location</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-700">Status</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-700">Progress</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-700">Timeline</th>
                  </tr>
                </thead>
                <tbody>
                  {projects.slice(0, 5).map((project, index) => {
                    // Ensure we have a unique key even if ObjectId is missing
                    const uniqueKey = project.ObjectId ? `project-${project.ObjectId}` : `project-index-${index}`;
                    
                    return (
                      <motion.tr 
                        key={uniqueKey} 
                        className="border-b hover:bg-muted/50 transition-colors"
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.1 }}
                        whileHover={{ backgroundColor: '#f9fafb' }}
                      >
                        <td className="py-3 px-4 font-medium">{project.Name}</td>
                        <td className="py-3 px-4">{project.Location}</td>
                        <td className="py-3 px-4">
                          <Badge variant={project.Status === "active" ? "default" : project.Status === "completed" ? "secondary" : "outline"}>
                            {project.Status}
                          </Badge>
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center">
                            <div className="w-24 bg-secondary rounded-full h-2 mr-2">
                              <motion.div 
                                className="bg-primary h-2 rounded-full" 
                                style={{ width: `${project.PercentComplete}%` }}
                                initial={{ width: 0 }}
                                animate={{ width: `${project.PercentComplete}%` }}
                                transition={{ duration: 1, delay: 0.5 }}
                              ></motion.div>
                            </div>
                            <span>{project.PercentComplete}%</span>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          {formatDate(project.PlannedStartDate)} - {formatDate(project.PlannedFinishDate)}
                        </td>
                      </motion.tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </motion.div>
      </div>

      {/* Create User Modal */}
      <Dialog open={showRegisterModal} onOpenChange={setShowRegisterModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create New User</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleRegisterSubmit} className="space-y-4">
            <div>
              <Label htmlFor="name">Full Name</Label>
              <Input
                id="name"
                value={registerForm.Name}
                onChange={(e) => handleRegisterFormChange("Name", e.target.value)}
                placeholder="Enter full name"
                required
              />
            </div>
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={registerForm.Email}
                onChange={(e) => handleRegisterFormChange("Email", e.target.value)}
                placeholder="Enter email"
                required
              />
            </div>
            <div>
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={registerForm.password}
                onChange={(e) => handleRegisterFormChange("password", e.target.value)}
                placeholder="Enter password"
                required
              />
            </div>
            <div>
              <Label htmlFor="role">Role</Label>
              <Select value={registerForm.Role} onValueChange={(value) => handleRegisterFormChange("Role", value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Site PM">Site PM</SelectItem>
                  <SelectItem value="PMAG">PMAG</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="assignProject"
                checked={registerForm.assignProject}
                onChange={(e) => handleRegisterFormChange("assignProject", e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
              />
              <Label htmlFor="assignProject">Assign project to this user</Label>
            </div>
            {registerForm.assignProject && (
              <div>
                <Label htmlFor="project">Project</Label>
                <Select 
                  value={registerForm.ProjectId.toString()} 
                  onValueChange={(value) => handleRegisterFormChange("ProjectId", value)}
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
              <Button type="button" variant="outline" onClick={() => setShowRegisterModal(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={registerLoading}>
                {registerLoading ? "Creating..." : "Create User"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Create Project Modal */}
      <Dialog open={showCreateProjectModal} onOpenChange={setShowCreateProjectModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create New Project</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleProjectSubmit} className="space-y-4">
            <div>
              <Label htmlFor="projectName">Project Name</Label>
              <Input
                id="projectName"
                value={projectForm.Name}
                onChange={(e) => handleProjectFormChange("Name", e.target.value)}
                placeholder="Enter project name"
                required
              />
            </div>
            <div>
              <Label htmlFor="location">Location</Label>
              <Input
                id="location"
                value={projectForm.Location}
                onChange={(e) => handleProjectFormChange("Location", e.target.value)}
                placeholder="Enter location"
                required
              />
            </div>
            <div>
              <Label htmlFor="status">Status</Label>
              <Select value={projectForm.Status} onValueChange={(value) => handleProjectFormChange("Status", value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="planning">Planning</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="on-hold">On Hold</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="startDate">Start Date</Label>
                <Input
                  id="startDate"
                  type="date"
                  value={projectForm.PlannedStartDate}
                  onChange={(e) => handleProjectFormChange("PlannedStartDate", e.target.value)}
                  required
                />
              </div>
              <div>
                <Label htmlFor="endDate">End Date</Label>
                <Input
                  id="endDate"
                  type="date"
                  value={projectForm.PlannedFinishDate}
                  onChange={(e) => handleProjectFormChange("PlannedFinishDate", e.target.value)}
                  required
                />
              </div>
            </div>
            <div className="flex justify-end space-x-2">
              <Button type="button" variant="outline" onClick={() => setShowCreateProjectModal(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? "Creating..." : "Create Project"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Assign Project Modal */}
      <Dialog open={showAssignProjectModal} onOpenChange={(open) => {
        setShowAssignProjectModal(open);
        // Reset selection when closing
        if (!open) {
          setAssignForm({
            projectIds: [],
            supervisorIds: []
          });
          // Reset search terms when closing modal
          setProjectSearchTerm('');
          setSupervisorSearchTerm('');
        }
      }}>
        <DialogContent className="max-w-md">
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
                          className={`flex items-center p-2 hover:bg-muted cursor-pointer ${
                            assignForm.projectIds.includes(value) ? 'bg-muted' : ''
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
                {supervisors.length > 0 ? (
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
                          className={`flex items-center p-2 hover:bg-muted cursor-pointer ${
                            assignForm.supervisorIds.includes(value) ? 'bg-muted' : ''
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
                disabled={assignLoading || assignForm.projectIds.length === 0 || assignForm.supervisorIds.length === 0}
              >
                {assignLoading ? "Assigning..." : `Assign ${assignForm.projectIds.length} Project(s) to ${assignForm.supervisorIds.length} User(s)`}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Success Modal */}
      <Dialog open={showSuccessModal} onOpenChange={setShowSuccessModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>User Created Successfully</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p>User has been created with the following credentials:</p>
            <div className="bg-muted dark:bg-gray-700 p-4 rounded-lg">
              <p><strong>Email:</strong> {registeredUser.email}</p>
              <p><strong>Password:</strong> {registeredUser.password}</p>
              <p><strong>Role:</strong> {registeredUser.role}</p>
              {registerForm.assignProject && registerForm.ProjectId && (
                <p className="mt-2 p-2 bg-green-100 dark:bg-green-900/30 rounded">
                  <strong>✅ Project Assigned:</strong>{" "}
                  {projects.find(p => p.ObjectId == registerForm.ProjectId || p.id == registerForm.ProjectId)?.Name || "Unknown Project"}
                </p>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              Please share these credentials with the user. They can now log in to the system.
              {registerForm.assignProject && registerForm.ProjectId && " The user will only have access to the assigned project."}
            </p>
            <div className="flex justify-end">
              <Button onClick={() => setShowSuccessModal(false)}>Close</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* History Modal */}
      <Dialog open={showHistoryModal} onOpenChange={setShowHistoryModal}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>History</DialogTitle>
          </DialogHeader>
          <div className="mb-4 flex justify-between items-center">
            <div className="flex items-center space-x-2">
              <Label htmlFor="history-filter">Show entries from:</Label>
              <Select 
                value={historyFilter?.toString() || "all"} 
                onValueChange={(value) => {
                  const days = value === "all" ? null : parseInt(value);
                  setHistoryFilter(days);
                  fetchHistoryEntries(days);
                }}
              >
                <SelectTrigger className="w-[180px]" id="history-filter">
                  <SelectValue placeholder="Select timeframe" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All time</SelectItem>
                  <SelectItem value="1">Last 24 hours</SelectItem>
                  <SelectItem value="7">Last 7 days</SelectItem>
                  <SelectItem value="30">Last 30 days</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button 
              variant="outline" 
              onClick={() => fetchHistoryEntries(historyFilter)}
              size="sm"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Refresh
            </Button>
          </div>
          <div className="space-y-6">
            {historyEntries.length === 0 ? (
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.3 }}
                className="text-center py-8 text-muted-foreground"
              >
                <Activity className="mx-auto h-12 w-12 opacity-50" />
                <p className="mt-2">No history entries found</p>
              </motion.div>
            ) : (
              historyEntries.map((entry, entryIndex) => {
                const entryData = typeof entry.data_json === 'string' ? JSON.parse(entry.data_json) : entry.data_json;
                
                // Get status badge variant
                const getStatusVariant = (status: string) => {
                  switch(status) {
                    case 'draft': return 'outline';
                    case 'submitted_to_pm': return 'secondary';
                    case 'approved_by_pm': return 'default';
                    case 'final_approved': return 'default';
                    case 'rejected_by_pm': return 'destructive';
                    default: return 'outline';
                  }
                };
                
                // Get status text
                const getStatusText = (status: string) => {
                  switch(status) {
                    case 'draft': return 'Draft';
                    case 'submitted_to_pm': return 'Submitted to PM';
                    case 'approved_by_pm': return 'Approved by PM';
                    case 'final_approved': return 'Final Approved';
                    case 'rejected_by_pm': return 'Rejected by PM';
                    default: return status;
                  }
                };
                
                return (
                  <motion.div 
                    key={entry.id} 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: entryIndex * 0.1 }}
                    className="border rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow duration-200 bg-white dark:bg-gray-800"
                  >
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <h3 className="font-semibold text-lg mb-1">Entry #{entry.id}</h3>
                        <div className="space-y-1 text-sm">
                          <p><span className="font-medium">Sheet:</span> {entry.sheet_type.replace(/_/g, ' ')}</p>
                          <p><span className="font-medium">Project:</span> {entryData?.staticHeader?.projectInfo || 'N/A'}</p>
                        </div>
                      </div>
                      <div>
                        <div className="space-y-1 text-sm">
                          <p><span className="font-medium">Submitted by:</span> {entry.supervisor_name || 'Supervisor'}</p>
                          <p><span className="font-medium">Approved by:</span> PM</p>
                          <p><span className="font-medium">Pushed by:</span> PMAG</p>
                        </div>
                      </div>
                      <div className="flex flex-col justify-center md:items-end">
                        <div className="flex flex-wrap items-center gap-2 mb-2">
                          <Badge variant={getStatusVariant(entry.status)} className="px-3 py-1 text-xs font-medium">
                            {getStatusText(entry.status)}
                          </Badge>
                        </div>
                        <Button 
                          onClick={() => {
                            // Set the selected entry and show it in a detail modal
                            setSelectedArchivedEntry(entry);
                            setShowHistoryModal(false);
                            setShowArchivedModal(true);
                          }}
                          className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-800 transition-all duration-200"
                          size="sm"
                        >
                          <Eye className="w-4 h-4 mr-1" />
                          Go to Data
                        </Button>
                      </div>
                    </div>
                  </motion.div>
                );
              })
            )}
          </div>
          <div className="flex justify-end pt-4">
            <Button onClick={() => setShowHistoryModal(false)}>Close</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Archived List Modal */}
      <Dialog open={showArchivedListModal} onOpenChange={setShowArchivedListModal}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Archived Sheets</DialogTitle>
          </DialogHeader>
          <div className="space-y-6">
            {archivedEntries.length === 0 ? (
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.3 }}
                className="text-center py-8 text-muted-foreground"
              >
                <FolderPlus className="mx-auto h-12 w-12 opacity-50" />
                <p className="mt-2">No archived entries found</p>
              </motion.div>
            ) : (
              archivedEntries.map((entry, entryIndex) => {
                const entryData = typeof entry.data_json === 'string' ? JSON.parse(entry.data_json) : entry.data_json;
                
                return (
                  <motion.div 
                    key={entry.id} 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: entryIndex * 0.1 }}
                    className="border rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow duration-200 bg-white dark:bg-gray-800"
                  >
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <h3 className="font-semibold text-lg mb-1">Entry #{entry.id}</h3>
                        <div className="space-y-1 text-sm">
                          <p><span className="font-medium">Sheet:</span> {entry.sheet_type.replace(/_/g, ' ')}</p>
                          <p><span className="font-medium">Project:</span> {entryData?.staticHeader?.projectInfo || 'N/A'}</p>
                        </div>
                      </div>
                      <div>
                        <div className="space-y-1 text-sm">
                          <p><span className="font-medium">Submitted by:</span> {entry.supervisor_name || 'Supervisor'}</p>
                          <p><span className="font-medium">Approved by:</span> PM</p>
                          <p><span className="font-medium">Pushed by:</span> PMAG</p>
                        </div>
                      </div>
                      <div className="flex flex-col justify-center md:items-end">
                        <div className="flex flex-wrap items-center gap-2 mb-2">
                          <Badge variant="default" className="bg-green-500 px-3 py-1 text-xs font-medium dark:bg-green-600">
                            Final Approved
                          </Badge>
                        </div>
                        <Button 
                          onClick={() => {
                            setSelectedArchivedEntry(entry);
                            setShowArchivedListModal(false);
                            setShowArchivedModal(true);
                          }}
                          className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-800 transition-all duration-200"
                          size="sm"
                        >
                          <Eye className="w-4 h-4 mr-1" />
                          Go to Data
                        </Button>
                      </div>
                    </div>
                  </motion.div>
                );
              })
            )}
          </div>
          <div className="flex justify-end pt-4">
            <Button onClick={() => setShowArchivedListModal(false)}>Close</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Archived Sheet Modal */}
      <Dialog open={showArchivedModal} onOpenChange={setShowArchivedModal}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Archived Sheet Details</DialogTitle>
          </DialogHeader>
          {selectedArchivedEntry && (
            <div className="space-y-6">
              {/* Entry Header */}
              <div className="flex flex-col md:flex-row md:items-center justify-between mb-4 pb-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700 rounded-t-lg p-3">
                <div className="flex flex-col mb-3 md:mb-0">
                  <span className="font-semibold text-lg">Entry #{selectedArchivedEntry.id}</span>
                  <span className="text-sm text-muted-foreground">
                    Submitted by: {selectedArchivedEntry.supervisor_name || 'Supervisor'} ({selectedArchivedEntry.supervisor_email})
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Final Approved: {new Date(selectedArchivedEntry.updated_at).toLocaleString()}
                  </span>
                  <span className="text-xs font-medium text-primary mt-1">
                    Project ID: {selectedArchivedEntry.project_id} | Sheet Type: {selectedArchivedEntry.sheet_type.replace(/_/g, ' ')}
                  </span>
                </div>
                <div className="flex items-center space-x-2 flex-wrap">
                  <Badge variant="default" className="bg-green-500 px-3 py-1 text-xs font-medium dark:bg-green-600">
                    Final Approved
                  </Badge>
                </div>
              </div>

              {/* Sheet Data */}
              {(() => {
                const entryData = typeof selectedArchivedEntry.data_json === 'string' ? JSON.parse(selectedArchivedEntry.data_json) : selectedArchivedEntry.data_json;
                
                // Convert data to the format expected by ExcelTable
                const columns = entryData?.rows && entryData.rows.length > 0 
                  ? Object.keys(entryData.rows[0]).map(key => key.replace(/([A-Z])/g, ' $1').trim().toUpperCase())
                  : [];
                
                // Convert array of objects to array of arrays
                const tableData = entryData?.rows 
                  ? entryData.rows.map((row: any) => Object.values(row))
                  : [];
                
                return (
                  <>
                    {/* Static Header */}
                    {entryData?.staticHeader && (
                      <div className="bg-blue-50 dark:bg-blue-900/30 p-3 rounded mb-4 border border-blue-100 dark:border-blue-800">
                        <p className="text-sm"><strong>Project:</strong> {entryData.staticHeader.projectInfo}</p>
                        <p className="text-sm"><strong>Reporting Date:</strong> {entryData.staticHeader.reportingDate}</p>
                        <p className="text-sm"><strong>Progress Date:</strong> {entryData.staticHeader.progressDate}</p>
                      </div>
                    )}

                    {/* Data Table */}
                    {entryData?.rows && entryData.rows.length > 0 && (
                      <div className="mb-4">
                        <StyledExcelTable
                          title="Archived Sheet Data"
                          columns={columns}
                          data={tableData}
                          onDataChange={() => {}}
                          onSave={() => {}}
                          onSubmit={() => {}}
                          isReadOnly={true}
                          status="final_approved"
                        />
                      </div>
                    )}

                    {/* Total Manpower (if applicable) */}
                    {entryData?.totalManpower !== undefined && (
                      <div className="mt-4 p-3 bg-green-50 dark:bg-green-900/30 rounded border border-green-200 dark:border-green-800">
                        <p className="text-sm font-semibold">Total Manpower: {entryData.totalManpower}</p>
                      </div>
                    )}
                  </>
                );
              })()}

              {/* Action Buttons */}
              <div className="flex justify-end space-x-2 pt-4 border-t">
                <Button 
                  variant="outline" 
                  onClick={() => setShowArchivedModal(false)}
                >
                  Close
                </Button>
                <Button 
                  variant="default"
                  onClick={() => {
                    // TODO: Implement push functionality
                    console.log('Push archived entry', selectedArchivedEntry.id);
                    toast.success('Sheet pushed successfully');
                    setShowArchivedModal(false);
                  }}
                  className="bg-blue-600 hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-800"
                >
                  <Check className="w-4 h-4 mr-1" />
                  Confirm Push
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </motion.div>
  );
};

export default PMAGDashboard;