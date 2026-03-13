import { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { useAuth } from "@/modules/auth/contexts/AuthContext";
import { useNotification } from "@/modules/auth/contexts/NotificationContext";
import { toast } from "sonner";
import { DashboardLayout } from "@/components/shared/DashboardLayout";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  PMAGDashboardSummary,
  PMAGSheetEntries,
  PMAGChartsSection,
  PMAGUserManagementModals,
  PMAGSuccessModal
} from "./components";
import { PMAGDashboardDetailModal, DashboardModalType } from "./components/PMAGDashboardDetailModal";
import { SnapshotFilterModal } from "@/modules/superadmin/components/SnapshotFilterModal";
import { DateComparisonModal } from "@/components/shared/DateComparisonModal";
import { fetchData, fetchApprovedEntries, fetchHistoryEntries, fetchArchivedEntries, finalApproveEntry, rejectEntry, pushEntryToP6 } from "./services";
import { getP6ActivitiesForProject, P6Activity } from "@/services/p6ActivityService";
import { ViewUserModal } from "@/modules/superadmin/components/ViewUserModal";
import { getProjectsForUser } from "@/modules/auth/services/projectService";

const PMAGDashboard = () => {
  const location = useLocation();
  const { user } = useAuth();
  const { addNotification } = useNotification();
  const { projectName, projectId, activeTab: initialActiveTab, entryId: entryIdFromLocation } = location.state || {
    projectName: "Project",
    projectId: null,
    activeTab: null,
    entryId: null
  };

  const [showCreateUserModal, setShowCreateUserModal] = useState(false);
  const [showCreateProjectModal, setShowCreateProjectModal] = useState(false);
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [showAssignProjectModal, setShowAssignProjectModal] = useState(false);
  const [projects, setProjects] = useState<any[]>([]);
  const [p6Activities, setP6Activities] = useState<P6Activity[]>([]);
  const [teamMembers, setTeamMembers] = useState<any[]>([]);
  const [approvedEntries, setApprovedEntries] = useState<any[]>([]);
  const [historyEntries, setHistoryEntries] = useState<any[]>([]);
  const [historyFilter, setHistoryFilter] = useState<number | null>(7); // Default to 7 days
  const [archivedEntries, setArchivedEntries] = useState<any[]>([]);
  const [selectedArchivedEntry, setSelectedArchivedEntry] = useState<any>(null);
  const [showArchivedModal, setShowArchivedModal] = useState(false);

  // Unified Detail Modal State
  const [detailModalState, setDetailModalState] = useState<{
    isOpen: boolean;
    type: DashboardModalType;
    data: any[];
    title?: string;
  }>({
    isOpen: false,
    type: null,
    data: [],
    title: undefined
  });

  const [loadingEntries, setLoadingEntries] = useState(false);
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
    ProjectId: "" as string | number,
    sheetTypes: [] as string[]
  });
  const [assignForm, setAssignForm] = useState({
    projectIds: [] as string[],  // Changed to array for multiple projects
    supervisorIds: [] as string[],
    sheetTypes: [] as string[]
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
  const [projectSearchTerm, setProjectSearchTerm] = useState('');
  const [supervisorSearchTerm, setSupervisorSearchTerm] = useState('');
  const [expandedEntries, setExpandedEntries] = useState<Record<number, boolean>>({});
  const [showSnapshotFilter, setShowSnapshotFilter] = useState(false);
  const [showComparisonModal, setShowComparisonModal] = useState(false);

  // Add state for View User Modal
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [userProjects, setUserProjects] = useState<any[]>([]);
  const [viewUserLoading, setViewUserLoading] = useState(false);
  const [showViewUserModal, setShowViewUserModal] = useState(false);

  // Fetch P6 Activities
  const loadP6Activities = async () => {
    if (projectId) {
      try {
        const activities = await getP6ActivitiesForProject(projectId);
        setP6Activities(activities);
      } catch (error) {
        console.error("Failed to load P6 activities", error);
      }
    }
  };

  // Fetch projects and supervisors
  const loadInitialData = async () => {
    try {
      // Fetch all data in parallel for faster loading
      const [data, approvedEntriesData] = await Promise.all([
        fetchData(projectId), // Pass projectId
        fetchApprovedEntries(projectId) // Pass projectId
      ]);

      setProjects(Array.isArray(data?.projects) ? data.projects : []);
      setTeamMembers(Array.isArray(data?.teamMembers) ? data.teamMembers : []);
      setApprovedEntries(Array.isArray(approvedEntriesData) ? approvedEntriesData : []);

      // Load P6 activities if project is selected
      if (projectId) {
        await loadP6Activities();
      }
    } catch (error) {
      console.error("Failed to fetch data:", error);
      toast.error("Failed to fetch data");
    }
  };

  // Fetch approved entries from PM
  const loadApprovedEntries = async () => {
    try {
      setLoadingEntries(true);
      const entries = await fetchApprovedEntries(projectId); // Pass projectId
      setApprovedEntries(Array.isArray(entries) ? entries : []);
    } catch (error) {
      console.error('Error fetching approved entries:', error);
      toast.error("Failed to load approved sheets");
    } finally {
      setLoadingEntries(false);
    }
  };

  // Fetch history entries with date filter
  const loadHistoryEntries = async (days?: number | null) => {
    try {
      setLoadingEntries(true);
      const entries = await fetchHistoryEntries(days, projectId); // Pass projectId
      setHistoryEntries(entries || []);
    } catch (error) {
      console.error('Error fetching history entries:', error);
      toast.error("Failed to load history");
    } finally {
      setLoadingEntries(false);
    }
  };

  // Fetch archived entries
  const loadArchivedEntries = async () => {
    try {
      setLoadingEntries(true);
      const entries = await fetchArchivedEntries(projectId); // Pass projectId
      setArchivedEntries(entries || []);
    } catch (error) {
      console.error('Error fetching archived entries:', error);
      toast.error("Failed to load archived sheets");
    } finally {
      setLoadingEntries(false);
    }
  };

  // Handle view user details
  const handleViewUser = async (user: any) => {
    try {
      setSelectedUser(user);
      setShowViewUserModal(true);
      setViewUserLoading(true);

      // Fetch assigned projects for this user
      const projects = await getProjectsForUser(user.ObjectId || user.user_id || user.id); // Handle potential ID variations
      setUserProjects(projects);
    } catch (error) {
      console.error("Failed to load user projects", error);
      toast.error("Failed to load user details");
    } finally {
      setViewUserLoading(false);
    }
  };

  // Handle final approve entry
  const handleFinalApprove = async (entryId: number) => {
    try {
      await finalApproveEntry(entryId);

      // Find the entry that was approved to get details for notification
      const entry = (Array.isArray(approvedEntries) ? approvedEntries : []).find(e => e && e.id === entryId);
      if (entry) {
        // Add notification for successful final approval
        addNotification({
          title: "Sheet Final Approved",
          message: `The ${entry.sheet_type.replace(/_/g, ' ')} sheet has been final approved and archived.`,
          type: "success",
          userId: user?.ObjectId,
          projectId: entry.project_id,
          entryId: entry.id,
          sheetType: entry.sheet_type
        });
      }

      // Refresh entries
      await loadApprovedEntries();
    } catch (error) {
      console.error(`Failed to final approve entry ${entryId}:`, error);
    }
  };

  // Handle reject entry
  const handleReject = async (entryId: number) => {
    try {
      await rejectEntry(entryId);

      // Find the entry that was rejected to get details for notification
      const entry = (Array.isArray(approvedEntries) ? approvedEntries : []).find(e => e && e.id === entryId);
      if (entry) {
        // Add notification for rejection
        addNotification({
          title: "Sheet Rejected to PM",
          message: `The ${entry.sheet_type.replace(/_/g, ' ')} sheet has been rejected and sent back to PM for revision.`,
          type: "warning",
          userId: user?.ObjectId,
          projectId: entry.project_id,
          entryId: entry.id,
          sheetType: entry.sheet_type
        });
      }

      // Refresh entries
      await loadApprovedEntries();
    } catch (error) {
      console.error(`Failed to reject entry ${entryId}:`, error);
    }
  };

  // Handle register form change
  const handleRegisterFormChange = (field: string, value: string | boolean | string[]) => {
    setRegisterForm(prev => ({
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

  // Handle project form change
  const handleProjectFormChange = (field: string, value: string | number) => {
    setProjectForm(prev => ({
      ...prev,
      [field]: value
    }));
  };

  // Handle supervisor selection toggle
  const handleToggleSupervisorSelection = (supervisorId: string) => {
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
  const handleToggleProjectSelection = (projectId: string) => {
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

  // Handle create user
  const handleCreateUser = (e: React.FormEvent) => {
    e.preventDefault();
    setShowCreateUserModal(false);
    setShowRegisterModal(true);
  };

  // Handle create project
  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // In a real implementation, we would call a service function here
      // For now, we'll just show a success message
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
    } catch (error) {
      console.error('Project creation error:', error);
      toast.error('Project creation failed');
    } finally {
      setLoading(false);
    }
  };

  // Handle register user
  const handleRegisterUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegisterLoading(true);

    try {
      // In a real implementation, we would call a service function here
      // For now, we'll just show a success message
      toast.success("User registered successfully!");
      setShowRegisterModal(false);
      setShowSuccessModal(true);

      // Set registered user details
      setRegisteredUser({
        email: registerForm.Email,
        password: registerForm.password,
        role: registerForm.Role,
        projectId: registerForm.assignProject ? registerForm.ProjectId.toString() : null
      });

      // Actually call the service to register user and assign project
      const userData = {
        name: registerForm.Name,
        email: registerForm.Email,
        password: registerForm.password,
        role: registerForm.Role,
        projectId: registerForm.assignProject ? Number(registerForm.ProjectId) : undefined,
        sheetTypes: registerForm.assignProject ? registerForm.sheetTypes : undefined
      };

      // Import registerNewUser from services
      const { registerNewUser } = await import("./services");
      await registerNewUser(userData);

      // Reset form
      setRegisterForm({
        Name: "",
        Email: "",
        password: "",
        Role: "Site PM",
        assignProject: false,
        ProjectId: "",
        sheetTypes: []
      });
    } catch (error) {
      console.error('User registration error:', error);
      toast.error('User registration failed');
    } finally {
      setRegisterLoading(false);
    }
  };

  // Handle assign projects
  const handleAssignProjects = async (e: React.FormEvent) => {
    e.preventDefault();
    setAssignLoading(true);

    try {
      const { assignMultipleProjects } = await import("./services");
      await assignMultipleProjects(
        assignForm.projectIds.map(id => Number(id)),
        assignForm.supervisorIds.map(id => Number(id)),
        assignForm.sheetTypes
      );

      toast.success("Projects assigned successfully!");
      setShowAssignProjectModal(false);

      // Reset form
      setAssignForm({
        projectIds: [],
        supervisorIds: [],
        sheetTypes: []
      });
      setProjectSearchTerm('');
      setSupervisorSearchTerm('');
    } catch (error) {
      console.error('Project assignment error:', error);
      toast.error('Project assignment failed');
    } finally {
      setAssignLoading(false);
    }
  };

  useEffect(() => {
    // Reload data when projectId changes
    loadInitialData();
  }, [projectId]); // Add dependency

  return (
    <DashboardLayout
      userName={user?.Name || "User"}
      userRole={user?.Role || "PMAG"}
      projectName={projectName}
      onAddUser={() => setShowCreateUserModal(true)}
      onCreateProject={() => setShowCreateProjectModal(true)}
      onAssignProject={() => setShowAssignProjectModal(true)}
    >
      <PMAGDashboardSummary
        projectName={projectName}
        userName={user?.Name}
        approvedEntries={approvedEntries}
        historyEntries={historyEntries}
        archivedEntries={archivedEntries}
        teamMembers={teamMembers} // Pass combined team members
        onShowMembers={() => {
          setDetailModalState({
            isOpen: true,
            type: 'members',
            data: teamMembers,
            title: projectId ? `Team Members (${projectName})` : 'All Team Members'
          });
        }}
        onShowApproved={() => {
          setDetailModalState({
            isOpen: true,
            type: 'approved',
            data: approvedEntries,
            title: 'Approved Sheets'
          });
        }}
        onShowSubmitted={async () => {
          // Ensure history is loaded
          await loadHistoryEntries(historyFilter);
          setDetailModalState({
            isOpen: true,
            type: 'submitted',
            data: historyEntries, // This will need to be updated via effect if async
            title: 'Submitted Entries'
          });
        }}
        onShowArchived={async () => {
          await loadArchivedEntries();
          setDetailModalState({
            isOpen: true,
            type: 'archived',
            data: [], // Will be derived in render
            title: 'Archived Sheets'
          });
        }}
        onShowSnapshotFilter={() => setShowSnapshotFilter(true)}
        onShowComparison={async () => {
          await loadHistoryEntries(30); // Pre-load 30 days history for comparison
          setShowComparisonModal(true);
        }}
      />

      <PMAGSheetEntries
        approvedEntries={approvedEntries}
        loadingEntries={loadingEntries}
        onRefresh={loadApprovedEntries}
        onFinalApprove={handleFinalApprove}
        onReject={handleReject}
        expandedEntries={expandedEntries}
        setExpandedEntries={setExpandedEntries}
        onPushToP6={async (entry) => {
          try {
            await pushEntryToP6(entry.id);
            // Refresh data after successful push
            await loadApprovedEntries();
            // Also refresh other lists if needed, e.g. archived or history if it moves there immediately
            // But usually it goes to final_approved which appears in history/archive
            await loadHistoryEntries(historyFilter);
            await loadArchivedEntries();
          } catch (error) {
            console.error("Push to P6 failed:", error);
            // Error is handled by service toast
          }
        }}
      />

      <PMAGChartsSection
        projectId={projectId}
        p6Activities={p6Activities}
        approvedEntries={approvedEntries}
        historyEntries={historyEntries}
        archivedEntries={archivedEntries}
      />

      <PMAGUserManagementModals
        showCreateUserModal={showCreateUserModal}
        setShowCreateUserModal={setShowCreateUserModal}
        showCreateProjectModal={showCreateProjectModal}
        setShowCreateProjectModal={setShowCreateProjectModal}
        showRegisterModal={showRegisterModal}
        setShowRegisterModal={setShowRegisterModal}
        showAssignProjectModal={showAssignProjectModal}
        setShowAssignProjectModal={setShowAssignProjectModal}
        projects={projects}
        supervisors={teamMembers}
        registerForm={registerForm}
        setRegisterForm={setRegisterForm}
        assignForm={assignForm}
        setAssignForm={setAssignForm}
        projectForm={projectForm}
        setProjectForm={setProjectForm}
        registerLoading={registerLoading}
        assignLoading={assignLoading}
        loading={loading}
        projectSearchTerm={projectSearchTerm}
        setProjectSearchTerm={setProjectSearchTerm}
        supervisorSearchTerm={supervisorSearchTerm}
        setSupervisorSearchTerm={setSupervisorSearchTerm}
        onCreateUser={handleCreateUser}
        onCreateProject={handleCreateProject}
        onRegisterUser={handleRegisterUser}
        onAssignProjects={handleAssignProjects}
        onRegisterFormChange={handleRegisterFormChange}
        onAssignFormChange={handleAssignFormChange}
        onProjectFormChange={handleProjectFormChange}
        onToggleSupervisorSelection={handleToggleSupervisorSelection}
        onToggleProjectSelection={handleToggleProjectSelection}
      />

      <PMAGSuccessModal
        showSuccessModal={showSuccessModal}
        setShowSuccessModal={setShowSuccessModal}
        registeredUser={registeredUser}
        projects={projects}
      />

      <PMAGDashboardDetailModal
        isOpen={detailModalState.isOpen}
        onClose={() => setDetailModalState(prev => ({ ...prev, isOpen: false }))}
        type={detailModalState.type}
        data={
          detailModalState.type === 'members' ? teamMembers :
            detailModalState.type === 'approved' ? approvedEntries :
              detailModalState.type === 'submitted' ? historyEntries :
                detailModalState.type === 'archived' ? archivedEntries :
                  []
        }
        title={detailModalState.title}
        onAction={
          detailModalState.type === 'members' ? handleViewUser :
            detailModalState.type === 'archived' || detailModalState.type === 'submitted' ? (entry) => {
              setSelectedArchivedEntry(entry);
              setDetailModalState(prev => ({ ...prev, isOpen: false }));
              setShowArchivedModal(true);
            } : undefined
        }
      />

      {/* View User Modal */}
      <ViewUserModal
        isOpen={showViewUserModal}
        onClose={() => setShowViewUserModal(false)}
        user={selectedUser}
        projects={userProjects}
        loading={viewUserLoading}
      />

      {/* ... existing modal code ... */}



      {/* Archived Entry Detail Modal - Excel Style */}
      <Dialog open={showArchivedModal} onOpenChange={setShowArchivedModal}>
        <DialogContent className="max-w-[95vw] max-h-[95vh] overflow-hidden flex flex-col p-0">
          {selectedArchivedEntry && (
            <>
              {/* Excel-style Header Bar */}
              <div className="flex items-center justify-between px-4 py-3 bg-[#F3F3F3] dark:bg-[#2B2B2B] border-b-2 border-[#999999]">
                <div className="flex items-center gap-4">
                  <h2 className="text-lg font-bold text-black dark:text-white">
                    📊 {selectedArchivedEntry.sheet_type?.replace(/_/g, ' ').toUpperCase() || 'Sheet Details'}
                  </h2>
                  <span className="text-xs text-gray-600 dark:text-gray-400">
                    Entry #{selectedArchivedEntry.id}
                  </span>
                  <span style={{
                    padding: "3px 10px",
                    borderRadius: "4px",
                    fontSize: "10px",
                    fontWeight: "600",
                    backgroundColor:
                      selectedArchivedEntry.status === 'final_approved' || selectedArchivedEntry.status === 'archived' ? '#dcfce7' :
                        selectedArchivedEntry.status === 'rejected' ? '#fee2e2' :
                          selectedArchivedEntry.status === 'pm_approved' ? '#dbeafe' :
                            '#fef3c7',
                    color:
                      selectedArchivedEntry.status === 'final_approved' || selectedArchivedEntry.status === 'archived' ? '#166534' :
                        selectedArchivedEntry.status === 'rejected' ? '#991b1b' :
                          selectedArchivedEntry.status === 'pm_approved' ? '#1e40af' :
                            '#92400e'
                  }}>
                    {selectedArchivedEntry.status?.replace(/_/g, ' ').toUpperCase() || 'DRAFT'}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    Submitted by: <strong>{selectedArchivedEntry.supervisor_name || 'Supervisor'}</strong>
                  </span>
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {new Date(selectedArchivedEntry.updated_at || selectedArchivedEntry.created_at).toLocaleString('en-IN', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </span>
                </div>
              </div>

              {/* Excel-style Content Area */}
              <div className="flex-1 overflow-auto bg-white dark:bg-[#1E1E1E] p-4">
                {(() => {
                  const entryData = selectedArchivedEntry?.data_json
                    ? (typeof selectedArchivedEntry.data_json === 'string'
                      ? JSON.parse(selectedArchivedEntry.data_json)
                      : selectedArchivedEntry.data_json)
                    : { rows: [] };

                  return (
                    <>
                      {/* Static Header Info */}
                      {entryData?.staticHeader && (
                        <div className="mb-4 rounded-lg overflow-hidden" style={{ border: "2px solid #999999" }}>
                          <div className="bg-[#f1f5f9] dark:bg-[#2B2B2B] px-4 py-2 border-b-2 border-[#94a3b8]">
                            <span className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">📋 Project Information</span>
                          </div>
                          <div className="bg-white dark:bg-[#1E1E1E] p-4 grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-semibold text-gray-500 uppercase">Project:</span>
                              <span className="text-sm font-medium text-black dark:text-white">{entryData.staticHeader.projectInfo}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-semibold text-gray-500 uppercase">Reporting Date:</span>
                              <span className="text-sm font-medium text-black dark:text-white">{entryData.staticHeader.reportingDate}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-semibold text-gray-500 uppercase">Progress Date:</span>
                              <span className="text-sm font-medium text-black dark:text-white">{entryData.staticHeader.progressDate}</span>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Excel-style Data Table */}
                      {Array.isArray(entryData?.rows) && entryData.rows.length > 0 && (
                        <div className="overflow-x-auto rounded-lg" style={{ border: "2px solid #999999" }}>
                          <table className="w-full border-collapse" style={{ minWidth: "100%" }}>
                            <thead style={{ position: "sticky", top: 0, zIndex: 10 }}>
                              <tr>
                                {Object.keys(entryData.rows[0] || {}).map((key, index) => (
                                  <th
                                    key={key}
                                    style={{
                                      backgroundColor: "#f1f5f9",
                                      color: "#000000",
                                      fontSize: "10px",
                                      fontWeight: "700",
                                      padding: "10px 8px",
                                      textAlign: "center",
                                      textTransform: "uppercase",
                                      letterSpacing: "0.5px",
                                      borderBottom: "2px solid #94a3b8",
                                      borderRight: index === Object.keys(entryData.rows[0] || {}).length - 1 ? "none" : "1px solid #cbd5e1",
                                      whiteSpace: "nowrap",
                                      minWidth: "80px"
                                    }}
                                  >
                                    {key.replace(/([A-Z])/g, ' $1').trim().replace(/_/g, ' ')}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {entryData.rows.map((row: any, rowIndex: number) => {
                                const isEvenRow = rowIndex % 2 === 0;
                                const rowBg = isEvenRow ? "#FFFFFF" : "#F8FBFF";

                                return (
                                  <tr key={rowIndex} className="hover:bg-[#EAF2FB] dark:hover:bg-[#2E3238]">
                                    {Object.values(row).map((value: any, colIndex: number) => (
                                      <td
                                        key={`${rowIndex}-${colIndex}`}
                                        style={{
                                          backgroundColor: rowBg,
                                          padding: "8px 10px",
                                          fontSize: "12px",
                                          textAlign: typeof value === 'number' ? "right" : "left",
                                          borderBottom: "1px solid #D4D4D4",
                                          borderRight: colIndex === Object.values(row || {}).length - 1 ? "none" : "1px solid #D4D4D4",
                                          color: "#000000",
                                          whiteSpace: "nowrap"
                                        }}
                                        className="dark:!bg-[#1E1E1E] dark:!text-white"
                                      >
                                        {value !== null && value !== undefined && value !== '' ? value : '-'}
                                      </td>
                                    ))}
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}

                      {/* Total Manpower (if applicable) */}
                      {entryData?.totalManpower !== undefined && (
                        <div className="mt-4 rounded-lg overflow-hidden" style={{ border: "2px solid #22c55e" }}>
                          <div className="bg-[#86efac] px-4 py-2 border-b-2 border-[#22c55e]">
                            <span className="text-xs font-bold text-green-800 uppercase tracking-wider">📊 Summary</span>
                          </div>
                          <div className="bg-[#dcfce7] dark:bg-green-900/30 p-4">
                            <p className="text-lg font-bold text-green-800 dark:text-green-400">
                              Total Manpower: {entryData.totalManpower}
                            </p>
                          </div>
                        </div>
                      )}

                      {/* Show message if no data */}
                      {(!Array.isArray(entryData?.rows) || entryData.rows.length === 0) && !entryData?.staticHeader && (
                        <div className="text-center py-16">
                          <div className="text-6xl mb-4">📭</div>
                          <p className="text-lg font-medium text-gray-600 dark:text-gray-400">No data available for this entry</p>
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>

              {/* Footer Status Bar */}
              <div className="px-4 py-2 bg-[#F4F4F4] dark:bg-[#252525] border-t-2 border-[#999999] flex justify-between items-center">
                <span className="text-xs text-gray-600 dark:text-gray-400">
                  {(() => {
                    const entryData = selectedArchivedEntry?.data_json
                      ? (typeof selectedArchivedEntry.data_json === 'string'
                        ? (JSON.parse(selectedArchivedEntry.data_json) || { rows: [] })
                        : selectedArchivedEntry.data_json)
                      : { rows: [] };
                    const rowCount = (Array.isArray(entryData?.rows) ? entryData.rows.length : 0);
                    const colCount = (Array.isArray(entryData?.rows) && entryData.rows[0]) ? Object.keys(entryData.rows[0]).length : 0;
                    return `${rowCount} rows × ${colCount} columns`;
                  })()}
                </span>
                <span className="text-xs text-gray-500">
                  Project ID: {selectedArchivedEntry.project_id} | Sheet: {selectedArchivedEntry.sheet_type?.replace(/_/g, ' ')}
                </span>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Snapshot Filter Modal */}
      <SnapshotFilterModal
        isOpen={showSnapshotFilter}
        onClose={() => setShowSnapshotFilter(false)}
        projects={projects}
      />

      {/* Date Comparison Modal */}
      <DateComparisonModal
        isOpen={showComparisonModal}
        onClose={() => setShowComparisonModal(false)}
        entries={[
          ...(Array.isArray(approvedEntries) ? approvedEntries : []),
          ...(Array.isArray(historyEntries) ? historyEntries : []),
          ...(Array.isArray(archivedEntries) ? archivedEntries : [])
        ]}
        projectName={projectName}
      />
    </DashboardLayout>
  );
};

export default PMAGDashboard;