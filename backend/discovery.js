const { Pool } = require('pg');

const configs = [
    { host: 'localhost', port: 5431, database: 'postgres', user: 'postgres', password: 'Prvn@3315' },
    { host: 'localhost', port: 5431, database: 'adani_flow', user: 'postgres', password: 'Prvn@3315' },
    { host: 'localhost', port: 5432, database: 'postgres', user: 'postgres', password: 'Prvn@3315' },
    { host: 'localhost', port: 5432, database: 'adani_flow', user: 'postgres', password: 'Prvn@3315' },
];

async function tryConnections() {
    for (const config of configs) {
        console.log(`Trying connection to ${config.database} on port ${config.port}...`);
        const pool = new Pool({ ...config, ssl: false, connectionTimeoutMillis: 2000 });
        try {
            const res = await pool.query('SELECT NOW()');
            console.log(`✅ SUCCESS: Connected to ${config.database} on port ${config.port}`);
            const userRes = await pool.query('SELECT user_id, name, email, role FROM users LIMIT 5');
            console.log('Sample Users:');
            console.table(userRes.rows);
            await pool.end();
            return; // Stop after first success
        } catch (err) {
            console.log(`❌ FAILED: ${err.message}`);
        } finally {
            await pool.end();
        }
    }
    console.log('All connection attempts failed.');
}

tryConnections();
