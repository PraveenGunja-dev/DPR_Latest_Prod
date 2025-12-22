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

async function checkAdminUser() {
  try {
    const result = await pool.query("SELECT user_id, name, email FROM users WHERE email = 'admin@adani.com'");
    console.log('Admin user details:', result.rows[0]);
  } catch (error) {
    console.error('Error checking admin user:', error);
  } finally {
    await pool.end();
  }
}

checkAdminUser();