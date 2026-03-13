import React from 'react';
import { motion } from 'framer-motion';
import { FileText, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ProjectsHeaderProps {
  userRole?: string;
  searchTerm: string;
  onSearchChange: (term: string) => void;
  onAddUserClick?: () => void;
}

export const ProjectsHeader: React.FC<ProjectsHeaderProps> = ({
  userRole,
  searchTerm,
  onSearchChange,
  onAddUserClick
}) => {
  // Show Add User button for PMAG and Site PM roles
  const showAddUserButton = userRole === 'PMAG' || userRole === 'Site PM';

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="mb-8"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4 sm:mb-6">
        <div>
          <h1 className="text-2xl sm:text-4xl font-bold mb-1 sm:mb-2 bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
            Your Projects
          </h1>
          <p className="text-xs sm:text-base text-muted-foreground">
            {userRole === "supervisor"
              ? "Select a project to manage your daily activities"
              : "Select a project to view and manage"}
          </p>
        </div>

        {/* Add User Button */}
        {showAddUserButton && onAddUserClick && (
          <Button
            onClick={onAddUserClick}
            className="flex items-center gap-2 gradient-adani text-white"
          >
            <UserPlus size={18} />
            <span className="hidden sm:inline">Add User</span>
          </Button>
        )}
      </div>

      {/* Search Bar */}
      <div className="mb-6">
        <div className="relative max-w-md">
          <FileText className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
          <input
            type="text"
            placeholder="Search projects..."
            className="pl-10 w-full p-2 border rounded-md bg-background"
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>
      </div>
    </motion.div>
  );
};