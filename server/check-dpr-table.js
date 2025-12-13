const { Pool } = require('pg');

// Database connection configuration
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5431,
  database: process.env.DB_NAME || 'postgres',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'Prvn@3315',
});

async function checkTableStructure() {
  try {
    console.log('Checking DPR supervisor entries table structure...\n');
    
    // Check table structure
    const columns = await pool.query(`
      SELECT column_name, data_type, is_nullable 
      FROM information_schema.columns 
      WHERE table_name = 'dpr_supervisor_entries' 
      ORDER BY ordinal_position
    `);
    
    console.log('DPR Supervisor Entries Table Columns:');
    columns.rows.forEach(row => {
      console.log(`${row.column_name} (${row.data_type}) ${row.is_nullable === 'YES' ? 'NULL' : 'NOT NULL'}`);
    });
    
    // Check status values
    console.log('\nExisting status values:');
    const statusValues = await pool.query(`
      SELECT DISTINCT status FROM dpr_supervisor_entries ORDER BY status
    `);
    statusValues.rows.forEach(row => {
      console.log(`- ${row.status}`);
    });
    
  } catch (error) {
    console.error('Error checking table structure:', error);
  } finally {
    await pool.end();
  }
}

checkTableStructure();