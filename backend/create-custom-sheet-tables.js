const pool = require('./db');

async function createCustomSheetTables() {
    try {
        console.log('=== Creating Custom Sheet Tables ===\n');

        // 1. Create custom_sheet_columns table
        await pool.query(`
      CREATE TABLE IF NOT EXISTS custom_sheet_columns (
        id SERIAL PRIMARY KEY,
        project_id INTEGER NOT NULL,
        sheet_type VARCHAR(50) NOT NULL, -- To support multiple custom sheets types if needed
        column_name VARCHAR(100) NOT NULL, -- Internal name (camelCase)
        display_name VARCHAR(255) NOT NULL, -- User friendly name
        data_type VARCHAR(50) NOT NULL DEFAULT 'text', -- text, number, date, select, etc.
        is_required BOOLEAN DEFAULT FALSE,
        default_value TEXT,
        position INTEGER NOT NULL DEFAULT 0,
        is_active BOOLEAN DEFAULT TRUE,
        created_by INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
        FOREIGN KEY (created_by) REFERENCES users(user_id) ON DELETE SET NULL,
        UNIQUE(project_id, sheet_type, column_name)
      )
    `);
        console.log('✓ Created custom_sheet_columns');

        // 2. Create custom_sheet_entries table
        await pool.query(`
      CREATE TABLE IF NOT EXISTS custom_sheet_entries (
        id SERIAL PRIMARY KEY,
        project_id INTEGER NOT NULL,
        supervisor_id INTEGER NOT NULL,
        sheet_type VARCHAR(50) NOT NULL,
        entry_date DATE NOT NULL,
        previous_date DATE NOT NULL,
        data_json JSONB NOT NULL, -- Stores dynamic data as JSON: { rows: [{ "col1": "val1" }] }
        status VARCHAR(20) NOT NULL DEFAULT 'draft',
        submitted_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
        FOREIGN KEY (supervisor_id) REFERENCES users(user_id) ON DELETE CASCADE,
        UNIQUE(project_id, supervisor_id, sheet_type, entry_date)
      )
    `);
        console.log('✓ Created custom_sheet_entries');

        // Indexes
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_custom_sheet_cols_proj ON custom_sheet_columns(project_id)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_custom_sheet_entries_proj ON custom_sheet_entries(project_id)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_custom_sheet_entries_date ON custom_sheet_entries(entry_date)`);
        console.log('✓ Created indexes');

    } catch (error) {
        console.error('Error creating tables:', error.message);
    } finally {
        pool.end();
    }
}

createCustomSheetTables();
