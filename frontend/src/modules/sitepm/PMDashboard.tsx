import { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { useAuth } from "@/modules/auth/contexts/AuthContext";
import { Navbar } from "@/components/Navbar";
import { toast } from "sonner";
import { useNotification } from "@/modules/auth/contexts/NotificationContext";
import {
  PMDashboardSummary,
  PMChartsSection,
  PMEditEntryModal,
  PMCreateSupervisorModal,
  PMAssignProjectModal,
  PMSuccessModal,
  PMRejectReasonModal,
  SheetListModal
} from "./components";
import {
  fetchSubmittedEntries,
  fetchUserProjects,
  fetchSupervisors,
  approveEntry,
  rejectEntry,
  updateEntry,
  createSupervisor,
  assignProject,
  assignMultipleProjects,
  formatDate
} from "./services";

const PMDashboard = () => {
  const location = useLocation();
  const { user } = useAuth();
  const { addNotification } = useNotification();

  // Extract project data from location state
  const locationState = location.state || {};
  const projectName = locationState.projectName || "Project";
  const projectId = locationState.projectId || null;
  const projectDetails = locationState.projectDetails || null;

  const [submittedEntries, setSubmittedEntries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateSupervisorModal, setShowCreateSupervisorModal] = useState(false);
  const [editingEntry, setEditingEntry] = useState<any>(null);
  const [editData, setEditData] = useState<any>(null);
  const [projects, setProjects] = useState<any[]>([]);

  // State for multiple supervisor assignment
  const [showAssignProjectModal, setShowAssignProjectModal] = useState(false);
  const [supervisors, setSupervisors] = useState<any[]>([]);

  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [registeredUser, setRegisteredUser] = useState({
    email: "",
    password: "",
    role: "supervisor", // Site PM can only create supervisors
    projectId: "" as string | number | null,
    projectName: "" as string | null
  });

  // State for Sheet List Modal
  const [sheetListModalConfig, setSheetListModalConfig] = useState<{
    isOpen: boolean;
    title: string;
    entries: any[];
  }>({
    isOpen: false,
    title: "",
    entries: []
  });

  // Function to fetch entries
  const fetchEntries = async () => {
    try {
      setLoading(true);
      const entries = await fetchSubmittedEntries(projectId);
      setSubmittedEntries(entries);
    } catch (error: any) {
      toast.error(error.message || "Failed to load submitted sheets");
    } finally {
      setLoading(false);
    }
  };

  // Handle approve entry
  const handleApprove = async (entryId: number) => {
    try {
      await approveEntry(entryId);

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

      // Update modal list if it's open
      if (sheetListModalConfig.isOpen) {
        setSheetListModalConfig(prev => ({
          ...prev,
          entries: prev.entries.filter(e => e.id !== entryId)
        }));
      }
    } catch (error) {
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
      await updateEntry(editingEntry.id, editData);
      toast.success("Entry updated successfully");
      setEditingEntry(null);
      setEditData(null);
      await fetchEntries();
    } catch (error) {
      toast.error(`Failed to update entry: ${(error as Error).message || 'Unknown error'}`);
    }
  };

  // State for rejection reason modal
  const [showRejectReasonModal, setShowRejectReasonModal] = useState(false);
  const [rejectingEntryId, setRejectingEntryId] = useState<number | null>(null);
  const [rejectingEntrySheetType, setRejectingEntrySheetType] = useState<string>('');

  // Handle reject entry
  const handleReject = async (entryId: number, sheetType: string) => {
    setRejectingEntryId(entryId);
    setRejectingEntrySheetType(sheetType);
    setShowRejectReasonModal(true);
  };

  // Handle confirm reject with reason
  const handleConfirmReject = async (rejectionReason: string) => {
    if (!rejectingEntryId) return;

    try {
      await rejectEntry(rejectingEntryId, rejectionReason);

      // Find the entry that was rejected to get details for notification
      const entry = submittedEntries.find(e => e.id === rejectingEntryId);
      if (entry) {
        // Add notification for rejection
        addNotification({
          title: "Sheet Rejected",
          message: `The ${entry.sheet_type.replace(/_/g, ' ')} sheet from ${entry.supervisor_name || 'a supervisor'} has been rejected and sent back for revision. Reason: ${rejectionReason}`,
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

      // Update modal list if it's open
      if (sheetListModalConfig.isOpen) {
        setSheetListModalConfig(prev => ({
          ...prev,
          entries: prev.entries.filter(e => e.id !== rejectingEntryId)
        }));
      }
    } catch (error) {
      toast.error(`Failed to reject entry: ${(error as Error).message || 'Unknown error'}`);
    } finally {
      // Reset rejection state
      setRejectingEntryId(null);
      setRejectingEntrySheetType('');
      setShowRejectReasonModal(false);
    }
  };

  // Fetch all data in parallel on mount
  useEffect(() => {
    if (user && user.Role === 'Site PM') {
      const loadAllData = async () => {
        try {
          // Fetch all data in parallel for faster loading
          const [entriesData, projectsData, supervisorsData] = await Promise.all([
            fetchSubmittedEntries(projectId),
            fetchUserProjects(),
            fetchSupervisors()
          ]);

          setSubmittedEntries(entriesData);
          setProjects(projectsData);
          setSupervisors(supervisorsData);
        } catch (error) {
          toast.error("Failed to fetch data");
        } finally {
          setLoading(false);
        }
      };

      loadAllData();
    }
  }, [projectId, user]);

  // Handle update entry
  const handleUpdateEntry = async (entryId: number, data: any) => {
    try {
      await updateEntry(entryId, data);
      toast.success("Entry updated successfully");
      await fetchEntries();
    } catch (error) {
      toast.error(`Failed to update entry: ${(error as Error).message || 'Unknown error'}`);
    }
  };

  // Handle save entry
  const handleSaveEntry = async (entryId: number, data: any) => {
    try {
      await updateEntry(entryId, data);
      toast.success("Entry saved successfully");
      await fetchEntries();
    } catch (error) {
      toast.error(`Failed to save entry: ${(error as Error).message || 'Unknown error'}`);
    }
  };

  // Handle user created
  const handleUserCreated = async () => {
    // Refresh data after user creation
    await fetchEntries();

    // Refresh projects and supervisors
    try {
      const projectsData = await fetchUserProjects();
      setProjects(projectsData);

      const supervisorsData = await fetchSupervisors();
      setSupervisors(supervisorsData);
    } catch (error) {
      toast.error("Failed to refresh data after user creation");
    }
  };

  // Handle assignment complete
  const handleAssignmentComplete = async () => {
    // Refresh data after assignment
    await fetchEntries();

    // Refresh projects and supervisors
    try {
      const projectsData = await fetchUserProjects();
      setProjects(projectsData);

      const supervisorsData = await fetchSupervisors();
      setSupervisors(supervisorsData);
    } catch (error) {
      toast.error("Failed to refresh data after assignment");
    }
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
        onAddUser={() => setShowCreateSupervisorModal(true)}
        onAssignProject={() => setShowAssignProjectModal(true)}
      />

      <div className="container mx-auto px-4 py-8">
        <PMDashboardSummary
          projectName={projectName}
          userName={user?.Name}
          projectDetails={projectDetails}
          formatDate={formatDate}
          submittedEntries={submittedEntries}
          loading={loading}
          onRefresh={fetchEntries}
          onStatClick={(filterType, entries, title) => {
            setSheetListModalConfig({ isOpen: true, title, entries });
          }}
        />

        <PMChartsSection
          submittedEntries={submittedEntries}
          onStatClick={(filterType, entries, title) => {
            setSheetListModalConfig({ isOpen: true, title, entries });
          }}
        />

      </div>

      {/* Modals */}
      <SheetListModal
        isOpen={sheetListModalConfig.isOpen}
        onClose={() => setSheetListModalConfig(prev => ({ ...prev, isOpen: false }))}
        title={sheetListModalConfig.title}
        entries={sheetListModalConfig.entries}
        onApprove={handleApprove}
        onReject={handleReject}
        onEdit={(entry) => {
          handleEditEntry(entry);
          setSheetListModalConfig(prev => ({ ...prev, isOpen: false })); // close modal on edit
        }}
      />

      <PMEditEntryModal
        editingEntry={editingEntry}
        editData={editData}
        setEditData={setEditData}
        isOpen={!!editingEntry}
        onClose={() => setEditingEntry(null)}
        onSave={handleSaveEdit}
      />

      <PMCreateSupervisorModal
        isOpen={showCreateSupervisorModal}
        onClose={() => setShowCreateSupervisorModal(false)}
        projects={projects}
        onUserCreated={handleUserCreated}
      />

      <PMAssignProjectModal
        isOpen={showAssignProjectModal}
        onClose={() => setShowAssignProjectModal(false)}
        projects={projects}
        supervisors={supervisors}
        onAssignmentComplete={handleAssignmentComplete}
      />

      <PMSuccessModal
        isOpen={showSuccessModal}
        onClose={() => setShowSuccessModal(false)}
        registeredUser={registeredUser}
        projects={projects}
      />

      <PMRejectReasonModal
        isOpen={showRejectReasonModal}
        onClose={() => {
          setShowRejectReasonModal(false);
          setRejectingEntryId(null);
          setRejectingEntrySheetType('');
        }}
        onConfirm={handleConfirmReject}
        entryId={rejectingEntryId || 0}
        sheetType={rejectingEntrySheetType}
      />
    </motion.div>
  );
};

export default PMDashboard;