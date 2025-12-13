const { Pool } = require('pg');

// Database connection configuration
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5431,
  database: process.env.DB_NAME || 'postgres',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'Prvn@3315',
});

async function testDatabase() {
  try {
    console.log('Testing database connection...');
    
    // Test users table
    console.log('\n--- Users Table ---');
    const usersResult = await pool.query('SELECT * FROM users LIMIT 5');
    console.log('Users:', usersResult.rows);
    
    // Test projects table
    console.log('\n--- Projects Table ---');
    const projectsResult = await pool.query('SELECT * FROM projects LIMIT 5');
    console.log('Projects:', projectsResult.rows);
    
    // Test project_assignments table
    console.log('\n--- Project Assignments Table ---');
    const assignmentsResult = await pool.query('SELECT * FROM project_assignments LIMIT 5');
    console.log('Project Assignments:', assignmentsResult.rows);
    
    // Test dpr_sheets table
    console.log('\n--- DPR Sheets Table ---');
    const sheetsResult = await pool.query('SELECT * FROM dpr_sheets LIMIT 5');
    console.log('DPR Sheets:', sheetsResult.rows);
    
  } catch (error) {
    console.error('Database test error:', error);
  } finally {
    await pool.end();
  }
}

testDatabase();