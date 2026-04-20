import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Download, RefreshCw, FileDown, Eye } from 'lucide-react';
import { fetchSnapshotData, exportSnapshotToExcel, exportSnapshotToPDF } from '@/services/sheetEntriesService';
import { toast } from 'sonner';

interface SnapshotFilterModalProps {
    isOpen: boolean;
    onClose: () => void;
    projects: any[];
}

// Dummy data for demonstration
const DUMMY_SNAPSHOT_DATA = [
    {
        id: 101,
        sheet_type: 'dp_qty',
        project_name: 'Adani Solar Plant - Phase 1',
        submitted_by: 'John Smith',
        status: 'final_approved',
        created_at: '2024-12-20T10:30:00Z'
    },
    {
        id: 102,
        sheet_type: 'dp_block',
        project_name: 'Adani Solar Plant - Phase 1',
        submitted_by: 'Jane Doe',
        status: 'approved_by_pm',
        created_at: '2024-12-21T14:15:00Z'
    },
    {
        id: 103,
        sheet_type: 'manpower_details',
        project_name: 'Adani Wind Farm - Block A',
        submitted_by: 'Mike Johnson',
        status: 'submitted_to_pm',
        created_at: '2024-12-22T09:00:00Z'
    },
    {
        id: 104,
        sheet_type: 'mms_module_rfi',
        project_name: 'Adani Solar Plant - Phase 2',
        submitted_by: 'Sarah Williams',
        status: 'final_approved',
        created_at: '2024-12-22T11:45:00Z'
    },
    {
        id: 105,
        sheet_type: 'dp_vendor_idt',
        project_name: 'Adani Wind Farm - Block B',
        submitted_by: 'Robert Brown',
        status: 'rejected_by_pm',
        created_at: '2024-12-23T08:20:00Z'
    },
    {
        id: 106,
        sheet_type: 'dp_qty',
        project_name: 'Adani Solar Plant - Phase 1',
        submitted_by: 'Emily Davis',
        status: 'approved_by_pm',
        created_at: '2024-12-23T15:30:00Z'
    },
    {
        id: 107,
        sheet_type: 'dp_vendor_block',
        project_name: 'Adani Wind Farm - Block A',
        submitted_by: 'David Wilson',
        status: 'submitted_to_pm',
        created_at: '2024-12-24T07:00:00Z'
    },
    {
        id: 108,
        sheet_type: 'manpower_details',
        project_name: 'Adani Solar Plant - Phase 2',
        submitted_by: 'Lisa Anderson',
        status: 'final_approved',
        created_at: '2024-12-24T10:15:00Z'
    }
];

const DUMMY_STATISTICS = {
    total_entries: 8,
    final_approved_count: 3,
    submitted_count: 2,
    approved_count: 2,
    rejected_count: 1,
    unique_projects: 4,
    unique_users: 8
};

export const SnapshotFilterModal = ({ isOpen, onClose, projects }: SnapshotFilterModalProps) => {
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [selectedProject, setSelectedProject] = useState('all');
    const [selectedSheetTypes, setSelectedSheetTypes] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);
    const [snapshotData, setSnapshotData] = useState<any[]>([]);
    const [statistics, setStatistics] = useState<any>(null);
    const [hasSearched, setHasSearched] = useState(false);

    const sheetTypes = [
        { value: 'dp_qty', label: 'DP QTY' },
        { value: 'dp_block', label: 'DP Block' },
        { value: 'dp_vendor_idt', label: 'DP Vendor IDT' },
        { value: 'dp_vendor_block', label: 'DP Vendor Block' },
        { value: 'mms_module_rfi', label: 'MMS Module RFI' },
        { value: 'manpower_details', label: 'Manpower Details' },
        { value: 'switchyard', label: 'Switchyard' },
        { value: 'transmission_line', label: 'Transmission Line' },
        { value: 'infra_works', label: 'Infra Works' }
    ];

    // Load demo data when modal opens
    useEffect(() => {
        if (isOpen && !hasSearched && snapshotData.length === 0) {
            // Auto-load demo data for visualization
            setSnapshotData(DUMMY_SNAPSHOT_DATA);
            setStatistics(DUMMY_STATISTICS);
            setHasSearched(true);
        }
    }, [isOpen]);

    const handleSheetTypeToggle = (sheetType: string) => {
        setSelectedSheetTypes(prev => {
            if (prev.includes(sheetType)) {
                return prev.filter(type => type !== sheetType);
            } else {
                return [...prev, sheetType];
            }
        });
    };

    const handleLoadDemoData = () => {
        setSnapshotData(DUMMY_SNAPSHOT_DATA);
        setStatistics(DUMMY_STATISTICS);
        setHasSearched(true);
        toast.success('Demo data loaded successfully!');
    };

    const handleApplyFilter = async () => {
        if (!startDate && !endDate && selectedProject === 'all' && selectedSheetTypes.length === 0) {
            toast.error('Please select at least one filter');
            return;
        }

        setLoading(true);
        setHasSearched(false);

        try {
            const filters = {
                startDate,
                endDate,
                projectId: selectedProject,
                sheetType: selectedSheetTypes.length > 0 ? selectedSheetTypes.join(',') : 'all'
            };

            const result = await fetchSnapshotData(filters);
            setSnapshotData(result.entries || []);
            setStatistics(result.statistics || null);
            setHasSearched(true);

            if (result.entries.length === 0) {
                toast.info('No entries found matching the selected filters');
            } else {
                toast.success(`Found ${result.entries.length} entries`);
            }
        } catch (error) {
            console.error('Error fetching snapshot data:', error);
            // If API fails, load demo data as fallback
            setSnapshotData(DUMMY_SNAPSHOT_DATA);
            setStatistics(DUMMY_STATISTICS);
            setHasSearched(true);
            toast.info('Showing demo data (API unavailable)');
        } finally {
            setLoading(false);
        }
    };

    const handleExportToExcel = async () => {
        if (snapshotData.length === 0) {
            toast.error('No data to export');
            return;
        }

        try {
            await exportSnapshotToExcel(snapshotData);
        } catch (error) {
            console.error('Error exporting to Excel:', error);
        }
    };

    const handleExportToPDF = async () => {
        if (snapshotData.length === 0) {
            toast.error('No data to export');
            return;
        }

        try {
            const filters = {
                startDate,
                endDate,
                projectId: selectedProject,
                sheetType: selectedSheetTypes.join(', ')
            };
            await exportSnapshotToPDF(snapshotData, filters);
        } catch (error) {
            console.error('Error exporting to PDF:', error);
        }
    };

    const handleReset = () => {
        setStartDate('');
        setEndDate('');
        setSelectedProject('all');
        setSelectedSheetTypes([]);
        setSnapshotData([]);
        setStatistics(null);
        setHasSearched(false);
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        Snapshot Filter
                        <span className="text-xs text-muted-foreground font-normal">(Demo Mode)</span>
                    </DialogTitle>
                </DialogHeader>

                {/* Filter Section */}
                <div className="space-y-4 mb-6 p-4 bg-muted/50 rounded-lg">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Date Range */}
                        <div>
                            <label className="block text-sm font-medium mb-2">Start Date</label>
                            <Input
                                type="date"
                                value={startDate}
                                onChange={(e) => setStartDate(e.target.value)}
                                placeholder="Start Date"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium mb-2">End Date</label>
                            <Input
                                type="date"
                                value={endDate}
                                onChange={(e) => setEndDate(e.target.value)}
                                placeholder="End Date"
                            />
                        </div>

                        {/* Project Filter */}
                        <div className="md:col-span-2">
                            <label className="block text-sm font-medium mb-2">Project</label>
                            <Select value={selectedProject} onValueChange={setSelectedProject}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Select Project" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Projects</SelectItem>
                                    {(Array.isArray(projects) ? projects : []).map((project) => (
                                        <SelectItem key={project.ObjectId} value={project.ObjectId.toString()}>
                                            {project.Name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Sheet Type Filter */}
                        <div className="md:col-span-2">
                            <label className="block text-sm font-medium mb-2">Sheet Types</label>
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                                {sheetTypes.map((type) => (
                                    <label key={type.value} className="flex items-center space-x-2 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={selectedSheetTypes.includes(type.value)}
                                            onChange={() => handleSheetTypeToggle(type.value)}
                                            className="rounded"
                                        />
                                        <span className="text-sm">{type.label}</span>
                                    </label>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex gap-2 justify-end">
                        <Button variant="outline" onClick={handleReset}>
                            Reset
                        </Button>
                        <Button variant="secondary" onClick={handleLoadDemoData}>
                            <Eye className="w-4 h-4 mr-2" />
                            Load Demo Data
                        </Button>
                        <Button onClick={handleApplyFilter} disabled={loading}>
                            {loading ? (
                                <>
                                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                                    Loading...
                                </>
                            ) : (
                                'Apply Filter'
                            )}
                        </Button>
                    </div>
                </div>

                {/* Statistics Section */}
                {statistics && (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                        <div className="bg-blue-50 dark:bg-blue-900/30 p-3 rounded-lg">
                            <p className="text-xs text-muted-foreground">Total Entries</p>
                            <p className="text-2xl font-bold text-blue-600">{statistics.total_entries || 0}</p>
                        </div>
                        <div className="bg-green-50 dark:bg-green-900/30 p-3 rounded-lg">
                            <p className="text-xs text-muted-foreground">Final Approved</p>
                            <p className="text-2xl font-bold text-green-600">{statistics.final_approved_count || 0}</p>
                        </div>
                        <div className="bg-yellow-50 dark:bg-yellow-900/30 p-3 rounded-lg">
                            <p className="text-xs text-muted-foreground">Pending</p>
                            <p className="text-2xl font-bold text-yellow-600">{statistics.submitted_count || 0}</p>
                        </div>
                        <div className="bg-red-50 dark:bg-red-900/30 p-3 rounded-lg">
                            <p className="text-xs text-muted-foreground">Rejected</p>
                            <p className="text-2xl font-bold text-red-600">{statistics.rejected_count || 0}</p>
                        </div>
                    </div>
                )}

                {/* Results Section */}
                {hasSearched && (
                    <>
                        {snapshotData.length > 0 && (
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="text-lg font-semibold">Results ({snapshotData.length})</h3>
                                <div className="flex gap-2">
                                    <Button variant="outline" size="sm" onClick={handleExportToExcel}>
                                        <Download className="w-4 h-4 mr-2" />
                                        Export to Excel
                                    </Button>
                                    <Button variant="outline" size="sm" onClick={handleExportToPDF}>
                                        <FileDown className="w-4 h-4 mr-2" />
                                        Export to PDF
                                    </Button>
                                </div>
                            </div>
                        )}

                        <div className="border rounded-lg overflow-hidden">
                            {snapshotData.length === 0 ? (
                                <div className="text-center py-8 text-muted-foreground">
                                    <p>No entries found matching the selected filters</p>
                                </div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full">
                                        <thead className="bg-muted">
                                            <tr>
                                                <th className="px-4 py-3 text-left text-xs font-medium uppercase">ID</th>
                                                <th className="px-4 py-3 text-left text-xs font-medium uppercase">Sheet Type</th>
                                                <th className="px-4 py-3 text-left text-xs font-medium uppercase">Project</th>
                                                <th className="px-4 py-3 text-left text-xs font-medium uppercase">Submitted By</th>
                                                <th className="px-4 py-3 text-left text-xs font-medium uppercase">Status</th>
                                                <th className="px-4 py-3 text-left text-xs font-medium uppercase">Created At</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y">
                                            {(Array.isArray(snapshotData) ? snapshotData : []).map((entry) => (
                                                <tr key={entry.id} className="hover:bg-muted/50">
                                                    <td className="px-4 py-3 text-sm font-medium">#{entry.id}</td>
                                                    <td className="px-4 py-3 text-sm">
                                                        <span className="px-2 py-1 bg-purple-100 text-purple-800 rounded text-xs font-medium">
                                                            {entry.sheet_type?.replace(/_/g, ' ').toUpperCase()}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-3 text-sm">{entry.project_name || 'N/A'}</td>
                                                    <td className="px-4 py-3 text-sm">{entry.submitted_by || 'N/A'}</td>
                                                    <td className="px-4 py-3 text-sm">
                                                        <span className={`px-2 py-1 rounded text-xs font-medium ${entry.status === 'final_approved' ? 'bg-green-100 text-green-800' :
                                                            entry.status === 'approved_by_pm' ? 'bg-blue-100 text-blue-800' :
                                                                entry.status === 'submitted_to_pm' ? 'bg-yellow-100 text-yellow-800' :
                                                                    entry.status?.includes('rejected') ? 'bg-red-100 text-red-800' :
                                                                        'bg-gray-100 text-gray-800'
                                                            }`}>
                                                            {entry.status?.replace(/_/g, ' ')}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-3 text-sm">
                                                        {new Date(entry.created_at).toLocaleDateString('en-US', {
                                                            year: 'numeric',
                                                            month: 'short',
                                                            day: 'numeric'
                                                        })}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    </>
                )}

                {/* Footer */}
                <div className="flex justify-end pt-4 border-t">
                    <Button variant="outline" onClick={onClose}>
                        Close
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
};

