/**
 * Service for DPR-level custom activities.
 * These activities are tracked within the DPR application only — never pushed to P6.
 */

import apiClient from './apiClient';

export interface CustomActivity {
    id: number;
    activityId: string;
    description: string;
    uom: string;
    scope: string;
    completed: string;
    cumulative: string;
    balance: string;
    wbsName: string;
    category: string;
    block: string;
    plannedStart: string;
    plannedFinish: string;
    actualStart: string;
    actualFinish: string;
    status: string;
    remarks: string;
    sortOrder: number;
    source: 'custom';
    isCustom: true;
    planTillDate: string;
    actualTillDate: string;
}

export interface CustomActivityCreatePayload {
    projectId: number | string;
    sheetType: string;
    description: string;
    uom?: string;
    scope?: number;
    cumulative?: number;
    wbsName?: string;
    category?: string;
    block?: string;
    plannedStart?: string;
    plannedFinish?: string;
    actualStart?: string;
    actualFinish?: string;
    status?: string;
    remarks?: string;
    sortOrder?: number;
    extraData?: Record<string, any>;
}

export interface CustomActivityUpdatePayload {
    description?: string;
    uom?: string;
    scope?: number;
    cumulative?: number;
    wbsName?: string;
    category?: string;
    block?: string;
    plannedStart?: string;
    plannedFinish?: string;
    actualStart?: string;
    actualFinish?: string;
    status?: string;
    remarks?: string;
    sortOrder?: number;
    extraData?: Record<string, any>;
}

/**
 * Fetch all custom activities for a project/sheet.
 */
export const getCustomActivities = async (
    projectId: number | string,
    sheetType?: string
): Promise<CustomActivity[]> => {
    try {
        const params: Record<string, string> = { projectId: String(projectId) };
        if (sheetType) params.sheetType = sheetType;
        const response = await apiClient.get<any>('/custom-activities', { params });
        return response.data.data || [];
    } catch (error) {
        console.error('Error fetching custom activities:', error);
        return [];
    }
};

/**
 * Create a new custom activity.
 */
export const createCustomActivity = async (
    payload: CustomActivityCreatePayload
): Promise<CustomActivity | null> => {
    try {
        const response = await apiClient.post<any>('/custom-activities', payload);
        return response.data.activity || null;
    } catch (error) {
        console.error('Error creating custom activity:', error);
        throw error;
    }
};

/**
 * Update an existing custom activity.
 */
export const updateCustomActivity = async (
    activityId: number,
    payload: CustomActivityUpdatePayload
): Promise<CustomActivity | null> => {
    try {
        const response = await apiClient.put<any>(`/custom-activities/${activityId}`, payload);
        return response.data.activity || null;
    } catch (error) {
        console.error('Error updating custom activity:', error);
        throw error;
    }
};

/**
 * Soft-delete a custom activity.
 */
export const deleteCustomActivity = async (activityId: number): Promise<boolean> => {
    try {
        await apiClient.delete(`/custom-activities/${activityId}`);
        return true;
    } catch (error) {
        console.error('Error deleting custom activity:', error);
        throw error;
    }
};

/**
 * Bulk-create custom activities.
 */
export const bulkCreateCustomActivities = async (
    projectId: number | string,
    sheetType: string,
    activities: Partial<CustomActivityCreatePayload>[]
): Promise<CustomActivity[]> => {
    try {
        const response = await apiClient.post<any>('/custom-activities/bulk', {
            projectId,
            sheetType,
            activities
        });
        return response.data.data || [];
    } catch (error) {
        console.error('Error bulk creating custom activities:', error);
        throw error;
    }
};
