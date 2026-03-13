// server/db.js
const { Pool } = require('pg');

// PostgreSQL connection pool
// Supports both DATABASE_URL (connection string) and individual PG* variables
const databaseUrl = process.env.DATABASE_URL;
const dbHost = process.env.PGHOST || process.env.DB_HOST;

// Validate that we have either DATABASE_URL or individual variables
if (!databaseUrl && (!dbHost || !process.env.PGUSER && !process.env.DB_USER)) {
  console.error('ERROR: Missing required database environment variables!');
  console.error('Either set DATABASE_URL or set PGHOST, PGUSER, PGPASSWORD');
  process.exit(1);
}

// Determine if connection is local (for SSL config when using individual vars)
const isLocal = dbHost === 'localhost' || dbHost === '127.0.0.1';

// Build pool configuration
let poolConfig;
if (databaseUrl) {
  console.log('Using DATABASE_URL connection string');
  poolConfig = {
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false },
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 15000,
  };
} else {
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
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 15000,
  };
}

// PostgreSQL connection pool
const pool = new Pool(poolConfig);

// Test database connection
pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('Database connection error:', err.stack);
  } else {
    console.log('Database connected successfully at:', res.rows[0].now);
  }
});

module.exports = pool;