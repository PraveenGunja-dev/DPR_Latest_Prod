
const pool = require('./lib/dbPool');

async function debugAssignment() {
    const client = await pool.connect();
    try {
        console.log('--- DEBUGGING PROJECT ASSIGNMENT ---');

        // 1. Check Constraints
        console.log('\nChecking constraints on project_assignments:');
        const constraints = await client.query(`
      SELECT conname, contype, pg_get_constraintdef(oid) as def
      FROM pg_constraint 
      WHERE conrelid = 'project_assignments'::regclass
    `);

        constraints.rows.forEach(c => {
            console.log(`- ${c.conname} (${c.contype}): ${c.def}`);
        });

        // 2. Check User (Supervisor) existence check
        // We'll pick the first supervisor we can find to test with
        const supervisorRes = await client.query(`SELECT user_id, name, role FROM users WHERE role = 'supervisor' LIMIT 1`);
        if (supervisorRes.rows.length === 0) {
            console.log('\nNo supervisors found in DB to test with.');
            return;
        }
        const supervisor = supervisorRes.rows[0];
        console.log(`\nFound Supervisor to test: ${supervisor.name} (ID: ${supervisor.user_id})`);

        // 3. Check a P6 Project
        const projectRes = await client.query(`SELECT "ObjectId", "Name" FROM p6_projects LIMIT 1`);
        if (projectRes.rows.length === 0) {
            console.log('\nNo P6 Projects found in DB to test with.');
            return;
        }
        const project = projectRes.rows[0];
        console.log(`Found P6 Project to test: ${project.Name} (ID: ${project.ObjectId})`);

        // 4. Attempt Insert (Dry Run - Rollback)
        console.log('\nAttempting TEST INSERT (will rollback)...');
        await client.query('BEGIN');

        const insertQuery = `
      INSERT INTO project_assignments (project_id, user_id, assigned_by) 
      VALUES ($1, $2, $3) 
      RETURNING id, project_id, user_id
    `;

        // Assuming assigned_by = same supervisor for test, or just valid user ID
        await client.query(insertQuery, [project.ObjectId, supervisor.user_id, supervisor.user_id]);

        console.log('✓ Insert SUCCESSFUL (in transaction)');
        await client.query('ROLLBACK');
        console.log('✓ Rolled back successfully. No permanent change.');

    } catch (err) {
        console.error('\n!!! INSERT FAILED !!!');
        console.error('Error Code:', err.code);
        console.error('Error Message:', err.message);
        if (err.detail) console.error('Detail:', err.detail);
        if (err.hint) console.error('Hint:', err.hint);
        try { await client.query('ROLLBACK'); } catch (e) { }
    } finally {
        client.release();
        pool.end();
    }
}

debugAssignment();
