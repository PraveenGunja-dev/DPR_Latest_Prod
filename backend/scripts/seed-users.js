const pool = require('./lib/dbPool');

async function seedUsers() {
    try {
        const query = `
        INSERT INTO users (name, email, password, role) VALUES
        ('Admin User', 'admin@adani.com', '$2b$10$OO9bNrLlL3oOQz2rJQKGtOiNIH5TZo4hum3XTkJy4M5cnSpVVwOJK', 'PMAG'),
        ('Project Manager', 'pm@adani.com', '$2b$10$OO9bNrLlL3oOQz2rJQKGtOiNIH5TZo4hum3XTkJy4M5cnSpVVwOJK', 'Site PM'),
        ('Supervisor User', 'supervisor@adani.com', '$2b$10$OO9bNrLlL3oOQz2rJQKGtOiNIH5TZo4hum3XTkJy4M5cnSpVVwOJK', 'supervisor'),
        ('Super Admin', 'superadmin@adani.com', '$2b$10$OO9bNrLlL3oOQz2rJQKGtOiNIH5TZo4hum3XTkJy4M5cnSpVVwOJK', 'Super Admin')
        ON CONFLICT (email) DO NOTHING
        RETURNING *;
        `;

        const res = await pool.query(query);
        console.log(`Seeded ${res.rowCount} users successfully.`);
    } catch (err) {
        console.error('Error seeding users:', err);
    } finally {
        pool.end();
    }
}

seedUsers();
