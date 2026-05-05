# app/migrations.py
"""
Database migrations that run on startup.
Port of the runMigrations() function from Express server.js
"""

import logging

from app.database import get_pool

logger = logging.getLogger("adani-flow.migrations")


async def run_migrations():
    """Run all database migrations on startup. Matches Express server.js runMigrations()."""
    logger.info("Running database migrations...")
    pool = await get_pool()

    async def _exec(sql: str):
        """Execute a migration query, logging real errors but ignoring 'already exists'."""
        try:
            await pool.execute(sql)
        except Exception as e:
            err_msg = str(e).lower()
            if "already exists" in err_msg or "already a column" in err_msg or "duplicate" in err_msg:
                return
            logger.warning(f"Migration Query failed: {sql[:100]}... Error: {e}")

    try:
        # --- Base Tables (from legacy schema.sql) ---
        await _exec("""
            CREATE TABLE IF NOT EXISTS users (
                user_id SERIAL PRIMARY KEY,
                name VARCHAR(100) NOT NULL,
                email VARCHAR(100) UNIQUE NOT NULL,
                password VARCHAR(255),
                role VARCHAR(50) NOT NULL,
                is_active BOOLEAN DEFAULT true,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        await _exec("""
            CREATE TABLE IF NOT EXISTS projects (
                object_id BIGINT PRIMARY KEY,
                id VARCHAR(100) UNIQUE,
                name VARCHAR(255) NOT NULL,
                location VARCHAR(255),
                status VARCHAR(50) DEFAULT 'planning',
                progress INTEGER DEFAULT 0,
                plan_start DATE,
                plan_end DATE,
                actual_start DATE,
                actual_end DATE,
                start_date TIMESTAMP WITH TIME ZONE,
                finish_date TIMESTAMP WITH TIME ZONE,
                summary_planned_labor_units NUMERIC,
                summary_actual_labor_units NUMERIC,
                description TEXT,
                parent_eps VARCHAR(255),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # ─── Master Data Tables (Missing in fresh DB) ──────────────────
        
        await _exec("""
            CREATE TABLE IF NOT EXISTS solar_activities (
                object_id BIGINT PRIMARY KEY,
                activity_id VARCHAR(100),
                name VARCHAR(500),
                status VARCHAR(50),
                activity_type VARCHAR(50),
                project_object_id BIGINT,
                wbs_object_id BIGINT,
                wbs_name VARCHAR(500),
                planned_start TIMESTAMPTZ,
                planned_finish TIMESTAMPTZ,
                start_date TIMESTAMPTZ,
                finish_date TIMESTAMPTZ,
                baseline_start TIMESTAMPTZ,
                baseline_finish TIMESTAMPTZ,
                actual_start TIMESTAMPTZ,
                actual_finish TIMESTAMPTZ,
                p6_last_update_date TIMESTAMPTZ,
                p6_last_update_user VARCHAR(255),
                percent_complete NUMERIC,
                total_quantity NUMERIC DEFAULT 0,
                uom VARCHAR(50),
                balance NUMERIC DEFAULT 0,
                cumulative NUMERIC DEFAULT 0,
                last_sync_at TIMESTAMPTZ DEFAULT NOW(),
                remarks TEXT,
                scope TEXT,
                front TEXT,
                hold BOOLEAN DEFAULT FALSE,
                block_capacity NUMERIC,
                phase VARCHAR(50),
                spv_no VARCHAR(50),
                priority VARCHAR(50),
                plot VARCHAR(100),
                new_block_nom VARCHAR(100),
                discipline VARCHAR(100),
                weightage NUMERIC,
                primary_resource VARCHAR(255),
                planned_duration NUMERIC,
                remaining_duration NUMERIC,
                actual_duration NUMERIC,
                physical_percent_complete NUMERIC,
                hours_per_day NUMERIC DEFAULT 8
            )
        """)

        await _exec("""
            CREATE TABLE IF NOT EXISTS solar_resource_assignments (
                object_id BIGINT PRIMARY KEY,
                activity_object_id BIGINT,
                project_object_id BIGINT,
                resource_id VARCHAR(100),
                resource_name VARCHAR(500),
                resource_type VARCHAR(50),
                planned_units NUMERIC,
                actual_units NUMERIC,
                remaining_units NUMERIC,
                budget_at_completion_units NUMERIC,
                at_completion_units NUMERIC,
                percent_complete NUMERIC,
                hours_per_day NUMERIC DEFAULT 8,
                actual_start TIMESTAMPTZ,
                actual_finish TIMESTAMPTZ
            )
        """)

        await _exec("""
            CREATE TABLE IF NOT EXISTS solar_wbs (
                object_id BIGINT PRIMARY KEY,
                name VARCHAR(500),
                code VARCHAR(100),
                parent_object_id BIGINT,
                project_object_id BIGINT,
                status VARCHAR(50)
            )
        """)

        await _exec("""
            CREATE TABLE IF NOT EXISTS dpr_daily_progress (
                id SERIAL PRIMARY KEY,
                activity_object_id BIGINT NOT NULL,
                progress_date DATE NOT NULL,
                today_value NUMERIC DEFAULT 0,
                cumulative_value NUMERIC DEFAULT 0,
                sheet_type VARCHAR(50),
                remarks TEXT,
                created_at TIMESTAMPTZ DEFAULT NOW(),
                UNIQUE(activity_object_id, progress_date, sheet_type)
            )
        """)

        await _exec("""
            CREATE TABLE IF NOT EXISTS access_requests (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
                requested_role VARCHAR(50) NOT NULL,
                justification TEXT,
                status VARCHAR(20) DEFAULT 'pending',
                reviewed_by INTEGER REFERENCES users(user_id),
                review_notes TEXT,
                reviewed_at TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # Views / Aliases for convenience (Used in charts)
        # These allow the charts router to query Generic Master tables.
        # We drop both to ensure we can create the view correctly regardless of past state.
        await _exec("DROP TABLE IF EXISTS dpr_activities CASCADE")
        await _exec("DROP VIEW IF EXISTS dpr_activities CASCADE")
        await _exec("CREATE VIEW dpr_activities AS SELECT * FROM solar_activities")
        
        await _exec("DROP TABLE IF EXISTS dpr_resource_assignments CASCADE")
        await _exec("DROP VIEW IF EXISTS dpr_resource_assignments CASCADE")
        await _exec("CREATE VIEW dpr_resource_assignments AS SELECT * FROM solar_resource_assignments")

        # Raw P6 Tables (Minimial definitions to support ALTERs below)
        await _exec("CREATE TABLE IF NOT EXISTS p6_activities (object_id BIGINT PRIMARY KEY)")
        await _exec("CREATE TABLE IF NOT EXISTS p6_wbs (object_id BIGINT PRIMARY KEY)")
        await _exec("CREATE TABLE IF NOT EXISTS p6_resource_assignments (object_id BIGINT PRIMARY KEY)")
        await _exec("CREATE TABLE IF NOT EXISTS p6_activity_codes (object_id BIGINT PRIMARY KEY)")
        await _exec("CREATE TABLE IF NOT EXISTS p6_activity_code_assignments (object_id BIGINT PRIMARY KEY)")
        
        # Add columns if table already existed without them
        await _exec("ALTER TABLE projects ADD COLUMN IF NOT EXISTS object_id BIGINT")
        await _exec("ALTER TABLE projects ADD COLUMN IF NOT EXISTS parent_eps VARCHAR(255)")
        await _exec("ALTER TABLE projects ADD COLUMN IF NOT EXISTS app_status VARCHAR(20) DEFAULT 'live'")
        await _exec("ALTER TABLE projects ADD COLUMN IF NOT EXISTS last_sync_at TIMESTAMPTZ")
        await _exec("ALTER TABLE projects ADD COLUMN IF NOT EXISTS data_date TIMESTAMPTZ")
        await _exec("ALTER TABLE projects ADD COLUMN IF NOT EXISTS last_update_date TIMESTAMPTZ")
        await _exec("ALTER TABLE projects ADD COLUMN IF NOT EXISTS last_update_user VARCHAR(255)")
        await _exec("ALTER TABLE projects ADD COLUMN IF NOT EXISTS start_date TIMESTAMPTZ")
        await _exec("ALTER TABLE projects ADD COLUMN IF NOT EXISTS finish_date TIMESTAMPTZ")
        await _exec("ALTER TABLE projects ADD COLUMN IF NOT EXISTS summary_planned_labor_units NUMERIC")
        await _exec("ALTER TABLE projects ADD COLUMN IF NOT EXISTS summary_actual_labor_units NUMERIC")
        await _exec("ALTER TABLE projects ADD COLUMN IF NOT EXISTS description TEXT")

        await _exec("""
            CREATE TABLE IF NOT EXISTS project_assignments (
                id SERIAL PRIMARY KEY,
                project_id BIGINT NOT NULL,
                user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
                assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                assigned_by INTEGER REFERENCES users(user_id) ON DELETE SET NULL,
                UNIQUE(project_id, user_id)
            )
        """)

        await _exec("""
            CREATE TABLE IF NOT EXISTS dpr_sheets (
                id SERIAL PRIMARY KEY,
                project_id BIGINT NOT NULL,
                supervisor_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
                sheet_type VARCHAR(50) NOT NULL,
                submission_date DATE NOT NULL,
                yesterday_date DATE NOT NULL,
                today_date DATE NOT NULL,
                sheet_data JSONB NOT NULL,
                status VARCHAR(20) DEFAULT 'draft',
                is_locked BOOLEAN DEFAULT FALSE,
                submitted_at TIMESTAMP,
                pm_reviewed_at TIMESTAMP,
                pm_reviewed_by INTEGER REFERENCES users(user_id) ON DELETE SET NULL,
                pmag_reviewed_at TIMESTAMP,
                pmag_reviewed_by INTEGER REFERENCES users(user_id) ON DELETE SET NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        await _exec("""
            CREATE TABLE IF NOT EXISTS dpr_comments (
                id SERIAL PRIMARY KEY,
                sheet_id INTEGER NOT NULL REFERENCES dpr_sheets(id) ON DELETE CASCADE,
                user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
                user_role VARCHAR(20) NOT NULL,
                comment_text TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        await _exec("""
            CREATE TABLE IF NOT EXISTS dpr_sheet_history (
                id SERIAL PRIMARY KEY,
                sheet_id INTEGER NOT NULL REFERENCES dpr_sheets(id) ON DELETE CASCADE,
                action VARCHAR(50) NOT NULL,
                performed_by INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
                old_status VARCHAR(20),
                new_status VARCHAR(20),
                comments TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        await _exec("""
            CREATE TABLE IF NOT EXISTS dpr_supervisor_entries (
                id SERIAL PRIMARY KEY,
                supervisor_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
                project_id BIGINT NOT NULL,
                sheet_type VARCHAR(50) NOT NULL,
                entry_date DATE NOT NULL,
                previous_date DATE NOT NULL,
                data_json JSONB NOT NULL,
                status VARCHAR(20) DEFAULT 'draft',
                submitted_at TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        await _exec("""
            CREATE TABLE IF NOT EXISTS system_logs (
                id SERIAL PRIMARY KEY,
                action_type VARCHAR(50) NOT NULL,
                performed_by INTEGER REFERENCES users(user_id) ON DELETE SET NULL,
                target_entity VARCHAR(255),
                remarks TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        await _exec("""
            CREATE TABLE IF NOT EXISTS p6_projects (
                "ObjectId" BIGINT PRIMARY KEY,
                "Id" VARCHAR(100),
                "Name" VARCHAR(255),
                "Description" TEXT,
                "Status" VARCHAR(50),
                "PlannedStartDate" TIMESTAMP WITH TIME ZONE,
                "PlannedFinishDate" TIMESTAMP WITH TIME ZONE,
                "StartDate" TIMESTAMP WITH TIME ZONE,
                "FinishDate" TIMESTAMP WITH TIME ZONE,
                "DataDate" TIMESTAMP WITH TIME ZONE,
                "LastSyncAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                "LastUpdateDate" TIMESTAMP WITH TIME ZONE,
                "LastUpdateUser" VARCHAR(255),
                "ParentEPSName" VARCHAR(255),
                "CurrentBaselineProjectObjectId" BIGINT,
                "SummaryPlannedLaborUnits" NUMERIC,
                "SummaryActualLaborUnits" NUMERIC,
                project_type VARCHAR(50) DEFAULT 'solar'
            )
        """)

        # Seed initial admin if zero users
        user_count = await pool.fetchval("SELECT count(*) FROM users")
        if user_count == 0:
            from app.auth.password import hash_password
            admin_email = "superadmin.adani@adani.com"
            hashed = hash_password("admin123")
            await pool.execute(
                "INSERT INTO users (name, email, password, role) VALUES ($1, $2, $3, $4)",
                "Super Admin", admin_email, hashed, "Super Admin"
            )
            logger.info("OK Initialized database with default Super Admin")

        # --- Evolution Migrations (Existing) ---

        # Drop FK constraints to support P6 projects
        await _exec("ALTER TABLE dpr_supervisor_entries DROP CONSTRAINT IF EXISTS dpr_supervisor_entries_project_id_fkey")
        await _exec("ALTER TABLE project_assignments DROP CONSTRAINT IF EXISTS project_assignments_project_id_fkey")

        # Ensure project_id is BIGINT for P6 ObjectIds
        await _exec("ALTER TABLE project_assignments ALTER COLUMN project_id TYPE BIGINT")
        await _exec("ALTER TABLE dpr_supervisor_entries ALTER COLUMN project_id TYPE BIGINT")
        await _exec("ALTER TABLE dpr_sheets ALTER COLUMN project_id TYPE BIGINT")

        # Add sheet_types column
        await _exec("ALTER TABLE project_assignments ADD COLUMN IF NOT EXISTS sheet_types JSONB")

        # Evolution Migrations
        await _exec('ALTER TABLE p6_projects ADD COLUMN IF NOT EXISTS "Description" TEXT')
        await _exec('ALTER TABLE p6_projects ADD COLUMN IF NOT EXISTS "PlannedStartDate" TIMESTAMP WITH TIME ZONE')
        await _exec('ALTER TABLE p6_projects ADD COLUMN IF NOT EXISTS "PlannedFinishDate" TIMESTAMP WITH TIME ZONE')
        await _exec('ALTER TABLE p6_projects ADD COLUMN IF NOT EXISTS "DataDate" TIMESTAMP WITH TIME ZONE')
        await _exec('ALTER TABLE p6_projects ADD COLUMN IF NOT EXISTS "Status" VARCHAR(50)')
        await _exec('ALTER TABLE p6_projects ADD COLUMN IF NOT EXISTS "StartDate" TIMESTAMP WITH TIME ZONE')
        await _exec('ALTER TABLE p6_projects ADD COLUMN IF NOT EXISTS "FinishDate" TIMESTAMP WITH TIME ZONE')
        await _exec('ALTER TABLE p6_projects ADD COLUMN IF NOT EXISTS "LastUpdateDate" TIMESTAMP WITH TIME ZONE')
        await _exec('ALTER TABLE p6_projects ADD COLUMN IF NOT EXISTS "LastUpdateUser" VARCHAR(255)')
        await _exec('ALTER TABLE p6_projects ADD COLUMN IF NOT EXISTS "LastSyncAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()')
        await _exec('ALTER TABLE p6_projects ADD COLUMN IF NOT EXISTS "ParentEPSName" VARCHAR(255)')
        await _exec('ALTER TABLE p6_projects ADD COLUMN IF NOT EXISTS "CurrentBaselineProjectObjectId" BIGINT')
        await _exec('ALTER TABLE p6_projects ADD COLUMN IF NOT EXISTS "SummaryPlannedLaborUnits" NUMERIC')
        await _exec('ALTER TABLE p6_projects ADD COLUMN IF NOT EXISTS "SummaryActualLaborUnits" NUMERIC')
        await _exec("ALTER TABLE p6_projects ADD COLUMN IF NOT EXISTS project_type VARCHAR(50) DEFAULT 'solar'")
        await _exec("ALTER TABLE solar_activities ADD COLUMN IF NOT EXISTS hours_per_day NUMERIC DEFAULT 8")
        await _exec("ALTER TABLE solar_resource_assignments ADD COLUMN IF NOT EXISTS hours_per_day NUMERIC DEFAULT 8")
        await _exec("ALTER TABLE solar_resource_assignments ADD COLUMN IF NOT EXISTS at_completion_units NUMERIC")
        await _exec("ALTER TABLE solar_resource_assignments ADD COLUMN IF NOT EXISTS percent_complete NUMERIC")
        await _exec("ALTER TABLE solar_resource_assignments ADD COLUMN IF NOT EXISTS actual_start TIMESTAMPTZ")
        await _exec("ALTER TABLE solar_resource_assignments ADD COLUMN IF NOT EXISTS actual_finish TIMESTAMPTZ")
        
        await _exec("ALTER TABLE projects ADD COLUMN IF NOT EXISTS plan_start DATE")
        await _exec("ALTER TABLE projects ADD COLUMN IF NOT EXISTS plan_end DATE")
        await _exec("ALTER TABLE projects ADD COLUMN IF NOT EXISTS actual_start DATE")
        await _exec("ALTER TABLE projects ADD COLUMN IF NOT EXISTS actual_end DATE")
        await _exec("ALTER TABLE projects ADD COLUMN IF NOT EXISTS project_type VARCHAR(50) DEFAULT 'solar'")

        # Sync project_type from p6_projects to projects table
        await _exec("""
            UPDATE projects p
            SET project_type = p6.project_type
            FROM p6_projects p6
            WHERE p.object_id = p6."ObjectId"
              AND p6.project_type IS NOT NULL
              AND (p.project_type IS NULL OR p.project_type = 'solar')
              AND p6.project_type != 'solar'
        """)

        # BIGINT conversions for P6 tables - Only if columns exist
        bigint_queries = [
            'ALTER TABLE p6_projects ALTER COLUMN "ObjectId" TYPE BIGINT',
            'ALTER TABLE p6_activities ALTER COLUMN object_id TYPE BIGINT',
            'ALTER TABLE p6_wbs ALTER COLUMN object_id TYPE BIGINT',
            'ALTER TABLE p6_resource_assignments ALTER COLUMN object_id TYPE BIGINT',
            'ALTER TABLE p6_activity_codes ALTER COLUMN object_id TYPE BIGINT',
            'ALTER TABLE p6_activity_code_assignments ALTER COLUMN object_id TYPE BIGINT',
        ]
        for q in bigint_queries:
            # We use a custom execute that ignores 'column does not exist' for these specific cleanup steps
            try:
                await pool.execute(q)
            except Exception as e:
                if "does not exist" in str(e).lower():
                    continue
                logger.warning(f"Cleanup Migration failed: {q}... Error: {e}")

        # Audit tracking fields on dpr_supervisor_entries
        await _exec("ALTER TABLE dpr_supervisor_entries ADD COLUMN IF NOT EXISTS submitted_by INTEGER REFERENCES users(user_id)")
        await _exec("ALTER TABLE dpr_supervisor_entries ADD COLUMN IF NOT EXISTS pm_reviewed_at TIMESTAMP")
        await _exec("ALTER TABLE dpr_supervisor_entries ADD COLUMN IF NOT EXISTS pm_reviewed_by INTEGER REFERENCES users(user_id)")
        await _exec("ALTER TABLE dpr_supervisor_entries ADD COLUMN IF NOT EXISTS rejection_reason TEXT")
        await _exec("ALTER TABLE dpr_supervisor_entries ADD COLUMN IF NOT EXISTS pushed_at TIMESTAMP")
        await _exec("ALTER TABLE dpr_supervisor_entries ADD COLUMN IF NOT EXISTS pushed_by INTEGER REFERENCES users(user_id)")

        # Push Audit table
        await _exec("""
            CREATE TABLE IF NOT EXISTS push_audit (
                id SERIAL PRIMARY KEY,
                entry_id INTEGER REFERENCES dpr_supervisor_entries(id) ON DELETE CASCADE,
                activity_object_id BIGINT,
                ra_object_id BIGINT,
                field_name VARCHAR(100),
                old_value TEXT,
                new_value TEXT,
                push_status VARCHAR(20),
                error_message TEXT,
                pushed_at TIMESTAMPTZ DEFAULT NOW(),
                pushed_by INTEGER REFERENCES users(user_id) ON DELETE SET NULL
            )
        """)

        # Cell comments table
        await _exec("""
            CREATE TABLE IF NOT EXISTS cell_comments (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                sheet_id INTEGER NOT NULL,
                row_index INTEGER NOT NULL,
                column_key VARCHAR(100) NOT NULL,
                parent_comment_id UUID REFERENCES cell_comments(id) ON DELETE CASCADE,
                comment_text TEXT NOT NULL,
                comment_type VARCHAR(20) NOT NULL CHECK (comment_type IN ('REJECTION', 'GENERAL')),
                created_by INTEGER NOT NULL REFERENCES users(user_id),
                role VARCHAR(50) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                is_deleted BOOLEAN DEFAULT FALSE
            )
        """)
        await _exec("CREATE INDEX IF NOT EXISTS idx_cell_comments_cell ON cell_comments(sheet_id, row_index, column_key)")
        await _exec("CREATE INDEX IF NOT EXISTS idx_cell_comments_sheet ON cell_comments(sheet_id)")
        await _exec("CREATE INDEX IF NOT EXISTS idx_cell_comments_parent ON cell_comments(parent_comment_id)")

        # Issue logs table
        await _exec("""
            CREATE TABLE IF NOT EXISTS issue_logs (
                id SERIAL PRIMARY KEY, project_id BIGINT, entry_id INTEGER,
                sheet_type VARCHAR(50), issue_type VARCHAR(50) NOT NULL DEFAULT 'general',
                title VARCHAR(255) NOT NULL, description TEXT NOT NULL,
                priority VARCHAR(20) NOT NULL DEFAULT 'medium', status VARCHAR(20) NOT NULL DEFAULT 'open',
                created_by INTEGER NOT NULL, assigned_to INTEGER,
                resolved_by INTEGER, resolved_at TIMESTAMP, resolution_notes TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        await _exec("CREATE INDEX IF NOT EXISTS idx_issue_logs_status ON issue_logs(status)")
        await _exec("CREATE INDEX IF NOT EXISTS idx_issue_logs_priority ON issue_logs(priority)")
        await _exec("CREATE INDEX IF NOT EXISTS idx_issue_logs_created_at ON issue_logs(created_at)")

        # SSO columns
        await _exec("ALTER TABLE users ADD COLUMN IF NOT EXISTS sso_provider VARCHAR(50)")
        await _exec("ALTER TABLE users ADD COLUMN IF NOT EXISTS azure_oid VARCHAR(255)")

        # Add sheet_type to dpr_daily_progress if missing
        await _exec("ALTER TABLE dpr_daily_progress ADD COLUMN IF NOT EXISTS sheet_type VARCHAR(50)")
        
        # Populate null sheet_types for existing rows to avoid unique constraint issues
        await _exec("UPDATE dpr_daily_progress SET sheet_type = 'dp_qty' WHERE sheet_type IS NULL")
        
        # Update unique constraint to include sheet_type. 
        # We drop any potential old constraint first (handling different naming conventions)
        await _exec("ALTER TABLE dpr_daily_progress DROP CONSTRAINT IF EXISTS dpr_daily_progress_activity_object_id_progress_date_key")
        await _exec("ALTER TABLE dpr_daily_progress DROP CONSTRAINT IF EXISTS dpr_daily_progress_activity_object_id_progress_date_sheet_ty_key")
        await _exec("ALTER TABLE dpr_daily_progress ADD CONSTRAINT dpr_daily_progress_activity_object_id_progress_date_sheet_ty_key UNIQUE(activity_object_id, progress_date, sheet_type)")
        await _exec("ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check")
        await _exec("ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('Supervisor', 'Site PM', 'PMAG', 'Super Admin', 'External'))")
        
        # Migrate any legacy/lowercase/pending roles
        await _exec("""
            UPDATE users 
            SET role = 'Supervisor', is_active = false 
            WHERE role NOT IN ('Supervisor', 'Site PM', 'PMAG', 'Super Admin', 'External')
        """)

        # Make password nullable for SSO
        await _exec("ALTER TABLE users ALTER COLUMN password DROP NOT NULL")

        # Notifications table
        await _exec("""
            CREATE TABLE IF NOT EXISTS notifications (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
                title VARCHAR(255) NOT NULL,
                message TEXT NOT NULL,
                type VARCHAR(20) DEFAULT 'info',
                project_id BIGINT,
                entry_id INTEGER,
                sheet_type VARCHAR(50),
                read BOOLEAN DEFAULT FALSE,
                timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # DPR Entry Snapshots – versioned history of data_json at each lifecycle event
        await _exec("""
            CREATE TABLE IF NOT EXISTS dpr_entry_snapshots (
                id SERIAL PRIMARY KEY,
                entry_id INTEGER NOT NULL REFERENCES dpr_supervisor_entries(id) ON DELETE CASCADE,
                version INTEGER NOT NULL DEFAULT 1,
                action VARCHAR(50) NOT NULL,
                data_json JSONB NOT NULL,
                status_before VARCHAR(30),
                status_after VARCHAR(30),
                performed_by INTEGER REFERENCES users(user_id) ON DELETE SET NULL,
                remarks TEXT,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            )
        """)
        await _exec("CREATE INDEX IF NOT EXISTS idx_snapshots_action ON dpr_entry_snapshots(action)")
        
        # User Column Preferences table
        await _exec("""
            CREATE TABLE IF NOT EXISTS user_column_preferences (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
                project_id BIGINT NOT NULL,
                sheet_type VARCHAR(50) NOT NULL,
                visible_columns JSONB NOT NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(user_id, project_id, sheet_type)
            )
        """)
        await _exec("CREATE INDEX IF NOT EXISTS idx_user_prefs_lookup ON user_column_preferences(user_id, project_id, sheet_type)")

        # Update sheet_type CHECK constraint to include manpower_details_2
        await _exec("ALTER TABLE dpr_supervisor_entries DROP CONSTRAINT IF EXISTS dpr_supervisor_entries_sheet_type_check")
        await _exec("""
            ALTER TABLE dpr_supervisor_entries ADD CONSTRAINT dpr_supervisor_entries_sheet_type_check
            CHECK (sheet_type IN (
                'dp_qty', 'dp_block', 'dp_vendor_idt', 'mms_module_rfi',
                'dp_vendor_block', 'manpower_details', 'manpower_details_2',
                'testing_commissioning',
                'switchyard', 'transmission_line', 'infra_works',
                'wind_summary', 'wind_progress', 'wind_manpower',
                'pss_summary', 'pss_progress', 'pss_manpower',
                'wind_tower_lot', 'wind_crane_pad', 'wind_precast',
                'wind_33kv', 'wind_33kv_oh', 'wind_33kv_ug', 'wind_pss', 'wind_ehv',
                'wind_equipment_mob', 'wind_machinery', 'wind_rain_fall',
                'pss_dpr', 'pss_manpower_machinery', 'pss_tower_erection',
                'pss_tl_visual', 'pss_tl_stringing', 'pss_tl_erection', 'pss_tl_foundation',
                'pss_civil_peb', 'pss_electrical', 'pss_transmission',
                'other_general', 'resource', 'issues', 'summary'
            ))
        """)

        # ── Refresh Tokens Table (Shared across workers) ──────────────
        await _exec("""
            CREATE TABLE IF NOT EXISTS refresh_tokens (
                token TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
                email VARCHAR(255),
                role VARCHAR(100),
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                expires_at TIMESTAMP WITH TIME ZONE
            )
        """)
        await _exec("CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id)")

        # ── Performance Indexes ──────────────────────────────────────
        # These indexes target the most common query patterns to speed up reads.
        logger.info("Creating performance indexes...")

        # DPR Supervisor Entries - queried by supervisor, project, status, date
        await _exec("CREATE INDEX IF NOT EXISTS idx_dpr_entries_supervisor ON dpr_supervisor_entries(supervisor_id)")
        await _exec("CREATE INDEX IF NOT EXISTS idx_dpr_entries_project ON dpr_supervisor_entries(project_id)")
        await _exec("CREATE INDEX IF NOT EXISTS idx_dpr_entries_status ON dpr_supervisor_entries(status)")
        await _exec("CREATE INDEX IF NOT EXISTS idx_dpr_entries_date ON dpr_supervisor_entries(entry_date DESC)")
        await _exec("CREATE INDEX IF NOT EXISTS idx_dpr_entries_composite ON dpr_supervisor_entries(supervisor_id, project_id, sheet_type, entry_date)")
        await _exec("CREATE INDEX IF NOT EXISTS idx_dpr_entries_pm_review ON dpr_supervisor_entries(status, submitted_at DESC) WHERE status IN ('submitted_to_pm', 'approved_by_pm', 'rejected_by_pm', 'final_approved')")

        # Daily Progress - queried by activity, date, sheet_type
        await _exec("CREATE INDEX IF NOT EXISTS idx_daily_progress_date ON dpr_daily_progress(progress_date DESC)")
        await _exec("CREATE INDEX IF NOT EXISTS idx_daily_progress_activity ON dpr_daily_progress(activity_object_id)")

        # Solar Activities - queried by project, activity_id
        await _exec("CREATE INDEX IF NOT EXISTS idx_solar_act_project ON solar_activities(project_object_id)")
        await _exec("CREATE INDEX IF NOT EXISTS idx_solar_act_id ON solar_activities(activity_id)")
        await _exec("CREATE INDEX IF NOT EXISTS idx_solar_act_wbs ON solar_activities(wbs_object_id)")

        # Solar Resource Assignments - queried by activity, project
        await _exec("CREATE INDEX IF NOT EXISTS idx_solar_ra_activity ON solar_resource_assignments(activity_object_id)")
        await _exec("CREATE INDEX IF NOT EXISTS idx_solar_ra_project ON solar_resource_assignments(project_object_id)")

        # Projects - queried by object_id, app_status
        await _exec("CREATE INDEX IF NOT EXISTS idx_projects_object_id ON projects(object_id)")
        await _exec("CREATE INDEX IF NOT EXISTS idx_projects_app_status ON projects(app_status)")

        # Notifications - queried by user_id, read status
        await _exec("CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, read)")
        await _exec("CREATE INDEX IF NOT EXISTS idx_notifications_timestamp ON notifications(timestamp DESC)")

        # Snapshots - queried by entry_id
        await _exec("CREATE INDEX IF NOT EXISTS idx_snapshots_entry ON dpr_entry_snapshots(entry_id)")

        # Project assignments - queried by user_id
        await _exec("CREATE INDEX IF NOT EXISTS idx_proj_assign_user ON project_assignments(user_id)")

        # ── DPR Custom Activities (DPR-level, never synced to/from P6) ────
        await _exec("""
            CREATE TABLE IF NOT EXISTS dpr_custom_activities (
                id SERIAL PRIMARY KEY,
                project_id BIGINT NOT NULL,
                sheet_type VARCHAR(50) NOT NULL,
                activity_id VARCHAR(100),
                description VARCHAR(500) NOT NULL,
                uom VARCHAR(50),
                scope NUMERIC DEFAULT 0,
                cumulative NUMERIC DEFAULT 0,
                balance NUMERIC DEFAULT 0,
                wbs_name VARCHAR(500),
                category VARCHAR(255),
                block VARCHAR(100),
                planned_start DATE,
                planned_finish DATE,
                actual_start DATE,
                actual_finish DATE,
                status VARCHAR(50) DEFAULT 'Not Started',
                remarks TEXT,
                extra_data JSONB,
                is_active BOOLEAN DEFAULT TRUE,
                sort_order INTEGER DEFAULT 0,
                created_by INTEGER REFERENCES users(user_id),
                created_at TIMESTAMPTZ DEFAULT NOW(),
                updated_by INTEGER REFERENCES users(user_id),
                updated_at TIMESTAMPTZ DEFAULT NOW()
            )
        """)
        await _exec("CREATE INDEX IF NOT EXISTS idx_custom_act_project ON dpr_custom_activities(project_id)")
        await _exec("CREATE INDEX IF NOT EXISTS idx_custom_act_sheet ON dpr_custom_activities(project_id, sheet_type)")
        await _exec("ALTER TABLE dpr_custom_activities ADD COLUMN IF NOT EXISTS extra_data JSONB")

        logger.info("OK Migrations completed successfully")

    except Exception as e:
        logger.error(f"Migration error (non-fatal): {e}")
