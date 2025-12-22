const axios = require('axios');

async function syncProjectData() {
  try {
    // Set the token first
    await axios.post('http://localhost:3002/api/oracle-p6/set-token', {
      token: process.env.ORACLE_P6_AUTH_TOKEN
    });
    
    console.log('Token set successfully');
    
    // Sync data for project with object_id 1981
    const response = await axios.post('http://localhost:3002/api/oracle-p6/sync', {
      projectId: 1981
    });
    
    console.log('Project sync response:', response.data);
  } catch (error) {
    console.error('Error syncing project data:', error.response?.data || error.message);
  }
}

// Get token from environment
require('dotenv').config({ path: '../.env' });
syncProjectData();