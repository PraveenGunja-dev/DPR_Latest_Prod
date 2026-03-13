const pool = require('./lib/dbPool');

async function checkUsers() {
    try {
        const res = await pool.query('SELECT user_id, name, email, role, is_active FROM users');
        console.log('Registered Users:');
        console.log(JSON.stringify(res.rows, null, 2));
    } catch (err) {
        console.error('Error checking users:', err);
    } finally {
        pool.end();
    }
}

checkUsers();
