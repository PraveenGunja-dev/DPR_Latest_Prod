import React, { useState } from "react";
import { SharedModal } from "@/components/shared/SharedModal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface PMAGUserManagementModalsProps {
  showCreateUserModal: boolean;
  setShowCreateUserModal: React.Dispatch<React.SetStateAction<boolean>>;
  showCreateProjectModal: boolean;
  setShowCreateProjectModal: React.Dispatch<React.SetStateAction<boolean>>;
  showRegisterModal: boolean;
  setShowRegisterModal: React.Dispatch<React.SetStateAction<boolean>>;
  showAssignProjectModal: boolean;
  setShowAssignProjectModal: React.Dispatch<React.SetStateAction<boolean>>;
  projects: any[];
  supervisors: any[];
  registerForm: {
    Name: string;
    Email: string;
    password: string;
    Role: "Site PM" | "PMAG";
    assignProject: boolean;
    ProjectId: string | number;
    sheetTypes: string[];
  };
  setRegisterForm: React.Dispatch<React.SetStateAction<any>>;
  assignForm: {
    projectIds: string[];
    supervisorIds: string[];
    sheetTypes: string[];
  };
  setAssignForm: React.Dispatch<React.SetStateAction<any>>;
  projectForm: {
    Name: string;
    Location: string;
    Status: string;
    PercentComplete: number;
    PlannedStartDate: string;
    PlannedFinishDate: string;
  };
  setProjectForm: React.Dispatch<React.SetStateAction<any>>;
  registerLoading: boolean;
  assignLoading: boolean;
  loading: boolean;
  projectSearchTerm: string;
  setProjectSearchTerm: React.Dispatch<React.SetStateAction<string>>;
  supervisorSearchTerm: string;
  setSupervisorSearchTerm: React.Dispatch<React.SetStateAction<string>>;
  onCreateUser: (e: React.FormEvent) => void;
  onCreateProject: (e: React.FormEvent) => void;
  onRegisterUser: (e: React.FormEvent) => void;
  onAssignProjects: (e: React.FormEvent) => void;
  onRegisterFormChange: (field: string, value: string | boolean | string[]) => void;
  onAssignFormChange: (field: string, value: string | string[]) => void;
  onProjectFormChange: (field: string, value: string | number) => void;
  onToggleSupervisorSelection: (supervisorId: string) => void;
  onToggleProjectSelection: (projectId: string) => void;
}

const AVAILABLE_SHEETS = [
  { id: 'dp_qty', label: 'Daily Progress Quantity' },
  { id: 'manpower_details', label: 'Manpower Details' },
  { id: 'dp_vendor_block', label: 'DP Vendor Block' },
  { id: 'dp_block', label: 'DP Block' },
  { id: 'dp_vendor_idt', label: 'DP Vendor IDT' }
];

export const PMAGUserManagementModals: React.FC<PMAGUserManagementModalsProps> = ({
  showCreateUserModal,
  setShowCreateUserModal,
  showCreateProjectModal,
  setShowCreateProjectModal,
  showRegisterModal,
  setShowRegisterModal,
  showAssignProjectModal,
  setShowAssignProjectModal,
  projects,
  supervisors,
  registerForm,
  setRegisterForm,
  assignForm,
  setAssignForm,
  projectForm,
  setProjectForm,
  registerLoading,
  assignLoading,
  loading,
  projectSearchTerm,
  setProjectSearchTerm,
  supervisorSearchTerm,
  setSupervisorSearchTerm,
  onCreateUser,
  onCreateProject,
  onRegisterUser,
  onAssignProjects,
  onRegisterFormChange,
  onAssignFormChange,
  onProjectFormChange,
  onToggleSupervisorSelection,
  onToggleProjectSelection
}) => {
  return (
    <>
      {/* Create User Modal */}
      <SharedModal
        isOpen={showCreateUserModal}
        onClose={() => setShowCreateUserModal(false)}
        title="Create New User"
      >
        <form onSubmit={onCreateUser} className="space-y-4">
          <div>
            <Label htmlFor="user-role">Role</Label>
            <Select
              value={registerForm.Role}
              onValueChange={(value) => onRegisterFormChange("Role", value as "Site PM" | "PMAG")}
            >
              <SelectTrigger id="user-role">
                <SelectValue placeholder="Select role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Site PM">Site PM</SelectItem>
                <SelectItem value="PMAG">PMAG</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex justify-end space-x-2">
            <Button type="button" variant="outline" onClick={() => setShowCreateUserModal(false)}>
              Cancel
            </Button>
            <Button type="submit">Continue</Button>
          </div>
        </form>
      </SharedModal>

      {/* Create Project Modal */}
      <SharedModal
        isOpen={showCreateProjectModal}
        onClose={() => setShowCreateProjectModal(false)}
        title="Create New Project"
      >
        <form onSubmit={onCreateProject} className="space-y-4">
          <div>
            <Label htmlFor="project-name">Project Name</Label>
            <Input
              id="project-name"
              value={projectForm.Name}
              onChange={(e) => onProjectFormChange("Name", e.target.value)}
              placeholder="Enter project name"
              required
            />
          </div>
          <div>
            <Label htmlFor="project-location">Location</Label>
            <Input
              id="project-location"
              value={projectForm.Location}
              onChange={(e) => onProjectFormChange("Location", e.target.value)}
              placeholder="Enter project location"
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="start-date">Start Date</Label>
              <Input
                id="start-date"
                type="date"
                value={projectForm.PlannedStartDate}
                onChange={(e) => onProjectFormChange("PlannedStartDate", e.target.value)}
                required
              />
            </div>
            <div>
              <Label htmlFor="end-date">End Date</Label>
              <Input
                id="end-date"
                type="date"
                value={projectForm.PlannedFinishDate}
                onChange={(e) => onProjectFormChange("PlannedFinishDate", e.target.value)}
                required
              />
            </div>
          </div>
          <div className="flex justify-end space-x-2">
            <Button type="button" variant="outline" onClick={() => setShowCreateProjectModal(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Creating..." : "Create Project"}
            </Button>
          </div>
        </form>
      </SharedModal>

      {/* Register User Modal */}
      <SharedModal
        isOpen={showRegisterModal}
        onClose={() => setShowRegisterModal(false)}
        title="Register New User"
      >
        <form onSubmit={onRegisterUser} className="space-y-4">
          <div>
            <Label htmlFor="reg-name">Full Name</Label>
            <Input
              id="reg-name"
              value={registerForm.Name}
              onChange={(e) => onRegisterFormChange("Name", e.target.value)}
              placeholder="Enter full name"
              required
            />
          </div>
          <div>
            <Label htmlFor="reg-email">Email</Label>
            <Input
              id="reg-email"
              type="email"
              value={registerForm.Email}
              onChange={(e) => onRegisterFormChange("Email", e.target.value)}
              placeholder="Enter email"
              required
            />
          </div>
          <div>
            <Label htmlFor="reg-password">Password</Label>
            <Input
              id="reg-password"
              type="password"
              value={registerForm.password}
              onChange={(e) => onRegisterFormChange("password", e.target.value)}
              placeholder="Enter password"
              required
            />
          </div>
          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="assign-project"
              checked={registerForm.assignProject}
              onChange={(e) => onRegisterFormChange("assignProject", e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
            />
            <Label htmlFor="assign-project">Assign project to this user</Label>
          </div>
          {registerForm.assignProject && (
            <div className="space-y-4 pt-2 border-t border-border">
              <div>
                <Label htmlFor="reg-project">Project</Label>
                <Select
                  value={registerForm.ProjectId.toString()}
                  onValueChange={(value) => onRegisterFormChange("ProjectId", value)}
                >
                  <SelectTrigger id="reg-project">
                    <SelectValue placeholder="Select project to assign" />
                  </SelectTrigger>
                  <SelectContent>
                    {(Array.isArray(projects) ? projects : []).map((project) => {
                      const value = (project.ObjectId || project.id || '').toString();
                      if (!value) return null;

                      return (
                        <SelectItem
                          key={project.ObjectId || project.id || project.Name}
                          value={value}
                        >
                          {project.Name}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="mb-2 block">Permitted Sheets (Optional)</Label>
                <div className="border border-border rounded-md p-2 grid grid-cols-1 gap-1">
                  {AVAILABLE_SHEETS.map(sheet => (
                    <div
                      key={sheet.id}
                      className="flex items-center space-x-2 p-2 hover:bg-muted cursor-pointer rounded"
                      onClick={() => {
                        const current = [...(registerForm.sheetTypes || [])];
                        const index = current.indexOf(sheet.id);
                        if (index >= 0) {
                          current.splice(index, 1);
                        } else {
                          current.push(sheet.id);
                        }
                        onRegisterFormChange("sheetTypes", current);
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={(registerForm.sheetTypes || []).includes(sheet.id)}
                        onChange={() => { }} // Handled by div onClick
                        className="h-4 w-4 rounded border-border"
                      />
                      <span className="text-sm">{sheet.label}</span>
                    </div>
                  ))}
                </div>
                <p className="text-[10px] text-muted-foreground mt-1">
                  If no sheets are selected, the user will have access to all sheets by default.
                </p>
              </div>
            </div>
          )}
          <div className="flex justify-end space-x-2">
            <Button type="button" variant="outline" onClick={() => setShowRegisterModal(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={registerLoading}>
              {registerLoading ? "Registering..." : "Register User"}
            </Button>
          </div>
        </form>
      </SharedModal>

      {/* Assign Project Modal */}
      <SharedModal
        isOpen={showAssignProjectModal}
        onClose={() => setShowAssignProjectModal(false)}
        title="Assign Projects to Users"
        maxWidth="max-w-lg"
      >
        <form onSubmit={onAssignProjects} className="space-y-4">
          <div>
            <Label>Projects</Label>
            <div className="mb-2">
              <Input
                type="text"
                placeholder="Search projects..."
                value={projectSearchTerm}
                onChange={(e) => setProjectSearchTerm(e.target.value)}
                className="mb-2"
              />
            </div>
            <div className="border border-border rounded-md max-h-40 overflow-y-auto overflow-x-hidden">
              {(Array.isArray(projects) && projects.length > 0) ? (
                projects
                  .filter(project =>
                    project.Name.toLowerCase().includes(projectSearchTerm.toLowerCase())
                  )
                  .map((project) => {
                    const value = (project.ObjectId || project.id || '').toString();
                    if (!value) return null;

                    return (
                      <div
                        key={project.ObjectId || project.id || project.Name}
                        className={`flex items-center p-2 hover:bg-muted cursor-pointer ${assignForm.projectIds.includes(value) ? 'bg-muted' : ''
                          }`}
                        onClick={() => onToggleProjectSelection(value)}
                      >
                        <input
                          type="checkbox"
                          checked={assignForm.projectIds.includes(value)}
                          onChange={() => onToggleProjectSelection(value)}
                          className="mr-2 h-4 w-4 flex-shrink-0 rounded border-border"
                        />
                        <div className="font-medium text-sm truncate">{project.Name}</div>
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
              {(Array.isArray(supervisors) && supervisors.length > 0) ? (
                supervisors
                  .filter(supervisor =>
                    (supervisor.Name || '').toLowerCase().includes(supervisorSearchTerm.toLowerCase()) ||
                    (supervisor.Email || '').toLowerCase().includes(supervisorSearchTerm.toLowerCase())
                  )
                  .map((supervisor) => {
                    const value = (supervisor.ObjectId || supervisor.id || '').toString();
                    if (!value) return null;

                    return (
                      <div
                        key={supervisor.ObjectId || supervisor.id || supervisor.Name}
                        className={`flex items-center p-2 hover:bg-muted cursor-pointer ${assignForm.supervisorIds.includes(value) ? 'bg-muted' : ''
                          }`}
                        onClick={() => onToggleSupervisorSelection(value)}
                      >
                        <input
                          type="checkbox"
                          checked={assignForm.supervisorIds.includes(value)}
                          onChange={() => onToggleSupervisorSelection(value)}
                          className="mr-2 h-4 w-4 flex-shrink-0 rounded border-border"
                        />
                        <div className="min-w-0">
                          <div className="font-medium text-sm truncate">{supervisor.Name}</div>
                          <div className="text-xs text-muted-foreground truncate">{supervisor.Email}</div>
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
            <Label className="mb-2 block">Permitted Sheets (Optional)</Label>
            <div className="border border-border rounded-md p-2 grid grid-cols-1 gap-1 max-h-40 overflow-y-auto">
              {AVAILABLE_SHEETS.map(sheet => (
                <div
                  key={sheet.id}
                  className="flex items-center space-x-2 p-2 hover:bg-muted cursor-pointer rounded"
                  onClick={() => {
                    const current = [...(assignForm.sheetTypes || [])];
                    const index = current.indexOf(sheet.id);
                    if (index >= 0) {
                      current.splice(index, 1);
                    } else {
                      current.push(sheet.id);
                    }
                    onAssignFormChange("sheetTypes", current);
                  }}
                >
                  <input
                    type="checkbox"
                    checked={(assignForm.sheetTypes || []).includes(sheet.id)}
                    onChange={() => { }} // Handled by div onClick
                    className="h-4 w-4 rounded border-border"
                  />
                  <span className="text-sm">{sheet.label}</span>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              If no sheets are selected, the user will have access to all sheets by default.
            </p>
          </div>

          <div className="flex justify-end space-x-2">
            <Button type="button" variant="outline" onClick={() => setShowAssignProjectModal(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={assignForm.projectIds.length === 0 || assignForm.supervisorIds.length === 0 || assignLoading}
            >
              {assignLoading ? "Assigning..." : `Assign ${assignForm.projectIds.length} Project(s) to ${assignForm.supervisorIds.length} User(s)`}
            </Button>
          </div>
        </form>
      </SharedModal>
    </>
  );
};