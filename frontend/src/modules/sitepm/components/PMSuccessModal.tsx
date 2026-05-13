import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface PMSuccessModalProps {
  isOpen: boolean;
  onClose: () => void;
  registeredUser: {
    email: string;
    password: string;
    role: string;
    projectId: string | number | null;
    projectName: string | null;
  };
  projects: any[];
}

export const PMSuccessModal: React.FC<PMSuccessModalProps> = ({
  isOpen,
  onClose,
  registeredUser,
  projects
}) => {
  // Reset registered user state when closing the success modal
  const handleSuccessModalClose = () => {
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleSuccessModalClose}>
      <DialogContent className="max-w-md p-0 flex flex-col overflow-hidden">
        <DialogHeader className="gradient-adani px-6 py-4 flex-shrink-0 border-b border-white/10">
          <DialogTitle className="text-white">Supervisor Created Successfully</DialogTitle>
        </DialogHeader>
        <div className="p-6 space-y-4">
          <p>Supervisor has been created with the following credentials:</p>
          <div className="bg-muted p-4 rounded-lg">
            <p><strong>Email:</strong> {registeredUser.email}</p>
            <p><strong>Password:</strong> {registeredUser.password}</p>
            <p><strong>Role:</strong> {registeredUser.role} (Site PM can only create supervisors)</p>
            {registeredUser.projectId && (
              <p className="mt-2 p-2 bg-green-100 rounded">
                <strong>✅ Project Assigned:</strong>{" "}
                {registeredUser.projectName || projects.find(p => p.ObjectId == registeredUser.projectId || p.id == registeredUser.projectId)?.Name || "Unknown Project"}
              </p>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            Please share these credentials with the supervisor. They can now log in to the system.
            {registeredUser.projectId && " The supervisor will only have access to the assigned project."}
          </p>
          <div className="flex justify-end">
            <Button onClick={handleSuccessModalClose}>Close</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};