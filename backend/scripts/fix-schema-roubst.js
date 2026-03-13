
const pool = require('./lib/dbPool');

async function runFix() {
    console.log('Using robust pool to fix schema...');
    const client = await pool.connect();
    try {

        // 1. Check current type for project_assignments
        const res = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'project_assignments' AND column_name = 'project_id';
    `);

        const currentType = res.rows.length > 0 ? res.rows[0].data_type : 'unknown';
        console.log(`Current project_assignments.project_id type: ${currentType}`);

        if (currentType !== 'bigint') {
            console.log('Altering project_assignments.project_id -> BIGINT...');
            await client.query('ALTER TABLE project_assignments ALTER COLUMN project_id TYPE BIGINT');
            console.log('✓ Fixed project_assignments.');
        } else {
            console.log('✓ project_assignments is already BIGINT.');
        }

        // 2. Check dpr_supervisor_entries
        const res2 = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'dpr_supervisor_entries' AND column_name = 'project_id';
    `);

        const currentType2 = res2.rows.length > 0 ? res2.rows[0].data_type : 'unknown';
        console.log(`Current dpr_supervisor_entries.project_id type: ${currentType2}`);

        if (currentType2 !== 'bigint') {
            console.log('Altering dpr_supervisor_entries.project_id -> BIGINT...');
            await client.query('ALTER TABLE dpr_supervisor_entries ALTER COLUMN project_id TYPE BIGINT');
            console.log('✓ Fixed dpr_supervisor_entries.');
        } else {
            console.log('✓ dpr_supervisor_entries is already BIGINT.');
        }

        console.log('SUCCESS: Schema verification/update complete.');
    } catch (err) {
        console.error('FAILED to update schema:', err);
    } finally {
        client.release();
        pool.end();
    }
}

runFix();
