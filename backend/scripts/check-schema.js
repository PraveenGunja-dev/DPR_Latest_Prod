// backend/scripts/check-schema.js
const pool = require('./lib/dbPool');

async function checkSchema() {
    try {
        const t = 'p6_projects';
        console.log(`\nChecking columns for ${t}...`);
        const res = await pool.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = '${t}'
            ORDER BY ordinal_position;
        `);
        const columns = res.rows.map(row => row.column_name);
        console.log(columns.join('\n'));

        pool.end();
    } catch (err) {
        console.error('Error checking schema:', err);
        pool.end();
    }
}

checkSchema();
