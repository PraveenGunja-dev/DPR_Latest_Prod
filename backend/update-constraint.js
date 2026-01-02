const pool = require('./db');

async function updateConstraint() {
    try {
        // Drop the old constraint
        await pool.query(`ALTER TABLE dpr_supervisor_entries DROP CONSTRAINT IF EXISTS dpr_supervisor_entries_status_check`);
        console.log('Old constraint dropped (if existed)');

        // Add the new constraint with additional statuses
        await pool.query(`
      ALTER TABLE dpr_supervisor_entries 
      ADD CONSTRAINT dpr_supervisor_entries_status_check 
      CHECK (status IN ('draft', 'submitted_to_pm', 'approved_by_pm', 'rejected_by_pm', 'final_approved', 'archived', 'rejected_by_pmag'))
    `);
        console.log('New constraint added successfully!');

        // Verify
        const result = await pool.query(`
      SELECT pg_get_constraintdef(c.oid) as definition 
      FROM pg_constraint c
      JOIN pg_class t ON c.conrelid = t.oid
      WHERE t.relname = 'dpr_supervisor_entries' 
        AND c.conname = 'dpr_supervisor_entries_status_check'
    `);
        console.log('\nUpdated constraint:', result.rows[0]?.definition);

    } catch (error) {
        console.error('Error:', error.message);
    } finally {
        pool.end();
    }
}

updateConstraint();
