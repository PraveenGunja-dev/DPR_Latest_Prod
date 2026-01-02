const pool = require('./db');

async function checkColumns() {
    try {
        const result = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'p6_activities' 
      ORDER BY ordinal_position
    `);

        console.log('Columns in p6_activities table:');
        result.rows.forEach(row => {
            console.log(`  - ${row.column_name}: ${row.data_type}`);
        });
    } catch (error) {
        console.error('Error:', error.message);
    } finally {
        pool.end();
    }
}

checkColumns();
