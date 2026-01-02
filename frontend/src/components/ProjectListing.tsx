import React from 'react';
import { Calendar, ChevronRight, FileText } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface Project {
  name: string;
  status?: string;
  startDate?: string;
  endDate?: string;
}

interface ProjectListingProps {
  projects: Project[];
  onProjectClick?: (project: any) => void;
  userRole?: string;
  onSummaryClick?: (project: any) => void;
}

// Helper to get status badge color
const getStatusColor = (status?: string) => {
  switch (status?.toLowerCase()) {
    case 'active':
      return 'bg-green-500/20 text-green-400 border-green-500/30';
    case 'completed':
      return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
    case 'planned':
    case 'planning':
      return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
    case 'on hold':
    case 'hold':
      return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
    default:
      return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
  }
};

export const ProjectListing: React.FC<ProjectListingProps> = ({ projects, onProjectClick, userRole, onSummaryClick }) => {
  // Check if the user role should see the Summary button
  const showSummaryButton = userRole === 'Site PM' || userRole === 'PMAG';

  return (
    <div className="py-4 sm:py-6">
      <div className="space-y-3">
        {projects.map((project, index) => (
          <Card
            key={index}
            className="rounded-xl border border-border bg-card text-card-foreground shadow-sm hover:shadow-md transition-all duration-300 p-3 cursor-pointer hover:border-primary"
            onClick={() => onProjectClick && onProjectClick(project)}
          >
            <div className="flex items-center gap-3">
              {/* Logo */}
              <div className="flex-shrink-0 w-16 h-12 flex items-center justify-center bg-muted/50 rounded-lg">
                <img
                  src="/logo.png"
                  alt="Logo"
                  className="h-8 w-auto"
                />
              </div>

              {/* Project name - takes remaining space */}
              <div className="flex-1 min-w-0">
                <h3 className="text-base font-semibold text-foreground truncate" title={project.name}>
                  {project.name}
                </h3>
              </div>

              {/* Status Badge */}
              <div className="flex-shrink-0">
                <span className={`px-3 py-1.5 text-xs font-semibold rounded-full border uppercase tracking-wide ${getStatusColor(project.status)}`}>
                  {project.status || 'Active'}
                </span>
              </div>

              {/* Start Date */}
              <div className="hidden md:flex items-center gap-2 flex-shrink-0 min-w-[140px]">
                <Calendar className="text-green-500 flex-shrink-0" size={16} />
                <div className="flex flex-col">
                  <span className="text-[10px] text-muted-foreground uppercase font-medium">Start</span>
                  <span className="text-sm text-foreground font-medium">
                    {project.startDate || 'N/A'}
                  </span>
                </div>
              </div>

              {/* End Date */}
              <div className="hidden md:flex items-center gap-2 flex-shrink-0 min-w-[140px]">
                <Calendar className="text-red-500 flex-shrink-0" size={16} />
                <div className="flex flex-col">
                  <span className="text-[10px] text-muted-foreground uppercase font-medium">End</span>
                  <span className="text-sm text-foreground font-medium">
                    {project.endDate || 'N/A'}
                  </span>
                </div>
              </div>

              {/* Summary button - Only for Site PM and PMAG */}
              {showSummaryButton && onSummaryClick && (
                <div className="flex-shrink-0">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex items-center gap-2 text-primary border-primary/30 hover:bg-primary/10"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSummaryClick(project);
                    }}
                  >
                    <FileText size={16} />
                    <span className="hidden sm:inline">Summary</span>
                  </Button>
                </div>
              )}

              {/* Arrow button - Navigate to dashboard */}
              <div
                className="flex-shrink-0 cursor-pointer"
                onClick={() => onProjectClick && onProjectClick(project)}
              >
                <div className="w-10 h-10 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center hover:bg-primary/20 transition-all">
                  <ChevronRight className="text-primary" size={20} />
                </div>
              </div>
            </div>

            {/* Mobile row for dates and summary button */}
            <div className="md:hidden mt-3 pt-3 border-t border-border flex flex-wrap gap-4">
              <div className="flex items-center gap-2">
                <Calendar className="text-green-500 flex-shrink-0" size={14} />
                <span className="text-xs text-muted-foreground">Start: {project.startDate || 'N/A'}</span>
              </div>
              <div className="flex items-center gap-2">
                <Calendar className="text-red-500 flex-shrink-0" size={14} />
                <span className="text-xs text-muted-foreground">End: {project.endDate || 'N/A'}</span>
              </div>
              {showSummaryButton && onSummaryClick && (
                <Button
                  variant="outline"
                  size="sm"
                  className="flex items-center gap-1 text-xs text-primary border-primary/30 hover:bg-primary/10"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSummaryClick(project);
                  }}
                >
                  <FileText size={14} />
                  Summary
                </Button>
              )}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
};