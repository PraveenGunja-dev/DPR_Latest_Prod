// backend/scripts/lib/dbPool.js
// Shared database pool configuration for all scripts
// Supports both DATABASE_URL and individual PG* variables

const { Pool } = require('pg');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables from backend/.env
const envPath = path.resolve(__dirname, '../../.env');
console.log('Loading .env from:', envPath);
dotenv.config({ path: envPath });

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

    console.log(`Configuring DB Connection to: ${dbHost} (SSL: ${!isLocal})`);

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

module.exports = pool;
