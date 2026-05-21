import { useState, useEffect, useMemo } from "react";
import { useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { useAuth } from "@/modules/auth/contexts/AuthContext";
import { useNotification } from "@/modules/auth/contexts/NotificationContext";
import { toast } from "sonner";
import { DashboardLayout } from "@/components/shared/DashboardLayout";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
    PMAGDashboardSummary,
    PMAGChartsSection,
    PMAGEditEntryModal,
    PMAGSnapshotModal
} from "./components";
import { DroneVerificationModal } from "../supervisor/components/DroneVerificationModal";
import { PushProgressModal } from "@/components/shared/PushProgressModal";
import { PMAGDashboardDetailModal, DashboardModalType } from "./components/PMAGDashboardDetailModal";
import { 
    getEntriesForPMAGReview, 
    getHistoryForPMAG, 
    getArchivedEntries, 
    approveEntryByPMAG, 
    rejectEntryByPMAG, 
    pushEntryToP6,
    updateEntryByPMAG
} from "@/services/dprService";
import { getAllSitePMs } from "@/services/userService";
import { getAllChartsData } from "@/services/chartService";
import { getP6ActivitiesForProject } from "@/services/p6ActivityService";
import { getUserProjects } from "@/services/projectService";
import { DPREntry, Project, User } from "@/types";

const PMAGDashboard = () => {
    const location = useLocation();
    const { user } = useAuth();
    const { addNotification } = useNotification();
    const { projectName, projectId } = location.state || { projectName: "Project", projectId: null };

    const [projects, setProjects] = useState<Project[]>([]);
    const [p6Activities, setP6Activities] = useState<any[]>([]);
    const [teamMembers, setTeamMembers] = useState<User[]>([]);
    const [approvedEntries, setApprovedEntries] = useState<DPREntry[]>([]);
    const [historyEntries, setHistoryEntries] = useState<DPREntry[]>([]);
    const [archivedEntries, setArchivedEntries] = useState<DPREntry[]>([]);
    const [loading, setLoading] = useState(false);
    const [detailModalState, setDetailModalState] = useState<{ isOpen: boolean; type: DashboardModalType; data: any[]; title?: string }>({
        isOpen: false, type: null, data: [], title: undefined
    });
    const [editingEntry, setEditingEntry] = useState<any>(null);
    const [editData, setEditData] = useState<any>(null);
    const [advancedChartData, setAdvancedChartData] = useState<any>({
        sCurve: [], dailyProductivity: [], activityHeatmap: [], manpowerEfficiency: [], issuePareto: []
    });

    const [isDroneModalOpen, setIsDroneModalOpen] = useState(false);
    const [isSnapshotOpen, setIsSnapshotOpen] = useState(false);
    
    const [pushModalState, setPushModalState] = useState<{isOpen: boolean, entryId: number | null, sheetName: string}>({
        isOpen: false,
        entryId: null,
        sheetName: ""
    });

    const currentProject = useMemo(() => projects.find((p: any) => String(p.id) === String(projectId) || String(p.ObjectId) === String(projectId)), [projects, projectId]);

    const isDroneEligible = useMemo(() => {
        const name = (projectName || "").toLowerCase();
        const p6Id = (currentProject?.P6Id || (currentProject as any)?.p6Id || "").toUpperCase();
        const droneIds = ["FY25-P10", "FY25-P11", "FY25-P12", "FY25-P13"];
        return name.includes("khavda") || name.includes("baiya") || droneIds.includes(p6Id);
    }, [projectName, currentProject]);

    const dpQtyRows = useMemo(() => {
        const dpQtyEntry = approvedEntries.find(e => e.sheet_type === 'dp_qty');
        if (!dpQtyEntry) return [];
        try {
            const data = typeof dpQtyEntry.data_json === 'string' ? JSON.parse(dpQtyEntry.data_json) : dpQtyEntry.data_json;
            return data.rows || [];
        } catch (e) { return []; }
    }, [approvedEntries]);

    const dpQtyDate = useMemo(() => {
        const dpQtyEntry = approvedEntries.find(e => e.sheet_type === 'dp_qty');
        if (!dpQtyEntry) return new Date().toISOString().split("T")[0];
        try {
            const data = typeof dpQtyEntry.data_json === 'string' ? JSON.parse(dpQtyEntry.data_json) : dpQtyEntry.data_json;
            return data.staticHeader?.progressDate || data.staticHeader?.reportingDate || new Date().toISOString().split("T")[0];
        } catch (e) { return new Date().toISOString().split("T")[0]; }
    }, [approvedEntries]);


    const loadData = async () => {
        try {
            setLoading(true);
            const [pjs, reviewEntries, historyEntriesData, archivedEntriesData, members, charts] = await Promise.all([
                getUserProjects(),
                getEntriesForPMAGReview(projectId),
                getHistoryForPMAG(projectId),
                getArchivedEntries(projectId),
                getAllSitePMs(),
                projectId ? getAllChartsData("PMAG", projectId) : Promise.resolve(null)
            ]);
            setProjects(pjs);
            setApprovedEntries(reviewEntries);
            setHistoryEntries(historyEntriesData || []);
            setArchivedEntries(archivedEntriesData || []);
            setTeamMembers(members);
            if (charts) setAdvancedChartData(charts);
            if (projectId) setP6Activities(await getP6ActivitiesForProject(projectId));
        } catch (e) {
            toast.error("Failed to load dashboard data");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { loadData(); }, [projectId]);

    useEffect(() => {
        // Auto-open edit modal if entryId is passed from notifications
        const stateEntryId = (location.state as any)?.entryId;
        if (stateEntryId && approvedEntries.length > 0 && !editingEntry) {
            const targetEntry = approvedEntries.find((e: any) => e.id === stateEntryId);
            if (targetEntry) {
                handleEdit(targetEntry);
                window.history.replaceState({}, document.title);
            }
        }
    }, [(location.state as any)?.entryId, approvedEntries]);

    const handleFinalApprove = async (entryId: number) => {
        try {
            await approveEntryByPMAG(entryId);
            toast.success("Final approved");
            loadData();
        } catch (e) { toast.error("Approval failed"); }
    };

    const handleReject = async (entryId: number) => {
        try {
            await rejectEntryByPMAG(entryId, "Rejected by PMAG");
            toast.success("Rejected to PM");
            loadData();
        } catch (e) { toast.error("Rejection failed"); }
    };

    const handlePushToP6 = async (entry: any) => {
        try {
            // Open the progress modal immediately
            setPushModalState({
                isOpen: true,
                entryId: entry.id,
                sheetName: entry.sheet_type?.replace(/_/g, " ").toUpperCase() || "Sheet"
            });
            
            // Start the push process in the background
            pushEntryToP6(entry.id).then((data: any) => {
                if (!data.success && data.error) {
                    toast.error(`Push completed with errors: ${data.error}`);
                }
            }).catch((err: any) => {
                toast.error(`Push failed: ${err.message || 'Unknown error'}`);
                setPushModalState(prev => ({ ...prev, isOpen: false }));
            });
        } catch (e) {
            toast.error("Push process failed to start");
        }
    };

    const handlePushComplete = () => {
        // Refresh data and close detail modal if open
        loadData();
        toast.success("Successfully pushed to P6");
        
        // Auto-close detail modal after pushing if it's open
        if (detailModalState.isOpen) {
            setDetailModalState(prev => ({ ...prev, isOpen: false }));
        }
    };

    const handleEdit = (entry: any) => {
        setEditingEntry(entry);
        setEditData(typeof entry.data_json === 'string' ? JSON.parse(entry.data_json) : entry.data_json);
    };

    const handleSaveEdit = async () => {
        try {
            if (!editingEntry) return;
            await updateEntryByPMAG(editingEntry.id, editData);
            toast.success("Changes saved successfully");
            setEditingEntry(null);
            setEditData(null);
            loadData();
        } catch (e: any) {
            toast.error(e.message || "Failed to save changes");
        }
    };

    const handleRejectFromEdit = async (entryId: number) => {
        // First save any cell statuses (red highlight edits) we flagged in the edit modal
        if (editingEntry && editData) {
            try {
                await updateEntryByPMAG(editingEntry.id, editData);
            } catch (error) {
                toast.error(`Failed to save rejection markers: ${(error as Error).message}`);
                return;
            }
        }
        
        // Close edit modal
        setEditingEntry(null);
        setEditData(null);
        await loadData();
        
        // Proceed to standard PMAG rejection
        handleReject(entryId);
    };



    return (
        <DashboardLayout 
            userName={user?.name || user?.Name || "User"} 
            userRole={user?.role || user?.Role || "PMAG"} 
            projectName={projectName}
            projectId={projectId}
            projectDetails={currentProject}
            projectP6Id={currentProject?.P6Id || (location.state as any)?.projectDetails?.P6Id}
        >
            <PMAGDashboardSummary
                projectName={projectName} userName={user?.name || user?.Name}
                approvedEntries={approvedEntries} historyEntries={historyEntries} archivedEntries={archivedEntries} teamMembers={teamMembers}
                onShowMembers={() => setDetailModalState({ isOpen: true, type: 'members', data: teamMembers, title: 'Team Members' })}
                onShowApproved={() => setDetailModalState({ isOpen: true, type: 'approved', data: approvedEntries, title: 'Approved Sheets' })}
                onShowSubmitted={() => setDetailModalState({ isOpen: true, type: 'submitted', data: historyEntries, title: 'Pushed Sheets' })}
                onShowArchived={() => setDetailModalState({ isOpen: true, type: 'archived', data: archivedEntries, title: 'Archived Sheets' })}
                isDroneEligible={isDroneEligible}
                onCompareWithDrone={() => setIsDroneModalOpen(true)}
                onShowSnapshot={() => setIsSnapshotOpen(true)}
            />
            <PMAGChartsSection 
                projectId={projectId}
                p6Activities={p6Activities} 
                approvedEntries={approvedEntries} 
                historyEntries={historyEntries} 
                archivedEntries={archivedEntries} 
                advancedChartData={advancedChartData}
            />
            <PMAGDashboardDetailModal 
                isOpen={detailModalState.isOpen} 
                onClose={() => setDetailModalState(prev => ({ ...prev, isOpen: false }))} 
                type={detailModalState.type} 
                data={detailModalState.data} 
                title={detailModalState.title}
                onEdit={handleEdit}
                onReject={handleReject}
                onPushToP6={handlePushToP6}
            />
            <PMAGEditEntryModal 
                editingEntry={editingEntry} 
                editData={editData} 
                setEditData={setEditData} 
                isOpen={!!editingEntry} 
                onClose={() => setEditingEntry(null)} 
                onSave={handleSaveEdit} 
                onReject={handleRejectFromEdit}
            />

            {isDroneModalOpen && (
                <DroneVerificationModal
                    isOpen={isDroneModalOpen}
                    onClose={() => setIsDroneModalOpen(false)}
                    projectId={Number(projectId)}
                    reportDate={dpQtyDate}
                    dprRows={dpQtyRows}
                />
            )}
            
            <PushProgressModal 
                isOpen={pushModalState.isOpen}
                entryId={pushModalState.entryId}
                sheetName={pushModalState.sheetName}
                onClose={() => setPushModalState(prev => ({ ...prev, isOpen: false }))}
                onPushComplete={handlePushComplete}
            />

            {projectId && (
                <PMAGSnapshotModal
                    isOpen={isSnapshotOpen}
                    onClose={() => setIsSnapshotOpen(false)}
                    projectId={projectId}
                />
            )}
        </DashboardLayout>
    );
};

export default PMAGDashboard;