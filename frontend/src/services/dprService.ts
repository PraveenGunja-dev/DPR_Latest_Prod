// src/services/dprService.ts
import apiClient from './apiClient';
import { DPREntry } from '@/types';
import axios from 'axios';

/**
 * Format a Date object to Indian date style (DD-MM-YYYY)
 */
export const indianDateFormat = (date: Date | string) => {
    if (!date) return "";
    const d = typeof date === 'string' ? new Date(date) : date;
    if (isNaN(d.getTime())) return String(date);
    const day = String(d.getDate()).padStart(2, '0');
    const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const month = monthNames[d.getMonth()];
    const year = String(d.getFullYear()).slice(-2);
    return `${day}-${month}-${year}`;
};

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
 * Get today and yesterday dates in YYYY-MM-DD (ISO) format
 */
export const getTodayAndYesterday = () => {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    return {
        today: today.toLocaleDateString('en-CA'),
        yesterday: yesterday.toLocaleDateString('en-CA')
    };
};

/**
 * Check if an entry is locked (submitted within last 2 days)
 */
export const isEntryLocked = (entry: any): boolean => {
    // Disabled per user request to allow multiple submissions/edits even after approval
    return false;
};

// --- Supervisor APIs ---

export const getDraftEntry = async (projectId: number, sheetType: string, date?: string) => {
    try {
        const params: any = { projectId, sheetType };
        if (date) params.date = date;
        const response = await apiClient.get<DPREntry>('/dpr-supervisor/draft', { params });
        return response.data;
    } catch (error) {
        return handleApiError(error, 'Failed to fetch draft');
    }
};

export const saveDraftEntry = async (entryId: number, data: any, isPartial = false) => {
    try {
        const response = await apiClient.post<DPREntry>('/dpr-supervisor/save-draft', { entryId, data, isPartial });
        return response.data;
    } catch (error) {
        return handleApiError(error, 'Failed to save draft');
    }
};

export const submitEntry = async (entryId: number, editReason?: string) => {
    try {
        const response = await apiClient.post<DPREntry>('/dpr-supervisor/submit', { entryId, editReason });
        return response.data;
    } catch (error) {
        return handleApiError(error, 'Failed to submit entry');
    }
};

// --- PM APIs ---

export const getEntriesForPMReview = async (projectId?: number) => {
    try {
        const params = projectId ? { projectId } : {};
        const response = await apiClient.get<DPREntry[]>('/dpr-supervisor/pm/entries', { params });
        return response.data;
    } catch (error) {
        return handleApiError(error, 'Failed to fetch entries for review');
    }
};

export const approveEntryByPM = async (entryId: number) => {
    try {
        const response = await apiClient.post('/dpr-supervisor/pm/approve', { entryId });
        return response.data;
    } catch (error) {
        return handleApiError(error, 'Failed to approve entry');
    }
};

export const updateEntryByPM = async (entryId: number, data: any) => {
    try {
        const response = await apiClient.put('/dpr-supervisor/pm/update', { entryId, data });
        return response.data;
    } catch (error) {
        return handleApiError(error, 'Failed to update entry');
    }
};

export const rejectEntryByPM = async (entryId: number, rejectionReason?: string) => {
    try {
        const response = await apiClient.post('/dpr-supervisor/pm/reject', { entryId, rejectionReason });
        return response.data;
    } catch (error) {
        return handleApiError(error, 'Failed to reject entry');
    }
};

// --- PMAG APIs ---

export const getEntriesForPMAGReview = async (projectId?: number) => {
    try {
        const params = projectId ? { projectId } : {};
        const response = await apiClient.get<DPREntry[]>('/dpr-supervisor/pmag/entries', { params });
        return response.data;
    } catch (error) {
        return handleApiError(error, 'Failed to fetch entries for PMAG review');
    }
};

export const getHistoryForPMAG = async (projectId?: number, days?: number) => {
    try {
        const params: any = {};
        if (projectId) params.projectId = projectId;
        if (days) params.days = days;
        const response = await apiClient.get<DPREntry[]>('/dpr-supervisor/pmag-history', { params });
        return response.data;
    } catch (error) {
        return handleApiError(error, 'Failed to fetch history');
    }
};

export const getArchivedEntries = async (projectId?: number) => {
    try {
        const params = projectId ? { projectId } : {};
        const response = await apiClient.get<DPREntry[]>('/dpr-supervisor/pmag-archived', { params });
        return response.data;
    } catch (error) {
        return handleApiError(error, 'Failed to fetch archived entries');
    }
};

export const approveEntryByPMAG = async (entryId: number) => {
    try {
        const response = await apiClient.post('/dpr-supervisor/pmag/approve', { entryId });
        return response.data;
    } catch (error) {
        return handleApiError(error, 'Failed to approve entry');
    }
};

export const rejectEntryByPMAG = async (entryId: number, rejectionReason?: string) => {
    try {
        const response = await apiClient.post('/dpr-supervisor/pmag-reject', { entryId, rejectionReason });
        return response.data;
    } catch (error) {
        return handleApiError(error, 'Failed to reject entry');
    }
};

export const updateEntryByPMAG = async (entryId: number, data: any) => {
    try {
        const response = await apiClient.put('/dpr-supervisor/pmag/update', { entryId, data });
        return response.data;
    } catch (error) {
        return handleApiError(error, 'Failed to update entry');
    }
};

export const pushEntryToP6 = async (entryId: number) => {
    try {
        const response = await apiClient.post('/dpr-supervisor/pmag-push-to-p6', { entryId });
        return response.data;
    } catch (error) {
        return handleApiError(error, 'Failed to push entry to P6');
    }
};

// --- Common ---

export const getEntryById = async (entryId: number) => {
    try {
        const response = await apiClient.get<DPREntry>(`/dpr-supervisor/entry/${entryId}`);
        return response.data;
    } catch (error) {
        return handleApiError(error, 'Failed to fetch entry');
    }
};
