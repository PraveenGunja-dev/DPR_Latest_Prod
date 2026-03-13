require('dotenv').config();
const pool = require('./db');

async function checkColumnTypes() {
    try {
        const query = `
      SELECT 
        table_name, 
        column_name, 
        data_type 
      FROM 
        information_schema.columns 
      WHERE 
        table_name IN ('projects', 'p6_projects', 'project_assignments', 'p6_activities', 'dpr_supervisor_entries', 'dpr_sheets')
        AND column_name IN ('id', 'ObjectId', 'project_id', 'project_object_id', 'object_id')
      ORDER BY 
        table_name, column_name;
    `;

        console.log('Checking column types...');
        const res = await pool.query(query);
        console.table(res.rows);

        pool.end();
    } catch (err) {
        console.error('Error checking column types:', err);
        process.exit(1);
    }
}

checkColumnTypes();
