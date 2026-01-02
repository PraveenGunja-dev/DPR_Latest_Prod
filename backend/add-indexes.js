const pool = require('./db');

async function addIndexes() {
    try {
        console.log('=== Adding Performance Indexes ===\n');

        // Index for p6_activities project lookup
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_p6_activities_project ON p6_activities(project_object_id)`);
        console.log('✓ Added idx_p6_activities_project');

        // Index for p6_activities by name
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_p6_activities_name ON p6_activities(name)`);
        console.log('✓ Added idx_p6_activities_name');

        // Index for p6_resources by name
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_p6_resources_name ON p6_resources(name)`);
        console.log('✓ Added idx_p6_resources_name');

        // Index for dpr_supervisor_entries
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_dpr_entries_project ON dpr_supervisor_entries(project_id)`);
        console.log('✓ Added idx_dpr_entries_project');

        await pool.query(`CREATE INDEX IF NOT EXISTS idx_dpr_entries_status ON dpr_supervisor_entries(status)`);
        console.log('✓ Added idx_dpr_entries_status');

        // Analyze tables
        console.log('\nAnalyzing tables for query optimizer...');
        await pool.query('ANALYZE p6_activities');
        await pool.query('ANALYZE p6_resources');
        await pool.query('ANALYZE dpr_supervisor_entries');
        console.log('✓ Tables analyzed');

        console.log('\n✓ All indexes added successfully!');

    } catch (error) {
        console.error('Error:', error.message);
    } finally {
        pool.end();
    }
}

addIndexes();
