const pool = require('./db');

async function updateSheetTypeConstraint() {
    try {
        console.log('=== Updating Sheet Type Constraint ===\n');

        // 1. Drop the existing constraint
        await pool.query(`
      ALTER TABLE dpr_supervisor_entries 
      DROP CONSTRAINT IF EXISTS dpr_supervisor_entries_sheet_type_check
    `);
        console.log('✓ Dropped old constraint');

        // 2. Add the new constraint with 'resource' included
        await pool.query(`
      ALTER TABLE dpr_supervisor_entries 
      ADD CONSTRAINT dpr_supervisor_entries_sheet_type_check 
      CHECK (sheet_type IN (
        'dp_qty', 
        'dp_block', 
        'dp_vendor_idt', 
        'mms_module_rfi', 
        'dp_vendor_block', 
        'manpower_details',
        'resource'
      ))
    `);
        console.log('✓ Added new constraint with "resource"');

    } catch (error) {
        console.error('Error updating constraint:', error.message);
    } finally {
        pool.end();
    }
}

updateSheetTypeConstraint();
