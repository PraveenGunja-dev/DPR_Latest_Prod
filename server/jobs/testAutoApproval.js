// server/jobs/testAutoApproval.js
// Test script for the automatic approval job

const { autoApprovePendingSheets } = require('./automaticApprovalJob');

// Run the automatic approval job
autoApprovePendingSheets()
  .then(() => {
    console.log('Test execution completed successfully.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Test execution failed:', error);
    process.exit(1);
  });