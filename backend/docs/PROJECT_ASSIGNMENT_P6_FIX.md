# Project Assignment Fix for P6 Projects

## Issue Description
Project assignment was failing when trying to assign P6-synced projects to supervisors. Users would encounter errors when attempting to assign projects that came from Oracle P6.

## Root Cause
The `assignProjectToSupervisor` and `assignProjectToMultipleSupervisors` functions in `backend/controllers/projectAssignmentController.js` only checked the `projects` table for project existence validation. This caused P6-synced projects (stored in the `p6_projects` table) to be rejected as "not found" even though they existed in the database.

### Affected Functions
1. **assignProjectToSupervisor** (lines 6-92)
   - Single project assignment
   - Only checked `projects` table ❌

2. **assignProjectToMultipleSupervisors** (lines 94-199)
   - Single project to multiple supervisors
   - Only checked `projects` table ❌

3. **assignProjectsToMultipleSupervisors** (lines 201-337)
   - Multiple projects to multiple supervisors
   - Correctly checked BOTH tables ✅

## Solution Implemented

### Changes to `assignProjectToSupervisor`
**Before** (lines 33-41):
```javascript
// Check if project exists
const projectResult = await pool.query(
  'SELECT id FROM projects WHERE id = $1',
  [projectId]
);

if (projectResult.rows.length === 0) {
  return res.status(404).json({ message: 'Project not found' });
}
```

**After**:
```javascript
// Check if project exists in either projects table or p6_projects table
const localProjectResult = await pool.query(
  'SELECT id FROM projects WHERE id = $1',
  [projectId]
);

const p6ProjectResult = await pool.query(
  'SELECT object_id as id FROM p6_projects WHERE object_id = $1',
  [projectId]
);

if (localProjectResult.rows.length === 0 && p6ProjectResult.rows.length === 0) {
  return res.status(404).json({ message: 'Project not found in local or P6 projects' });
}
```

### Changes to `assignProjectToMultipleSupervisors`
Applied the same fix at lines 122-130 to check both tables.

## How It Works Now

1. **Validation Check**: When assigning a project, the backend now:
   - Checks the `projects` table (local projects)
   - Checks the `p6_projects` table (P6-synced projects)
   - Accepts the assignment if the project exists in EITHER table

2. **Project Storage**: Projects can be stored in two places:
   - `projects` table: Manually created projects
   - `p6_projects` table: Projects synced from Oracle P6

3. **Assignment Storage**: The `project_assignments` table stores assignments using the `project_id` column, which holds the ObjectId from either table.

## Impact

### Fixed
- ✅ Can now assign P6-synced projects to supervisors
- ✅ Can assign multiple P6 projects to multiple supervisors
- ✅ Can assign mix of local and P6 projects in bulk

### Unchanged
- ✅ Assigning locally-created projects still works
- ✅ Bulk assignment of multiple projects already worked (it had the fix)
- ✅ Project retrieval for supervisors uses proper JOIN (from previous fix)

## Testing Recommendations

1. **Single P6 Project Assignment**:
   - Login as Site PM or PMAG
   - Try to assign a P6-synced project to a supervisor
   - Verify success message appears
   - Verify supervisor can see the project in their projects list

2. **Multiple P6 Projects Assignment**:
   - Use the "Assign Projects" modal
   - Select multiple P6-synced projects
   - Select one or more supervisors
   - Verify all assignments succeed

3. **Mixed Assignment**:
   - Assign both local and P6 projects together
   - Verify all assignments work correctly

4. **Edge Cases**:
   - Try assigning non-existent project ID (should fail with error)
   - Try assigning already-assigned project (should show appropriate error)

## Related Files

- `backend/controllers/projectAssignmentController.js` - Fixed (lines 33-46, 122-135)
- `frontend/src/modules/sitepm/components/PMAssignProjectModal.tsx` - Frontend UI (no changes needed)
- `frontend/src/modules/auth/services/projectService.ts` - Service calls (no changes needed)

## Database Schema Reference

### Tables Involved
```sql
projects (id, name, location, status, ...)
p6_projects (object_id, name, p6_id, ...)
project_assignments (id, project_id, user_id, assigned_by, assigned_at)
```

### Key Points
- `project_id` in assignments can reference either `projects.id` OR `p6_projects.object_id`
- Both use integer IDs
- The system treats them uniformly once assigned

---
**Date**: 2025-12-26
**Complexity**: 7/10 (Critical bug fix for core functionality)
**Related To**: SUPERVISOR_PROJECT_FILTERING_FIX.md
