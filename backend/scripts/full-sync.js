const { Pool } = require('pg');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables
const envPath = path.resolve(__dirname, '../.env');
console.log('Loading .env from:', envPath);
dotenv.config({ path: envPath });

const { syncProjectsFromP6 } = require('../services/oracleP6SyncService');
const p6DataService = require('../services/p6DataService');

// Get database configuration
const databaseUrl = process.env.DATABASE_URL;
const dbHost = process.env.PGHOST || process.env.DB_HOST;

// Validate that we have either DATABASE_URL or individual variables
if (!databaseUrl && (!dbHost || !process.env.PGUSER && !process.env.DB_USER)) {
    console.error('ERROR: Missing required database environment variables!');
    console.error('Either set DATABASE_URL or set PGHOST, PGUSER, PGPASSWORD');
    process.exit(1);
}

// Build pool configuration
let poolConfig;
if (databaseUrl) {
    console.log('Using DATABASE_URL connection string');
    poolConfig = {
        connectionString: databaseUrl,
        ssl: { rejectUnauthorized: false },
        connectionTimeoutMillis: 15000,
    };
} else {
    const isLocal = dbHost === 'localhost' || dbHost === '127.0.0.1';
    const dbPort = process.env.PGPORT || process.env.DB_PORT;
    const dbName = process.env.PGDATABASE || process.env.DB_NAME;
    const dbUser = process.env.PGUSER || process.env.DB_USER;
    const dbPassword = process.env.PGPASSWORD || process.env.DB_PASSWORD;

    console.log(`Configuring Script DB Connection to: ${dbHost} (SSL: ${!isLocal})`);

    poolConfig = {
        host: dbHost,
        port: parseInt(dbPort, 10) || 5432,
        database: dbName || 'postgres',
        user: dbUser,
        password: dbPassword,
        ssl: isLocal ? false : { rejectUnauthorized: false },
        connectionTimeoutMillis: 15000,
    };
}

// PostgreSQL connection pool
const pool = new Pool(poolConfig);

async function runFullSync() {
    try {
        console.log('Starting FULL SYNC of Oracle P6 Data...');

        // 1. Sync Project List
        console.log('\n--- Step 1: Syncing Project List ---');
        const projectSyncResult = await syncProjectsFromP6(pool, null);
        console.log(`Synced ${projectSyncResult.totalFromP6} projects.`);

        // 1.5 Sync Global Resources Once
        console.log('\n--- Step 1.5: Syncing Global Resources ---');
        await p6DataService.syncAllResources();

        // 2. Fetch all projects to iterate
        const res = await pool.query('SELECT "ObjectId", "Name" FROM p6_projects ORDER BY "Name"');
        const projects = res.rows;

        console.log(`\n--- Step 2: Syncing Details for ${projects.length} Projects ---`);

        for (const [index, project] of projects.entries()) {
            const projectId = project.ObjectId;
            console.log(`\n[${index + 1}/${projects.length}] Syncing Project: ${project.Name} (ID: ${projectId})`);

            try {
                await p6DataService.syncProject(projectId);
            } catch (err) {
                console.error(`Failed to sync project ${project.name}:`, err.message);
            }
        }

        console.log('\n--- FULL SYNC COMPLETED ---');
    } catch (error) {
        console.error('Fatal Error during full sync:', error);
    } finally {
        await pool.end();
    }
}

runFullSync();
