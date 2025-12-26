const pool = require('../db');
const { restClient } = require('./oracleP6RestClient');

class P6DataService {
    /**
     * Syncs all data for a specific project from P6 API to Database
     * @param {number} projectId - P6 Project ObjectId
     */
    async syncProject(projectId) {
        const client = await pool.connect();
        const logEntry = {
            project_object_id: projectId,
            sync_type: 'full',
            status: 'started',
            message: ''
        };

        let activityObjectIds = [];

        try {
            console.log(`[P6 Sync] Starting sync for project ${projectId}`);
            await client.query('BEGIN');

            // 0. Create/Update Project Record
            console.log(`[P6 Sync] Syncing Project Record...`);
            await this._syncProjectRecord(client, projectId);

            // 1. Sync WBS
            console.log(`[P6 Sync] Syncing WBS...`);
            await this._syncWBS(client, projectId);

            // 2. Sync Activities
            console.log(`[P6 Sync] Syncing Activities...`);
            activityObjectIds = await this._syncActivities(client, projectId);

            await client.query('COMMIT');
            logEntry.status = 'completed';
            console.log(`[P6 Sync] Core sync completed successfully for ${projectId}`);
        } catch (error) {
            await client.query('ROLLBACK');
            logEntry.status = 'failed';
            logEntry.message = error.message;
            console.error(`[P6 Sync] Failed:`, error);
            throw error;
        } finally {
            // Log sync result (outside transaction)
            try {
                await pool.query(
                    `INSERT INTO p6_sync_log (project_object_id, sync_type, status, error_message, completed_at) 
                     VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)`,
                    [logEntry.project_object_id, logEntry.sync_type, logEntry.status, logEntry.message]
                );
            } catch (e) {
                console.error('Failed to write sync log', e);
            }
            client.release();
        }

        // 3. Sync UDFs (outside main transaction - optional enhancement)
        // This runs after the main sync succeeds, so UDF errors won't break core functionality
        if (activityObjectIds.length > 0) {
            try {
                console.log(`[P6 Sync] Syncing UDFs for ${activityObjectIds.length} activities...`);
                await this._syncUDFs(activityObjectIds);
            } catch (udfError) {
                console.error('[P6 Sync] UDF sync failed (non-critical):', udfError.message);
                // Don't throw - UDF sync is optional
            }
        }

        // 4. Sync Activity Codes (optional - outside main transaction)
        // Syncs Priority, Plot, and other activity code assignments
        try {
            console.log(`[P6 Sync] Syncing Activity Codes...`);
            await this._syncActivityCodes(projectId);
        } catch (acError) {
            console.error('[P6 Sync] Activity code sync failed (non-critical):', acError.message);
            // Don't throw - activity codes are optional
        }

        // 5. Sync Resources (optional - outside main transaction)
        // Syncs contractor/resource information
        try {
            console.log(`[P6 Sync] Syncing Resources...`);
            await this._syncResources(projectId);
        } catch (resError) {
            console.error('[P6 Sync] Resource sync failed (non-critical):', resError.message);
            // Don't throw - resources are optional
        }

        // 6. Sync Resource Assignments (optional fallback for Total Quantity and UOM)
        // Primary quantity source is now PlannedNonLaborUnits/PlannedLaborUnits on activities
        // This is kept as fallback if /resourceassignment endpoint is available
        try {
            console.log(`[P6 Sync] Syncing Resource Assignments (optional)...`);
            await this._syncResourceAssignments(projectId);
        } catch (raError) {
            // Endpoint may not be available in all P6 instances - this is expected
            console.log('[P6 Sync] Resource assignment sync skipped (endpoint not available)');
        }
    }

    async _syncProjectRecord(client, projectId) {
        // Fetch Project Details
        const data = await restClient.get('/project', {
            Filter: `ObjectId=${projectId}`,
            Fields: 'ObjectId,Id,Name,Status,StartDate,FinishDate'
        });
        const project = Array.isArray(data) ? data[0] : (data && data.length > 0 ? data[0] : null);

        if (project) {
            await client.query(
                `INSERT INTO p6_projects (object_id, p6_id, name, status, start_date, finish_date, last_sync_at)
                 VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
                 ON CONFLICT (object_id) DO UPDATE SET
                    p6_id = EXCLUDED.p6_id,
                    name = EXCLUDED.name,
                    status = EXCLUDED.status,
                    start_date = EXCLUDED.start_date,
                    finish_date = EXCLUDED.finish_date,
                    last_sync_at = CURRENT_TIMESTAMP`,
                [
                    parseInt(project.ObjectId),
                    project.Id,
                    project.Name,
                    project.Status,
                    this._toDate(project.StartDate),
                    this._toDate(project.FinishDate)
                ]
            );
        } else {
            console.warn(`[P6 Sync] Warning: Project ${projectId} not found in P6 API.`);
            // Attempt to insert dummy so FK doesn't fail? Or throw?
            // If we can't find it, we can't really proceed safely.
            throw new Error(`Project ${projectId} not found in P6`);
        }
    }

    async _syncWBS(client, projectId) {
        // Fetch WBS from P6
        // P6 API for WBS: /wbs?Filter=ProjectObjectId={id}&Fields=...
        const wbsData = await restClient.get('/wbs', {
            Filter: `ProjectObjectId=${projectId}`,
            Fields: 'ObjectId,Name,Code,ParentObjectId,SequenceNumber,Status'
        });

        const wbsList = Array.isArray(wbsData) ? wbsData : (wbsData.data || []);

        for (const wbs of wbsList) {
            await client.query(
                `INSERT INTO p6_wbs (object_id, project_object_id, parent_object_id, code, name, seq_num, status)
                 VALUES ($1, $2, $3, $4, $5, $6, $7)
                 ON CONFLICT (object_id) DO UPDATE SET
                    name = EXCLUDED.name,
                    code = EXCLUDED.code,
                    parent_object_id = EXCLUDED.parent_object_id,
                    seq_num = EXCLUDED.seq_num,
                    status = EXCLUDED.status,
                    last_sync_at = CURRENT_TIMESTAMP`,
                [wbs.ObjectId, projectId, wbs.ParentObjectId, wbs.Code, wbs.Name, wbs.SequenceNumber, wbs.Status]
            );
        }
    }

    async _syncActivities(client, projectId) {
        // Fetch Activities with quantity fields directly from activity endpoint
        // PlannedLaborUnits, PlannedNonLaborUnits contain quantity data
        const fields = [
            'ObjectId', 'Id', 'Name', 'Status', 'PercentComplete',
            'StartDate', 'FinishDate', 'PlannedStartDate', 'PlannedFinishDate',
            'ActualStartDate', 'ActualFinishDate', 'RemainingEarlyStartDate', 'RemainingEarlyFinishDate',
            'WBSObjectId', 'ActualDuration', 'RemainingDuration', 'PlannedDuration',
            // Quantity fields - directly on activity
            'PlannedLaborUnits', 'PlannedNonLaborUnits',
            'ActualLaborUnits', 'ActualNonLaborUnits',
            'AtCompletionLaborUnits', 'AtCompletionNonLaborUnits'
        ];

        const activities = await restClient.readActivities(fields, projectId);
        const activityObjectIds = [];

        for (const act of activities) {
            activityObjectIds.push(act.ObjectId);

            // Calculate total quantity from PlannedNonLaborUnits (primary) or PlannedLaborUnits
            const totalQty = parseFloat(act.PlannedNonLaborUnits) || parseFloat(act.PlannedLaborUnits) || null;

            await client.query(
                `INSERT INTO p6_activities (
                    object_id, activity_id, name, project_object_id, wbs_object_id,
                    status, percent_complete, 
                    start_date, finish_date,
                    planned_start_date, planned_finish_date,
                    actual_start_date, actual_finish_date,
                    actual_duration, remaining_duration,
                    total_quantity,
                    last_sync_at
                ) VALUES (
                    $1, $2, $3, $4, $5,
                    $6, $7, 
                    $8, $9,
                    $10, $11,
                    $12, $13,
                    $14, $15,
                    $16,
                    CURRENT_TIMESTAMP
                )
                ON CONFLICT (object_id) DO UPDATE SET
                    activity_id = EXCLUDED.activity_id,
                    name = EXCLUDED.name,
                    wbs_object_id = EXCLUDED.wbs_object_id,
                    status = EXCLUDED.status,
                    percent_complete = EXCLUDED.percent_complete,
                    start_date = EXCLUDED.start_date,
                    finish_date = EXCLUDED.finish_date,
                    planned_start_date = EXCLUDED.planned_start_date,
                    planned_finish_date = EXCLUDED.planned_finish_date,
                    actual_start_date = EXCLUDED.actual_start_date,
                    actual_finish_date = EXCLUDED.actual_finish_date,
                    actual_duration = EXCLUDED.actual_duration,
                    remaining_duration = EXCLUDED.remaining_duration,
                    total_quantity = COALESCE(EXCLUDED.total_quantity, p6_activities.total_quantity),
                    last_sync_at = CURRENT_TIMESTAMP`,
                [
                    act.ObjectId, act.Id, act.Name, projectId, act.WBSObjectId,
                    act.Status, act.PercentComplete || 0,
                    this._toDate(act.StartDate), this._toDate(act.FinishDate),
                    this._toDate(act.PlannedStartDate), this._toDate(act.PlannedFinishDate),
                    this._toDate(act.ActualStartDate), this._toDate(act.ActualFinishDate),
                    act.ActualDuration, act.RemainingDuration,
                    totalQty
                ]
            );
        }

        return activityObjectIds;
    }

    /**
     * Sync UDF values for activities
     * Maps P6 UDF names to database columns with flexible name matching
     * Runs outside main transaction - uses pool directly
     */
    async _syncUDFs(activityObjectIds) {
        if (!activityObjectIds || activityObjectIds.length === 0) {
            console.log('[P6 Sync] No activities to sync UDFs for');
            return;
        }

        try {
            // First check if UDF columns exist in the table
            const columnCheck = await pool.query(`
                SELECT column_name FROM information_schema.columns 
                WHERE table_name = 'p6_activities' AND column_name = 'total_quantity'
            `);

            if (columnCheck.rows.length === 0) {
                console.log('[P6 Sync] UDF columns not yet added to database. Run migration first.');
                return;
            }

            // Fetch UDF values from P6
            const udfValues = await restClient.readActivityUDFValues(activityObjectIds);

            if (!udfValues || udfValues.length === 0) {
                console.log('[P6 Sync] No UDF values found for activities');
                return;
            }

            // Map UDF names to database columns (flexible matching)
            // Supports variations like "Total Quantity", "TotalQuantity", "TOTAL_QUANTITY", etc.
            const udfMapping = {
                // Total Quantity variations
                'total quantity': 'total_quantity',
                'totalquantity': 'total_quantity',
                'total_quantity': 'total_quantity',
                'qty': 'total_quantity',
                'quantity': 'total_quantity',

                // UOM variations
                'uom': 'uom',
                'unit': 'uom',
                'unit of measurement': 'uom',
                'unitofmeasurement': 'uom',

                // Block Capacity variations
                'block capacity': 'block_capacity',
                'blockcapacity': 'block_capacity',
                'block_capacity': 'block_capacity',
                'capacity': 'block_capacity',

                // Phase variations
                'phase': 'phase',

                // SPV No variations
                'spv no': 'spv_no',
                'spv no.': 'spv_no',
                'spvno': 'spv_no',
                'spv_no': 'spv_no',
                'spv number': 'spv_no',
                'spv': 'spv_no',

                // Scope variations
                'scope': 'scope',

                // Hold variations
                'hold': 'hold',
                'on hold': 'hold',
                'hold status': 'hold',

                // Front variations
                'front': 'front'
            };

            let updatedCount = 0;

            // Group UDF values by activity for batch updates
            const udfsByActivity = {};
            for (const udf of udfValues) {
                const activityId = udf.ForeignObjectId;
                if (!udfsByActivity[activityId]) {
                    udfsByActivity[activityId] = {};
                }

                // Normalize UDF name for matching
                const udfName = (udf.UDFTypeTitle || '').toLowerCase().trim();
                const column = udfMapping[udfName];

                if (column) {
                    // Extract value (could be Text, Double, Integer, or Date)
                    const value = udf.Text || udf.Double || udf.Integer || udf.StartDate || udf.FinishDate || null;
                    udfsByActivity[activityId][column] = value;
                }
            }

            // Update each activity with its UDF values
            for (const [activityId, udfs] of Object.entries(udfsByActivity)) {
                const columns = Object.keys(udfs);
                if (columns.length === 0) continue;

                // Build dynamic UPDATE query
                const setClause = columns.map((col, idx) => `${col} = $${idx + 2}`).join(', ');
                const values = [activityId, ...columns.map(col => udfs[col])];

                await pool.query(
                    `UPDATE p6_activities SET ${setClause} WHERE object_id = $1`,
                    values
                );
                updatedCount++;
            }

            console.log(`[P6 Sync] Updated UDF values for ${updatedCount} activities`);
        } catch (error) {
            // Log error but don't fail - UDFs are optional
            console.error('[P6 Sync] Error syncing UDFs:', error.message);
            throw error; // Re-throw so caller can log it
        }
    }

    /**
     * Sync Resource Assignments from P6 API
     * Fetches PlannedUnits, BudgetedUnits, UnitOfMeasure to populate Total Quantity and UOM
     * @param {number} projectId - P6 Project ObjectId
     */
    async _syncResourceAssignments(projectId) {
        try {
            // Fetch resource assignments from P6 API
            const assignments = await restClient.readResourceAssignments(projectId);

            if (!assignments || assignments.length === 0) {
                console.log('[P6 Sync] No resource assignments found for project');
                return;
            }

            console.log(`[P6 Sync] Processing ${assignments.length} resource assignments`);

            // Group assignments by activity and aggregate quantities
            const quantitiesByActivity = {};

            for (const assignment of assignments) {
                const activityId = assignment.ActivityObjectId;
                if (!activityId) continue;

                if (!quantitiesByActivity[activityId]) {
                    quantitiesByActivity[activityId] = {
                        totalQuantity: 0,
                        uom: null
                    };
                }

                // Use PlannedUnits or BudgetedUnits for Total Quantity
                const qty = assignment.PlannedUnits || assignment.BudgetedUnits || 0;
                quantitiesByActivity[activityId].totalQuantity += parseFloat(qty) || 0;

                // Get UOM from first assignment that has it
                if (!quantitiesByActivity[activityId].uom && assignment.UnitOfMeasure) {
                    quantitiesByActivity[activityId].uom = assignment.UnitOfMeasure;
                }
            }

            // Update activities with quantity data
            let updatedCount = 0;
            for (const [activityId, data] of Object.entries(quantitiesByActivity)) {
                try {
                    await pool.query(
                        `UPDATE p6_activities 
                         SET total_quantity = COALESCE($2, total_quantity),
                             uom = COALESCE($3, uom)
                         WHERE object_id = $1`,
                        [activityId, data.totalQuantity || null, data.uom]
                    );
                    updatedCount++;
                } catch (updateErr) {
                    console.error(`[P6 Sync] Failed to update activity ${activityId}:`, updateErr.message);
                }
            }

            console.log(`[P6 Sync] Updated quantity data for ${updatedCount} activities from resource assignments`);
        } catch (error) {
            console.error('[P6 Sync] Error syncing resource assignments:', error.message);
            throw error;
        }
    }

    /**
     * Sync Activity Codes from P6 API
     * Syncs activity code types, code values, and assignments
     * Denormalizes common codes (Priority, Plot) to activities table
     * @param {number} projectId - P6 Project ObjectId
     */
    async _syncActivityCodes(projectId) {
        try {
            // Step 1: Sync Activity Code Types (e.g., "Priority", "Plot", "Phase")
            const codeTypes = await restClient.readActivityCodeTypes(projectId);

            if (codeTypes.length === 0) {
                console.log('[P6 Sync] No activity code types found for project');
                return;
            }

            console.log(`[P6 Sync] Syncing ${codeTypes.length} activity code types...`);

            for (const codeType of codeTypes) {
                await pool.query(
                    `INSERT INTO p6_activity_code_types (object_id, project_object_id, code_type_name, description, sequence_number)
                     VALUES ($1, $2, $3, $4, $5)
                     ON CONFLICT (object_id) DO UPDATE SET
                        code_type_name = EXCLUDED.code_type_name,
                        description = EXCLUDED.description,
                        sequence_number = EXCLUDED.sequence_number,
                        last_sync_at = CURRENT_TIMESTAMP`,
                    [codeType.ObjectId, projectId, codeType.Name, codeType.Description, codeType.SequenceNumber]
                );
            }

            // Step 2: Sync Activity Code Values (e.g., "High", "Medium", "Low")
            const codes = await restClient.readActivityCodes(projectId);

            if (codes.length === 0) {
                console.log('[P6 Sync] No activity codes found for project');
                return;
            }

            console.log(`[P6 Sync] Syncing ${codes.length} activity code values...`);

            for (const code of codes) {
                await pool.query(
                    `INSERT INTO p6_activity_codes (object_id, code_type_object_id, code_value, description, short_name, color, sequence_number)
                     VALUES ($1, $2, $3, $4, $5, $6, $7)
                     ON CONFLICT (object_id) DO UPDATE SET
                        code_value = EXCLUDED.code_value,
                        description = EXCLUDED.description,
                        short_name = EXCLUDED.short_name,
                        color = EXCLUDED.color,
                        sequence_number = EXCLUDED.sequence_number,
                        last_sync_at = CURRENT_TIMESTAMP`,
                    [code.ObjectId, code.CodeTypeObjectId, code.CodeValue, code.Description, code.ShortName, code.Color, code.SequenceNumber]
                );
            }

            // Step 3: Sync Activity Code Assignments
            const assignments = await restClient.readActivityCodeAssignments(projectId);

            if (assignments.length === 0) {
                console.log('[P6 Sync] No activity code assignments found for project');
                return;
            }

            console.log(`[P6 Sync] Syncing ${assignments.length} activity code assignments...`);

            for (const assignment of assignments) {
                await pool.query(
                    `INSERT INTO p6_activity_code_assignments (object_id, activity_object_id, activity_code_object_id)
                     VALUES ($1, $2, $3)
                     ON CONFLICT (object_id) DO UPDATE SET
                        activity_object_id = EXCLUDED.activity_object_id,
                        activity_code_object_id = EXCLUDED.activity_code_object_id,
                        last_sync_at = CURRENT_TIMESTAMP`,
                    [assignment.ObjectId, assignment.ActivityObjectId, assignment.ActivityCodeObjectId]
                );
            }

            // Step 4: Denormalize common activity codes to activities table for performance
            // This makes it easy to query Priority, Plot, etc. without complex joins
            await this._denormalizeActivityCodes(projectId);

            console.log('[P6 Sync] Activity codes synced successfully');
        } catch (error) {
            console.error('[P6 Sync] Error syncing activity codes:', error.message);
            throw error;
        }
    }

    /**
     * Denormalize activity codes to p6_activities table
     * Extracts Priority, Plot, and New Block Nom codes and stores them directly on activities
     * @param {number} projectId - P6 Project ObjectId
     */
    async _denormalizeActivityCodes(projectId) {
        try {
            // Update Priority field
            await pool.query(`
                UPDATE p6_activities a
                SET priority = ac.code_value
                FROM p6_activity_code_assignments aca
                JOIN p6_activity_codes ac ON aca.activity_code_object_id = ac.object_id
                JOIN p6_activity_code_types act ON ac.code_type_object_id = act.object_id
                WHERE a.object_id = aca.activity_object_id
                  AND a.project_object_id = $1
                  AND LOWER(act.code_type_name) IN ('priority', 'priorities')
            `, [projectId]);

            // Update Plot Code field
            await pool.query(`
                UPDATE p6_activities a
                SET plot_code = ac.code_value
                FROM p6_activity_code_assignments aca
                JOIN p6_activity_codes ac ON aca.activity_code_object_id = ac.object_id
                JOIN p6_activity_code_types act ON ac.code_type_object_id = act.object_id
                WHERE a.object_id = aca.activity_object_id
                  AND a.project_object_id = $1
                  AND LOWER(act.code_type_name) IN ('plot', 'plots', 'block')
            `, [projectId]);

            // Update New Block Nom field
            await pool.query(`
                UPDATE p6_activities a
                SET new_block_nom = ac.code_value
                FROM p6_activity_code_assignments aca
                JOIN p6_activity_codes ac ON aca.activity_code_object_id = ac.object_id
                JOIN p6_activity_code_types act ON ac.code_type_object_id = act.object_id
                WHERE a.object_id = aca.activity_object_id
                  AND a.project_object_id = $1
                  AND LOWER(act.code_type_name) IN ('new block nom', 'newblocknom', 'block nom')
            `, [projectId]);

            console.log('[P6 Sync] Activity codes denormalized to activities table');
        } catch (error) {
            console.error('[P6 Sync] Error denormalizing activity codes:', error.message);
            // Don't throw - denormalization is optional optimization
        }
    }

    /**
     * Sync Resources from P6 API
     * Syncs contractor/resource information and links to activities
     * @param {number} projectId - P6 Project ObjectId
     */
    async _syncResources(projectId) {
        try {
            // Fetch all resources (may not support project filtering)
            const resources = await restClient.readResources(projectId);

            if (resources.length === 0) {
                console.log('[P6 Sync] No resources found');
                return;
            }

            console.log(`[P6 Sync] Syncing ${resources.length} resources...`);

            for (const resource of resources) {
                await pool.query(
                    `INSERT INTO p6_resources (object_id, resource_id, name)
                     VALUES ($1, $2, $3)
                     ON CONFLICT (object_id) DO UPDATE SET
                        resource_id = EXCLUDED.resource_id,
                        name = EXCLUDED.name,
                        last_sync_at = CURRENT_TIMESTAMP`,
                    [
                        resource.ObjectId,
                        resource.Id,
                        resource.Name
                    ]
                );
            }

            // Update contractor_name on activities from resource assignments
            // Use the primary resource or first resource assigned to each activity
            await pool.query(`
                UPDATE p6_activities a
                SET contractor_name = COALESCE(
                    (SELECT r.name 
                     FROM p6_resource_assignments ra
                     JOIN p6_resources r ON ra.resource_object_id = r.object_id
                     WHERE ra.activity_object_id = a.object_id
                       AND ra.is_primary_resource = true
                     LIMIT 1),
                    (SELECT r.name 
                     FROM p6_resource_assignments ra
                     JOIN p6_resources r ON ra.resource_object_id = r.object_id
                     WHERE ra.activity_object_id = a.object_id
                     ORDER BY ra.planned_units DESC
                     LIMIT 1)
                )
                WHERE a.project_object_id = $1
            `, [projectId]);

            console.log('[P6 Sync] Resources synced successfully');
        } catch (error) {
            console.error('[P6 Sync] Error syncing resources:', error.message);
            throw error;
        }
    }

    _toDate(dateStr) {

        return dateStr ? new Date(dateStr) : null;
    }


    /**
     * Get activities from local DB, joined with WBS
     * @param {number} projectId - P6 Project ObjectId
     * @param {Object} options - Pagination options
     * @param {number} options.page - Page number (1-indexed)
     * @param {number} options.limit - Number of items per page
     * @returns {Object} Activities with pagination metadata
     */
    async getActivities(projectId, { page = 1, limit = 50 } = {}) {
        const offset = (page - 1) * limit;

        // Get total count for pagination metadata
        const countSql = `SELECT COUNT(*) FROM p6_activities WHERE project_object_id = $1`;
        const countRes = await pool.query(countSql, [projectId]);
        const totalCount = parseInt(countRes.rows[0].count);

        // We join with WBS to get block/plot names (wbs.name or wbs.code)
        const sql = `
            SELECT 
                a.*,
                w.name as wbs_name,
                w.code as wbs_code
            FROM p6_activities a
            LEFT JOIN p6_wbs w ON a.wbs_object_id = w.object_id
            WHERE a.project_object_id = $1
            ORDER BY a.activity_id
            LIMIT $2 OFFSET $3
        `;
        const res = await pool.query(sql, [projectId, limit, offset]);

        const activities = res.rows.map((row, index) => ({
            ...this._mapToFrontendFormat(row),
            slNo: offset + index + 1  // Add sequential number across pages
        }));

        return {
            activities,
            pagination: {
                page,
                limit,
                totalCount,
                totalPages: Math.ceil(totalCount / limit),
                hasMore: offset + res.rows.length < totalCount
            }
        };
    }

    _mapToFrontendFormat(row) {
        return {
            // Core identifiers
            activityId: row.activity_id,
            objectId: row.object_id,
            // slNo: index + 1, // handled in controller or frontend

            // Description
            description: row.name,
            activities: row.name,

            // Status
            status: row.status,
            percentComplete: parseFloat(row.percent_complete) || 0,
            completionPercentage: String(parseFloat(row.percent_complete) || 0),

            // Dates (Formatting to simple YYYY-MM-DD for frontend strings)
            basePlanStart: this._formatDate(row.planned_start_date || row.start_date),
            basePlanFinish: this._formatDate(row.planned_finish_date || row.finish_date),
            actualStart: this._formatDate(row.actual_start_date),
            actualFinish: this._formatDate(row.actual_finish_date),
            forecastStart: this._formatDate(row.start_date), // Using start_date as forecast/current?
            forecastFinish: this._formatDate(row.finish_date),

            // WBS/Block
            block: row.wbs_name || '',
            plot: row.plot_code || row.wbs_code || '',  // Use ActivityCode plot if available, else WBS code

            // Activity Codes (synced from P6)
            priority: row.priority || '',
            plotCode: row.plot_code || '',
            newBlockNom: row.new_block_nom || '',

            // Resource Information
            contractorName: row.contractor_name || '',

            // UDF Values (synced from P6)
            totalQuantity: row.total_quantity ? String(row.total_quantity) : '',
            uom: row.uom || '',
            blockCapacity: row.block_capacity ? String(row.block_capacity) : '',
            phase: row.phase || row.wbs_name || '',  // Fallback to WBS name if no phase UDF
            spvNo: row.spv_no || '',
            scope: row.scope || '',
            hold: row.hold || '',
            front: row.front || '',
            remarks: ''
        };
    }

    _formatDate(dateObj) {
        if (!dateObj) return '';
        return dateObj.toISOString().split('T')[0];
    }
}

module.exports = new P6DataService();
