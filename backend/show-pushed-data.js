const pool = require('./db');

async function showPushedData() {
    try {
        // Show recently pushed entries
        console.log('=== Recently Pushed Entries (final_approved) ===');
        const entries = await pool.query(`
      SELECT id, sheet_type, status, pushed_at, pushed_by 
      FROM dpr_supervisor_entries 
      WHERE status = 'final_approved' 
      ORDER BY pushed_at DESC 
      LIMIT 10
    `);
        console.table(entries.rows);

        // Show recently updated P6 activities
        console.log('\n=== Recently Updated P6 Activities ===');
        const activities = await pool.query(`
      SELECT activity_id, name, percent_complete, actual_non_labor_units, updated_at
      FROM p6_activities 
      WHERE updated_at > NOW() - INTERVAL '1 hour'
      ORDER BY updated_at DESC 
      LIMIT 10
    `);
        console.table(activities.rows);

    } catch (error) {
        console.error('Error:', error.message);
    } finally {
        pool.end();
    }
}

showPushedData();
