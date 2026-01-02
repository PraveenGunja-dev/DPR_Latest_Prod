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
  onShowHistory?: () => void;
  onShowArchived?: () => void;
  onShowSnapshotFilter?: () => void;
}

export const PMAGDashboardSummary: React.FC<PMAGDashboardSummaryProps> = ({
  projectName,
  userName,
  approvedEntries,
  historyEntries,
  archivedEntries,
  onShowHistory,
  onShowArchived,
  onShowSnapshotFilter
}) => {
  const statsData = [
    { title: "Approved Sheets", value: approvedEntries.length, icon: FileCheck },
    { title: "Historical Entries", value: historyEntries.length, icon: TrendingUp },
    { title: "Team Members", value: 12, icon: Users },
    { title: "Performance Score", value: 94, icon: Award },
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
              className="flex items-center bg-purple-600 hover:bg-purple-700"
            >
              <Filter className="w-4 h-4 mr-2" />
              Snapshot Filter
            </Button>
          )}
          {onShowHistory && (
            <Button
              variant="outline"
              onClick={onShowHistory}
              className="flex items-center"
            >
              <History className="w-4 h-4 mr-2" />
              History
            </Button>
          )}
          {onShowArchived && (
            <Button
              variant="outline"
              onClick={onShowArchived}
              className="flex items-center"
            >
              <Archive className="w-4 h-4 mr-2" />
              Archived
            </Button>
          )}
        </motion.div>
      </div>

      <StatsCards stats={statsData} />
    </div>
  );
};