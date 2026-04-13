import React from 'react';
import { motion } from 'framer-motion';
import { FileText, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ProjectsHeaderProps {
  userRole?: string;
  searchTerm: string;
  onSearchChange: (term: string) => void;
  typeFilter: string;
  onTypeFilterChange: (type: string) => void;
  yearFilter: string;
  onYearFilterChange: (year: string) => void;
  epsFilter?: string;
  onEpsFilterChange?: (eps: string) => void;
  availableYears: string[];
  availableTypes: string[];
  availableEps?: string[];
  onAddUserClick?: () => void;
}

export const ProjectsHeader: React.FC<ProjectsHeaderProps> = ({
  userRole,
  searchTerm,
  onSearchChange,
  typeFilter,
  onTypeFilterChange,
  yearFilter,
  onYearFilterChange,
  epsFilter = 'ALL',
  onEpsFilterChange,
  availableYears,
  availableTypes,
  availableEps = [],
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

      {/* Filters Bar */}
      <div className="flex flex-col md:flex-row gap-4 mb-6 pt-2 pb-2">
        {/* Search Bar */}
        <div className="relative flex-grow max-w-md">
          <FileText className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
          <input
            type="text"
            placeholder="Search projects by name..."
            className="pl-10 w-full p-2 border rounded-md bg-background focus:ring-2 focus:ring-primary/20 transition-all outline-none"
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>

        {/* Year Filter */}
        <div className="flex items-center gap-2">
           <span className="text-sm font-medium text-muted-foreground whitespace-nowrap">Year:</span>
           <select 
             className="p-2 border rounded-md bg-background text-sm min-w-[120px] focus:ring-2 focus:ring-primary/20 outline-none"
             value={yearFilter}
             onChange={(e) => onYearFilterChange(e.target.value)}
           >
             <option value="ALL">All Years</option>
             {availableYears.map(year => (
               <option key={year} value={year}>{year}</option>
             ))}
           </select>
        </div>

        {/* Type Filter */}
        <div className="flex items-center gap-2">
           <span className="text-sm font-medium text-muted-foreground whitespace-nowrap">Type:</span>
           <select 
             className="p-2 border rounded-md bg-background text-sm min-w-[120px] focus:ring-2 focus:ring-primary/20 outline-none"
             value={typeFilter}
             onChange={(e) => onTypeFilterChange(e.target.value)}
           >
             <option value="ALL">All Types</option>
             {availableTypes.map(type => (
               <option key={type} value={type}>{type}</option>
             ))}
           </select>
        </div>

        {/* EPS Filter */}
        {availableEps.length > 0 && onEpsFilterChange && (
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-muted-foreground whitespace-nowrap">EPS:</span>
            <select 
              className="p-2 border rounded-md bg-background text-sm min-w-[120px] focus:ring-2 focus:ring-primary/20 outline-none"
              value={epsFilter}
              onChange={(e) => onEpsFilterChange(e.target.value)}
            >
              <option value="ALL">All EPS</option>
              {availableEps.map(eps => (
                <option key={eps} value={eps}>{eps}</option>
              ))}
            </select>
          </div>
        )}
      </div>
    </motion.div>
  );
};