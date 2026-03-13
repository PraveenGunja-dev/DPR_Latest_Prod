const pool = require('./lib/dbPool');

async function addSuperAdmin() {
    try {
        const query = `
        INSERT INTO users (name, email, password, role) VALUES
        ('Super Admin', 'superadmin@adani.com', '$2b$10$OO9bNrLlL3oOQz2rJQKGtOiNIH5TZo4hum3XTkJy4M5cnSpVVwOJK', 'Super Admin')
        ON CONFLICT (email) DO UPDATE 
        SET role = 'Super Admin'
        RETURNING *;
        `;

        const res = await pool.query(query);
        console.log(`Add/Update SuperAdmin: ${res.rowCount} rows affected.`);
        console.log(JSON.stringify(res.rows[0], null, 2));
    } catch (err) {
        console.error('Error adding user:', err);
    } finally {
        pool.end();
    }
}

addSuperAdmin();
