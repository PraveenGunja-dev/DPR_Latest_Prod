// backend/scripts/recreate-p6-table.js
const pool = require('./lib/dbPool');

async function recreateTable() {
    try {
        console.log('Dropping existing p6_projects table...');
        await pool.query('DROP TABLE IF EXISTS p6_projects');

        console.log('Creating p6_projects table with Oracle-style columns...');
        await pool.query(`
            CREATE TABLE p6_projects (
                "ObjectId" INTEGER PRIMARY KEY,
                "Id" VARCHAR(255),
                "Name" VARCHAR(255),
                "Description" TEXT,
                "Status" VARCHAR(50),
                "StartDate" TIMESTAMP WITH TIME ZONE,
                "FinishDate" TIMESTAMP WITH TIME ZONE,
                "PlannedStartDate" TIMESTAMP WITH TIME ZONE,
                "PlannedFinishDate" TIMESTAMP WITH TIME ZONE,
                "DataDate" TIMESTAMP WITH TIME ZONE,
                "LastSyncAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);
        // Note: Using "ObjectId" as Primary Key directly since it's unique in P6

        console.log('✅ Table p6_projects recreated successfully.');
        pool.end();
    } catch (err) {
        console.error('❌ Error recreating table:', err);
        pool.end();
    }
}

recreateTable();
