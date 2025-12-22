// server/create-requested-users.js
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

// Function to create users
async function createUsers() {
  try {
    const usersToCreate = [
      {
        name: 'Super Admin',
        email: 'superadmin@adani.com',
        role: 'Super Admin'
      },
      {
        name: 'Site PM',
        email: 'sitepm1@adani.com',
        role: 'Site PM'
      },
      {
        name: 'Supervisor',
        email: 'sup@adani.com',
        role: 'supervisor'
      }
    ];

    const password = '123456';
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    console.log('Creating requested users with password: 123456');

    for (const user of usersToCreate) {
      try {
        // Check if user already exists
        const existingUser = await pool.query(
          "SELECT user_id FROM users WHERE email = $1",
          [user.email]
        );

        if (existingUser.rows.length > 0) {
          console.log(`User ${user.email} already exists. Skipping.`);
          continue;
        }

        // Create user
        const result = await pool.query(
          'INSERT INTO users (name, email, password, role) VALUES ($1, $2, $3, $4) RETURNING user_id, name, email, role',
          [user.name, user.email, hashedPassword, user.role]
        );

        const newUser = result.rows[0];
        console.log(`${user.role} user created successfully:`);
        console.log('  Name:', newUser.name);
        console.log('  Email:', newUser.email);
        console.log('  Role:', newUser.role);
        console.log('');
      } catch (error) {
        console.error(`Error creating ${user.email}:`, error.message);
      }
    }

    console.log('*** ALL USERS CREATED SUCCESSFULLY ***');
    console.log('Password for all users: 123456');
    console.log('\n*** IMPORTANT ***');
    console.log('Remember to change passwords after first login!');
    console.log('******************');

    // Close the pool
    await pool.end();
    console.log('Database connection closed.');
  } catch (error) {
    console.error('Error creating users:', error);
    await pool.end();
    process.exit(1);
  }
}

// Run the function
createUsers();