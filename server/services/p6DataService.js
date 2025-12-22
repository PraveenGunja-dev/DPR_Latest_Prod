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
            await this._syncActivities(client, projectId);

            // 3. Sync UDFs (Qty, etc.) - TBD, for now just basic fields

            await client.query('COMMIT');
            logEntry.status = 'completed';
            console.log(`[P6 Sync] Completed successfully for ${projectId}`);
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
        // Fetch Activities
        // Avoid 'Duration' field as it caused 400 errors
        const fields = [
            'ObjectId', 'Id', 'Name', 'Status', 'PercentComplete',
            'StartDate', 'FinishDate', 'PlannedStartDate', 'PlannedFinishDate',
            'ActualStartDate', 'ActualFinishDate', 'RemainingEarlyStartDate', 'RemainingEarlyFinishDate',
            'WBSObjectId', 'ActualDuration', 'RemainingDuration'
        ];

        const activities = await restClient.readActivities(fields, projectId);

        for (const act of activities) {
            await client.query(
                `INSERT INTO p6_activities (
                    object_id, activity_id, name, project_object_id, wbs_object_id,
                    status, percent_complete, 
                    start_date, finish_date,
                    planned_start_date, planned_finish_date,
                    actual_start_date, actual_finish_date,
                    actual_duration, remaining_duration,
                    last_sync_at
                ) VALUES (
                    $1, $2, $3, $4, $5,
                    $6, $7, 
                    $8, $9,
                    $10, $11,
                    $12, $13,
                    $14, $15,
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
                    last_sync_at = CURRENT_TIMESTAMP`,
                [
                    act.ObjectId, act.Id, act.Name, projectId, act.WBSObjectId,
                    act.Status, act.PercentComplete || 0,
                    this._toDate(act.StartDate), this._toDate(act.FinishDate),
                    this._toDate(act.PlannedStartDate), this._toDate(act.PlannedFinishDate),
                    this._toDate(act.ActualStartDate), this._toDate(act.ActualFinishDate),
                    act.ActualDuration, act.RemainingDuration
                ]
            );
        }
    }

    _toDate(dateStr) {
        return dateStr ? new Date(dateStr) : null;
    }

    /**
     * Get activities from local DB, joined with WBS
     */
    async getActivities(projectId) {
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
        `;
        const res = await pool.query(sql, [projectId]);
        return res.rows.map(row => this._mapToFrontendFormat(row));
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
            plot: row.wbs_code || '',

            // Placeholders for UDFs (future sync)
            totalQuantity: '',
            uom: '',
            remarks: ''
        };
    }

    _formatDate(dateObj) {
        if (!dateObj) return '';
        return dateObj.toISOString().split('T')[0];
    }
}

module.exports = new P6DataService();
