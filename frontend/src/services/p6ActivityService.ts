// src/services/p6ActivityService.ts
// Service to fetch P6 activities - Uses EXACT P6 API field names (camelCase)

import apiClient from './apiClient';

// ============================================================================
// INTERFACES - EXACT P6 API field names
// ============================================================================

export interface P6Activity {
    // Core - exact P6 names
    activityObjectId: number;
    activityId: string | null;
    slNo: number;
    name: string | null;
    status: string | null;

    // Dates - exact P6 names
    plannedStartDate: string | null;
    plannedFinishDate: string | null;
    actualStartDate: string | null;
    actualFinishDate: string | null;
    forecastFinishDate: string | null;

    // From resourceAssignments - exact P6 names
    targetQty: number | null;
    actualQty: number | null;
    remainingQty: number | null;
    actualUnits: number | null;
    remainingUnits: number | null;

    // Calculated: (actualQty / targetQty) * 100
    percentComplete: number | null;

    // From resources - exact P6 names
    contractorName: string | null;
    unitOfMeasure: string | null;
    resourceType: string | null;

    // WBS
    wbsObjectId: number | null;
    wbsName: string | null;
    wbsCode: string | null;

    // WBS UDFs
    blockCapacity: number | null;
    spvNumber: string | null;
    block: string | null;
    phase: string | null;

    // Activity UDFs
    scope: string | null;
    front: string | null;
    remarks: string | null;
    holdDueToWTG: string | null;

    // Activity Codes
    priority: string | null;
    plot: string | null;
    newBlockNom: string | null;

    // Local editable
    cumulative?: string;
    yesterday?: string;
    today?: string;
    yesterdayIsApproved?: boolean;
}

export interface PaginationInfo {
    page: number;
    limit: number;
    totalCount: number;
    totalPages: number;
    hasMore: boolean;
}

export interface P6ActivitiesResponse {
    success: boolean;
    projectObjectId: number;
    totalCount: number;
    page: number;
    limit: number;
    totalPages: number;
    activities: P6Activity[];
    pagination?: PaginationInfo;
}

export interface DPQtyResponse {
    success: boolean;
    projectObjectId: number;
    count: number;
    data: P6Activity[];
}

// ============================================================================
// API FUNCTIONS
// ============================================================================

export const getP6ActivitiesPaginated = async (
    projectObjectId: number | string,
    page: number = 1,
    limit: number = 100
): Promise<P6ActivitiesResponse> => {
    try {
        const response = await apiClient.get<any>(
            `/dpr-activities/activities/${projectObjectId}?page=${page}&limit=${limit}`
        );

        const data = response.data;

        const pagination: PaginationInfo = {
            page: data.page,
            limit: data.limit,
            totalCount: data.totalCount,
            totalPages: data.totalPages,
            hasMore: data.page < data.totalPages
        };

        // Map directly - no transformation needed since backend uses same names
        const activities: P6Activity[] = data.activities.map((a: any, index: number) => ({
            activityObjectId: a.activityObjectId,
            activityId: a.activityId,
            slNo: index + 1 + ((page - 1) * limit),
            name: a.name,
            status: a.status,

            // Dates
            plannedStartDate: formatDate(a.plannedStartDate),
            plannedFinishDate: formatDate(a.plannedFinishDate),
            actualStartDate: formatDate(a.actualStartDate),
            actualFinishDate: formatDate(a.actualFinishDate),
            forecastFinishDate: formatDate(a.forecastFinishDate),

            // From resourceAssignments
            targetQty: parseNumber(a.targetQty),
            actualQty: parseNumber(a.actualQty),
            remainingQty: parseNumber(a.remainingQty),
            actualUnits: parseNumber(a.actualUnits),
            remainingUnits: parseNumber(a.remainingUnits),

            // Calculated
            percentComplete: parseNumber(a.percentComplete),

            // From resources
            contractorName: a.contractorName || null,
            unitOfMeasure: a.unitOfMeasure || null,
            resourceType: a.resourceType || null,

            // WBS
            wbsObjectId: a.wbsObjectId || null,
            wbsName: a.wbsName || null,
            wbsCode: a.wbsCode || null,

            // WBS UDFs
            blockCapacity: parseNumber(a.blockCapacity),
            spvNumber: a.spvNumber || null,
            block: a.block || null,
            phase: a.phase || null,

            // Activity UDFs
            scope: a.scope || null,
            front: a.front || null,
            remarks: a.remarks || null,
            holdDueToWTG: a.holdDueToWTG || null,

            // Activity Codes
            priority: a.priority || null,
            plot: a.plot || null,
            newBlockNom: a.newBlockNom || null
        }));

        console.log(`Fetched ${activities.length} P6 activities for project ${projectObjectId}`);

        return { ...data, activities, pagination };
    } catch (error) {
        console.error('Error fetching P6 activities:', error);
        throw error;
    }
};

export interface P6Resource {
    object_id: number;
    resource_id: string;
    name: string;
    resource_type: string;
    unitOfMeasure?: string;
    total_units?: number;
    actual_units?: number;
    units?: number; // Fallback
    total?: number; // Fallback
}

export const getResources = async (projectObjectId: number | string): Promise<P6Resource[]> => {
    try {
        const response = await apiClient.get<{ resources: any[] }>(`/oracle-p6/resources/${projectObjectId}`);
        return response.data.resources || [];
    } catch (error) {
        console.error('Error fetching resources:', error);
        return [];
    }
};

export const getDPQtyActivities = async (projectObjectId: number | string): Promise<DPQtyResponse> => {
    try {
        const response = await apiClient.get<any>(`/dpr-activities/dp-qty/${projectObjectId}`);
        const data = response.data;

        const activities: P6Activity[] = data.data.map((a: any, index: number) => ({
            activityObjectId: a.activityObjectId,
            activityId: a.activityId,
            slNo: index + 1,
            name: a.name,
            status: a.status,
            plannedStartDate: a.plannedStartDate,
            plannedFinishDate: a.plannedFinishDate,
            actualStartDate: a.actualStartDate,
            actualFinishDate: a.actualFinishDate,
            forecastFinishDate: a.forecastFinishDate,
            targetQty: a.targetQty,
            actualQty: a.actualQty,
            remainingQty: a.remainingQty,
            actualUnits: null,
            remainingUnits: null,
            percentComplete: a.percentComplete,
            contractorName: a.contractorName,
            unitOfMeasure: a.unitOfMeasure,
            resourceType: null,
            wbsObjectId: null,
            wbsName: null,
            wbsCode: null,
            blockCapacity: null,
            spvNumber: null,
            block: null,
            phase: null,
            scope: null,
            front: null,
            remarks: null,
            holdDueToWTG: null,
            priority: null,
            plot: null,
            newBlockNom: null
        }));

        return { success: data.success, projectObjectId: data.projectObjectId, count: data.count, data: activities };
    } catch (error) {
        console.error('Error fetching DP Qty activities:', error);
        throw error;
    }
};

export const getP6ActivitiesForProject = async (projectObjectId: number | string): Promise<P6Activity[]> => {
    const response = await getP6ActivitiesPaginated(projectObjectId, 1, 100);
    return response.activities;
};

export const getSyncStatus = async () => {
    const response = await apiClient.get('/dpr-activities/sync-status');
    return response.data;
};

export const syncP6Data = async (projectObjectId: number | string): Promise<void> => {
    await apiClient.post('/oracle-p6/sync', { projectId: projectObjectId });
};

export const syncGlobalResources = async (): Promise<any> => {
    return apiClient.post<any>('/oracle-p6/sync-resources', {});
};

export const getResourcesForProject = async (projectObjectId: number | string): Promise<any[]> => {
    try {
        const response = await apiClient.get<any>(`/oracle-p6/resources/${projectObjectId}`);
        return response.data.resources || [];
    } catch (error) {
        return [];
    }
};

// ============================================================================
// MAPPING FUNCTIONS
// ============================================================================

export const mapActivitiesToDPQty = (activities: P6Activity[]) => {
    return activities.map((a, index) => ({
        activityId: a.activityId || "", // Crucial for merging saved data
        slNo: String(index + 1),
        description: a.name || "", // Mapped from name
        totalQuantity: a.targetQty !== null ? String(a.targetQty) : "", // Mapped from targetQty
        uom: a.unitOfMeasure || "", // Mapped from unitOfMeasure
        balance: "", // Calculated field
        basePlanStart: a.plannedStartDate ? a.plannedStartDate.split('T')[0] : "", // Mapped from plannedStartDate
        basePlanFinish: a.plannedFinishDate ? a.plannedFinishDate.split('T')[0] : "", // Mapped from plannedFinishDate
        forecastStart: a.plannedStartDate ? a.plannedStartDate.split('T')[0] : "", // Using planned as forecast init
        forecastFinish: a.forecastFinishDate ? a.forecastFinishDate.split('T')[0] : (a.plannedFinishDate ? a.plannedFinishDate.split('T')[0] : ""),
        actualStart: a.actualStartDate ? a.actualStartDate.split('T')[0] : "",
        actualFinish: a.actualFinishDate ? a.actualFinishDate.split('T')[0] : "",
        percentComplete: a.percentComplete !== null ? String(a.percentComplete) : "",
        remarks: a.remarks || "",
        cumulative: a.cumulative || "",
        yesterday: a.yesterday || "",
        yesterdayIsApproved: a.yesterdayIsApproved,
        today: a.today || ""
    }));
};

export const mapActivitiesToDPBlock = (activities: P6Activity[]) => {
    return activities.map((a) => ({
        activityId: a.activityId || "",
        activities: a.name || "", // Mapped from name
        blockCapacity: a.blockCapacity || "",
        phase: a.phase || "",
        block: a.block || "",
        spvNumber: a.spvNumber || "",
        priority: a.priority || "",
        scope: a.scope || "",
        hold: a.holdDueToWTG || "", // Mapped from holdDueToWTG
        front: a.front || "",
        completed: a.actualQty !== null ? String(a.actualQty) : "",
        balance: a.remainingQty !== null ? String(a.remainingQty) : "",

        // Date mapping
        baselineStartDate: a.plannedStartDate ? a.plannedStartDate.split('T')[0] : "",
        baselineEndDate: a.plannedFinishDate ? a.plannedFinishDate.split('T')[0] : "",
        actualStartDate: a.actualStartDate ? a.actualStartDate.split('T')[0] : "",
        actualFinishDate: a.actualFinishDate ? a.actualFinishDate.split('T')[0] : "",
        forecastStartDate: a.plannedStartDate ? a.plannedStartDate.split('T')[0] : "",
        forecastFinishDate: a.forecastFinishDate ? a.forecastFinishDate.split('T')[0] : (a.plannedFinishDate ? a.plannedFinishDate.split('T')[0] : ""),
        yesterdayIsApproved: a.yesterdayIsApproved
    }));
};

export const mapActivitiesToDPVendorBlock = (activities: P6Activity[]) => {
    return activities.map((a) => ({
        activityId: a.activityId || "",
        activities: a.name || "", // Mapped from name
        plot: a.plot || "",
        newBlockNom: a.newBlockNom || "",
        priority: a.priority || "",
        baselinePriority: a.priority || "", // Default to priority if baseline not available
        contractorName: a.contractorName || "",
        scope: a.scope || "",
        holdDueToWtg: a.holdDueToWTG || "", // Case fix
        front: a.front || "",
        actual: a.actualQty !== null ? String(a.actualQty) : "",
        completionPercentage: a.percentComplete !== null ? String(a.percentComplete) : "",
        remarks: a.remarks || "",
        yesterdayValue: a.yesterday || "",
        yesterdayIsApproved: a.yesterdayIsApproved,
        todayValue: a.today || ""
    }));
};

export const mapActivitiesToManpowerDetails = (activities: P6Activity[]) => {
    return activities
        .filter(a => a.resourceType === 'Labor' || a.resourceType === 'Nonlabor') // Include relevant resources
        .map((a, index) => ({
            slNo: String(index + 1),
            activityId: a.activityId || "",
            block: a.block || "",
            contractorName: a.contractorName || "",
            activity: a.name || "", // Mapped from name
            section: "", // Not directly in P6 activity, maybe UDF?
            yesterdayValue: a.yesterday || "",
            yesterdayIsApproved: a.yesterdayIsApproved,
            todayValue: a.today || ""
        }));
};

export const mapActivitiesToDPVendorIdt = (activities: P6Activity[]) => {
    return activities.map((a) => ({
        activityId: a.activityId || "",
        activities: a.name || "", // Mapped from name
        plot: a.plot || "",
        newBlockNom: a.newBlockNom || "",
        baselinePriority: a.priority || "",
        scope: a.scope || "",
        front: a.front || "",
        priority: a.priority || "",
        contractorName: a.contractorName || "",
        remarks: a.remarks || "",
        holdDueToWtg: a.holdDueToWTG || "", // Case fix
        actual: a.actualQty !== null ? String(a.actualQty) : "",
        completionPercentage: a.percentComplete !== null ? String(a.percentComplete) : "",
        yesterdayValue: a.yesterday || "",
        yesterdayIsApproved: a.yesterdayIsApproved,
        todayValue: a.today || ""
    }));
};

export const mapResourcesToTable = (resources: P6Resource[]) => {
    return resources.map((r) => ({
        typeOfMachine: r.name || "", // Map 'name' to 'typeOfMachine'
        total: "", // Calculated from yesterday + today
        yesterday: "",
        today: "",
        remarks: ""
    }));
};

// ============================================================================
// HELPERS
// ============================================================================

function formatDate(dateValue: string | null): string | null {
    if (!dateValue) return null;
    try {
        return dateValue.split('T')[0];
    } catch {
        return null;
    }
}

function parseNumber(value: any): number | null {
    if (value === null || value === undefined) return null;
    const parsed = parseFloat(value);
    return isNaN(parsed) ? null : parsed;
}

// ============================================================================
// YESTERDAY VALUES
// ============================================================================

export interface YesterdayValuesResponse {
    success: boolean;
    yesterdayDate: string;
    activities: Array<{
        activityObjectId: number;
        activityId: string;
        name: string;
        yesterdayValue: number;
        cumulativeValue: number;
        is_approved: boolean; // Tells us whether the value came from P6 push or a draft
    }>;
    count: number;
}

export const getYesterdayValues = async (projectObjectId?: number | string, targetDate?: string): Promise<YesterdayValuesResponse> => {
    try {
        const queryParams = new URLSearchParams();
        if (projectObjectId) queryParams.append('projectObjectId', String(projectObjectId));
        if (targetDate) queryParams.append('targetDate', targetDate);

        const params = queryParams.toString() ? `?${queryParams.toString()}` : '';
        const response = await apiClient.get<YesterdayValuesResponse>(`/oracle-p6/yesterday-values${params}`);
        return response.data;
    } catch (error) {
        return { success: false, yesterdayDate: '', activities: [], count: 0 };
    }
};
