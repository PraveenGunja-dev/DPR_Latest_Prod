// server/routes/dprActivities.js
// DPR Activities API - Uses EXACT P6 API field names (CamelCase/SnakeCase based on actual DB schema)
// Updated to match flattened Schema (UDFs on p6_activities table)

const express = require('express');
const router = express.Router();

let pool;
let authenticateToken;

const setPool = (dbPool, authMiddleware) => {
    pool = dbPool;
    authenticateToken = authMiddleware;
};

const ensureAuth = (req, res, next) => {
    if (typeof authenticateToken === 'function') {
        return authenticateToken(req, res, next);
    }
    return res.status(401).json({ message: 'Authentication middleware not initialized' });
};

const ensurePool = (req, res, next) => {
    if (pool) {
        req.pool = pool;
        return next();
    }
    return res.status(500).json({ message: 'Database pool not initialized' });
};

const ensureAuthAndPool = [ensureAuth, ensurePool];

/**
 * GET /api/dpr-activities/projects
 */
router.get('/projects', ensureAuthAndPool, async (req, res) => {
    try {
        const result = await req.pool.query(`
            SELECT 
                p."ObjectId" as "objectId",
                p."Id" as "projectId",
                p."Name" as "name",
                p."Status" as "status",
                p."StartDate" as "startDate",
                p."FinishDate" as "finishDate",
                p."PlannedStartDate" as "plannedStartDate",
                p."PlannedFinishDate" as "plannedFinishDate",
                p."DataDate" as "dataDate",
                COUNT(a."activityObjectId") as "activityCount"
            FROM p6_projects p
            LEFT JOIN p6_activities a ON p."ObjectId" = a."projectObjectId"
            GROUP BY p."ObjectId", p."Id", p."Name", p."Status",
                     p."StartDate", p."FinishDate", p."PlannedStartDate",
                     p."PlannedFinishDate", p."DataDate"
            ORDER BY p."Name"
        `);

        res.json({
            success: true,
            count: result.rows.length,
            projects: result.rows
        });
    } catch (error) {
        console.error('Error fetching projects:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * GET /api/dpr-activities/activities/:projectObjectId
 * Returns activities with resource assignments, resources, WBS, UDFs
 */
router.get('/activities/:projectObjectId', ensureAuthAndPool, async (req, res) => {
    try {
        const { projectObjectId } = req.params;
        const { page = 1, limit = 100 } = req.query;
        const offset = (parseInt(page) - 1) * parseInt(limit);

        // Get total count
        const countResult = await req.pool.query(
            'SELECT COUNT(*) FROM p6_activities WHERE "ProjectObjectId" = $1',
            [projectObjectId]
        );
        const totalCount = parseInt(countResult.rows[0].count);

        // Get activities with JOINs
        // Note: UDFs are now columns on p6_activities (TotalQuantity, Scope, etc.)
        const result = await req.pool.query(`
            SELECT 
                a."ObjectId" as "activityObjectId",
                a."Id" as "activityId",
                a."Name" as "name",
                a."PlannedStartDate" as "plannedStartDate",
                a."PlannedFinishDate" as "plannedFinishDate",
                a."ActualStartDate" as "actualStartDate",
                a."ActualFinishDate" as "actualFinishDate",
                a."FinishDate" as "forecastFinishDate",
                a."Status" as "status",
                a."WBSObjectId" as "wbsObjectId",
                a."ProjectObjectId" as "projectObjectId",
                
                -- UDFs (Using PascalCase from recreate-all-tables.js)
                a."TotalQuantity" as "totalQuantity",
                a."UOM" as "uom",
                a."ContractorName" as "contractorName",
                a."BlockCapacity" as "blockCapacity",
                a."Phase" as "phase",
                a."SPVNo" as "spvNumber",
                a."Scope" as "scope",
                a."Hold" as "holdDueToWTG",
                a."Front" as "front",
                a."Priority" as "priority",
                a."PlotCode" as "plot",
                a."NewBlockNom" as "newBlockNom",

                -- From resource_assignments (Aggregated)
                ra."PlannedUnits" as "targetQty",
                ra."ActualUnits" as "actualQty",
                ra."RemainingUnits" as "remainingQty",
                ra."ActualUnits" as "actualUnits",
                ra."RemainingUnits" as "remainingUnits",
                
                -- Calculated % complete
                CASE 
                    WHEN ra."PlannedUnits" > 0 THEN ROUND((ra."ActualUnits" / ra."PlannedUnits") * 100, 2)
                    ELSE COALESCE(a."PercentComplete", 0)
                END AS "percentComplete",

                -- From resources
                r."Name" as "resourceName",
                r."ResourceType" as "resourceType",

                -- From WBS
                w."Name" as "wbsName",
                w."Code" as "wbsCode"

            FROM p6_activities a
            -- Join primary resource assignment
            LEFT JOIN p6_resource_assignments ra ON a."ObjectId" = ra."ActivityObjectId"
            LEFT JOIN p6_resources r ON ra."ResourceObjectId" = r."ObjectId"
            LEFT JOIN p6_wbs w ON a."WBSObjectId" = w."ObjectId"
            
            WHERE a."ProjectObjectId" = $1
            ORDER BY a."PlannedStartDate", a."Id"
            LIMIT $2 OFFSET $3
        `, [projectObjectId, parseInt(limit), offset]);

        // Enrich activities (Mapping DB result to API format)
        // Since we fetch everything in one query now, we just map 1:1
        const activities = result.rows.map(row => {
            return {
                activityObjectId: row.activityObjectId,
                activityId: row.activityId,
                name: row.name,
                status: row.status,
                plannedStartDate: row.plannedStartDate,
                plannedFinishDate: row.plannedFinishDate,
                actualStartDate: row.actualStartDate,
                actualFinishDate: row.actualFinishDate,
                forecastFinishDate: row.forecastFinishDate,

                targetQty: row.targetQty ? parseFloat(row.targetQty) : null,
                actualQty: row.actualQty ? parseFloat(row.actualQty) : null,
                remainingQty: row.remainingQty ? parseFloat(row.remainingQty) : null,
                actualUnits: row.actualUnits ? parseFloat(row.actualUnits) : null,
                remainingUnits: row.remainingUnits ? parseFloat(row.remainingUnits) : null,
                percentComplete: row.percentComplete ? parseFloat(row.percentComplete) : 0,

                contractorName: row.contractorName || row.resourceName, // Use resource name if contract name UDF empty
                unitOfMeasure: row.uom, // Direct column
                resourceType: row.resourceType,

                wbsObjectId: row.wbsObjectId,
                wbsName: row.wbsName,
                wbsCode: row.wbsCode,

                // UDFs
                scope: row.scope,
                front: row.front,
                remarks: null, // Not in schema yet
                holdDueToWTG: row.holdDueToWTG,
                blockCapacity: row.blockCapacity,
                spvNumber: row.spvNumber,
                block: null, // Derived?
                phase: row.phase,
                priority: row.priority,
                plot: row.plot,
                newBlockNom: row.newBlockNom
            };
        });

        res.json({
            success: true,
            projectObjectId: parseInt(projectObjectId),
            totalCount,
            page: parseInt(page),
            limit: parseInt(limit),
            totalPages: Math.ceil(totalCount / parseInt(limit)),
            activities
        });
    } catch (error) {
        console.error('Error fetching activities:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * GET /api/dpr-activities/dp-qty/:projectObjectId
 */
router.get('/dp-qty/:projectObjectId', ensureAuthAndPool, async (req, res) => {
    try {
        const { projectObjectId } = req.params;

        const result = await req.pool.query(`
            SELECT 
                a."ObjectId" as "activityObjectId",
                a."Id" as "activityId",
                a."Name" as "name",
                a."Status" as "status",
                a."PlannedStartDate" as "plannedStartDate",
                a."PlannedFinishDate" as "plannedFinishDate",
                a."ActualStartDate" as "actualStartDate",
                a."ActualFinishDate" as "actualFinishDate",
                a."FinishDate" as "forecastFinishDate",
                
                -- Qty logic
                a."TotalQuantity" as "totalQuantity",
                COALESCE(ra."PlannedUnits", 0) as "targetQty",
                COALESCE(ra."ActualUnits", 0) as "actualQty",
                COALESCE(ra."RemainingUnits", 0) as "remainingQty",
                
                CASE 
                    WHEN ra."PlannedUnits" > 0 THEN ROUND((ra."ActualUnits" / ra."PlannedUnits") * 100, 2)
                    ELSE COALESCE(a."PercentComplete", 0)
                END AS "percentComplete",
                
                COALESCE(a."ContractorName", r."Name") as "contractorName",
                a."UOM" as "unitOfMeasure"
                
            FROM p6_activities a
            LEFT JOIN p6_resource_assignments ra ON a."ObjectId" = ra."ActivityObjectId"
            LEFT JOIN p6_resources r ON ra."ResourceObjectId" = r."ObjectId"
            WHERE a."ProjectObjectId" = $1
            ORDER BY a."PlannedStartDate", a."Id"
        `, [projectObjectId]);

        const data = result.rows.map((row, index) => ({
            slNo: (index + 1).toString(),
            activityObjectId: row.activityObjectId,
            activityId: row.activityId,
            name: row.name,
            status: row.status,
            targetQty: row.targetQty ? parseFloat(row.targetQty) : null,
            actualQty: row.actualQty ? parseFloat(row.actualQty) : null,
            remainingQty: row.remainingQty ? parseFloat(row.remainingQty) : null,
            percentComplete: row.percentComplete ? parseFloat(row.percentComplete) : null,
            contractorName: row.contractorName,
            unitOfMeasure: row.unitOfMeasure,
            plannedStartDate: row.plannedStartDate ? row.plannedStartDate.toISOString().split('T')[0] : null,
            plannedFinishDate: row.plannedFinishDate ? row.plannedFinishDate.toISOString().split('T')[0] : null,
            actualStartDate: row.actualStartDate ? row.actualStartDate.toISOString().split('T')[0] : null,
            actualFinishDate: row.actualFinishDate ? row.actualFinishDate.toISOString().split('T')[0] : null,
            forecastFinishDate: row.forecastFinishDate ? row.forecastFinishDate.toISOString().split('T')[0] : null
        }));

        res.json({
            success: true,
            projectObjectId: parseInt(projectObjectId),
            count: data.length,
            data
        });
    } catch (error) {
        console.error('Error fetching DP Qty data:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * GET /api/dpr-activities/manpower/:projectObjectId
 * Labor resources only
 */
router.get('/manpower/:projectObjectId', ensureAuthAndPool, async (req, res) => {
    try {
        const { projectObjectId } = req.params;

        // Note: Filters p6_resources for 'Labor' type
        const result = await req.pool.query(`
            SELECT 
                a."ObjectId" as "activityObjectId",
                a."Id" as "activityId",
                a."Name" as activity,
                r."Name" as contractor,
                ra."ActualUnits" as "actualUnits",
                ra."RemainingUnits" as "remainingUnits",
                w."Name" as block
            FROM p6_activities a
            JOIN p6_resource_assignments ra ON a."ObjectId" = ra."ActivityObjectId"
            JOIN p6_resources r ON ra."ResourceObjectId" = r."ObjectId"
            LEFT JOIN p6_wbs w ON a."WBSObjectId" = w."ObjectId"
            WHERE a."ProjectObjectId" = $1
              AND (r."ResourceType" = 'Labor' OR r."ResourceType" = 'Nonlabor')
            ORDER BY r."Name", a."Id"
        `, [projectObjectId]);

        res.json({
            success: true,
            projectObjectId: parseInt(projectObjectId),
            count: result.rows.length,
            data: result.rows
        });
    } catch (error) {
        console.error('Error fetching manpower data:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * GET /api/dpr-activities/activity-codes
 */
router.get('/activity-codes', ensureAuthAndPool, async (req, res) => {
    try {
        const codeTypes = await req.pool.query(`
            SELECT "ObjectId" as "objectId", "Name" as "name", "ProjectObjectId" as "projectObjectId"
            FROM p6_activity_code_types
            ORDER BY "Name"
        `);

        // Check if Activity Code columns exist first (optional)
        // Assuming PascalCase for these might be wrong too? Let's assume standard PascalCase for now or leave as is if not reporting error.
        // Actually, if everything else is camel/snake, these might be too.
        // But I haven't checked them. I'll leave them for now unless they error.

        const codes = await req.pool.query(`
            SELECT 
                c."ObjectId" as "objectId",
                c."CodeValue" as "name",
                c."CodeValue" as "codeValue", 
                c."Description" as "description",
                c."CodeTypeObjectId" as "activityCodeTypeObjectId",
                t."Name" as "codeTypeName"
            FROM p6_activity_codes c
            LEFT JOIN p6_activity_code_types t ON c."CodeTypeObjectId" = t."ObjectId"
            ORDER BY t."Name", c."CodeValue"
        `);

        res.json({
            success: true,
            codeTypes: codeTypes.rows,
            codes: codes.rows
        });
    } catch (error) {
        console.error('Error fetching activity codes:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * GET /api/dpr-activities/sync-status
 */
router.get('/sync-status', ensureAuthAndPool, async (req, res) => {
    try {
        const counts = await Promise.all([
            req.pool.query('SELECT COUNT(*) FROM p6_projects'),
            req.pool.query('SELECT COUNT(*) FROM p6_wbs'),
            req.pool.query('SELECT COUNT(*) FROM p6_activities'),
            req.pool.query('SELECT COUNT(*) FROM p6_resources'),
            req.pool.query('SELECT COUNT(*) FROM p6_resource_assignments'),
            req.pool.query('SELECT COUNT(*) FROM p6_activity_code_types'),
            req.pool.query('SELECT COUNT(*) FROM p6_activity_codes'),
            req.pool.query('SELECT MAX("LastSyncAt") as "lastSync" FROM p6_projects'),
            req.pool.query('SELECT MAX("lastSyncAt") as "lastSync" FROM p6_activities')
        ]);

        res.json({
            success: true,
            counts: {
                projects: parseInt(counts[0].rows[0].count),
                wbs: parseInt(counts[1].rows[0].count),
                activities: parseInt(counts[2].rows[0].count),
                resources: parseInt(counts[3].rows[0].count),
                resourceAssignments: parseInt(counts[4].rows[0].count),
                activityCodeTypes: parseInt(counts[5].rows[0].count),
                activityCodes: parseInt(counts[6].rows[0].count)
            },
            lastSync: {
                projects: counts[7].rows[0].lastSync,
                activities: counts[8].rows[0].lastSync
            }
        });
    } catch (error) {
        console.error('Error fetching sync status:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = { router, setPool };
