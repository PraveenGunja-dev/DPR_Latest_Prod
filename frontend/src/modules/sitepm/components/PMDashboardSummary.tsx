import React from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { FileText, CheckCircle, Clock, AlertCircle, History, Upload } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export type StatFilterType = "total" | "reviewed" | "pending" | "revisions";

interface PMDashboardSummaryProps {
    projectName: string;
    userName?: string;
    projectDetails: any;
    formatDate: (dateString: string | null | undefined) => string;
    submittedEntries: any[];
    loading: boolean;
    onRefresh: () => void;
    onStatClick?: (filterType: StatFilterType, entries: any[], title: string) => void;
    onShowComparison?: () => void;
    isDroneEligible?: boolean;
    onCompareWithDrone?: () => void;
}

export const PMDashboardSummary: React.FC<PMDashboardSummaryProps> = ({
    projectName,
    userName,
    projectDetails,
    formatDate,
    submittedEntries,
    loading,
    onRefresh,
    onStatClick,
    onShowComparison,
    isDroneEligible,
    onCompareWithDrone
}) => {
    const navigate = useNavigate();

    // Filter entries by status
    const reviewedEntries = (submittedEntries || []).filter(e => e.status === 'approved_by_pm' || e.status === 'final_approved');
    const pendingEntries = (submittedEntries || []).filter(e => e.status === 'submitted_to_pm');
    const revisionEntries = (submittedEntries || []).filter(e => e.status === 'rejected_by_pm');
    const pushedEntries = (submittedEntries || []).filter(e => e.status === 'final_approved');

    const statsData = [
        {
            title: "Total",
            value: (submittedEntries || []).length,
            icon: FileText,
            filterType: "total" as StatFilterType,
            entries: submittedEntries,
            colorClasses: {
                text: "text-blue-600 dark:text-blue-400",
                bg: "bg-blue-100 dark:bg-blue-900/40",
                border: "hover:border-blue-400/60 dark:hover:border-blue-500/60",
                iconBgHover: "group-hover:bg-blue-500",
                iconTextHover: "group-hover:text-white"
            }
        },
        {
            title: "Pushed",
            value: pushedEntries.length,
            icon: Upload,
            filterType: "pushed" as any,
            entries: pushedEntries,
            colorClasses: {
                text: "text-primary dark:text-primary/80",
                bg: "bg-primary/10 dark:bg-primary/20",
                border: "hover:border-primary/60 dark:hover:border-primary/80",
                iconBgHover: "group-hover:bg-primary",
                iconTextHover: "group-hover:text-white"
            }
        },
        {
            title: "Reviewed",
            value: reviewedEntries.length,
            icon: CheckCircle,
            filterType: "reviewed" as StatFilterType,
            entries: reviewedEntries,
            colorClasses: {
                text: "text-emerald-600 dark:text-emerald-400",
                bg: "bg-emerald-100 dark:bg-emerald-900/40",
                border: "hover:border-emerald-400/60 dark:hover:border-emerald-500/60",
                iconBgHover: "group-hover:bg-emerald-500",
                iconTextHover: "group-hover:text-white"
            }
        },
        {
            title: "Pending",
            value: pendingEntries.length,
            icon: Clock,
            filterType: "pending" as StatFilterType,
            entries: pendingEntries,
            colorClasses: {
                text: "text-amber-600 dark:text-amber-400",
                bg: "bg-amber-100 dark:bg-amber-900/40",
                border: "hover:border-amber-400/60 dark:hover:border-amber-500/60",
                iconBgHover: "group-hover:bg-amber-500",
                iconTextHover: "group-hover:text-white"
            }
        },
        {
            title: "Revisions",
            value: revisionEntries.length,
            icon: AlertCircle,
            filterType: "revisions" as StatFilterType,
            entries: revisionEntries,
            colorClasses: {
                text: "text-rose-600 dark:text-rose-400",
                bg: "bg-rose-100 dark:bg-rose-900/40",
                border: "hover:border-rose-400/60 dark:hover:border-rose-500/60",
                iconBgHover: "group-hover:bg-rose-500",
                iconTextHover: "group-hover:text-white"
            }
        },
    ];

    const handleStatClick = (stat: typeof statsData[0]) => {
        if (onStatClick) {
            onStatClick(stat.filterType, stat.entries, stat.title);
        }
    };

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
                    {/* Shown for every project type - the dates are rolled up from the activity
                        table for Solar, Wind, PSS and BESS alike. */}
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
                                        
                                        {/* When the project has started the row is labelled "Actual
                                            start date", so it has to render the actual date - it
                                            used to show the forecast StartDate under that label,
                                            which is why BESS showed 05-Nov-25 where P6 says the
                                            actual start is 03-Nov-25. Same for the finish row. */}
                                        <div>
                                            <span className="font-medium text-foreground/70">{hasStarted ? 'Actual start date:' : 'Forecast start date:'}</span>{' '}
                                            <span className={hasStarted ? "text-green-600 font-semibold" : "text-blue-600 font-semibold"}>{formatDate((hasStarted && projectDetails?.ActualStartDate) || projectDetails?.StartDate || projectDetails?.start_date || projectDetails?.startDate) || 'Not set'}</span>
                                        </div>
                                        <div>
                                            <span className="font-medium text-foreground/70">{hasFinished ? 'Actual finish date:' : 'Forecast end date:'}</span>{' '}
                                            <span className={hasFinished ? "text-green-600 font-semibold" : "text-blue-600 font-semibold"}>{formatDate((hasFinished && projectDetails?.ActualFinishDate) || projectDetails?.FinishDate || projectDetails?.finish_date || projectDetails?.finishDate) || 'Not set'}</span>
                                        </div>
                                    </>
                                );
                            })()}
                    </motion.div>
                </div>
                <motion.div
                    className="flex items-center space-x-4"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.2 }}
                >
                    <div className="flex flex-col text-base text-right mr-2 text-muted-foreground border-r pr-6 border-gray-200 gap-y-1">
                        <div><span className="font-medium text-foreground/70">Data date:</span> {formatDate(projectDetails?.p6_data_date) || 'Not set'}</div>
                        <div><span className="font-medium text-foreground/70">Last updated:</span> {formatDate(projectDetails?.p6_last_updated) || 'Not set'}</div>
                    </div>
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
                </motion.div>
            </div>

            {/* Stats Cards - Clickable */}
            <motion.div
                className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-8"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.5 }}
            >
                {statsData.map((stat, index) => (
                    <motion.div
                        key={stat.title}
                        initial={{ opacity: 0, y: 20, scale: 0.9 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        transition={{ delay: 0.1 * index, type: "spring", stiffness: 100 }}
                        whileHover={{ y: -5, transition: { duration: 0.2 } }}
                        onClick={() => handleStatClick(stat)}
                    >
                        <Card className={`p-4 bg-card hover:shadow-lg transition-all duration-300 cursor-pointer border border-border group ${stat.colorClasses.border}`}>
                            <div className="flex items-center justify-between">
                                <div className="space-y-1">
                                    <p className="text-sm font-medium text-muted-foreground">{stat.title}</p>
                                    <p className="text-3xl font-bold tracking-tight">{stat.value}</p>
                                </div>
                                <div className={`w-14 h-14 rounded-full flex items-center justify-center transition-colors duration-300 ${stat.colorClasses.bg} ${stat.colorClasses.text} ${stat.colorClasses.iconBgHover} ${stat.colorClasses.iconTextHover}`}>
                                    <stat.icon className="h-7 w-7" />
                                </div>
                            </div>
                        </Card>
                    </motion.div>
                ))}
            </motion.div>
        </div >
    );
};
