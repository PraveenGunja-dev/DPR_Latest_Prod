import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { User, FileText, CheckCircle, Archive, ArrowLeft, Edit, Check, X, ChevronRight, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";
import {
    DPQtyTable,
    DPVendorBlockTable,
    ManpowerDetailsTable,
    ManpowerTimephasedTable,
    DPBlockTable,
    DPVendorIdtTable,
    TestingCommTable,
    WindSummaryTable,
    WindProgressTable,
    WindManpowerTable,
    PSSSummaryTable,
    PSSProgressTable,
    PSSManpowerTable
} from "@/modules/supervisor/components";
import { getTodayAndYesterday } from "@/services/dprService";

export type DashboardModalType = 'members' | 'approved' | 'submitted' | 'archived' | null;

interface PMAGDashboardDetailModalProps {
    isOpen: boolean;
    onClose: () => void;
    type: DashboardModalType;
    data: any[];
    title?: string;
    onAction?: (item: any) => void;
    onEdit?: (entry: any) => void;
    onReject?: (entryId: number) => void;
    onPushToP6?: (entry: any) => void;
}

export const PMAGDashboardDetailModal: React.FC<PMAGDashboardDetailModalProps> = ({
    isOpen,
    onClose,
    type,
    data,
    title,
    onAction,
    onEdit,
    onReject,
    onPushToP6
}) => {
    const [selectedEntry, setSelectedEntry] = useState<any | null>(null);
    const [isTableFullscreen, setIsTableFullscreen] = useState(false);

    // Reset selection when modal closes or data changes
    useEffect(() => {
        if (!isOpen) {
            setSelectedEntry(null);
            setIsTableFullscreen(false);
        }
    }, [isOpen]);

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
        if (selectedEntry) return `Entry #${selectedEntry.id}`;
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

    const getSheetTypeLabel = (sheetType: string) => {
        const labels: Record<string, string> = {
            dp_qty: "DP Quantity",
            dp_block: "DP Block",
            dp_vendor_idt: "DC Side",
            dp_vendor_block: "AC Side",
            testing_commissioning: "Testing & Commissioning",
            manpower_details: "Manpower Details",
            manpower_details_2: "Manpower (Contractor)",
        };
        return labels[sheetType] || sheetType.replace(/_/g, " ").toUpperCase();
    };

    const getStatusBadge = (status: string) => {
        switch (status) {
            case "approved_by_pm":
                return <Badge className="bg-green-500/20 text-green-600 border-green-500/30 font-medium">Pending PMAG</Badge>;
            case "final_approved":
                return <Badge className="bg-primary/20 text-primary border-primary/30 font-medium tracking-wide">PUSHED TO P6</Badge>;
            case "rejected_by_pmag":
                return <Badge className="bg-red-500/20 text-red-600 border-red-500/30 font-medium">Rejected</Badge>;
            default:
                return <Badge variant="secondary" className="font-medium">{status.replace(/_/g, ' ')}</Badge>;
        }
    };

    const renderDetailView = (entry: any) => {
        const entryData = typeof entry.data_json === 'string' ? JSON.parse(entry.data_json) : entry.data_json;
        const { today, yesterday } = getTodayAndYesterday();
        
        return (
            <div className="space-y-4 px-6 pb-6 flex flex-col h-full overflow-hidden">
                <div className="flex items-center justify-between mb-4 mt-2 flex-shrink-0">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSelectedEntry(null)}
                        className="gap-2 px-0 hover:bg-transparent text-muted-foreground hover:text-foreground transition-colors"
                    >
                        <ArrowLeft className="h-4 w-4" />
                        Back to List
                    </Button>
                    <div className="flex items-center gap-3">
                        {onPushToP6 && [
                            'dp_vendor_idt', 'dp_vendor_block', 'manpower_details', 'manpower_details_2', 'testing_commissioning',
                            'wind_progress', 'pss_progress'
                        ].includes(entry.sheet_type) && entry.status !== 'final_approved' && (
                            <Button
                                size="sm"
                                onClick={() => onPushToP6(entry)}
                                className="bg-blue-600 hover:bg-blue-700 gap-1.5 shadow-md shadow-blue-500/20 px-4"
                            >
                                <Archive className="w-4 h-4" />
                                Push to P6
                            </Button>
                        )}
                        {onEdit && (
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={() => onEdit(entry)}
                                className="gap-1.5 border-primary/20 text-primary hover:bg-primary/5 px-4"
                            >
                                <Edit className="w-4 h-4" />
                                Edit
                            </Button>
                        )}
                        {onReject && entry.status !== 'final_approved' && (
                            <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => onReject(entry.id)}
                                className="gap-1.5 shadow-md shadow-red-500/20 px-4"
                            >
                                <X className="w-4 h-4" />
                                Reject
                            </Button>
                        )}
                        {getStatusBadge(entry.status)}
                    </div>
                </div>

                <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 flex-shrink-0">
                    <div className="flex items-center gap-4">
                       <div className="w-12 h-12 bg-white rounded-xl shadow-sm border border-slate-100 flex items-center justify-center text-slate-400">
                          <FileText className="w-6 h-6" />
                       </div>
                       <div>
                          <h4 className="text-lg font-bold text-slate-800">{getSheetTypeLabel(entry.sheet_type)}</h4>
                          <p className="text-sm text-slate-500 font-medium flex items-center gap-1.5">
                             <User className="w-3.5 h-3.5" />
                             {entry.supervisor_name} • {new Date(entry.entry_date || entry.submitted_at).toLocaleDateString('en-IN', {day:'numeric', month:'short', year:'numeric'})}
                          </p>
                       </div>
                    </div>
                    <div className="text-left md:text-right">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Status Tracking</p>
                        <p className="text-xs font-semibold text-slate-600">ID: #{entry.id} • Last Updated: {new Date(entry.updated_at).toLocaleTimeString('en-IN', {hour:'2-digit', minute:'2-digit'})}</p>
                    </div>
                </div>

                <div className="flex-1 flex flex-col min-h-0 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden mb-2">
                    <div className="flex-1 min-h-0 relative">
                        {entry.sheet_type === 'dp_qty' && (
                            <DPQtyTable data={entryData.rows} setData={() => { }} onSave={() => { }} onSubmit={undefined} yesterday={entryData.staticHeader?.progressDate || yesterday} today={entryData.staticHeader?.reportingDate || today} isLocked={true} status={entry.status} onFullscreenToggle={setIsTableFullscreen} />
                        )}
                        {entry.sheet_type === 'dp_block' && (
                            <DPBlockTable data={entryData.rows} setData={() => { }} onSave={() => { }} onSubmit={undefined} yesterday={entryData.staticHeader?.progressDate || yesterday} today={entryData.staticHeader?.reportingDate || today} isLocked={true} status={entry.status} onFullscreenToggle={setIsTableFullscreen} />
                        )}
                        {entry.sheet_type === 'dp_vendor_idt' && (
                            <DPVendorIdtTable data={entryData.rows} setData={() => { }} onSave={() => { }} onSubmit={undefined} yesterday={entryData.staticHeader?.progressDate || yesterday} today={entryData.staticHeader?.reportingDate || today} isLocked={true} status={entry.status} onFullscreenToggle={setIsTableFullscreen} />
                        )}
                        {entry.sheet_type === 'dp_vendor_block' && (
                            <DPVendorBlockTable data={entryData.rows} setData={() => { }} onSave={() => { }} onSubmit={undefined} yesterday={entryData.staticHeader?.progressDate || yesterday} today={entryData.staticHeader?.reportingDate || today} isLocked={true} status={entry.status} onFullscreenToggle={setIsTableFullscreen} />
                        )}
                        {entry.sheet_type === 'manpower_details' && (
                            <ManpowerDetailsTable data={entryData.rows} setData={() => { }} totalManpower={entryData.totalManpower} setTotalManpower={() => { }} onSave={() => { }} onSubmit={undefined} yesterday={entryData.staticHeader?.progressDate || yesterday} today={entryData.staticHeader?.reportingDate || today} isLocked={true} status={entry.status} onFullscreenToggle={setIsTableFullscreen} />
                        )}
                        {entry.sheet_type === 'manpower_details_2' && (
                            <ManpowerTimephasedTable data={entryData.rows} setData={() => { }} onSave={() => { }} onSubmit={undefined} yesterday={entryData.staticHeader?.progressDate || yesterday} today={entryData.staticHeader?.reportingDate || today} isLocked={true} status={entry.status} onFullscreenToggle={setIsTableFullscreen} />
                        )}
                        {entry.sheet_type === 'testing_commissioning' && (
                            <TestingCommTable data={entryData.rows} setData={() => { }} onSave={() => { }} onSubmit={undefined} yesterday={entryData.staticHeader?.progressDate || yesterday} today={entryData.staticHeader?.reportingDate || today} isLocked={true} status={entry.status} onFullscreenToggle={setIsTableFullscreen} />
                        )}
                        {entry.sheet_type === 'wind_summary' && (
                            <WindSummaryTable data={entryData.rows} setData={() => { }} onSave={() => { }} onSubmit={undefined} isLocked={true} status={entry.status} />
                        )}
                        {entry.sheet_type === 'wind_progress' && (
                            <WindProgressTable data={entryData.rows} setData={() => { }} onSave={() => { }} onSubmit={undefined} yesterday={entryData.staticHeader?.progressDate || yesterday} today={entryData.staticHeader?.reportingDate || today} isLocked={true} status={entry.status} onFullscreenToggle={setIsTableFullscreen} />
                        )}
                        {entry.sheet_type === 'wind_manpower' && (
                            <WindManpowerTable data={entryData.rows} setData={() => { }} onSave={() => { }} onSubmit={undefined} isLocked={true} status={entry.status} today={entryData.staticHeader?.reportingDate || today} />
                        )}
                        {entry.sheet_type === 'pss_summary' && (
                            <PSSSummaryTable data={entryData.rows} setData={() => { }} onSave={() => { }} onSubmit={undefined} isLocked={true} status={entry.status} />
                        )}
                        {entry.sheet_type === 'pss_progress' && (
                            <PSSProgressTable data={entryData.rows} setData={() => { }} onSave={() => { }} onSubmit={undefined} yesterday={entryData.staticHeader?.progressDate || yesterday} today={entryData.staticHeader?.reportingDate || today} isLocked={true} status={entry.status} />
                        )}
                        {entry.sheet_type === 'pss_manpower' && (
                            <PSSManpowerTable data={entryData.rows} setData={() => { }} onSave={() => { }} onSubmit={undefined} isLocked={true} status={entry.status} todayDate={entryData.staticHeader?.reportingDate || today} />
                        )}
                    </div>
                </div>
            </div>
        );
    };

    const renderContent = () => {
        const safeData = Array.isArray(data) ? data : [];
        if (safeData.length === 0) {
            return renderEmptyState();
        }

        if (selectedEntry && type !== 'members') {
            return renderDetailView(selectedEntry);
        }

        const containerVariants = {
            hidden: { opacity: 0 },
            show: {
                opacity: 1,
                transition: { staggerChildren: 0.05 }
            }
        };

        const itemVariants = {
            hidden: { opacity: 0, y: 10 },
            show: { opacity: 1, y: 0 }
        };

        if (type === 'members') {
            return (
                <motion.div variants={containerVariants} initial="hidden" animate="show" className="space-y-3 px-6 py-4">
                    {safeData.map((member: any) => (
                        <motion.div key={member.ObjectId} variants={itemVariants} className="group flex items-center justify-between p-4 bg-card border border-border rounded-xl hover:border-primary/50 hover:shadow-md transition-all duration-300">
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary/10 to-secondary/10 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                                    <User className="w-6 h-6 text-primary" />
                                </div>
                                <div className="space-y-0.5">
                                    <h4 className="font-semibold text-foreground">{member.Name}</h4>
                                    <p className="text-sm text-muted-foreground">{member.Email}</p>
                                </div>
                            </div>
                            <Badge variant={member.Role === 'Site PM' ? 'default' : 'secondary'} className="px-3 py-1">
                                {member.Role}
                            </Badge>
                        </motion.div>
                    ))}
                </motion.div>
            );
        }

        return (
            <motion.div variants={containerVariants} initial="hidden" animate="show" className="divide-y divide-border px-6">
                {safeData.map((entry: any) => (
                    <motion.div
                        key={entry.id || entry.ObjectId}
                        variants={itemVariants}
                        onClick={() => setSelectedEntry(entry)}
                        className="py-4 hover:bg-slate-50 transition-colors flex items-center justify-between group cursor-pointer"
                    >
                        <div className="flex items-center gap-4 min-w-0 flex-1">
                            <div className="flex-shrink-0 w-11 h-11 rounded-xl bg-slate-100 flex items-center justify-center text-slate-400 group-hover:bg-primary group-hover:text-white transition-all shadow-sm">
                                <FileText className="w-5 h-5" />
                            </div>
                            <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 flex-wrap mb-1">
                                    <h3 className="text-base font-bold text-slate-700 group-hover:text-primary transition-colors">
                                        Entry #{entry.id} - {getSheetTypeLabel(entry.sheet_type)}
                                    </h3>
                                    {getStatusBadge(entry.status)}
                                </div>
                                <div className="flex items-center gap-4 text-xs text-slate-500 font-medium">
                                    <span className="flex items-center gap-1.5">
                                        <User className="w-3.5 h-3.5" />
                                        {entry.supervisor_name}
                                    </span>
                                    <span className="flex items-center gap-1.5">
                                        <Calendar className="w-3.5 h-3.5" />
                                        {(entry.entry_date || entry.submitted_at) ? new Date(entry.entry_date || entry.submitted_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : 'N/A'}
                                    </span>
                                </div>
                            </div>
                        </div>
                        <div className="flex items-center gap-2 ml-4">
                            <div className="w-8 h-8 rounded-full border border-slate-200 flex items-center justify-center text-slate-400 group-hover:bg-primary group-hover:border-primary group-hover:text-white transition-all">
                                <ChevronRight className="w-5 h-5" />
                            </div>
                        </div>
                    </motion.div>
                ))}
            </motion.div>
        );
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className={`overflow-hidden flex flex-col p-0 gap-0 border-none shadow-none bg-background transition-all duration-300 ${isTableFullscreen || (selectedEntry && type !== 'members') ? 'max-w-[100vw] w-screen h-screen max-h-screen top-0 left-0 translate-x-0 translate-y-0 rounded-none' : 'max-w-5xl max-h-[85vh] rounded-2xl'}`}>
                <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between shadow-lg z-10">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-white/10 rounded-xl backdrop-blur-md">
                            {getIcon()}
                        </div>
                        <div>
                           <h2 className="text-lg font-bold tracking-tight">{getTitle()}</h2>
                           <p className="text-[10px] text-white/50 uppercase tracking-widest font-bold">PMAG REVIEW DASHBOARD</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        {isTableFullscreen && (
                            <Button variant="ghost" size="sm" onClick={() => setIsTableFullscreen(false)} className="text-white hover:bg-white/10 font-bold text-xs">
                                EXIT FULLSCREEN
                            </Button>
                        )}
                        <Button variant="ghost" size="icon" onClick={onClose} className="rounded-full hover:bg-white/10 text-white/70 hover:text-white">
                           <X className="w-5 h-5" />
                        </Button>
                    </div>
                </div>

                <div className="flex-1 overflow-auto bg-muted/5 scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent">
                    {renderContent()}
                </div>

                <div className="px-6 py-3 border-t border-border bg-card/50 flex justify-between items-center text-xs text-muted-foreground backdrop-blur-sm">
                    <div className="flex items-center gap-4">
                        <span>Showing {(Array.isArray(data) ? data.length : 0)} items</span>
                        {selectedEntry && (
                            <button onClick={() => setSelectedEntry(null)} className="flex items-center gap-1 hover:text-primary transition-colors">
                                <ArrowLeft className="w-3 h-3" /> Back to list
                            </button>
                        )}
                    </div>
                    <button onClick={onClose} className="font-semibold hover:text-foreground transition-colors uppercase tracking-widest text-[10px]">Close</button>
                </div>
            </DialogContent>
        </Dialog>
    );
};
