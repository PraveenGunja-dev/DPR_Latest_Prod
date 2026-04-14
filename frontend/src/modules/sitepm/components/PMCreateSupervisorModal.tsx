import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { registerUser } from "@/services/userService";
import { assignProjectToSupervisor } from "@/services/projectService";

interface PMCreateSupervisorModalProps {
  isOpen: boolean;
  onClose: () => void;
  projects: any[];
  onUserCreated: () => void;
}

export const PMCreateSupervisorModal: React.FC<PMCreateSupervisorModalProps> = ({
  isOpen,
  onClose,
  projects,
  onUserCreated
}) => {
  const [supervisorForm, setSupervisorForm] = useState({
    Name: "",
    Email: "",
    password: "",
    assignProject: false,
    ProjectId: "" as string | number
  });
  const [supervisorLoading, setSupervisorLoading] = useState(false);

  const handleSupervisorFormChange = (field: string, value: string | boolean) => {
    setSupervisorForm(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleSupervisorSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSupervisorLoading(true);
    
    try {
      // First create the supervisor - Site PM can only create supervisors
      const userData: Omit<import('@/types').User, 'ObjectId'> & { password?: string, Role: string } = {
        Name: supervisorForm.Name,
        Email: supervisorForm.Email,
        password: supervisorForm.password,
        Role: "Supervisor"  // Hardcoded - Site PM can only create supervisors
      };
      
      const registeredUserResponse = await registerUser(userData);
      
      // If assignProject is checked and a project is selected, assign the project
      // This is the project assignment functionality for Site PM when creating supervisors
      let assignedProjectId = null;
      let assignedProjectName = null;
      if (supervisorForm.assignProject && supervisorForm.ProjectId) {
        try {
          // Ensure we're passing numbers to the API
          const projectId = parseInt(supervisorForm.ProjectId.toString());
          const supervisorId = registeredUserResponse.user.ObjectId;
          
          console.log('Assigning project:', { projectId, supervisorId });
          
          await assignProjectToSupervisor(projectId, supervisorId);
          
          // Store the project ID and name for display
          assignedProjectId = supervisorForm.ProjectId;
          assignedProjectName = projects.find(p => p.ObjectId == supervisorForm.ProjectId || p.id == supervisorForm.ProjectId)?.Name || "Unknown Project";
          
          toast.success(`Supervisor created and project assigned successfully!`);
        } catch (assignError) {
          console.error('Project assignment error:', assignError);
          toast.warning(`Supervisor created but project assignment failed: ${(assignError as Error).message}`);
        }
      } else {
        toast.success("Supervisor created successfully!");
      }
      
      // Reset form
      setSupervisorForm({
        Name: "",
        Email: "",
        password: "",
        assignProject: false,
        ProjectId: ""
      });
      
      // Close modal and trigger refresh
      onClose();
      onUserCreated();
    } catch (err) {
      console.error('Supervisor creation error:', err);
      toast.error(err instanceof Error ? err.message : 'Supervisor creation failed');
    } finally {
      setSupervisorLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Create New Supervisor (Site PM can only create supervisors)</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSupervisorSubmit} className="space-y-4">
          <div>
            <Label htmlFor="name">Full Name</Label>
            <Input
              id="name"
              value={supervisorForm.Name}
              onChange={(e) => handleSupervisorFormChange("Name", e.target.value)}
              placeholder="Enter full name"
              required
            />
          </div>
          <div>
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={supervisorForm.Email}
              onChange={(e) => handleSupervisorFormChange("Email", e.target.value)}
              placeholder="Enter email"
              required
            />
          </div>
          <div>
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              value={supervisorForm.password}
              onChange={(e) => handleSupervisorFormChange("password", e.target.value)}
              placeholder="Enter password"
              required
            />
          </div>
          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="assignProject"
              checked={supervisorForm.assignProject}
              onChange={(e) => handleSupervisorFormChange("assignProject", e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
            />
            <Label htmlFor="assignProject">Assign project to this supervisor (cannot be changed later)</Label>
          </div>
          {/* Project assignment functionality for Site PM when creating supervisors */}
          {supervisorForm.assignProject && (
            <div>
              <Label htmlFor="project">Project</Label>
              <Select 
                value={supervisorForm.ProjectId.toString()} 
                onValueChange={(value) => handleSupervisorFormChange("ProjectId", value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select project to assign" />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((project) => {
                    // Ensure we have a valid value for the SelectItem
                    const value = (project.ObjectId || project.id || '').toString();
                    
                    // Skip items with empty values
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
          )}
          <div className="flex justify-end space-x-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={supervisorLoading}>
              {supervisorLoading ? "Creating..." : "Create Supervisor"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};