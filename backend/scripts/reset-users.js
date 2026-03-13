const pool = require('./lib/dbPool');

async function resetUsers() {
    try {
        console.log('--- Resetting and Seeding Users ---');

        // 1. Delete all users
        // Use TRUNCATE with CASCADE to clean up related tables (assignments, sheets, etc.)
        console.log('Truncating users table...');
        await pool.query('TRUNCATE TABLE users RESTART IDENTITY CASCADE');
        console.log('✓ Users table cleared.');

        // 2. Seed specified users
        // Standard password hash for 'admin123'
        const passwordHash = '$2b$10$OO9bNrLlL3oOQz2rJQKGtOiNIH5TZo4hum3XTkJy4M5cnSpVVwOJK';

        const users = [
            { name: 'Admin', email: 'admin@adani.com', role: 'PMAG' },
            { name: 'Super Admin', email: 'superadmin@adani.com', role: 'Super Admin' },
            { name: 'Site PM', email: 'sitepm@adani.com', role: 'Site PM' },
            { name: 'Supervisor', email: 'supervisor@adani.com', role: 'supervisor' }
        ];

        console.log('Seeding new users...');
        for (const user of users) {
            await pool.query(
                'INSERT INTO users (name, email, password, role) VALUES ($1, $2, $3, $4)',
                [user.name, user.email, passwordHash, user.role]
            );
            console.log(`  + Created ${user.name} (${user.role}) with email ${user.email}`);
        }

        console.log('✓ User reset and seeding completed successfully.');
    } catch (err) {
        console.error('❌ Error resetting users:');
        console.error(err);
    } finally {
        pool.end();
    }
}

resetUsers();
