import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { AlertCircle, X, RefreshCw, ChevronDown, ChevronRight } from "lucide-react";
import { getIssues, Issue } from "@/services/issuesService";
import { Badge } from "@/components/ui/badge";

interface IssuesViewModalProps {
    isOpen: boolean;
    onClose: () => void;
}

// Interface for parsed issue details
interface IssueDetails {
    description: string;
    startDate: string;
    finishedDate: string;
    delayedDays: number;
    status: string;
    actionRequired: string;
    remarks: string;
}

export const IssuesViewModal = ({ isOpen, onClose }: IssuesViewModalProps) => {
    const [issues, setIssues] = useState<Issue[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [expandedId, setExpandedId] = useState<number | null>(null);

    // Load issues when modal opens
    useEffect(() => {
        if (isOpen) {
            loadIssues();
        }
    }, [isOpen]);

    const loadIssues = async () => {
        try {
            setLoading(true);
            setError(null);
            const response = await getIssues({ limit: 100 });
            setIssues(response.issues || []);
        } catch (err: any) {
            console.error("Error loading issues:", err);
            setError(err.message || "Failed to load issues");
        } finally {
            setLoading(false);
        }
    };

    // Parse issue description (which contains JSON of all fields)
    const parseIssueDetails = (description: string): IssueDetails | null => {
        try {
            let cleanStr = (description || '').trim();
            let attempts = 0;
            let parsed: any = cleanStr;

            while (typeof parsed === 'string' && parsed.trim().startsWith('{') && parsed.trim().endsWith('}') && attempts < 2) {
                parsed = JSON.parse(parsed.trim());
                attempts++;
            }

            if (typeof parsed !== 'object' || parsed === null || parsed.description === undefined) {
                throw new Error("Not a valid structured JSON object");
            }

            return {
                description: parsed.description || '',
                startDate: parsed.startDate || '',
                finishedDate: parsed.finishedDate || '',
                delayedDays: parsed.delayedDays || 0,
                status: parsed.status || '',
                actionRequired: parsed.actionRequired || '',
                remarks: parsed.remarks || ''
            };
        } catch {
            // If not JSON, return the plain text as description
            return {
                description: description,
                startDate: '',
                finishedDate: '',
                delayedDays: 0,
                status: '',
                actionRequired: '',
                remarks: ''
            };
        }
    };

    const formatDate = (dateString: string | null) => {
        if (!dateString) return "-";
        try {
            return new Date(dateString).toLocaleDateString("en-IN", {
                day: "2-digit",
                month: "short",
                year: "numeric"
            });
        } catch {
            return dateString;
        }
    };

    const getStatusColor = (status: string) => {
        const statusLower = status?.toLowerCase() || '';
        if (statusLower.includes('open')) return "bg-blue-500 text-white";
        if (statusLower.includes('progress')) return "bg-yellow-500 text-black";
        if (statusLower.includes('resolved') || statusLower.includes('closed')) return "bg-green-500 text-white";
        return "bg-gray-500 text-white";
    };

    const toggleExpand = (id: number) => {
        setExpandedId(expandedId === id ? null : id);
    };

    if (!isOpen) return null;

    return createPortal(
        <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4"
            onClick={onClose}
        >
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.2 }}
                className="bg-background rounded-lg shadow-xl w-full max-w-5xl max-h-[85vh] flex flex-col border border-border"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-border flex-shrink-0">
                    <div className="flex items-center gap-2">
                        <AlertCircle className="w-5 h-5 text-primary" />
                        <h2 className="text-lg font-semibold">Issue Logs</h2>
                        <Badge variant="secondary" className="ml-2">
                            {issues.length} {issues.length === 1 ? "issue" : "issues"}
                        </Badge>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={loadIssues}
                            disabled={loading}
                        >
                            <RefreshCw className={`w-4 h-4 mr-1 ${loading ? "animate-spin" : ""}`} />
                            Refresh
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="rounded-full"
                            onClick={onClose}
                        >
                            <X className="w-4 h-4" />
                        </Button>
                    </div>
                </div>

                {/* Content */}
                <div className="flex-grow overflow-auto">
                    {loading ? (
                        <div className="flex items-center justify-center py-12">
                            <RefreshCw className="w-8 h-8 animate-spin text-muted-foreground" />
                        </div>
                    ) : error ? (
                        <div className="flex flex-col items-center justify-center py-12 text-red-500">
                            <AlertCircle className="w-12 h-12 mb-2" />
                            <p>{error}</p>
                            <Button variant="outline" className="mt-4" onClick={loadIssues}>
                                Retry
                            </Button>
                        </div>
                    ) : issues.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                            <AlertCircle className="w-12 h-12 mb-2 opacity-50" />
                            <p className="text-lg font-medium">No issues found</p>
                            <p className="text-sm">Issues logged by supervisors will appear here</p>
                        </div>
                    ) : (
                        <table className="w-full text-sm">
                            <thead className="bg-muted sticky top-0">
                                <tr className="text-left font-medium text-muted-foreground border-b">
                                    <th className="p-2 w-8"></th>
                                    <th className="p-2">Description</th>
                                    <th className="p-2">Start Date</th>
                                    <th className="p-2">Finished</th>
                                    <th className="p-2 text-center">Delayed</th>
                                    <th className="p-2">Status</th>
                                    <th className="p-2">Created By</th>
                                </tr>
                            </thead>
                            <tbody>
                                {issues.map((issue) => {
                                    const details = parseIssueDetails(issue.description);
                                    return (
                                        <>
                                            {/* Main Row - Single Line */}
                                            <tr
                                                key={issue.id}
                                                className="border-b border-border hover:bg-muted/50 cursor-pointer"
                                                onClick={() => toggleExpand(issue.id)}
                                            >
                                                <td className="p-2 text-center">
                                                    {expandedId === issue.id ? (
                                                        <ChevronDown className="w-4 h-4 text-muted-foreground" />
                                                    ) : (
                                                        <ChevronRight className="w-4 h-4 text-muted-foreground" />
                                                    )}
                                                </td>
                                                <td className="p-2 max-w-[200px] truncate">
                                                    {details?.description || issue.title || "-"}
                                                </td>
                                                <td className="p-2 whitespace-nowrap">
                                                    {formatDate(details?.startDate || null)}
                                                </td>
                                                <td className="p-2 whitespace-nowrap">
                                                    {formatDate(details?.finishedDate || null)}
                                                </td>
                                                <td className="p-2 text-center">
                                                    {details?.delayedDays || 0}
                                                </td>
                                                <td className="p-2">
                                                    <Badge className={`${getStatusColor(details?.status || issue.status)} text-xs`}>
                                                        {details?.status || issue.status?.replace("_", " ") || "Open"}
                                                    </Badge>
                                                </td>
                                                <td className="p-2 whitespace-nowrap">
                                                    {issue.created_by_name || "Unknown"}
                                                </td>
                                            </tr>

                                            {/* Expanded Details Row */}
                                            <AnimatePresence>
                                                {expandedId === issue.id && (
                                                    <tr>
                                                        <td colSpan={7} className="p-0">
                                                            <motion.div
                                                                initial={{ height: 0, opacity: 0 }}
                                                                animate={{ height: "auto", opacity: 1 }}
                                                                exit={{ height: 0, opacity: 0 }}
                                                                transition={{ duration: 0.2 }}
                                                                className="overflow-hidden bg-muted/30"
                                                            >
                                                                <div className="p-4 grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                                                                    {/* Project */}
                                                                    <div>
                                                                        <span className="text-muted-foreground font-medium">Project:</span>
                                                                        <p className="mt-1">{issue.project_name || "No Project"}</p>
                                                                    </div>

                                                                    {/* Action Required */}
                                                                    <div>
                                                                        <span className="text-muted-foreground font-medium">Action Required:</span>
                                                                        <p className="mt-1">{details?.actionRequired || issue.title || "-"}</p>
                                                                    </div>

                                                                    {/* Created Date */}
                                                                    <div>
                                                                        <span className="text-muted-foreground font-medium">Logged On:</span>
                                                                        <p className="mt-1">{formatDate(issue.created_at)}</p>
                                                                    </div>

                                                                    {/* Remarks */}
                                                                    {details?.remarks && (
                                                                        <div className="col-span-2 md:col-span-3">
                                                                            <span className="text-muted-foreground font-medium">Remarks:</span>
                                                                            <p className="mt-1 p-2 bg-background rounded">{details.remarks}</p>
                                                                        </div>
                                                                    )}

                                                                    {/* Resolution Notes */}
                                                                    {issue.resolution_notes && (
                                                                        <div className="col-span-2 md:col-span-3">
                                                                            <span className="text-muted-foreground font-medium">Resolution:</span>
                                                                            <p className="mt-1 p-2 bg-green-50 dark:bg-green-900/20 rounded">{issue.resolution_notes}</p>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </motion.div>
                                                        </td>
                                                    </tr>
                                                )}
                                            </AnimatePresence>
                                        </>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}
                </div>

                {/* Footer */}
                <div className="p-3 border-t border-border text-center text-xs text-muted-foreground flex-shrink-0">
                    Click on a row to view full details
                </div>
            </motion.div>
        </div>,
        document.body
    );
};
