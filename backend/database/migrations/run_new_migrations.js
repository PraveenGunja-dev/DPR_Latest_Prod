// Run migrations for Activity Codes and Resources
const fs = require('fs');
const path = require('path');
const pool = require('../../db');

async function runMigrations() {
    const client = await pool.connect();

    try {
        console.log('Starting database migrations...');

        // Read and execute activity codes schema migration
        const activityCodesSQL = fs.readFileSync(
            path.join(__dirname, 'add_activity_codes_schema.sql'),
            'utf8'
        );

        console.log('Running activity codes schema migration...');
        await client.query(activityCodesSQL);
        console.log('✓ Activity codes schema created successfully');

        // Read and execute resources schema migration
        const resourcesSQL = fs.readFileSync(
            path.join(__dirname, 'add_resources_schema.sql'),
            'utf8'
        );

        console.log('Running resources schema migration...');
        await client.query(resourcesSQL);
        console.log('✓ Resources schema created successfully');

        console.log('\n✓ All migrations completed successfully!');
    } catch (error) {
        console.error('Migration failed:', error.message);
        throw error;
    } finally {
        client.release();
        await pool.end();
    }
}

runMigrations().catch(console.error);
