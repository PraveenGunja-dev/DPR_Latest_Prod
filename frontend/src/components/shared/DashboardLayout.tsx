import React from "react";
import { motion } from "framer-motion";
import { Navbar } from "@/components/Navbar";

interface DashboardLayoutProps {
  children: React.ReactNode;
  userName: string;
  userRole: string;
  projectName?: string;
  projectId?: string | number;
  projectP6Id?: string | number;
  projectDetails?: any;
  onAddUser?: () => void;
  onAssignProject?: () => void;
  onCreateProject?: () => void;
}

export const DashboardLayout: React.FC<DashboardLayoutProps> = ({
  children,
  userName,
  userRole,
  projectName,
  projectId,
  projectP6Id,
  projectDetails,
  onAddUser,
  onAssignProject,
  onCreateProject
}) => {
  return (
    <motion.div
      className="h-screen flex flex-col overflow-hidden bg-background"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      <Navbar
        userName={userName}
        userRole={userRole}
        projectName={projectName}
        projectId={projectId}
        projectP6Id={projectP6Id}
        projectDetails={projectDetails}
        onAddUser={onAddUser}
        onAssignProject={onAssignProject}
      />
      <div className="flex-1 min-h-0 w-full px-2 sm:px-4 lg:px-6 py-3 sm:py-4 lg:py-6 flex flex-col overflow-auto">
        {children}
      </div>
    </motion.div>
  );
};