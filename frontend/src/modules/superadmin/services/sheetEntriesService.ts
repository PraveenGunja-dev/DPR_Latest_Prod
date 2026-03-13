// src/modules/superadmin/services/sheetEntriesService.ts
import apiClient from '@/services/apiClient';
import { handleApiError, handleApiSuccess } from '@/services/shared';

// Fetch all sheet entries with optional filters
export const fetchAllEntries = async (filters?: {
    status?: string;
    projectId?: string | number;
    sheetType?: string;
    limit?: number;
    offset?: number;
}) => {
    try {
        const params = new URLSearchParams();

        if (filters?.status) params.append('status', filters.status);
        if (filters?.projectId) params.append('projectId', filters.projectId.toString());
        if (filters?.sheetType) params.append('sheetType', filters.sheetType);
        if (filters?.limit) params.append('limit', filters.limit.toString());
        if (filters?.offset) params.append('offset', filters.offset.toString());

        const response = await apiClient.get(
            `/super-admin/entries?${params.toString()}`
        );

        return response.data;
    } catch (error: any) {
        handleApiError(error, 'Failed to fetch sheet entries');
        throw error;
    }
};

// Fetch snapshot data with filters
export const fetchSnapshotData = async (filters: {
    startDate?: string;
    endDate?: string;
    projectId?: string | number;
    sheetType?: string;
}) => {
    try {
        const params = new URLSearchParams();

        if (filters.startDate) params.append('startDate', filters.startDate);
        if (filters.endDate) params.append('endDate', filters.endDate);
        if (filters.projectId && filters.projectId !== 'all') {
            params.append('projectId', filters.projectId.toString());
        }
        if (filters.sheetType && filters.sheetType !== 'all') {
            params.append('sheetType', filters.sheetType);
        }

        const response = await apiClient.get(
            `/super-admin/snapshot?${params.toString()}`
        );

        return response.data;
    } catch (error: any) {
        handleApiError(error, 'Failed to fetch snapshot data');
        throw error;
    }
};

// Export snapshot data to Excel
export const exportSnapshotToExcel = async (data: any[]) => {
    try {
        const XLSX = await import('xlsx');

        // Transform data for Excel
        const excelData = data.map((entry) => ({
            'Entry ID': entry.id,
            'Sheet Type': entry.sheet_type?.replace(/_/g, ' '),
            'Project': entry.project_name || 'N/A',
            'Submitted By': entry.submitted_by || 'N/A',
            'Role': entry.user_role || 'N/A',
            'Status': entry.status?.replace(/_/g, ' '),
            'Created At': new Date(entry.created_at).toLocaleString(),
            'Submitted At': entry.submitted_at ? new Date(entry.submitted_at).toLocaleString() : 'N/A',
            'Approved At': entry.approved_at ? new Date(entry.approved_at).toLocaleString() : 'N/A',
            'Final Approved At': entry.final_approved_at ? new Date(entry.final_approved_at).toLocaleString() : 'N/A'
        }));

        // Create worksheet
        const ws = XLSX.utils.json_to_sheet(excelData);

        // Create workbook
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Snapshot Data');

        // Generate filename with timestamp
        const timestamp = new Date().toISOString().split('T')[0];
        const filename = `snapshot-data-${timestamp}.xlsx`;

        // Save the file
        XLSX.writeFile(wb, filename);

        handleApiSuccess('Snapshot data exported to Excel successfully!');
    } catch (error: any) {
        handleApiError(error, 'Failed to export to Excel');
        throw error;
    }
};

// Export snapshot data to PDF
export const exportSnapshotToPDF = async (data: any[], filters: any) => {
    try {
        const jsPDF = await import('jspdf');
        await import('jspdf-autotable');

        const doc = new jsPDF.jsPDF({
            orientation: 'landscape'
        });

        // Add title
        doc.setFontSize(18);
        doc.text('Snapshot Data Report', 14, 20);

        // Add filter information
        doc.setFontSize(11);
        let yPos = 30;
        if (filters.startDate || filters.endDate) {
            doc.text(`Date Range: ${filters.startDate || 'N/A'} to ${filters.endDate || 'N/A'}`, 14, yPos);
            yPos += 7;
        }
        if (filters.projectId && filters.projectId !== 'all') {
            doc.text(`Project ID: ${filters.projectId}`, 14, yPos);
            yPos += 7;
        }
        if (filters.sheetType && filters.sheetType !== 'all') {
            doc.text(`Sheet Type: ${filters.sheetType}`, 14, yPos);
            yPos += 7;
        }
        doc.text(`Generated: ${new Date().toLocaleString()}`, 14, yPos);
        yPos += 10;

        // Prepare table data
        const headers = [
            ['ID', 'Sheet Type', 'Project', 'Submitted By', 'Status', 'Created At']
        ];

        const tableData = data.map((entry) => [
            entry.id,
            entry.sheet_type?.replace(/_/g, ' '),
            entry.project_name || 'N/A',
            entry.submitted_by || 'N/A',
            entry.status?.replace(/_/g, ' '),
            new Date(entry.created_at).toLocaleDateString()
        ]);

        // @ts-ignore - AutoTable types might not be available
        doc.autoTable({
            head: headers,
            body: tableData,
            startY: yPos,
            styles: { fontSize: 9 },
            headStyles: { fillColor: [22, 160, 133] },
            alternateRowStyles: { fillColor: [245, 245, 245] }
        });

        // Save the PDF
        const timestamp = new Date().toISOString().split('T')[0];
        doc.save(`snapshot-data-${timestamp}.pdf`);

        handleApiSuccess('Snapshot data exported to PDF successfully!');
    } catch (error: any) {
        handleApiError(error, 'Failed to export to PDF');
        throw error;
    }
};
