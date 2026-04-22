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
    getEntriesForPMReview,
    approveEntryByPM,
    rejectEntryByPM,
    updateEntryByPM,
} from "@/services/dprService";
import {
    getAssignedProjects,
    assignProjectsToMultipleSupervisors
} from "@/services/projectService";
import {
    getAllSupervisors,
    registerUser
} from "@/services/userService";
import { getAllChartsData } from "@/services/chartService";
import { formatDate } from "@/utils/formatters";
import { DPREntry, Project, Supervisor } from "@/types";

const PMDashboard = () => {
    const location = useLocation();
    const { user } = useAuth();
    const { addNotification } = useNotification();

    const locationState = location.state || {};
    const projectName = locationState.projectName || "Project";
    const projectId = locationState.projectId || null;
    const projectDetails = locationState.projectDetails || null;

    const [submittedEntries, setSubmittedEntries] = useState<DPREntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [showCreateSupervisorModal, setShowCreateSupervisorModal] = useState(false);
    const [editingEntry, setEditingEntry] = useState<DPREntry | null>(null);
    const [editData, setEditData] = useState<any>(null);
    const [projects, setProjects] = useState<Project[]>([]);
    const [supervisors, setSupervisors] = useState<Supervisor[]>([]);
    const [showAssignProjectModal, setShowAssignProjectModal] = useState(false);
    const [showSuccessModal, setShowSuccessModal] = useState(false);
    const [registeredUser, setRegisteredUser] = useState({ email: "", password: "", role: "supervisor", projectId: null, projectName: null });

    const [sheetListModalConfig, setSheetListModalConfig] = useState<{ isOpen: boolean; title: string; entries: DPREntry[] }>({
        isOpen: false, title: "", entries: []
    });
    const [advancedChartData, setAdvancedChartData] = useState<any>({
        sCurve: [], dailyProductivity: [], activityHeatmap: [], manpowerEfficiency: [], issuePareto: []
    });

    const fetchEntries = async () => {
        try {
            setLoading(true);
            const entries = await getEntriesForPMReview(projectId);
            setSubmittedEntries(entries);
        } catch (error: any) {
            toast.error(error.message || "Failed to load submitted sheets");
        } finally {
            setLoading(false);
        }
    };

    const handleApprove = async (entryId: number) => {
        try {
            await approveEntryByPM(entryId);
            const entry = submittedEntries.find(e => e.id === entryId);
            if (entry) {
                addNotification({
                    title: "Sheet Approved",
                    message: `The ${entry.sheet_type.replace(/_/g, ' ')} sheet from ${entry.supervisor_name || 'a supervisor'} has been approved and sent to PMAG for final review.`,
                    type: "success",
                    userId: user?.userId || user?.ObjectId,
                    projectId: entry.project_id,
                    entryId: entry.id,
                    sheetType: entry.sheet_type
                });
            }
            toast.success("Entry approved successfully!");
            await fetchEntries();
            if (sheetListModalConfig.isOpen) {
                setSheetListModalConfig(prev => ({ ...prev, entries: prev.entries.filter(e => e.id !== entryId) }));
            }
        } catch (error) {
            toast.error(`Failed to approve: ${(error as Error).message}`);
        }
    };

    const handleEditEntry = (entry: DPREntry) => {
        const entryData = typeof entry.data_json === 'string' ? JSON.parse(entry.data_json) : entry.data_json;
        setEditingEntry(entry);
        setEditData(entryData);
    };

    const handleSaveEdit = async () => {
        if (!editingEntry || !editData) return;
        try {
            await updateEntryByPM(editingEntry.id, editData);
            toast.success("Entry updated successfully");
            setEditingEntry(null);
            setEditData(null);
            await fetchEntries();
        } catch (error) {
            toast.error(`Failed to update: ${(error as Error).message}`);
        }
    };

    const handleUpdateEntry = (entryId: number, data: any) => {
        setEditData(data);
    };

    const handleSaveEditFromEntries = async (entryId: number, data: any) => {
        try {
            await updateEntryByPM(entryId, data);
            toast.success("Entry saved successfully");
            await fetchEntries();
        } catch (error) {
            toast.error(`Failed to save: ${(error as Error).message}`);
        }
    };

    const [showRejectReasonModal, setShowRejectReasonModal] = useState(false);
    const [rejectingEntryId, setRejectingEntryId] = useState<number | null>(null);
    const [rejectingEntrySheetType, setRejectingEntrySheetType] = useState<string>('');
    const [rejectingData, setRejectingData] = useState<any>(null);

    const handleReject = async (entryId: number, sheetType: string, rejectedData?: any) => {
        setRejectingEntryId(entryId);
        setRejectingEntrySheetType(sheetType);
        if (rejectedData) {
            setRejectingData(rejectedData);
        }
        setShowRejectReasonModal(true);
    };

    const handleRejectFromEdit = async (entryId: number, sheetType: string) => {
        // First save any cell statuses (red highlight edits) we flagged in the edit modal
        if (editingEntry && editData) {
            try {
                await updateEntryByPM(editingEntry.id, editData);
            } catch (error) {
                toast.error(`Failed to save rejection markers: ${(error as Error).message}`);
                return;
            }
        }
        
        // Close edit modal
        setEditingEntry(null);
        setEditData(null);
        await fetchEntries();
        
        // Then proceed to standard rejection
        handleReject(entryId, sheetType);
    };

    const handleConfirmReject = async (rejectionReason: string) => {
        if (!rejectingEntryId) return;
        try {
            // If we have local modified data from the modal (due to rejection cell marking), save it first!
            if (rejectingData) {
                await updateEntryByPM(rejectingEntryId, rejectingData);
            }
            await rejectEntryByPM(rejectingEntryId, rejectionReason);
            const entry = submittedEntries.find(e => e.id === rejectingEntryId);
            if (entry) {
                addNotification({
                    title: "Sheet Rejected",
                    message: `The ${entry.sheet_type.replace(/_/g, ' ')} sheet from ${entry.supervisor_name || 'a supervisor'} has been rejected. Reason: ${rejectionReason}`,
                    type: "warning",
                    userId: user?.userId || user?.ObjectId,
                    projectId: entry.project_id,
                    entryId: entry.id,
                    sheetType: entry.sheet_type
                });
            }
            toast.success("Entry rejected successfully");
            await fetchEntries();
            if (sheetListModalConfig.isOpen) {
                setSheetListModalConfig(prev => ({ ...prev, entries: prev.entries.filter(e => e.id !== rejectingEntryId) }));
            }
        } catch (error) {
            toast.error(`Failed to reject: ${(error as Error).message}`);
        } finally {
            setRejectingEntryId(null);
            setRejectingData(null);
            setShowRejectReasonModal(false);
        }
    };

    useEffect(() => {
        const userRole = user?.role || user?.Role;
        if (user && userRole === 'Site PM') {
            const loadAllData = async () => {
                try {
                    const [entriesData, projectsData, supervisorsData, chartsData] = await Promise.all([
                        getEntriesForPMReview(projectId),
                        getAssignedProjects(),
                        getAllSupervisors(),
                        projectId ? getAllChartsData("Site PM", projectId) : Promise.resolve(null)
                    ]);
                    setSubmittedEntries(entriesData);
                    setProjects(projectsData);
                    setSupervisors(supervisorsData);
                    if (chartsData) setAdvancedChartData(chartsData);
                    
                    console.log(`[PMDashboard] Loaded data: ${entriesData.length} entries for projectId: ${projectId || 'All'}`);
                    if (entriesData.length > 0) {
                        console.log(`[PMDashboard] First entry status: ${entriesData[0].status}`);
                    }
                } catch (error) {
                    toast.error("Failed to fetch data");
                } finally {
                    setLoading(false);
                }
            };
            loadAllData();
        }
    }, [projectId, user]);

    return (
        <motion.div className="min-h-screen bg-background" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <Navbar
                userName={user?.name || user?.Name || "User"}
                userRole={user?.role || user?.Role || "Site PM"}
                projectName={projectName}
                projectId={projectId}
                projectDetails={projectDetails}
                projectP6Id={projectDetails?.P6Id || (projectDetails as any)?.Id || (projectDetails as any)?.p6Id}
                onAddUser={() => setShowCreateSupervisorModal(true)}
                onAssignProject={() => setShowAssignProjectModal(true)}
            />

            <div className="container mx-auto px-4 py-8">
                <PMDashboardSummary
                    projectName={projectName}
                    userName={user?.name || user?.Name}
                    projectDetails={projectDetails}
                    formatDate={formatDate}
                    submittedEntries={submittedEntries}
                    loading={loading}
                    onRefresh={fetchEntries}
                    onStatClick={(filterType, entries, title) => setSheetListModalConfig({ isOpen: true, title, entries })}
                />
                

                <PMChartsSection
                    submittedEntries={submittedEntries}
                    advancedChartData={advancedChartData}
                    onStatClick={(filterType, entries, title) => setSheetListModalConfig({ isOpen: true, title, entries })}
                />
            </div>

            <SheetListModal
                isOpen={sheetListModalConfig.isOpen}
                onClose={() => setSheetListModalConfig(prev => ({ ...prev, isOpen: false }))}
                title={sheetListModalConfig.title}
                entries={sheetListModalConfig.entries}
                onApprove={handleApprove}
                onReject={handleReject}
                onEdit={handleEditEntry}
            />

            <PMEditEntryModal editingEntry={editingEntry} editData={editData} setEditData={setEditData} isOpen={!!editingEntry} onClose={() => setEditingEntry(null)} onSave={handleSaveEdit} onReject={handleRejectFromEdit} />
            <PMCreateSupervisorModal isOpen={showCreateSupervisorModal} onClose={() => setShowCreateSupervisorModal(false)} projects={projects} onUserCreated={fetchEntries} />
            <PMAssignProjectModal isOpen={showAssignProjectModal} onClose={() => setShowAssignProjectModal(false)} projects={projects} supervisors={supervisors} onAssignmentComplete={fetchEntries} />
            <PMSuccessModal isOpen={showSuccessModal} onClose={() => setShowSuccessModal(false)} registeredUser={registeredUser} projects={projects} />
            <PMRejectReasonModal isOpen={showRejectReasonModal} onClose={() => setShowRejectReasonModal(false)} onConfirm={handleConfirmReject} entryId={rejectingEntryId || 0} sheetType={rejectingEntrySheetType} />
        </motion.div>
    );
};

export default PMDashboard;