-- server/database/schema.sql
-- Create users table
CREATE TABLE IF NOT EXISTS users (
    user_id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL CHECK (role IN ('supervisor', 'Site PM', 'PMAG', 'Super Admin')),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create projects table
CREATE TABLE IF NOT EXISTS projects (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    location VARCHAR(255),
    status VARCHAR(50) NOT NULL DEFAULT 'planning',
    progress INTEGER NOT NULL DEFAULT 0,
    plan_start DATE,
    plan_end DATE,
    actual_start DATE,
    actual_end DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create project_assignments table
CREATE TABLE IF NOT EXISTS project_assignments (
    id SERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    assigned_by INTEGER,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    FOREIGN KEY (assigned_by) REFERENCES users(user_id) ON DELETE SET NULL,
    UNIQUE(project_id, user_id)
);

-- Insert sample users with actual passwords
-- Password for all users is "admin123"
INSERT INTO users (name, email, password, role) VALUES
('Admin User', 'admin@adani.com', '$2b$10$OO9bNrLlL3oOQz2rJQKGtOiNIH5TZo4hum3XTkJy4M5cnSpVVwOJK', 'PMAG'),
('Project Manager', 'pm@adani.com', '$2b$10$OO9bNrLlL3oOQz2rJQKGtOiNIH5TZo4hum3XTkJy4M5cnSpVVwOJK', 'Site PM'),
('Supervisor User', 'supervisor@adani.com', '$2b$10$OO9bNrLlL3oOQz2rJQKGtOiNIH5TZo4hum3XTkJy4M5cnSpVVwOJK', 'supervisor')
ON CONFLICT (email) DO NOTHING;

-- Insert sample projects
INSERT INTO projects (name, location, status, progress, plan_start, plan_end) VALUES
('Mundra Port Expansion', 'Gujarat, India', 'active', 75, '2025-02-01', '2025-11-30'),
('Ahmedabad Metro Line 2', 'Ahmedabad, Gujarat', 'active', 45, '2025-02-01', '2025-11-30'),
('Chennai Coastal Road', 'Chennai, Tamil Nadu', 'planning', 10, '2025-02-01', '2025-11-30')
ON CONFLICT DO NOTHING;

-- DPR Sheets table - stores the submitted sheets
CREATE TABLE IF NOT EXISTS dpr_sheets (
    id SERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL,
    supervisor_id INTEGER NOT NULL,
    sheet_type VARCHAR(50) NOT NULL CHECK (sheet_type IN ('daily-input', 'material', 'cost')),
    submission_date DATE NOT NULL,
    yesterday_date DATE NOT NULL,
    today_date DATE NOT NULL,
    sheet_data JSONB NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'pm_review', 'pm_approved', 'pm_rejected', 'pmag_review', 'pmag_approved', 'pmag_rejected', 'final')),
    is_locked BOOLEAN DEFAULT FALSE,
    submitted_at TIMESTAMP,
    pm_reviewed_at TIMESTAMP,
    pm_reviewed_by INTEGER,
    pmag_reviewed_at TIMESTAMP,
    pmag_reviewed_by INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (supervisor_id) REFERENCES users(user_id) ON DELETE CASCADE,
    FOREIGN KEY (pm_reviewed_by) REFERENCES users(user_id) ON DELETE SET NULL,
    FOREIGN KEY (pmag_reviewed_by) REFERENCES users(user_id) ON DELETE SET NULL
);

-- DPR Comments table - stores comments from PM and PMAG
CREATE TABLE IF NOT EXISTS dpr_comments (
    id SERIAL PRIMARY KEY,
    sheet_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    user_role VARCHAR(20) NOT NULL,
    comment_text TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (sheet_id) REFERENCES dpr_sheets(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

-- DPR Sheet History - audit trail
CREATE TABLE IF NOT EXISTS dpr_sheet_history (
    id SERIAL PRIMARY KEY,
    sheet_id INTEGER NOT NULL,
    action VARCHAR(50) NOT NULL,
    performed_by INTEGER NOT NULL,
    old_status VARCHAR(20),
    new_status VARCHAR(20),
    comments TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (sheet_id) REFERENCES dpr_sheets(id) ON DELETE CASCADE,
    FOREIGN KEY (performed_by) REFERENCES users(user_id) ON DELETE CASCADE
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_dpr_sheets_project_id ON dpr_sheets(project_id);
CREATE INDEX IF NOT EXISTS idx_dpr_sheets_supervisor_id ON dpr_sheets(supervisor_id);
CREATE INDEX IF NOT EXISTS idx_dpr_sheets_status ON dpr_sheets(status);
CREATE INDEX IF NOT EXISTS idx_dpr_sheets_dates ON dpr_sheets(yesterday_date, today_date);
CREATE INDEX IF NOT EXISTS idx_dpr_comments_sheet_id ON dpr_comments(sheet_id);
CREATE INDEX IF NOT EXISTS idx_dpr_history_sheet_id ON dpr_sheet_history(sheet_id);

-- DPR Supervisor Entry table - stores supervisor-filled data for each sheet
CREATE TABLE IF NOT EXISTS dpr_supervisor_entries (
    id SERIAL PRIMARY KEY,
    supervisor_id INTEGER NOT NULL,
    project_id INTEGER NOT NULL,
    sheet_type VARCHAR(50) NOT NULL CHECK (sheet_type IN ('dp_qty', 'dp_block', 'dp_vendor_idt', 'mms_module_rfi', 'dp_vendor_block', 'manpower_details')),
    entry_date DATE NOT NULL,
    previous_date DATE NOT NULL,
    data_json JSONB NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted_to_pm', 'approved_by_pm', 'rejected_by_pm', 'final_approved')),
    submitted_at TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (supervisor_id) REFERENCES users(user_id) ON DELETE CASCADE,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_dpr_entries_supervisor_id ON dpr_supervisor_entries(supervisor_id);
CREATE INDEX IF NOT EXISTS idx_dpr_entries_project_id ON dpr_supervisor_entries(project_id);
CREATE INDEX IF NOT EXISTS idx_dpr_entries_sheet_type ON dpr_supervisor_entries(sheet_type);
CREATE INDEX IF NOT EXISTS idx_dpr_entries_status ON dpr_supervisor_entries(status);
CREATE INDEX IF NOT EXISTS idx_dpr_entries_dates ON dpr_supervisor_entries(entry_date, previous_date);

-- System logs table for audit trail
CREATE TABLE IF NOT EXISTS system_logs (
    id SERIAL PRIMARY KEY,
    action_type VARCHAR(50) NOT NULL,
    performed_by INTEGER,
    target_entity VARCHAR(255),
    remarks TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (performed_by) REFERENCES users(user_id) ON DELETE SET NULL
);

-- Create indexes for system logs
CREATE INDEX IF NOT EXISTS idx_system_logs_action_type ON system_logs(action_type);
CREATE INDEX IF NOT EXISTS idx_system_logs_performed_by ON system_logs(performed_by);
CREATE INDEX IF NOT EXISTS idx_system_logs_created_at ON system_logs(created_at);

-- Note: Activities schema is defined in activities-schema.sql for Oracle P6 API compatibility