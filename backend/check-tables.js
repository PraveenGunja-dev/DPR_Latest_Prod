const pool = require('./db');

async function checkTables() {
    try {
        const tables = ['mms_rfi_entries', 'mms_rfi_dynamic_columns', 'custom_sheet_entries', 'custom_sheet_columns'];

        for (const table of tables) {
            const res = await pool.query(`SELECT to_regclass('${table}') as exists`);
            console.log(`${table}: ${res.rows[0].exists ? 'EXISTS' : 'MISSING'}`);
        }
    } catch (error) {
        console.error('Error:', error.message);
    } finally {
        pool.end();
    }
}

checkTables();
