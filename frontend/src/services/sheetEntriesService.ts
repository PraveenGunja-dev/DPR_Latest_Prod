// src/services/sheetEntriesService.ts
import apiClient from './apiClient';
import axios from 'axios';
import { showAlert } from '@/components/AppDialog';

/**
 * Handle API errors consistently
 */
const handleApiError = (error: any, defaultMessage: string) => {
    if (axios.isAxiosError(error) && error.response) {
        throw new Error(error.response.data.message || defaultMessage);
    }
    throw new Error('Network error');
};

/**
 * Fetch all entries for Super Admin
 */
export const fetchAllEntries = async (params: {
    status?: string;
    projectId?: string;
    sheetType?: string;
    limit?: number;
    offset?: number;
}) => {
    try {
        const response = await apiClient.get('/super-admin/entries', { params });
        return response.data;
    } catch (error) {
        return handleApiError(error, 'Failed to fetch entries');
    }
};

/**
 * Fetch snapshot data for Super Admin with filters
 */
export const fetchSnapshotData = async (filters: { 
    startDate?: string; 
    endDate?: string; 
    projectId?: string; 
    sheetType?: string;
}) => {
    try {
        const response = await apiClient.get('/super-admin/snapshot', { params: filters });
        return response.data;
    } catch (error) {
        return handleApiError(error, 'Failed to fetch snapshot data');
    }
};

/**
 * Export snapshot data to Excel
 * Note: Implementation depends on library preference (ExcelJS, xlsx, etc.)
 * For now, we'll provide a placeholder that triggers a download alert
 */
export const exportSnapshotToExcel = async (data: any[]) => {
    console.log('Exporting to Excel:', data);
    // In a real app, you would use a library like 'xlsx' or 'exceljs'
    // or call a dedicated template-based export endpoint
    showAlert('Export to Excel started. (Feature implementation pending library selection)');
};

/**
 * Export snapshot data to PDF 
 * Note: Implementation depends on library preference (jspdf, etc.)
 */
export const exportSnapshotToPDF = async (data: any[], filters: any) => {
    console.log('Exporting to PDF:', data, filters);
    showAlert('Export to PDF started. (Feature implementation pending library selection)');
};
