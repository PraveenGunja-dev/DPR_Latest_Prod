const { Pool } = require('pg');

// Database connection configuration
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5431,
  database: process.env.DB_NAME || 'postgres',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'Prvn@3315',
});

async function checkConstraints() {
  try {
    console.log('Checking DPR sheets constraints...\n');
    
    // Check dpr_sheets constraints
    const constraints = await pool.query(`
      SELECT conname, pg_get_constraintdef(c.oid) as definition
      FROM pg_constraint c 
      JOIN pg_namespace n ON n.oid = c.connamespace 
      WHERE contype = 'c' AND conrelid = 'dpr_sheets'::regclass
    `);
    
    console.log('DPR Sheets Constraints:');
    constraints.rows.forEach(row => {
      console.log(`${row.conname}: ${row.definition}`);
    });
    
    // Also check what values already exist in the table
    console.log('\nExisting sheet types in table:');
    const sheetTypes = await pool.query(`
      SELECT DISTINCT sheet_type FROM dpr_sheets LIMIT 10
    `);
    sheetTypes.rows.forEach(row => {
      console.log(`- ${row.sheet_type}`);
    });
    
    // Check existing status values
    console.log('\nExisting status values in table:');
    const statusValues = await pool.query(`
      SELECT DISTINCT status FROM dpr_sheets LIMIT 10
    `);
    statusValues.rows.forEach(row => {
      console.log(`- ${row.status}`);
    });
    
  } catch (error) {
    console.error('Error checking constraints:', error);
  } finally {
    await pool.end();
  }
}

checkConstraints();