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
    forecastStartDate: string | null;
    forecastFinishDate: string | null;
    baselineStartDate: string | null;
    baselineFinishDate: string | null;


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
    plot: string | null;
    newBlockNom: string | null;
    priority: string | null;
    holdDueToWTG: string | null;
    front: string | null;
    scope?: string | number | null;
    weightage?: number | string | null;

    // Values from DB / calculated
    balance?: string;
    cumulative?: string | number | null;
    yesterday?: string;
    today?: string;
    yesterdayIsApproved?: boolean;
    remarks?: string | null;
    _cellStatuses?: Record<string, any>;
    selectedResourceId?: string;
    resourceId?: string;
}

// ============================================================================
// Activity Filter Lists for Solar Restructuring
// ============================================================================
export let DC_SIDE_ACTIVITIES = [
    "Piling - MMS (Marking, Auguring & Concreting)",
    "Pile Capping",
    "Piling - LT Cable Hanger System",
    "Piling - Inverters",
    "Piling - Robotic Docking System",
    "Array Earthing",
    "MMS Erection - Torque Tube/Raftar",
    "MMS Erection - Transmission Shaft/Bracing",
    "MMS Erection - Purlin",
    "MMS - RFI Completion",
    "Module Installation",
    "Module - RFI Completion",
    "DC Cable Laying",
    "Module Interconnection & MC4 Termination",
    "VOC Testing",
    "Robotic Structure - Docking Station Installation",
    "Robotic Structure - Reverse Station Installation",
    "Robotic Structure - Bridges Installation",
    "Robot Installation"
];

export let AC_SIDE_ACTIVITIES = [
    "IDT Foundation Up To Rail",
    "IDT Foundation Up To Plinth",
    "HT & LT Station - Slab",
    "HT LT Station - Staircase",
    "HT & LT Station - Shed Installation",
    "HT & LT Station - Sheeting Installation",
    "IDT Foundation - Grade Slab Casting & Dyke Wall",
    "NIFPS Foundation",
    "BOT Foundation",
    "Aux Transformer Foundation",
    "IDT Area - Fencing",
    "IDT Area - Gate Installation",
    "IDT Area - Gravel Filling",
    "Cable Hanger - Structure & Messenger Wire Erection",
    "LT Cable Laying",
    "HT Cable Laying",
    "FO Cable Laying",
    "Control Cable Laying",
    "HT Panel Erection",
    "LT Panel Erection",
    "IDT Erection",
    "Inverter Installation",
    "SCADA & SACU Installation",
    "ACDB Installation",
    "Aux Transformer - Installation",
    "NIFPS - Installation",
    "HT Cable Terminations - IDT Side",
    "LT Cable Terminations - LT Panel To IDT",
    "LT Cable Terminations - Inverter To LT Panel",
    "LT Cable Terminations - IDT Side",
    "LT Cable Terminations - Inverter Side"
];

export let TEST_COMM_ACTIVITIES = [
    "IDT Filtration",
    "IDT Testing",
    "HT Panel Testing",
    "LT Panel Testing",
    "Inspection Offer To Asset Commissioning Team",
    "Punch Point Identification By Asset Commissioning Team",
    "Punch Point Rectification And Pre Charging Sign Off",
    "CEA Application",
    "CEA Inspection",
    "CEA Compliance & Approval",
    "First Time Charging - Application",
    "First Time Charging - Approval",
    "First Time Charging",
    "Robot Commissioning - SCADA",
    "Trial Operation",
    "Trial Run Certificate",
    "COD"
];

export const setDynamicMasterLists = (lists: Record<string, string[]>) => {
    if (lists.dc_sheet && Array.isArray(lists.dc_sheet) && lists.dc_sheet.length > 0) {
        DC_SIDE_ACTIVITIES = lists.dc_sheet;
    }
    if (lists.ac_sheet && Array.isArray(lists.ac_sheet) && lists.ac_sheet.length > 0) {
        AC_SIDE_ACTIVITIES = lists.ac_sheet;
    }
    if (lists.testing_commissioning && Array.isArray(lists.testing_commissioning) && lists.testing_commissioning.length > 0) {
        TEST_COMM_ACTIVITIES = lists.testing_commissioning;
    }
};

// Parent WBS node name patterns — used to locate the root of each section in the WBS tree.
// Activities are then found by walking the WBS subtree below these parents.
export const SWITCHYARD_WBS_PATTERNS = [
    "SWITCHYARD (400kV)",
    "SWITCHYARD (220kV)",
    "SWITCHYARD CONSTRUCTION",
    "SWITCHYARD CIVIL",
    "SWITCHYARD EPC"
];

export const TRANS_LINE_WBS_PATTERNS = [
    "TRANSMISSION LINE"
];

export const INFRA_WORKS_WBS_PATTERNS = [
    "INFRA WORKS"
];

// WBS tree node from the backend
export interface WbsNode {
    objectId: number;
    name: string;
    code: string;
    parentObjectId: number | null;
    projectObjectId: number;
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
    limit: number = 5000
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
            forecastStartDate: formatDate(a.forecastStartDate),
            forecastFinishDate: formatDate(a.forecastFinishDate),
            baselineStartDate: formatDate(a.baselineStartDate),
            baselineFinishDate: formatDate(a.baselineFinishDate),

            // From resourceAssignments - prefer targetQty/cumulative/balance from backend
            targetQty: parseNumber(a.targetQty ?? a.total_quantity ?? a.scope),
            actualQty: parseNumber(a.actualQty ?? a.cumulative),
            remainingQty: parseNumber(a.remainingQty ?? a.balance),
            actualUnits: parseNumber(a.actualUnits ?? a.actual_units),
            remainingUnits: parseNumber(a.remainingUnits ?? a.remaining_units),

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
            newBlockNom: a.newBlockNom || null,
            weightage: parseNumber(a.weightage),

            // Values from DB
            balance: a.balance !== null && a.balance !== undefined ? String(a.balance) : "",
            cumulative: a.cumulative !== null && a.cumulative !== undefined ? String(a.cumulative) : "",
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
            forecastStartDate: a.forecastStartDate,
            forecastFinishDate: a.forecastFinishDate,
            baselineStartDate: a.baselineStartDate,
            baselineFinishDate: a.baselineFinishDate,

            targetQty: a.targetQty,
            actualQty: a.actualQty,
            remainingQty: a.remainingQty,
            actualUnits: null,
            remainingUnits: null,
            percentComplete: a.percentComplete,
            contractorName: a.contractorName,
            unitOfMeasure: a.unitOfMeasure,
            resourceType: a.resourceType || null,
            wbsObjectId: a.wbsObjectId || null,
            wbsName: a.wbsName || null,
            wbsCode: a.wbsCode || null,
            blockCapacity: a.blockCapacity || null,
            spvNumber: a.spvNumber || null,
            block: a.block || null,
            phase: a.phase || null,
            scope: a.scope || null,
            front: a.front || null,
            remarks: a.remarks || null,
            holdDueToWTG: a.holdDueToWTG || null,
            priority: a.priority || null,
            plot: a.plot || null,
            newBlockNom: a.newBlockNom || null,
            weightage: a.weightage !== undefined ? a.weightage : null,
            balance: a.balance !== null && a.balance !== undefined ? String(a.balance) : "",
            cumulative: a.cumulative !== null && a.cumulative !== undefined ? String(a.cumulative) : "",
            yesterday: a.yesterday || "",
            today: a.today || ""
        }));

        return { success: data.success, projectObjectId: data.projectObjectId, count: data.count, data: activities };
    } catch (error) {
        console.error('Error fetching DP Qty activities:', error);
        throw error;
    }
};

export interface WindProgressResponse {
    success: boolean;
    projectObjectId: string | number;
    dataDate?: string | null;
    count: number;
    data: any[];
    filters: {
        locations: string[];
        activityGroups: string[];
        substations: string[];
        spvs: string[];
    };
}

export const getWindProgressActivities = async (projectObjectId: number | string, targetDate?: string): Promise<WindProgressResponse> => {
    try {
        const response = await apiClient.get<WindProgressResponse>(`/dpr-activities/wind-progress/${projectObjectId}`);
        return response.data;
    } catch (error) {
        console.error('Error fetching wind progress activities:', error);
        throw error;
    }
};

export const getP6ActivitiesForProject = async (projectObjectId: number | string): Promise<P6Activity[]> => {
    // Increase limit to 5000 to ensure we get all activities for the project
    const response = await getP6ActivitiesPaginated(projectObjectId, 1, 5000);
    return response.activities;
};

export const getWindAchievements = async (projectObjectId: number | string) => {
    try {
        const response = await apiClient.get(`/oracle-p6/wind-achievements/${projectObjectId}`);
        return response.data;
    } catch (error) {
        console.error('Error fetching wind achievements:', error);
        return {
            months: [],
            rigs: {},
            gangs: {},
            cranes: {},
            commissioning: {}
        };
    }
};

export const saveWindAchievements = async (projectObjectId: number | string, data: any) => {
    try {
        const response = await apiClient.post(`/oracle-p6/wind-achievements/${projectObjectId}`, data);
        return response.data;
    } catch (error) {
        console.error('Error saving wind achievements:', error);
        throw error;
    }
};

export const getWindPSSData = async (projectObjectId: number | string): Promise<any[]> => {
    try {
        const response = await apiClient.get<any>(`/oracle-p6/wind-pss-data/${projectObjectId}`);
        return response.data.data;
    } catch (error) {
        console.error('Error fetching wind PSS data:', error);
        return [];
    }
};

export const getPSSProgressData = async (projectObjectId: number | string): Promise<{ data: any[]; groups: any[] }> => {
    try {
        const response = await apiClient.get<any>(`/oracle-p6/pss-progress-data/${projectObjectId}`);
        return { data: response.data.data || [], groups: response.data.groups || [] };
    } catch (error) {
        console.error('Error fetching PSS progress data:', error);
        return { data: [], groups: [] };
    }
};

export const getPSSCivilPebData = async (projectObjectId: number | string): Promise<{ data: any[]; groups: any[] }> => {
    try {
        const response = await apiClient.get<any>(`/oracle-p6/pss-civil-peb-data/${projectObjectId}`);
        return { data: response.data.data || [], groups: response.data.groups || [] };
    } catch (error) {
        console.error('Error fetching PSS Civil & PEB data:', error);
        return { data: [], groups: [] };
    }
};

export const getPSSElectricalData = async (projectObjectId: number | string): Promise<{ data: any[]; groups: any[] }> => {
    try {
        const response = await apiClient.get<any>(`/oracle-p6/pss-electrical-data/${projectObjectId}`);
        return { data: response.data.data || [], groups: response.data.groups || [] };
    } catch (error) {
        console.error('Error fetching PSS Electrical data:', error);
        return { data: [], groups: [] };
    }
};

export const getPSSTransmissionVisualData = async (projectObjectId: number | string): Promise<any[]> => {
    try {
        const response = await apiClient.get<any>(`/oracle-p6/pss-transmission-visual/${projectObjectId}`);
        return response.data.data || [];
    } catch (error) {
        console.error('Error fetching PSS Transmission Visual data:', error);
        return [];
    }
};

export const getWind33KVData = async (projectObjectId: number | string): Promise<any[]> => {
    try {
        const response = await apiClient.get<any>(`/oracle-p6/wind-33kv-data/${projectObjectId}`);
        return response.data.data;
    } catch (error) {
        console.error('Error fetching wind 33KV data:', error);
        return [];
    }
};

export const getWindEHVData = async (projectObjectId: number | string): Promise<any[]> => {
    try {
        const response = await apiClient.get<any>(`/oracle-p6/wind-ehv-data/${projectObjectId}`);
        // Map the backend fields to 'scope' and 'completed' as expected by the frontend table logic
        return response.data.data.map((row: any) => ({
            ...row,
            scope: row.planTillDate,
            completed: row.actualTillDate
        }));
    } catch (error) {
        console.error('Error fetching wind EHV data:', error);
        return [];
    }
};

export const getSyncStatus = async (projectObjectId?: string | number) => {
    if (projectObjectId) {
        const response = await apiClient.get(`/oracle-p6/sync-status/${projectObjectId}`);
        return response.data;
    }
    const response = await apiClient.get('/dpr-activities/sync-status');
    return response.data;
};



export const checkP6PasswordExpired = async (): Promise<boolean> => {
    try {
        const response = await apiClient.get('/oracle-p6/password-status');
        if (response.data && response.data.daysLeft !== null && response.data.daysLeft <= 0) {
            alert("Oracle P6 password has expired. Integrations will fail until updated.");
            return true;
        }
        return false;
    } catch (error) {
        console.error('Error checking P6 password status:', error);
        return false;
    }
};

export const syncP6Data = async (projectObjectId: number | string): Promise<void> => {
    if (await checkP6PasswordExpired()) {
        throw new Error("P6_EXPIRED");
    }
    await apiClient.post('/oracle-p6/sync', { projectId: projectObjectId });
};

export const syncNewProjects = async (): Promise<any> => {
    if (await checkP6PasswordExpired()) {
        throw new Error("P6_EXPIRED");
    }
    return apiClient.post<any>('/oracle-p6/sync-new-projects', {});
};

export const syncGlobalResources = async (): Promise<any> => {
    if (await checkP6PasswordExpired()) {
        throw new Error("P6_EXPIRED");
    }
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

export interface ActivityResource {
    raObjectId: number;
    resourceId: string;
    resourceName: string;
    plannedUnits: number;
    actualUnits: number;
    remainingUnits: number;
    actualStart?: string;
    actualFinish?: string;
}

/**
 * Fetch all Material resource assignments for a project, grouped by activity_id.
 * Returns a map: { [activityId: string]: ActivityResource[] }
 */
export const getActivityMaterialResources = async (
    projectObjectId: number | string
): Promise<Record<string, ActivityResource[]>> => {
    try {
        const response = await apiClient.get<any>(`/oracle-p6/activity-resources/${projectObjectId}`);
        return response.data.resourcesByActivity || {};
    } catch (error) {
        console.error('Error fetching activity material resources:', error);
        return {};
    }
};


// ============================================================================
// MAPPING FUNCTIONS
// ============================================================================

export const mapActivitiesToDPQty = (activities: P6Activity[]) => {
    return activities.map((a, index) => ({
        activityId: a.activityId || "", // Crucial for merging saved data
        activityObjectId: a.activityObjectId,
        slNo: String(index + 1),
        description: a.name || "", // Mapped from name
        status: a.status || "Not Started",
        totalQuantity: (a.targetQty || a.scope) ? String(a.targetQty || a.scope) : "",
        uom: a.unitOfMeasure || "", // Mapped from unitOfMeasure
        balance: (a.remainingQty || a.balance) ? String(a.remainingQty || a.balance) : "",
        basePlanStart: a.baselineStartDate ? a.baselineStartDate.split('T')[0] : "",
        basePlanFinish: a.baselineFinishDate ? a.baselineFinishDate.split('T')[0] : "",

        forecastStart: (a as any).forecastStart ? (a as any).forecastStart.split('T')[0] : (a.forecastStartDate ? a.forecastStartDate.split('T')[0] : ""),
        forecastFinish: (a as any).forecastFinish ? (a as any).forecastFinish.split('T')[0] : (a.forecastFinishDate ? a.forecastFinishDate.split('T')[0] : ""),
        actualStart: (a as any).actualStart ? (a as any).actualStart.split('T')[0] : (a.actualStartDate ? a.actualStartDate.split('T')[0] : ""),
        actualFinish: (a as any).actualFinish ? (a as any).actualFinish.split('T')[0] : (a.actualFinishDate ? a.actualFinishDate.split('T')[0] : ""),
        percentComplete: (() => {
            const pc = a.percentComplete;
            if (pc === null || pc === undefined) return "";
            const num = typeof pc === 'number' ? pc : parseFloat(pc);
            if (isNaN(num)) return "";
            return num === 100 ? "100.00%" : (num.toFixed(2) + "%");
        })(),
        remarks: a.remarks || "",
        cumulative: (a.actualQty || a.cumulative) ? String(a.actualQty || a.cumulative) : "",
        block: (extractBlockName(a.name || "") || a.block || a.newBlockNom || a.plot || "").toUpperCase(),
        weightage: a.weightage !== null && a.weightage !== undefined ? String(a.weightage) : "",
        yesterdayValue: (a as any).yesterdayValue !== undefined ? String((a as any).yesterdayValue) : (a.yesterday || ""),
        yesterdayIsApproved: a.yesterdayIsApproved,
        todayValue: (a as any).todayValue !== undefined ? String((a as any).todayValue) : (a.today || ""),
        _cellStatuses: a._cellStatuses || {},
            historyValues: (a as any).historyValues || {}
    }));
};

/**
 * Strips block prefix from activity description.
 * E.g. "Block-01 - Piling - MMS (Marking, Auguring & Concreting)" â†’ "Piling - MMS (Marking, Auguring & Concreting)"
 * Also handles "Block-01-Piling..." or "Block 01 - Piling..." patterns.
 */
export const extractActivityName = (description: string): string => {
    if (!description) return "";
    // Match patterns like "Block-01 - ", "Block-01-", "Block 01 - ", "Block-1 - " etc.
    const blockPrefixRegex = /^Block[-\s]*\d+\s*[-\u2013\u2014]?\s*/i;
    let name = description.replace(blockPrefixRegex, "").trim();
    
    // Normalize en-dashes and em-dashes to standard hyphens
    name = name.replace(/[\u2013\u2014]/g, '-');
    
    // Normalize spaces around hyphens to ensure consistent matching (e.g., "A-B" -> "A - B")
    name = name.replace(/\s*-\s*/g, ' - ');
    
    // Fix common P6 typos
    name = name.replace(/Instalaltion/gi, 'Installation');
    
    // Normalize multiple spaces to a single space
    return name.replace(/\s+/g, ' ').trim();
};

/**
 * Sorts a Map of grouped activities by the order defined in a reference activity array.
 * Activities not in the reference array are placed at the end.
 */
const sortGroupsByDefinedOrder = <T>(groupMap: Map<string, T[]>, activityOrder: string[]): Map<string, T[]> => {
    const sorted = new Map<string, T[]>();
    
    // Create a space-free, case-insensitive map of the keys in groupMap for quick lookup
    const normalizedKeyToOriginalKey = new Map<string, string>();
    for (const key of groupMap.keys()) {
        normalizedKeyToOriginalKey.set(key.toLowerCase().replace(/\s+/g, ''), key);
    }

    // First, add entries in the defined order
    for (const actName of activityOrder) {
        const normActName = actName.toLowerCase().replace(/\s+/g, '');
        if (normalizedKeyToOriginalKey.has(normActName)) {
            const originalKey = normalizedKeyToOriginalKey.get(normActName)!;
            // Use original key from DB so we display whatever the DB has
            sorted.set(originalKey, groupMap.get(originalKey)!);
        }
    }
    
    // Then add any remaining entries not in the defined order
    groupMap.forEach((val, key) => {
        let found = false;
        const normKey = key.toLowerCase().replace(/\s+/g, '');
        for (const sortedKey of sorted.keys()) {
            if (sortedKey.toLowerCase().replace(/\s+/g, '') === normKey) {
                found = true;
                break;
            }
        }
        if (!found) {
            sorted.set(key, val);
        }
    });
    return sorted;
};

/**
 * Extracts block name from activity description.
 * E.g. "Block-01 - ACDB Installation" â†’ "Block-01"
 */
export const extractBlockName = (name: string): string => {
    if (!name) return "";
    // Match patterns like "Block-01", "Block 01", "Block-1" etc. at the start
    const match = name.match(/^(Block[-\s]*\d+)/i);
    return match ? match[1].trim().toUpperCase() : "";
};

/**
 * Helper to get the earliest (min) date string from an array of date strings.
 */
const minDate = (dates: string[]): string => {
    const valid = dates.filter(d => d && d !== "");
    if (valid.length === 0) return "";
    return valid.sort()[0]; // ISO date strings sort lexicographically
};

/**
 * Helper to get the latest (max) date string from an array of date strings.
 */
const maxDate = (dates: string[]): string => {
    const valid = dates.filter(d => d && d !== "");
    if (valid.length === 0) return "";
    return valid.sort().reverse()[0];
};

/**
 * Aggregates DP Qty rows by activity name (stripping block prefix).
 * Groups activities like "Block-01 - Piling..." and "Block-02 - Piling..." into a single row "Piling...".
 * 
 * Returns the SAME shape as mapActivitiesToDPQty so the original DPQtyTable works unchanged.
 * 
 * Aggregation rules:
 * - UOM: from first activity (same for all blocks)
 * - Scope (totalQuantity): SUM
 * - Completed (cumulative): SUM
 * - Balance: Scope - Completed
 * - Weightage: SUM
 * - Baseline Start: MIN date
 * - Baseline Finish: MAX date
 * - Forecast Start: MIN date
 * - Forecast Finish: MAX date
 * - Actual Start: MIN date
 * - Actual Finish: MAX date
 * - Yesterday: SUM
 * - Today: SUM
 */
export const aggregateDPQtyByActivityName = (rows: ReturnType<typeof mapActivitiesToDPQty>): ReturnType<typeof mapActivitiesToDPQty> => {
    if (!rows || rows.length === 0) return rows;

    // Group by cleaned activity name
    const rawGroupMap = new Map<string, typeof rows>();

    rows.forEach(row => {
        const cleanName = extractActivityName(row.description);
        if (!rawGroupMap.has(cleanName)) {
            rawGroupMap.set(cleanName, []);
        }
        rawGroupMap.get(cleanName)!.push(row);
    });

    // Sort groups by the combined defined activity order
    const allActivitiesOrder = [...DC_SIDE_ACTIVITIES, ...AC_SIDE_ACTIVITIES, ...TEST_COMM_ACTIVITIES];
    const groupMap = sortGroupsByDefinedOrder(rawGroupMap, allActivitiesOrder);

    // Aggregate each group - return same shape as mapActivitiesToDPQty
    const result: ReturnType<typeof mapActivitiesToDPQty> = [];
    let slNo = 1;

    groupMap.forEach((groupRows, cleanName) => {
        const totalQty = groupRows.reduce((sum, r) => sum + (Number(r.totalQuantity) || 0), 0);
        const totalCumulative = groupRows.reduce((sum, r) => sum + (Number(r.cumulative) || 0), 0);
        const totalWeightage = groupRows.reduce((sum, r) => sum + (Number(r.weightage) || 0), 0);
        const totalYesterday = groupRows.reduce((sum, r) => sum + (Number(r.yesterdayValue) || 0), 0);
        const totalToday = groupRows.reduce((sum, r) => sum + (Number(r.todayValue) || 0), 0);
        
        const aggregatedHistory: Record<string, string> = {};
        groupRows.forEach(r => {
            if (r.historyValues) {
                Object.keys(r.historyValues).forEach(k => {
                    const val = Number(r.historyValues![k]) || 0;
                    if (val > 0) {
                        aggregatedHistory[k] = String((Number(aggregatedHistory[k]) || 0) + val);
                    }
                });
            }
        });

        const balance = totalQty - totalCumulative;

        result.push({
            activityId: groupRows[0].activityId,  // use first activity's ID for merge compatibility
            activityObjectId: groupRows[0].activityObjectId,
            slNo: String(slNo++),
            description: cleanName,
            status: groupRows[0].status || "Not Started",
            totalQuantity: totalQty ? String(totalQty) : "",
            uom: groupRows[0].uom || "",
            balance: String(balance),
            basePlanStart: minDate(groupRows.map(r => r.basePlanStart)),
            basePlanFinish: maxDate(groupRows.map(r => r.basePlanFinish)),

            forecastStart: minDate(groupRows.map(r => r.forecastStart)),
            forecastFinish: maxDate(groupRows.map(r => r.forecastFinish)),
            actualStart: minDate(groupRows.map(r => r.actualStart)),
            actualFinish: maxDate(groupRows.map(r => r.actualFinish)),
            percentComplete: "",
            remarks: groupRows.map(r => r.remarks).filter(r => r).join("; "),
            cumulative: totalCumulative ? String(totalCumulative) : "",
            block: "",  // grouped across blocks
            weightage: totalWeightage ? String(totalWeightage) : "",
            yesterdayValue: totalYesterday ? String(totalYesterday) : "",
            yesterdayIsApproved: groupRows.every(r => r.yesterdayIsApproved !== false),
            todayValue: totalToday ? String(totalToday) : "",
            _cellStatuses: {},
            historyValues: aggregatedHistory,
        });
    });

    return result;
};

export const mapActivitiesToDPBlock = (activities: P6Activity[]) => {
    return activities.map((a) => ({
        activityId: a.activityId || "",
        activityObjectId: a.activityObjectId,
        activities: a.name || "", // Mapped from name
        status: a.status || "Not Started",
        blockCapacity: a.blockCapacity !== null && a.blockCapacity !== undefined ? String(a.blockCapacity) : "",
        phase: a.phase || "",
        block: (extractBlockName(a.name || "") || a.block || a.newBlockNom || a.plot || "").toUpperCase(),
        spvNumber: a.spvNumber || "",
        priority: a.priority || "",
        scope: (a.targetQty || a.scope) ? String(a.targetQty || a.scope) : "",
        hold: a.holdDueToWTG || "", // Mapped from holdDueToWTG
        front: a.front || "",
        completed: (a.actualQty || a.cumulative) ? String(a.actualQty || a.cumulative) : "",
        balance: (a.remainingQty || a.balance) ? String(a.remainingQty || a.balance) : "",

        // Date mapping - use baseline/forecast from P6 sync
        basePlanStart: a.baselineStartDate ? a.baselineStartDate.split('T')[0] : "",
        basePlanFinish: a.baselineFinishDate ? a.baselineFinishDate.split('T')[0] : "",

        actualStartDate: (a as any).actualStart ? (a as any).actualStart.split('T')[0] : (a.actualStartDate ? a.actualStartDate.split('T')[0] : ""),
        actualFinishDate: (a as any).actualFinish ? (a as any).actualFinish.split('T')[0] : (a.actualFinishDate ? a.actualFinishDate.split('T')[0] : ""),
        forecastStartDate: (a as any).forecastStart ? (a as any).forecastStart.split('T')[0] : (a.forecastStartDate ? a.forecastStartDate.split('T')[0] : ""),
        forecastFinishDate: (a as any).forecastFinish ? (a as any).forecastFinish.split('T')[0] : (a.forecastFinishDate ? a.forecastFinishDate.split('T')[0] : ""),
        yesterdayIsApproved: a.yesterdayIsApproved,
        _cellStatuses: a._cellStatuses || {},
            historyValues: (a as any).historyValues || {}
    }));
};

export const mapActivitiesToACSheet = (activities: P6Activity[]) => {
    // AC Side filtering
    return activities
        .filter(a => {
            const wbs = (a.wbsName || "").toUpperCase();
            if (wbs.includes("AC SIDE") || wbs.includes("AC-SIDE")) return true;
            
            const cleanName = extractActivityName(a.name || "").toLowerCase().replace(/\s+/g, '');
            return AC_SIDE_ACTIVITIES.some(act => act.toLowerCase().replace(/\s+/g, '') === cleanName);
        })
        .map((a) => {
            const scopeRaw = a.targetQty ?? a.scope ?? "";
            const actualRaw = a.actualQty ?? a.cumulative ?? "";
            const scope = scopeRaw.toString();
            const actual = actualRaw.toString();
            const balance = String((Number(scope) || 0) - (Number(actual) || 0));

            return {
                activityId: a.activityId || "",
                activityObjectId: a.activityObjectId,
                description: a.name || "", // Standardized name
                status: a.status || "Not Started",
                plot: a.plot || "",
                block: (a.block || a.newBlockNom || a.plot || extractBlockName(a.name || "")).toUpperCase(),
                newBlockNom: a.newBlockNom || "",
                priority: a.priority || "",
                baselinePriority: a.priority || "", // Default to priority if baseline not available
                contractorName: a.contractorName || "",
                uom: a.unitOfMeasure || "",
                scope: scope ? String(scope) : "",
                holdDueToWtg: a.holdDueToWTG || "", // Case fix
                front: a.front || "",
                actual: actual ? String(actual) : "",
                balance: String(balance),
                completionPercentage: (() => {
                    const pc = a.percentComplete;
                    if (pc === null || pc === undefined) return "";
                    const num = typeof pc === 'number' ? pc : parseFloat(pc);
                    if (isNaN(num)) return "";
                    return num === 100 ? "100.00%" : (num.toFixed(2) + "%");
                })(),
                remarks: a.remarks || "",
                basePlanStart: a.baselineStartDate ? a.baselineStartDate.split('T')[0] : "",
                basePlanFinish: a.baselineFinishDate ? a.baselineFinishDate.split('T')[0] : "",

                forecastStart: (a as any).forecastStart ? (a as any).forecastStart.split('T')[0] : (a.forecastStartDate ? a.forecastStartDate.split('T')[0] : ""),
                forecastFinish: (a as any).forecastFinish ? (a as any).forecastFinish.split('T')[0] : (a.forecastFinishDate ? a.forecastFinishDate.split('T')[0] : ""),
                actualStart: (a as any).actualStart ? (a as any).actualStart.split('T')[0] : (a.actualStartDate ? a.actualStartDate.split('T')[0] : ""),
                actualFinish: (a as any).actualFinish ? (a as any).actualFinish.split('T')[0] : (a.actualFinishDate ? a.actualFinishDate.split('T')[0] : ""),
                yesterdayValue: (a as any).yesterdayValue !== undefined ? String((a as any).yesterdayValue) : (a.yesterday || ""),
                yesterdayIsApproved: a.yesterdayIsApproved,
                todayValue: (a as any).todayValue !== undefined ? String((a as any).todayValue) : (a.today || ""),
                selectedResourceId: a.selectedResourceId || "",
                _cellStatuses: a._cellStatuses || {},
            historyValues: (a as any).historyValues || {}
            };
        });
};

export const getManpowerDetailsData = async (projectObjectId: number | string): Promise<any[]> => {
    try {
        const response = await apiClient.get<any>(`/oracle-p6/manpower-details-data?projectId=${projectObjectId}`);
        return response.data.data;
    } catch (error) {
        console.error('Error fetching manpower details:', error);
        return [];
    }
};

export const getManpowerTimephasedData = async (projectObjectId: number | string, entryDate?: string): Promise<any[]> => {
    try {
        const url = `/oracle-p6/manpower-timephased-data?projectId=${projectObjectId}${entryDate ? `&entryDate=${entryDate}` : ''}`;
        const response = await apiClient.get<any>(url);
        return response.data.data;
    } catch (error) {
        console.error('Error fetching manpower timephased data:', error);
        return [];
    }
};

/**
 * Groups Manpower rows by activity name (stripping block prefix)
 * and inserts a summary heading row (#FADFAD) for each group.
 * Same pattern as aggregateVendorIdtByActivityName.
 */
export const aggregateManpowerByActivityName = (rows: any[]) => {
    if (!rows || rows.length === 0) return rows;

    // Group by cleaned activity name
    const rawGroupMap = new Map<string, any[]>();
    rows.forEach(row => {
        const cleanName = extractActivityName(row.description || row.activity || '');
        if (!rawGroupMap.has(cleanName)) {
            rawGroupMap.set(cleanName, []);
        }
        rawGroupMap.get(cleanName)!.push(row);
    });

    // Sort groups by the combined defined activity order (DC â†’ AC â†’ T&C)
    const allActivitiesOrder = [...DC_SIDE_ACTIVITIES, ...AC_SIDE_ACTIVITIES, ...TEST_COMM_ACTIVITIES];
    const groupMap = sortGroupsByDefinedOrder(rawGroupMap, allActivitiesOrder);

    const result: any[] = [];
    groupMap.forEach((groupRows, cleanName) => {
        // Create Category Heading Row with sums â€” same fields as Vendor IDT
        const totalBudgeted = groupRows.reduce((sum, r) => sum + (Number(r.budgetedUnits) || 0), 0);
        const totalActual = groupRows.reduce((sum, r) => sum + (Number(r.actualUnits) || 0), 0);
        const totalRemaining = groupRows.reduce((sum, r) => sum + (Number(r.remainingUnits) || 0), 0);
        const totalYesterday = groupRows.reduce((sum, r) => sum + (Number(r.yesterdayValue) || 0), 0);
        const totalToday = groupRows.reduce((sum, r) => sum + (Number(r.todayValue) || 0), 0);
        const pctComplete = totalBudgeted > 0 ? ((totalActual / totalBudgeted) * 100).toFixed(2) + '%' : '0.00%';

        // Aggregate dynamic timephased keys (actual_YYYY-MM-DD, contractor_YYYY-MM-DD, required_YYYY-MM-DD)
        const dailyActuals: Record<string, string> = {};
        const dailyContractors: Record<string, string> = {};
        const dailyRequired: Record<string, string> = {};
        const allKeys = new Set<string>();
        groupRows.forEach(r => Object.keys(r).forEach(k => allKeys.add(k)));
        allKeys.forEach(k => {
            if (k.startsWith('actual_')) {
                const sum = groupRows.reduce((s, r) => s + (Number(r[k]) || 0), 0);
                dailyActuals[k] = String(sum);
            }
            if (k.startsWith('contractor_')) {
                dailyContractors[k] = '';
            }
            if (k.startsWith('required_')) {
                const hasValue = groupRows.some(r => r[k] !== undefined && r[k] !== '' && r[k] !== null);
                if (hasValue) {
                    const sum = groupRows.reduce((s, r) => s + (Number(r[k]) || 0), 0);
                    dailyRequired[k] = String(sum);
                } else {
                    dailyRequired[k] = '';
                }
            }
        });

        result.push({
            isCategoryRow: true,
            activityId: '',
            description: cleanName,
            category: cleanName,
            block: '',
            budgetedUnits: String(totalBudgeted),
            actualUnits: String(totalActual),
            remainingUnits: String(totalRemaining),
            percentComplete: pctComplete,
            yesterdayValue: String(totalYesterday),
            todayValue: String(totalToday),
            ...dailyActuals,
            ...dailyContractors,
            ...dailyRequired,
            yesterdayIsApproved: groupRows.every(r => r.yesterdayIsApproved !== false)
        });

        // Add matching activities below the heading
        result.push(...groupRows);
    });

    return result;
};

export const mapActivitiesToDCSheet = (activities: P6Activity[]) => {
    // DC Side filtering
    return activities
        .filter(a => {
            const wbs = (a.wbsName || "").toUpperCase();
            if (wbs.includes("DC SIDE") || wbs.includes("DC-SIDE")) return true;

            const cleanName = extractActivityName(a.name || "").toLowerCase().replace(/\s+/g, '');
            return DC_SIDE_ACTIVITIES.some(act => act.toLowerCase().replace(/\s+/g, '') === cleanName);
        })
        .map((a) => {
            const scopeRaw = a.targetQty ?? a.scope ?? "";
            const actualRaw = a.actualQty ?? a.cumulative ?? "";
            const scope = scopeRaw.toString();
            const actual = actualRaw.toString();
            const balance = String((Number(scope) || 0) - (Number(actual) || 0));

            return {
                activityId: a.activityId || "",
                activityObjectId: a.activityObjectId,
                description: a.name || "", // Standardized name
                status: a.status || "Not Started",
                plot: a.plot || "",
                block: (extractBlockName(a.name || "") || a.block || a.newBlockNom || a.plot || "").toUpperCase(),
                newBlockNom: a.newBlockNom || "",
                baselinePriority: a.priority || "",
                scope: scope ? String(scope) : "",
                uom: a.unitOfMeasure || "",
                front: a.front || "",
                priority: a.priority || "",
                contractorName: a.contractorName || "",
                remarks: a.remarks || "",
                holdDueToWtg: a.holdDueToWTG || "",
                actual: actual ? String(actual) : "",
                balance: String(balance),
                basePlanStart: a.baselineStartDate ? a.baselineStartDate.split('T')[0] : "",
                basePlanFinish: a.baselineFinishDate ? a.baselineFinishDate.split('T')[0] : "",

                forecastStart: (a as any).forecastStart ? String((a as any).forecastStart).split('T')[0] : (a.forecastStartDate ? String(a.forecastStartDate).split('T')[0] : ""),
                forecastFinish: (a as any).forecastFinish ? String((a as any).forecastFinish).split('T')[0] : (a.forecastFinishDate ? String(a.forecastFinishDate).split('T')[0] : ""),
                actualStart: (a as any).actualStart ? String((a as any).actualStart).split('T')[0] : (a.actualStartDate ? String(a.actualStartDate).split('T')[0] : ""),
                actualFinish: (a as any).actualFinish ? String((a as any).actualFinish).split('T')[0] : (a.actualFinishDate ? String(a.actualFinishDate).split('T')[0] : ""),
                completionPercentage: (() => {
                    const pc = a.percentComplete;
                    if (pc === null || pc === undefined) return "";
                    const num = typeof pc === 'number' ? pc : parseFloat(pc);
                    if (isNaN(num)) return "";
                    return num === 100 ? "100.00%" : (num.toFixed(2) + "%");
                })(),
                yesterdayValue: (a as any).yesterdayValue !== undefined ? String((a as any).yesterdayValue) : (a.yesterday || ""),
                yesterdayIsApproved: a.yesterdayIsApproved,
                todayValue: (a as any).todayValue !== undefined ? String((a as any).todayValue) : (a.today || ""),
                selectedResourceId: a.selectedResourceId || "",
                _cellStatuses: a._cellStatuses || {},
            historyValues: (a as any).historyValues || {}
            };
        });
};

export const mapActivitiesToTestingComm = (activities: P6Activity[]) => {
    // Testing & Commissioning filtering
    return activities
        .filter(a => {
            const wbs = (a.wbsName || "").toUpperCase();
            if (wbs.includes("TESTING") || wbs.includes("COMMISSIONING")) return true;

            const cleanName = extractActivityName(a.name || "").toLowerCase().replace(/\s+/g, '');
            return TEST_COMM_ACTIVITIES.some(act => act.toLowerCase().replace(/\s+/g, '') === cleanName);
        })
        .map((a) => {
            const scopeRaw = a.targetQty ?? a.scope ?? "";
            const actualRaw = a.actualQty ?? a.cumulative ?? "";
            const scope = scopeRaw.toString();
            const actual = actualRaw.toString();
            const balance = String((Number(scope) || 0) - (Number(actual) || 0));

            return {
                activityId: a.activityId || "",
                activityObjectId: a.activityObjectId,
                description: a.name || "", // Standardized name
                plot: a.plot || "",
                block: (extractBlockName(a.name || "") || a.block || a.newBlockNom || a.plot || "").toUpperCase(),
                newBlockNom: a.newBlockNom || "",
                baselinePriority: a.priority || "",
                scope: scope ? String(scope) : "",
                uom: a.unitOfMeasure || "",
                front: a.front || "",
                priority: a.priority || "",
                contractorName: a.contractorName || "",
                remarks: a.remarks || "",
                holdDueToWtg: a.holdDueToWTG || "",
                actual: actual ? String(actual) : "",
                balance: String(balance),
                basePlanStart: a.baselineStartDate ? a.baselineStartDate.split('T')[0] : "",
                basePlanFinish: a.baselineFinishDate ? a.baselineFinishDate.split('T')[0] : "",

                forecastStart: (a as any).forecastStart ? String((a as any).forecastStart).split('T')[0] : (a.forecastStartDate ? String(a.forecastStartDate).split('T')[0] : ""),
                forecastFinish: (a as any).forecastFinish ? String((a as any).forecastFinish).split('T')[0] : (a.forecastFinishDate ? String(a.forecastFinishDate).split('T')[0] : ""),
                actualStart: (a as any).actualStart ? String((a as any).actualStart).split('T')[0] : (a.actualStartDate ? String(a.actualStartDate).split('T')[0] : ""),
                actualFinish: (a as any).actualFinish ? String((a as any).actualFinish).split('T')[0] : (a.actualFinishDate ? String(a.actualFinishDate).split('T')[0] : ""),
                completionPercentage: (() => {
                    const pc = a.percentComplete;
                    if (pc === null || pc === undefined) return "";
                    const num = typeof pc === 'number' ? pc : parseFloat(pc);
                    if (isNaN(num)) return "";
                    return num === 100 ? "100.00%" : (num.toFixed(2) + "%");
                })(),
                yesterdayValue: (a as any).yesterdayValue !== undefined ? String((a as any).yesterdayValue) : (a.yesterday || ""),
                yesterdayIsApproved: a.yesterdayIsApproved,
                todayValue: (a as any).todayValue !== undefined ? String((a as any).todayValue) : (a.today || ""),
                _cellStatuses: a._cellStatuses || {},
            historyValues: (a as any).historyValues || {}
            };
        });
};

/**
 * Groups Testing & Commissioning rows by activity name (stripping block prefix)
 * and inserts a summary heading row (#FADFAD) for each group.
 * Sorted by the defined TEST_COMM_ACTIVITIES order.
 */
export const aggregateTestingCommByActivityName = (rows: ReturnType<typeof mapActivitiesToTestingComm>) => {
    if (!rows || rows.length === 0) return rows;

    // Group by cleaned activity name
    const rawGroupMap = new Map<string, typeof rows>();
    rows.forEach(row => {
        const cleanName = extractActivityName(row.description || '');
        if (!rawGroupMap.has(cleanName)) {
            rawGroupMap.set(cleanName, []);
        }
        rawGroupMap.get(cleanName)!.push(row);
    });

    // Sort groups by the defined TEST_COMM_ACTIVITIES order
    const groupMap = sortGroupsByDefinedOrder(rawGroupMap, TEST_COMM_ACTIVITIES);

    const result: any[] = [];
    groupMap.forEach((groupRows, cleanName) => {
        // Create Category Heading Row with sums
        const totalScope = groupRows.reduce((sum, r) => sum + (Number(r.scope) || 0), 0);
        const totalActual = groupRows.reduce((sum, r) => sum + (Number(r.actual) || 0), 0);
        const totalYesterday = groupRows.reduce((sum, r) => sum + (Number(r.yesterdayValue) || 0), 0);
        const totalToday = groupRows.reduce((sum, r) => sum + (Number(r.todayValue) || 0), 0);
        const balance = totalScope - totalActual;

        result.push({
            isCategoryRow: true,
            activityId: "",
            description: cleanName,
            category: cleanName,
            plot: "",
            block: "",
            newBlockNom: "",
            priority: "",
            baselinePriority: "",
            contractorName: "",
            uom: groupRows[0].uom || "",
            scope: String(totalScope),
            holdDueToWtg: "",
            front: "",
            actual: String(totalActual),
            balance: String(balance),
            completionPercentage: "",
            remarks: "",
            basePlanStart: minDate(groupRows.map(r => r.basePlanStart)),
            basePlanFinish: maxDate(groupRows.map(r => r.basePlanFinish)),
            forecastStart: minDate(groupRows.map(r => r.forecastStart)),
            forecastFinish: maxDate(groupRows.map(r => r.forecastFinish)),
            actualStart: minDate(groupRows.map(r => r.actualStart)),
            actualFinish: maxDate(groupRows.map(r => r.actualFinish)),
            yesterdayValue: String(totalYesterday),
            todayValue: String(totalToday),
            yesterdayIsApproved: groupRows.every(r => r.yesterdayIsApproved !== false)
        });

        // Add matching activities below the heading
        result.push(...groupRows);
    });

    return result;
};

/**
 * Groups Vendor IDT rows by activity name (stripping block prefix)
 * and inserts a summary heading row (#FADFAD) for each group.
 */
export const aggregateVendorIdtByActivityName = (rows: ReturnType<typeof mapActivitiesToDCSheet>) => {
    if (!rows || rows.length === 0) return rows;

    // Group by cleaned activity name
    const rawGroupMap = new Map<string, typeof rows>();
    rows.forEach(row => {
        const cleanName = extractActivityName(row.description || '');
        if (!rawGroupMap.has(cleanName)) {
            rawGroupMap.set(cleanName, []);
        }
        rawGroupMap.get(cleanName)!.push(row);
    });

    // Sort groups by the defined DC_SIDE_ACTIVITIES order
    const groupMap = sortGroupsByDefinedOrder(rawGroupMap, DC_SIDE_ACTIVITIES);

    const result: any[] = [];
    groupMap.forEach((groupRows, cleanName) => {
        // Create Category Heading Row with sums
        const totalScope = groupRows.reduce((sum, r) => sum + (Number(r.scope) || 0), 0);
        const totalActual = groupRows.reduce((sum, r) => sum + (Number(r.actual) || 0), 0);
        const totalYesterday = groupRows.reduce((sum, r) => sum + (Number(r.yesterdayValue) || 0), 0);
        const totalToday = groupRows.reduce((sum, r) => sum + (Number(r.todayValue) || 0), 0);
        const balance = totalScope - totalActual;

        result.push({
            isCategoryRow: true,
            activityId: "", // Heading row has no activity ID
            description: cleanName,
            category: cleanName,
            block: "",
            priority: "",
            contractorName: "",
            uom: groupRows[0].uom || "",
            scope: String(totalScope),
            actual: String(totalActual),
            balance: String(balance),
            basePlanStart: minDate(groupRows.map(r => r.basePlanStart)),
            basePlanFinish: maxDate(groupRows.map(r => r.basePlanFinish)),

            forecastStart: minDate(groupRows.map(r => r.forecastStart)),
            forecastFinish: maxDate(groupRows.map(r => r.forecastFinish)),
            actualStart: minDate(groupRows.map(r => r.actualStart)),
            actualFinish: maxDate(groupRows.map(r => r.actualFinish)),
            yesterdayValue: String(totalYesterday),
            todayValue: String(totalToday),
            yesterdayIsApproved: groupRows.every(r => r.yesterdayIsApproved !== false)
        });

        // Add matching activities below the heading
        result.push(...groupRows);
    });

    return result;
};

/**
 * Groups Vendor Block rows by activity name (stripping block prefix)
 * and inserts a summary heading row (#FADFAD) for each group.
 * Same pattern as aggregateVendorIdtByActivityName.
 */
export const aggregateVendorBlockByActivityName = (rows: ReturnType<typeof mapActivitiesToACSheet>) => {
    if (!rows || rows.length === 0) return rows;

    // Group by cleaned activity name
    const rawGroupMap = new Map<string, typeof rows>();
    rows.forEach(row => {
        const cleanName = extractActivityName(row.description || '');
        if (!rawGroupMap.has(cleanName)) {
            rawGroupMap.set(cleanName, []);
        }
        rawGroupMap.get(cleanName)!.push(row);
    });

    // Sort groups by the defined AC_SIDE_ACTIVITIES order
    const groupMap = sortGroupsByDefinedOrder(rawGroupMap, AC_SIDE_ACTIVITIES);

    const result: any[] = [];
    groupMap.forEach((groupRows, cleanName) => {
        // Create Category Heading Row with sums
        const totalScope = groupRows.reduce((sum, r) => sum + (Number(r.scope) || 0), 0);
        const totalActual = groupRows.reduce((sum, r) => sum + (Number(r.actual) || 0), 0);
        const totalYesterday = groupRows.reduce((sum, r) => sum + (Number(r.yesterdayValue) || 0), 0);
        const totalToday = groupRows.reduce((sum, r) => sum + (Number(r.todayValue) || 0), 0);
        const balance = totalScope - totalActual;

        result.push({
            isCategoryRow: true,
            activityId: "", // Heading row has no activity ID
            description: cleanName,
            category: cleanName,
            plot: "",
            block: "",
            newBlockNom: "",
            priority: "",
            baselinePriority: "",
            contractorName: "",
            uom: groupRows[0].uom || "",
            scope: String(totalScope),
            holdDueToWtg: "",
            front: "",
            actual: String(totalActual),
            balance: String(balance),
            completionPercentage: "",
            remarks: "",
            basePlanStart: minDate(groupRows.map(r => r.basePlanStart)),
            basePlanFinish: maxDate(groupRows.map(r => r.basePlanFinish)),

            forecastStart: minDate(groupRows.map(r => r.forecastStart)),
            forecastFinish: maxDate(groupRows.map(r => r.forecastFinish)),
            actualStart: minDate(groupRows.map(r => r.actualStart)),
            actualFinish: maxDate(groupRows.map(r => r.actualFinish)),
            yesterdayValue: String(totalYesterday),
            todayValue: String(totalToday),
            yesterdayIsApproved: groupRows.every(r => r.yesterdayIsApproved !== false)
        });

        // Add matching activities below the heading
        result.push(...groupRows);
    });

    return result;
};

const MACHINERY_TYPES = [
    "DTH",
    "Augur",
    "Tractor Trolley",
    "Ajax",
    "Farana /Crane",
    "DG Set",
    "JCB/Excavator",
    "Manlifter",
    "Other resource"
];

export const mapResourcesToTable = (resources: P6Resource[]) => {
    // Return a default initialized state for the custom Machinery table
    const rows: any[] = [];
    
    // Add "Total" block
    MACHINERY_TYPES.forEach((machine, i) => {
        rows.push({
            id: `total_${i}`,
            contractorIndex: i === 0 ? "Total" : "",
            contractorName: i === 0 ? "Total" : "",
            typeOfMachine: machine,
            uom: "Nos",
            yesterday: "",
            today: "",
            remarks: "",
            isCategoryRow: true
        });
    });

    // Add initial Contractor block
    MACHINERY_TYPES.forEach((machine, i) => {
        rows.push({
            id: `c1_${i}`,
            contractorIndex: i === 0 ? "1" : "",
            contractorName: "",
            typeOfMachine: machine,
            uom: "Nos",
            yesterday: "",
            today: "",
            remarks: "",
            isCategoryRow: false,
            contractorId: "c1"
        });
    });
    
    return rows;
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
        activityId: string | number;
        stringActivityId?: string;
        name: string;
        yesterdayValue: number;
        cumulativeValue: number;
        is_approved: boolean; // Tells us whether the value came from P6 push or a draft
        sheetType?: string; // Isolates historical data
    }>;
    count: number;
}

export const getYesterdayValues = async (projectObjectId?: number | string, targetDate?: string, sheetType?: string): Promise<YesterdayValuesResponse> => {
    try {
        const queryParams = new URLSearchParams();
        if (projectObjectId) queryParams.append('projectObjectId', String(projectObjectId));
        if (targetDate) queryParams.append('targetDate', targetDate);
        if (sheetType) queryParams.append('sheet_type', sheetType);

        const params = queryParams.toString() ? `?${queryParams.toString()}` : '';
        const response = await apiClient.get<YesterdayValuesResponse>(`/oracle-p6/yesterday-values${params}`);
        return response.data;
    } catch (error) {
        return { success: false, yesterdayDate: '', activities: [], count: 0 };
    }
};
// ============================================================================
// WIND SUMMARY CALCULATIONS
// ============================================================================

export const extractActivityBaseWind = (desc: string) => {
  if (!desc) return 'Other';
  
  let cleanDesc = desc.trim();
  if (cleanDesc.toUpperCase() === 'WTG SCOD' || cleanDesc.toUpperCase() === 'WTG COD') {
      return 'WTG COD';
  }
  
  // Match common wind naming patterns: 
    // 1. Location-Group-Task (e.g., WTG01-CW-Excavation)
    // 2. Location-Task (e.g., WTG01-Excavation)
    const match = desc.match(/^(?:WTG\d+|[A-Z\d]+)-(?:CW|EL|TC|ER|PSS|USS|TC|ELE|ERE|ERECTION|COMM)[-_](.+)$/i) ||
        desc.match(/^(?:WTG\d+|[A-Z\d]+)[-_](.+)$/i);

    if (match) {
        // Clean up: replace underscores with spaces, trim
        return match[1].replace(/_/g, ' ').trim();
    }
    return desc.trim();
};

export const getDerivedWindSummary = (windProgressData: any[]) => {
    if (!Array.isArray(windProgressData) || windProgressData.length === 0) return [];

    const masterGroups = [
        {
            name: 'CIVIL WORKS',
            color: '#D1E9FF',
            activities: [
                'Stone column', 'Approach Road', 'Excavation', 'PCC', 'Steel Binding',
                'Raft Casting', 'Grouting', 'WTG earthing', 'Curing', 'Ready for Erection',
                'USS precast Installation', 'Road Construction (For WTG Erection)', 'Crane pad Construction'
            ]
        },
        {
            name: 'WTG ERECTION WORKS (ERW)',
            color: '#F0D1FF',
            activities: ['WTG Erection', 'WTG MCC', 'WTG Pre-commissioning']
        },
        {
            name: 'ELECTRICAL WORKS',
            color: '#FFF4D1',
            activities: ['HT Cable Laying & Termination', 'USS Erection', 'USS Earthing', 'USS Testing', 'USS CFT']
        },
        {
            name: 'TESTING & COMMISSIONING',
            color: '#D1FFD7',
            activities: [
                'CEIG Approval', 'FTC Approval', '33kV Feeder Charging', 'USS charging',
                'WTG Commissioning', 'WTG Trial Run', 'WTG COD'
            ]
        }
    ];

    const stats: Record<string, {
        scope: number;
        achieved: number;
        weeklyPlan: number;
        weeklyAchieved: number;
        monthlyPlan: number;
        monthlyAchieved: number;
    }> = {};

    const parseDateHelper = (dStr: string) => {
        if (!dStr || dStr === '-' || dStr === '0') return null;
        // Check for ISO format
        if (dStr.includes('T')) return new Date(dStr);
        if (/^\d{4}-\d{2}-\d{2}$/.test(dStr)) return new Date(dStr);

        const parts = dStr.split('-');
        if (parts.length === 3) {
            if (parts[0].length === 4) return new Date(dStr);
            const day = parseInt(parts[0]);
            const mStr = parts[1];
            const yrShort = parseInt(parts[2]);
            const mNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
            const mIdx = mNames.indexOf(mStr);
            if (mIdx !== -1) {
                const yr = yrShort + (yrShort < 70 ? 2000 : 1900);
                return new Date(yr, mIdx, day);
            }
        }
        return null;
    };

    const today = new Date();
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - today.getDay());
    startOfWeek.setHours(0, 0, 0, 0);
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    endOfWeek.setHours(23, 59, 59, 999);

    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    startOfMonth.setHours(0, 0, 0, 0);
    const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    endOfMonth.setHours(23, 59, 59, 999);

    windProgressData.forEach(p => {
        if (p.isCategoryRow) return;
        const grp = (p.activityGroup || '').trim().toUpperCase();
        const actId = (p.activityId || '').trim().toUpperCase();
        const fullDesc = (p.description || p.name || "").trim();
        const descLower = fullDesc.toLowerCase();

        if (grp.includes('ENG') || grp.includes('PROC') || grp.includes('PM') || grp === 'PR') return;
        if (actId.includes('-ENG-') || actId.includes('-PR-') || actId.includes('-PM-')) return;
        if (descLower.includes('ordering') || descLower.includes('engineering') || descLower.includes('procurement') || descLower.startsWith('engg')) return;

        let activityName = fullDesc;

        const twoPartPrefix = fullDesc.match(/^(?:WTG\d+|[A-Z\d]+)[-_]([^-_]{1,6})[-_](.+)$/i);
        if (twoPartPrefix) {
            activityName = twoPartPrefix[2].trim();
        } else {
            const onePartPrefix = fullDesc.match(/^(?:WTG\d+)[-_](.+)$/i);
            if (onePartPrefix) {
                activityName = onePartPrefix[1].trim();
            }
        }

        const activityNameClean = activityName.replace(/\s*(?:-\s*|\()(?:FDR-?\d+|F-?\d+)(?:\))?\s*$/i, '').trim();

        let matchedName = '';
        for (const group of masterGroups) {
            const found = group.activities.find(act => {
                const masterNorm = act.toLowerCase().replace(/\s+/g, ' ').trim();
                const extractedNorm = activityNameClean.toLowerCase().replace(/\s+/g, ' ').trim();
                const fullDescNorm = fullDesc.toLowerCase().replace(/\s+/g, ' ').trim();

                if (masterNorm === 'wtg cod') {
                    if (fullDescNorm.includes('wtg scod') || fullDescNorm.includes('wtg cod') || extractedNorm === 'scod' || extractedNorm === 'cod') return true;
                }

                if (extractedNorm === masterNorm || fullDescNorm.includes(masterNorm)) return true;

                const withoutWtgMaster = masterNorm.replace(/^wtg\s+/, '');
                const withoutUssMaster = masterNorm.replace(/^uss\s+/, '');
                const without33kvMaster = masterNorm.replace(/^33kv\s+/, '');

                if (extractedNorm === withoutWtgMaster || fullDescNorm.includes(withoutWtgMaster)) {
                    if (withoutWtgMaster === 'earthing') return fullDesc.toUpperCase().includes('-CW-') || fullDesc.toUpperCase().includes(' WTG ');
                    if (withoutWtgMaster === 'erection') {
                        if (fullDescNorm.includes('road construction')) return false;
                        return fullDesc.toUpperCase().includes('-ERW-') || fullDesc.toUpperCase().includes('ERECTION WORKS');
                    }
                    return true;
                }

                if (extractedNorm === withoutUssMaster || fullDescNorm.includes(withoutUssMaster)) {
                    if (withoutUssMaster === 'earthing') return fullDesc.toUpperCase().includes('-EL-') || fullDesc.toUpperCase().includes(' USS ');
                    if (withoutUssMaster === 'erection') return fullDesc.toUpperCase().includes('-EL-') || fullDesc.toUpperCase().includes(' USS ');
                    return true;
                }

                if (extractedNorm === without33kvMaster || fullDescNorm.includes(without33kvMaster)) {
                    return true;
                }
                return false;
            });

            if (found) {
                matchedName = found;
                break;
            }
        }

        if (matchedName) {
            if (!stats[matchedName]) {
                stats[matchedName] = { scope: 0, achieved: 0, weeklyPlan: 0, weeklyAchieved: 0, monthlyPlan: 0, monthlyAchieved: 0 };
            }
            const s = stats[matchedName];
            s.scope += 1;

            // REQUIREMENT: only status === 'Completed' counts as achieved
            const isDone = p.status === 'Completed';

            if (isDone) s.achieved += 1;

            const planDate = parseDateHelper(p.baselineStart || p.plannedStart || p.baselineStartDate);
            const achDate = parseDateHelper(p.actualFinish || p.actualFinishDate);

            if (planDate && planDate >= startOfWeek && planDate <= endOfWeek) s.weeklyPlan += 1;
            if (achDate && achDate >= startOfWeek && achDate <= endOfWeek) s.weeklyAchieved += 1;
            if (planDate && planDate >= startOfMonth && planDate <= endOfMonth) s.monthlyPlan += 1;
            if (achDate && achDate >= startOfMonth && achDate <= endOfMonth) s.monthlyAchieved += 1;
        }
    });

    const finalResult: any[] = [];
    masterGroups.forEach(g => {
        if (g.activities.length >= 2) {
            finalResult.push({ isCategoryRow: true, description: g.name, backgroundColor: g.color });
        }
        g.activities.forEach(actName => {
            const s = stats[actName] || { scope: 0, achieved: 0, weeklyPlan: 0, weeklyAchieved: 0, monthlyPlan: 0, monthlyAchieved: 0 };
            finalResult.push({
                description: actName,
                scope: String(s.scope),
                achieved: String(s.achieved),
                balance: String(Math.max(0, s.scope - s.achieved)),
                weeklyPlan: String(s.weeklyPlan),
                weeklyAchieved: String(s.weeklyAchieved),
                weeklyBalance: String(Math.max(0, s.weeklyPlan - s.weeklyAchieved)),
                cumulativePlan: String(s.monthlyPlan),
                cumulativeAchieved: String(s.monthlyAchieved),
                cumulativeBalance: String(Math.max(0, s.monthlyPlan - s.monthlyAchieved)),
            });
        });
    });
    return finalResult;
};

// ============================================================================
// WBS HIERARCHY-BASED SHEET FUNCTIONS (Switchyard, Transmission Line, Infra)
// ============================================================================

/**
 * Fetch WBS tree for a project from the backend.
 */
export const getWbsTree = async (projectObjectId: number | string): Promise<WbsNode[]> => {
    try {
        const response = await apiClient.get<any>(`/dpr-activities/wbs-tree/${projectObjectId}`);
        return response.data.wbs || [];
    } catch (error) {
        console.error('Error fetching WBS tree:', error);
        return [];
    }
};

/**
 * Given a WBS tree, finds all WBS nodes whose name matches any of the given patterns.
 * Then recursively collects ALL descendant WBS object IDs.
 * Returns a Set of descendant WBS objectIds (NOT including the matched parents themselves,
 * since activities typically belong to child WBS nodes, not the parent container).
 *
 * Also returns a map of childWbsId â†’ parentWbsName for the immediate children,
 * which is used for section grouping/headings.
 */
export const getWbsDescendantIds = (
    wbsTree: WbsNode[],
    patterns: string[]
): { descendantIds: Set<number>; childToParent: Map<number, string> } => {
    // Build parentâ†’children lookup
    const childrenOf = new Map<number, WbsNode[]>();
    const nodeById = new Map<number, WbsNode>();
    wbsTree.forEach(n => {
        nodeById.set(n.objectId, n);
        if (n.parentObjectId != null) {
            if (!childrenOf.has(n.parentObjectId)) childrenOf.set(n.parentObjectId, []);
            childrenOf.get(n.parentObjectId)!.push(n);
        }
    });

    // Find anchor/parent WBS nodes matching patterns
    const patternsUpper = patterns.map(p => p.toUpperCase());
    const anchorNodes = wbsTree.filter(n =>
        patternsUpper.some(p => (n.name || '').toUpperCase() === p)
    );

    const descendantIds = new Set<number>();
    const childToParent = new Map<number, string>();

    // Recursively collect all descendants of anchor nodes
    const collectDescendants = (parentId: number, rootAnchorName: string) => {
        const children = childrenOf.get(parentId) || [];
        for (const child of children) {
            descendantIds.add(child.objectId);
            // Map this child to the anchor parent name (for section headings)
            if (!childToParent.has(child.objectId)) {
                childToParent.set(child.objectId, rootAnchorName);
            }
            collectDescendants(child.objectId, rootAnchorName);
        }
    };

    for (const anchor of anchorNodes) {
        // Also include the anchor itself in case activities are directly under it
        descendantIds.add(anchor.objectId);
        collectDescendants(anchor.objectId, anchor.name || 'Other');
    }

    return { descendantIds, childToParent };
};

/**
 * Maps activities to a WBS-based sheet (Switchyard, Trans Line, Infra).
 * Uses the WBS hierarchy tree to find all activities whose wbsObjectId
 * falls within the subtree of the specified parent WBS patterns.
 *
 * @param activities  All project activities
 * @param wbsTree     The full WBS hierarchy for the project
 * @param patterns    Parent WBS name patterns to locate root nodes
 */
export const mapActivitiesToWbsSheet = (
    activities: P6Activity[],
    patterns: string[],
    wbsTree?: WbsNode[]
) => {
    let filtered: P6Activity[];

    if (wbsTree && wbsTree.length > 0) {
        // Hierarchy-based filtering (preferred)
        const { descendantIds } = getWbsDescendantIds(wbsTree, patterns);
        if (descendantIds.size === 0) return [];
        filtered = activities.filter(a => {
            const wbsOid = a.wbsObjectId;
            return wbsOid != null && descendantIds.has(Number(wbsOid));
        });
    } else {
        // Fallback: simple name-based filtering (legacy behavior)
        filtered = activities.filter(a => {
            const wbs = (a.wbsName || "").toUpperCase();
            return patterns.some(p => wbs.includes(p.toUpperCase()));
        });
    }

    return filtered.map((a) => {
        const scopeRaw = a.targetQty ?? a.scope ?? "";
            const actualRaw = a.actualQty ?? a.cumulative ?? "";
            const scope = scopeRaw.toString();
            const actual = actualRaw.toString();
            const balance = String((Number(scope) || 0) - (Number(actual) || 0));

        return {
            activityId: a.activityId || "",
            activityObjectId: a.activityObjectId,
            description: a.name || "",
            status: a.status || "Not Started",
            plot: a.plot || "",
            block: (a.block || a.newBlockNom || a.plot || extractBlockName(a.name || "")).toUpperCase(),
            newBlockNom: a.newBlockNom || "",
            priority: a.priority || "",
            baselinePriority: a.priority || "",
            contractorName: a.contractorName || "",
            uom: a.unitOfMeasure || "",
            scope: scope ? String(scope) : "",
            holdDueToWtg: a.holdDueToWTG || "",
            front: a.front || "",
            actual: actual ? String(actual) : "",
            balance: String(balance),
            wbsName: a.wbsName || "Other", // For grouping headings
            wbsObjectId: a.wbsObjectId,
            completionPercentage: (() => {
                const pc = a.percentComplete;
                if (pc === null || pc === undefined) return "";
                const num = typeof pc === 'number' ? pc : parseFloat(pc);
                if (isNaN(num)) return "";
                return num === 100 ? "100.00%" : (num.toFixed(2) + "%");
            })(),
            remarks: a.remarks || "",
            basePlanStart: a.baselineStartDate ? a.baselineStartDate.split('T')[0] : "",
            basePlanFinish: a.baselineFinishDate ? a.baselineFinishDate.split('T')[0] : "",

            forecastStart: (a as any).forecastStart ? String((a as any).forecastStart).split('T')[0] : (a.forecastStartDate ? String(a.forecastStartDate).split('T')[0] : ""),
            forecastFinish: (a as any).forecastFinish ? String((a as any).forecastFinish).split('T')[0] : (a.forecastFinishDate ? String(a.forecastFinishDate).split('T')[0] : ""),
            actualStart: (a as any).actualStart ? String((a as any).actualStart).split('T')[0] : (a.actualStartDate ? String(a.actualStartDate).split('T')[0] : ""),
            actualFinish: (a as any).actualFinish ? String((a as any).actualFinish).split('T')[0] : (a.actualFinishDate ? String(a.actualFinishDate).split('T')[0] : ""),
            yesterdayValue: (a as any).yesterdayValue !== undefined ? String((a as any).yesterdayValue) : (a.yesterday || ""),
            yesterdayIsApproved: a.yesterdayIsApproved,
            todayValue: (a as any).todayValue !== undefined ? String((a as any).todayValue) : (a.today || ""),
            _cellStatuses: a._cellStatuses || {},
            historyValues: (a as any).historyValues || {}
        };
    });
};

/**
 * Aggregates rows by WBS name, creating colored category heading rows.
 * Each unique wbsName becomes a heading with summed scope/actual/yesterday/today.
 */
export const aggregateByWbsName = (rows: any[]) => {
    if (!rows || rows.length === 0) return rows;

    const groupMap = new Map<string, any[]>();
    rows.forEach(row => {
        const wbs = row.wbsName || "Other";
        if (!groupMap.has(wbs)) groupMap.set(wbs, []);
        groupMap.get(wbs)!.push(row);
    });

    const result: any[] = [];
    groupMap.forEach((groupRows, wbsName) => {
        const totalScope = groupRows.reduce((sum, r) => sum + (Number(r.scope) || 0), 0);
        const totalActual = groupRows.reduce((sum, r) => sum + (Number(r.actual) || 0), 0);
        const totalYesterday = groupRows.reduce((sum, r) => sum + (Number(r.yesterdayValue) || 0), 0);
        const totalToday = groupRows.reduce((sum, r) => sum + (Number(r.todayValue) || 0), 0);
        const balance = totalScope - totalActual;

        result.push({
            isCategoryRow: true,
            activityId: '',
            description: wbsName,
            category: wbsName,
            uom: '',
            scope: String(totalScope),
            actual: String(totalActual),
            balance: String(balance),
            yesterdayValue: String(totalYesterday),
            todayValue: String(totalToday),
            yesterdayIsApproved: groupRows.every(r => r.yesterdayIsApproved !== false),
            // Date summaries
            basePlanStart: minDate(groupRows.map(r => r.basePlanStart)),
            basePlanFinish: maxDate(groupRows.map(r => r.basePlanFinish)),
            forecastStart: minDate(groupRows.map(r => r.forecastStart)),
            forecastFinish: maxDate(groupRows.map(r => r.forecastFinish)),
            actualStart: minDate(groupRows.map(r => r.actualStart)),
            actualFinish: maxDate(groupRows.map(r => r.actualFinish)),
        });

        result.push(...groupRows);
    });

    return result;
};

// ============================================================================
// E&D SHEETS DATA FETCHING
// ============================================================================

export const getEDDeliveryData = async (projectObjectId: number | string): Promise<{ data: any[]; groups: any[] }> => {
    try {
        const response = await apiClient.get<any>(`/oracle-p6/ed-delivery-data/${projectObjectId}`);
        return { data: response.data.data || [], groups: response.data.groups || [] };
    } catch (error) {
        console.error('Error fetching E&D delivery data:', error);
        return { data: [], groups: [] };
    }
};

export const getEDEngineeringData = async (projectObjectId: number | string): Promise<{ data: any[]; groups: any[] }> => {
    try {
        const response = await apiClient.get<any>(`/oracle-p6/ed-engineering-data/${projectObjectId}`);
        return { data: response.data.data || [], groups: response.data.groups || [] };
    } catch (error) {
        console.error('Error fetching E&D engineering data:', error);
        return { data: [], groups: [] };
    }
};

export const getEDOrderingData = async (projectObjectId: number | string): Promise<{ data: any[]; groups: any[] }> => {
    try {
        const response = await apiClient.get<any>(`/oracle-p6/ed-ordering-data/${projectObjectId}`);
        return { data: response.data.data || [], groups: response.data.groups || [] };
    } catch (error) {
        console.error('Error fetching E&D ordering data:', error);
        return { data: [], groups: [] };
    }
};

// ============================================================================
// BESS DATA FETCHING
// ============================================================================

export const getBessData = async (projectObjectId: number | string, category: string): Promise<{ data: any[] }> => {
    try {
        const response = await apiClient.get<any>(`/oracle-p6/bess-data/${projectObjectId}`, { params: { category } });
        return { data: response.data?.data || [] };
    } catch (error) {
        console.error(`Error fetching BESS data for category ${category}:`, error);
        return { data: [] };
    }
};

// Returns the numbered Blocks ("Block 1" .. "Block N") present in a BESS project, for the
// dashboard's Block filter dropdown.
export const getBessBlocks = async (projectObjectId: number | string): Promise<string[]> => {
    try {
        const response = await apiClient.get<any>(`/oracle-p6/bess-blocks/${projectObjectId}`);
        return response.data?.blocks || [];
    } catch (error) {
        console.error('Error fetching BESS blocks:', error);
        return [];
    }
};

export const getDerivedBessSummary = (dpQtyData: any[]) => {
    if (!Array.isArray(dpQtyData) || dpQtyData.length === 0) return [];

    const headingOrder: string[] = [];
    const byHeading = new Map<string, any[]>();

    dpQtyData.forEach((r: any) => {
      if (!r || r.isCategoryRow) return;
      const name = String(r.description || '').trim();
      if (!name) return;
      const heading = String(r.mainHeading || '').trim() || 'Other';
      if (!byHeading.has(heading)) { byHeading.set(heading, []); headingOrder.push(heading); }
      byHeading.get(heading)!.push(r);
    });

    const out: any[] = [];
    headingOrder.forEach(heading => {
      out.push({ isCategoryRow: true, activity: heading });
      byHeading.get(heading)!.forEach((r: any) => {
        out.push({
          _key: `${heading}||${r.description}`,
          activity: r.description,
          sourceSheet: r.sourceSheet,
          uom: r.uom || '',
          totalScopeQty: r.totalQuantity || '',
          completed: r.cumulative || '',
          yesterdayProgress: r.yesterdayValue || '',
          todayBasePlan: '',
          todayCatchUpPlan: '',
          todayActual: r.todayValue || '',
          cumBasePlan: '',
          cumCatchUpPlan: '',
          cumActual: r.cumulative || '',
          remarks: r.remarks || '',
        });
      });
    });
    return out;
};

export const getBessSummaryDataForModal = async (projectObjectId: number | string): Promise<any[]> => {
    try {
        const [civResp, eleResp, tstResp] = await Promise.all([
            getBessData(projectObjectId, 'civil'),
            getBessData(projectObjectId, 'electrical'),
            getBessData(projectObjectId, 'testing')
        ]);
        
        const mapWithSrc = (arr: any[], src: string) => (arr || []).map(a => ({
            ...a,
            sourceSheet: src,
            mainHeading: a.mainHeading || a.category || '',
            subHeading: a.subHeading || a.wbsName || '',
            description: a.description || a.name || ''
        }));
        
        const combined = [
            ...mapWithSrc(civResp.data, 'Civil'),
            ...mapWithSrc(eleResp.data, 'Electrical'),
            ...mapWithSrc(tstResp.data, 'Testing')
        ];
        
        const groups = new Map<string, any[]>();
        combined.forEach(act => {
            const key = `${act.mainHeading || ''}||${act.subHeading || act.description || ''}`;
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key)!.push(act);
        });
        
        const dpQtyLikeData: any[] = [];
        groups.forEach(group => {
            const first = group[0];
            const totalQty = group.reduce((s, a) => s + (Number(a.totalQuantity || a.scope || a.plannedUnits || a.planned_units) || 0), 0);
            const totalCum = group.reduce((s, a) => s + (Number(a.cumulative || a.actualUnits || a.actual_units) || 0), 0);
            
            let description = first.subHeading || first.description || '';
            const partMatch = (first.superHeading || '').match(/Part-?\s*(\d+)/i);
            if (partMatch) description = `Part-${partMatch[1]} - ${first.description || ''}`;
            
            dpQtyLikeData.push({
                description,
                mainHeading: first.mainHeading || '',
                sourceSheet: first.sourceSheet || '',
                uom: first.uom || '',
                totalQuantity: String(totalQty),
                cumulative: String(totalCum)
            });
        });
        
        return getDerivedBessSummary(dpQtyLikeData);
    } catch (err) {
        console.error('Error deriving BESS summary data for modal:', err);
        return [];
    }
};


