-- server/database/oracle-p6-complete-schema.sql
-- Complete Oracle P6 equivalent schema for all DPR sheets integration

-- Create activities table (Oracle P6 equivalent)
CREATE TABLE IF NOT EXISTS p6_activities (
    id SERIAL PRIMARY KEY,
    object_id INTEGER UNIQUE,  -- Oracle P6 uses ObjectId as primary identifier
    name VARCHAR(500) NOT NULL,
    project_id INTEGER NOT NULL,
    wbs_object_id INTEGER,
    status VARCHAR(50) NOT NULL DEFAULT 'Not Started',
    percent_complete DECIMAL(5,2) NOT NULL DEFAULT 0.00,
    planned_start_date DATE,
    planned_finish_date DATE,
    actual_start_date DATE,
    actual_finish_date DATE,
    remaining_duration DECIMAL(10,2),
    actual_duration DECIMAL(10,2),
    baseline_start_date DATE,
    baseline_finish_date DATE,
    forecast_start_date DATE,
    forecast_finish_date DATE,
    physical_percent_complete DECIMAL(5,2) DEFAULT 0.00,
    duration DECIMAL(10,2),
    activity_type VARCHAR(50),  -- Task Dependent, Resource Dependent, Level of Effort, Start Milestone, Finish Milestone
    critical BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- Create WBS (Work Breakdown Structure) table (Oracle P6 equivalent)
CREATE TABLE IF NOT EXISTS p6_wbs (
    id SERIAL PRIMARY KEY,
    object_id INTEGER UNIQUE,  -- Oracle P6 uses ObjectId as primary identifier
    name VARCHAR(255) NOT NULL,
    project_id INTEGER NOT NULL,
    parent_wbs_object_id INTEGER,
    seq_num INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- Create resources table (Oracle P6 equivalent)
CREATE TABLE IF NOT EXISTS p6_resources (
    id SERIAL PRIMARY KEY,
    object_id INTEGER UNIQUE,  -- Oracle P6 uses ObjectId as primary identifier
    name VARCHAR(255) NOT NULL,
    resource_type VARCHAR(50) NOT NULL,  -- Labor, Material, Equipment, etc.
    units DECIMAL(10,2) DEFAULT 1.00,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create activity assignments table (Oracle P6 equivalent)
CREATE TABLE IF NOT EXISTS p6_activity_assignments (
    id SERIAL PRIMARY KEY,
    activity_object_id INTEGER NOT NULL,
    resource_object_id INTEGER NOT NULL,
    units DECIMAL(5,2) NOT NULL DEFAULT 1.00,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (activity_object_id) REFERENCES p6_activities(object_id) ON DELETE CASCADE,
    FOREIGN KEY (resource_object_id) REFERENCES p6_resources(object_id) ON DELETE CASCADE,
    UNIQUE(activity_object_id, resource_object_id)
);

-- Create activity codes table (Oracle P6 equivalent)
CREATE TABLE IF NOT EXISTS p6_activity_codes (
    id SERIAL PRIMARY KEY,
    object_id INTEGER UNIQUE,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(100),
    value VARCHAR(255),
    activity_object_id INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (activity_object_id) REFERENCES p6_activities(object_id) ON DELETE CASCADE
);

-- Create milestones table (Oracle P6 equivalent)
CREATE TABLE IF NOT EXISTS p6_milestones (
    id SERIAL PRIMARY KEY,
    object_id INTEGER UNIQUE,
    name VARCHAR(255) NOT NULL,
    project_id INTEGER NOT NULL,
    planned_date DATE,
    actual_date DATE,
    milestone_type VARCHAR(50),  -- Start, Finish, Key Date
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- Create relationships table (Oracle P6 equivalent)
CREATE TABLE IF NOT EXISTS p6_relationships (
    id SERIAL PRIMARY KEY,
    predecessor_object_id INTEGER NOT NULL,
    successor_object_id INTEGER NOT NULL,
    relationship_type VARCHAR(50),  -- FS, SS, FF, SF
    lag_days DECIMAL(10,2) DEFAULT 0.00,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (predecessor_object_id) REFERENCES p6_activities(object_id) ON DELETE CASCADE,
    FOREIGN KEY (successor_object_id) REFERENCES p6_activities(object_id) ON DELETE CASCADE
);

-- Create vendors table (Oracle P6 equivalent)
CREATE TABLE IF NOT EXISTS p6_vendors (
    id SERIAL PRIMARY KEY,
    object_id INTEGER UNIQUE,
    name VARCHAR(255) NOT NULL,
    contact_person VARCHAR(255),
    phone VARCHAR(50),
    email VARCHAR(255),
    address TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create equipment table (Oracle P6 equivalent)
CREATE TABLE IF NOT EXISTS p6_equipment (
    id SERIAL PRIMARY KEY,
    object_id INTEGER UNIQUE,
    name VARCHAR(255) NOT NULL,
    equipment_type VARCHAR(100),
    manufacturer VARCHAR(255),
    model VARCHAR(255),
    serial_number VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create RFI (Request for Information) table (Oracle P6 equivalent)
CREATE TABLE IF NOT EXISTS p6_rfis (
    id SERIAL PRIMARY KEY,
    object_id INTEGER UNIQUE,
    rfi_number VARCHAR(50) NOT NULL,
    subject VARCHAR(255) NOT NULL,
    module VARCHAR(100),
    submitted_date DATE,
    response_date DATE,
    status VARCHAR(50),
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create modules table (Oracle P6 equivalent)
CREATE TABLE IF NOT EXISTS p6_modules (
    id SERIAL PRIMARY KEY,
    object_id INTEGER UNIQUE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    project_id INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- Create contractors table (Oracle P6 equivalent)
CREATE TABLE IF NOT EXISTS p6_contractors (
    id SERIAL PRIMARY KEY,
    object_id INTEGER UNIQUE,
    name VARCHAR(255) NOT NULL,
    contact_person VARCHAR(255),
    phone VARCHAR(50),
    email VARCHAR(255),
    address TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create manhours table (Oracle P6 equivalent)
CREATE TABLE IF NOT EXISTS p6_manhours (
    id SERIAL PRIMARY KEY,
    object_id INTEGER UNIQUE,
    resource_object_id INTEGER NOT NULL,
    activity_object_id INTEGER NOT NULL,
    date DATE NOT NULL,
    hours DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (resource_object_id) REFERENCES p6_resources(object_id) ON DELETE CASCADE,
    FOREIGN KEY (activity_object_id) REFERENCES p6_activities(object_id) ON DELETE CASCADE
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_p6_activities_project ON p6_activities(project_id);
CREATE INDEX IF NOT EXISTS idx_p6_activities_object_id ON p6_activities(object_id);
CREATE INDEX IF NOT EXISTS idx_p6_activities_dates ON p6_activities(planned_start_date, planned_finish_date);
CREATE INDEX IF NOT EXISTS idx_p6_activities_status ON p6_activities(status);
CREATE INDEX IF NOT EXISTS idx_p6_activities_critical ON p6_activities(critical);
CREATE INDEX IF NOT EXISTS idx_p6_wbs_project ON p6_wbs(project_id);
CREATE INDEX IF NOT EXISTS idx_p6_wbs_object_id ON p6_wbs(object_id);
CREATE INDEX IF NOT EXISTS idx_p6_resources_object_id ON p6_resources(object_id);
CREATE INDEX IF NOT EXISTS idx_p6_activity_codes_activity ON p6_activity_codes(activity_object_id);
CREATE INDEX IF NOT EXISTS idx_p6_milestones_project ON p6_milestones(project_id);
CREATE INDEX IF NOT EXISTS idx_p6_relationships_predecessor ON p6_relationships(predecessor_object_id);
CREATE INDEX IF NOT EXISTS idx_p6_relationships_successor ON p6_relationships(successor_object_id);
CREATE INDEX IF NOT EXISTS idx_p6_manhours_date ON p6_manhours(date);
CREATE INDEX IF NOT EXISTS idx_p6_manhours_resource ON p6_manhours(resource_object_id);
CREATE INDEX IF NOT EXISTS idx_p6_manhours_activity ON p6_manhours(activity_object_id);

-- Sample data for demonstration
INSERT INTO p6_wbs (object_id, name, project_id, seq_num) VALUES
(1001, 'Design Phase', 1, 1),
(1002, 'Construction Phase', 1, 2),
(1003, 'Testing Phase', 1, 3),
(1004, 'Commissioning Phase', 1, 4)
ON CONFLICT DO NOTHING;

INSERT INTO p6_resources (object_id, name, resource_type, units) VALUES
(2001, 'Engineer Team', 'Labor', 2.00),
(2002, 'Construction Crew', 'Labor', 5.00),
(2003, 'Testing Equipment', 'Equipment', 1.00),
(2004, 'Solar Panels', 'Material', 1000.00)
ON CONFLICT DO NOTHING;

INSERT INTO p6_contractors (object_id, name, contact_person, phone, email) VALUES
(3001, 'ABC Construction Ltd', 'John Smith', '+91-9876543210', 'john@abcconstruction.com'),
(3002, 'XYZ Engineering Pvt Ltd', 'Jane Doe', '+91-9876543211', 'jane@xyzengineering.com')
ON CONFLICT DO NOTHING;

INSERT INTO p6_vendors (object_id, name, contact_person, phone, email) VALUES
(4001, 'SolarTech Solutions', 'Mike Johnson', '+91-9876543212', 'mike@solartech.com'),
(4002, 'ElectroSystems Inc', 'Sarah Wilson', '+91-9876543213', 'sarah@electrosystems.com')
ON CONFLICT DO NOTHING;

-- Sample activities for the first project
INSERT INTO p6_activities (object_id, name, project_id, wbs_object_id, status, percent_complete, 
                           planned_start_date, planned_finish_date, baseline_start_date, baseline_finish_date,
                           duration, activity_type, critical) VALUES
(5001, 'Foundation Design', 1, 1001, 'Completed', 100.00, '2025-02-01', '2025-03-15', '2025-02-01', '2025-03-15', 45, 'Task Dependent', false),
(5002, 'Structural Design', 1, 1001, 'In Progress', 65.00, '2025-03-01', '2025-05-30', '2025-03-01', '2025-05-30', 90, 'Task Dependent', true),
(5003, 'Site Preparation', 1, 1002, 'Not Started', 0.00, '2025-06-01', '2025-06-30', '2025-06-01', '2025-06-30', 30, 'Task Dependent', false),
(5004, 'Foundation Construction', 1, 1002, 'Not Started', 0.00, '2025-07-01', '2025-08-15', '2025-07-01', '2025-08-15', 45, 'Task Dependent', true),
(5005, 'Structural Construction', 1, 1002, 'Not Started', 0.00, '2025-08-01', '2025-10-30', '2025-08-01', '2025-10-30', 90, 'Task Dependent', true)
ON CONFLICT DO NOTHING;

-- Assign resources to activities
INSERT INTO p6_activity_assignments (activity_object_id, resource_object_id, units) VALUES
(5001, 2001, 2.00),
(5002, 2001, 3.00),
(5003, 2002, 5.00),
(5004, 2002, 8.00),
(5005, 2002, 10.00)
ON CONFLICT DO NOTHING;

-- Add activity codes
INSERT INTO p6_activity_codes (object_id, name, type, value, activity_object_id) VALUES
(6001, 'Phase', 'Activity Code', 'Design', 5001),
(6002, 'Phase', 'Activity Code', 'Design', 5002),
(6003, 'Phase', 'Activity Code', 'Construction', 5003),
(6004, 'Phase', 'Activity Code', 'Construction', 5004),
(6005, 'Phase', 'Activity Code', 'Construction', 5005)
ON CONFLICT DO NOTHING;

-- Sample RFI data
INSERT INTO p6_rfis (object_id, rfi_number, subject, module, submitted_date, response_date, status) VALUES
(7001, 'RFI-001', 'Clarification on Foundation Design', 'Civil', '2025-02-15', '2025-02-20', 'Closed'),
(7002, 'RFI-002', 'Electrical Conduits Routing', 'Electrical', '2025-03-10', NULL, 'Open')
ON CONFLICT DO NOTHING;

-- Sample modules data
INSERT INTO p6_modules (object_id, name, description, project_id) VALUES
(8001, 'Solar Panel Array', 'PV module installation', 1),
(8002, 'Inverter System', 'Power conversion system', 1)
ON CONFLICT DO NOTHING;