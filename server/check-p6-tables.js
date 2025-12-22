const { Pool } = require('pg');
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

async function checkTables() {
  try {
    console.log('Checking for P6 tables...');
    
    // Check if p6_projects table exists
    const projectsResult = await pool.query(
      "SELECT table_name FROM information_schema.tables WHERE table_name = 'p6_projects'"
    );
    console.log('p6_projects table exists:', projectsResult.rows.length > 0);
    
    // Check if p6_activities table exists
    const activitiesResult = await pool.query(
      "SELECT table_name FROM information_schema.tables WHERE table_name = 'p6_activities'"
    );
    console.log('p6_activities table exists:', activitiesResult.rows.length > 0);
    
    // Check if p6_wbs table exists
    const wbsResult = await pool.query(
      "SELECT table_name FROM information_schema.tables WHERE table_name = 'p6_wbs'"
    );
    console.log('p6_wbs table exists:', wbsResult.rows.length > 0);
    
    // If p6_activities doesn't exist, create it
    if (activitiesResult.rows.length === 0) {
      console.log('Creating p6_activities table...');
      await pool.query(`
        CREATE TABLE IF NOT EXISTS p6_activities (
          id SERIAL PRIMARY KEY,
          object_id INTEGER UNIQUE NOT NULL,
          activity_id VARCHAR(100),
          name VARCHAR(500) NOT NULL,
          project_object_id INTEGER NOT NULL,
          wbs_object_id INTEGER,
          status VARCHAR(50) DEFAULT 'Not Started',
          percent_complete DECIMAL(5,2) DEFAULT 0,
          physical_percent_complete DECIMAL(5,2) DEFAULT 0,
          start_date TIMESTAMP,
          finish_date TIMESTAMP,
          planned_start_date TIMESTAMP,
          planned_finish_date TIMESTAMP,
          actual_start_date TIMESTAMP,
          actual_finish_date TIMESTAMP,
          baseline_start_date TIMESTAMP,
          baseline_finish_date TIMESTAMP,
          duration DECIMAL(10,2),
          remaining_duration DECIMAL(10,2),
          actual_duration DECIMAL(10,2),
          activity_type VARCHAR(50),
          critical BOOLEAN DEFAULT false,
          last_sync_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (project_object_id) REFERENCES p6_projects(object_id) ON DELETE CASCADE
        )
      `);
      
      // Create indexes
      await pool.query('CREATE INDEX IF NOT EXISTS idx_p6_activities_object_id ON p6_activities(object_id)');
      await pool.query('CREATE INDEX IF NOT EXISTS idx_p6_activities_project ON p6_activities(project_object_id)');
      await pool.query('CREATE INDEX IF NOT EXISTS idx_p6_activities_status ON p6_activities(status)');
      await pool.query('CREATE INDEX IF NOT EXISTS idx_p6_activities_critical ON p6_activities(critical)');
      
      console.log('p6_activities table created successfully');
    }
    
    // Close the pool
    await pool.end();
    console.log('Database connection closed.');
  } catch (error) {
    console.error('Error checking/creating tables:', error);
    await pool.end();
    process.exit(1);
  }
}

checkTables();