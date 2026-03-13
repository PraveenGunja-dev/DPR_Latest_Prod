# ADANI DPR FLOW - DATABASE ARCHITECTURE DOCUMENTATION

## Overview
This document describes the complete database architecture for the Adani DPR (Daily Progress Report) Flow application, a PostgreSQL-based system that integrates with Oracle Primavera P6 for construction project management.

---

## Database System
- **RDBMS**: PostgreSQL 14+
- **Key Features Used**:
  - JSONB for flexible data storage
  - UUID for unique identifiers
  - Triggers for auto-updating timestamps
  - Foreign key constraints with cascade rules
  - Comprehensive indexing for performance

---

## Naming Conventions

The application follows **industry-standard naming conventions** for different layers:

### 🗄️ Database Layer: **snake_case**
All PostgreSQL database objects use snake_case:
- ✅ **Table names**: `users`, `project_assignments`, `dpr_supervisor_entries`, `p6_activities`
- ✅ **Column names**: `user_id`, `created_at`, `project_id`, `planned_start_date`, `is_active`
- ✅ **Indexes**: `idx_dpr_entries_project_id`, `idx_activities_contractor`

**Rationale**: This follows the PostgreSQL/SQL standard convention and improves readability in SQL queries.

### 💻 Application Layer: **camelCase**
All TypeScript/JavaScript code uses camelCase:
- ✅ **Interface properties**: `activityObjectId`, `activityId`, `plannedStartDate`, `yesterdayValue`
- ✅ **API JSON responses**: `{ activityId: "A1001", plannedStartDate: "2026-01-01" }`
- ✅ **Function names**: `getDPQtyActivities()`, `getYesterdayValues()`

**Rationale**: This follows the JavaScript/TypeScript standard convention as per the language style guides.

### 🔄 Automatic Transformation
The backend API layer automatically transforms property names:
- **Database → API**: `activity_id` (DB) → `activityId` (JSON response)
- **API → Database**: `activityId` (JSON request) → `activity_id` (DB column)

This is handled by the ORM layer or custom transformation functions in the backend services.

**Example Flow**:
```
Database Query:
SELECT activity_id, planned_start_date FROM p6_activities
       ↓
Backend Transformation:
{ activityId: "A1001", plannedStartDate: "2026-01-01" }
       ↓
TypeScript Interface:
interface P6Activity {
  activityId: string;
  plannedStartDate: string;
}
```

---

## Architecture Components

### 1. CORE APPLICATION TABLES
These tables manage the core DPR workflow, user management, and data entry.

#### 1.1 USERS
**Purpose**: Stores user accounts with role-based access
- **Primary Key**: user_id (SERIAL)
- **Roles**: supervisor, Site PM, PMAG, Super Admin
- **Security**: Passwords hashed with bcrypt ($2b$ algorithm)
- **Status**: is_active flag for soft deletion

#### 1.2 PROJECTS
**Purpose**: Project master data
- **Primary Key**: id (SERIAL)
- **Fields**: name, location, status, progress (0-100%)
- **Dates**: Planned and actual start/end dates
- **Note**: Projects can be synced from P6 or created manually

#### 1.3 PROJECT_ASSIGNMENTS
**Purpose**: Links users to projects (many-to-many relationship)
- **Constraints**: Unique constraint on (project_id, user_id)
- **Audit**: Tracks who assigned and when

#### 1.4 DPR_SUPERVISOR_ENTRIES
**Purpose**: Core table storing daily progress reports
- **Sheet Types**:
  - dp_qty - Daily Progress Quantity
  - dp_block - DP Block tracking
  - dp_vendor_block - Vendor block progress
  - dp_vendor_idt - Vendor IDT tracking
  - manpower_details - Manpower allocation
  - mms_module_rfi - MMS & Module RFI tracking

- **Workflow States**:
  1. `draft` - Supervisor is editing
  2. `submitted_to_pm` - Sent to Site PM
  3. `approved_by_pm` - Site PM approved
  4. `rejected_by_pm` - Sent back to supervisor
  5. `final_approved` - Final approval

- **Data Storage**: 
  - All sheet data stored as JSONB in `data_json` field
  - Flexible schema allows different field structures per sheet type
  - Enables easy querying with PostgreSQL JSONB operators

#### 1.5 ISSUE_LOGS
**Purpose**: Issue tracking and resolution
- **Types**: general, data_error, approval, sync_error, system, other
- **Priority**: low, medium, high, critical
- **Status**: open, in_progress, resolved, closed
- **Relationships**: Can link to specific projects and DPR entries

#### 1.6 CELL_COMMENTS
**Purpose**: Excel-like cell-level commenting for PM review workflow
- **Features**:
  - Pinpoint comments to specific cells (sheet_id, row_index, column_key)
  - Threaded replies via parent_comment_id
  - Comment types: REJECTION (PM rejections), GENERAL (discussions)
  - Soft deletion for audit trail

#### 1.7 SYSTEM_LOGS
**Purpose**: Audit trail for all system actions
- **Tracks**: User actions, entity changes, system events
- **Indexed**: By action_type, performed_by, created_at for fast queries

---

### 2. P6 INTEGRATION TABLES
These tables store synchronized data from Oracle Primavera P6.

#### 2.1 P6_PROJECTS
**Purpose**: Project definitions from P6
- **Unique Identifier**: object_id (P6's ObjectId)
- **Sync**: last_sync_at timestamp tracks when data was updated
- **Dates**: Supports planned, actual, baseline dates

#### 2.2 P6_ACTIVITIES
**Purpose**: Activity/task data from P6 schedules
- **Key Fields**:
  - `activity_id` - P6's Activity ID (user-facing)
  - `object_id` - P6's internal ObjectId (system)
  - `name` - Activity description
  - `status` - P6 activity status
  - `percent_complete` - Progress percentage

- **Quantity Tracking**:
  - `planned_non_labor_units` - Total quantity
  - `actual_non_labor_units` - Completed quantity
  - `remaining_non_labor_units` - Balance

- **Dates**: 
  - Planned (baseline)
  - Actual (as executed)
  - Baseline (original plan)
  - Forecast (projected)

- **Relationships**:
  - Links to WBS via `wbs_object_id`
  - Links to Project via `project_object_id`
  - Denormalized `contractor_name` for performance

#### 2.3 P6_RESOURCES
**Purpose**: Resources (contractors, labor, equipment) from P6
- **Types**: Labor, Nonlabor, Material
- **Hierarchy**: parent_object_id for resource groups
- **Sync**: Synchronized globally or per-project

#### 2.4 P6_RESOURCE_ASSIGNMENTS
**Purpose**: Links activities to resources with quantity data
- **Key Metrics**:
  - planned_units - Budgeted quantity
  - actual_units - Completed quantity
  - remaining_units - Outstanding quantity
  - unit_of_measure - e.g., "m³", "Nos", "MT"

- **Primary Resource**:
  - `is_primary_resource` flag identifies main contractor
  - Primary resource name copied to activity.contractor_name

#### 2.5 P6_ACTIVITY_CODES & Related Tables
**Purpose**: Activity code system from P6 (e.g., Priority, Plot, Block)
- **Structure**:
  - `p6_activity_code_types` - Code categories (e.g., "Priority")
  - `p6_activity_codes` - Code values (e.g., "High", "Low")
  - `p6_activity_code_assignments` - Links activities to codes

#### 2.6 P6_UDF_VALUES
**Purpose**: User-Defined Fields from P6
- **Flexible Storage**: Supports text, numeric, date, and code values
- **Examples**: Block Capacity, SPV Number, Scope, Front, Hold reasons
- **Lookup**: Indexed by foreign_object_id and udf_type_title

---

## Data Flow

### Daily Progress Reporting Workflow

1. **Data Initialization**
   ```
   P6 Activities → p6_activities table
                 ↓
   Frontend fetches activities via /dpr-activities/activities/:projectId
                 ↓
   Auto-populate DPR sheets (DP Qty, DP Block, etc.)
   ```

2. **Supervisor Input**
   ```
   Supervisor enters daily values → Frontend
                                  ↓
   POST /api/dpr-entries (draft)
                                  ↓
   dpr_supervisor_entries.data_json (JSONB)
   ```

3. **PM Review**
   ```
   Supervisor submits → status: 'submitted_to_pm'
                     ↓
   PM reviews → Can add cell_comments (type: REJECTION)
              ↓
   PM approves → status: 'approved_by_pm'
   OR
   PM rejects → status: 'rejected_by_pm'
   ```

4. **Historical Tracking**
   ```
   Approved entries used for "Yesterday Values"
   Query: /api/oracle-p6/yesterday-values
   Returns: Previous day's actual values for pre-population
   ```

### P6 Synchronization Flow

1. **Manual Trigger**
   ```
   Admin clicks "Sync P6 Data"
                ↓
   POST /api/oracle-p6/sync
                ↓
   Backend calls P6 REST API
                ↓
   Upsert into p6_* tables
   ```

2. **Data Updates**
   ```
   For each activity:
   - Update p6_activities (dates, quantities, status)
   - Update/Insert p6_resource_assignments
   - Update p6_udf_values
   - Update p6_activity_code_assignments
   ```

---

## Performance Optimizations

### Indexes
**Core Application**:
- Multi-column index on dates: (entry_date, previous_date)
- Status and priority fields for filtering
- Foreign keys for joins

**P6 Tables**:
- project_object_id for project-level queries
- activity_object_id for resource lookups
- resource_id, resource_name for resource searches
- Unique indexes on P6 object_ids

### Query Patterns
1. **Yesterday Values**: Optimized query using date index
   ```sql
   SELECT * FROM dpr_supervisor_entries 
   WHERE project_id = ? 
     AND entry_date = (CURRENT_DATE - INTERVAL '1 day')
     AND status = 'approved_by_pm'
   ```

2. **Activity Lookup**: Uses project index
   ```sql
   SELECT * FROM p6_activities 
   WHERE project_object_id = ?
   ORDER BY activity_id
   ```

3. **Cell Comments**: Composite index enables fast cell-specific queries
   ```sql
   SELECT * FROM cell_comments 
   WHERE sheet_id = ? 
     AND row_index = ? 
     AND column_key = ?
   ```

---

## Data Integrity

### Foreign Key Constraints
- **CASCADE DELETE**: project_assignments, p6_resource_assignments
- **SET NULL**: assigned_by, resolved_by (preserve audit trail)
- **RESTRICT**: Critical references to prevent accidental deletion

### Check Constraints
- `users.role` - Enforces valid roles
- `dpr_supervisor_entries.sheet_type` - Valid sheet types
- `dpr_supervisor_entries.status` - Valid workflow states
- `issue_logs.priority` - Valid priority levels
- `cell_comments.comment_type` - Valid comment types

### Unique Constraints
- `users.email` - One account per email
- `project_assignments.(project_id, user_id)` - One assignment per user/project
- `p6_*.object_id` - P6 ObjectIds are unique
- `p6_udf_values.(foreign_object_id, udf_type_title)` - One UDF per activity

---

## JSONB Structure Examples

### DP Qty Sheet (dp_qty)
```json
{
  "staticHeader": {
    "projectInfo": "PLOT - A-06 135 MW - KHAVDA HYBRID",
    "reportingDate": "2026-02-12",
    "progressDate": "2026-02-11"
  },
  "rows": [
    {
      "activityId": "A1001",
      "slNo": "1",
      "description": "Piling Work",
      "totalQuantity": "1000",
      "uom": "Nos",
      "balance": "200",
      "yesterday": "50",
      "cumulative": "800",
      "today": "30",
      "basePlanStart": "2026-01-01",
      "basePlanFinish": "2026-03-31",
      "actualStart": "2026-01-05",
      "remarks": "On track"
    }
  ]
}
```

### Manpower Details (manpower_details)
```json
{
  "totalManpower": 150,
  "rows": [
    {
      "slNo": "1",
      "activityId": "A1001",
      "block": "A-06",
      "contractorName": "ABC Contractors",
      "activity": "Piling Work",
      "section": "Foundation",
      "yesterdayValue": "45",
      "todayValue": "48"
    }
  ]
}
```

---

## Backup and Maintenance

### Recommended Backup Strategy
1. **Daily**: Full database backup
2. **Hourly**: Incremental backup of dpr_supervisor_entries
3. **Point-in-Time Recovery**: Enabled via WAL archiving

### Maintenance Tasks
1. **Weekly**: VACUUM ANALYZE on high-write tables
2. **Monthly**: Reindex p6_* tables after sync
3. **Quarterly**: Archive old entries (>6 months) to archive tables

---

## Migration Notes

### Initial Setup
1. Run `schema.sql` - Core application tables
2. Run `p6-clean-sync-schema.sql` - P6 integration tables
3. Run migrations in order:
   - `add_resources_schema.sql`
   - `add_activity_codes_schema.sql`
   - `create_cell_comments.sql`
   - `007_issue_logs.sql`
   - `008_issue_logs_extra_fields.sql`

### Future Extensibility
- JSONB allows adding new fields without schema changes
- New sheet types can be added via enum constraints
- UDF system supports custom P6 fields dynamically

---

## Security Considerations

1. **Password Hashing**: bcrypt with cost factor 10
2. **Role-Based Access**: Enforced at application and database level
3. **Audit Trail**: All changes logged in system_logs
4. **Soft Deletion**: is_active, is_deleted flags preserve history
5. **Foreign Key Protection**: Prevent orphaned records

---

## API Endpoints ↔ Database Mapping

| Endpoint | Primary Tables | Purpose |
|----------|---------------|---------|
| POST /api/auth/login | users | Authentication |
| GET /api/projects | projects, project_assignments | List user's projects |
| GET /api/dpr-entries | dpr_supervisor_entries | Fetch entries |
| POST /api/dpr-entries | dpr_supervisor_entries | Save draft |
| PUT /api/dpr-entries/:id | dpr_supervisor_entries | Update entry |
| POST /api/dpr-entries/:id/submit | dpr_supervisor_entries | Submit to PM |
| GET /api/oracle-p6/activities/:projectId | p6_activities, p6_resource_assignments | Fetch P6 data |
| POST /api/oracle-p6/sync | All p6_* tables | Sync from P6 |
| GET /api/oracle-p6/yesterday-values | dpr_supervisor_entries (with date filter) | Previous values |
| POST /api/cell-comments | cell_comments | Add comment |
| GET /api/cell-comments/:sheetId | cell_comments | Fetch comments |
| POST /api/issues | issue_logs | Create issue |
| GET /api/issues | issue_logs | List issues |

---

## Change Log

### 2026-02-12
- Initial comprehensive documentation
- Documented all 17 database tables
- Added JSONB schema examples
- Documented workflow states and data flows
- Added performance optimization notes
