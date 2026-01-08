
const { Pool } = require('pg');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables
dotenv.config();
// Also try parent directory
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5431,
    database: process.env.DB_NAME || 'postgres',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'Prvn@3315',
});

async function checkDb() {
    try {
        console.log('Connected to database');

        // Check if table exists
        const res = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name = 'issue_logs'
    `);

        // Check column names for multiple tables
        const tables = ['issue_logs', 'users', 'projects', 'p6_projects'];

        for (const table of tables) {
            console.log(`\n--- Schema for ${table} ---`);
            const cols = await pool.query(`
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name = '${table}'
      `);
            if (cols.rows.length === 0) {
                console.log(`Table ${table} NOT FOUND or NO COLUMNS`);
            } else {
                console.log('Columns:', cols.rows.map(r => r.column_name).join(', '));
            }
        }

        // Check first 5 issues to see data
        try {
            const rows = await pool.query('SELECT * FROM issue_logs LIMIT 5');
            console.log('\n--- Issue Logs Data (first 1) ---');
            if (rows.rows.length > 0) {
                console.log(JSON.stringify(rows.rows[0], null, 2));
            } else {
                console.log('No issues found.');
            }
        } catch (err) {
            console.error('Error selecting from issue_logs:', err.message);
        }
    }

    } catch (err) {
    console.error('Database error:', err);
} finally {
    await pool.end();
}
}

checkDb();
