import React from "react";
import { motion } from "framer-motion";
import { FileCheck, TrendingUp, Users, Award, History, Archive, Filter } from "lucide-react";
import { StatsCards } from "@/components/shared/StatsCards";
import { Button } from "@/components/ui/button";

interface PMAGDashboardSummaryProps {
  projectName: string;
  userName?: string;
  approvedEntries: any[];
  historyEntries: any[];
  archivedEntries: any[];
  teamMembers?: any[];
  onShowMembers?: () => void;
  onShowApproved?: () => void;
  onShowSubmitted?: () => void;
  onShowArchived?: () => void;
  onShowSnapshotFilter?: () => void;
  onShowComparison?: () => void;
  isDroneEligible?: boolean;
  onCompareWithDrone?: () => void;
}

export const PMAGDashboardSummary: React.FC<PMAGDashboardSummaryProps> = ({
  projectName,
  userName,
  approvedEntries = [],
  historyEntries = [],
  archivedEntries = [],
  teamMembers = [],
  onShowMembers,
  onShowApproved,
  onShowSubmitted,
  onShowArchived,
  onShowSnapshotFilter,
  onShowComparison,
  isDroneEligible,
  onCompareWithDrone
}) => {
  const statsData = [
    {
      title: "Approved Sheets",
      value: (Array.isArray(approvedEntries) ? approvedEntries.length : 0),
      icon: FileCheck,
      onClick: onShowApproved
    },
    {
      title: "Submitted Entries",
      value: (Array.isArray(historyEntries) ? historyEntries.length : 0),
      icon: TrendingUp,
      onClick: onShowSubmitted
    },
    {
      title: "Team Members",
      value: (Array.isArray(teamMembers) ? teamMembers.length : 0),
      icon: Users,
      onClick: onShowMembers
    },
    {
      title: "Archived Sheets",
      value: (Array.isArray(archivedEntries) ? archivedEntries.length : 0),
      icon: Archive,
      onClick: onShowArchived
    },
  ];

  return (
    <div className="mb-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
        <div>
          <motion.h1
            className="text-3xl md:text-4xl font-bold mb-2 bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 }}
          >
            Welcome, {userName || 'User'}
          </motion.h1>
          <motion.p
            className="text-muted-foreground"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
          >
            {projectName ? `Project: ${projectName}` : "Project management dashboard"}
          </motion.p>
        </div>
        <motion.div
          className="flex items-center space-x-3"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2 }}
        >
          {onShowSnapshotFilter && (
            <Button
              variant="default"
              onClick={onShowSnapshotFilter}
              className="flex items-center"
            >
              <Filter className="w-4 h-4 mr-2" />
              Snapshot Filter
            </Button>
          )}
          {onShowComparison && (
            <Button
              variant="outline"
              onClick={onShowComparison}
              className="flex items-center"
            >
              <History className="w-4 h-4 mr-2" />
              Compare Dates
            </Button>
          )}
          {isDroneEligible && onCompareWithDrone && (
            <Button
              variant="outline"
              onClick={onCompareWithDrone}
              className="flex items-center font-bold border-primary bg-primary/5 text-primary hover:bg-primary hover:text-white shadow-sm transition-colors"
            >
              Compare with Drone
            </Button>
          )}
          {/* History button removed as requested */}
        </motion.div>
      </div>

      <StatsCards stats={statsData} />
    </div>
  );
};