// Test script to check what fields are available in P6 API
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// Import the P6 services
const { restClient } = require('./services/oracleP6RestClient');

async function testFields() {
  try {
    console.log('Testing P6 API fields...');
    
    // Set the token directly
    restClient.setToken(process.env.ORACLE_P6_AUTH_TOKEN);
    console.log('Token set successfully');
    
    // Try a simple request with known good fields
    console.log('Trying with basic fields...');
    const projects = await restClient.readProjects([
      'ObjectId', 'Id', 'Name', 'Status', 'StartDate', 'FinishDate'
    ]);
    
    console.log('Success! Retrieved', projects.length, 'projects');
    console.log('Sample project:', projects[0]);
    
    // Try to get activities for the first project
    if (projects.length > 0) {
      console.log('\nTrying to get activities...');
      const activities = await restClient.readActivities([
        'ObjectId', 'Id', 'Name', 'Status', 'StartDate', 'FinishDate', 'PercentComplete'
      ], projects[0].ObjectId);
      
      console.log('Success! Retrieved', activities.length, 'activities');
      console.log('Sample activity:', activities[0]);
    }
  } catch (error) {
    console.error('Error:', error.message);
    if (error.response) {
      console.error('Response data:', error.response.data);
    }
  }
}

testFields();