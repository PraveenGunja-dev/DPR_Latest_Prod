// Run P6 Schema Rewrite Migration
// Execute with: node database/migrations/run_p6_schema_rewrite.js

const fs = require('fs');
const path = require('path');
const pool = require('../../db');

async function runMigration() {
    console.log('===========================================');
    console.log('P6 SCHEMA FRESH REWRITE MIGRATION');
    console.log('===========================================');
    console.log('');
    console.log('WARNING: This will DROP and RECREATE all P6 tables!');
    console.log('');

    try {
        const migrationPath = path.join(__dirname, 'p6_schema_rewrite.sql');
        const sql = fs.readFileSync(migrationPath, 'utf8');

        console.log('Executing migration...');
        console.log('');

        await pool.query(sql);

        console.log('✓ Migration completed successfully!');
        console.log('');

        // Verify tables were created
        const tables = await pool.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name LIKE 'p6_%'
            ORDER BY table_name
        `);

        console.log('Created P6 tables:');
        for (const row of tables.rows) {
            console.log(`  - ${row.table_name}`);
        }

        // Verify view was created
        const views = await pool.query(`
            SELECT table_name 
            FROM information_schema.views 
            WHERE table_schema = 'public' 
            AND table_name LIKE 'v_p6_%'
        `);

        console.log('');
        console.log('Created views:');
        for (const row of views.rows) {
            console.log(`  - ${row.table_name}`);
        }

        console.log('');
        console.log('===========================================');
        console.log('NEXT STEP: Run P6 sync to populate data');
        console.log('  node sync-all-p6.js');
        console.log('===========================================');

    } catch (error) {
        console.error('Migration failed:', error.message);
        console.error(error);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

runMigration();
