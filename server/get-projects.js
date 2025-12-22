const axios = require('axios');

async function getProjects() {
  try {
    // First, we need to login to get a JWT token
    const loginResponse = await axios.post('http://localhost:3002/api/auth/login', {
      email: 'superadmin@adani.com',
      password: 'AdaniSuper@123'
    });
    
    const token = loginResponse.data.token;
    console.log('Login successful, token received');
    
    // Now get the projects
    const response = await axios.get('http://localhost:3002/api/oracle-p6/synced-projects', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    console.log('Projects retrieved successfully:');
    console.log(`Total projects: ${response.data.count}`);
    console.log('First 3 projects:', response.data.projects.slice(0, 3));
  } catch (error) {
    console.error('Error getting projects:', error.response?.data || error.message);
  }
}

getProjects();