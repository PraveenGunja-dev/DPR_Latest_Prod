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
    baseline1StartDate: string | null;
    baseline1FinishDate: string | null;
    baseline2StartDate: string | null;
    baseline2FinishDate: string | null;
    baseline3StartDate: string | null;
    baseline3FinishDate: string | null;

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
    "DT Foundation Up To Rail",
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
            baseline1StartDate: formatDate(a.baseline1StartDate),
            baseline1FinishDate: formatDate(a.baseline1FinishDate),
            baseline2StartDate: formatDate(a.baseline2StartDate),
            baseline2FinishDate: formatDate(a.baseline2FinishDate),
            baseline3StartDate: formatDate(a.baseline3StartDate),
            baseline3FinishDate: formatDate(a.baseline3FinishDate),

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
            baseline1StartDate: a.baseline1StartDate,
            baseline1FinishDate: a.baseline1FinishDate,
            baseline2StartDate: a.baseline2StartDate,
            baseline2FinishDate: a.baseline2FinishDate,
            baseline3StartDate: a.baseline3StartDate,
            baseline3FinishDate: a.baseline3FinishDate,
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
        totalQuantity: a.targetQty !== null ? String(a.targetQty) : "", // Mapped from targetQty
        uom: a.unitOfMeasure || "", // Mapped from unitOfMeasure
        balance: a.balance || "", // From DB sync
        basePlanStart: a.baselineStartDate ? a.baselineStartDate.split('T')[0] : "",
        basePlanFinish: a.baselineFinishDate ? a.baselineFinishDate.split('T')[0] : "",
        bl1Start: a.baseline1StartDate ? a.baseline1StartDate.split('T')[0] : "",
        bl1Finish: a.baseline1FinishDate ? a.baseline1FinishDate.split('T')[0] : "",
        bl2Start: a.baseline2StartDate ? a.baseline2StartDate.split('T')[0] : "",
        bl2Finish: a.baseline2FinishDate ? a.baseline2FinishDate.split('T')[0] : "",
        bl3Start: a.baseline3StartDate ? a.baseline3StartDate.split('T')[0] : "",
        bl3Finish: a.baseline3FinishDate ? a.baseline3FinishDate.split('T')[0] : "",
        forecastStart: a.forecastStartDate ? a.forecastStartDate.split('T')[0] : "",
        forecastFinish: a.forecastFinishDate ? a.forecastFinishDate.split('T')[0] : "",
        actualStart: a.actualStartDate ? a.actualStartDate.split('T')[0] : "",
        actualFinish: a.actualFinishDate ? a.actualFinishDate.split('T')[0] : "",
        percentComplete: a.percentComplete !== null ? (a.percentComplete === 100 ? "100.00%" : (String(a.percentComplete.toFixed(2)) + "%")) : "",
        remarks: a.remarks || "",
        cumulative: a.cumulative || "",
        block: (a.block || a.newBlockNom || a.plot || "").toUpperCase(),
        weightage: a.weightage !== null && a.weightage !== undefined ? String(a.weightage) : "",
        yesterdayValue: a.yesterday || "",
        yesterdayIsApproved: a.yesterdayIsApproved,
        todayValue: a.today || ""
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
    const groupMap = new Map<string, typeof rows>();

    rows.forEach(row => {
        const cleanName = extractActivityName(row.description);
        if (!groupMap.has(cleanName)) {
            groupMap.set(cleanName, []);
        }
        groupMap.get(cleanName)!.push(row);
    });

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
            totalQuantity: totalQty ? String(totalQty) : "",
            uom: groupRows[0].uom || "",
            balance: String(balance),
            basePlanStart: minDate(groupRows.map(r => r.basePlanStart)),
            basePlanFinish: maxDate(groupRows.map(r => r.basePlanFinish)),
            bl1Start: minDate(groupRows.map(r => r.bl1Start)),
            bl1Finish: maxDate(groupRows.map(r => r.bl1Finish)),
            bl2Start: minDate(groupRows.map(r => r.bl2Start)),
            bl2Finish: maxDate(groupRows.map(r => r.bl2Finish)),
            bl3Start: minDate(groupRows.map(r => r.bl3Start)),
            bl3Finish: maxDate(groupRows.map(r => r.bl3Finish)),
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
        blockCapacity: a.blockCapacity || "",
        phase: a.phase || "",
        block: (a.block || a.newBlockNom || a.plot || "").toUpperCase(),
        spvNumber: a.spvNumber || "",
        priority: a.priority || "",
        scope: a.scope || "",
        hold: a.holdDueToWTG || "", // Mapped from holdDueToWTG
        front: a.front || "",
        completed: a.actualQty !== null ? String(a.actualQty) : "",
        balance: a.remainingQty !== null ? String(a.remainingQty) : "",

        // Date mapping - use baseline/forecast from P6 sync, fallback to planned
        baselineStartDate: a.baselineStartDate ? a.baselineStartDate.split('T')[0] : (a.plannedStartDate ? a.plannedStartDate.split('T')[0] : ""),
        baselineEndDate: a.baselineFinishDate ? a.baselineFinishDate.split('T')[0] : (a.plannedFinishDate ? a.plannedFinishDate.split('T')[0] : ""),
        bl1Start: a.baseline1StartDate ? a.baseline1StartDate.split('T')[0] : "",
        bl1Finish: a.baseline1FinishDate ? a.baseline1FinishDate.split('T')[0] : "",
        bl2Start: a.baseline2StartDate ? a.baseline2StartDate.split('T')[0] : "",
        bl2Finish: a.baseline2FinishDate ? a.baseline2FinishDate.split('T')[0] : "",
        bl3Start: a.baseline3StartDate ? a.baseline3StartDate.split('T')[0] : "",
        bl3Finish: a.baseline3FinishDate ? a.baseline3FinishDate.split('T')[0] : "",
        actualStartDate: a.actualStartDate ? a.actualStartDate.split('T')[0] : "",
        actualFinishDate: a.actualFinishDate ? a.actualFinishDate.split('T')[0] : "",
        forecastStartDate: a.forecastStartDate ? a.forecastStartDate.split('T')[0] : (a.plannedStartDate ? a.plannedStartDate.split('T')[0] : ""),
        forecastFinishDate: a.forecastFinishDate ? a.forecastFinishDate.split('T')[0] : (a.plannedFinishDate ? a.plannedFinishDate.split('T')[0] : ""),
        yesterdayIsApproved: a.yesterdayIsApproved
    }));
};

export const mapActivitiesToDPVendorBlock = (activities: P6Activity[]) => {
    // AC Side filtering
    return activities
        .filter(a => {
            const cleanName = extractActivityName(a.name || "");
            return AC_SIDE_ACTIVITIES.some(act => cleanName === act || (a.name && a.name.includes(act)));
        })
        .map((a) => {
            const scope = Number(a.targetQty || a.scope || 0);
            const actual = Number(a.actualQty || a.cumulative || 0);
            const balance = scope - actual;

            return {
                activityId: a.activityId || "",
                description: a.name || "", // Standardized name
                plot: a.plot || "",
                block: (a.block || a.newBlockNom || a.plot || "").toUpperCase(),
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
                completionPercentage: a.percentComplete !== null ? (a.percentComplete === 100 ? "100.00%" : (String(a.percentComplete.toFixed(2)) + "%")) : "",
                remarks: a.remarks || "",
                basePlanStart: a.baselineStartDate ? a.baselineStartDate.split('T')[0] : "",
                basePlanFinish: a.baselineFinishDate ? a.baselineFinishDate.split('T')[0] : "",
                bl1Start: a.baseline1StartDate ? a.baseline1StartDate.split('T')[0] : "",
                bl1Finish: a.baseline1FinishDate ? a.baseline1FinishDate.split('T')[0] : "",
                bl2Start: a.baseline2StartDate ? a.baseline2StartDate.split('T')[0] : "",
                bl2Finish: a.baseline2FinishDate ? a.baseline2FinishDate.split('T')[0] : "",
                bl3Start: a.baseline3StartDate ? a.baseline3StartDate.split('T')[0] : "",
                bl3Finish: a.baseline3FinishDate ? a.baseline3FinishDate.split('T')[0] : "",
                forecastStart: a.forecastStartDate ? a.forecastStartDate.split('T')[0] : "",
                forecastFinish: a.forecastFinishDate ? a.forecastFinishDate.split('T')[0] : "",
                actualStart: a.actualStartDate ? a.actualStartDate.split('T')[0] : "",
                actualFinish: a.actualFinishDate ? a.actualFinishDate.split('T')[0] : "",
                yesterdayValue: a.yesterday || "",
                yesterdayIsApproved: a.yesterdayIsApproved,
                todayValue: a.today || ""
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
    const groupMap = new Map<string, any[]>();
    rows.forEach(row => {
        const cleanName = extractActivityName(row.description || row.activity || '');
        if (!groupMap.has(cleanName)) {
            groupMap.set(cleanName, []);
        }
        groupMap.get(cleanName)!.push(row);
    });

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
            return DC_SIDE_ACTIVITIES.some(act => cleanName === act || (a.name && a.name.includes(act)));
        })
        .map((a) => {
            const scope = Number(a.targetQty || a.scope || 0);
            const actual = Number(a.actualQty || a.cumulative || 0);
            const balance = scope - actual;

            return {
                activityId: a.activityId || "",
                description: a.name || "", // Standardized name
                plot: a.plot || "",
                block: (a.block || a.newBlockNom || a.plot || "").toUpperCase(),
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
                bl1Start: a.baseline1StartDate ? a.baseline1StartDate.split('T')[0] : "",
                bl1Finish: a.baseline1FinishDate ? a.baseline1FinishDate.split('T')[0] : "",
                bl2Start: a.baseline2StartDate ? a.baseline2StartDate.split('T')[0] : "",
                bl2Finish: a.baseline2FinishDate ? a.baseline2FinishDate.split('T')[0] : "",
                bl3Start: a.baseline3StartDate ? a.baseline3StartDate.split('T')[0] : "",
                bl3Finish: a.baseline3FinishDate ? a.baseline3FinishDate.split('T')[0] : "",
                forecastStart: a.forecastStartDate ? a.forecastStartDate.split('T')[0] : "",
                forecastFinish: a.forecastFinishDate ? a.forecastFinishDate.split('T')[0] : "",
                actualStart: a.actualStartDate ? a.actualStartDate.split('T')[0] : "",
                actualFinish: a.actualFinishDate ? a.actualFinishDate.split('T')[0] : "",
                completionPercentage: a.percentComplete !== null ? (a.percentComplete === 100 ? "100.00%" : (String(a.percentComplete.toFixed(2)) + "%")) : "",
                yesterdayValue: a.yesterday || "",
                yesterdayIsApproved: a.yesterdayIsApproved,
                todayValue: a.today || ""
            };
        });
};

export const mapActivitiesToTestingComm = (activities: P6Activity[]) => {
    // Testing & Commissioning filtering
    return activities
        .filter(a => {
            const cleanName = extractActivityName(a.name || "");
            return TEST_COMM_ACTIVITIES.some(act => cleanName === act || (a.name && a.name.includes(act)));
        })
        .map((a) => {
            const scope = Number(a.targetQty || a.scope || 0);
            const actual = Number(a.actualQty || a.cumulative || 0);
            const balance = scope - actual;

            return {
                activityId: a.activityId || "",
                description: a.name || "", // Standardized name
                plot: a.plot || "",
                block: (a.block || a.newBlockNom || a.plot || "").toUpperCase(),
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
                bl1Start: a.baseline1StartDate ? a.baseline1StartDate.split('T')[0] : "",
                bl1Finish: a.baseline1FinishDate ? a.baseline1FinishDate.split('T')[0] : "",
                bl2Start: a.baseline2StartDate ? a.baseline2StartDate.split('T')[0] : "",
                bl2Finish: a.baseline2FinishDate ? a.baseline2FinishDate.split('T')[0] : "",
                bl3Start: a.baseline3StartDate ? a.baseline3StartDate.split('T')[0] : "",
                bl3Finish: a.baseline3FinishDate ? a.baseline3FinishDate.split('T')[0] : "",
                forecastStart: a.forecastStartDate ? a.forecastStartDate.split('T')[0] : "",
                forecastFinish: a.forecastFinishDate ? a.forecastFinishDate.split('T')[0] : "",
                actualStart: a.actualStartDate ? a.actualStartDate.split('T')[0] : "",
                actualFinish: a.actualFinishDate ? a.actualFinishDate.split('T')[0] : "",
                completionPercentage: a.percentComplete !== null ? (a.percentComplete === 100 ? "100.00%" : (String(a.percentComplete.toFixed(2)) + "%")) : "",
                yesterdayValue: a.yesterday || "",
                yesterdayIsApproved: a.yesterdayIsApproved,
                todayValue: a.today || ""
            };
        });
};

/**
 * Groups Vendor IDT rows by activity name (stripping block prefix)
 * and inserts a summary heading row (#FADFAD) for each group.
 */
export const aggregateVendorIdtByActivityName = (rows: ReturnType<typeof mapActivitiesToDPVendorIdt>) => {
    if (!rows || rows.length === 0) return rows;

    // Group by cleaned activity name
    const groupMap = new Map<string, typeof rows>();
    rows.forEach(row => {
        const cleanName = extractActivityName(row.description || '');
        if (!groupMap.has(cleanName)) {
            groupMap.set(cleanName, []);
        }
        groupMap.get(cleanName)!.push(row);
    });

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
            bl1Start: minDate(groupRows.map(r => r.bl1Start)),
            bl1Finish: maxDate(groupRows.map(r => r.bl1Finish)),
            bl2Start: minDate(groupRows.map(r => r.bl2Start)),
            bl2Finish: maxDate(groupRows.map(r => r.bl2Finish)),
            bl3Start: minDate(groupRows.map(r => r.bl3Start)),
            bl3Finish: maxDate(groupRows.map(r => r.bl3Finish)),
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
    const groupMap = new Map<string, typeof rows>();
    rows.forEach(row => {
        const cleanName = extractActivityName(row.description || '');
        if (!groupMap.has(cleanName)) {
            groupMap.set(cleanName, []);
        }
        groupMap.get(cleanName)!.push(row);
    });

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
            bl1Start: minDate(groupRows.map(r => r.bl1Start)),
            bl1Finish: maxDate(groupRows.map(r => r.bl1Finish)),
            bl2Start: minDate(groupRows.map(r => r.bl2Start)),
            bl2Finish: maxDate(groupRows.map(r => r.bl2Finish)),
            bl3Start: minDate(groupRows.map(r => r.bl3Start)),
            bl3Finish: maxDate(groupRows.map(r => r.bl3Finish)),
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
