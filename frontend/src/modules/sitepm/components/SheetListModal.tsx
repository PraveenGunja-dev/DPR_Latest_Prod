import React, { useState, useEffect } from "react";
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
    TestingCommTable
} from "@/modules/supervisor/components";
import { getTodayAndYesterday } from "@/services/dprService";
import { DPREntry } from "@/types";


interface SheetListModalProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    entries: DPREntry[];
    onApprove: (entryId: number) => void;
    onReject: (entryId: number, sheetType: string) => void;
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
    const [isModalFullscreen, setIsModalFullscreen] = useState(false);

    // If the selected entry is removed from the list (e.g., approved), clear the selection
    useEffect(() => {
        if (selectedEntry && !entries.find(e => e.id === selectedEntry.id)) {
            setSelectedEntry(null);
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
        onClose();
    };

    const handleBack = () => {
        setSelectedEntry(null);
    };

    // Render the detailed view with table and actions
    const renderDetailView = (entry: DPREntry) => {
        const entryData = typeof entry.data_json === 'string' ? JSON.parse(entry.data_json) : entry.data_json;
        const { today, yesterday } = getTodayAndYesterday();
        const isLocked = entry.status !== 'submitted_to_pm';

        return (
            <div className="space-y-4">
                {/* Back button and header */}
                {!isModalFullscreen && (
                    <div className="flex items-center justify-between gap-2 mb-4">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setSelectedEntry(null)}
                            className="gap-2 px-0 hover:bg-transparent"
                        >
                            <ArrowLeft className="h-4 w-4" />
                            Back to List
                        </Button>
                        <div className="flex items-center gap-2">
                            {getStatusBadge(entry.status)}
                        </div>
                    </div>
                )}

                {/* Entry info */}
                {!isModalFullscreen && (
                    <div className="bg-muted/50 p-3 sm:p-4 rounded-lg">
                        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                            <div>
                                <h4 className="font-semibold text-base sm:text-lg">Entry #{entry.id} - {getSheetTypeLabel(entry.sheet_type)}</h4>
                                <p className="text-sm text-muted-foreground">
                                    {entry.supervisor_name || 'Supervisor'} ({entry.supervisor_email})
                                </p>
                            </div>
                            <p className="text-sm text-muted-foreground">
                                Submitted: {formatDateString(entry.submitted_at)}
                            </p>
                        </div>
                    </div>
                )}

                {/* Action buttons for pending entries */}
                {entry.status === "submitted_to_pm" && !isModalFullscreen && (
                    <div className="flex flex-wrap gap-2 p-3 bg-muted/30 rounded-lg border border-border">
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={() => onEdit(entry)}
                            className="gap-2"
                        >
                            <Edit className="w-4 h-4" />
                            Edit
                        </Button>
                        <Button
                            size="sm"
                            variant="default"
                            onClick={() => onApprove(entry.id)}
                            className="bg-green-600 hover:bg-green-700 gap-2"
                        >
                            <Check className="w-4 h-4" />
                            Approve
                        </Button>
                        <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => onReject(entry.id, entry.sheet_type)}
                            className="gap-2"
                        >
                            <X className="w-4 h-4" />
                            Reject
                        </Button>
                    </div>
                )}

                {/* Data table with horizontal scroll for mobile/tablet */}
                {entryData?.rows && entryData.rows.length > 0 && (
                    <div className={`border rounded-lg overflow-hidden ${isModalFullscreen ? 'flex-1 h-full' : ''}`}>
                        <div className={`overflow-x-auto overflow-y-auto ${isModalFullscreen ? 'h-[calc(100vh-140px)]' : 'max-h-[50vh] sm:max-h-[55vh] md:max-h-[60vh]'}`}>
                            {entry.sheet_type === 'dp_qty' && (
                                <DPQtyTable
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
                            {entry.sheet_type === 'dp_block' && (
                                <DPBlockTable
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
                            {entry.sheet_type === 'dp_vendor_idt' && (
                                <DPVendorIdtTable
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
                            {entry.sheet_type === 'dp_vendor_block' && (
                                <DPVendorBlockTable
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
                            {entry.sheet_type === 'manpower_details' && (
                                <ManpowerDetailsTable
                                    data={entryData.rows}
                                    setData={() => { }}
                                    totalManpower={entryData.totalManpower || 0}
                                    setTotalManpower={() => { }}
                                    onSave={() => { }}
                                    onSubmit={() => { }}
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
                                    onSubmit={() => { }}
                                    yesterday={entryData.staticHeader?.progressDate || yesterday}
                                    today={entryData.staticHeader?.reportingDate || today}
                                    isLocked={true}
                                    status={entry.status}
                                    onFullscreenToggle={setIsModalFullscreen}
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
                        onClick={() => setSelectedEntry(entry)}
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
                                            {formatDateString(entry.submitted_at || entry.updated_at || entry.created_at)}
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
