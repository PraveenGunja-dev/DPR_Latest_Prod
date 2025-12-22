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

async function checkSchema() {
  try {
    const result = await pool.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'p6_projects' AND column_name IN ('id', 'object_id')");
    console.log('ID columns in p6_projects:');
    result.rows.forEach(row => {
      console.log(`  ${row.column_name}: ${row.data_type}`);
    });
  } catch (error) {
    console.error('Error checking schema:', error);
  } finally {
    await pool.end();
  }
}

checkSchema();