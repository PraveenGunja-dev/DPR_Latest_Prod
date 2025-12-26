-- Issue Logs Migration
-- Creates table to store issue logs that are visible to Site PM and Admin

CREATE TABLE IF NOT EXISTS issue_logs (
    id SERIAL PRIMARY KEY,
    project_id INTEGER,
    entry_id INTEGER,                              -- Reference to dpr_supervisor_entries if applicable
    sheet_type VARCHAR(50),                        -- dp_qty, dp_block, etc.
    issue_type VARCHAR(50) NOT NULL DEFAULT 'general' CHECK (issue_type IN ('general', 'data_error', 'approval', 'sync_error', 'system', 'other')),
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    priority VARCHAR(20) NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),
    status VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
    created_by INTEGER NOT NULL,
    assigned_to INTEGER,
    resolved_by INTEGER,
    resolved_at TIMESTAMP,
    resolution_notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL,
    FOREIGN KEY (entry_id) REFERENCES dpr_supervisor_entries(id) ON DELETE SET NULL,
    FOREIGN KEY (created_by) REFERENCES users(user_id) ON DELETE CASCADE,
    FOREIGN KEY (assigned_to) REFERENCES users(user_id) ON DELETE SET NULL,
    FOREIGN KEY (resolved_by) REFERENCES users(user_id) ON DELETE SET NULL
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_issue_logs_project_id ON issue_logs(project_id);
CREATE INDEX IF NOT EXISTS idx_issue_logs_entry_id ON issue_logs(entry_id);
CREATE INDEX IF NOT EXISTS idx_issue_logs_created_by ON issue_logs(created_by);
CREATE INDEX IF NOT EXISTS idx_issue_logs_status ON issue_logs(status);
CREATE INDEX IF NOT EXISTS idx_issue_logs_priority ON issue_logs(priority);
CREATE INDEX IF NOT EXISTS idx_issue_logs_created_at ON issue_logs(created_at);

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_issue_logs_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_issue_logs_updated_at ON issue_logs;
CREATE TRIGGER update_issue_logs_updated_at
    BEFORE UPDATE ON issue_logs
    FOR EACH ROW
    EXECUTE FUNCTION update_issue_logs_timestamp();

COMMENT ON TABLE issue_logs IS 'Issue logs for tracking problems - visible to Site PM and Admin';
