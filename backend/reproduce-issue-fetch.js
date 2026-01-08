
const { Pool } = require('pg');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables
dotenv.config();
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5431,
    database: process.env.DB_NAME || 'postgres',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'Prvn@3315',
});

async function runTest() {
    try {
        console.log('Connecting...');

        // Simulate req.query
        const limit = '100';
        const offset = '0';
        // project_id is undefined in simulation if not selected
        const status = undefined;
        const priority = undefined;
        const project_id = undefined;
        const issue_type = undefined;

        let query = `
      SELECT 
        il.*,
        u1.name as created_by_name,
        u1.email as created_by_email,
        u2.name as assigned_to_name,
        u3.name as resolved_by_name,
        COALESCE(p.name, p6.name, 'No Project') as project_name
      FROM issue_logs il
      LEFT JOIN users u1 ON il.created_by = u1.user_id
      LEFT JOIN users u2 ON il.assigned_to = u2.user_id
      LEFT JOIN users u3 ON il.resolved_by = u3.user_id
      LEFT JOIN projects p ON il.project_id = p.id
      LEFT JOIN p6_projects p6 ON il.project_id = p6."objectId"
      WHERE 1=1
    `;

        const params = [];
        let paramIndex = 1;

        if (status) {
            query += ` AND il.status = $${paramIndex++}`;
            params.push(status);
        }

        if (priority) {
            query += ` AND il.priority = $${paramIndex++}`;
            params.push(priority);
        }

        if (project_id) {
            query += ` AND il.project_id = $${paramIndex++}`;
            params.push(project_id);
        }

        if (issue_type) {
            query += ` AND il.issue_type = $${paramIndex++}`;
            params.push(issue_type);
        }

        query += ` ORDER BY 
      CASE il.priority 
        WHEN 'critical' THEN 1 
        WHEN 'high' THEN 2 
        WHEN 'medium' THEN 3 
        WHEN 'low' THEN 4 
      END,
      il.created_at DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;

        params.push(limit, offset);

        console.log('Executing query:', query);
        console.log('Params:', params);

        const result = await pool.query(query, params);
        console.log('Issues found:', result.rows.length);
        if (result.rows.length > 0) {
            console.log('First issue:', result.rows[0]);
        }

    } catch (error) {
        console.error('ERROR MESSAGE:', error.message);
        if (error.hint) console.error('HINT:', error.hint);
        if (error.column) console.error('COLUMN:', error.column); // Note: pg error object might not have column prop directly, it's often in message or detail
        console.error('FULL ERROR:', JSON.stringify(error, null, 2));
    } finally {
        await pool.end();
    }
}

runTest();
