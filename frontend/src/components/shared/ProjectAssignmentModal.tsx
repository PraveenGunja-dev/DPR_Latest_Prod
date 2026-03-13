import React, { useState, useEffect } from "react";
import { BaseModal } from "./BaseModal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Users, Search, Check, X, Loader2, MapPin } from "lucide-react";
import { toast } from "sonner";
import {
    assignProjectToSupervisor,
    unassignProjectFromSupervisor,
    getProjectSupervisors,
    getProjectSitePMs
} from "@/modules/auth/services/projectService";
import { getAllSupervisors, getAllSitePMs } from "@/modules/auth/services/authService";

interface Project {
    ObjectId: number;
    Name: string;
    Location?: string;
}

interface User {
    ObjectId: number;
    Name: string;
    Email: string;
    Role?: string;
}

interface ProjectAssignmentModalProps {
    isOpen: boolean;
    onClose: () => void;
    project: Project | null;
    onAssignmentComplete?: () => void;
    userRole?: string;
}

const AVAILABLE_SHEETS = [
    { id: 'dp_qty', label: 'Daily Progress Quantity' },
    { id: 'manpower_details', label: 'Manpower Details' },
    { id: 'dp_vendor_block', label: 'DP Vendor Block' },
    { id: 'dp_block', label: 'DP Block' },
    { id: 'dp_vendor_idt', label: 'DP Vendor IDT' },
    { id: 'mms_module_rfi', label: 'MMS & Module RFI' },
    { id: 'resource', label: 'Resource Tracking' }
];

/**
 * ProjectAssignmentModal - Modal for assigning/unassigning SitePMs and Supervisors to a project.
 * Displays project info at top with two-column layout for user lists.
 */
export const ProjectAssignmentModal: React.FC<ProjectAssignmentModalProps> = ({
    isOpen,
    onClose,
    project,
    onAssignmentComplete,
    userRole
}) => {
    // State
    const [sitePMs, setSitePMs] = useState<User[]>([]);
    const [supervisors, setSupervisors] = useState<User[]>([]);
    const [assignedSupervisors, setAssignedSupervisors] = useState<any[]>([]); // Changed to any to store full objects including SheetTypes
    const [assignedSitePMs, setAssignedSitePMs] = useState<any[]>([]); // Changed to any to store full objects including SheetTypes
    const [sitePMSearchTerm, setSitePMSearchTerm] = useState("");
    const [supervisorSearchTerm, setSupervisorSearchTerm] = useState("");
    const [loading, setLoading] = useState(false);

    // Sheet selection sub-modal state
    const [sheetModalOpen, setSheetModalOpen] = useState(false);
    const [pendingUser, setPendingUser] = useState<User | null>(null);
    const [tempSelectedSheets, setTempSelectedSheets] = useState<string[]>([]);
    const [isEditingExisting, setIsEditingExisting] = useState(false);

    // Track changes to trigger refresh on close
    const hasChanges = React.useRef(false);

    // Fetch data when modal opens
    useEffect(() => {
        if (isOpen && project) {
            hasChanges.current = false; // Reset changes tracker
            setSheetModalOpen(false);
            setPendingUser(null);
            fetchData();
        }
    }, [isOpen, project]);

    const fetchData = async () => {
        if (!project) return;

        setLoading(true);
        try {
            // Fetch all supervisors
            const supervisorsList = await getAllSupervisors();
            setSupervisors(supervisorsList);

            // Fetch assigned supervisors for this project
            const assignedList = await getProjectSupervisors(project.ObjectId);
            setAssignedSupervisors(assignedList);

            // Fetch Site PMs if user is PMAG
            if (userRole === 'PMAG') {
                try {
                    const sitePMsList = await getAllSitePMs();
                    setSitePMs(sitePMsList);

                    // Fetch assigned Site PMs for this project
                    const assignedSitePMsList = await getProjectSitePMs(project.ObjectId);
                    setAssignedSitePMs(assignedSitePMsList);
                } catch (err) {
                    console.error("Error fetching Site PMs:", err);
                    setAssignedSitePMs([]);
                }
            } else {
                setAssignedSitePMs([]);
            }
        } catch (error) {
            console.error("Error fetching data:", error);
            toast.error("Failed to load assignment data");
        } finally {
            setLoading(false);
        }
    };

    // Helper to get assigned user ID array for filtering/icons
    const assignedSupervisorIds = assignedSupervisors.map(s => String(s.ObjectId));
    const assignedSitePMIds = assignedSitePMs.map(pm => String(pm.ObjectId));

    // Initial click on a user
    const handleUserClick = (user: User, role: 'supervisor' | 'sitepm') => {
        const userIdStr = String(user.ObjectId);
        const assignedList = role === 'supervisor' ? assignedSupervisors : assignedSitePMs;
        const assignment = assignedList.find(a => String(a.ObjectId) === userIdStr);

        if (assignment) {
            // Already assigned - open modal to edit or give option to unassign
            setPendingUser(user);
            setTempSelectedSheets(assignment.SheetTypes || []);
            setIsEditingExisting(true);
            setSheetModalOpen(true);
        } else {
            // Not assigned - open modal to select sheets before assigning
            setPendingUser(user);
            setTempSelectedSheets([]); // Default to all if none selected, or we can keep it empty
            setIsEditingExisting(false);
            setSheetModalOpen(true);
        }
    };

    // Finalize assignment after sheet selection
    const confirmAssignment = async () => {
        if (!project || !pendingUser) return;

        try {
            setLoading(true);

            // If editing existing, we might need to unassign first if backend is strict
            if (isEditingExisting) {
                await unassignProjectFromSupervisor(project.ObjectId, pendingUser.ObjectId);
            }

            // Assign
            await assignProjectToSupervisor(project.ObjectId, pendingUser.ObjectId, tempSelectedSheets);
            toast.success(`${pendingUser.Role || 'User'} assigned successfully`);

            hasChanges.current = true;
            setSheetModalOpen(false);
            setPendingUser(null);

            // Refresh local state
            await fetchData();
        } catch (error) {
            console.error("Assignment error:", error);
            toast.error("Failed to complete assignment");
        } finally {
            setLoading(false);
        }
    };

    const handleUnassign = async () => {
        if (!project || !pendingUser) return;

        try {
            setLoading(true);
            await unassignProjectFromSupervisor(project.ObjectId, pendingUser.ObjectId);
            toast.success("Assignment removed successfully");

            hasChanges.current = true;
            setSheetModalOpen(false);
            setPendingUser(null);

            // Refresh local state
            await fetchData();
        } catch (error) {
            console.error("Unassign error:", error);
            toast.error("Failed to remove assignment");
        } finally {
            setLoading(false);
        }
    };

    const toggleSheetSelection = (sheetId: string) => {
        setTempSelectedSheets(prev => {
            const index = prev.indexOf(sheetId);
            if (index >= 0) {
                return prev.filter(id => id !== sheetId);
            } else {
                return [...prev, sheetId];
            }
        });
    };

    // Filter and sort functions
    const filteredSitePMs = sitePMs
        .filter(pm =>
            pm.Name.toLowerCase().includes(sitePMSearchTerm.toLowerCase()) ||
            pm.Email.toLowerCase().includes(sitePMSearchTerm.toLowerCase())
        )
        .sort((a, b) => {
            const aAssigned = assignedSitePMIds.includes(String(a.ObjectId));
            const bAssigned = assignedSitePMIds.includes(String(b.ObjectId));
            // Assigned users first
            if (aAssigned && !bAssigned) return -1;
            if (!aAssigned && bAssigned) return 1;
            // Then alphabetical
            return a.Name.localeCompare(b.Name);
        });

    const filteredSupervisors = supervisors
        .filter(sup =>
            sup.Name.toLowerCase().includes(supervisorSearchTerm.toLowerCase()) ||
            sup.Email.toLowerCase().includes(supervisorSearchTerm.toLowerCase())
        )
        .sort((a, b) => {
            const aAssigned = assignedSupervisorIds.includes(String(a.ObjectId));
            const bAssigned = assignedSupervisorIds.includes(String(b.ObjectId));
            // Assigned users first
            if (aAssigned && !bAssigned) return -1;
            if (!aAssigned && bAssigned) return 1;
            // Then alphabetical
            return a.Name.localeCompare(b.Name);
        });

    // Reset state on close
    const handleClose = () => {
        setSitePMSearchTerm("");
        setSupervisorSearchTerm("");
        setSheetModalOpen(false);
        setPendingUser(null);

        // Only trigger refresh if actual changes were made
        if (hasChanges.current) {
            onAssignmentComplete?.();
        }

        onClose();
    };

    if (!project) return null;

    return (
        <BaseModal
            isOpen={isOpen}
            onClose={handleClose}
            title="Assign Users to Project"
            description={project.Name}
            icon={<Users size={20} />}
            maxWidth="max-w-4xl"
            footer={
                <div className="flex justify-end">
                    <Button variant="outline" onClick={handleClose}>
                        Close
                    </Button>
                </div>
            }
        >
            {/* Project Info Header */}
            <div className="mb-6 p-4 rounded-lg bg-muted/50 border border-border flex items-center justify-between">
                <div>
                    <h3 className="font-semibold text-lg text-foreground">{project.Name}</h3>
                    {project.Location && (
                        <div className="flex items-center gap-1 mt-1 text-sm text-muted-foreground">
                            <MapPin size={14} />
                            <span>{project.Location}</span>
                        </div>
                    )}
                </div>
            </div>

            {loading ? (
                <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-8 h-8 animate-spin text-primary" />
                    <span className="ml-2 text-muted-foreground">Loading...</span>
                </div>
            ) : (
                <div className={`grid grid-cols-1 ${userRole === 'PMAG' ? 'md:grid-cols-2' : ''} gap-6`}>
                    {/* Left Column - Site PMs (Only for PMAG) */}
                    {userRole === 'PMAG' && (
                        <div className="space-y-3">
                            <Label className="text-base font-semibold flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full bg-primary"></div>
                                Site PMs
                                <span className="text-xs text-muted-foreground font-normal">
                                    ({assignedSitePMs.length} assigned)
                                </span>
                            </Label>

                            {/* Search */}
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
                                <Input
                                    placeholder="Search Site PMs..."
                                    value={sitePMSearchTerm}
                                    onChange={(e) => setSitePMSearchTerm(e.target.value)}
                                    className="pl-9"
                                />
                            </div>

                            {/* List */}
                            <div className="border border-border rounded-lg max-h-[300px] overflow-y-auto">
                                {filteredSitePMs.length > 0 ? (
                                    filteredSitePMs.map((pm) => {
                                        return (
                                            <div
                                                key={pm.ObjectId}
                                                onClick={() => handleUserClick(pm, 'sitepm')}
                                                className={`flex items-center justify-between p-3 hover:bg-muted cursor-pointer border-b border-border last:border-b-0 transition-colors ${assignedSitePMIds.includes(String(pm.ObjectId)) ? "bg-primary/5" : ""
                                                    }`}
                                            >
                                                <div className="min-w-0">
                                                    <div className="font-medium text-sm truncate">{pm.Name}</div>
                                                    <div className="text-xs text-muted-foreground truncate">{pm.Email}</div>
                                                </div>
                                                <div className={`w-6 h-6 rounded-full flex items-center justify-center ${assignedSitePMIds.includes(String(pm.ObjectId))
                                                    ? "bg-primary text-white"
                                                    : "border-2 border-muted-foreground/30"
                                                    }`}>
                                                    {assignedSitePMIds.includes(String(pm.ObjectId)) && <Check size={14} />}
                                                </div>
                                            </div>
                                        );
                                    })
                                ) : (
                                    <div className="p-6 text-center text-muted-foreground text-sm">
                                        {sitePMs.length === 0
                                            ? "No Site PMs available"
                                            : "No Site PMs match your search"}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Supervisors Column (For both Site PM and PMAG) */}
                    <div className="space-y-3">
                        <Label className="text-base font-semibold flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-secondary"></div>
                            Supervisors
                            <span className="text-xs text-muted-foreground font-normal">
                                ({assignedSupervisors.length} assigned)
                            </span>
                        </Label>

                        {/* Search */}
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
                            <Input
                                placeholder="Search Supervisors..."
                                value={supervisorSearchTerm}
                                onChange={(e) => setSupervisorSearchTerm(e.target.value)}
                                className="pl-9"
                            />
                        </div>

                        {/* List */}
                        <div className="border border-border rounded-lg max-h-[300px] overflow-y-auto">
                            {filteredSupervisors.length > 0 ? (
                                filteredSupervisors.map((sup) => {
                                    return (
                                        <div
                                            key={sup.ObjectId}
                                            onClick={() => handleUserClick(sup, 'supervisor')}
                                            className={`flex items-center justify-between p-3 hover:bg-muted cursor-pointer border-b border-border last:border-b-0 transition-colors ${assignedSupervisorIds.includes(String(sup.ObjectId)) ? "bg-secondary/5" : ""
                                                }`}
                                        >
                                            <div className="min-w-0">
                                                <div className="font-medium text-sm truncate">{sup.Name}</div>
                                                <div className="text-xs text-muted-foreground truncate">{sup.Email}</div>
                                            </div>
                                            <div className={`w-6 h-6 rounded-full flex items-center justify-center ${assignedSupervisorIds.includes(String(sup.ObjectId))
                                                ? "bg-secondary text-white"
                                                : "border-2 border-muted-foreground/30"
                                                }`}>
                                                {assignedSupervisorIds.includes(String(sup.ObjectId)) && <Check size={14} />}
                                            </div>
                                        </div>
                                    );
                                })
                            ) : (
                                <div className="p-6 text-center text-muted-foreground text-sm">
                                    {supervisors.length === 0
                                        ? "No Supervisors available"
                                        : "No Supervisors match your search"}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
            {/* Sheet Selection Modal */}
            <BaseModal
                isOpen={sheetModalOpen}
                onClose={() => { setSheetModalOpen(false); setPendingUser(null); }}
                title={isEditingExisting ? "Edit Sheet Access" : "Select Sheet Access"}
                description={`${pendingUser?.Name} - ${project.Name}`}
                maxWidth="max-w-md"
                footer={
                    <div className="flex justify-between w-full">
                        <div>
                            {isEditingExisting && (
                                <Button variant="destructive" onClick={handleUnassign} disabled={loading}>
                                    Unassign User
                                </Button>
                            )}
                        </div>
                        <div className="flex gap-2">
                            <Button variant="outline" onClick={() => { setSheetModalOpen(false); setPendingUser(null); }}>
                                Cancel
                            </Button>
                            <Button onClick={confirmAssignment} disabled={loading}>
                                {loading ? "Saving..." : isEditingExisting ? "Update Access" : "Confirm Assignment"}
                            </Button>
                        </div>
                    </div>
                }
            >
                <div className="space-y-4">
                    <div>
                        <Label className="text-sm font-medium">Permitted Sheets for {pendingUser?.Name}</Label>
                        <p className="text-[10px] text-muted-foreground mt-1 italic">
                            * If no sheets are selected, the user will have access to all sheets by default.
                        </p>
                    </div>
                    <div className="grid grid-cols-1 gap-2">
                        {AVAILABLE_SHEETS.map(sheet => (
                            <div
                                key={sheet.id}
                                onClick={() => toggleSheetSelection(sheet.id)}
                                className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-all ${tempSelectedSheets.includes(sheet.id)
                                    ? "bg-primary/5 border-primary"
                                    : "bg-background border-border hover:bg-muted"
                                    }`}
                            >
                                <span className={`text-sm ${tempSelectedSheets.includes(sheet.id) ? "font-medium text-primary" : "text-foreground"}`}>
                                    {sheet.label}
                                </span>
                                {tempSelectedSheets.includes(sheet.id) && (
                                    <Check size={16} className="text-primary" />
                                )}
                            </div>
                        ))}
                    </div>
                    <p className="text-xs text-muted-foreground italic">
                        If no sheets are selected, the user will have access to all sheets by default.
                    </p>
                </div>
            </BaseModal>
        </BaseModal>
    );
};
