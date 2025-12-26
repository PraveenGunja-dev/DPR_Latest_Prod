-- Migration to add Activity Code support for P6 sync
-- This enables syncing Priority, Plot, and other activity codes from P6

-- Activity Code Types (e.g., "Priority", "Plot", "Phase")
CREATE TABLE IF NOT EXISTS p6_activity_code_types (
    object_id INTEGER PRIMARY KEY,
    project_object_id INTEGER NOT NULL,
    code_type_name VARCHAR(100) NOT NULL,
    description TEXT,
    sequence_number INTEGER,
    last_sync_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_object_id) REFERENCES p6_projects(object_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_activity_code_types_project ON p6_activity_code_types(project_object_id);
CREATE INDEX IF NOT EXISTS idx_activity_code_types_name ON p6_activity_code_types(code_type_name);

-- Activity Code Values (e.g., "High", "Medium", "Low" for Priority type)
CREATE TABLE IF NOT EXISTS p6_activity_codes (
    object_id INTEGER PRIMARY KEY,
    code_type_object_id INTEGER NOT NULL,
    code_value VARCHAR(255) NOT NULL,
    description TEXT,
    short_name VARCHAR(100),
    color VARCHAR(50),
    sequence_number INTEGER,
    last_sync_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (code_type_object_id) REFERENCES p6_activity_code_types(object_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_activity_codes_type ON p6_activity_codes(code_type_object_id);
CREATE INDEX IF NOT EXISTS idx_activity_codes_value ON p6_activity_codes(code_value);

-- Activity Code Assignments (links activities to their code values)
CREATE TABLE IF NOT EXISTS p6_activity_code_assignments (
    object_id INTEGER PRIMARY KEY,
    activity_object_id INTEGER NOT NULL,
    activity_code_object_id INTEGER NOT NULL,
    last_sync_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (activity_object_id) REFERENCES p6_activities(object_id) ON DELETE CASCADE,
    FOREIGN KEY (activity_code_object_id) REFERENCES p6_activity_codes(object_id) ON DELETE CASCADE,
    UNIQUE(activity_object_id, activity_code_object_id)
);

CREATE INDEX IF NOT EXISTS idx_activity_code_assignments_activity ON p6_activity_code_assignments(activity_object_id);
CREATE INDEX IF NOT EXISTS idx_activity_code_assignments_code ON p6_activity_code_assignments(activity_code_object_id);

-- Add denormalized columns to p6_activities for quick access
-- These will be populated during sync for performance
ALTER TABLE p6_activities ADD COLUMN IF NOT EXISTS priority VARCHAR(100);
ALTER TABLE p6_activities ADD COLUMN IF NOT EXISTS plot_code VARCHAR(100);
ALTER TABLE p6_activities ADD COLUMN IF NOT EXISTS new_block_nom VARCHAR(100);

CREATE INDEX IF NOT EXISTS idx_activities_priority ON p6_activities(priority);
CREATE INDEX IF NOT EXISTS idx_activities_plot_code ON p6_activities(plot_code);
