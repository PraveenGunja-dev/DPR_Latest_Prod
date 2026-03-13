
const { Pool } = require('pg');
const path = require('path');
const dotenv = require('dotenv');

// Load env vars like server.js does
const result = dotenv.config({ path: path.resolve(__dirname, '../.env') });
if (result.error) {
    dotenv.config({ path: path.resolve(__dirname, '../../.env') });
}

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    host: process.env.PGHOST || process.env.DB_HOST,
    port: process.env.PGPORT || process.env.DB_PORT,
    database: process.env.PGDATABASE || process.env.DB_NAME,
    user: process.env.PGUSER || process.env.DB_USER,
    password: process.env.PGPASSWORD || process.env.DB_PASSWORD,
    ssl: (process.env.PGHOST === 'localhost' || process.env.DB_HOST === 'localhost') ? false : { rejectUnauthorized: false }
});

async function fixSchema() {
    try {
        console.log('Fixing schema types...');

        // 1. project_assignments
        console.log('Altering project_assignments.project_id to BIGINT...');
        await pool.query('ALTER TABLE project_assignments ALTER COLUMN project_id TYPE BIGINT');

        // 2. dpr_supervisor_entries
        console.log('Altering dpr_supervisor_entries.project_id to BIGINT...');
        await pool.query('ALTER TABLE dpr_supervisor_entries ALTER COLUMN project_id TYPE BIGINT');

        // 3. dpr_sheets (legacy but good to maintain just in case)
        console.log('Altering dpr_sheets.project_id to BIGINT...');
        try {
            await pool.query('ALTER TABLE dpr_sheets ALTER COLUMN project_id TYPE BIGINT');
        } catch (e) {
            console.log('dpr_sheets might not exist or err:', e.message);
        }

        console.log('Schema fixed successfully.');
    } catch (err) {
        console.error('Error fixing schema:', err);
    } finally {
        pool.end();
    }
}

fixSchema();
