// server/services/oracleP6SyncService.js
// Service to sync Oracle P6 data to local database

const { restClient } = require('./oracleP6RestClient');

/**
 * Sync projects from Oracle P6 to local database
 * @param {Object} pool - Database connection pool
 * @param {string} token - OAuth token (optional)
 * @returns {Promise<Object>} Sync result
 */
async function syncProjectsFromP6(pool, token = null) {
    console.log('[P6 Sync] Starting project sync from Oracle P6...');

    if (token) {
        restClient.setToken(token);
    }

    // Fetch all projects from P6 REST API with basic fields
    const p6Projects = await restClient.readProjects([
        'ObjectId', 'Id', 'Name', 'Description', 'Status',
        'StartDate', 'FinishDate', 'ParentEPSName'
    ]);

    console.log(`[P6 Sync] Retrieved ${p6Projects.length} projects from P6`);

    let inserted = 0;
    let updated = 0;
    let errors = 0;

    for (const project of p6Projects) {
        try {
            // Upsert project to database
            const result = await pool.query(`
        INSERT INTO p6_projects (
          "ObjectId", "Id", "Name", "Description", "Status",
          "StartDate", "FinishDate", "PlannedStartDate", "PlannedFinishDate",
          "DataDate", "LastSyncAt"
        ) VALUES (
          $1, $2, $3, $4, $5,
          $6, $7, $8, $9,
          $10, 
          CURRENT_TIMESTAMP
        )
        ON CONFLICT ("ObjectId") DO UPDATE SET
          "Id" = EXCLUDED."Id",
          "Name" = EXCLUDED."Name",
          "Description" = EXCLUDED."Description",
          "Status" = EXCLUDED."Status",
          "StartDate" = EXCLUDED."StartDate",
          "FinishDate" = EXCLUDED."FinishDate",
          "PlannedStartDate" = EXCLUDED."PlannedStartDate",
          "PlannedFinishDate" = EXCLUDED."PlannedFinishDate",
          "DataDate" = EXCLUDED."DataDate",
          "LastSyncAt" = CURRENT_TIMESTAMP
        RETURNING (xmax = 0) AS inserted
      `, [
                parseInt(project.ObjectId) || null,
                project.Id || null,
                project.Name || 'Unnamed Project',
                project.Description || null,
                project.Status || 'Active',
                project.StartDate || null,
                project.FinishDate || null,
                project.PlannedStartDate || null,
                project.ScheduledFinishDate || null,
                project.DataDate || null
            ]);

            if (result.rows[0]?.inserted) {
                inserted++;
            } else {
                updated++;
            }

        } catch (err) {
            console.error(`[P6 Sync] Error syncing project ${project.ObjectId}:`, err.message);
            errors++;
        }
    }

    console.log(`[P6 Sync] Sync complete: ${inserted} inserted, ${updated} updated, ${errors} errors`);

    return {
        success: true,
        totalFromP6: p6Projects.length,
        inserted,
        updated,
        errors,
        syncedAt: new Date().toISOString()
    };
}

/**
 * Get all projects from local database (synced from P6)
 * @param {Object} pool - Database connection pool
 * @param {Object} filters - Optional filters
 * @returns {Promise<Array>} Projects
 */
async function getProjectsFromDb(pool, filters = {}) {
    let query = 'SELECT * FROM p6_projects';
    const params = [];
    const conditions = [];

    if (filters.status) {
        conditions.push(`"Status" = $${params.length + 1}`);
        params.push(filters.status);
    }

    if (filters.search) {
        conditions.push(`("Name" ILIKE $${params.length + 1} OR "Id" ILIKE $${params.length + 1})`);
        params.push(`%${filters.search}%`);
    }

    if (conditions.length > 0) {
        query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY "Name" ASC';

    const result = await pool.query(query, params);
    return result.rows;
}

/**
 * Get a single project by ObjectId
 * @param {Object} pool - Database connection pool
 * @param {number} objectId - P6 ObjectId
 * @returns {Promise<Object|null>} Project or null
 */
async function getProjectByObjectId(pool, objectId) {
    const result = await pool.query(
        'SELECT * FROM p6_projects WHERE "ObjectId" = $1',
        [objectId]
    );
    return result.rows[0] || null;
}

module.exports = {
    syncProjectsFromP6,
    getProjectsFromDb,
    getProjectByObjectId
};
