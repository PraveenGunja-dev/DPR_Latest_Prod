import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { User, FileText, CheckCircle, Archive } from "lucide-react";

export type DashboardModalType = 'members' | 'approved' | 'submitted' | 'archived' | null;

interface PMAGDashboardDetailModalProps {
    isOpen: boolean;
    onClose: () => void;
    type: DashboardModalType;
    data: any[];
    title?: string;
    onAction?: (item: any) => void;
    onFinalApprove?: (entryId: number) => void;
    onReject?: (entryId: number) => void;
    onPushToP6?: (entry: any) => void;
}

import { motion, AnimatePresence } from "framer-motion";

export const PMAGDashboardDetailModal: React.FC<PMAGDashboardDetailModalProps> = ({
    isOpen,
    onClose,
    type,
    data,
    title,
    onAction,
    onFinalApprove,
    onReject,
    onPushToP6
}) => {
    if (!type) return null;

    const getIcon = () => {
        switch (type) {
            case 'members': return <User className="w-5 h-5 text-white" />;
            case 'approved': return <CheckCircle className="w-5 h-5 text-white" />;
            case 'submitted': return <FileText className="w-5 h-5 text-white" />;
            case 'archived': return <Archive className="w-5 h-5 text-white" />;
            default: return null;
        }
    };

    const getTitle = () => {
        if (title) return title;
        switch (type) {
            case 'members': return 'Team Members';
            case 'approved': return 'Approved Sheets';
            case 'submitted': return 'Submitted Entries';
            case 'archived': return 'Archived Sheets';
            default: return 'Details';
        }
    };

    const renderEmptyState = () => (
        <div className="flex flex-col items-center justify-center py-16 text-center space-y-4">
            <div className="w-24 h-24 bg-muted/30 rounded-full flex items-center justify-center">
                {type === 'members' ? <User className="w-12 h-12 text-muted-foreground/50" /> :
                    type === 'approved' ? <CheckCircle className="w-12 h-12 text-muted-foreground/50" /> :
                        type === 'submitted' ? <FileText className="w-12 h-12 text-muted-foreground/50" /> :
                            <Archive className="w-12 h-12 text-muted-foreground/50" />}
            </div>
            <div>
                <p className="text-xl font-medium text-muted-foreground">No {type === 'members' ? 'team members' : 'data'} found</p>
                <p className="text-sm text-muted-foreground/70">There is nothing to display here yet.</p>
            </div>
        </div>
    );

    const renderContent = () => {
        const safeData = Array.isArray(data) ? data : [];
        if (safeData.length === 0) {
            return renderEmptyState();
        }

        const containerVariants = {
            hidden: { opacity: 0 },
            show: {
                opacity: 1,
                transition: {
                    staggerChildren: 0.05
                }
            }
        };

        const itemVariants = {
            hidden: { opacity: 0, y: 10 },
            show: { opacity: 1, y: 0 }
        };

        if (type === 'members') {
            return (
                <motion.div
                    variants={containerVariants}
                    initial="hidden"
                    animate="show"
                    className="space-y-3 px-6 py-4"
                >
                    {safeData.map((member: any) => (
                        <motion.div
                            key={member.ObjectId}
                            variants={itemVariants}
                            className="group flex items-center justify-between p-4 bg-card border border-border rounded-xl hover:border-primary/50 hover:shadow-md transition-all duration-300"
                        >
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary/10 to-secondary/10 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                                    <User className="w-6 h-6 text-primary" />
                                </div>
                                <div className="space-y-0.5">
                                    <h4 className="font-semibold text-foreground">{member.Name}</h4>
                                    <p className="text-sm text-muted-foreground flex items-center gap-2">
                                        {member.Email}
                                    </p>
                                </div>
                            </div>
                            <Badge variant={member.Role === 'Site PM' || member.Role === 'Site PM' ? 'default' : 'secondary'} className="px-3 py-1">
                                {member.Role}
                            </Badge>
                        </motion.div>
                    ))}
                </motion.div>
            );
        }

        // Common list for entries (approved, submitted, archived)
        return (
            <motion.div
                variants={containerVariants}
                initial="hidden"
                animate="show"
                className="divide-y divide-border"
            >
                {safeData.map((entry: any) => (
                    <motion.div
                        key={entry.id || entry.ObjectId}
                        variants={itemVariants}
                        className="px-6 py-4 hover:bg-muted/50 transition-colors flex items-center justify-between group"
                    >
                        <div className="flex items-center gap-4 min-w-0 flex-1">
                            <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center font-mono text-primary font-bold shadow-sm group-hover:bg-primary/20 transition-colors">
                                #{entry.id}
                            </div>
                            <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 flex-wrap mb-1">
                                    <h3 className="text-base font-semibold text-foreground capitalize">
                                        {entry.sheet_type?.replace(/_/g, ' ') || 'Sheet'}
                                    </h3>
                                    <Badge variant="outline" className="text-xs font-normal bg-background text-muted-foreground border-border">
                                        {entry.status?.replace(/_/g, ' ') || 'Status'}
                                    </Badge>
                                </div>
                                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                                    <span className="flex items-center gap-1">
                                        <User className="w-3 h-3" />
                                        {entry.supervisor_name || 'Supervisor'}
                                    </span>
                                    <span className="flex items-center gap-1">
                                        <FileText className="w-3 h-3" />
                                        {entry.created_at ? new Date(entry.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'N/A'}
                                    </span>
                                </div>
                            </div>
                        </div>
                        <div className="flex items-center gap-2 ml-4">
                            {type === 'approved' && (
                                <>
                                    {onPushToP6 && (
                                        <button
                                            onClick={(e) => { e.stopPropagation(); onPushToP6(entry); }}
                                            className="px-3 py-1.5 text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 rounded-lg flex items-center gap-1.5 transition-all shadow-sm hover:shadow-md"
                                        >
                                            <Archive className="w-3.5 h-3.5" />
                                            Push to P6
                                        </button>
                                    )}
                                    {onFinalApprove && (
                                        <button
                                            onClick={(e) => { e.stopPropagation(); onFinalApprove(entry.id); }}
                                            className="px-3 py-1.5 text-xs font-semibold bg-green-600 text-white hover:bg-green-700 rounded-lg flex items-center gap-1.5 transition-all shadow-sm hover:shadow-md"
                                        >
                                            <CheckCircle className="w-3.5 h-3.5" />
                                            Approve
                                        </button>
                                    )}
                                    {onReject && (
                                        <button
                                            onClick={(e) => { e.stopPropagation(); onReject(entry.id); }}
                                            className="px-3 py-1.5 text-xs font-semibold bg-red-600 text-white hover:bg-red-700 rounded-lg flex items-center gap-1.5 transition-all shadow-sm hover:shadow-md"
                                        >
                                            <Archive className="w-3.5 h-3.5 rotate-180" />
                                            Reject
                                        </button>
                                    )}
                                </>
                            )}
                            {onAction && (
                                <button
                                    onClick={() => onAction(entry)}
                                    className="px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/10 rounded-lg transition-all border border-transparent hover:border-primary/20"
                                >
                                    View Details
                                </button>
                            )}
                        </div>
                    </motion.div>
                ))}
            </motion.div>
        );
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col p-0 gap-0 border-border shadow-2xl bg-background">
                <div className="px-6 py-5 bg-gradient-to-r from-primary to-secondary text-primary-foreground flex items-center gap-3 shadow-md z-10">
                    <div className="p-2 bg-white/10 rounded-lg backdrop-blur-sm">
                        {getIcon()}
                    </div>
                    <h2 className="text-xl font-bold tracking-tight">{getTitle()}</h2>
                </div>

                <div className="flex-1 overflow-auto bg-muted/10 scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent">
                    {renderContent()}
                </div>

                <div className="px-6 py-4 border-t border-border bg-card flex justify-between items-center text-sm text-muted-foreground">
                    <span>Showing {(Array.isArray(data) ? data.length : 0)} items</span>
                    <button onClick={onClose} className="hover:text-foreground transition-colors">Close</button>
                </div>
            </DialogContent>
        </Dialog>
    );
};
