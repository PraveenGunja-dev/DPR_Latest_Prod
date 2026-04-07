import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { useFilter } from "@/modules/auth/contexts/FilterContext";
import { getUserProjects, getAssignedProjects } from "@/services/projectService";
import { toast } from "sonner";
import { ProjectListing } from "@/components/ProjectListing";
import { SummaryModal } from "@/components/SummaryModal";
import { DashboardLayout } from "@/components/shared/DashboardLayout";
import { ProjectsHeader, ProjectsEmptyState } from "./components";
import { ProjectAssignmentModal } from "@/components/shared/ProjectAssignmentModal";
import { CreateUserModal } from "@/components/shared/CreateUserModal";
import { Project } from "@/types";
import { syncP6Data } from "@/services/p6ActivityService";
import apiClient from "@/services/apiClient";
import {
    Pagination,
    PaginationContent,
    PaginationItem,
    PaginationLink,
    PaginationNext,
    PaginationPrevious,
} from "@/components/ui/pagination";

const ProjectsPage = () => {
    const navigate = useNavigate();
    const { user, token } = useAuth();
    const { searchTerm, setSearchTerm, typeFilter, setTypeFilter, yearFilter, setYearFilter } = useFilter();
    const [projects, setProjects] = useState<Project[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [currentPage, setCurrentPage] = useState(1);
    const projectsPerPage = 10;

    const [showSummaryModal, setShowSummaryModal] = useState(false);
    const [selectedSummaryProject, setSelectedSummaryProject] = useState<Project | null>(null);
    const [showAssignmentModal, setShowAssignmentModal] = useState(false);
    const [selectedAssignProject, setSelectedAssignProject] = useState<Project | null>(null);
    const [showCreateUserModal, setShowCreateUserModal] = useState(false);

    // Extract FY year from P6Id or fallback to StartDate (April-March FY)
    const extractFY = (project: any): string => {
        const p6Id = project.P6Id || (project as any).p6Id || '';
        if (p6Id) {
            const match = p6Id.match(/FY\d{2}/i);
            if (match) return match[0].toUpperCase();
        }

        const startDate = (project as any).PlannedStartDate || (project as any).planStart || (project as any).PlanStart || (project as any).StartDate;
        if (startDate && startDate !== 'N/A') {
            const date = new Date(startDate);
            if (!isNaN(date.getTime())) {
                const year = date.getFullYear();
                const month = date.getMonth(); // 0 is Jan
                const fyYear = month >= 3 ? year + 1 : year;
                return `FY${String(fyYear).slice(-2)}`;
            }
        }
        return '';
    };

    // Compute unique available years from all projects
    const availableYears = useMemo(() => {
        const years = new Set<string>();
        projects.forEach(p => {
            const fy = extractFY(p);
            if (fy) years.add(fy);
        });
        return Array.from(years).sort();
    }, [projects]);

    const filteredProjects = useMemo(() => {
        return projects.filter(p => {
            const name = p.name || (p as any).Name || "";
            const matchesSearch = name.toLowerCase().includes(searchTerm.toLowerCase());

            const pType = (p.project_type || (p as any).ProjectType || (p as any).projectType || 'solar').toLowerCase();
            const matchesType = typeFilter === "ALL" || pType === typeFilter.toLowerCase();

            const fy = extractFY(p);
            const matchesYear = yearFilter === "ALL" || fy === yearFilter;

            return matchesSearch && matchesType && matchesYear;
        });
    }, [projects, searchTerm, typeFilter, yearFilter]);

    // Reset pagination to page 1 whenever any filter changes
    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm, typeFilter, yearFilter]);

    const totalPages = Math.ceil(filteredProjects.length / projectsPerPage);
    const startIndex = (currentPage - 1) * projectsPerPage;
    const paginatedProjects = filteredProjects.slice(startIndex, startIndex + projectsPerPage);

    const formatProjectName = (name: string) => {
        if (!name) return "N/A";

        // Handle "YYYY.MM.DD - Name" format
        if (name.includes(' - ')) {
            const [datePart, ...rest] = name.split(' - ');
            return `${rest.join(' - ')} : ${datePart}`;
        }

        // Handle underscore format e.g. "ASEJo6PL_NAME"
        if (name.includes('_')) {
            const parts = name.split('_');
            const prefix = parts[0];
            const remaining = parts.slice(1).join('_');
            if (prefix && remaining) {
                return `${remaining} : ${prefix}`;
            }
        }

        return name;
    };

    const formatDateOnly = (dateStr: any) => {
        if (!dateStr || dateStr === 'N/A') return 'N/A';
        try {
            // Extracts YYYY-MM-DD from ISO or complex strings
            return dateStr.split('T')[0];
        } catch (e) {
            return dateStr;
        }
    };

    const fetchProjects = async () => {
        try {
            setLoading(true);
            const role = user?.role || user?.Role;
            const data = (role === "supervisor" || role === "Site PM")
                ? await apiClient.get<Project[]>(`/project-assignment/assigned?t=${Date.now()}`).then(r => r.data)
                : await apiClient.get<Project[]>(`/projects?t=${Date.now()}`).then(r => r.data);
            setProjects(data);
        } catch (err) {
            setError("Failed to fetch projects");
            toast.error("Failed to fetch projects");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (token && user) fetchProjects();
    }, [token, user]);

    const handleProjectSelect = (project: Project) => {
        const role = user?.role || user?.Role;
        const route = role === "supervisor" ? "/supervisor" : (role === "Site PM" ? "/sitepm" : (role === "PMAG" ? "/pmag" : "/"));

        navigate(route, {
            state: {
                projectId: project.id || (project as any).ObjectId,
                projectName: project.name || (project as any).Name,
                projectDetails: project
            }
        });
    };

    const [isSyncing, setIsSyncing] = useState<string | number | null>(null);

    const handleSyncProject = async (project: any) => {
        const pId = project.id || (project.originalProject as any).ObjectId;
        try {
            setIsSyncing(pId);
            toast.info(`Starting sync for ${project.name}...`);
            await syncP6Data(pId);
            toast.success(`${project.name} synced from P6`);
            fetchProjects(); // Refresh project list to update last sync date
        } catch (error) {
            console.error("Sync error:", error);
            toast.error(`Failed to sync ${project.name}`);
        } finally {
            setIsSyncing(null);
        }
    };

    return (
        <DashboardLayout userName={user?.name || user?.Name || "User"} userRole={user?.role || user?.Role}>
            <ProjectsHeader
                userRole={user?.role || user?.Role}
                searchTerm={searchTerm}
                onSearchChange={setSearchTerm}
                typeFilter={typeFilter}
                onTypeFilterChange={setTypeFilter}
                yearFilter={yearFilter}
                onYearFilterChange={setYearFilter}
                availableYears={availableYears}
                onAddUserClick={() => setShowCreateUserModal(true)}
            />

            {loading ? <ProjectsEmptyState isLoading={true} /> : filteredProjects.length === 0 ? <ProjectsEmptyState searchTerm={searchTerm} /> : (
                <div className="w-full">
                    <ProjectListing
                        projects={paginatedProjects.map(p => ({
                            id: p.id || (p as any).ObjectId,
                            name: formatProjectName(p.name || (p as any).Name),
                            location: p.location || (p as any).Location || '',
                            status: p.status || (p as any).Status || 'Active',
                            startDate: formatDateOnly((p as any).PlannedStartDate || (p as any).planStart || 'N/A'),
                            endDate: formatDateOnly((p as any).PlannedFinishDate || (p as any).planEnd || 'N/A'),
                            sheetTypes: (p as any).sheetTypes || (p as any).SheetTypes || (p as any).sheet_types || [],
                            projectType: (p as any).projectType || p.project_type || (p as any).ProjectType || 'solar',
                            p6_last_sync: (p as any).p6_last_sync || (p as any).LastSyncAt || (p as any).last_sync_at || (p as any).p6LastSync,
                            p6_data_date: (p as any).p6_data_date || (p as any).DataDate || (p as any).data_date || (p as any).dataDate,
                            p6_last_updated: (p as any).p6_last_updated || (p as any).LastUpdateDate || (p as any).last_update_date || (p as any).p6LastUpdated,
                            p6_last_user: (p as any).p6_last_user || (p as any).LastUpdateUser || (p as any).lastUpdateUser || (p as any).last_update_user || (p as any).p6LastUser || (p as any).AddedBy || 'N/A',
                            P6Id: (p as any).P6Id || (p as any).Id || (p as any).p6Id || (p as any).P6ID,
                            originalProject: p
                        }))}
                        onProjectClick={(p: any) => handleProjectSelect(p.originalProject)}
                        userRole={user?.role || user?.Role}
                        onSummaryClick={(p: any) => { setSelectedSummaryProject(p.originalProject); setShowSummaryModal(true); }}
                        onAssignClick={(p: any) => { setSelectedAssignProject(p.originalProject); setShowAssignmentModal(true); }}
                        onSyncClick={handleSyncProject}
                    />

                    {totalPages > 1 && (
                        <div className="mt-8 mb-12">
                            <Pagination>
                                <PaginationContent>
                                    <PaginationItem>
                                        <PaginationPrevious
                                            onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                                            className={currentPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                                        />
                                    </PaginationItem>

                                    {[...Array(totalPages)].map((_, i) => {
                                        const pageNum = i + 1;
                                        // Show first page, last page, and pages around current
                                        if (
                                            pageNum === 1 ||
                                            pageNum === totalPages ||
                                            (pageNum >= currentPage - 1 && pageNum <= currentPage + 1)
                                        ) {
                                            return (
                                                <PaginationItem key={pageNum}>
                                                    <PaginationLink
                                                        onClick={() => setCurrentPage(pageNum)}
                                                        isActive={currentPage === pageNum}
                                                        className="cursor-pointer"
                                                    >
                                                        {pageNum}
                                                    </PaginationLink>
                                                </PaginationItem>
                                            );
                                        }
                                        // Add ellipsis
                                        if (pageNum === 2 || pageNum === totalPages - 1) {
                                            return (
                                                <PaginationItem key={pageNum}>
                                                    <span className="px-2">...</span>
                                                </PaginationItem>
                                            );
                                        }
                                        return null;
                                    })}

                                    <PaginationItem>
                                        <PaginationNext
                                            onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                                            className={currentPage === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                                        />
                                    </PaginationItem>
                                </PaginationContent>
                            </Pagination>
                            <div className="text-center text-sm text-muted-foreground mt-2">
                                Showing {startIndex + 1} to {Math.min(startIndex + projectsPerPage, filteredProjects.length)} of {filteredProjects.length} projects
                            </div>
                        </div>
                    )}
                </div>
            )}

            <SummaryModal isOpen={showSummaryModal} onClose={() => setShowSummaryModal(false)}
                projectId={selectedSummaryProject?.id || (selectedSummaryProject as any)?.ObjectId}
                projectName={selectedSummaryProject?.name || (selectedSummaryProject as any)?.Name || "Project"} />

            <ProjectAssignmentModal isOpen={showAssignmentModal} onClose={() => setShowAssignmentModal(false)}
                project={selectedAssignProject} onAssignmentComplete={fetchProjects} userRole={user?.role || user?.Role} />

            <CreateUserModal
                isOpen={showCreateUserModal}
                onClose={() => setShowCreateUserModal(false)}
                onUserCreated={fetchProjects}
                userRole={user?.role || user?.Role}
            />
        </DashboardLayout>
    );
};

export default ProjectsPage;