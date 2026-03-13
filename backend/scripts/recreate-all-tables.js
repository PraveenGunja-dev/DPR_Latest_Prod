// backend/scripts/recreate-all-p6-tables.js
const pool = require('./lib/dbPool');

async function recreateAllTables() {
    try {
        console.log('Dropping existing P6 tables...');
        // Order matters for Foreign Keys if they existed (dropping cascade generally handles it or drop child first)
        await pool.query('DROP TABLE IF EXISTS p6_sync_log CASCADE');
        await pool.query('DROP TABLE IF EXISTS p6_resource_assignments CASCADE');
        await pool.query('DROP TABLE IF EXISTS p6_activity_code_assignments CASCADE');
        await pool.query('DROP TABLE IF EXISTS p6_activity_codes CASCADE');
        await pool.query('DROP TABLE IF EXISTS p6_activity_code_types CASCADE');
        await pool.query('DROP TABLE IF EXISTS p6_activities CASCADE');
        await pool.query('DROP TABLE IF EXISTS p6_wbs CASCADE');
        await pool.query('DROP TABLE IF EXISTS p6_resources CASCADE');
        await pool.query('DROP TABLE IF EXISTS p6_projects CASCADE'); // Already done but good to be included

        console.log('Creating tables with Oracle-style CamelCase columns...');

        // 1. PROJECTS
        console.log('- p6_projects');
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

        // 2. WBS
        console.log('- p6_wbs');
        await pool.query(`
            CREATE TABLE p6_wbs (
                "ObjectId" INTEGER PRIMARY KEY,
                "ProjectObjectId" INTEGER,
                "ParentObjectId" INTEGER,
                "Code" VARCHAR(255),
                "Name" VARCHAR(255),
                "Status" VARCHAR(50),
                "LastSyncAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // 3. RESOURCES
        console.log('- p6_resources');
        await pool.query(`
            CREATE TABLE p6_resources (
                "ObjectId" INTEGER PRIMARY KEY,
                "Id" VARCHAR(255),
                "Name" VARCHAR(255),
                "ResourceType" VARCHAR(50),
                "LastSyncAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // 4. ACTIVITIES
        console.log('- p6_activities');
        // Note: Including local UDF fields as CamelCase for consistency
        await pool.query(`
            CREATE TABLE p6_activities (
                "ObjectId" INTEGER PRIMARY KEY,
                "Id" VARCHAR(255),
                "Name" VARCHAR(255),
                "ProjectObjectId" INTEGER,
                "WBSObjectId" INTEGER,
                "Status" VARCHAR(50),
                "PercentComplete" DECIMAL(5,2),
                "StartDate" TIMESTAMP WITH TIME ZONE,
                "FinishDate" TIMESTAMP WITH TIME ZONE,
                "PlannedStartDate" TIMESTAMP WITH TIME ZONE,
                "PlannedFinishDate" TIMESTAMP WITH TIME ZONE,
                "ActualStartDate" TIMESTAMP WITH TIME ZONE,
                "ActualFinishDate" TIMESTAMP WITH TIME ZONE,
                "TotalQuantity" DECIMAL(15,2),
                "UOM" VARCHAR(50),
                "ContractorName" VARCHAR(255),
                "BlockCapacity" VARCHAR(100),
                "Phase" VARCHAR(100),
                "SPVNo" VARCHAR(100),
                "Scope" VARCHAR(100),
                "Hold" VARCHAR(100),
                "Front" VARCHAR(100),
                "Priority" VARCHAR(100),
                "PlotCode" VARCHAR(100),
                "NewBlockNom" VARCHAR(100),
                "LastSyncAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // 5. ACTIVITY CODE TYPES
        console.log('- p6_activity_code_types');
        await pool.query(`
            CREATE TABLE p6_activity_code_types (
                "ObjectId" INTEGER PRIMARY KEY,
                "ProjectObjectId" INTEGER,
                "Name" VARCHAR(255),
                "Description" TEXT,
                "SequenceNumber" INTEGER,
                "LastSyncAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // 6. ACTIVITY CODES
        console.log('- p6_activity_codes');
        await pool.query(`
            CREATE TABLE p6_activity_codes (
                "ObjectId" INTEGER PRIMARY KEY,
                "CodeTypeObjectId" INTEGER,
                "CodeValue" VARCHAR(255),
                "Description" TEXT,
                "ShortName" VARCHAR(50),
                "Color" VARCHAR(50),
                "SequenceNumber" INTEGER,
                "LastSyncAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // 7. ACTIVITY CODE ASSIGNMENTS
        console.log('- p6_activity_code_assignments');
        await pool.query(`
            CREATE TABLE p6_activity_code_assignments (
                "ObjectId" INTEGER PRIMARY KEY,
                "ActivityObjectId" INTEGER,
                "ActivityCodeObjectId" INTEGER,
                "LastSyncAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // 8. RESOURCE ASSIGNMENTS
        console.log('- p6_resource_assignments');
        await pool.query(`
            CREATE TABLE p6_resource_assignments (
                "ObjectId" INTEGER PRIMARY KEY,
                "ActivityObjectId" INTEGER,
                "ResourceObjectId" INTEGER,
                "PlannedUnits" DECIMAL(15,2),
                "BudgetedUnits" DECIMAL(15,2),
                "ActualUnits" DECIMAL(15,2),
                "RemainingUnits" DECIMAL(15,2),
                "UnitOfMeasure" VARCHAR(50),
                "LastSyncAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // 9. SYNC LOG
        console.log('- p6_sync_log');
        await pool.query(`
            CREATE TABLE p6_sync_log (
                id SERIAL PRIMARY KEY,
                "ProjectObjectId" INTEGER,
                "SyncType" VARCHAR(50),
                "Status" VARCHAR(50),
                "ErrorMessage" TEXT,
                "CompletedAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);

        console.log('✅ All P6 Tables recreated successfully with Oracle-style schema.');
        pool.end();
    } catch (err) {
        console.error('❌ Error recreating tables:', err);
        pool.end();
    }
}

recreateAllTables();
