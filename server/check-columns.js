const { Pool } = require('pg');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// PostgreSQL connection pool
const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

async function checkColumns() {
  try {
    const result = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'p6_projects' AND column_name LIKE '%finish%'");
    console.log('Finish-related columns in p6_projects:', result.rows.map(r => r.column_name));
    
    // Also check all date-related columns
    const dateColumns = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'p6_projects' AND column_name LIKE '%date%'");
    console.log('All date-related columns in p6_projects:', dateColumns.rows.map(r => r.column_name));
  } catch (error) {
    console.error('Error checking columns:', error);
  } finally {
    await pool.end();
  }
}

checkColumns();