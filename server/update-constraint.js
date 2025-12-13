// server/update-constraint.js
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

// Function to update the constraint
async function updateConstraint() {
  try {
    // First drop the existing constraint
    await pool.query(
      "ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check"
    );
    
    // Add the new constraint with Super Admin included
    await pool.query(
      "ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('supervisor', 'Site PM', 'PMAG', 'Super Admin'))"
    );
    
    console.log('Constraint updated successfully to include Super Admin role');
    
    // Verify the update
    const result = await pool.query(
      "SELECT pg_get_constraintdef(oid) as constraint_def FROM pg_constraint WHERE conname = 'users_role_check'"
    );
    
    console.log('New constraint definition:', result.rows[0].constraint_def);
    
    // Close the pool
    await pool.end();
  } catch (error) {
    console.error('Error updating constraint:', error);
    await pool.end();
  }
}

// Run the function
updateConstraint();