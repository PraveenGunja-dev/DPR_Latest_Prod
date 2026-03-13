import React from "react";
import { SharedModal } from "@/components/shared/SharedModal";
import { Button } from "@/components/ui/button";

interface PMAGSuccessModalProps {
  showSuccessModal: boolean;
  setShowSuccessModal: React.Dispatch<React.SetStateAction<boolean>>;
  registeredUser: {
    email: string;
    password: string;
    role: string;
    projectId: string | null;
  };
  projects: any[];
}

export const PMAGSuccessModal: React.FC<PMAGSuccessModalProps> = ({
  showSuccessModal,
  setShowSuccessModal,
  registeredUser,
  projects
}) => {
  const getProjectName = (projectId: string | null) => {
    if (!projectId) return null;
    const project = (Array.isArray(projects) ? projects : []).find(p =>
      p && (p.ObjectId == projectId || p.id == projectId)
    );
    return project ? project.Name : "Unknown Project";
  };

  return (
    <SharedModal
      isOpen={showSuccessModal}
      onClose={() => setShowSuccessModal(false)}
      title="User Registered Successfully"
    >
      <div className="space-y-4">
        <p>User has been registered with the following credentials:</p>
        <div className="bg-muted p-4 rounded-lg">
          <p><strong>Email:</strong> {registeredUser.email}</p>
          <p><strong>Password:</strong> {registeredUser.password}</p>
          <p><strong>Role:</strong> {registeredUser.role}</p>
          {registeredUser.projectId && (
            <p className="mt-2 p-2 bg-green-100 rounded">
              <strong>✅ Project Assigned:</strong>{" "}
              {getProjectName(registeredUser.projectId)}
            </p>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          Please share these credentials with the user. They can now log in to the system.
          {registeredUser.projectId && " The user will only have access to the assigned project."}
        </p>
        <div className="flex justify-end">
          <Button onClick={() => setShowSuccessModal(false)}>Close</Button>
        </div>
      </div>
    </SharedModal>
  );
};