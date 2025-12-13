// server/jobs/automaticApprovalJob.js
// Scheduled job to automatically approve sheets after 2 days if not approved by PMAG

const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

// PostgreSQL connection pool
const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

// Function to automatically approve sheets that have been pending PMAG approval for more than 2 days
const autoApprovePendingSheets = async () => {
  console.log('Running automatic approval job...');
  
  try {
    // Calculate the date 2 days ago
    const twoDaysAgo = new Date();
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
    
    // Find sheets that are in 'pm_approved' status and were reviewed by PM more than 2 days ago
    const pendingSheetsQuery = `
      SELECT id, project_id, supervisor_id, sheet_type
      FROM dpr_sheets 
      WHERE status = 'pm_approved' 
      AND pm_reviewed_at < $1
    `;
    
    const pendingSheetsResult = await pool.query(pendingSheetsQuery, [twoDaysAgo]);
    const pendingSheets = pendingSheetsResult.rows;
    
    console.log(`Found ${pendingSheets.length} sheets pending PMAG approval for more than 2 days`);
    
    // Process each pending sheet
    for (const sheet of pendingSheets) {
      try {
        console.log(`Auto-approving sheet ID ${sheet.id}...`);
        
        // Update sheet status to 'final' (automatically approved)
        const updateSheetQuery = `
          UPDATE dpr_sheets 
          SET status = 'final', 
              pmag_reviewed_by = NULL,  -- No specific PMAG user for auto-approval
              pmag_reviewed_at = CURRENT_TIMESTAMP,
              is_locked = true,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = $1
          RETURNING *
        `;
        
        const updateResult = await pool.query(updateSheetQuery, [sheet.id]);
        
        if (updateResult.rows.length > 0) {
          // Add history record for automatic approval
          const historyQuery = `
            INSERT INTO dpr_sheet_history (sheet_id, action, performed_by, old_status, new_status, comments)
            VALUES ($1, 'auto_approved', NULL, 'pm_approved', 'final', 'Automatically approved after 2 days without PMAG action')
          `;
          
          await pool.query(historyQuery, [sheet.id]);
          
          console.log(`Successfully auto-approved sheet ID ${sheet.id}`);
        } else {
          console.log(`Failed to auto-approve sheet ID ${sheet.id} - sheet not found or status changed`);
        }
      } catch (sheetError) {
        console.error(`Error auto-approving sheet ID ${sheet.id}:`, sheetError);
      }
    }
    
    // Also handle supervisor entries
    const pendingEntriesQuery = `
      SELECT id, supervisor_id, project_id, sheet_type
      FROM dpr_supervisor_entries 
      WHERE status = 'approved_by_pm' 
      AND updated_at < $1
    `;
    
    const pendingEntriesResult = await pool.query(pendingEntriesQuery, [twoDaysAgo]);
    const pendingEntries = pendingEntriesResult.rows;
    
    console.log(`Found ${pendingEntries.length} supervisor entries pending PMAG approval for more than 2 days`);
    
    // Process each pending entry
    for (const entry of pendingEntries) {
      try {
        console.log(`Auto-approving supervisor entry ID ${entry.id}...`);
        
        // Update entry status to 'final_approved' (automatically approved)
        const updateEntryQuery = `
          UPDATE dpr_supervisor_entries 
          SET status = 'final_approved',
              updated_at = CURRENT_TIMESTAMP
          WHERE id = $1
          RETURNING *
        `;
        
        const updateResult = await pool.query(updateEntryQuery, [entry.id]);
        
        if (updateResult.rows.length > 0) {
          console.log(`Successfully auto-approved supervisor entry ID ${entry.id}`);
        } else {
          console.log(`Failed to auto-approve supervisor entry ID ${entry.id} - entry not found or status changed`);
        }
      } catch (entryError) {
        console.error(`Error auto-approving supervisor entry ID ${entry.id}:`, entryError);
      }
    }
    
    console.log('Automatic approval job completed.');
  } catch (error) {
    console.error('Error in automatic approval job:', error);
  }
};

// Export the function so it can be called externally
module.exports = { autoApprovePendingSheets };

// If this script is run directly, execute the job
if (require.main === module) {
  // Run the job immediately
  autoApprovePendingSheets()
    .then(() => {
      console.log('Job execution completed.');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Job execution failed:', error);
      process.exit(1);
    });
}