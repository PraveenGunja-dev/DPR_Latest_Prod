const pool = require('./db');

async function createSimpleDailyTable() {
  try {
    // Simplified table - ONLY stores daily values that P6 doesn't have
    await pool.query(`
      CREATE TABLE IF NOT EXISTS dpr_daily_progress (
        id SERIAL PRIMARY KEY,
        activity_object_id INTEGER NOT NULL,
        progress_date DATE NOT NULL,
        today_value DECIMAL(15,4) DEFAULT 0,
        cumulative_value DECIMAL(15,4) DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        
        -- One entry per activity per day
        UNIQUE(activity_object_id, progress_date)
      )
    `);
    console.log('✓ Created simplified dpr_daily_progress table');

    // Index for fast lookups
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_daily_progress_activity ON dpr_daily_progress(activity_object_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_daily_progress_date ON dpr_daily_progress(progress_date)`);

    console.log('✓ Table ready (only 4 essential columns + id + timestamp)');
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    pool.end();
  }
}

createSimpleDailyTable();
