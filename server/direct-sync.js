// Direct sync script that bypasses the API layer
const dotenv = require('dotenv');
const path = require('path');
const { Pool } = require('pg');

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// Import the P6 services
const { restClient } = require('./services/oracleP6RestClient');
const p6DataService = require('./services/p6DataService');

async function directSync() {
  try {
    console.log('Starting direct sync for project 1981...');
    
    // Set the token directly
    restClient.setToken(process.env.ORACLE_P6_AUTH_TOKEN);
    console.log('Token set successfully');
    
    // Create database pool
    const pool = new Pool({
      host: process.env.DB_HOST,
      port: process.env.DB_PORT,
      database: process.env.DB_NAME,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
    });
    
    // Test database connection
    const dbTest = await pool.query('SELECT NOW()');
    console.log('Database connected successfully');
    
    // Perform sync directly using the service
    console.log('Starting sync process...');
    await p6DataService.syncProject(1981);
    
    console.log('Sync completed successfully!');
    
    // Check how many activities were synced
    const activityCount = await pool.query('SELECT COUNT(*) as count FROM p6_activities WHERE project_object_id = 1981');
    console.log('Activities synced:', activityCount.rows[0].count);
    
    // Check how many WBS items were synced
    const wbsCount = await pool.query('SELECT COUNT(*) as count FROM p6_wbs WHERE project_object_id = 1981');
    console.log('WBS items synced:', wbsCount.rows[0].count);
    
    await pool.end();
  } catch (error) {
    console.error('Direct sync error:', error.message);
    console.error('Stack:', error.stack);
  }
}

directSync();