import { useState, useEffect } from "react";
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
    PMAGEditEntryModal
} from "./components";
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
import { getUserProjects } from "@/services/projectService";
import { getP6ActivitiesForProject } from "@/services/p6ActivityService";
import { getAllSitePMs } from "@/services/userService";
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


    const loadData = async () => {
        try {
            setLoading(true);
            const [pjs, reviewEntries, historyEntriesData, archivedEntriesData, members] = await Promise.all([
                getUserProjects(),
                getEntriesForPMAGReview(projectId),
                getHistoryForPMAG(projectId),
                getArchivedEntries(projectId),
                getAllSitePMs() // Simplified for PMAG view
            ]);
            setProjects(pjs);
            setApprovedEntries(reviewEntries);
            setHistoryEntries(historyEntriesData || []);
            setArchivedEntries(archivedEntriesData || []);
            setTeamMembers(members);
            if (projectId) setP6Activities(await getP6ActivitiesForProject(projectId));
        } catch (e) {
            toast.error("Failed to load dashboard data");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { loadData(); }, [projectId]);

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
            toast.promise(pushEntryToP6(entry.id), {
                loading: 'Pushing to P6...',
                success: (data: any) => {
                    loadData();
                    return data.message || "Successfully pushed to P6";
                },
                error: (err: any) => `Push failed: ${err.message || 'Unknown error'}`
            });
        } catch (e) {
            toast.error("Push process failed to start");
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

    const currentProject = projects.find(p => String(p.id) === String(projectId) || String(p.ObjectId) === String(projectId));

    return (
        <DashboardLayout 
            userName={user?.name || user?.Name || "User"} 
            userRole={user?.role || user?.Role || "PMAG"} 
            projectName={projectName}
            projectId={projectId}
            projectP6Id={currentProject?.P6Id || (location.state as any)?.projectDetails?.P6Id}
        >
            <PMAGDashboardSummary
                projectName={projectName} userName={user?.name || user?.Name}
                approvedEntries={approvedEntries} historyEntries={historyEntries} archivedEntries={archivedEntries} teamMembers={teamMembers}
                onShowMembers={() => setDetailModalState({ isOpen: true, type: 'members', data: teamMembers, title: 'Team Members' })}
                onShowApproved={() => setDetailModalState({ isOpen: true, type: 'approved', data: approvedEntries, title: 'Approved Sheets' })}
                onShowSubmitted={() => setDetailModalState({ isOpen: true, type: 'approved', data: historyEntries, title: 'Pushed Sheets' })}
                onShowArchived={() => setDetailModalState({ isOpen: true, type: 'approved', data: archivedEntries, title: 'Archived Sheets' })}
            />
            <PMAGChartsSection p6Activities={p6Activities} approvedEntries={approvedEntries} historyEntries={historyEntries} archivedEntries={archivedEntries} />
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
        </DashboardLayout>
    );
};

export default PMAGDashboard;