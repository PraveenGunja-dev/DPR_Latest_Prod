const axios = require('axios');

async function triggerSync() {
  try {
    const response = await axios.post('http://localhost:3002/api/oracle-p6/sync-projects');
    
    console.log('Sync triggered successfully:', response.data);
  } catch (error) {
    console.error('Error triggering sync:', error.response?.data || error.message);
  }
}

triggerSync();