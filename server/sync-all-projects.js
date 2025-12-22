// Script to sync all projects and their activities from P6 to the database
const dotenv = require('dotenv');
const path = require('path');
const { Pool } = require('pg');

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// Import the P6 services
const { restClient } = require('./services/oracleP6RestClient');
const p6DataService = require('./services/p6DataService');

async function syncAllProjects() {
  try {
    console.log('Starting sync for all projects...');
    
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
    await pool.query('SELECT NOW()');
    console.log('Database connected successfully');
    
    // Get all project IDs from the database
    const projectResult = await pool.query('SELECT object_id FROM p6_projects ORDER BY object_id');
    const projectIds = projectResult.rows.map(row => row.object_id);
    
    console.log(`Found ${projectIds.length} projects to sync`);
    
    let successCount = 0;
    let errorCount = 0;
    
    // Sync each project
    for (let i = 0; i < projectIds.length; i++) {
      const projectId = projectIds[i];
      const progress = `${i + 1}/${projectIds.length}`;
      
      try {
        console.log(`[${progress}] Syncing project ${projectId}...`);
        await p6DataService.syncProject(projectId);
        console.log(`[${progress}] Successfully synced project ${projectId}`);
        successCount++;
      } catch (error) {
        console.error(`[${progress}] Error syncing project ${projectId}:`, error.message);
        errorCount++;
      }
    }
    
    console.log('\n=== SYNC SUMMARY ===');
    console.log(`Total projects: ${projectIds.length}`);
    console.log(`Successfully synced: ${successCount}`);
    console.log(`Errors: ${errorCount}`);
    
    // Check final counts
    const activityCount = await pool.query('SELECT COUNT(*) as count FROM p6_activities');
    const wbsCount = await pool.query('SELECT COUNT(*) as count FROM p6_wbs');
    
    console.log(`\nFinal database counts:`);
    console.log(`- Activities: ${activityCount.rows[0].count}`);
    console.log(`- WBS Items: ${wbsCount.rows[0].count}`);
    
    await pool.end();
    console.log('\nAll projects sync completed!');
  } catch (error) {
    console.error('Error in syncAllProjects:', error.message);
    console.error('Stack:', error.stack);
  }
}

syncAllProjects();