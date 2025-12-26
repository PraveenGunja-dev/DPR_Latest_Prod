# Supervisor Dashboard Project Filtering Fix

## Issue Description
The supervisor dashboard was showing incorrect projects - supervisors were seeing ALL projects from Oracle P6 instead of only the projects assigned to them.

## Root Cause
The `getAssignedProjects` function in `backend/controllers/projectAssignmentController.js` had a critical logic flaw:

1. **Primary Path (Buggy)**: It attempted to fetch ALL projects directly from the P6 API without filtering by assignments
   ```javascript
   const p6Projects = await restClient.readProjects([...]);
   // ❌ This fetched ALL P6 projects, not just assigned ones
   ```

2. **Fallback Path (Correct)**: Only when P6 API was unavailable, it correctly queried the database with proper JOIN to `project_assignments` table
   ```javascript
   FROM p6_projects p6
   INNER JOIN project_assignments pa ON p6.object_id = pa.project_id
   WHERE pa.user_id = $1
   // ✅ This correctly filtered by assignment
   ```

## Solution Implemented
Removed the unfiltered P6 API call and changed the function to **always** query the local database with proper filtering:

### Changes Made to `backend/controllers/projectAssignmentController.js`

**Before**: Lines 339-439
- Tried to fetch all P6 projects via API (no filtering)
- Only used proper filtering when API was unavailable (fallback)

**After**: 
- Always queries local database (both `projects` and `p6_projects` tables)
- Properly joins with `project_assignments` table to filter by user assignment
- Returns only projects that are actually assigned to the supervisor/Site PM

### Key Code Changes

```javascript
// Fetch assigned projects from local database
// Query both local projects table and p6_projects table, joined with project_assignments
const result = await pool.query(`
  SELECT ... FROM projects p
  INNER JOIN project_assignments pa ON p.id = pa.project_id
  WHERE pa.user_id = $1
  
  UNION ALL
  
  SELECT ... FROM p6_projects p6
  INNER JOIN project_assignments pa ON p6.object_id = pa.project_id
  WHERE pa.user_id = $1
  
  ORDER BY "Name"
`, [userId]);
```

## How Project Assignment Works

1. **Data Source**: Projects from P6 are synced to the `p6_projects` table via the sync endpoint
2. **Assignment**: Site PM or PMAG assigns projects to supervisors, creating records in `project_assignments` table
3. **Retrieval**: When supervisors fetch their projects, the query joins `p6_projects` with `project_assignments` to return only assigned projects

## Impact

- **Supervisors**: Will now see only projects assigned to them (both local and P6-synced)
- **Site PM**: Will see only projects assigned to them
- **PMAG/Super Admin**: Continue to see all projects (uses `getUserProjects` endpoint, not affected by this change)

## Testing Recommendations

1. Login as a supervisor
2. Navigate to Projects page
3. Verify only assigned projects are shown
4. Check that P6-synced projects are included if assigned
5. Verify project details are correctly displayed

## Related Files

- `backend/controllers/projectAssignmentController.js` - Fixed
- `backend/controllers/projectsController.js` - Not changed (separate endpoint)
- `frontend/src/modules/auth/ProjectsPage.tsx` - Frontend caller (no changes needed)
- `frontend/src/modules/auth/services/projectService.ts` - Service layer (no changes needed)

## Cache Behavior

The fix also updates the cache key from `p6_projects_${userId}` to `assigned_projects_${userId}` for better clarity. Cache is set for 5 minutes.

---
**Date**: 2025-12-26
**Complexity**: 7/10 (Critical logic fix affecting user permissions)
