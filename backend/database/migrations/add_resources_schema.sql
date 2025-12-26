-- Migration to add Resource support for P6 sync
-- This enables syncing Contractor/Resource information from P6

-- Resources table (stores contractors, labor, equipment, etc.)
CREATE TABLE IF NOT EXISTS p6_resources (
    object_id INTEGER PRIMARY KEY,
    resource_id VARCHAR(100) NOT NULL,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(50),
    parent_object_id INTEGER,
    email VARCHAR(255),
    notes TEXT,
    is_active BOOLEAN DEFAULT true,
    sequence_number INTEGER,
    last_sync_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_resources_id ON p6_resources(resource_id);
CREATE INDEX IF NOT EXISTS idx_resources_name ON p6_resources(name);
CREATE INDEX IF NOT EXISTS idx_resources_type ON p6_resources(type);
CREATE INDEX IF NOT EXISTS idx_resources_parent ON p6_resources(parent_object_id);

-- Resource Assignments table (if not already exists from previous migrations)
-- Links activities to resources with planned/actual units
CREATE TABLE IF NOT EXISTS p6_resource_assignments (
    object_id INTEGER PRIMARY KEY,
    project_object_id INTEGER NOT NULL,
    activity_object_id INTEGER NOT NULL,
    resource_object_id INTEGER NOT NULL,
    resource_name VARCHAR(255),
    planned_units DECIMAL(18, 2),
    actual_units DECIMAL(18, 2),
    remaining_units DECIMAL(18, 2),
    budgeted_units DECIMAL(18, 2),
    unit_of_measure VARCHAR(50),
    is_primary_resource BOOLEAN DEFAULT false,
    start_date TIMESTAMP,
    finish_date TIMESTAMP,
    last_sync_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_object_id) REFERENCES p6_projects(object_id) ON DELETE CASCADE,
    FOREIGN KEY (activity_object_id) REFERENCES p6_activities(object_id) ON DELETE CASCADE,
    FOREIGN KEY (resource_object_id) REFERENCES p6_resources(object_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_resource_assignments_project ON p6_resource_assignments(project_object_id);
CREATE INDEX IF NOT EXISTS idx_resource_assignments_activity ON p6_resource_assignments(activity_object_id);
CREATE INDEX IF NOT EXISTS idx_resource_assignments_resource ON p6_resource_assignments(resource_object_id);
CREATE INDEX IF NOT EXISTS idx_resource_assignments_primary ON p6_resource_assignments(is_primary_resource);

-- Add denormalized contractor_name column to p6_activities
-- Will be populated with primary resource name during sync
ALTER TABLE p6_activities ADD COLUMN IF NOT EXISTS contractor_name VARCHAR(255);

CREATE INDEX IF NOT EXISTS idx_activities_contractor ON p6_activities(contractor_name);
