import React from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { FileCheck, TrendingUp, Users, Award, History, Archive, Filter, Camera, Mail } from "lucide-react";
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
  onShowSnapshot?: () => void;
  isDroneEligible?: boolean;
  onCompareWithDrone?: () => void;
  onSendDelayAlerts?: () => void;
  projectDetails?: any;
  formatDate?: (dateString: string | null | undefined) => string;
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
  onShowSnapshot,
  isDroneEligible,
  onCompareWithDrone,
  onSendDelayAlerts,
  projectDetails,
  formatDate
}) => {
  const navigate = useNavigate();

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
          <motion.div
            className="flex items-center gap-2 text-muted-foreground"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
          >
            <span>{projectName ? `Project: ${projectName}` : "Project management dashboard"}</span>
            {projectName && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={() => navigate("/projects")}
              >
                Change
              </Button>
            )}
          </motion.div>
          {/* Shown for every project type - the dates are rolled up from the activity table for
              Solar, Wind, PSS and BESS alike. */}
          {formatDate && (
            <motion.div
              className="text-base text-muted-foreground mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.3 }}
            >
              {(() => {
                const hasStarted = projectDetails?.Status?.toLowerCase() === 'active' || projectDetails?.Status?.toLowerCase() === 'completed' || !!projectDetails?.ActualStartDate;
                const hasFinished = projectDetails?.Status?.toLowerCase() === 'completed';

                return (
                  <>
                    <div><span className="font-medium text-foreground/70">Base line start date:</span> {formatDate(projectDetails?.PlannedStartDate || projectDetails?.plan_start || projectDetails?.plannedStartDate) || 'Not set'}</div>
                    <div><span className="font-medium text-foreground/70">Base line finish date:</span> {formatDate(projectDetails?.PlannedFinishDate || projectDetails?.plan_end || projectDetails?.plannedFinishDate) || 'Not set'}</div>
                    
                    <div>
                        <span className="font-medium text-foreground/70">{hasStarted ? 'Actual start date:' : 'Forecast start date:'}</span>{' '}
                        <span className={hasStarted ? "text-green-600 font-semibold" : "text-blue-600 font-semibold"}>{formatDate(projectDetails?.StartDate || projectDetails?.start_date || projectDetails?.startDate) || 'Not set'}</span>
                    </div>
                    <div>
                        <span className="font-medium text-foreground/70">{hasFinished ? 'Actual finish date:' : 'Forecast end date:'}</span>{' '}
                        <span className={hasFinished ? "text-green-600 font-semibold" : "text-blue-600 font-semibold"}>{formatDate(projectDetails?.FinishDate || projectDetails?.finish_date || projectDetails?.finishDate) || 'Not set'}</span>
                    </div>
                  </>
                );
              })()}
            </motion.div>
          )}
        </div>
        <motion.div
          className="flex items-center space-x-3"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2 }}
        >
          {formatDate && (
            <div className="flex flex-col text-base text-right mr-2 text-muted-foreground border-r pr-5 border-gray-200 gap-y-1">
                <div><span className="font-medium text-foreground/70">Data date:</span> {formatDate(projectDetails?.p6_data_date) || 'Not set'}</div>
                <div><span className="font-medium text-foreground/70">Last updated:</span> {formatDate(projectDetails?.p6_last_updated) || 'Not set'}</div>
            </div>
          )}
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
          {onSendDelayAlerts && (
            <Button
              variant="outline"
              onClick={onSendDelayAlerts}
              className="flex items-center text-amber-600 border-amber-200 shadow-sm transition-colors"
            >
              <Mail className="w-4 h-4 mr-2" />
              Send Delay Alerts
            </Button>
          )}
          {onShowSnapshot && (
            <Button
              variant="default"
              onClick={onShowSnapshot}
              className="flex items-center gradient-adani text-white shadow-md hover:shadow-lg transition-shadow"
            >
              <Camera className="w-4 h-4 mr-2" />
              Snapshot
            </Button>
          )}
        </motion.div>
      </div>

      <StatsCards stats={statsData} />
    </div>
  );
};