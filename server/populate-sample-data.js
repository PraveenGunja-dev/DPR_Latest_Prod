const { Pool } = require('pg');

// Database connection configuration
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5431,
  database: process.env.DB_NAME || 'postgres',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'Prvn@3315',
});

async function populateSampleData() {
  try {
    console.log('Populating sample DPR sheets data...');
    
    // Insert sample DPR sheets for existing users and projects
    const sampleSheets = [
      // Sheets for User ID 27 (SitePm) on Project ID 1
      {
        project_id: 1,
        supervisor_id: 27,
        sheet_type: 'daily-input',
        submission_date: '2025-12-01',
        yesterday_date: '2025-11-30',
        today_date: '2025-12-01',
        sheet_data: '{}',
        status: 'pm_approved',
        created_at: new Date('2025-12-01T09:00:00Z'),
        updated_at: new Date('2025-12-01T09:00:00Z')
      },
      {
        project_id: 1,
        supervisor_id: 27,
        sheet_type: 'daily-input',
        submission_date: '2025-12-02',
        yesterday_date: '2025-12-01',
        today_date: '2025-12-02',
        sheet_data: '{}',
        status: 'pm_approved',
        created_at: new Date('2025-12-02T09:00:00Z'),
        updated_at: new Date('2025-12-02T09:00:00Z')
      },
      {
        project_id: 1,
        supervisor_id: 27,
        sheet_type: 'daily-input',
        submission_date: '2025-12-03',
        yesterday_date: '2025-12-02',
        today_date: '2025-12-03',
        sheet_data: '{}',
        status: 'submitted',
        created_at: new Date('2025-12-03T09:00:00Z'),
        updated_at: new Date('2025-12-03T09:00:00Z')
      },
      
      // Sheets for User ID 28 (Supervisor) on Project ID 1
      {
        project_id: 1,
        supervisor_id: 28,
        sheet_type: 'daily-input',
        submission_date: '2025-12-01',
        yesterday_date: '2025-11-30',
        today_date: '2025-12-01',
        sheet_data: '{}',
        status: 'pm_approved',
        created_at: new Date('2025-12-01T10:00:00Z'),
        updated_at: new Date('2025-12-01T10:00:00Z')
      },
      {
        project_id: 1,
        supervisor_id: 28,
        sheet_type: 'daily-input',
        submission_date: '2025-12-02',
        yesterday_date: '2025-12-01',
        today_date: '2025-12-02',
        sheet_data: '{}',
        status: 'pm_approved',
        created_at: new Date('2025-12-02T10:00:00Z'),
        updated_at: new Date('2025-12-02T10:00:00Z')
      },
      {
        project_id: 1,
        supervisor_id: 28,
        sheet_type: 'daily-input',
        submission_date: '2025-12-04',
        yesterday_date: '2025-12-03',
        today_date: '2025-12-04',
        sheet_data: '{}',
        status: 'submitted',
        created_at: new Date('2025-12-04T10:00:00Z'),
        updated_at: new Date('2025-12-04T10:00:00Z')
      },
      
      // Sheets for User ID 29 (Praveen) on Project ID 3
      {
        project_id: 3,
        supervisor_id: 29,
        sheet_type: 'daily-input',
        submission_date: '2025-12-01',
        yesterday_date: '2025-11-30',
        today_date: '2025-12-01',
        sheet_data: '{}',
        status: 'pm_approved',
        created_at: new Date('2025-12-01T11:00:00Z'),
        updated_at: new Date('2025-12-01T11:00:00Z')
      },
      {
        project_id: 3,
        supervisor_id: 29,
        sheet_type: 'daily-input',
        submission_date: '2025-12-03',
        yesterday_date: '2025-12-02',
        today_date: '2025-12-03',
        sheet_data: '{}',
        status: 'pm_approved',
        created_at: new Date('2025-12-03T11:00:00Z'),
        updated_at: new Date('2025-12-03T11:00:00Z')
      },
      {
        project_id: 3,
        supervisor_id: 29,
        sheet_type: 'daily-input',
        submission_date: '2025-12-05',
        yesterday_date: '2025-12-04',
        today_date: '2025-12-05',
        sheet_data: '{}',
        status: 'submitted',
        created_at: new Date('2025-12-05T11:00:00Z'),
        updated_at: new Date('2025-12-05T11:00:00Z')
      },
      
      // Sheets for User ID 30 (person1) on Project ID 3
      {
        project_id: 3,
        supervisor_id: 30,
        sheet_type: 'daily-input',
        submission_date: '2025-12-02',
        yesterday_date: '2025-12-01',
        today_date: '2025-12-02',
        sheet_data: '{}',
        status: 'pm_approved',
        created_at: new Date('2025-12-02T12:00:00Z'),
        updated_at: new Date('2025-12-02T12:00:00Z')
      },
      {
        project_id: 3,
        supervisor_id: 30,
        sheet_type: 'daily-input',
        submission_date: '2025-12-04',
        yesterday_date: '2025-12-03',
        today_date: '2025-12-04',
        sheet_data: '{}',
        status: 'pm_approved',
        created_at: new Date('2025-12-04T12:00:00Z'),
        updated_at: new Date('2025-12-04T12:00:00Z')
      },
      {
        project_id: 3,
        supervisor_id: 30,
        sheet_type: 'daily-input',
        submission_date: '2025-12-06',
        yesterday_date: '2025-12-05',
        today_date: '2025-12-06',
        sheet_data: '{}',
        status: 'submitted',
        created_at: new Date('2025-12-06T12:00:00Z'),
        updated_at: new Date('2025-12-06T12:00:00Z')
      }
    ];
    
    // Insert the sample sheets
    for (const sheet of sampleSheets) {
      await pool.query(
        `INSERT INTO dpr_sheets (project_id, supervisor_id, sheet_type, submission_date, yesterday_date, today_date, sheet_data, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [sheet.project_id, sheet.supervisor_id, sheet.sheet_type, sheet.submission_date, sheet.yesterday_date, sheet.today_date, sheet.sheet_data, sheet.status, sheet.created_at, sheet.updated_at]
      );
      console.log(`Inserted sheet for supervisor ${sheet.supervisor_id} on project ${sheet.project_id}`);
    }
    
    console.log('Sample data populated successfully!');
    
  } catch (error) {
    console.error('Error populating sample data:', error);
  } finally {
    await pool.end();
  }
}

populateSampleData();