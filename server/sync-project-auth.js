const axios = require('axios');

async function syncProjectData() {
  try {
    // Login first to get JWT token
    const loginResponse = await axios.post('http://localhost:3002/api/auth/login', {
      email: 'admin@adani.com',
      password: 'AdaniDefault@123'
    });
    
    const jwtToken = loginResponse.data.token;
    console.log('Login successful');
    
    // Set the P6 token
    await axios.post('http://localhost:3002/api/oracle-p6/set-token', {
      token: process.env.ORACLE_P6_AUTH_TOKEN
    }, {
      headers: {
        'Authorization': `Bearer ${jwtToken}`
      }
    });
    
    console.log('P6 token set successfully');
    
    // Sync data for project with object_id 1981
    const response = await axios.post('http://localhost:3002/api/oracle-p6/sync', {
      projectId: 1981
    }, {
      headers: {
        'Authorization': `Bearer ${jwtToken}`
      }
    });
    
    console.log('Project sync response:', response.data);
  } catch (error) {
    console.error('Error syncing project data:', error.response?.data || error.message);
  }
}

// Get token from environment
require('dotenv').config({ path: '../.env' });
syncProjectData();