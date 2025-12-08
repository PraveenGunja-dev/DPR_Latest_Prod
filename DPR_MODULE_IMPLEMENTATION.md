# DPR Module Implementation

## Overview

This document describes the implementation of the DPR (Daily Progress Report) module with 8 tables for the Adani Flow system. The module follows a workflow where Supervisors fill out daily reports, which are then submitted to PMs for review, and finally approved by PMAG.

## Database Schema

### DPR Supervisor Entries Table

```sql
CREATE TABLE IF NOT EXISTS dpr_supervisor_entries (
    id SERIAL PRIMARY KEY,
    supervisor_id INTEGER NOT NULL,
    project_id INTEGER NOT NULL,
    sheet_type VARCHAR(50) NOT NULL CHECK (sheet_type IN ('dp_qty', 'dp_block', 'dp_vendor_idt', 'mms_module_rfi', 'dp_vendor_block', 'manpower_details')),
    entry_date DATE NOT NULL,
    previous_date DATE NOT NULL,
    data_json JSONB NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted_to_pm', 'approved_by_pm', 'rejected_by_pm')),
    submitted_at TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (supervisor_id) REFERENCES users(user_id) ON DELETE CASCADE,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);
```

## API Structure

### Supervisor Routes
- `GET /dpr-supervisor/draft` - Get or create draft entry
- `POST /dpr-supervisor/save-draft` - Save draft entry
- `POST /dpr-supervisor/submit` - Submit entry to PM

### PM Routes
- `GET /dpr-supervisor/pm/entries` - Get entries for PM review
- `POST /dpr-supervisor/pm/approve` - Approve entry
- `POST /dpr-supervisor/pm/reject` - Reject entry

### Common Routes
- `GET /dpr-supervisor/entry/:entryId` - Get specific entry

## Table Implementations

### 1. DP Qty Table

**Static Header:**
- PLOT - A-06 135 MW - KHAVDA HYBRID SOLAR PHASE 3 (YEAR 2025-26)
- Reporting Date: Today
- Progress Date: Yesterday

**Columns:**
1. Sl.No
2. Description
3. Total Quantity
4. UOM
5. Base Plan Start
6. Base Plan Finish
7. Forecast Start
8. Forecast Finish
9. Block Capacity (Mwac)
10. Phase
11. Block
12. SPV Number
13. Actual Start - Editable by user
14. Actual Finish - Editable by user
15. Remarks - Editable by user
16. Priority - Editable by user
17. Balance - Auto-calculated
18. Cumulative - Auto-calculated

### 2. DP Block Table

**Columns:**
1. Activity_ID
2. Activities
3. Plot
4. Block
5. Priority
6. Contractor Name
7. Scope
8. Yesterday Date
9. Today Date

### 3. DP Vendor IDT Table

**Columns:**
1. Activity_ID
2. Activities
3. Plot
4. Vendor
5. IDT Date
6. Actual Date
7. Status
8. Yesterday Date
9. Today Date

### 4. MMS & Module RFI Table

**Columns:**
1. RFI No
2. Subject
3. Module
4. Submitted Date
5. Response Date
6. Status
7. Remarks
8. Yesterday Date
9. Today Date

### 5. DP Vendor Block Table

**Columns:**
1. Activity_ID
2. Activities
3. Plot
4. New Block Nom
5. Priority
6. Baseline Priority
7. Contractor Name
8. Scope
9. Hold Due to WTG
10. Front
11. Actual
12. % Completion
13. Remarks
14. Yesterday Date
15. Today Date

### 6. Manpower Details Table

**Top Row:**
- Total Manpower Available at Site: {dynamic_value}

**Columns:**
1. Activity_ID
2. Sl No
3. Block
4. Contractor Name
5. Activity
6. Section
7. Yesterday Date
8. Today Date

### 7. Supervisor Table

**Fields:**
- id (PK)
- supervisor_id (FK → users)
- project_id (FK)
- sheet_type (enum: dp_qty, dp_block, dp_vendor_idt, mms_module_rfi, dp_vendor_block, manpower_details)
- entry_date (today)
- previous_date (yesterday)
- data_json (store the table rows JSON)
- status (enum: draft, submitted_to_pm, approved_by_pm, rejected_by_pm)
- submitted_at
- updated_at

### 8. Issues Table

**Columns:**
1. Issue ID
2. Description
3. Priority
4. Status
5. Assigned To
6. Created Date
7. Resolved Date

## Workflow

1. **Supervisor** fills out any of the 8 tables
2. **Supervisor** clicks "Submit to PM" button
3. Entry status changes to "submitted_to_pm"
4. **PM** reviews the entry
5. **PM** can either:
   - Approve (status changes to "approved_by_pm")
   - Reject (status changes to "rejected_by_pm" and sent back to Supervisor)
6. If approved by PM, **PMAG** can:
   - Final approve (stored in final DB collection)
   - Reject (sent back to PM)

## Role Permissions

### Supervisor
- Can view & edit only before submitting
- After submission → read-only

### PM
- Can edit before approving
- After submitting to PMAG → read-only

### PMAG
- Final approval → sheet becomes fully locked for all roles

## JSON Data Model

Each table's data is stored as JSON in the `data_json` field:

```json
{
  "staticHeader": {
    "projectInfo": "PLOT - A-06 135 MW - KHAVDA HYBRID SOLAR PHASE 3 (YEAR 2025-26)",
    "reportingDate": "2025-11-29",
    "progressDate": "2025-11-28"
  },
  "totalManpower": 45,
  "rows": [
    {
      "slNo": "1",
      "description": "Solar Panel Installation",
      "totalQuantity": "1000",
      "uom": "panels",
      "balance": "200",
      "basePlanStart": "2025-11-01",
      "basePlanFinish": "2025-12-15",
      "actualStart": "2025-11-05",
      "actualFinish": "",
      "forecastStart": "",
      "forecastFinish": "2025-12-20",
      "remarks": "On track",
      "cumulative": "80%"
    }
  ]
}
```

## Implementation Files

1. `src/modules/supervisor/DPRDashboard.tsx` - Main dashboard component
2. `server/controllers/dprSupervisorController.js` - Backend controller
3. `server/routes/dprSupervisor.js` - API routes
4. `src/modules/auth/services/dprSupervisorService.ts` - Frontend service
5. `server/database/schema.sql` - Database schema

## Features Implemented

- ✅ Tab-based interface with 8 tables
- ✅ Dynamic date columns (Yesterday & Today)
- ✅ Save functionality for each table
- ✅ Submit to PM workflow
- ✅ Role-based access control
- ✅ Responsive table design with input fields
- ✅ Static headers for DP Qty table
- ✅ Total manpower counter for Manpower Details table
- ✅ Oracle P6 integration for automatic data population
  - Fetches planning data directly from Oracle P6 database
  - Maps P6 activities to DP Qty table format
  - Populates read-only fields with P6 data (Description, Dates, Quantities, etc.)
  - Allows user input for editable fields (Actual dates, Remarks, Priority, etc.)

## Implemented Tables

### 1. DP Qty Table
- Static header with project information
- Columns: Sl.No, Description, Total Quantity, UOM, Base Plan Start, Base Plan Finish, Forecast Start, Forecast Finish, Block Capacity (Mwac), Phase, Block, SPV Number, Actual Start, Actual Finish, Remarks, Priority, Balance, Cumulative
- **Integration with Oracle P6**: Automatically fetches planning data from Oracle P6 database
  - Description: Activity name from P6
  - Base Plan Start/Finish: Planned dates from P6
  - Forecast Start/Finish: Baseline dates from P6
  - Total Quantity: Duration from P6
  - Phase: WBS name from P6
- Read-only fields (from P6): Sl.No, Description, Total Quantity, UOM, Base Plan Start, Base Plan Finish, Forecast Start, Forecast Finish, Phase
- Editable fields (by user): Actual Start, Actual Finish, Block, SPV Number, Remarks, Priority
- Auto-calculated fields: Balance, Cumulative

### 2. DP Block Table

**Columns:**
1. Activity_ID
2. Activities
3. Plot
4. Block
5. Priority
6. Contractor Name
7. Scope
8. Yesterday Date
9. Today Date

### 3. DP Vendor IDT Table

**Columns:**
1. Activity_ID
2. Activities
3. Plot
4. Vendor
5. IDT Date
6. Actual Date
7. Status
8. Yesterday Date
9. Today Date

### 4. MMS & Module RFI Table

**Columns:**
1. RFI No
2. Subject
3. Module
4. Submitted Date
5. Response Date
6. Status
7. Remarks
8. Yesterday Date
9. Today Date

### 5. DP Vendor Block Table

**Columns:**
1. Activity_ID
2. Activities
3. Plot
4. New Block Nom
5. Priority
6. Baseline Priority
7. Contractor Name
8. Scope
9. Hold Due to WTG
10. Front
11. Actual
12. % Completion
13. Remarks
14. Yesterday Date
15. Today Date

### 6. Manpower Details Table

**Top Row:**
- Total Manpower Available at Site: {dynamic_value}

**Columns:**
1. Activity_ID
2. Sl No
3. Block
4. Contractor Name
5. Activity
6. Section
7. Yesterday Date
8. Today Date

### 7. Supervisor Table

**Fields:**
- id (PK)
- supervisor_id (FK → users)
- project_id (FK)
- sheet_type (enum: dp_qty, dp_block, dp_vendor_idt, mms_module_rfi, dp_vendor_block, manpower_details)
- entry_date (today)
- previous_date (yesterday)
- data_json (store the table rows JSON)
- status (enum: draft, submitted_to_pm, approved_by_pm, rejected_by_pm)
- submitted_at
- updated_at

### 8. Issues Table

**Columns:**
1. Issue ID
2. Description
3. Priority
4. Status
5. Assigned To
6. Created Date
7. Resolved Date

## Workflow

1. **Supervisor** fills out any of the 8 tables
2. **Supervisor** clicks "Submit to PM" button
3. Entry status changes to "submitted_to_pm"
4. **PM** reviews the entry
5. **PM** can either:
   - Approve (status changes to "approved_by_pm")
   - Reject (status changes to "rejected_by_pm" and sent back to Supervisor)
6. If approved by PM, **PMAG** can:
   - Final approve (stored in final DB collection)
   - Reject (sent back to PM)

## Role Permissions

### Supervisor
- Can view & edit only before submitting
- After submission → read-only

### PM
- Can edit before approving
- After submitting to PMAG → read-only

### PMAG
- Final approval → sheet becomes fully locked for all roles

## JSON Data Model

Each table's data is stored as JSON in the `data_json` field:

```json
{
  "staticHeader": {
    "projectInfo": "PLOT - A-06 135 MW - KHAVDA HYBRID SOLAR PHASE 3 (YEAR 2025-26)",
    "reportingDate": "2025-11-29",
    "progressDate": "2025-11-28"
  },
  "totalManpower": 45,
  "rows": [
    {
      "slNo": "1",
      "description": "Solar Panel Installation",
      "totalQuantity": "1000",
      "uom": "panels",
      "balance": "200",
      "basePlanStart": "2025-11-01",
      "basePlanFinish": "2025-12-15",
      "actualStart": "2025-11-05",
      "actualFinish": "",
      "forecastStart": "",
      "forecastFinish": "2025-12-20",
      "remarks": "On track",
      "cumulative": "80%"
    }
  ]
}
```

## Implementation Files

1. `src/modules/supervisor/DPRDashboard.tsx` - Main dashboard component
2. `server/controllers/dprSupervisorController.js` - Backend controller
3. `server/routes/dprSupervisor.js` - API routes
4. `src/modules/auth/services/dprSupervisorService.ts` - Frontend service
5. `server/database/schema.sql` - Database schema

## Features Implemented

- ✅ Tab-based interface with 8 tables
- ✅ Dynamic date columns (Yesterday & Today)
- ✅ Save functionality for each table
- ✅ Submit to PM workflow
- ✅ Role-based access control
- ✅ Responsive table design with input fields
- ✅ Static headers for DP Qty table
- ✅ Total manpower counter for Manpower Details table
- ✅ Oracle P6 integration for automatic data population
  - Fetches planning data directly from Oracle P6 database
  - Maps P6 activities to DP Qty table format
  - Populates read-only fields with P6 data (Description, Dates, Quantities, etc.)
  - Allows user input for editable fields (Actual dates, Remarks, Priority, etc.)
