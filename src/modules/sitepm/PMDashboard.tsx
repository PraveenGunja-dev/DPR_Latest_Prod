import { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { 
  FileSpreadsheet, 
  Grid3X3, 
  Wrench, 
  Building, 
  Package, 
  User, 
  Check, 
  X, 
  Plus, 
  Eye,
  FileText,
  CheckCircle,
  Clock,
  AlertCircle,
  Edit,
  Maximize,
  Minimize,
  RefreshCw
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/modules/auth/contexts/AuthContext";
import { useNotification } from "@/modules/auth/contexts/NotificationContext";
import { getEntriesForPMReview, approveEntryByPM, rejectEntryByPM, updateEntryByPM } from "@/modules/auth/services/dprSupervisorService";
import { registerUser } from "@/modules/auth/services/authService";
import { getUserProjects, assignProjectToSupervisor } from "@/modules/auth/services/projectService";
import { StyledExcelTable } from "@/components/StyledExcelTable";
import { toast } from "sonner";
import { Navbar } from "@/components/Navbar";
import { StatsCard } from "@/components/StatsCard";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart, CartesianGrid, XAxis, YAxis, Tooltip, Bar } from "recharts";
import { PieChart, Pie, Cell } from "recharts";

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

  // Filter entries by sheet type
  const getEntriesBySheetType = (sheetType: string) => {
    // Filter by sheet type and optionally by project ID if specified
    if (projectId) {
      return submittedEntries.filter(entry => 
        entry.sheet_type === sheetType && entry.project_id === projectId
      );
    } else {
      // If no project specified, show all entries for this sheet type
      return submittedEntries.filter(entry => entry.sheet_type === sheetType);
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
      toast.error("Failed to approve entry");
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
      toast.error("Failed to update entry");
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
      toast.error("Failed to reject entry");
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

  // Fetch projects for the PM
  useEffect(() => {
    const fetchProjects = async () => {
      try {
        const projectsData = await getUserProjects();
        setProjects(projectsData);
      } catch (error) {
        console.error("Failed to fetch projects:", error);
        toast.error("Failed to fetch projects");
      }
    };

    if (user && user.Role === 'Site PM') {
      fetchProjects();
    }
  }, [user]);

  // Handle tab change with auto-refresh
  const handleTabChange = (value: string) => {
    setActiveTab(value);
    // Auto-refresh when switching tabs
    fetchEntries();
  };

  // Toggle fullscreen mode
  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
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

    return (
      <div className="space-y-6">
        {entries.map((entry, entryIndex) => {
          const entryData = typeof entry.data_json === 'string' ? JSON.parse(entry.data_json) : entry.data_json;
          
          return (
            <motion.div 
              key={entry.id} 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: entryIndex * 0.1 }}
              className="border rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow duration-200 bg-white"
            >
              {/* Entry Header */}
              <motion.div 
                className="flex flex-col md:flex-row md:items-center justify-between mb-4 pb-3 border-b border-gray-200 bg-gray-50 rounded-t-lg p-3"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: entryIndex * 0.1 + 0.1 }}
              >
                <div className="flex flex-col mb-3 md:mb-0">
                  <span className="font-semibold text-lg">Entry #{entry.id}</span>
                  <span className="text-sm text-muted-foreground">
                    Submitted by: {entry.supervisor_name || 'Supervisor'} ({entry.supervisor_email})
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(entry.submitted_at).toLocaleString()}
                  </span>
                  <span className="text-xs font-medium text-primary mt-1">
                    Project ID: {entry.project_id}
                  </span>
                </div>
                <div className="flex items-center space-x-2 flex-wrap">
                  <Badge 
                    variant={
                      entry.status === "submitted_to_pm" ? "secondary" : 
                      entry.status === "approved_by_pm" ? "default" : 
                      "destructive"
                    }
                    className="px-3 py-1 text-xs font-medium"
                  >
                    {entry.status === "submitted_to_pm" ? "Pending Review" : 
                     entry.status === "approved_by_pm" ? "Approved" : 
                     "Rejected"}
                  </Badge>
                  {entry.status === "submitted_to_pm" && (
                    <>
                      <Button 
                        size="sm" 
                        variant="outline"
                        onClick={() => handleEditEntry(entry)}
                        className="transition-colors duration-200 px-3 py-1 h-8"
                      >
                        <Edit className="w-4 h-4 mr-1" />
                        Edit
                      </Button>
                      <Button 
                        size="sm" 
                        variant="default"
                        onClick={() => handleApprove(entry.id)}
                        className="bg-green-600 hover:bg-green-700 transition-colors duration-200 px-3 py-1 h-8"
                      >
                        <Check className="w-4 h-4 mr-1" />
                        Approve
                      </Button>
                      <Button 
                        size="sm" 
                        variant="destructive"
                        onClick={() => handleReject(entry.id)}
                        className="transition-colors duration-200 px-3 py-1 h-8"
                      >
                        <X className="w-4 h-4 mr-1" />
                        Reject
                      </Button>
                    </>
                  )}
                  {entry.status === "approved_by_pm" && (
                    <Badge variant="outline" className="text-green-600 border-green-600 px-3 py-1 text-xs font-medium">
                      <CheckCircle className="w-4 h-4 mr-1" />
                      Sent to PMAG
                    </Badge>
                  )}
                </div>
              </motion.div>

              {/* Sheet Information */}
              {entryData?.staticHeader && (
                <motion.div 
                  className="bg-blue-50 p-3 rounded mb-4 border border-blue-100"
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: entryIndex * 0.1 + 0.2 }}
                  whileHover={{ scale: 1.01 }}
                >
                  <p className="text-sm"><strong>Project:</strong> {entryData.staticHeader.projectInfo}</p>
                  <p className="text-sm"><strong>Reporting Date:</strong> {entryData.staticHeader.reportingDate}</p>
                  <p className="text-sm"><strong>Progress Date:</strong> {entryData.staticHeader.progressDate}</p>
                </motion.div>
              )}

              {/* Data Table */}
              {entryData?.rows && entryData.rows.length > 0 && (
                <motion.div 
                  className={`overflow-x-auto mb-4 rounded-lg border border-gray-200 ${isFullscreen ? 'fixed inset-0 z-50 bg-white p-4 overflow-auto' : ''}`}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: entryIndex * 0.1 + 0.3 }}
                >
                  {isFullscreen && (
                    <div className="flex justify-between items-center mb-4 p-2 border-b">
                      <h3 className="text-lg font-semibold">Fullscreen View - {entryData.rows.length} Rows</h3>
                      <Button 
                        onClick={toggleFullscreen}
                        variant="outline"
                        size="sm"
                      >
                        <Minimize className="w-4 h-4 mr-1" />
                        Exit Fullscreen
                      </Button>
                    </div>
                  )}
                  <div className={isFullscreen ? 'overflow-auto max-h-[calc(100vh-120px)]' : 'max-h-96 overflow-y-auto'}>
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
                  {!isFullscreen && entryData.rows.length > 50 && (
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
                </motion.div>
              )}

              {/* Total Manpower (if applicable) */}
              {entryData?.totalManpower !== undefined && (
                <motion.div 
                  className="mt-4 p-3 bg-green-50 rounded border border-green-200"
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: entryIndex * 0.1 + 0.5 }}
                  whileHover={{ scale: 1.01 }}
                >
                  <p className="text-sm font-semibold">Total Manpower: {entryData.totalManpower}</p>
                </motion.div>
              )}
            </motion.div>
          );
        })}
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
  
  // Reset registered user state when closing the success modal
  const handleSuccessModalClose = () => {
    setShowSuccessModal(false);
    setRegisteredUser({
      email: "",
      password: "",
      role: "supervisor",
      projectId: null,
      projectName: null
    });
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
              <div className="bg-primary/10 px-4 py-2 rounded-lg">
                <div className="flex items-center">
                  <FileText className="w-5 h-5 text-primary mr-2" />
                  <span className="font-medium">Validation Dashboard</span>
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
        </div>
      </div>

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
              <div className="bg-muted p-3 rounded-lg">
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
                    <div className="bg-muted p-3 rounded mb-4">
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
                    isReadOnly={false}
                  />
                </div>
              )}
              
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
    </motion.div>
  );
};

export default PMDashboard;