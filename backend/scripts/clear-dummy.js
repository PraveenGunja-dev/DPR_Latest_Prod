const { Pool } = require('pg');
const path = require('path');
const dotenv = require('dotenv');

// Load environment variables
const envPath = path.resolve(__dirname, '../.env');
console.log('Loading .env from:', envPath);
dotenv.config({ path: envPath });

const databaseUrl = process.env.DATABASE_URL;
const poolConfig = databaseUrl ? {
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false }
} : {
    host: process.env.PGHOST || process.env.DB_HOST,
    port: process.env.PGPORT || process.env.DB_PORT || 5432,
    database: process.env.PGDATABASE || process.env.DB_NAME,
    user: process.env.PGUSER || process.env.DB_USER,
    password: process.env.PGPASSWORD || process.env.DB_PASSWORD,
    ssl: { rejectUnauthorized: false }
};

const pool = new Pool(poolConfig);

async function cleanupDummyProjects() {
    const client = await pool.connect();
    try {
        console.log('Connected to database. Starting cleanup...');

        // First check if there are any projects in the local projects table
        const checkRes = await client.query('SELECT COUNT(*) FROM projects');
        const projectCount = parseInt(checkRes.rows[0].count);

        if (projectCount === 0) {
            console.log('No projects found in the local projects table. Nothing to clean up.');
            return;
        }

        console.log(`Found ${projectCount} items in local projects table.`);

        // We need to delete from dependent tables first due to foreign keys
        // Unless CASCADE is set up, but let's be safe

        console.log('Deleting from project_assignments where project_id refers to local projects...');
        // We check if project_id exists in local 'projects' table
        await client.query(`
      DELETE FROM project_assignments 
      WHERE project_id IN (SELECT id FROM projects)
    `);

        console.log('Deleting from dpr_sheets where project_id refers to local projects...');
        await client.query(`
      DELETE FROM dpr_sheets 
      WHERE project_id IN (SELECT id FROM projects)
    `);

        console.log('Truncating local projects table...');
        // TRUNCATE is faster and resets the sequence
        await client.query('TRUNCATE TABLE projects CASCADE');

        console.log('✓ Cleanup completed successfully. All dummy projects removed.');
        console.log('Only P6 projects (p6_projects table) remain available.');

    } catch (error) {
        console.error('Error during cleanup:', error);
    } finally {
        client.release();
        await pool.end();
    }
}

cleanupDummyProjects();
