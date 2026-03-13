const pool = require('./lib/dbPool');

async function countActivities() {
  try {
    const res = await pool.query('SELECT COUNT(*) FROM p6_activities');
    console.log(`✅ Total Activities: ${res.rows[0].count}`);
  } catch (err) {
    console.error('❌ Error counting activities:', err.message);
  } finally {
    await pool.end();
  }
}

countActivities();
