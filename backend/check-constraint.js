const pool = require('./db');

async function checkConstraint() {
    try {
        // Get the full constraint definition
        const result = await pool.query(`
      SELECT pg_get_constraintdef(c.oid) as definition 
      FROM pg_constraint c
      JOIN pg_class t ON c.conrelid = t.oid
      WHERE t.relname = 'dpr_supervisor_entries' 
        AND c.contype = 'c'
    `);

        console.log('All CHECK constraints on dpr_supervisor_entries:');
        result.rows.forEach((row, i) => {
            console.log(`  ${i + 1}. ${row.definition}`);
        });

        // Also check existing statuses
        const statuses = await pool.query(`SELECT DISTINCT status FROM dpr_supervisor_entries`);
        console.log('\nExisting statuses in table:');
        statuses.rows.forEach(row => {
            console.log(`  - ${row.status}`);
        });
    } catch (error) {
        console.error('Error:', error.message);
    } finally {
        pool.end();
    }
}

checkConstraint();
