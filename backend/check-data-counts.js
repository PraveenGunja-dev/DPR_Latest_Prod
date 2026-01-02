const pool = require('./db');

async function checkDataCounts() {
    try {
        console.log('=== Checking Data Counts ===\n');

        // Count p6_activities
        const activities = await pool.query('SELECT COUNT(*) FROM p6_activities');
        console.log(`p6_activities: ${activities.rows[0].count} rows`);

        // Count p6_resources
        const resources = await pool.query('SELECT COUNT(*) FROM p6_resources');
        console.log(`p6_resources: ${resources.rows[0].count} rows`);

        // Count by project
        const byProject = await pool.query(`
      SELECT project_object_id, COUNT(*) as count 
      FROM p6_activities 
      GROUP BY project_object_id 
      ORDER BY count DESC 
      LIMIT 5
    `);
        console.log('\nActivities by project (top 5):');
        byProject.rows.forEach(r => {
            console.log(`  Project ${r.project_object_id}: ${r.count} activities`);
        });

    } catch (error) {
        console.error('Error:', error.message);
    } finally {
        pool.end();
    }
}

checkDataCounts();
