const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
});

async function runMigration(fileName) {
    try {
        const filePath = path.join(__dirname, fileName);
        if (!fs.existsSync(filePath)) {
            console.error(`File not found: ${filePath}`);
            return;
        }
        const sql = fs.readFileSync(filePath, 'utf8');
        console.log(`Running migration: ${fileName}`);
        await pool.query(sql);
        console.log(`Successfully ran ${fileName}`);
    } catch (error) {
        console.error(`Error running ${fileName}:`, error.message);
        throw error;
    }
}

async function main() {
    try {
        await runMigration('p6-projects-schema.sql');
        await runMigration('p6-data-schema.sql');
        console.log('All P6 migrations completed successfully.');
    } catch (error) {
        console.error('Migration failed:', error);
    } finally {
        await pool.end();
    }
}

main();
