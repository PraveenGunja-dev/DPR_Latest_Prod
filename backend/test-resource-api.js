const axios = require('axios');

async function testResourceAPI() {
    try {
        // Using a simple test - just call the backend directly
        const pool = require('./db');

        const result = await pool.query(`
      SELECT object_id, resource_id, name, type as resource_type
      FROM p6_resources
      WHERE name IS NOT NULL AND name != ''
      ORDER BY name
      LIMIT 10
    `);

        console.log('Resources from database:');
        result.rows.forEach(r => {
            console.log(`  name: "${r.name}", resource_id: "${r.resource_id}", type: "${r.resource_type}"`);
        });

        pool.end();
    } catch (error) {
        console.error('Error:', error.message);
    }
}

testResourceAPI();
