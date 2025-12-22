// Check what fields are available for activities in P6 API
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// Import the P6 services
const { restClient } = require('./services/oracleP6RestClient');

async function checkActivityFields() {
  try {
    console.log('Checking available activity fields in P6 API...');
    
    // Set the token directly
    restClient.setToken(process.env.ORACLE_P6_AUTH_TOKEN);
    console.log('Token set successfully');
    
    // Try to get activity fields
    console.log('Getting activity fields...');
    const fieldsResponse = await restClient.get('/activity/fields');
    console.log('Available activity fields:', fieldsResponse);
    
  } catch (error) {
    console.error('Error checking activity fields:', error.message);
    if (error.response) {
      console.error('Response data:', error.response.data);
    }
    
    // Let's try with a different approach
    try {
      console.log('\nTrying to get activities with more fields...');
      // Try to get activities with common fields including update timestamps
      const activities = await restClient.readActivities([
        'ObjectId', 'Id', 'Name', 'Status', 'PercentComplete',
        'StartDate', 'FinishDate', 'PlannedStartDate', 'PlannedFinishDate',
        'ActualStartDate', 'ActualFinishDate', 'LastUpdateDate', 'CreateDate'
      ], 1981); // Using project ID 1981
      
      console.log('Success! Retrieved', activities.length, 'activities');
      console.log('Sample activity fields:', Object.keys(activities[0]));
      console.log('Sample activity:', activities[0]);
    } catch (error2) {
      console.error('Error getting activities:', error2.message);
    }
  }
}

checkActivityFields();