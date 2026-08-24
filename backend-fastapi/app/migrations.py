# app/migrations.py
"""
Database migrations that run on startup.
Port of the runMigrations() function from Express server.js
"""

import json
import logging

from app.database import get_pool
from app.utils.bess_row_dedupe import BESS_STANDALONE_SHEETS, dedupe_rows

logger = logging.getLogger("adani-flow.migrations")

# One-off data fixes are recorded in applied_data_migrations so they run once.
BESS_DEDUPE_KEY = "bess_standalone_row_dedupe_v1"
EMAIL_AUTH_LIFECYCLE_KEY = "email_auth_lifecycle_v1"

# Above this many rows the entry is collapsed inside Postgres first. One
# production draft reached 1,296,000 rows; parsing that in the app process at
# startup would cost about a gigabyte, so it never leaves the database.
BESS_DEDUPE_SQL_CAP = 5000


async def run_migrations():
    """Run all database migrations on startup. Matches Express server.js runMigrations()."""
    logger.info("Running database migrations...")
    pool = await get_pool()

    async def _exec(sql: str):
        """Execute a migration query, logging real errors but ignoring expected ones."""
        try:
            await pool.execute(sql)
        except Exception as e:
            err_msg = str(e).lower()
            if any(ignored in err_msg for ignored in [
                "already exists", 
                "already a column", 
                "duplicate", 
                "is not a table", 
                "is violated by some row"
            ]):
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
                baseline_start TIMESTAMP WITH TIME ZONE,
                baseline_finish TIMESTAMP WITH TIME ZONE,
                scheduled_finish TIMESTAMP WITH TIME ZONE,
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
        await _exec("ALTER TABLE solar_activities ADD COLUMN IF NOT EXISTS agency_name VARCHAR(255)")
        await _exec("ALTER TABLE solar_activities ADD COLUMN IF NOT EXISTS line_km VARCHAR(50)")
        await _exec("ALTER TABLE solar_activities ADD COLUMN IF NOT EXISTS total_pole VARCHAR(50)")
        
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
        
        # Sync tracking columns
        await _exec("ALTER TABLE projects ADD COLUMN IF NOT EXISTS is_syncing BOOLEAN DEFAULT FALSE")
        await _exec("ALTER TABLE projects ADD COLUMN IF NOT EXISTS sync_progress INTEGER DEFAULT 0")
        await _exec("ALTER TABLE projects ADD COLUMN IF NOT EXISTS sync_message VARCHAR(255) DEFAULT ''")

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
                "Description"        TEXT,
                "DataDate"           TIMESTAMPTZ,
                "LastSyncAt"         TIMESTAMPTZ,
                "LastUpdateDate"     TIMESTAMPTZ,
                "LastUpdateUser"     VARCHAR(255),
                "ParentEPSName"      VARCHAR(255),
                "CurrentBaselineProjectObjectId" BIGINT,
                "SummaryBaselineStartDate" TIMESTAMPTZ,
                "SummaryBaselineFinishDate" TIMESTAMPTZ,
                "ScheduledFinishDate" TIMESTAMPTZ,
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
        await _exec("ALTER TABLE issue_logs ADD COLUMN IF NOT EXISTS notification_email VARCHAR(255)")
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

        # Update existing records to new AC and DC sheet nomenclature
        await _exec("UPDATE dpr_supervisor_entries SET sheet_type = 'ac_sheet' WHERE sheet_type = 'dp_vendor_block'")
        await _exec("UPDATE dpr_supervisor_entries SET sheet_type = 'dc_sheet' WHERE sheet_type = 'dp_vendor_idt'")
        await _exec("UPDATE user_column_preferences SET sheet_type = 'ac_sheet' WHERE sheet_type = 'dp_vendor_block'")
        await _exec("UPDATE user_column_preferences SET sheet_type = 'dc_sheet' WHERE sheet_type = 'dp_vendor_idt'")
        await _exec("UPDATE dpr_custom_activities SET sheet_type = 'ac_sheet' WHERE sheet_type = 'dp_vendor_block'")
        await _exec("UPDATE dpr_custom_activities SET sheet_type = 'dc_sheet' WHERE sheet_type = 'dp_vendor_idt'")

        # ── sheet_type CHECK constraint: dropped for good ─────────────
        # This was a hardcoded whitelist that had to be edited every time a
        # sheet shipped, and it went wrong in both directions:
        #
        #   * UAT kept an older list that never contained
        #     'bess_charging_schedule', so opening that sheet 500'd on the
        #     INSERT in get_draft_entry (CheckViolation).
        #   * Elsewhere the DROP below succeeded but the re-ADD failed, because
        #     rows already used a sheet type missing from the list. _exec
        #     swallows "is violated by some row", so the table silently ended up
        #     with no constraint at all - environments drifted apart unnoticed.
        #
        # The list was 8 sheet types behind what the app actually writes
        # (bess_charging_schedule, bess_engineering, bess_ordering,
        # bess_procurement, ep_engineering, ep_procurement, mms_module_rfi,
        # ordering_status_supply). sheet_type is owned by the app's sheet config
        # and only ever written by our own routers, so the database whitelist
        # bought nothing and cost outages. Dropping it also makes every
        # environment consistent.
        await _exec("ALTER TABLE dpr_supervisor_entries DROP CONSTRAINT IF EXISTS dpr_supervisor_entries_sheet_type_check")


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
        await _exec("CREATE INDEX IF NOT EXISTS idx_solar_act_planned_start ON solar_activities(planned_start)")
        await _exec("CREATE INDEX IF NOT EXISTS idx_daily_progress_date_sheet ON dpr_daily_progress(progress_date, sheet_type)")
        await _exec("CREATE INDEX IF NOT EXISTS idx_daily_progress_sheet ON dpr_daily_progress(sheet_type)")

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

        # ── PMAG EPS-based Project Assignments ─────────────────────────
        await _exec("""
            CREATE TABLE IF NOT EXISTS pmag_project_assignments (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
                project_id BIGINT NOT NULL,
                eps_name VARCHAR(255),
                assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                assigned_by INTEGER REFERENCES users(user_id),
                UNIQUE(user_id, project_id)
            )
        """)
        await _exec("CREATE INDEX IF NOT EXISTS idx_pmag_pa_user ON pmag_project_assignments(user_id)")

        await _exec("""
            CREATE TABLE IF NOT EXISTS pmag_access_requests (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
                request_type VARCHAR(20) NOT NULL,
                eps_name VARCHAR(255),
                project_id BIGINT,
                justification TEXT,
                status VARCHAR(20) DEFAULT 'pending',
                reviewed_by INTEGER REFERENCES users(user_id),
                review_notes TEXT,
                reviewed_at TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        await _exec("CREATE INDEX IF NOT EXISTS idx_pmag_ar_status ON pmag_access_requests(status)")

        # ── Dynamic Configuration Tables ──────────────────────────────
        await _exec("""
            CREATE TABLE IF NOT EXISTS project_configurations (
                p6_id VARCHAR(100) PRIMARY KEY,
                enable_drone_integration BOOLEAN DEFAULT FALSE,
                dashboard_layout_type VARCHAR(50) DEFAULT 'standard',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        await _exec("""
            CREATE TABLE IF NOT EXISTS wbs_sheet_mappings (
                id SERIAL PRIMARY KEY,
                sheet_identifier VARCHAR(100) NOT NULL,
                match_pattern TEXT NOT NULL,
                is_regex BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        await _exec("CREATE INDEX IF NOT EXISTS idx_wbs_sheet_mappings_sheet ON wbs_sheet_mappings(sheet_identifier)")

        await _exec("""
            CREATE TABLE IF NOT EXISTS activity_master_lists (
                id SERIAL PRIMARY KEY,
                sheet_type VARCHAR(50) NOT NULL,
                activity_name VARCHAR(500) NOT NULL,
                display_order INTEGER NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        await _exec("CREATE INDEX IF NOT EXISTS idx_activity_master_lists_sheet ON activity_master_lists(sheet_type)")

        # ── Wind: Manpower (Contractor) ───────────────────────────────
        # The sheet is a standing register - an activity holds any number of contractors, and each
        # contractor is reported on daily. Those two facts change at different rates, so they are
        # kept apart: the register row (activity / contractor / SO scope / UOM) is edited rarely,
        # while the Agreed and Available figures arrive once per day per contractor.
        #
        # Holding the daily figures as their own rows (rather than a JSON blob keyed by date) means
        # the 7-day window the sheet shows is just a date range, and reporting across any other
        # period is a plain WHERE clause.
        await _exec("""
            CREATE TABLE IF NOT EXISTS wind_contractor_manpower (
                id SERIAL PRIMARY KEY,
                project_id BIGINT NOT NULL,
                sort_order INTEGER NOT NULL DEFAULT 0,
                activity VARCHAR(255) NOT NULL,
                contractor VARCHAR(255) NOT NULL DEFAULT '',
                so_scope NUMERIC,
                uom NUMERIC,
                agreed_label VARCHAR(100) NOT NULL DEFAULT 'Agreed Manpower',
                available_label VARCHAR(100) NOT NULL DEFAULT 'Available Manpower',
                created_by INTEGER REFERENCES users(user_id),
                created_at TIMESTAMPTZ DEFAULT NOW(),
                updated_at TIMESTAMPTZ DEFAULT NOW()
            )
        """)
        # sort_order carries the on-screen order, which is what groups contractors under their
        # activity - consecutive rows sharing an activity render as one merged block.
        await _exec("CREATE INDEX IF NOT EXISTS idx_wind_cm_project ON wind_contractor_manpower(project_id, sort_order)")

        await _exec("""
            CREATE TABLE IF NOT EXISTS wind_contractor_manpower_daily (
                id SERIAL PRIMARY KEY,
                row_id INTEGER NOT NULL REFERENCES wind_contractor_manpower(id) ON DELETE CASCADE,
                value_date DATE NOT NULL,
                agreed NUMERIC,
                available NUMERIC,
                created_at TIMESTAMPTZ DEFAULT NOW(),
                updated_at TIMESTAMPTZ DEFAULT NOW(),
                UNIQUE (row_id, value_date)
            )
        """)
        # One figure per contractor per day: the UNIQUE above makes a save an idempotent upsert
        # (ON CONFLICT (row_id, value_date) DO UPDATE), so re-saving a day overwrites rather than
        # appending - the failure mode that grew the BESS sheets to over a million rows.
        await _exec("CREATE INDEX IF NOT EXISTS idx_wind_cm_daily_date ON wind_contractor_manpower_daily(value_date)")

        # ── DPR Metadata on solar_activities ──────────────────────────
        # Stores user-edited metadata fields (feeder, vendor, contractor,
        # coordinates, soil test, etc.) that are entered in the DPR UI
        # but don't exist as dedicated P6 columns. This ensures they
        # persist across date changes and are visible to all users.
        await _exec("ALTER TABLE solar_activities ADD COLUMN IF NOT EXISTS dpr_metadata JSONB DEFAULT '{}'::jsonb")

        # ── P6 Projects Additions ───────────────────────────────
        await _exec("""
            ALTER TABLE p6_projects 
            ADD COLUMN IF NOT EXISTS "SummaryBaselineStartDate" TIMESTAMPTZ,
            ADD COLUMN IF NOT EXISTS "SummaryBaselineFinishDate" TIMESTAMPTZ,
            ADD COLUMN IF NOT EXISTS "ScheduledFinishDate" TIMESTAMPTZ
        """)
        
        # ── Projects Table Additions ────────────────────────────
        await _exec("""
            ALTER TABLE projects 
            ADD COLUMN IF NOT EXISTS start_date TIMESTAMPTZ,
            ADD COLUMN IF NOT EXISTS finish_date TIMESTAMPTZ,
            ADD COLUMN IF NOT EXISTS baseline_start TIMESTAMPTZ,
            ADD COLUMN IF NOT EXISTS baseline_finish TIMESTAMPTZ,
            ADD COLUMN IF NOT EXISTS scheduled_finish TIMESTAMPTZ,
            ADD COLUMN IF NOT EXISTS summary_planned_labor_units NUMERIC,
            ADD COLUMN IF NOT EXISTS summary_actual_labor_units NUMERIC
        """)

        # ── Email-login password lifecycle ──────────────────────
        # Every column below is only ever read/written for users whose
        # authentication_type is 'EMAIL'. SSO rows carry the defaults and
        # are never subject to expiry, history or forced change.
        await _exec("""
            ALTER TABLE users
            ADD COLUMN IF NOT EXISTS authentication_type VARCHAR(10) DEFAULT 'EMAIL',
            ADD COLUMN IF NOT EXISTS is_first_login BOOLEAN DEFAULT FALSE,
            ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN DEFAULT FALSE,
            ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ,
            ADD COLUMN IF NOT EXISTS password_expires_at TIMESTAMPTZ,
            ADD COLUMN IF NOT EXISTS password_history JSONB DEFAULT '[]'::jsonb,
            ADD COLUMN IF NOT EXISTS recovery_email VARCHAR(255),
            ADD COLUMN IF NOT EXISTS recovery_email_verified BOOLEAN DEFAULT FALSE,
            ADD COLUMN IF NOT EXISTS account_status VARCHAR(20) DEFAULT 'ACTIVE',
            ADD COLUMN IF NOT EXISTS failed_login_attempts INTEGER DEFAULT 0,
            ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ,
            ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ,
            ADD COLUMN IF NOT EXISTS last_expiry_warning_day INTEGER
        """)
        await _exec("ALTER TABLE users DROP CONSTRAINT IF EXISTS users_authentication_type_check")
        await _exec("ALTER TABLE users ADD CONSTRAINT users_authentication_type_check CHECK (authentication_type IN ('SSO', 'EMAIL'))")
        await _exec("ALTER TABLE users DROP CONSTRAINT IF EXISTS users_account_status_check")
        # Only durable states are stored. 'Password Expired' and 'Temporarily
        # Locked' are derived from password_expires_at / locked_until so the
        # two can never disagree.
        await _exec("ALTER TABLE users ADD CONSTRAINT users_account_status_check CHECK (account_status IN ('ACTIVE', 'PENDING_SETUP', 'INACTIVE'))")
        await _exec("CREATE INDEX IF NOT EXISTS idx_users_auth_type ON users(authentication_type)")

        # One-time OTP challenges. The code itself is only ever stored as a
        # bcrypt hash, never in clear, and never written to a log.
        await _exec("""
            CREATE TABLE IF NOT EXISTS auth_otps (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
                purpose VARCHAR(40) NOT NULL,
                challenge_id VARCHAR(64) UNIQUE NOT NULL,
                otp_hash VARCHAR(255) NOT NULL,
                destination VARCHAR(255) NOT NULL,
                payload JSONB,
                attempts INTEGER DEFAULT 0,
                send_count INTEGER DEFAULT 1,
                last_sent_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
                expires_at TIMESTAMPTZ NOT NULL,
                consumed_at TIMESTAMPTZ,
                redeemed_at TIMESTAMPTZ,
                ip_address VARCHAR(64),
                created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
            )
        """)
        # redeemed_at makes the reset token that follows a verified OTP
        # single-use: without it a leaked token could set a second password
        # any time inside its 15-minute lifetime.
        await _exec("ALTER TABLE auth_otps ADD COLUMN IF NOT EXISTS redeemed_at TIMESTAMPTZ")
        await _exec("CREATE INDEX IF NOT EXISTS idx_auth_otps_user_purpose ON auth_otps(user_id, purpose)")
        await _exec("CREATE INDEX IF NOT EXISTS idx_auth_otps_challenge ON auth_otps(challenge_id)")
        await _exec("CREATE INDEX IF NOT EXISTS idx_auth_otps_created ON auth_otps(created_at)")

        # Security audit trail reuses the existing system_logs table rather
        # than introducing a second, parallel log.
        await _exec("""
            ALTER TABLE system_logs
            ADD COLUMN IF NOT EXISTS target_user_id INTEGER,
            ADD COLUMN IF NOT EXISTS ip_address VARCHAR(64),
            ADD COLUMN IF NOT EXISTS user_agent TEXT,
            ADD COLUMN IF NOT EXISTS result VARCHAR(20)
        """)
        await _exec("CREATE INDEX IF NOT EXISTS idx_system_logs_action_created ON system_logs(action_type, created_at)")
        await _exec("CREATE INDEX IF NOT EXISTS idx_system_logs_target_user ON system_logs(target_user_id)")

        # Login sessions. Answers "who is online right now", "when did they
        # sign in", and "when did they sign out" - none of which the audit log
        # can express, because an audit row is an instant and a session is a
        # span. Covers SSO and email users alike: this is access tracking, not
        # part of the email password lifecycle.
        await _exec("""
            CREATE TABLE IF NOT EXISTS user_sessions (
                id SERIAL PRIMARY KEY,
                session_id VARCHAR(64) UNIQUE NOT NULL,
                user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
                auth_type VARCHAR(10),
                login_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
                last_seen_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
                logout_at TIMESTAMPTZ,
                logout_reason VARCHAR(40),
                ip_address VARCHAR(64),
                user_agent TEXT
            )
        """)
        await _exec("CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON user_sessions(user_id)")
        await _exec("CREATE INDEX IF NOT EXISTS idx_user_sessions_open ON user_sessions(logout_at, last_seen_at)")
        await _exec("CREATE INDEX IF NOT EXISTS idx_user_sessions_login ON user_sessions(login_at DESC)")
        # Links a stored refresh token back to its session so a logout can close
        # the exact session rather than guessing.
        await _exec("ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS session_id VARCHAR(64)")

        # ── One-off data fix: collapse duplicated BESS checklist rows ──
        await _dedupe_bess_standalone_rows(pool)

        # ── One-off: classify existing accounts and seed the lifecycle ──
        await _seed_email_auth_lifecycle(pool)

        logger.info("OK Migrations completed successfully")

    except Exception as e:
        logger.error(f"Migration error (non-fatal): {e}")


async def _seed_email_auth_lifecycle(pool):
    """
    Classify every existing account as SSO or EMAIL and seed the password
    lifecycle columns. Runs once, recorded in applied_data_migrations.

    The split is unambiguous in the existing data: an SSO account is created by
    the Azure AD callback with sso_provider set and no password, an email
    account has a bcrypt password and no sso_provider.

    SSO rows are explicitly neutralised (no expiry, no forced change) so that
    nothing in the email lifecycle can ever act on them.

    Every EMAIL row is flagged must_change_password so the current passwords -
    which predate the 9-character policy - are replaced on next login. That
    includes the 'External' machine account: it cannot receive an OTP, but it
    is still subject to the policy unless EXTERNAL_ACCOUNT_PASSWORD_EXEMPT is
    turned on.
    """
    try:
        await pool.execute("""
            CREATE TABLE IF NOT EXISTS applied_data_migrations (
                name VARCHAR(200) PRIMARY KEY,
                applied_at TIMESTAMPTZ DEFAULT NOW(),
                notes TEXT
            )
        """)

        already_applied = await pool.fetchval(
            "SELECT 1 FROM applied_data_migrations WHERE name = $1", EMAIL_AUTH_LIFECYCLE_KEY
        )
        if already_applied:
            return

        await pool.execute("""
            UPDATE users
            SET authentication_type = CASE
                    WHEN sso_provider IS NOT NULL THEN 'SSO'
                    ELSE 'EMAIL'
                END
        """)

        # SSO: the DPR application never manages their password.
        await pool.execute("""
            UPDATE users
            SET must_change_password = FALSE,
                is_first_login = FALSE,
                password_changed_at = NULL,
                password_expires_at = NULL,
                account_status = CASE WHEN COALESCE(is_active, TRUE) THEN 'ACTIVE' ELSE 'INACTIVE' END
            WHERE authentication_type = 'SSO'
        """)

        # EMAIL: force a policy-compliant password on next login.
        await pool.execute("""
            UPDATE users
            SET must_change_password = TRUE,
                is_first_login = FALSE,
                password_changed_at = COALESCE(password_changed_at, CURRENT_TIMESTAMP),
                password_expires_at = NULL,
                failed_login_attempts = 0,
                account_status = CASE WHEN COALESCE(is_active, TRUE) THEN 'ACTIVE' ELSE 'INACTIVE' END
            WHERE authentication_type = 'EMAIL'
        """)

        totals = await pool.fetchrow("""
            SELECT COUNT(*) FILTER (WHERE authentication_type = 'SSO')   AS sso,
                   COUNT(*) FILTER (WHERE authentication_type = 'EMAIL') AS email
            FROM users
        """)
        notes = f"sso={totals['sso']} email={totals['email']} (forced password change on all EMAIL accounts)"

        await pool.execute(
            "INSERT INTO applied_data_migrations (name, notes) VALUES ($1, $2)"
            " ON CONFLICT (name) DO NOTHING",
            EMAIL_AUTH_LIFECYCLE_KEY, notes,
        )
        logger.info(f"OK Email auth lifecycle seeded: {notes}")

    except Exception as e:
        logger.error(f"Email auth lifecycle migration error (non-fatal): {e}")


async def _dedupe_bess_standalone_rows(pool):
    """
    Collapse duplicated rows in BESS Productivity / Charging Schedule / Summary
    drafts, written before the save path stopped merging these sheets.

    save-draft merged posted rows into the stored draft keyed on activityId /
    id / description / activities. These three sheets carry none of those -
    their activity name lives in `activity` - so every row keyed to nothing and
    took the "append new row" branch, re-appending the whole grid on each
    autosave. The frontend now saves them whole (isPartial=false), so this only
    has to clean up what is already stored.

    Runs once (recorded in applied_data_migrations) and never raises: a failure
    here must not stop the app from starting. Every entry it changes is copied
    to bess_row_dedupe_backup first, so any entry can be restored with:

        UPDATE dpr_supervisor_entries e
        SET data_json = b.data_json
        FROM bess_row_dedupe_backup b
        WHERE e.id = b.entry_id AND e.id = <entry id>;

    Once the sheets have been checked in the app, the backup table can be
    dropped.
    """
    try:
        await pool.execute("""
            CREATE TABLE IF NOT EXISTS applied_data_migrations (
                name VARCHAR(200) PRIMARY KEY,
                applied_at TIMESTAMPTZ DEFAULT NOW(),
                notes TEXT
            )
        """)

        already_applied = await pool.fetchval(
            "SELECT 1 FROM applied_data_migrations WHERE name = $1", BESS_DEDUPE_KEY
        )
        if already_applied:
            return

        await pool.execute("""
            CREATE TABLE IF NOT EXISTS bess_row_dedupe_backup (
                entry_id BIGINT PRIMARY KEY,
                sheet_type VARCHAR(50),
                rows_before INTEGER,
                rows_after INTEGER,
                data_json JSONB,
                backed_up_at TIMESTAMPTZ DEFAULT NOW()
            )
        """)

        candidates = await pool.fetch(
            """
            SELECT id, sheet_type, jsonb_array_length(data_json->'rows') AS n
            FROM dpr_supervisor_entries
            WHERE sheet_type = ANY($1)
              AND jsonb_typeof(data_json->'rows') = 'array'
              AND jsonb_array_length(data_json->'rows') > 1
            ORDER BY n ASC
            """,
            list(BESS_STANDALONE_SHEETS),
        )

        if not candidates:
            await pool.execute(
                "INSERT INTO applied_data_migrations (name, notes) VALUES ($1, $2)"
                " ON CONFLICT (name) DO NOTHING",
                BESS_DEDUPE_KEY, "no candidate entries",
            )
            return

        cleaned = removed = failed = variants = 0

        for candidate in candidates:
            entry_id = candidate["id"]
            rows_before = candidate["n"] or 0
            try:
                # Oversized entries are collapsed inside Postgres first, so the
                # app never materialises a million-row list. Identical rows are
                # dropped keeping first-occurrence order, which is exactly the
                # doubling these entries suffered from.
                if rows_before > BESS_DEDUPE_SQL_CAP:
                    await _backup_entry(pool, entry_id)
                    await pool.execute(
                        """
                        UPDATE dpr_supervisor_entries d
                        SET data_json = jsonb_set(d.data_json, '{rows}', COALESCE((
                            SELECT jsonb_agg(f.elem ORDER BY f.ord)
                            FROM (
                                SELECT t.elem, MIN(t.ord) AS ord
                                FROM jsonb_array_elements(d.data_json->'rows')
                                     WITH ORDINALITY AS t(elem, ord)
                                GROUP BY t.elem
                            ) f
                        ), '[]'::jsonb))
                        WHERE d.id = $1
                        """,
                        entry_id,
                    )

                record = await pool.fetchrow(
                    "SELECT data_json FROM dpr_supervisor_entries WHERE id = $1", entry_id
                )
                data = record["data_json"] if record else None
                if isinstance(data, str):
                    data = json.loads(data)
                if not isinstance(data, dict) or not isinstance(data.get("rows"), list):
                    continue

                new_rows, stats = dedupe_rows(data["rows"])
                variants += stats["variants"]

                if new_rows is not None:
                    await _backup_entry(pool, entry_id)
                    cleaned_data = dict(data)
                    cleaned_data["rows"] = new_rows
                    await pool.execute(
                        "UPDATE dpr_supervisor_entries SET data_json = $1::jsonb WHERE id = $2",
                        json.dumps(cleaned_data, default=str), entry_id,
                    )

                rows_after = len(data["rows"]) if new_rows is None else len(new_rows)
                if rows_after < rows_before:
                    cleaned += 1
                    removed += rows_before - rows_after
                    await pool.execute(
                        "UPDATE bess_row_dedupe_backup SET rows_after = $1 WHERE entry_id = $2",
                        rows_after, entry_id,
                    )
                    logger.info(
                        f"BESS row dedupe: entry {entry_id} ({candidate['sheet_type']}) "
                        f"{rows_before} -> {rows_after} rows"
                    )
            except Exception as entry_error:
                failed += 1
                logger.warning(f"BESS row dedupe: entry {entry_id} failed: {entry_error}")

        notes = (f"scanned={len(candidates)} cleaned={cleaned} rows_removed={removed} "
                 f"failed={failed} variants_kept={variants}")
        logger.info(f"OK BESS row dedupe complete: {notes}")

        # Only mark it done when every entry was handled, so a partial run is
        # retried on the next start. Re-running is safe: a clean sheet is left
        # untouched.
        if failed == 0:
            await pool.execute(
                "INSERT INTO applied_data_migrations (name, notes) VALUES ($1, $2)"
                " ON CONFLICT (name) DO NOTHING",
                BESS_DEDUPE_KEY, notes,
            )

    except Exception as e:
        logger.error(f"BESS row dedupe migration error (non-fatal): {e}")


async def _backup_entry(pool, entry_id):
    """Copy an entry's current data_json aside, server-side. No-op if already saved."""
    await pool.execute(
        """
        INSERT INTO bess_row_dedupe_backup (entry_id, sheet_type, rows_before, data_json)
        SELECT id, sheet_type, jsonb_array_length(data_json->'rows'), data_json
        FROM dpr_supervisor_entries
        WHERE id = $1
        ON CONFLICT (entry_id) DO NOTHING
        """,
        entry_id,
    )

