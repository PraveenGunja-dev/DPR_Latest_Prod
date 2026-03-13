import { motion } from "framer-motion";
import { useLocation } from "react-router-dom";
import { Navbar } from "@/components/Navbar";
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/modules/auth/contexts/AuthContext";
import { useNotification } from "@/modules/auth/contexts/NotificationContext";
import { registerUser } from "@/modules/auth/services/authService";
import { createProject, assignProjectToSupervisor } from "@/modules/auth/services/projectService";
import { toast } from "sonner";
import { DashboardLayout } from "@/components/shared/DashboardLayout";
import { PMRGDashboardSummary, PMRGSheetEntries, PMRGChartsSection, PMRGProjectsTable } from "./pmrg-components";
import { fetchData, fetchApprovedEntries, handleFinalApprove as handleFinalApproveService, handleRejectToPM as handleRejectToPMService } from "./services";
import { FileCheck, TrendingUp, Users, Award, FolderPlus, Activity } from "lucide-react";

const PMRGDashboard = () => {
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
    Role: "Site PM" as "Site PM" | "PMAG", // PMRG can only create Site PMs and other PMRG users
    assignProject: false,
    ProjectId: "" as string | number
  });
  const [assignForm, setAssignForm] = useState({
    projectId: "",
    supervisorId: ""
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

  // Fetch projects and supervisors
  const loadData = async () => {
    try {
      const data = await fetchData();
      setProjects(Array.isArray(data?.projects) ? data.projects : []);
      setSupervisors(Array.isArray(data?.teamMembers) ? data.teamMembers : []);

      // Fetch approved entries for PMRG review
      await loadApprovedEntries();
    } catch (error) {
      toast.error("Failed to fetch data");
    }
  };

  // Fetch approved entries from PM
  const loadApprovedEntries = async () => {
    try {
      setLoadingEntries(true);
      const entries = await fetchApprovedEntries();
      setApprovedEntries(Array.isArray(entries) ? entries : []);
    } catch (error) {
      toast.error("Failed to load approved sheets");
    } finally {
      setLoadingEntries(false);
    }
  };

  // Handle tab change with auto-refresh
  const handleTabChange = (value: string) => {
    setActiveTab(value);
    // Auto-refresh when switching tabs
    loadApprovedEntries();
  };

  // Toggle fullscreen mode
  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
  };

  // Handle final approval by PMRG
  const handleFinalApprove = async (entryId: number) => {
    try {
      await handleFinalApproveService(entryId);

      // Find the entry that was approved to get details for notification
      const entry = (Array.isArray(approvedEntries) ? approvedEntries : []).find(e => e && e.id === entryId);
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
      await loadApprovedEntries();
    } catch (error) {
      toast.error("Failed to give final approval");
    }
  };

  // Handle reject by PMRG (send back to PM)
  const handleRejectToPM = async (entryId: number) => {
    try {
      await handleRejectToPMService(entryId);

      // Find the entry that was rejected to get details for notification
      const entry = (Array.isArray(approvedEntries) ? approvedEntries : []).find(e => e && e.id === entryId);
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
      await loadApprovedEntries();
    } catch (error) {
      toast.error("Failed to reject entry");
    }
  };

  const handleCreateUser = () => {
    setShowRegisterModal(true);
  };

  const handleCreateProject = () => {
    setShowCreateProjectModal(true);
  };

  const handleAssignProject = () => {
    console.log("Supervisors available for assignment:", supervisors); // Debug log
    console.log("Number of supervisors:", (Array.isArray(supervisors) ? supervisors.length : 0)); // Debug log
    setShowAssignProjectModal(true);
  };

  useEffect(() => {
    loadData();
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

  const handleAssignFormChange = (field: string, value: string) => {
    setAssignForm(prev => ({
      ...prev,
      [field]: value
    }));
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
      loadData();
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
        Role: registerForm.Role as "Site PM" | "PMAG" // Type assertion for PMRG-created users
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
      loadData();
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
      await assignProjectToSupervisor(
        parseInt(assignForm.projectId),
        parseInt(assignForm.supervisorId)
      );

      toast.success("Project assigned successfully!");
      setShowAssignProjectModal(false);

      // Reset form
      setAssignForm({
        projectId: "",
        supervisorId: ""
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Project assignment failed');
    } finally {
      setAssignLoading(false);
    }
  };

  const statsData = [
    { title: "Total Projects", value: (Array.isArray(projects) ? projects.length : 0), icon: FolderPlus, trend: { value: 12, isPositive: true } },
    { title: "Active Projects", value: (Array.isArray(projects) ? projects.filter(p => p && p.Status === "active").length : 0), icon: Activity, trend: { value: 8, isPositive: true } },
    { title: "Total Supervisors", value: (Array.isArray(supervisors) ? supervisors.length : 0), icon: Users, trend: { value: 3, isPositive: true } },
    { title: "Completed Projects", value: (Array.isArray(projects) ? projects.filter(p => p && p.Status === "completed").length : 0), icon: Award, trend: { value: 2, isPositive: true } },
  ];

  const projectChartData = (Array.isArray(projects) ? projects : []).slice(0, 5).map(project => ({
    name: project?.Name || "Unnamed",
    progress: project?.PercentComplete || 0
  }));

  const progressData = [
    { name: 'Jan', progress: 45 },
    { name: 'Feb', progress: 52 },
    { name: 'Mar', progress: 48 },
    { name: 'Apr', progress: 78 },
    { name: 'May', progress: 65 },
    { name: 'Jun', progress: 80 },
  ];

  return (
    <DashboardLayout
      userName={user?.Name || "User"}
      userRole={user?.Role || "PMRG"}
      projectName={projectName}
      onAddUser={handleCreateUser}
      onAddProject={handleCreateProject}
      onAssignProject={handleAssignProject}
    >
      {/* Summary Section */}
      <PMRGDashboardSummary statsData={statsData} />

      {/* PM Approved Sheets - Awaiting PMRG Review with Tabs */}
      <PMRGSheetEntries
        approvedEntries={approvedEntries}
        activeTab={activeTab}
        handleTabChange={handleTabChange}
        handleFinalApprove={handleFinalApprove}
        handleRejectToPM={handleRejectToPM}
        loadingEntries={loadingEntries}
        isFullscreen={isFullscreen}
        toggleFullscreen={toggleFullscreen}
      />

      {/* Charts Section */}
      <PMRGChartsSection projectChartData={projectChartData} progressData={progressData} />

      {/* Projects Table */}
      <PMRGProjectsTable projects={projects} handleCreateProject={handleCreateProject} />

      {/* Modals are kept in the main component as they have complex state management */}
      {/* Create User Modal */}
      {/* Assign Project Modal */}
      {/* Success Modal */}
    </DashboardLayout>
  );
};

export default PMRGDashboard;