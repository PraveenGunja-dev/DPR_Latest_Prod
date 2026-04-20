import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Search, RefreshCw, Eye, ChevronLeft, ChevronRight } from 'lucide-react';
import { fetchAllEntries } from '@/services/sheetEntriesService';
import { EntryCard } from '@/components/shared/EntryCard';
import { toast } from 'sonner';

interface SuperAdminSheetEntriesProps {
    projects: any[];
}

export const SuperAdminSheetEntries = ({ projects }: SuperAdminSheetEntriesProps) => {
    const [entries, setEntries] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [statusFilter, setStatusFilter] = useState('final_approved');
    const [projectFilter, setProjectFilter] = useState('all');
    const [sheetTypeFilter, setSheetTypeFilter] = useState('all');
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedEntry, setSelectedEntry] = useState<any>(null);
    const [showDetailModal, setShowDetailModal] = useState(false);

    // Pagination
    const [currentPage, setCurrentPage] = useState(1);
    const [totalEntries, setTotalEntries] = useState(0);
    const itemsPerPage = 20;

    const sheetTypes = [
        { value: 'dp_qty', label: 'DP QTY' },
        { value: 'dp_block', label: 'DP Block' },
        { value: 'dp_vendor_idt', label: 'DP Vendor IDT' },
        { value: 'dp_vendor_block', label: 'DP Vendor Block' },
        { value: 'mms_module_rfi', label: 'MMS Module RFI' },
        { value: 'manpower_details', label: 'Manpower Details' },
        { value: 'switchyard', label: 'Switchyard' },
        { value: 'transmission_line', label: 'Transmission Line' },
        { value: 'infra_works', label: 'Infra Works' },
        // Wind
        { value: 'wind_summary', label: 'Wind Summary' },
        { value: 'wind_progress', label: 'Wind Progress' },
        { value: 'wind_manpower', label: 'Wind Manpower' },
        // PSS
        { value: 'pss_summary', label: 'PSS Summary' },
        { value: 'pss_progress', label: 'PSS Progress' },
        { value: 'pss_manpower', label: 'PSS Manpower' },
    ];

    const loadEntries = async () => {
        setLoading(true);
        try {
            const offset = (currentPage - 1) * itemsPerPage;
            const result = await fetchAllEntries({
                status: statusFilter !== 'all' ? statusFilter : undefined,
                projectId: projectFilter !== 'all' ? projectFilter : undefined,
                sheetType: sheetTypeFilter !== 'all' ? sheetTypeFilter : undefined,
                limit: itemsPerPage,
                offset
            });

            setEntries(result.entries || []);
            setTotalEntries(result.total || 0);
        } catch (error) {
            console.error('Error loading entries:', error);
            toast.error('Failed to load sheet entries');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadEntries();
    }, [statusFilter, projectFilter, sheetTypeFilter, currentPage]);

    const handleViewDetails = (entry: any) => {
        setSelectedEntry(entry);
        setShowDetailModal(true);
    };

    const filteredEntries = entries.filter((entry) => {
        if (!searchTerm) return true;
        const search = searchTerm.toLowerCase();
        return (
            entry.id.toString().includes(search) ||
            entry.sheet_type?.toLowerCase().includes(search) ||
            entry.project_name?.toLowerCase().includes(search) ||
            entry.submitted_by?.toLowerCase().includes(search) ||
            entry.status?.toLowerCase().includes(search)
        );
    });

    const totalPages = Math.ceil(totalEntries / itemsPerPage);

    return (
        <>
            <Card>
                <CardHeader>
                    <CardTitle>Sheet Entries</CardTitle>
                    <CardDescription>View and manage all sheet entries in the system</CardDescription>
                </CardHeader>
                <CardContent>
                    {/* Filters */}
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                        <div className="relative w-full sm:w-64">
                            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Search entries..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="pl-8"
                            />
                        </div>
                        <div className="flex gap-2 flex-wrap">
                            <Select value={statusFilter} onValueChange={setStatusFilter}>
                                <SelectTrigger className="w-[150px]">
                                    <SelectValue placeholder="Status" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Status</SelectItem>
                                    <SelectItem value="draft">Draft</SelectItem>
                                    <SelectItem value="submitted_to_pm">Submitted to PM</SelectItem>
                                    <SelectItem value="approved_by_pm">Approved by PM</SelectItem>
                                    <SelectItem value="final_approved">Final Approved</SelectItem>
                                    <SelectItem value="rejected_by_pm">Rejected by PM</SelectItem>
                                    <SelectItem value="rejected_by_pmag">Rejected by PMAG</SelectItem>
                                </SelectContent>
                            </Select>

                            <Select value={projectFilter} onValueChange={setProjectFilter}>
                                <SelectTrigger className="w-[150px]">
                                    <SelectValue placeholder="Project" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Projects</SelectItem>
                                    {projects.map((project) => (
                                        <SelectItem key={project.ObjectId} value={project.ObjectId.toString()}>
                                            {project.Name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>

                            <Select value={sheetTypeFilter} onValueChange={setSheetTypeFilter}>
                                <SelectTrigger className="w-[150px]">
                                    <SelectValue placeholder="Sheet Type" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Types</SelectItem>
                                    {sheetTypes.map((type) => (
                                        <SelectItem key={type.value} value={type.value}>
                                            {type.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>

                            <Button
                                variant="outline"
                                size="sm"
                                onClick={loadEntries}
                                disabled={loading}
                            >
                                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                            </Button>
                        </div>
                    </div>

                    {/* Table */}
                    {loading ? (
                        <div className="flex justify-center items-center h-64">
                            <RefreshCw className="w-8 h-8 animate-spin text-primary" />
                        </div>
                    ) : filteredEntries.length === 0 ? (
                        <div className="text-center py-12 text-muted-foreground">
                            <p>No entries found</p>
                        </div>
                    ) : (
                        <>
                            <div className="rounded-md border overflow-x-auto">
                                <table className="w-full">
                                    <thead className="bg-muted">
                                        <tr>
                                            <th className="px-4 py-3 text-left text-xs font-medium">ID</th>
                                            <th className="px-4 py-3 text-left text-xs font-medium">Sheet Type</th>
                                            <th className="px-4 py-3 text-left text-xs font-medium">Project</th>
                                            <th className="px-4 py-3 text-left text-xs font-medium">Submitted By</th>
                                            <th className="px-4 py-3 text-left text-xs font-medium">Status</th>
                                            <th className="px-4 py-3 text-left text-xs font-medium">Date</th>
                                            <th className="px-4 py-3 text-right text-xs font-medium">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y">
                                        {filteredEntries.map((entry) => (
                                            <tr key={entry.id} className="hover:bg-muted/50">
                                                <td className="px-4 py-3 text-sm font-medium">{entry.id}</td>
                                                <td className="px-4 py-3 text-sm">
                                                    {entry.sheet_type?.replace(/_/g, ' ')}
                                                </td>
                                                <td className="px-4 py-3 text-sm">{entry.project_name || 'N/A'}</td>
                                                <td className="px-4 py-3 text-sm">{entry.submitted_by || 'N/A'}</td>
                                                <td className="px-4 py-3 text-sm">
                                                    <span
                                                        className={`px-2 py-1 rounded text-xs font-medium ${entry.status === 'final_approved'
                                                                ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                                                                : entry.status === 'approved_by_pm'
                                                                    ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300'
                                                                    : entry.status === 'submitted_to_pm'
                                                                        ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300'
                                                                        : entry.status?.includes('rejected')
                                                                            ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
                                                                            : 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300'
                                                            }`}
                                                    >
                                                        {entry.status?.replace(/_/g, ' ')}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 text-sm">
                                                    {new Date(entry.created_at).toLocaleDateString()}
                                                </td>
                                                <td className="px-4 py-3 text-right">
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => handleViewDetails(entry)}
                                                    >
                                                        <Eye className="w-4 h-4" />
                                                    </Button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            {/* Pagination */}
                            <div className="flex items-center justify-between mt-4">
                                <p className="text-sm text-muted-foreground">
                                    Showing {((currentPage - 1) * itemsPerPage) + 1} to {Math.min(currentPage * itemsPerPage, totalEntries)} of {totalEntries} entries
                                </p>
                                <div className="flex gap-2">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                        disabled={currentPage === 1}
                                    >
                                        <ChevronLeft className="w-4 h-4" />
                                        Previous
                                    </Button>
                                    <span className="flex items-center px-3 text-sm">
                                        Page {currentPage} of {totalPages}
                                    </span>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                        disabled={currentPage === totalPages}
                                    >
                                        Next
                                        <ChevronRight className="w-4 h-4" />
                                    </Button>
                                </div>
                            </div>
                        </>
                    )}
                </CardContent>
            </Card>

            {/* Detail Modal */}
            <Dialog open={showDetailModal} onOpenChange={setShowDetailModal}>
                <DialogContent 
                    className="max-w-[95vw] w-[95vw] max-h-[95vh] overflow-y-auto p-4 md:p-6"
                    style={{ width: '95vw' }}
                >
                    <DialogHeader>
                        <DialogTitle className="text-xl">Sheet Entry Details</DialogTitle>
                    </DialogHeader>
                    {selectedEntry && (
                        <div className="space-y-4">
                            {/* Entry Info */}
                            <div className="grid grid-cols-2 gap-4 p-4 bg-muted/50 rounded-lg">
                                <div>
                                    <p className="text-sm font-medium text-muted-foreground">Entry ID</p>
                                    <p className="text-lg font-semibold">{selectedEntry.id}</p>
                                </div>
                                <div>
                                    <p className="text-sm font-medium text-muted-foreground">Sheet Type</p>
                                    <p className="text-lg">{selectedEntry.sheet_type?.replace(/_/g, ' ')}</p>
                                </div>
                                <div>
                                    <p className="text-sm font-medium text-muted-foreground">Project</p>
                                    <p className="text-lg">{selectedEntry.project_name || 'N/A'}</p>
                                </div>
                                <div>
                                    <p className="text-sm font-medium text-muted-foreground">Submitted By</p>
                                    <p className="text-lg">{selectedEntry.submitted_by || 'N/A'}</p>
                                </div>
                                <div>
                                    <p className="text-sm font-medium text-muted-foreground">Status</p>
                                    <p className="text-lg">{selectedEntry.status?.replace(/_/g, ' ')}</p>
                                </div>
                                <div>
                                    <p className="text-sm font-medium text-muted-foreground">Created At</p>
                                    <p className="text-lg">{new Date(selectedEntry.created_at).toLocaleString()}</p>
                                </div>
                            </div>

                            {/* Professional Entry Representation (Matches Supervisor View) */}
                            <div className="border rounded-lg overflow-hidden bg-card">
                                <EntryCard 
                                    entry={selectedEntry}
                                    isExpanded={true}
                                    onToggleExpand={() => {}}
                                    sheetType={selectedEntry.sheet_type}
                                    projects={projects}
                                />
                            </div>

                            <div className="flex justify-end">
                                <Button onClick={() => setShowDetailModal(false)}>Close</Button>
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </>
    );
};
