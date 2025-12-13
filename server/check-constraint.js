// server/check-constraint.js
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

// Function to check the constraint
async function checkConstraint() {
  try {
    const result = await pool.query(
      "SELECT pg_get_constraintdef(oid) as constraint_def FROM pg_constraint WHERE conname = 'users_role_check'"
    );
    
    console.log('Constraint definition:', result.rows[0].constraint_def);
    
    // Close the pool
    await pool.end();
  } catch (error) {
    console.error('Error checking constraint:', error);
    await pool.end();
  }
}

// Run the function
checkConstraint();