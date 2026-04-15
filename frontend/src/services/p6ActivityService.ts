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
}

// ============================================================================
// Activity Filter Lists for Solar Restructuring
// ============================================================================
export const DC_SIDE_ACTIVITIES = [
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

export const AC_SIDE_ACTIVITIES = [
    "IDT Foundation Up To Rail",
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
    "LT Cable Terminations - Inverter To LT Panel"
];

export const TEST_COMM_ACTIVITIES = [
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
        status: a.status || "Not Started",
        totalQuantity: (a.targetQty || a.scope) ? String(a.targetQty || a.scope) : "",
        uom: a.unitOfMeasure || "", // Mapped from unitOfMeasure
        balance: (a.remainingQty || a.balance) ? String(a.remainingQty || a.balance) : "",
        basePlanStart: a.baselineStartDate ? a.baselineStartDate.split('T')[0] : "",
        basePlanFinish: a.baselineFinishDate ? a.baselineFinishDate.split('T')[0] : "",

        forecastStart: a.forecastStartDate ? a.forecastStartDate.split('T')[0] : "",
        forecastFinish: a.forecastFinishDate ? a.forecastFinishDate.split('T')[0] : "",
        actualStart: a.actualStartDate ? a.actualStartDate.split('T')[0] : "",
        actualFinish: a.actualFinishDate ? a.actualFinishDate.split('T')[0] : "",
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
        yesterdayValue: a.yesterday || "",
        yesterdayIsApproved: a.yesterdayIsApproved,
        todayValue: a.today || "",
        _cellStatuses: a._cellStatuses || {}
    }));
};

/**
 * Strips block prefix from activity description.
 * E.g. "Block-01 - Piling - MMS (Marking, Auguring & Concreting)" → "Piling - MMS (Marking, Auguring & Concreting)"
 * Also handles "Block-01-Piling..." or "Block 01 - Piling..." patterns.
 */
export const extractActivityName = (description: string): string => {
    if (!description) return "";
    // Match patterns like "Block-01 - ", "Block-01-", "Block 01 - ", "Block-1 - " etc.
    const blockPrefixRegex = /^Block[-\s]*\d+\s*[-–]\s*/i;
    return description.replace(blockPrefixRegex, "").trim();
};

/**
 * Sorts a Map of grouped activities by the order defined in a reference activity array.
 * Activities not in the reference array are placed at the end.
 */
const sortGroupsByDefinedOrder = <T>(groupMap: Map<string, T[]>, activityOrder: string[]): Map<string, T[]> => {
    const sorted = new Map<string, T[]>();
    // First, add entries in the defined order
    for (const actName of activityOrder) {
        if (groupMap.has(actName)) {
            sorted.set(actName, groupMap.get(actName)!);
        }
    }
    // Then add any remaining entries not in the defined order
    groupMap.forEach((val, key) => {
        if (!sorted.has(key)) {
            sorted.set(key, val);
        }
    });
    return sorted;
};

/**
 * Extracts block name from activity description.
 * E.g. "Block-01 - ACDB Installation" → "Block-01"
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
        const balance = totalQty - totalCumulative;

        result.push({
            activityId: groupRows[0].activityId,  // use first activity's ID for merge compatibility
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
        });
    });

    return result;
};

export const mapActivitiesToDPBlock = (activities: P6Activity[]) => {
    return activities.map((a) => ({
        activityId: a.activityId || "",
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

        actualStartDate: a.actualStartDate ? a.actualStartDate.split('T')[0] : "",
        actualFinishDate: a.actualFinishDate ? a.actualFinishDate.split('T')[0] : "",
        forecastStartDate: a.forecastStartDate ? a.forecastStartDate.split('T')[0] : "",
        forecastFinishDate: a.forecastFinishDate ? a.forecastFinishDate.split('T')[0] : "",
        yesterdayIsApproved: a.yesterdayIsApproved,
        _cellStatuses: a._cellStatuses || {}
    }));
};

export const mapActivitiesToDPVendorBlock = (activities: P6Activity[]) => {
    // AC Side filtering
    return activities
        .filter(a => {
            const cleanName = extractActivityName(a.name || "");
            return AC_SIDE_ACTIVITIES.includes(cleanName);
        })
        .map((a) => {
            const scope = Number(a.targetQty || a.scope || 0);
            const actual = Number(a.actualQty || a.cumulative || 0);
            const balance = scope - actual;

            return {
                activityId: a.activityId || "",
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

                forecastStart: a.forecastStartDate ? a.forecastStartDate.split('T')[0] : "",
                forecastFinish: a.forecastFinishDate ? a.forecastFinishDate.split('T')[0] : "",
                actualStart: a.actualStartDate ? a.actualStartDate.split('T')[0] : "",
                actualFinish: a.actualFinishDate ? a.actualFinishDate.split('T')[0] : "",
                yesterdayValue: a.yesterday || "",
                yesterdayIsApproved: a.yesterdayIsApproved,
                todayValue: a.today || "",
                _cellStatuses: a._cellStatuses || {}
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

    // Sort groups by the combined defined activity order (DC → AC → T&C)
    const allActivitiesOrder = [...DC_SIDE_ACTIVITIES, ...AC_SIDE_ACTIVITIES, ...TEST_COMM_ACTIVITIES];
    const groupMap = sortGroupsByDefinedOrder(rawGroupMap, allActivitiesOrder);

    const result: any[] = [];
    groupMap.forEach((groupRows, cleanName) => {
        // Create Category Heading Row with sums — same fields as Vendor IDT
        const totalBudgeted = groupRows.reduce((sum, r) => sum + (Number(r.budgetedUnits) || 0), 0);
        const totalActual = groupRows.reduce((sum, r) => sum + (Number(r.actualUnits) || 0), 0);
        const totalRemaining = groupRows.reduce((sum, r) => sum + (Number(r.remainingUnits) || 0), 0);
        const totalYesterday = groupRows.reduce((sum, r) => sum + (Number(r.yesterdayValue) || 0), 0);
        const totalToday = groupRows.reduce((sum, r) => sum + (Number(r.todayValue) || 0), 0);
        const pctComplete = totalBudgeted > 0 ? ((totalActual / totalBudgeted) * 100).toFixed(2) + '%' : '0.00%';

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
            yesterdayIsApproved: groupRows.every(r => r.yesterdayIsApproved !== false)
        });

        // Add matching activities below the heading
        result.push(...groupRows);
    });

    return result;
};

export const mapActivitiesToDPVendorIdt = (activities: P6Activity[]) => {
    // DC Side filtering
    return activities
        .filter(a => {
            const cleanName = extractActivityName(a.name || "");
            return DC_SIDE_ACTIVITIES.includes(cleanName);
        })
        .map((a) => {
            const scope = Number(a.targetQty || a.scope || 0);
            const actual = Number(a.actualQty || a.cumulative || 0);
            const balance = scope - actual;

            return {
                activityId: a.activityId || "",
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

                forecastStart: a.forecastStartDate ? a.forecastStartDate.split('T')[0] : "",
                forecastFinish: a.forecastFinishDate ? a.forecastFinishDate.split('T')[0] : "",
                actualStart: a.actualStartDate ? a.actualStartDate.split('T')[0] : "",
                actualFinish: a.actualFinishDate ? a.actualFinishDate.split('T')[0] : "",
                completionPercentage: (() => {
                    const pc = a.percentComplete;
                    if (pc === null || pc === undefined) return "";
                    const num = typeof pc === 'number' ? pc : parseFloat(pc);
                    if (isNaN(num)) return "";
                    return num === 100 ? "100.00%" : (num.toFixed(2) + "%");
                })(),
                yesterdayValue: a.yesterday || "",
                yesterdayIsApproved: a.yesterdayIsApproved,
                todayValue: a.today || "",
                _cellStatuses: a._cellStatuses || {}
            };
        });
};

export const mapActivitiesToTestingComm = (activities: P6Activity[]) => {
    // Testing & Commissioning filtering
    return activities
        .filter(a => {
            const cleanName = extractActivityName(a.name || "");
            return TEST_COMM_ACTIVITIES.includes(cleanName);
        })
        .map((a) => {
            const scope = Number(a.targetQty || a.scope || 0);
            const actual = Number(a.actualQty || a.cumulative || 0);
            const balance = scope - actual;

            return {
                activityId: a.activityId || "",
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

                forecastStart: a.forecastStartDate ? a.forecastStartDate.split('T')[0] : "",
                forecastFinish: a.forecastFinishDate ? a.forecastFinishDate.split('T')[0] : "",
                actualStart: a.actualStartDate ? a.actualStartDate.split('T')[0] : "",
                actualFinish: a.actualFinishDate ? a.actualFinishDate.split('T')[0] : "",
                completionPercentage: (() => {
                    const pc = a.percentComplete;
                    if (pc === null || pc === undefined) return "";
                    const num = typeof pc === 'number' ? pc : parseFloat(pc);
                    if (isNaN(num)) return "";
                    return num === 100 ? "100.00%" : (num.toFixed(2) + "%");
                })(),
                yesterdayValue: a.yesterday || "",
                yesterdayIsApproved: a.yesterdayIsApproved,
                todayValue: a.today || "",
                _cellStatuses: a._cellStatuses || {}
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
export const aggregateVendorIdtByActivityName = (rows: ReturnType<typeof mapActivitiesToDPVendorIdt>) => {
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
export const aggregateVendorBlockByActivityName = (rows: ReturnType<typeof mapActivitiesToDPVendorBlock>) => {
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

export const mapResourcesToTable = (resources: P6Resource[]) => {
    return (resources || [])
        .filter(r => (r.resource_id || "").toUpperCase().includes('MT'))
        .map((r) => ({
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
                'Raft Casting', 'Grouting', 'WTG earthing', 'Curing', 'Ready for Excavation',
                'USS precast Installation', 'Road Construction ( For WTG Erection)', 'Crane pad Construction'
            ]
        },
        {
            name: 'WTG ERECTION WORKS',
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
                'CEIG Approval', 'FTC Approval', 'Feeder charging', 'USS charging',
                'WTG Commissioning', 'WTG Trial Run', 'WTG SCOD'
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
    today.setHours(0, 0, 0, 0);

    // Weekly Boundaries (Current Week: Sun-Sat)
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - today.getDay());
    startOfWeek.setHours(0, 0, 0, 0);
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    endOfWeek.setHours(23, 59, 59, 999);

    // Monthly Boundaries (Current Month: 1st to Last Day)
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    startOfMonth.setHours(0, 0, 0, 0);
    const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59, 999);

    windProgressData.forEach(p => {
        const baseRaw = extractActivityBaseWind(p.description || p.name);
        const base = baseRaw.toLowerCase().trim().replace(/[-_]/g, ' ');

        let matchedName = '';
        for (const group of masterGroups) {
            const found = group.activities.find(a => {
                const m = a.toLowerCase().trim();
                return base === m || base.includes(m) || m.includes(base);
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

            const isDone = p.status === 'Completed' || p.completionPercentage === '100' || Number(p.completed) >= Number(p.scope);
            if (isDone) s.achieved += 1;

            const fDate = parseDateHelper(p.forecastFinish || p.baselineFinish || p.plannedFinishDate || p.finishDate);
            const aDate = parseDateHelper(p.actualFinish || p.actualFinishDate);

            // Weekly Logic
            const inWPlanRange = fDate && fDate >= startOfWeek && fDate <= endOfWeek;
            const wasDoneInWRange = isDone && aDate && aDate >= startOfWeek && aDate <= endOfWeek;
            const doneBeforeWRange = isDone && aDate && aDate < startOfWeek;

            if (inWPlanRange && !doneBeforeWRange) s.weeklyPlan += 1;
            if (wasDoneInWRange) s.weeklyAchieved += 1;

            // Monthly Logic
            const inMPlanRange = fDate && fDate >= startOfMonth && fDate <= endOfMonth;
            const wasDoneInMRange = isDone && aDate && aDate >= startOfMonth && aDate <= endOfMonth;
            const doneBeforeMRange = isDone && aDate && aDate < startOfMonth;

            if (inMPlanRange && !doneBeforeMRange) s.monthlyPlan += 1;
            if (wasDoneInMRange) s.monthlyAchieved += 1;
        }
    });

    const finalResult: any[] = [];
    masterGroups.forEach(g => {
        finalResult.push({ isCategoryRow: true, description: g.name, backgroundColor: g.color });
        g.activities.forEach(actName => {
            const s = stats[actName] || { scope: 0, achieved: 0, weeklyPlan: 0, weeklyAchieved: 0, monthlyPlan: 0, monthlyAchieved: 0 };
            const balance = Math.max(0, s.scope - s.achieved);
            const wBalance = Math.max(0, s.weeklyPlan - s.weeklyAchieved);
            const mBalance = Math.max(0, s.monthlyPlan - s.monthlyAchieved);

            finalResult.push({
                description: actName,
                scope: String(s.scope),
                achieved: String(s.achieved),
                balance: String(balance),
                weeklyPlan: String(s.weeklyPlan),
                weeklyAchieved: String(s.weeklyAchieved),
                weeklyBalance: String(wBalance),
                cumulativePlan: String(s.monthlyPlan),
                cumulativeAchieved: String(s.monthlyAchieved),
                cumulativeBalance: String(mBalance),
            });
        });
    });

    return finalResult;
};
