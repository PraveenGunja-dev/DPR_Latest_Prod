require('dotenv').config();
const pool = require('./db');

async function listColumns() {
    try {
        const tables = ['p6_projects', 'p6_activities', 'p6_resource_assignments', 'p6_wbs'];
        for (const table of tables) {
            console.log(`\n--- Columns for ${table} ---`);
            const res = await pool.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = '${table}'
        ORDER BY ordinal_position;
      `);
            console.table(res.rows);
        }
        pool.end();
    } catch (err) {
        console.error('Error listing columns:', err);
        process.exit(1);
    }
}

listColumns();
