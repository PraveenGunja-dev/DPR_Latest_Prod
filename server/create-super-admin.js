// server/create-super-admin.js
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// PostgreSQL connection pool
const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

// Function to create a Super Admin user
async function createSuperAdmin() {
  try {
    // Check if a Super Admin already exists
    const superAdminCheck = await pool.query(
      "SELECT user_id FROM users WHERE role = 'Super Admin' LIMIT 1"
    );

    if (superAdminCheck.rows.length > 0) {
      console.log('Super Admin user already exists.');
      console.log('Super Admin user ID:', superAdminCheck.rows[0].user_id);
      await pool.end();
      return;
    }

    // Create Super Admin user
    console.log('Creating Super Admin user...');
    const superAdminPassword = 'superadmin123';
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(superAdminPassword, saltRounds);

    const result = await pool.query(
      'INSERT INTO users (name, email, password, role) VALUES ($1, $2, $3, $4) RETURNING user_id, name, email, role',
      ['Super Admin', 'superadmin@adani.com', hashedPassword, 'Super Admin']
    );

    const superAdminUser = result.rows[0];
    console.log('Super Admin user created successfully:');
    console.log('Name:', superAdminUser.name);
    console.log('Email:', superAdminUser.email);
    console.log('Role:', superAdminUser.role);
    console.log('Password:', superAdminPassword);
    console.log('\n*** IMPORTANT ***');
    console.log('Please change the default password after first login!');
    console.log('******************');

    // Close the pool
    await pool.end();
    console.log('Database connection closed.');
  } catch (error) {
    console.error('Error creating Super Admin user:', error);
    await pool.end();
    process.exit(1);
  }
}

// Run the function
createSuperAdmin();