// backend/scripts/test-insert.js
const pool = require('./lib/dbPool');

async function testInsert() {
    try {
        console.log('Testing INSERT into p6_projects...');

        // Try simplest insert first
        const query = `
            INSERT INTO p6_projects (
                "objectId", "projectId", name, description, status,
                "startDate", "finishDate", "plannedStartDate", "plannedFinishDate",
                "dataDate", "lastSyncAt"
            ) VALUES (
                12345, 'TEST-001', 'Test Project', 'Description', 'Active',
                NULL, NULL, NULL, NULL,
                NULL, CURRENT_TIMESTAMP
            )
            ON CONFLICT ("objectId") DO UPDATE SET
                "projectId" = EXCLUDED."projectId",
                name = EXCLUDED.name,
                description = EXCLUDED.description,
                status = EXCLUDED.status,
                "startDate" = EXCLUDED."startDate",
                "finishDate" = EXCLUDED."finishDate",
                "plannedStartDate" = EXCLUDED."plannedStartDate",
                "plannedFinishDate" = EXCLUDED."plannedFinishDate",
                "dataDate" = EXCLUDED."dataDate",
                "lastSyncAt" = CURRENT_TIMESTAMP
            RETURNING (xmax = 0) AS inserted;
        `;

        console.log('Query:', query);
        const res = await pool.query(query);
        console.log('SUCCESS:', res.rows[0]);

        // Clean up
        await pool.query('DELETE FROM p6_projects WHERE "objectId" = 12345');

    } catch (err) {
        console.error('FAILURE:', err.message);
        console.error('Code:', err.code);
        if (err.position) console.error('Position:', err.position);
    } finally {
        pool.end();
    }
}
testInsert();
