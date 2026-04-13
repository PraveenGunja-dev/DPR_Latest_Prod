import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { BaseModal } from "@/components/shared/BaseModal";
import {
    FileText,
    CheckCircle,
    Clock,
    AlertCircle,
    Calendar,
    User,
    ChevronRight,
    Check,
    X,
    Edit,
    MessageSquare,
    ArrowLeft
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";
import {
    DPQtyTable,
    DPVendorBlockTable,
    ManpowerDetailsTable,
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
import { DPREntry } from "@/types";


interface SheetListModalProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    entries: DPREntry[];
    onApprove: (entryId: number) => void;
    onReject: (entryId: number, sheetType: string, rejectedData?: any) => void;
    onEdit: (entry: DPREntry) => void;
}

const getStatusBadge = (status: string) => {
    switch (status) {
        case "approved_by_pm":
            return <Badge className="bg-green-500/20 text-green-600 border-green-500/30">Approved</Badge>;
        case "submitted_to_pm":
            return <Badge className="bg-yellow-500/20 text-yellow-600 border-yellow-500/30">Pending</Badge>;
        case "rejected_by_pm":
            return <Badge className="bg-red-500/20 text-red-600 border-red-500/30">Revision</Badge>;
        case "approved_by_pmag":
            return <Badge className="bg-primary/20 text-primary border-primary/30">Final Approved</Badge>;
        default:
            return <Badge variant="secondary">{status}</Badge>;
    }
};

const getSheetTypeLabel = (sheetType: string) => {
    const labels: Record<string, string> = {
        dp_qty: "DP Quantity",
        dp_prog: "DP Progress",
        dp_block: "DP Block",
        dp_vendor_idt: "DC Side",
        dp_vendor_block: "AC Side",
        testing_commissioning: "Testing & Commissioning",
        manpower_details: "Manpower Details",
        layer_prog: "Layer Progress",
        hindrance: "Hindrance",
        manpower: "Manpower",
    };
    return labels[sheetType] || sheetType.replace(/_/g, " ").toUpperCase();
};

const getIcon = (title: string) => {
    if (!title) return <FileText className="h-5 w-5" />;
    switch (title.toLowerCase()) {
        case "total sheets":
            return <FileText className="h-5 w-5" />;
        case "reviewed":
            return <CheckCircle className="h-5 w-5" />;
        case "pending":
            return <Clock className="h-5 w-5" />;
        case "revisions":
            return <AlertCircle className="h-5 w-5" />;
        default:
            return <FileText className="h-5 w-5" />;
    }
};

export const SheetListModal: React.FC<SheetListModalProps> = ({
    isOpen,
    onClose,
    title,
    entries,
    onApprove,
    onReject,
    onEdit,
}) => {
    const [selectedEntry, setSelectedEntry] = useState<DPREntry | null>(null);
    const [localEntryData, setLocalEntryData] = useState<any>(null);
    const [isModalFullscreen, setIsModalFullscreen] = useState(false);
    const [showApproveConfirm, setShowApproveConfirm] = useState(false);

    // If the selected entry is removed from the list (e.g., approved), clear the selection
    useEffect(() => {
        if (selectedEntry && !entries.find(e => e.id === selectedEntry.id)) {
            setSelectedEntry(null);
            setLocalEntryData(null);
        }
    }, [entries, selectedEntry]);

    const formatDateString = (dateString?: string) => {
        if (!dateString) return "N/A";
        return new Date(dateString).toLocaleDateString("en-IN", {
            day: "2-digit",
            month: "short",
            year: "numeric",
        });
    };

    const handleClose = () => {
        setSelectedEntry(null);
        setLocalEntryData(null);
        onClose();
    };

    const handleBack = () => {
        setSelectedEntry(null);
        setLocalEntryData(null);
    };

    // Render the detailed view with table and actions
    const renderDetailView = (entry: DPREntry) => {
        const entryData = localEntryData || (typeof entry.data_json === 'string' ? JSON.parse(entry.data_json) : entry.data_json);
        const { today, yesterday } = getTodayAndYesterday();
        const isLocked = entry.status !== 'submitted_to_pm';

        return (
            <div className="space-y-4">
            {/* Back button and header */}
                {!isModalFullscreen && (
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4 bg-muted/50 p-4 rounded-xl border border-slate-100">
                        <div className="flex items-center gap-4">
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setSelectedEntry(null)}
                                className="gap-2 px-0 hover:bg-transparent text-muted-foreground hover:text-foreground transition-colors"
                            >
                                <ArrowLeft className="h-4 w-4" />
                                Back to List
                            </Button>
                            <div className="hidden sm:block w-px h-8 bg-slate-200"></div>
                            <div>
                                <h4 className="font-bold text-base sm:text-lg text-slate-800">
                                    Entry #{entry.id} - {getSheetTypeLabel(entry.sheet_type)}
                                </h4>
                                <p className="text-sm text-slate-500 font-medium">
                                    {entry.supervisor_name || 'Supervisor'} ({entry.supervisor_email}) • {formatDateString(entry.submitted_at)}
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            {entry.status === "submitted_to_pm" && (
                                <div className="flex items-center gap-2 mr-2 bg-white p-1 rounded-lg border border-slate-200 shadow-sm">
                                    <Button size="sm" variant="ghost" onClick={() => onEdit(entry)} className="gap-1.5 hover:bg-slate-100 text-slate-700 h-8">
                                        <Edit className="w-3.5 h-3.5" /> Edit
                                    </Button>
                                    <Button size="sm" onClick={() => setShowApproveConfirm(true)} className="gap-1.5 bg-green-600 hover:bg-green-700 shadow-sm shadow-green-600/20 text-white h-8">
                                        <Check className="w-3.5 h-3.5" /> Approve
                                    </Button>
                                    <Button size="sm" variant="destructive" onClick={() => onReject(entry.id, entry.sheet_type, localEntryData)} className="gap-1.5 shadow-sm shadow-red-500/20 h-8">
                                        <X className="w-3.5 h-3.5" /> Reject
                                    </Button>
                                </div>
                            )}
                            {getStatusBadge(entry.status)}
                        </div>
                    </div>
                )}

                {/* Confirm Approve Modal */}
                <Dialog open={showApproveConfirm} onOpenChange={setShowApproveConfirm}>
                    <DialogContent className="max-w-md border-0 p-0 overflow-hidden shadow-2xl rounded-2xl bg-white sm:max-w-md">
                        <div className="px-6 py-5 bg-green-600 flex items-center justify-between shadow-sm relative overflow-hidden">
                            <div className="absolute top-0 right-0 -mt-4 -mr-4 w-24 h-24 bg-white/10 rounded-full blur-2xl"></div>
                            <div className="flex items-center gap-3 relative z-10">
                                <div className="p-2 bg-white/20 rounded-xl shadow-inner backdrop-blur-md">
                                    <CheckCircle className="w-6 h-6 text-white drop-shadow-md" />
                                </div>
                                <h2 className="text-xl font-bold tracking-tight text-white drop-shadow-sm">Confirm Approval</h2>
                            </div>
                        </div>
                        <div className="p-6 space-y-4 bg-slate-50">
                            <p className="text-slate-600 leading-relaxed text-sm block">
                                You are about to approve <strong>Entry #{selectedEntry?.id}</strong>. This action will mark the sheet as approved and notify the necessary parties.
                            </p>
                            <p className="text-slate-600 leading-relaxed text-sm block">
                                Are you sure you want to proceed?
                            </p>
                        </div>
                        <div className="bg-white border-t border-slate-100 p-4 flex justify-end gap-3">
                            <Button variant="outline" onClick={() => setShowApproveConfirm(false)} className="px-5 font-semibold">
                                Cancel
                            </Button>
                            <Button 
                                onClick={() => {
                                    if(selectedEntry){
                                        onApprove(selectedEntry.id);
                                    }
                                    setShowApproveConfirm(false);
                                }} 
                                className="bg-green-600 hover:bg-green-700 px-6 font-semibold shadow-md shadow-green-600/20"
                            >
                                <Check className="w-4 h-4 mr-2" />
                                Yes, Approve
                            </Button>
                        </div>
                    </DialogContent>
                </Dialog>

                {/* Data table with horizontal scroll for mobile/tablet */}
                {entryData?.rows && entryData.rows.length > 0 && (
                    <div className={`border rounded-xl overflow-hidden shadow-sm ${isModalFullscreen ? 'flex-1 h-full' : ''}`}>
                        <div className={`overflow-x-auto overflow-y-auto ${isModalFullscreen ? 'h-[calc(100vh-140px)]' : 'max-h-[50vh] sm:max-h-[55vh] md:max-h-[60vh] bg-white'}`}>
                            {entry.sheet_type === 'dp_qty' && (
                                <DPQtyTable
                                    data={entryData.rows}
                                    setData={(newData) => setLocalEntryData({ ...entryData, rows: newData })}
                                    onSave={() => { }}
                                    onSubmit={undefined}
                                    yesterday={entryData.staticHeader?.progressDate || yesterday}
                                    today={entryData.staticHeader?.reportingDate || today}
                                    isLocked={true}
                                    status={entry.status}
                                    onFullscreenToggle={setIsModalFullscreen}
                                />
                            )}
                            {entry.sheet_type === 'dp_block' && (
                                <DPBlockTable
                                    data={entryData.rows}
                                    setData={(newData) => setLocalEntryData({ ...entryData, rows: newData })}
                                    onSave={() => { }}
                                    onSubmit={undefined}
                                    yesterday={entryData.staticHeader?.progressDate || yesterday}
                                    today={entryData.staticHeader?.reportingDate || today}
                                    isLocked={true}
                                    status={entry.status}
                                    onFullscreenToggle={setIsModalFullscreen}
                                />
                            )}
                            {entry.sheet_type === 'dp_vendor_idt' && (
                                <DPVendorIdtTable
                                    data={entryData.rows}
                                    setData={(newData) => setLocalEntryData({ ...entryData, rows: newData })}
                                    onSave={() => { }}
                                    onSubmit={undefined}
                                    yesterday={entryData.staticHeader?.progressDate || yesterday}
                                    today={entryData.staticHeader?.reportingDate || today}
                                    isLocked={true}
                                    status={entry.status}
                                    onFullscreenToggle={setIsModalFullscreen}
                                />
                            )}
                            {entry.sheet_type === 'dp_vendor_block' && (
                                <DPVendorBlockTable
                                    data={entryData.rows}
                                    setData={(newData) => setLocalEntryData({ ...entryData, rows: newData })}
                                    onSave={() => { }}
                                    onSubmit={undefined}
                                    yesterday={entryData.staticHeader?.progressDate || yesterday}
                                    today={entryData.staticHeader?.reportingDate || today}
                                    isLocked={true}
                                    status={entry.status}
                                    onFullscreenToggle={setIsModalFullscreen}
                                />
                            )}
                            {entry.sheet_type === 'manpower_details' && (
                                <ManpowerDetailsTable
                                    data={entryData.rows}
                                    setData={(newData) => setLocalEntryData({ ...entryData, rows: newData })}
                                    totalManpower={entryData.totalManpower || 0}
                                    setTotalManpower={(val) => setLocalEntryData({ ...entryData, totalManpower: val })}
                                    onSave={() => { }}
                                    onSubmit={undefined}
                                    yesterday={entryData.staticHeader?.progressDate || yesterday}
                                    today={entryData.staticHeader?.reportingDate || today}
                                    isLocked={true}
                                    status={entry.status}
                                    onFullscreenToggle={setIsModalFullscreen}
                                />
                            )}
                            {entry.sheet_type === 'testing_commissioning' && (
                                <TestingCommTable
                                    data={entryData.rows}
                                    setData={() => { }}
                                    onSave={() => { }}
                                    onSubmit={undefined}
                                    yesterday={entryData.staticHeader?.progressDate || yesterday}
                                    today={entryData.staticHeader?.reportingDate || today}
                                    isLocked={true}
                                    status={entry.status}
                                    onFullscreenToggle={setIsModalFullscreen}
                                />
                            )}
                            {entry.sheet_type === 'wind_summary' && (
                                <WindSummaryTable
                                    data={entryData.rows}
                                    setData={() => { }}
                                    onSave={() => { }}
                                    onSubmit={() => { }}
                                    isLocked={true}
                                    status={entry.status}
                                />
                            )}
                            {entry.sheet_type === 'wind_progress' && (
                                <WindProgressTable
                                    data={entryData.rows}
                                    setData={() => { }}
                                    onSave={() => { }}
                                    onSubmit={() => { }}
                                    yesterday={entryData.staticHeader?.progressDate || yesterday}
                                    today={entryData.staticHeader?.reportingDate || today}
                                    isLocked={true}
                                    status={entry.status}
                                    onFullscreenToggle={setIsModalFullscreen}
                                />
                            )}
                            {entry.sheet_type === 'wind_manpower' && (
                                <WindManpowerTable
                                    data={entryData.rows}
                                    setData={() => { }}
                                    onSave={() => { }}
                                    onSubmit={() => { }}
                                    isLocked={true}
                                    status={entry.status}
                                    todayDate={entryData.staticHeader?.reportingDate || today}
                                />
                            )}
                            {entry.sheet_type === 'pss_summary' && (
                                <PSSSummaryTable
                                    data={entryData.rows}
                                    setData={() => { }}
                                    onSave={() => { }}
                                    onSubmit={() => { }}
                                    isLocked={true}
                                    status={entry.status}
                                />
                            )}
                            {entry.sheet_type === 'pss_progress' && (
                                <PSSProgressTable
                                    data={entryData.rows}
                                    setData={() => { }}
                                    onSave={() => { }}
                                    onSubmit={() => { }}
                                    yesterday={entryData.staticHeader?.progressDate || yesterday}
                                    today={entryData.staticHeader?.reportingDate || today}
                                    isLocked={true}
                                    status={entry.status}
                                />
                            )}
                            {entry.sheet_type === 'pss_manpower' && (
                                <PSSManpowerTable
                                    data={entryData.rows}
                                    setData={() => { }}
                                    onSave={() => { }}
                                    onSubmit={() => { }}
                                    isLocked={true}
                                    status={entry.status}
                                    todayDate={entryData.staticHeader?.reportingDate || today}
                                />
                            )}
                        </div>
                    </div>
                )}
            </div>
        );
    };

    // Render the list view
    const renderListView = () => (
        <div className="space-y-3 max-h-[65vh] overflow-y-auto">
            {entries.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                    <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No sheets found in this category</p>
                </div>
            ) : (
                entries.map((entry) => (
                    <Card
                        key={entry.id}
                        className="p-3 sm:p-4 hover:shadow-md transition-all cursor-pointer hover:border-primary/50 group"
                        onClick={() => {
                            setSelectedEntry(entry);
                            setLocalEntryData(typeof entry.data_json === 'string' ? JSON.parse(entry.data_json) : entry.data_json);
                        }}
                    >
                        <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-white transition-colors flex-shrink-0">
                                    <FileText className="h-4 w-4 sm:h-5 sm:w-5" />
                                </div>
                                <div className="min-w-0">
                                    <h4 className="font-semibold text-foreground text-sm sm:text-base truncate">
                                        Entry #{entry.id} - {getSheetTypeLabel(entry.sheet_type)}
                                    </h4>
                                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground mt-1">
                                        {entry.supervisor_name && (
                                            <span className="flex items-center gap-1">
                                                <User className="h-3 w-3" />
                                                <span className="truncate max-w-[100px] sm:max-w-none">{entry.supervisor_name}</span>
                                            </span>
                                        )}
                                        <span className="flex items-center gap-1">
                                            <Calendar className="h-3 w-3" />
                                            {formatDateString(entry.entry_date || entry.submitted_at || entry.updated_at || entry.created_at)}
                                        </span>
                                    </div>
                                </div>
                            </div>
                            <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
                                <div className="hidden sm:block">
                                    {getStatusBadge(entry.status)}
                                </div>
                                <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
                            </div>
                        </div>
                        {/* Status badge on mobile - shown below */}
                        <div className="sm:hidden mt-2 flex justify-end">
                            {getStatusBadge(entry.status)}
                        </div>
                    </Card>
                ))
            )}
        </div>
    );

    return (
        <BaseModal
            isOpen={isOpen}
            onClose={handleClose}
            title={selectedEntry ? `Entry #${selectedEntry.id}` : `${title} (${entries.length})`}
            description={selectedEntry ? getSheetTypeLabel(selectedEntry.sheet_type) : "Click on a sheet to view details and take action"}
            icon={getIcon(title)}
            maxWidth={selectedEntry ? "max-w-[98vw]" : "max-w-[95vw] md:max-w-5xl"}
            fullScreen={isModalFullscreen}
        >
            <AnimatePresence mode="wait">
                {selectedEntry ? (
                    <motion.div
                        key="detail"
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        transition={{ duration: 0.2 }}
                    >
                        {renderDetailView(selectedEntry)}
                    </motion.div>
                ) : (
                    <motion.div
                        key="list"
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 20 }}
                        transition={{ duration: 0.2 }}
                    >
                        {renderListView()}
                    </motion.div>
                )}
            </AnimatePresence>
        </BaseModal>
    );
};
