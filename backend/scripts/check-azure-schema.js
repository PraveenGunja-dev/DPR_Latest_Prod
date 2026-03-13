const { Pool } = require('pg');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables
const envPath = path.resolve(__dirname, '../.env');
dotenv.config({ path: envPath });

const azureUrl = "postgres://psqladmin:1k8h02grUu%2BqJ2uHZb%3C%7BlB3LF%25%2BYj-Ar@az10psqldmrcbtp01.postgres.database.azure.com:5432/DPR_Project?sslmode=require";

async function checkAzureSchema() {
    const pool = new Pool({
        connectionString: azureUrl,
        ssl: { rejectUnauthorized: false }
    });

    try {
        console.log('Connecting to Azure Staging Database...');
        const res = await pool.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'p6_activities'
            ORDER BY ordinal_position;
        `);

        console.log('Columns in p6_activities (Azure):');
        res.rows.forEach(row => {
            console.log(` - ${row.column_name} (${row.data_type})`);
        });

    } catch (err) {
        console.error('Failed to connect to Azure DB:', err.message);
    } finally {
        await pool.end();
    }
}

checkAzureSchema();
