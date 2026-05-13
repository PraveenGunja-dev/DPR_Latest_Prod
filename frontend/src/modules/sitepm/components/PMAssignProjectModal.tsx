import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { assignProjectsToMultipleSupervisors } from "@/services/projectService";

interface PMAssignProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  projects: any[];
  supervisors: any[];
  onAssignmentComplete: () => void;
}

const AVAILABLE_SHEETS = [
  { id: 'dp_qty', label: 'Daily Progress Quantity' },
  { id: 'manpower_details', label: 'Manpower Details' },
  { id: 'dp_vendor_block', label: 'DP Vendor Block' },
  { id: 'dp_block', label: 'DP Block' },
  { id: 'dp_vendor_idt', label: 'DP Vendor IDT' }
];

export const PMAssignProjectModal: React.FC<PMAssignProjectModalProps> = ({
  isOpen,
  onClose,
  projects,
  supervisors,
  onAssignmentComplete
}) => {
  const [assignForm, setAssignForm] = useState({
    projectIds: [] as string[],  // Changed to array for multiple projects
    supervisorIds: [] as string[],
    sheetTypes: [] as string[]
  });
  const [projectSearchTerm, setProjectSearchTerm] = useState('');
  const [supervisorSearchTerm, setSupervisorSearchTerm] = useState('');
  const [projectYearFilter, setProjectYearFilter] = useState('ALL');

  // Handle assign form change
  const handleAssignFormChange = (field: string, value: string | string[]) => {
    setAssignForm(prev => ({
      ...prev,
      [field]: value
    }));
  };

  // Handle supervisor selection toggle
  const toggleSupervisorSelection = (supervisorId: string) => {
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
  const toggleProjectSelection = (projectId: string) => {
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

  // Handle sheet selection toggle
  const toggleSheetSelection = (sheetId: string) => {
    setAssignForm(prev => {
      const currentIds = [...prev.sheetTypes];
      const index = currentIds.indexOf(sheetId);

      if (index >= 0) {
        currentIds.splice(index, 1);
      } else {
        currentIds.push(sheetId);
      }

      return {
        ...prev,
        sheetTypes: currentIds
      };
    });
  };

  // Function to handle assignment form reset
  const handleAssignFormReset = () => {
    setAssignForm({
      projectIds: [],
      supervisorIds: [],
      sheetTypes: []
    });
    // Reset search terms
    setProjectSearchTerm('');
    setSupervisorSearchTerm('');
    setProjectYearFilter('ALL');
  };

  // Extract FY year or fallback to date (April-March FY)
  const extractFY = (project: any): string => {
    const p6Id = project.P6Id || project.p6Id || project.Id || '';
    if (p6Id) {
      const match = p6Id.match(/FY\d{2}/i);
      if (match) return match[0].toUpperCase();
    }
    
    // Fallback to date
    const startDate = project.PlannedStartDate || project.PlanStart || project.planStart || project.StartDate;
    if (startDate && startDate !== 'N/A') {
      const date = new Date(startDate);
      if (!isNaN(date.getTime())) {
        const year = date.getFullYear();
        const month = date.getMonth(); // 0 is January
        const fyYear = month >= 3 ? year + 1 : year; // FY N is Apr Y to Mar Y+1
        return `FY${String(fyYear).slice(-2)}`;
      }
    }
    return '';
  };

  // Compute available years
  const availableYears = React.useMemo(() => {
    const years = new Set<string>();
    projects.forEach(p => {
      const fy = extractFY(p);
      if (fy) years.add(fy);
    });
    return Array.from(years).sort();
  }, [projects]);

  const handleAssignSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      // Assign project to multiple supervisors using the new API endpoint
      await assignProjectsToMultipleSupervisors(
        assignForm.projectIds.map(id => parseInt(id)),
        assignForm.supervisorIds.map(id => parseInt(id)),
        assignForm.sheetTypes
      );

      toast.success("Project assigned to selected users successfully!");
      onClose();

      // Reset form and search terms
      handleAssignFormReset();

      // Trigger refresh
      onAssignmentComplete();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Project assignment failed');
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
      if (!open) {
        onClose();
        handleAssignFormReset();
      }
    }}>
      <DialogContent className="max-w-md p-0 flex flex-col overflow-hidden">
        <DialogHeader className="gradient-adani px-6 py-4 flex-shrink-0 border-b border-white/10">
          <DialogTitle className="text-white">Assign Projects to Users</DialogTitle>
          <div className="sr-only">
            <DialogDescription>
              Select projects and users to assign.
            </DialogDescription>
          </div>
        </DialogHeader>
        <div className="p-6 overflow-y-auto">
          <form onSubmit={handleAssignSubmit} className="space-y-4">
          <div>
            <Label>Projects</Label>
            {/* Search and Year filter for projects */}
            <div className="flex gap-2 mb-2">
              <Input
                type="text"
                placeholder="Search projects..."
                value={projectSearchTerm}
                onChange={(e) => setProjectSearchTerm(e.target.value)}
                className="flex-1"
              />
              <select 
                className="w-[100px] border border-border rounded-md px-2 py-1 text-sm bg-background"
                value={projectYearFilter}
                onChange={(e) => setProjectYearFilter(e.target.value)}
              >
                <option value="ALL">All FY</option>
                {availableYears.map(year => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </select>
            </div>
            <div className="border border-border rounded-md max-h-40 overflow-y-auto overflow-x-hidden">
              {projects.length > 0 ? (
                // Filter projects based on search term
                projects
                  .filter(project => {
                    const name = project.Name || project.name || "";
                    const matchesSearch = name.toLowerCase().includes(projectSearchTerm.toLowerCase());
                    const fy = extractFY(project);
                    const matchesYear = projectYearFilter === 'ALL' || fy === projectYearFilter;
                    return matchesSearch && matchesYear;
                  })
                  .map((project) => {
                    const value = (project.ObjectId || project.id || '').toString();

                    // Skip items with empty values
                    if (!value) return null;

                    return (
                      <div
                        key={project.ObjectId || project.id || project.Name}
                        className={`flex items-center p-2 hover:bg-muted cursor-pointer ${assignForm.projectIds.includes(value) ? 'bg-muted' : ''
                          }`}
                        onClick={() => toggleProjectSelection(value)}
                      >
                        <input
                          type="checkbox"
                          checked={assignForm.projectIds.includes(value)}
                          onChange={() => toggleProjectSelection(value)}
                          className="mr-2 h-4 w-4 flex-shrink-0 rounded border-border"
                        />
                        <div className="font-medium text-sm truncate">{project.Name || project.name}</div>
                      </div>
                    );
                  })
              ) : (
                <div className="p-4 text-center text-muted-foreground">
                  No projects available
                </div>
              )}
            </div>
            {assignForm.projectIds.length > 0 && (
              <div className="mt-2 text-sm text-muted-foreground">
                Selected {assignForm.projectIds.length} project(s)
              </div>
            )}
          </div>
          <div>
            <Label>Users</Label>
            {/* Search input for supervisors */}
            <div className="mb-2">
              <Input
                type="text"
                placeholder="Search users..."
                value={supervisorSearchTerm}
                onChange={(e) => setSupervisorSearchTerm(e.target.value)}
                className="mb-2"
              />
            </div>
            <div className="border border-border rounded-md max-h-40 overflow-y-auto overflow-x-hidden">
              {supervisors && supervisors.length > 0 ? (
                // Filter supervisors based on search term
                supervisors
                  .filter(supervisor => {
                    const name = supervisor.Name || supervisor.name || "";
                    const email = supervisor.Email || supervisor.email || "";
                    return name.toLowerCase().includes(supervisorSearchTerm.toLowerCase()) ||
                      email.toLowerCase().includes(supervisorSearchTerm.toLowerCase());
                  })
                  .map((supervisor) => {
                    const value = (supervisor.ObjectId || supervisor.id || '').toString();

                    // Skip items with empty values
                    if (!value) return null;

                    return (
                      <div
                        key={supervisor.ObjectId || supervisor.id || supervisor.Name}
                        className={`flex items-center p-2 hover:bg-muted cursor-pointer ${assignForm.supervisorIds.includes(value) ? 'bg-muted' : ''
                          }`}
                        onClick={() => toggleSupervisorSelection(value)}
                      >
                        <input
                          type="checkbox"
                          checked={assignForm.supervisorIds.includes(value)}
                          onChange={() => toggleSupervisorSelection(value)}
                          className="mr-2 h-4 w-4 flex-shrink-0 rounded border-border"
                        />
                        <div className="min-w-0">
                          <div className="font-medium text-sm truncate">{supervisor.Name || supervisor.name}</div>
                          <div className="text-xs text-muted-foreground truncate">{supervisor.Email || supervisor.email}</div>
                        </div>
                      </div>
                    );
                  })
              ) : (
                <div className="p-4 text-center text-muted-foreground">
                  No users available
                </div>
              )}
            </div>
            {assignForm.supervisorIds.length > 0 && (
              <div className="mt-2 text-sm text-muted-foreground">
                Selected {assignForm.supervisorIds.length} user(s)
              </div>
            )}
          </div>

          <div>
            <Label>Permitted Sheets (Optional)</Label>
            <div className="border border-border rounded-md mt-2 p-2 grid gap-2">
              {AVAILABLE_SHEETS.map(sheet => (
                <div key={sheet.id} className="flex items-center space-x-2 p-2 hover:bg-muted cursor-pointer rounded" onClick={() => toggleSheetSelection(sheet.id)}>
                  <input
                    type="checkbox"
                    checked={assignForm.sheetTypes.includes(sheet.id)}
                    onChange={() => toggleSheetSelection(sheet.id)}
                    className="mr-2 h-4 w-4 flex-shrink-0 rounded border-border"
                  />
                  <label className="flex-1 cursor-pointer text-sm font-medium">
                    {sheet.label}
                  </label>
                </div>
              ))}
              <p className="text-xs text-muted-foreground mt-2 px-1">
                If no sheets are selected, the user will have access to all sheets by default.
              </p>
            </div>
          </div>

          <div className="flex justify-end space-x-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={assignForm.projectIds.length === 0 || assignForm.supervisorIds.length === 0}
            >
              {assignForm.projectIds.length > 0 && assignForm.supervisorIds.length > 0
                ? `Assign ${assignForm.projectIds.length} Project(s) to ${assignForm.supervisorIds.length} User(s)`
                : 'Assign Projects to Users'}
            </Button>
          </div>
        </form>
        </div>
      </DialogContent>
    </Dialog>
  );
};