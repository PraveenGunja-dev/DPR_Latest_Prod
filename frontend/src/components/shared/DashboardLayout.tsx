import React from "react";
import { motion } from "framer-motion";
import { Navbar } from "@/components/Navbar";

interface DashboardLayoutProps {
  children: React.ReactNode;
  userName: string;
  userRole: string;
  projectName?: string;
  onAddUser?: () => void;
  onAssignProject?: () => void;
  onCreateProject?: () => void;
}

export const DashboardLayout: React.FC<DashboardLayoutProps> = ({
  children,
  userName,
  userRole,
  projectName,
  onAddUser,
  onAssignProject,
  onCreateProject
}) => {
  return (
    <motion.div
      className="min-h-screen bg-background"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      <Navbar
        userName={userName}
        userRole={userRole}
        projectName={projectName}
        onAddUser={onAddUser}
        onAssignProject={onAssignProject}
      />
      <div className="w-full px-2 sm:px-4 lg:px-6 py-3 sm:py-4 lg:py-6">
        {children}
      </div>
    </motion.div>
  );
};