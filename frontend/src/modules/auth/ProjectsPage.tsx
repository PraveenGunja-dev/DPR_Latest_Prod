import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Navbar } from "@/components/Navbar";
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { getUserProjects, getAssignedProjects } from "./services/projectService";
import { toast } from "sonner";
import { ProjectListing } from "@/components/ProjectListing";
import { SummaryModal } from "@/components/SummaryModal";
import { DashboardLayout } from "@/components/shared/DashboardLayout";
import { ProjectsHeader, ProjectsEmptyState } from "./components";
import { ProjectAssignmentModal } from "@/components/shared/ProjectAssignmentModal";
import { CreateUserModal } from "@/components/shared/CreateUserModal";

const ProjectsPage = () => {
  const navigate = useNavigate();
  const { user, token } = useAuth();
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const projectsPerPage = 6;

  // Summary modal state
  const [showSummaryModal, setShowSummaryModal] = useState(false);
  const [selectedSummaryProject, setSelectedSummaryProject] = useState<any>(null);

  // Assignment modal state
  const [showAssignmentModal, setShowAssignmentModal] = useState(false);
  const [selectedAssignProject, setSelectedAssignProject] = useState<any>(null);

  // Create user modal state
  const [showCreateUserModal, setShowCreateUserModal] = useState(false);

  // Filter projects based on search term
  const filteredProjects = useMemo(() => {
    if (!searchTerm) return projects;

    return projects.filter(project =>
      project.Name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      project.Location?.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [projects, searchTerm]);

  // Pagination logic
  const totalPages = Math.ceil(filteredProjects.length / projectsPerPage);
  const startIndex = (currentPage - 1) * projectsPerPage;
  const paginatedProjects = filteredProjects.slice(startIndex, startIndex + projectsPerPage);

  // Reset to first page when search term changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  // Fetch projects
  const fetchProjects = async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch projects based on user role
      let projectsData: any[] = [];
      if (user?.Role === "supervisor") {
        projectsData = await getAssignedProjects();
      } else {
        projectsData = await getUserProjects();
      }

      setProjects(projectsData);
    } catch (err) {
      setError("Failed to fetch projects");
      toast.error("Failed to fetch projects");
      console.error("Error fetching projects:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token && user) {
      fetchProjects();
    }
  }, [token, user, navigate]);

  const handleProjectSelect = (project: any) => {
    if (!user) return;

    // Navigate based on user role
    switch (user.Role) {
      case "supervisor":
        navigate("/supervisor", {
          state: {
            user,
            projectId: project.ObjectId,
            projectName: project.Name,
            projectDetails: project
          }
        });
        break;

      case "Site PM":
        navigate("/sitepm", {
          state: {
            user,
            projectId: project.ObjectId,
            projectName: project.Name,
            projectDetails: project
          }
        });
        break;

      case "PMAG":
        navigate("/pmag", {
          state: {
            user,
            projectId: project.ObjectId,
            projectName: project.Name,
            projectDetails: project
          }
        });
        break;

      default:
        console.error("Unsupported user role:", user.Role);
        toast.error(`Unsupported user role: ${user.Role}`);
        break;
    }
  };

  // Handle assign click
  const handleAssignClick = (clickedProject: any) => {
    const originalProject = filteredProjects.find(p => p.Name === clickedProject.name);
    if (originalProject) {
      setSelectedAssignProject(originalProject);
      setShowAssignmentModal(true);
    }
  };

  // Handle summary click
  const handleSummaryClick = (clickedProject: any) => {
    const originalProject = filteredProjects.find(p => p.Name === clickedProject.name);
    if (originalProject) {
      setSelectedSummaryProject(originalProject);
      setShowSummaryModal(true);
    }
  };

  // Handle add user click
  const handleAddUserClick = () => {
    setShowCreateUserModal(true);
  };

  if (loading || error) {
    return (
      <DashboardLayout
        userName={user?.Name || "User"}
        userRole={user?.Role}
      >
        <ProjectsEmptyState
          userRole={user?.Role}
          isLoading={loading}
          error={error}
          onRetry={() => window.location.reload()}
        />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout
      userName={user?.Name || "User"}
      userRole={user?.Role}
    >
      <ProjectsHeader
        userRole={user?.Role}
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        onAddUserClick={handleAddUserClick}
      />

      {filteredProjects.length === 0 ? (
        <ProjectsEmptyState
          userRole={user?.Role}
          searchTerm={searchTerm}
        />
      ) : (
        <div className="w-full">
          <ProjectListing
            projects={paginatedProjects.map(project => ({
              name: project.Name,
              location: project.Location || project.location || '',
              status: project.Status || 'Active',
              startDate: project.PlannedStartDate ? new Date(project.PlannedStartDate).toLocaleDateString('en-IN') : 'N/A',
              endDate: project.PlannedFinishDate ? new Date(project.PlannedFinishDate).toLocaleDateString('en-IN') : 'N/A',
              sheetTypes: project.SheetTypes || []
            }))}
            onProjectClick={(clickedProject) => {
              const originalProject = filteredProjects.find(p => p.Name === clickedProject.name);
              if (originalProject) {
                handleProjectSelect(originalProject);
              }
            }}
            userRole={user?.Role}
            onSummaryClick={handleSummaryClick}
            onAssignClick={handleAssignClick}
          />

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex justify-center items-center mt-8 space-x-2">
              <button
                className="px-4 py-2 border rounded-md bg-background hover:bg-muted transition-colors"
                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                disabled={currentPage === 1}
              >
                Previous
              </button>

              <span className="text-sm text-muted-foreground">
                Page {currentPage} of {totalPages}
              </span>

              <button
                className="px-4 py-2 border rounded-md bg-background hover:bg-muted transition-colors"
                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                disabled={currentPage === totalPages}
              >
                Next
              </button>
            </div>
          )}
        </div>
      )}

      {/* Summary Modal for Site PM and PMAG */}
      <SummaryModal
        isOpen={showSummaryModal}
        onClose={() => {
          setShowSummaryModal(false);
          setSelectedSummaryProject(null);
        }}
        projectId={selectedSummaryProject?.ObjectId}
        projectName={selectedSummaryProject?.Name || 'Project'}
      />

      {/* Project Assignment Modal */}
      <ProjectAssignmentModal
        isOpen={showAssignmentModal}
        onClose={() => {
          setShowAssignmentModal(false);
          setSelectedAssignProject(null);
        }}
        project={selectedAssignProject}
        onAssignmentComplete={fetchProjects}
        userRole={user?.Role}
      />

      {/* Create User Modal */}
      <CreateUserModal
        isOpen={showCreateUserModal}
        onClose={() => setShowCreateUserModal(false)}
        userRole={user?.Role}
        onUserCreated={() => {
          toast.success("User created successfully!");
        }}
      />
    </DashboardLayout>
  );
};

export default ProjectsPage;